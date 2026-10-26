import { useState, type CSSProperties, type ReactNode } from "react";
import { friendlyError } from "../lib/errors";
import type { CheckReport } from "../lib/data";
import { Panel, Stamp } from "./ui";

/**
 * The signature moment: one click does the product's core work in front of
 * the visitor, shows each part being checked, lands a stamp, and then says in
 * plain words what just happened. Show, don't claim.
 */
export function Ceremony({
  run,
  parts,
  unit = "parts",
  title = "Check it yourself",
  intro,
  button = "Run the check",
  stamp = "Verified",
  explain,
}: {
  /** Does the work; report progress as short sentences. */
  run: (onProgress: (msg: string) => void) => Promise<CheckReport>;
  /** How many beads to draw while it runs (capped at 240). */
  parts: number;
  unit?: string;
  title?: string;
  intro: ReactNode;
  button?: string;
  stamp?: string;
  /** Shown under a passing check: what was just done, in plain words. */
  explain?: (report: CheckReport) => ReactNode;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<CheckReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setErr(null);
    setReport(null);
    setProgress("Starting…");
    try {
      setReport(await run(setProgress));
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };
  const ok = report && report.passed === report.checked && report.problems.length === 0;
  return (
    <Panel className="glass" eyebrow="Don't take our word for it" title={title}>
      <p className="small" style={{ color: "var(--ink-secondary)" }}>
        {intro}
      </p>
      <button className="btn block" onClick={start} disabled={progress !== null}>
        {progress ? "Checking…" : report ? "Check again" : button}
      </button>
      {progress && (
        <p className="small muted" role="status" style={{ margin: "0.75rem 0 0" }}>
          {progress}
        </p>
      )}
      {err && (
        <div className="note critical" role="alert" style={{ margin: "0.9rem 0 0" }}>
          {err}
        </div>
      )}
      {progress && (
        <div className="vgrid verifying" aria-hidden="true">
          {Array.from({ length: Math.min(parts, 240) }, (_, k) => (
            <span className="vb" key={k} style={{ "--k": k % 24 } as CSSProperties} />
          ))}
        </div>
      )}
      {report && (
        <>
          <div className="vgrid" aria-hidden="true">
            {Array.from({ length: Math.min(report.checked, 240) }, (_, k) => (
              <span
                key={k}
                className={`vb ${k < report.passed ? "ok" : "bad"}`}
                style={{ "--d": `${(k * Math.min(0.03, 1.4 / Math.max(report.checked, 1))).toFixed(3)}s` } as CSSProperties}
              />
            ))}
          </div>
          {ok && (
            <div className="vseal">
              <Stamp value={stamp} label="in your browser" delay={Math.min(1.6, report.checked * 0.03) + 0.3} />
              <span className="small muted">
                All {report.checked} {unit} passed.
              </span>
            </div>
          )}
          <div className={`note ${ok ? "good" : "critical"}`} role="status" style={{ margin: "0.9rem 0 0" }}>
            {ok ? (
              <>
                <strong>
                  All {report.checked} {unit} check out.
                </strong>
              </>
            ) : (
              <>
                <strong>
                  {report.passed} of {report.checked} {unit} check out.
                </strong>
                <ul>
                  {report.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
      {ok && explain && <div className="verify-explain">{explain(report)}</div>}
    </Panel>
  );
}
