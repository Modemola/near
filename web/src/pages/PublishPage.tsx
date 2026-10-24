import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GlassVault } from "../components/GlassVault";
import { ErrorNote, Hash, PageHead, Panel, useAsync } from "../components/ui";
import { parseTestSet, setCommitment, type ParsedSet } from "../lib/commitment";
import { config } from "../lib/config";
import { friendlyError, isCancel } from "../lib/errors";
import { explorerTx, proctor, txHashOf, waitForCall } from "../lib/near";
import { useToasts } from "../lib/toasts";
import { FingerprintSeal } from "../components/Seal";
import { useWallet } from "../lib/wallet";
import { clearWalletReturn, walletReturn } from "../lib/walletReturn";

const PENDING_PUBLISH = "proctor.pendingPublish";

/** Storage deposit for registering a set; the contract refunds what it doesn't use. */
const REGISTER_DEPOSIT = (10n ** 23n).toString(); // 0.1 NEAR
const ID_RE = /^[A-Za-z0-9._/-]{1,64}$/;

const EMPTY = {
  set_id: "",
  title: "",
  description: "",
  price: "1",
  author_pct: "70",
  chunk_size: "5",
  max_tokens: "4000",
  eval_cap_per_model: "2",
  secrets_profile: "",
};

export function PublishPage() {
  const { accountId, signIn, call } = useWallet();
  const toasts = useToasts();
  const grader = useAsync(() => proctor.config(), []);
  const [file, setFile] = useState<{ name: string; set: ParsedSet; commitment: string } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Back from a redirect wallet: report what happened to the publish.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_PUBLISH);
    if (!raw) return;
    const pending = JSON.parse(raw) as { set_id: string; title: string };
    const ret = walletReturn();
    if (!ret) return;
    clearWalletReturn();
    sessionStorage.removeItem(PENDING_PUBLISH);
    const step = toasts.start(`Publish "${pending.title}"`);
    if (ret.error) {
      const cancelled = ret.error === "Cancelled";
      step(cancelled ? "Cancelled" : "Failed", cancelled ? "Cancelled. Nothing was sent." : friendlyError(ret.error));
      return;
    }
    step("Pending", "Sent. Waiting for your test to appear on NEAR…");
    let stop = false;
    (async () => {
      for (let i = 0; i < 30 && !stop; i++) {
        if (await proctor.set(pending.set_id).catch(() => null)) {
          step("Confirmed", <>Published. <Link viewTransition to={`/sets/${pending.set_id}`}>Open your test</Link></>);
          setRegistered(pending.set_id);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) step("Failed", "Your test hasn't appeared after a minute. Check your wallet's activity; if the transaction failed, nothing was charged.");
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (name: string, text: string) => {
    setFile(null);
    setFileErr(null);
    try {
      const set = parseTestSet(text);
      setFile({ name, set, commitment: await setCommitment(set.items) });
    } catch (e) {
      setFileErr(`This file can't be used: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onFile = async (f: File | undefined) => f && load(f.name, await f.text());
  const useExample = async () => {
    try {
      const res = await fetch("/examples/scam-sample.json");
      await load("scam-sample.json", await res.text());
      // Fill only what's still empty: never overwrite what the user typed.
      setForm((f) => ({
        ...f,
        set_id: f.set_id || "my-scam-test",
        title: f.title || "Everyday scam messages",
        description: f.description || "Texts, emails and chat messages a household might receive, about half of them scams.",
      }));
    } catch (e) {
      setFileErr(friendlyError(e));
    }
  };

  const update = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const profile = form.secrets_profile || form.set_id || "my-set";

  const price = Number(form.price);
  const share = Number(form.author_pct);
  const problems = {
    set_id: form.set_id && !ID_RE.test(form.set_id) ? "Use only letters, digits and - _ . / (up to 64)." : null,
    title: form.title.length > 120 ? "Keep the title under 120 characters." : null,
    description: form.description.length > 1000 ? "Keep the description under 1000 characters." : null,
    price: !(price >= 0) ? "Enter a price of 0 or more." : null,
    author_pct: !(share >= 0 && share <= 100) ? "Enter a share between 0 and 100." : null,
    chunk_size: !(Number(form.chunk_size) >= 1 && Number(form.chunk_size) <= 40) ? "Between 1 and 40." : null,
    eval_cap_per_model: !(Number(form.eval_cap_per_model) >= 1) ? "At least 1." : null,
  };
  const ready = file && form.set_id && form.title && Object.values(problems).every((p) => !p);
  const perCert = Number.isFinite(price * share) ? ((price * share) / 100).toFixed(3).replace(/\.?0+$/, "") : "…";

  const register = async () => {
    setErr(null);
    if (!file || !ready || !accountId) return;
    setBusy(true);
    const step = toasts.start(`Publish "${form.title}"`, "Confirm the transaction in your wallet.");
    // A redirect wallet leaves the page; this lets the page report back on return.
    sessionStorage.setItem(PENDING_PUBLISH, JSON.stringify({ set_id: form.set_id, title: form.title }));
    try {
      const priceYocto = BigInt(Math.round(price * 1e6)) * 10n ** 18n;
      const outcome = await call(
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
            price: priceYocto.toString(),
            author_bps: Math.round(share * 100),
            secrets_profile: profile,
            eval_cap_per_model: Number(form.eval_cap_per_model),
          },
        },
        REGISTER_DEPOSIT,
        50,
      );
      const hash = txHashOf(outcome);
      // The wallet only says the transaction was sent. Check what the contract
      // did: refuse to say "Published" unless the test is on-chain as ours.
      if (hash) {
        const failure = await waitForCall(hash, accountId);
        if (failure) throw new Error(failure);
      }
      let mine = false;
      for (let i = 0; i < 20 && !mine; i++) {
        const onChain = await proctor.set(form.set_id).catch(() => null);
        if (onChain) {
          if (onChain.author !== accountId || onChain.commitment !== file.commitment) throw new Error("set id taken");
          mine = true;
        } else await new Promise((r) => setTimeout(r, 1500));
      }
      if (!mine) throw new Error("Your test hasn't appeared on NEAR yet. Check your wallet's activity before trying again.");
      step(
        "Confirmed",
        <>
          Published. <Link viewTransition to={`/sets/${form.set_id}`}>Open your test</Link>
          {hash && (
            <>
              {" · "}
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            </>
          )}
        </>,
      );
      setRegistered(form.set_id);
      sessionStorage.removeItem(PENDING_PUBLISH);
    } catch (e) {
      sessionStorage.removeItem(PENDING_PUBLISH);
      const msg = friendlyError(e);
      step(isCancel(msg) ? "Cancelled" : "Failed", msg);
      if (!isCancel(msg)) setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const sealCmd = grader.data
    ? `outlayer secrets set "$(jq -c '{TEST_SET: ((.items? // .) | tojson)}' ${file?.name ?? "my-set.json"})" \\
  --profile ${profile} \\
  --wasm-hash ${grader.data.grader_hash} \\
  --access whitelist:${config.contractId} --direct`
    : "";

  const field = (k: keyof typeof problems) => ({ "aria-invalid": problems[k] ? true : undefined });

  return (
    <>
      <PageHead eyebrow="Publish a test" title={<>Turn your scam examples into a <em>sealed</em> test</>} art={<GlassVault />}>
        Fraud teams, researchers and anyone with real examples can publish a test. Models get graded on it without
        anyone, including us, reading the messages. You earn a share of every certification.
      </PageHead>

      <section className="split" style={{ marginTop: 0 }}>
        <div className="stack">
          <Panel eyebrow="Step 1" title="Choose your messages" sub="Read on your device only. Nothing is uploaded.">
            <div className="dropzone">
              <label className="field" style={{ margin: 0 }}>
                <span>Test file (JSON)</span>
                <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
                <small>
                  A list of messages, each with <code>id</code>, <code>channel</code>, <code>from</code>,{" "}
                  <code>text</code> and <code>label</code> (<code>SCAM</code> or <code>LEGIT</code>).
                </small>
              </label>
            </div>
            <p className="small" style={{ margin: "0.8rem 0 0" }}>
              Just looking?{" "}
              <button className="linkbtn" onClick={useExample}>
                Try it with our public example
              </button>{" "}
              (20 messages, safe to share).
            </p>
            {fileErr && (
              <div style={{ marginTop: "0.9rem" }}>
                <ErrorNote error={fileErr} />
              </div>
            )}
            {file && (
              <dl className="rows" style={{ marginTop: "1rem" }}>
                <div>
                  <dt>File</dt>
                  <dd>{file.name}</dd>
                </div>
                <div>
                  <dt>Messages</dt>
                  <dd>
                    {file.set.items.length} ({file.set.scams} scams, {file.set.legit} real)
                  </dd>
                </div>
                <div>
                  <dt>Fingerprint</dt>
                  <dd>
                    <Hash value={file.commitment} />
                  </dd>
                </div>
                <div className="publish-seal">
                  <FingerprintSeal key={file.commitment} hash={file.commitment} size={150} caption="YOUR TEST" />
                  <span className="small muted">
                    Your test's seal. It is drawn from the fingerprint, so any change to a single message gives a
                    different seal.
                  </span>
                </div>
              </dl>
            )}
          </Panel>

          <Panel eyebrow="Step 2" title="Seal it" sub="Encrypts the messages so only the grader, in secure hardware, can read them.">
            <p className="small" style={{ color: "var(--ink-secondary)" }}>
              Install the <a href="https://skills.outlayer.ai/outlayer-cli/SKILL.md">OutLayer command-line tool</a>,
              log in with the NEAR account you'll publish from, and run this in the folder with your file. The
              encryption happens on your computer.
            </p>
            {grader.error && <ErrorNote error={grader.error} />}
            <pre className="cmd">{grader.loading ? "…" : sealCmd}</pre>
            <p className="small muted" style={{ margin: 0 }}>
              Only this exact grader program can open the seal, and only when Proctor asks it to.
            </p>
          </Panel>

          <Panel eyebrow="Step 3" title="Describe and price it">
            <div className="grid cols-2" style={{ gap: "0 1rem" }}>
              <label className="field">
                <span>Test id</span>
                <input type="text" value={form.set_id} onChange={update("set_id")} placeholder="bank-scams-2026" {...field("set_id")} />
                {problems.set_id ? <small className="bad">{problems.set_id}</small> : <small>Used in links. Can't be changed later.</small>}
              </label>
              <label className="field">
                <span>Title</span>
                <input type="text" value={form.title} onChange={update("title")} placeholder="Bank impersonation scams" {...field("title")} />
                {problems.title && <small className="bad">{problems.title}</small>}
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea rows={2} value={form.description} onChange={update("description")} placeholder="What kinds of messages are in it, and where they come from." />
              {problems.description && <small className="bad">{problems.description}</small>}
            </label>
            <div className="grid cols-2" style={{ gap: "0 1rem" }}>
              <label className="field">
                <span>Price per certification (NEAR)</span>
                <input type="number" min="0" step="0.1" value={form.price} onChange={update("price")} {...field("price")} />
                {problems.price && <small className="bad">{problems.price}</small>}
              </label>
              <label className="field">
                <span>Your share (%)</span>
                <input type="number" min="0" max="100" value={form.author_pct} onChange={update("author_pct")} {...field("author_pct")} />
                {problems.author_pct ? <small className="bad">{problems.author_pct}</small> : <small>The rest funds Proctor.</small>}
              </label>
            </div>
            <details className="more">
              <summary>
                <span className="small">Advanced settings</span>
              </summary>
              <div className="body grid cols-2" style={{ gap: "0 1rem" }}>
                <label className="field">
                  <span>Certifications per model</span>
                  <input type="number" min="1" value={form.eval_cap_per_model} onChange={update("eval_cap_per_model")} {...field("eval_cap_per_model")} />
                  <small>A low cap stops repeated runs from revealing the messages.</small>
                </label>
                <label className="field">
                  <span>Messages per batch</span>
                  <input type="number" min="1" max="40" value={form.chunk_size} onChange={update("chunk_size")} {...field("chunk_size")} />
                  <small>Each batch has 180 seconds. Slow models need small batches.</small>
                </label>
                <label className="field">
                  <span>Token limit per answer</span>
                  <input type="number" min="256" max="32000" value={form.max_tokens} onChange={update("max_tokens")} />
                </label>
                <label className="field">
                  <span>OutLayer secrets profile</span>
                  <input type="text" value={form.secrets_profile} onChange={update("secrets_profile")} placeholder={profile} />
                </label>
              </div>
            </details>
          </Panel>
        </div>

        <aside>
          <Panel className="glass" eyebrow="Before you publish" title="What happens">
            {file && (
              <div className="seal-chip" style={{ marginBottom: "0.8rem" }}>
                <FingerprintSeal key={file.commitment} hash={file.commitment} size={52} />
                <span className="small">Sealed as {file.commitment.slice(0, 10)}…</span>
              </div>
            )}
            <dl className="rows">
              <div>
                <dt>Messages</dt>
                <dd>{file ? file.set.items.length : "None chosen"}</dd>
              </div>
              <div>
                <dt>You earn per certification</dt>
                <dd>{perCert} NEAR</dd>
              </div>
              <div>
                <dt>Storage deposit</dt>
                <dd>0.1 NEAR</dd>
              </div>
              <div className="total">
                <dt>You send now</dt>
                <dd>0.1 NEAR</dd>
              </div>
            </dl>
            <p className="risk" style={{ marginTop: "0.5rem" }}>
              Storage the test doesn't need comes back to you. Only the fingerprint, title and price go on-chain; the
              messages never do.
            </p>
            <div style={{ marginTop: "1.1rem" }}>
              {accountId ? (
                <button className="btn block" onClick={register} disabled={!ready || busy}>
                  {busy ? "Waiting for your wallet…" : "Publish test"}
                </button>
              ) : (
                <button className="btn block" onClick={signIn}>
                  Connect a wallet to publish
                </button>
              )}
            </div>
            {!ready && accountId && (
              <p className="small muted" style={{ margin: "0.6rem 0 0" }}>
                {!file ? "Choose a file first." : !form.set_id || !form.title ? "Add a test id and a title." : "Fix the marked fields."}
              </p>
            )}
            {registered && (
              <div className="note good" role="status" style={{ margin: "0.9rem 0 0" }}>
                Published. <Link viewTransition to={`/sets/${registered}`}>Open your test</Link>
              </div>
            )}
            {err && (
              <div style={{ marginTop: "0.9rem" }}>
                <ErrorNote error={err} />
              </div>
            )}
            <p className="risk">
              Make sure you sealed the file first (step 2). Without the seal the grader can't read your test, and
              certifications on it fail and are refunded.
            </p>
          </Panel>
        </aside>
      </section>
    </>
  );
}
