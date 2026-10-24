import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Leaderboard } from "../components/Leaderboard";
import { AccountLink, ErrorNote, Hash, Loading, PageHead, Panel, Stat, StatStrip, useAsync } from "../components/ui";
import { friendlyError, isCancel } from "../lib/errors";
import { explorerTx, formatNear, proctor, txHashOf } from "../lib/near";
import { useToasts } from "../lib/toasts";
import { clearWalletReturn, walletReturn } from "../lib/walletReturn";
import type { ContractConfig, TestSet } from "../lib/types";
import { useWallet } from "../lib/wallet";
import { FingerprintSeal } from "../components/Seal";
import { config as app } from "../lib/config";

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

  if (loading) return <Loading what="Loading the test" />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.set)
    return (
      <PageHead eyebrow="Test" title="No test with this id">
        <Link viewTransition to="/sets">See all tests</Link>.
      </PageHead>
    );
  const { set, certs, models, config } = data;
  const chunks = Math.ceil(set.item_count / set.chunk_size);

  return (
    <>
      <PageHead
        eyebrow={set.active ? "Test" : "Test · retired"}
        title={set.title}
        art={
          <div className="set-seal">
            <FingerprintSeal hash={set.commitment} size={230} spin caption="SEALED TEST" />
            <span className="label">This test's seal, drawn from its fingerprint</span>
          </div>
        }
      >
        {set.description}
      </PageHead>
      <StatStrip>
        <Stat label="Sealed messages" value={set.item_count} sub="nobody can read them" />
        <Stat label="Models certified" value={new Set(certs.map((c) => c.model_id)).size} />
        <Stat hero label="Price per certification" value={`${formatNear(set.price)} N`} sub={`${set.author_bps / 100}% goes to the author`} />
        <Stat label="Runs per certification" value={config.runs_per_eval} sub={`${chunks} batches each`} />
      </StatStrip>

      <section className="split" style={{ marginTop: "2rem" }}>
        <div className="stack">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <p className="eyebrow">Results</p>
            <h2>Leaderboard</h2>
          </div>
          <Leaderboard certs={certs} setTitle={set.title} />
          <Panel eyebrow="About this test" title="How it is run" serial={set.set_id}>
            <dl className="facts">
              <div>
                <dt>Written by</dt>
                <dd>
                  <AccountLink id={set.author} />
                </dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>
                  {set.item_count}, graded in batches of {set.chunk_size}. Each answer may use up to {set.max_tokens}{" "}
                  tokens; running out counts as a mistake.
                </dd>
              </div>
              <div>
                <dt>Runs per model</dt>
                <dd>
                  At most {set.eval_cap_per_model} certification{set.eval_cap_per_model === 1 ? "" : "s"} per model, so
                  repeated runs can't be used to work out the messages.
                </dd>
              </div>
              <div>
                <dt>Fingerprint</dt>
                <dd>
                  <Hash value={set.commitment} />
                  <div className="small muted">
                    SHA-256 of the sealed messages. The grader checks it on every batch, so the test can't be changed
                    without everyone seeing.
                  </div>
                </dd>
              </div>
              <div>
                <dt>Grader program</dt>
                <dd>
                  <Hash value={config.grader_hash} />
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
        <aside>
          <RequestEval set={set} models={models.map((m) => m.model_id)} config={config} />
        </aside>
      </section>
    </>
  );
}

