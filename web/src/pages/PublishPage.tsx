import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNote, Hash, useAsync } from "../components/ui";
import { parseTestSet, setCommitment, type ParsedSet } from "../lib/commitment";
import { config } from "../lib/config";
import { proctor } from "../lib/near";
import { useWallet } from "../lib/wallet";

/** Storage deposit for registering a set; the contract refunds what it doesn't use. */
const REGISTER_DEPOSIT = (10n ** 23n).toString(); // 0.1 NEAR

export function PublishPage() {
  const { accountId, signIn, call } = useWallet();
  const grader = useAsync(() => proctor.config(), []);
  const [file, setFile] = useState<{ name: string; set: ParsedSet; commitment: string } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    set_id: "",
    title: "",
    description: "",
    price: "1",
    author_pct: "70",
    chunk_size: "5",
    max_tokens: "4000",
    eval_cap_per_model: "2",
    secrets_profile: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    setFile(null);
    setFileErr(null);
    if (!f) return;
    try {
      const set = parseTestSet(await f.text());
      setFile({ name: f.name, set, commitment: await setCommitment(set.items) });
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : String(e));
    }
  };

  const update = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const profile = form.secrets_profile || form.set_id || "my-set";

  const register = async () => {
    setErr(null);
    if (!file) return;
    try {
      const price = BigInt(Math.round(Number(form.price) * 1e6)) * 10n ** 18n;
      setStatus("Confirm in your wallet…");
      await call(
        "register_set",
        {
          set: {
            set_id: form.set_id,
            title: form.title,
            description: form.description,
            commitment: file.commitment,
            item_count: file.set.items.length,
            chunk_size: Number(form.chunk_size),
            max_tokens: Number(form.max_tokens),
            price: price.toString(),
            author_bps: Math.round(Number(form.author_pct) * 100),
            secrets_profile: profile,
            eval_cap_per_model: Number(form.eval_cap_per_model),
          },
        },
        REGISTER_DEPOSIT,
        50,
      );
      setStatus("Registered.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  const sealCmd = grader.data
    ? `outlayer secrets set "$(jq -c '{TEST_SET: ((.items? // .) | tojson)}' ${file?.name ?? "my-set.json"})" \\
  --profile ${profile} \\
  --wasm-hash ${grader.data.grader_hash} \\
  --access whitelist:${config.contractId} --direct`
    : "";

  return (
    <>
      <h1>Publish a test set</h1>
      <p className="lede">
        Your set is never uploaded in readable form. Your browser computes its fingerprint; you seal the items to the
        grader build with OutLayer, so only that code, inside a TEE, can read them. You earn your share of every
        eval's price.
      </p>

      <h2>1. Choose your set file</h2>
      <div className="card">
        <label className="field">
          <span>Set file (JSON)</span>
          <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
          <small>
            An array of items, or an object with an <code>items</code> array. Each item needs <code>id</code>,{" "}
            <code>channel</code>, <code>from</code>, <code>text</code> and <code>label</code> (<code>SCAM</code> or{" "}
            <code>LEGIT</code>). See the{" "}
            <a href={`${config.sourceUrl}/blob/main/data/public-sample/scam-sample.json`}>public sample</a>. Read
            locally; nothing is sent anywhere.
          </small>
        </label>
        {fileErr && <ErrorNote error={fileErr} />}
        {file && (
          <dl className="facts">
            <dt>Items</dt>
            <dd>
              {file.set.items.length} ({file.set.scams} scam, {file.set.legit} genuine)
            </dd>
            <dt>Commitment</dt>
            <dd>
              <Hash value={file.commitment} />
            </dd>
          </dl>
        )}
      </div>

      <h2>2. Seal it to the grader</h2>
      <div className="card">
        <p className="small">
          With the <a href="https://skills.outlayer.ai/outlayer-cli/SKILL.md">OutLayer CLI</a> logged in as the
          account you'll register with, run this where your file is. It encrypts the items locally to OutLayer's
          keystore, readable only by this grader build and only when the Proctor contract calls it directly.
        </p>
        {grader.error && <ErrorNote error={grader.error} />}
        <pre className="cmd">{sealCmd}</pre>
        <p className="small muted">
          A new grader build means moving the seal to its hash; the set's page shows the build evals run on.
        </p>
      </div>

      <h2>3. Register it</h2>
      <div className="card">
        <div className="grid cols-2">
          <label className="field">
            <span>Set id</span>
            <input type="text" value={form.set_id} onChange={update("set_id")} placeholder="scam-filter-v1" />
            <small>Letters, digits, - _ . / only.</small>
          </label>
          <label className="field">
            <span>Title</span>
            <input type="text" value={form.title} onChange={update("title")} />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea rows={2} value={form.description} onChange={update("description")} />
        </label>
        <div className="grid cols-3">
          <label className="field">
            <span>Price per eval (NEAR)</span>
            <input type="number" min="0" step="0.1" value={form.price} onChange={update("price")} />
          </label>
          <label className="field">
            <span>Your share (%)</span>
            <input type="number" min="0" max="100" value={form.author_pct} onChange={update("author_pct")} />
          </label>
          <label className="field">
            <span>Evals per model</span>
            <input type="number" min="1" value={form.eval_cap_per_model} onChange={update("eval_cap_per_model")} />
            <small>Low caps limit what repeated scoring can reveal.</small>
          </label>
          <label className="field">
            <span>Items per job</span>
            <input type="number" min="1" max="40" value={form.chunk_size} onChange={update("chunk_size")} />
            <small>Each job has 180 s; slow models need small chunks.</small>
          </label>
          <label className="field">
            <span>Token budget per answer</span>
            <input type="number" min="256" max="32000" value={form.max_tokens} onChange={update("max_tokens")} />
          </label>
          <label className="field">
            <span>OutLayer secrets profile</span>
            <input type="text" value={form.secrets_profile} onChange={update("secrets_profile")} placeholder={profile} />
          </label>
        </div>
        {accountId ? (
          <button className="btn" onClick={register} disabled={!file || !form.set_id || !form.title || status === "Confirm in your wallet…"}>
            Register set
          </button>
        ) : (
          <button className="btn" onClick={signIn}>
            Connect a wallet to register
          </button>
        )}
        {status && (
          <p className="small" role="status">
            {status} {status === "Registered." && <Link to={`/sets/${form.set_id}`}>Open the set</Link>}
          </p>
        )}
        {err && <ErrorNote error={err} />}
      </div>
    </>
  );
}
