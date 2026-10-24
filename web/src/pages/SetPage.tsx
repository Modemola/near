import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Leaderboard } from "../components/Leaderboard";
import { AccountLink, ErrorNote, Hash, Loading, useAsync } from "../components/ui";
import { formatNear, proctor } from "../lib/near";
import { useWallet } from "../lib/wallet";

/** Extra deposit for the eval's storage; the contract refunds what it doesn't use. */
const STORAGE_MARGIN = 10n ** 23n; // 0.1 NEAR
const PENDING_KEY = "proctor.pendingEval";

export function SetPage() {
  const { setId = "" } = useParams();
  const { data, error, loading } = useAsync(async () => {
    const [set, certs, models, config] = await Promise.all([
      proctor.set(setId),
      proctor.certificates(setId),
      proctor.models(),
      proctor.config(),
    ]);
    return { set, certs, models, config };
  }, [setId]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.set) return <ErrorNote error={`No set "${setId}".`} />;
  const { set, certs, models, config } = data;

  return (
    <>
      <h1>{set.title}</h1>
      <p className="lede">{set.description}</p>
      <h2>Leaderboard</h2>
      <Leaderboard certs={certs} />

      <h2>Certify a model</h2>
      <RequestEval setId={set.set_id} models={models.map((m) => m.model_id)} cap={set.eval_cap_per_model} runs={config.runs_per_eval} />

      <h2>About this set</h2>
      <div className="card">
        <dl className="facts">
          <dt>Items</dt>
          <dd>{set.item_count}, graded in chunks of {set.chunk_size}</dd>
          <dt>Commitment</dt>
          <dd>
            <Hash value={set.commitment} />
            <div className="small muted">
              SHA-256 of the sealed items. The grader recomputes it inside the TEE on every run and the contract
              refuses any result where it differs.
            </div>
          </dd>
          <dt>Token budget</dt>
          <dd>{set.max_tokens} tokens per answer; running out counts as wrong</dd>
          <dt>Price</dt>
          <dd>
            {formatNear(set.price)} NEAR per eval; {set.author_bps / 100}% to the author
          </dd>
          <dt>Evals per model</dt>
          <dd>At most {set.eval_cap_per_model}, so repeated scoring can't reveal the items</dd>
          <dt>Author</dt>
          <dd>
            <AccountLink id={set.author} />
          </dd>
          <dt>Grader build</dt>
          <dd>
            <Hash value={config.grader_hash} />
          </dd>
        </dl>
      </div>
    </>
  );
}

function RequestEval({ setId, models, cap, runs }: { setId: string; models: string[]; cap: number; runs: number }) {
  const { accountId, signIn, call } = useWallet();
  const navigate = useNavigate();
  const [model, setModel] = useState(models[0] ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Bumped when a request is sent, to start looking for the new eval.
  const [pendingVersion, setPendingVersion] = useState(0);
  const quote = useAsync(() => proctor.quote(setId), [setId]);
  const started = useAsync(() => (model ? proctor.evalsStarted(setId, model) : Promise.resolve(0)), [setId, model]);

  // After the wallet returns (redirect wallets reload the page), find the new eval.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw || !accountId) return;
    const pending = JSON.parse(raw) as { setId: string; before: number; accountId: string };
    if (pending.setId !== setId || pending.accountId !== accountId) return;
    setStatus("Waiting for your eval to appear on-chain…");
    let stop = false;
    (async () => {
      for (let i = 0; i < 90 && !stop; i++) {
        const count = await proctor.evalCount();
        for (let id = pending.before; id < count; id++) {
          const ev = await proctor.eval(id);
          if (ev && ev.requester === accountId && ev.set_id === setId) {
            sessionStorage.removeItem(PENDING_KEY);
            navigate(`/evals/${id}`);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) setStatus("The eval hasn't appeared yet. Check your wallet's activity, then reload.");
    })();
    return () => {
      stop = true;
    };
  }, [accountId, setId, navigate, pendingVersion]);

  if (models.length === 0) return <p className="muted">No models are registered yet.</p>;
  const capReached = started.data !== undefined && started.data >= cap;
  const deposit = quote.data ? (BigInt(quote.data) + STORAGE_MARGIN).toString() : null;

  const request = async () => {
    setErr(null);
    if (!accountId || !deposit) return;
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ setId, before: await proctor.evalCount(), accountId }));
    setStatus("Confirm the transaction in your wallet…");
    try {
      // Don't wait for execution: the eval's callbacks stay pending until the
      // grader answers. Look for the new eval on-chain instead.
      call("request_eval", { set_id: setId, model_id: model }, deposit).catch((e: unknown) => {
        sessionStorage.removeItem(PENDING_KEY);
        setErr(e instanceof Error ? e.message : String(e));
        setStatus(null);
      });
      setPendingVersion((v) => v + 1);
    } catch (e) {
      sessionStorage.removeItem(PENDING_KEY);
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  return (
    <div className="card">
      <label className="field">
        <span>Model</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <small>
          Only models served in a TEE can be certified privately. {started.data ?? "…"} of {cap} evals used for this model.
        </small>
      </label>
      <p className="small">
        {runs} runs over the whole set. You pay the set's price plus a deposit for the grading jobs, about{" "}
        <strong>{deposit ? formatNear(deposit) : "…"} NEAR</strong> in total; unused deposit is refunded when the eval
        ends, and everything is refunded if it fails.
      </p>
      {accountId ? (
        <button className="btn" onClick={request} disabled={!deposit || capReached || status !== null}>
          {capReached ? "Eval cap reached" : "Request certification"}
        </button>
      ) : (
        <button className="btn" onClick={signIn}>
          Connect a wallet to request
        </button>
      )}
      {status && <p className="small muted" role="status" style={{ marginTop: "0.75rem" }}>{status}</p>}
      {err && <ErrorNote error={err} />}
      <p className="small muted" style={{ marginTop: "0.75rem" }}>
        Already requested one? Evals are listed on their certificate once complete; <Link to="/how">how it works</Link>.
      </p>
    </div>
  );
}
