import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Celebrate } from "../components/Celebrate";
import { Link, useParams } from "react-router-dom";
import { AccountLink, ErrorNote, Loading, PageHead, Panel, Stat, StatStrip, StatusBadge, useAsync } from "../components/ui";
import { friendlyError, isCancel } from "../lib/errors";
import { explorerTx, formatNear, proctor, txHashOf } from "../lib/near";
import { useToasts } from "../lib/toasts";
import { useWallet } from "../lib/wallet";

const MAX_ATTEMPTS = 3;

export function EvalPage() {
  const { evalId = "" } = useParams();
  const { data: ev, error, loading } = useAsync(() => proctor.eval(evalId), [evalId], 4000);
  // Celebrate only when a run finishes while you watch it.
  const lastStatus = useRef<string | null>(null);
  const [justCertified, setJustCertified] = useState(false);
  useEffect(() => {
    if (!ev) return;
    if (lastStatus.current === "Running" && ev.status === "Certified") setJustCertified(true);
    lastStatus.current = ev.status;
  }, [ev]);
  const { accountId, signIn, call } = useWallet();
  const toasts = useToasts();

  if (loading && !ev) return <Loading what="Loading the test run" />;
  if (error && !ev) return <ErrorNote error={error} />;
  if (!ev)
    return (
      <PageHead eyebrow="Test run" title="No test run with this number">
        If you just started one, give it a few seconds and reload. <Link viewTransition to="/sets">See all tests</Link>.
      </PageHead>
    );

  const count = (s: string) => ev.chunks.filter((c) => c.state === s).length;
  const waiting = ev.chunks.filter((c) => c.state === "Pending" || (c.state === "Failed" && c.attempts < MAX_ATTEMPTS)).length;
  const done = count("Done");
  const running = count("InFlight");
  const failures = ev.chunks.flatMap((c, i) => (c.state === "Failed" ? [{ i, error: c.error, attempts: c.attempts }] : []));

  const dispatch = () => {
    const step = toasts.start("Start the next batches", "Confirm the transaction in your wallet.");
    // Don't await execution: the started batches' callbacks stay pending until graded.
    call("dispatch", { eval_id: String(ev.id) })
      .then((outcome) => {
        const hash = txHashOf(outcome);
        step(
          "Confirmed",
          <>
            Sent. The batches start as it lands, and this page updates by itself.{" "}
            {hash && (
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            )}
          </>,
        );
      })
      .catch((e: unknown) => {
        const msg = friendlyError(e);
        step(isCancel(msg) ? "Cancelled" : "Failed", msg);
      });
  };

  return (
    <>
      <Celebrate show={justCertified} />
      <PageHead eyebrow={`Test run · No. ${ev.id}`} title={ev.model_id}>
        On <Link viewTransition to={`/sets/${ev.set_id}`}>{ev.set_id}</Link>, {ev.runs} runs. <StatusBadge status={ev.status} />
      </PageHead>

      {ev.status === "Certified" && (
        <div className="note good" role="status">
          <strong>Certified.</strong> All batches were graded and checked. <Link viewTransition to={`/certificates/${ev.id}`}>See the result</Link>
        </div>
      )}
      {ev.status === "Failed" && (
        <div className="note critical" role="status">
          <strong>This run failed</strong> ({friendlyError(ev.error ?? "unknown reason").replace(/^Something went wrong: /, "")}). The
          price and the unused deposit went back to the requester.
        </div>
      )}

      <StatStrip>
        <Stat hero label="Batches graded" value={`${done} / ${ev.chunks.length}`} />
        <Stat label="Grading now" value={running} />
        <Stat label="Waiting to start" value={waiting} />
        <Stat label="Deposit left" value={`${formatNear(ev.escrow)} N`} sub="unused part is refunded" />
      </StatStrip>

      <section className="split" style={{ marginTop: "2rem" }}>
        <div className="stack">
          <Panel eyebrow="Progress" title="Batches by run" sub="Each square is a batch of messages graded together." serial={`No. ${ev.id}`}>
            <div className="progress" aria-hidden="true">
              <div style={{ width: `${(100 * done) / ev.chunks.length}%` }} />
            </div>
            {Array.from({ length: ev.runs }, (_, run) => (
              <div key={run} style={{ marginBottom: "0.8rem" }}>
                <div className="label" style={{ marginBottom: "0.35rem" }}>
                  Run {run + 1}
                </div>
                <div className="batches">
                  {ev.chunks.slice(run * ev.chunks_per_run, (run + 1) * ev.chunks_per_run).map((c, i) => (
                    <span
                      key={`${i}-${c.state}`}
                      className={`batch ${c.state}`}
                      style={{ "--d": `${i * 0.06}s` } as CSSProperties}
                      title={`Batch ${i + 1}: ${STATE_WORD[c.state]}${"attempts" in c && c.attempts ? `, attempt ${c.attempts}` : ""}`}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="batch-legend" aria-hidden="true">
              <span>
                <i className="batch Done" /> Graded
              </span>
              <span>
                <i className="batch InFlight" /> Grading
              </span>
              <span>
                <i className="batch" /> Waiting
              </span>
              <span>
                <i className="batch Failed" /> Failed, will retry
              </span>
            </div>
          </Panel>

          {failures.length > 0 && (
            <Panel eyebrow="Retries" title="Batches that failed" sub={`Each batch gets up to ${MAX_ATTEMPTS} attempts.`}>
              <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {failures.map((f) => (
                  <li key={f.i}>
                    Batch {f.i + 1}, attempt {f.attempts}: {f.error}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel eyebrow="Details" title="About this run">
            <dl className="facts">
              <div>
                <dt>Requested by</dt>
                <dd>
                  <AccountLink id={ev.requester} />
                </dd>
              </div>
              <div>
                <dt>Price paid</dt>
                <dd className="num">{formatNear(ev.price)} NEAR</dd>
              </div>
              <div>
                <dt>Grader program</dt>
                <dd className="hash">{ev.grader_hash}</dd>
              </div>
              <div>
                <dt>Run nonces</dt>
                <dd className="hash">{ev.nonces.join(", ")}</dd>
              </div>
            </dl>
          </Panel>
        </div>

        <aside>
          <Panel className="glass" eyebrow="Keep it moving" title={ev.status === "Running" ? "Start the next batches" : "Nothing to start"}>
            {ev.status === "Running" && waiting > 0 ? (
              <>
                <p className="small" style={{ color: "var(--ink-secondary)" }}>
                  Each transaction starts about two batches. Anyone can do it, and it costs you only the network fee:
                  the batches are paid from this run's deposit.
                </p>
                {accountId ? (
                  <button className="btn block" onClick={dispatch}>
                    Start the next batches
                  </button>
                ) : (
                  <button className="btn block secondary" onClick={signIn}>
                    Connect a wallet to help
                  </button>
                )}
                <p className="risk">Starting batches can't change the result; it only decides when grading happens.</p>
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                {ev.status === "Running"
                  ? "Every batch has started. This page updates by itself as they finish."
                  : "This run is finished."}
              </p>
            )}
          </Panel>
        </aside>
      </section>
    </>
  );
}

const STATE_WORD: Record<string, string> = { Pending: "waiting", InFlight: "grading", Done: "graded", Failed: "failed" };