function RequestEval({ set, models, config }: { set: TestSet; models: string[]; config: ContractConfig }) {
  const { accountId, signIn, call } = useWallet();
  const toasts = useToasts();
  const navigate = useNavigate();
  const setId = set.set_id;
  const [model, setModel] = useState(models[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Bumped when a request is sent, to start looking for the new run.
  const [pendingVersion, setPendingVersion] = useState(0);
  const quote = useAsync(() => proctor.quote(setId), [setId]);
  const started = useAsync(() => (model ? proctor.evalsStarted(setId, model) : Promise.resolve(0)), [setId, model]);

  // After the wallet returns (redirect wallets reload the page), find the new run.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as { setId: string; before: number; accountId: string; model: string };
    if (pending.setId !== setId) return;
    const ret = walletReturn();
    if (ret?.error) {
      // Cancelled or refused in a redirect wallet: nothing was sent.
      clearWalletReturn();
      sessionStorage.removeItem(PENDING_KEY);
      setBusy(false);
      const cancelled = ret.error === "Cancelled";
      toasts.start(`Certify ${pending.model}`)(cancelled ? "Cancelled" : "Failed", cancelled ? "Cancelled. Nothing was sent." : friendlyError(ret.error));
      return;
    }
    if (!accountId || pending.accountId !== accountId) return;
    setBusy(true);
    const step = toasts.start(`Certify ${pending.model}`);
    if (ret?.hashes.length) {
      clearWalletReturn();
      step(
        "Pending",
        <>
          Sent. Waiting for the test run to appear.{" "}
          <a href={explorerTx(ret.hashes[0])} target="_blank" rel="noreferrer">
            See the transaction
          </a>
        </>,
      );
    } else step("Pending", "Sent. Waiting for the test run to appear on NEAR…");
    let stop = false;
    (async () => {
      for (let i = 0; i < 90 && !stop; i++) {
        try {
          const count = await proctor.evalCount();
          for (let id = pending.before; id < count; id++) {
            const ev = await proctor.eval(id);
            if (ev && ev.requester === accountId && ev.set_id === setId) {
              sessionStorage.removeItem(PENDING_KEY);
              step("Confirmed", <>Test run No. {id} has started. Grading takes a few minutes; its page updates by itself.</>);
              navigate(`/evals/${id}`);
              return;
            }
          }
        } catch {
          // RPC hiccup; keep looking.
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) {
        sessionStorage.removeItem(PENDING_KEY);
        setBusy(false);
        step(
          "Failed",
          <>
            It hasn't appeared after 3 minutes. Check{" "}
            <a href={`${app.explorerUrl}/address/${accountId}`} target="_blank" rel="noreferrer">
              your account's activity
            </a>
            ; if the transaction failed, nothing was charged.
          </>,
        );
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, setId, navigate, pendingVersion]);

  if (models.length === 0)
    return (
      <Panel eyebrow="Certify a model" title="No models yet">
        <p className="muted small">No models are registered yet. Registered models appear here.</p>
      </Panel>
    );

  const capReached = started.data !== undefined && started.data >= set.eval_cap_per_model;
  const deposit = quote.data ? BigInt(quote.data) + STORAGE_MARGIN : null;
  const grading = quote.data ? BigInt(quote.data) - BigInt(set.price) : null;
  const jobs = Math.ceil(set.item_count / set.chunk_size) * config.runs_per_eval;
  const n = (v: bigint | null) => (v === null ? "…" : `${formatNear(v.toString())} NEAR`);

  const request = async () => {
    setErr(null);
    if (!accountId || !deposit) return;
    setBusy(true);
    const step = toasts.start(`Certify ${model}`, "Confirm the transaction in your wallet.");
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ setId, before: await proctor.evalCount(), accountId, model }));
    } catch (e) {
      setBusy(false);
      step("Failed", friendlyError(e));
      return;
    }
    // Don't wait for execution: the run's callbacks stay pending until the
    // grader answers. Look for the new run on-chain instead.
    call("request_eval", { set_id: setId, model_id: model }, deposit.toString())
      .then((outcome) => {
        const hash = txHashOf(outcome);
        if (hash)
          step(
            "Pending",
            <>
              Sent. Waiting for the test run to appear.{" "}
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            </>,
          );
      })
      .catch((e: unknown) => {
        sessionStorage.removeItem(PENDING_KEY);
        const msg = friendlyError(e);
        step(isCancel(msg) ? "Cancelled" : "Failed", msg);
        if (!isCancel(msg)) setErr(msg);
        setBusy(false);
      });
    setPendingVersion((v) => v + 1);
  };

  return (
    <Panel className="glass" eyebrow="Certify a model" title="Test a model on this" sub="Runs the whole test, sealed, and records the result.">
      <label className="field">
        <span>Model</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <small>
          {started.data ?? "…"} of {set.eval_cap_per_model} certifications used for this model.
        </small>
      </label>

      <dl className="rows" aria-label="Cost before you confirm">
        <div>
          <dt>Test price</dt>
          <dd>{n(BigInt(set.price))}</dd>
        </div>
        <div>
          <dt>Grading and storage deposit</dt>
          <dd>{n(grading)}</dd>
        </div>
        <div>
          <dt>Safety margin</dt>
          <dd>{n(STORAGE_MARGIN)}</dd>
        </div>
        <div className="total">
          <dt>You send</dt>
          <dd>{n(deposit)}</dd>
        </div>
      </dl>
      <p className="risk" style={{ marginTop: "0.5rem" }}>
        You get back whatever the {jobs} grading batches and the margin don't use. If grading fails, you get
        everything back, price included.
      </p>

      <div style={{ marginTop: "1.1rem" }}>
        {accountId ? (
          <button className="btn block" onClick={request} disabled={!deposit || capReached || busy}>
            {capReached ? "No certifications left for this model" : busy ? "Waiting…" : `Certify ${model}`}
          </button>
        ) : (
          <button className="btn block" onClick={signIn}>
            Connect a wallet to certify
          </button>
        )}
      </div>
      {err && (
        <div style={{ marginTop: "0.9rem" }}>
          <ErrorNote error={err} />
        </div>
      )}
      <p className="risk">
        A result speaks for this test and this model version only. Only models running in secure hardware are listed,
        so the test never leaves it. <Link viewTransition to="/how">How it works</Link>
      </p>
    </Panel>
  );
}
