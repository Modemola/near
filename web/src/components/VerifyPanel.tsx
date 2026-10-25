import { useState, type CSSProperties, type ReactNode } from "react";
import { friendlyError } from "../lib/errors";
import type { VerifyReport } from "../lib/verify";
import { Panel, Stamp } from "./ui";

/**
 * Re-checks every signed answer behind a certificate, in the browser, from
 * public NEAR data. The checking code loads only when someone presses the button.
 */
export function VerifyPanel({
  evalId,
  answers,
  title = "Verify every answer",
  intro,
  explain,
}: {
  evalId: string;
  answers: number;
  title?: string;
  intro?: ReactNode;
  /** Shown under a passing check: what was just checked, in plain words. */
  explain?: (report: VerifyReport) => ReactNode;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    setReport(null);
    setProgress("Finding the transactions…");
    try {
      const { verifyEval } = await import("../lib/verify");
      setReport(await verifyEval(evalId, setProgress));
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };
  const ok =
    report &&
    report.missing.length === 0 &&
    report.answersValid === report.answersChecked &&
    report.chunks.every((c) => c.problems.length === 0) &&
    report.totalsMatch;
  return (
    <Panel className="glass verify-panel" eyebrow="Check it yourself" title={title}>
      <p className="small" style={{ color: "var(--ink-secondary)" }}>
        {intro ?? (
          <>
            Your browser re-checks all {answers} signed answers against the model's key, using data straight from the
            NEAR blockchain. Free, and no wallet needed.
          </>
        )}
      </p>
      <button className="btn block" onClick={run} disabled={progress !== null}>
        {progress ? "Checking…" : report ? "Check again" : "Check every signature"}
      </button>
      {progress && (
        <p className="small muted" role="status" style={{ margin: "0.75rem 0 0" }}>
          {progress}
        </p>
      )}
      {err && (
        <div className="note critical" role="alert" style={{ margin: "0.9rem 0 0" }}>
          {err} The result is still recorded on-chain; only this check couldn't run.
        </div>
      )}
      {progress && (
        <div className="vgrid verifying" aria-hidden="true">
          {Array.from({ length: Math.min(answers, 240) }, (_, k) => (
            <span className="vb" key={k} style={{ "--k": k % 24 } as CSSProperties} />
          ))}
        </div>
      )}
      {report && (
        <>
          <div className="vgrid" aria-hidden="true">
            {Array.from({ length: Math.min(report.answersChecked, 240) }, (_, k) => (
              <span
                key={k}
                className={`vb ${k < report.answersValid ? "ok" : "bad"}`}
                style={{ "--d": `${(k * Math.min(0.03, 1.4 / report.answersChecked)).toFixed(3)}s` } as CSSProperties}
              />
            ))}
          </div>
          {ok && (
            <div className="vseal">
              <Stamp value="Verified" label="in your browser" delay={Math.min(1.6, report.answersChecked * 0.03) + 0.3} />
              <span className="small muted">Every signature matched the model's registered key.</span>
            </div>
          )}
        </>
      )}
      {report && (
        <div className={`note ${ok ? "good" : "critical"}`} role="status" style={{ margin: "0.9rem 0 0" }}>
          {ok ? (
            <>
              <strong>All {report.answersChecked} answers check out.</strong> Every one was signed by the model's
              key, across {report.chunks.length} batches, and together they add up to every number on the certificate.
            </>
          ) : (
            <>
              <strong>
                {report.answersValid} of {report.answersChecked} answers check out.
              </strong>
              {report.missing.length > 0 && <> Couldn't find the records for batches {report.missing.join(", ")}.</>}
              {report.totalsProblems.length > 0 && (
                <ul>
                  {report.totalsProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <ul>
                {report.chunks
                  .filter((c) => c.problems.length)
                  .map((c) => (
                    <li key={c.index}>
                      Batch {c.index}: {c.problems.join("; ")}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
      {ok && explain && <div className="verify-explain">{explain(report)}</div>}
    </Panel>
  );
}
