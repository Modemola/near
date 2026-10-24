import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { config } from "../lib/config";
import { pct } from "../lib/near";
import type { Certificate, TestSet } from "../lib/types";
import { CountUp, Reveal } from "./motion";
import { FingerprintSeal } from "./Seal";

/** The landing page's figures and promises, as a grid of tiles. Every number is live. */
export function Bento({ set, rows, loading }: { set?: TestSet; rows: Certificate[]; loading: boolean }) {
  const none = loading ? "…" : "None yet";
  const byCatch = [...rows].sort((a, b) => b.detection_bps - a.detection_bps);
  const best = byCatch[0];
  const fewest = rows.length ? Math.min(...rows.map((c) => c.false_alarm_bps)) : null;
  return (
    <div className="bento">
      <Reveal className="tile ink span-2 tall" i={0}>
        <div>
          <span className="label">Most scams caught</span>
          <div className="big">{best ? <CountUp value={pct(best.detection_bps)} ms={1600} /> : none}</div>
          <p>{best ? `${best.model_id}, on the featured test` : "on the featured test"}</p>
        </div>
        {byCatch.length > 0 && (
          <div className="bars">
            {byCatch.slice(0, 4).map((c, i) => (
              <div key={c.eval_id}>
                <div>
                  <div className="name">{c.model_id}</div>
                  <div className="bar on-ink" aria-hidden="true">
                    <div style={{ width: `${c.detection_bps / 100}%`, "--d": `${0.4 + i * 0.12}s` } as CSSProperties} />
                  </div>
                </div>
                <span className="v">{pct(c.detection_bps)}</span>
              </div>
            ))}
          </div>
        )}
      </Reveal>

      <Reveal className="tile glass span-2" i={1}>
        <div className="row">
          <div>
            <span className="label">The sealed test</span>
            <div className="mid">{set ? <CountUp value={set.item_count} /> : none}</div>
            <p>messages nobody can read, not even us. This is the seal of their fingerprint.</p>
          </div>
          {set && <FingerprintSeal hash={set.commitment} size={112} spin />}
        </div>
      </Reveal>

      <Reveal className="tile" i={2}>
        <span className="label">Fewest false alarms</span>
        <div className="mid">{fewest === null ? none : <CountUp value={pct(fewest)} />}</div>
        <p>real messages wrongly flagged</p>
      </Reveal>

      <Reveal className="tile" i={3}>
        <span className="label">Models certified</span>
        <div className="mid">{loading ? "…" : <CountUp value={rows.length} />}</div>
        <p>
          <Link viewTransition to="/sets">
            Certify another
          </Link>
        </p>
      </Reveal>

      <Reveal className="tile span-2" i={4}>
        <div className="row">
          <div>
            <span className="label">Check it yourself</span>
            <h3>Every signature, re-checked in your browser</h3>
            <p>One click on any result. Free, and no wallet needed.</p>
          </div>
          <div className="mini-beads" aria-hidden="true">
            {Array.from({ length: 30 }, (_, k) => (
              <i key={k} style={{ "--k": k } as CSSProperties} />
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal className="tile" i={5}>
        <span className="label">Test authors earn</span>
        <div className="mid">{set ? <CountUp value={`${set.author_bps / 100}%`} /> : none}</div>
        <p>
          of every certification. <Link viewTransition to="/publish">Publish a test</Link>
        </p>
      </Reveal>

      <Reveal className="tile" i={6}>
        <div className="row">
          <span className="label">Recorded on NEAR</span>
          <div className="block3d" aria-hidden="true">
            {Array.from({ length: 6 }, (_, k) => (
              <span key={k} />
            ))}
          </div>
        </div>
        <p>Every result is kept on-chain by the Proctor contract on {config.networkId}.</p>
      </Reveal>
    </div>
  );
}
