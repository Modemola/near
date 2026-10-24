import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { pct } from "../lib/near";
import type { Certificate, Confusion } from "../lib/types";

/** Latest certificate per model, best accuracy first. */
export function latestPerModel(certs: Certificate[]): Certificate[] {
  const latest = new Map<string, Certificate>();
  for (const c of certs) {
    const prev = latest.get(c.model_id);
    if (!prev || BigInt(c.issued_at_block) > BigInt(prev.issued_at_block)) latest.set(c.model_id, c);
  }
  return [...latest.values()].sort((a, b) => b.accuracy_bps - a.accuracy_bps || a.false_alarm_bps - b.false_alarm_bps);
}

/** "same in every run", or the spread across runs. */
export function rangeText(c: Certificate): string {
  return c.accuracy_min_bps === c.accuracy_max_bps
    ? "same in every run"
    : `runs ranged ${pct(c.accuracy_min_bps)} to ${pct(c.accuracy_max_bps)}`;
}

const correct = (r: Confusion) => r.tp + r.tn;

/** The run with the median score, to draw as "a typical run". */
export function medianRun(cert: Certificate): { run: Confusion; index: number } {
  const order = cert.runs.map((run, index) => ({ run, index })).sort((a, b) => correct(a.run) - correct(b.run));
  return order[Math.floor((order.length - 1) / 2)];
}

/** The plain-language counts behind a certificate's rates, from its median run. */
export function plainCounts(cert: Certificate) {
  const { run } = medianRun(cert);
  return { caught: run.tp, scams: run.tp + run.fn_, flagged: run.fp, real: run.tn + run.fp };
}

export function Leaderboard({ certs, setTitle }: { certs: Certificate[]; setTitle?: string }) {
  const rows = latestPerModel(certs);
  if (rows.length === 0) {
    return (
      <div className="panel quiet">
        <p className="state" style={{ padding: 0 }}>
          No model has been certified on this test yet. The first result will appear here as soon as a run finishes.
        </p>
      </div>
    );
  }
  return (
    <div className="board" role="table" aria-label={setTitle ? `Results on ${setTitle}` : "Results"}>
      <div className="board-row head label" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Model</span>
        <span role="columnheader">Scams caught</span>
        <span role="columnheader">Real messages flagged</span>
        <span role="columnheader">Overall</span>
        <span role="columnheader" />
      </div>
      {rows.map((c, i) => (
        <div className={`board-row${i === 0 ? " first" : ""}`} role="row" key={c.eval_id} style={{ "--i": i } as CSSProperties}>
          <span className="rank" role="cell">
            {i + 1}
          </span>
          <div className="model" role="cell">
            {c.model_id}
            <small>
              {c.runs.length} runs · {c.item_count} messages
            </small>
          </div>
          <div className="metric m-caught" role="cell">
            <span className="label m-label">Scams caught</span>
            <div className="v">{pct(c.detection_bps)}</div>
            <div className="bar" aria-hidden="true">
              <div style={{ width: `${c.detection_bps / 100}%`, "--d": `${0.3 + i * 0.11}s` } as CSSProperties} />
            </div>
          </div>
          <div className="metric m-flagged" role="cell">
            <span className="label m-label">Real messages flagged</span>
            <div className="v">{pct(c.false_alarm_bps)}</div>
            <div className="bar inverse" aria-hidden="true">
              <div style={{ width: `${c.false_alarm_bps / 100}%`, "--d": `${0.4 + i * 0.11}s` } as CSSProperties} />
            </div>
          </div>
          <div className="metric overall" role="cell">
            <span className="label m-label">Overall</span>
            <div className="v">{pct(c.accuracy_bps)}</div>
            <div className="r">{rangeText(c)}</div>
          </div>
          <div className="go" role="cell">
            <Link className="btn secondary small" to={`/certificates/${c.eval_id}`}>
              See result
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
