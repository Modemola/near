import { useMemo, type CSSProperties } from "react";
import { bandFor, sealFor } from "../lib/sealArt";

/** A generative seal drawn from a hash. Draws itself on when it mounts. */
export function FingerprintSeal({
  hash,
  size = 120,
  caption,
  spin = false,
  className = "",
}: {
  hash: string;
  size?: number;
  caption?: string;
  spin?: boolean;
  className?: string;
}) {
  const seal = useMemo(() => sealFor(hash), [hash]);
  const id = useMemo(() => `seal-${hash.slice(0, 10).replace(/[^a-zA-Z0-9]/g, "")}-${size}`, [hash, size]);
  const text = `${caption ?? "PROCTOR SEAL"} · ${hash.slice(0, 16)} · `;
  return (
    <svg
      className={`fseal${spin ? " spin" : ""} ${className}`}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Seal drawn from ${hash.slice(0, 12)}…`}
    >
      <g className="fseal-rings" fill="none" stroke="currentColor">
        {seal.rings.map((r, i) => (
          <path key={i} d={r.d} strokeWidth={0.55} opacity={r.o} pathLength={1} style={{ "--i": i } as CSSProperties} />
        ))}
      </g>
      <g className="fseal-ticks" stroke="currentColor" strokeLinecap="round">
        {seal.ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.long ? 1.6 : 0.9} opacity={t.long ? 1 : 0.55} />
        ))}
      </g>
      <circle cx="100" cy="100" r="99" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <defs>
        <path id={id} d="M100 100 m-31 0 a31 31 0 1 1 62 0 a31 31 0 1 1 -62 0" />
      </defs>
      <text className="fseal-text" fill="currentColor">
        <textPath href={`#${id}`}>{text.repeat(2)}</textPath>
      </text>
      <circle cx="100" cy="100" r="22" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M90 100.5l7 7 14-15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A holographic foil seal: the fingerprint seal embossed on foil that shifts with the pointer or the phone's tilt. */
export function FoilSeal({ hash, label, sub, size = 170 }: { hash: string; label: string; sub?: string; size?: number }) {
  return (
    <div className="foil" style={{ width: size, height: size }} role="img" aria-label={`${label} seal${sub ? `, ${sub}` : ""}`}>
      <div className="foil-sheen" aria-hidden="true" />
      <FingerprintSeal hash={hash} size={size} className="foil-emboss" />
      <div className="foil-label" aria-hidden="true">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

/** A woven guilloché band, as on banknotes and diplomas. */
export function GuillocheBand({ hash, className = "" }: { hash: string; className?: string }) {
  const paths = useMemo(() => bandFor(hash), [hash]);
  return (
    <svg className={`guilloche ${className}`} viewBox="0 0 600 28" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.7} vectorEffect="non-scaling-stroke" opacity={0.45 + (i % 2) * 0.4} />
      ))}
    </svg>
  );
}

/** A line of microprint: tiny repeated text, readable only up close. */
export function Microprint({ text }: { text: string }) {
  return (
    <div className="microprint" aria-hidden="true">
      {`${text} · `.repeat(12)}
    </div>
  );
}
