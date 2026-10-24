import { Link } from "react-router-dom";
import { pct } from "../lib/near";
import type { Certificate } from "../lib/types";

/** Latest certificate per model, best accuracy first. */
export function latestPerModel(certs: Certificate[]): Certificate[] {
  const latest = new Map<string, Certificate>();
  for (const c of certs) {
    const prev = latest.get(c.model_id);
    if (!prev || BigInt(c.issued_at_block) > BigInt(prev.issued_at_block)) latest.set(c.model_id, c);
  }
  return [...latest.values()].sort((a, b) => b.accuracy_bps - a.accuracy_bps || a.false_alarm_bps - b.false_alarm_bps);
}

export function Leaderboard({ certs }: { certs: Certificate[] }) {
  const rows = latestPerModel(certs);
  if (rows.length === 0) {
    return <p className="muted">No certificates yet. Request the first eval from the set's page.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <caption className="muted small" style={{ textAlign: "left", padding: "0.6rem 0.8rem" }}>
          Mean over runs; the range across runs is in brackets.
        </caption>
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th className="num">Accuracy</th>
            <th className="num">Scams caught</th>
            <th className="num">False alarms</th>
            <th className="num">Runs</th>
            <th>Certificate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.eval_id}>
              <td>{i + 1}</td>
              <td>{c.model_id}</td>
              <td className="num">
                {pct(c.accuracy_bps)}{" "}
                <span className="range">
                  [{pct(c.accuracy_min_bps)}–{pct(c.accuracy_max_bps)}]
                </span>
              </td>
              <td className="num">{pct(c.detection_bps)}</td>
              <td className="num">{pct(c.false_alarm_bps)}</td>
              <td className="num">{c.runs.length}</td>
              <td>
                <Link to={`/certificates/${c.eval_id}`}>#{c.eval_id}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
