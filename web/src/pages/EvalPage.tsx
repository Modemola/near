import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AccountLink, ErrorNote, Loading, StatusBadge, useAsync } from "../components/ui";
import { formatNear, proctor } from "../lib/near";
import { useWallet } from "../lib/wallet";

const MAX_ATTEMPTS = 3;

export function EvalPage() {
  const { evalId = "" } = useParams();
  const { data: ev, error, loading } = useAsync(() => proctor.eval(evalId), [evalId], 4000);
  const { accountId, signIn, call } = useWallet();
  const [note, setNote] = useState<string | null>(null);

  if (loading && !ev) return <Loading />;
  if (error && !ev) return <ErrorNote error={error} />;
  if (!ev) return <ErrorNote error={`No eval #${evalId}.`} />;

  const count = (s: string) => ev.chunks.filter((c) => c.state === s).length;
  const waiting = ev.chunks.filter(
    (c) => c.state === "Pending" || (c.state === "Failed" && c.attempts < MAX_ATTEMPTS),
  ).length;
  const done = count("Done");
  const failures = ev.chunks.flatMap((c, i) => (c.state === "Failed" ? [{ i, error: c.error, attempts: c.attempts }] : []));

  const dispatch = () => {
    setNote("Sent. Jobs start as the transaction lands; this page updates by itself.");
    // Don't await execution: the started jobs' callbacks stay pending until graded.
    call("dispatch", { eval_id: String(ev.id) }).catch((e: unknown) => setNote(e instanceof Error ? e.message : String(e)));
  };

  return (
    <>
      <h1>
        Eval #{ev.id} <StatusBadge status={ev.status} />
      </h1>
      <p className="lede">
        <code>{ev.model_id}</code> on <Link to={`/sets/${ev.set_id}`}>{ev.set_id}</Link>, {ev.runs} runs
      </p>

      {ev.status === "Certified" && (
        <div className="notice good">
          Certified. <Link to={`/certificates/${ev.id}`}>See the certificate</Link>.
        </div>
      )}
      {ev.status === "Failed" && (
        <div className="notice bad">
          This eval failed ({ev.error}). The price and the unused deposit were refunded to the requester.
        </div>
      )}

      <div className="card">
        <p>
          <strong>{done}</strong> of {ev.chunks.length} grading jobs done · {count("InFlight")} running · {waiting} waiting
        </p>
        <div className="bar" aria-hidden="true">
          <div style={{ width: `${(100 * done) / ev.chunks.length}%` }} />
        </div>
        <h3>Jobs by run</h3>
        {Array.from({ length: ev.runs }, (_, run) => (
          <div key={run} style={{ marginBottom: "0.6rem" }}>
            <div className="small muted">Run {run + 1}</div>
            <div className="chunks">
              {ev.chunks.slice(run * ev.chunks_per_run, (run + 1) * ev.chunks_per_run).map((c, i) => (
                <span
                  key={i}
                  className={`chunk ${c.state}`}
                  title={`Chunk ${i}: ${c.state}${"attempts" in c ? `, attempt ${c.attempts}` : ""}`}
                />
              ))}
            </div>
          </div>
        ))}
        {ev.status === "Running" && waiting > 0 && (
          <>
            <p className="small">
              Each transaction can start about two jobs. Anyone can start the next ones; they are paid from this
              eval's deposit.
            </p>
            {accountId ? (
              <button className="btn" onClick={dispatch}>
                Start the next jobs
              </button>
            ) : (
              <button className="btn secondary" onClick={signIn}>
                Connect a wallet to start the next jobs
              </button>
            )}
            {note && <p className="small muted" role="status">{note}</p>}
          </>
        )}
      </div>

      {failures.length > 0 && (
        <>
          <h2>Failed attempts</h2>
          <ul className="small">
            {failures.map((f) => (
              <li key={f.i}>
                Job {f.i}, attempt {f.attempts}: {f.error}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Details</h2>
      <div className="card">
        <dl className="facts">
          <dt>Requester</dt>
          <dd>
            <AccountLink id={ev.requester} />
          </dd>
          <dt>Price</dt>
          <dd>{formatNear(ev.price)} NEAR</dd>
          <dt>Deposit left</dt>
          <dd>{formatNear(ev.escrow)} NEAR</dd>
          <dt>Grader build</dt>
          <dd className="hash">{ev.grader_hash}</dd>
          <dt>Run nonces</dt>
          <dd className="hash">{ev.nonces.join(", ")}</dd>
        </dl>
      </div>
    </>
  );
}
