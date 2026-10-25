import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { config } from "../lib/config";
import { pct } from "../lib/near";
import type { Certificate, TestSet } from "../lib/types";
import { rangeText } from "./Leaderboard";
import { CountUp } from "./motion";
import { FingerprintSeal, FoilSeal, GuillocheBand, Microprint } from "./Seal";

/** The data a certificate's own seal is drawn from: what the contract recorded. */
export const certSealKey = (c: Certificate) => `${c.eval_id}|${c.set_commitment}|${c.model_id}|${c.grader_hash}|${c.issued_at_block}`;

const timesWord = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** A result presented as a security-printed certificate. */
export function CertificateDoc({ cert, set }: { cert: Certificate; set: TestSet | null }) {
  const [copied, setCopied] = useState(false);
  const serial = `PRC-${cert.eval_id.padStart(5, "0")}-${cert.set_commitment.slice(0, 6).toUpperCase()}`;
  const copy = () =>
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });

  return (
    <article className="cert" aria-label={`Certificate ${serial}`}>
      <div className="cert-frame">
        <GuillocheBand hash={cert.set_commitment} />
        <Microprint text={`PROCTOR CERTIFICATE ${serial} TEST ${cert.set_commitment} GRADER ${cert.grader_hash}`} />
        <div className="cert-watermark" aria-hidden="true">
          <FingerprintSeal hash={cert.set_commitment} size={420} />
        </div>

        <div className="cert-body">
          <div>
            <div className="cert-kicker">
              <p className="eyebrow">Certificate of performance</p>
              <span className="cert-serial">No. {serial}</span>
            </div>
            <p className="cert-line">This certifies that the AI model</p>
            <h1 className="cert-name">
              <span className="vt-name" style={{ viewTransitionName: `model-${cert.eval_id}` } as CSSProperties}>
                {cert.model_id}
              </span>
            </h1>
            <p className="cert-line">
              sat <Link viewTransition to={`/sets/${cert.set_id}`}>{set?.title ?? cert.set_id}</Link>,{" "}
              {cert.item_count} sealed messages it had never seen, {timesWord(cert.runs.length)}, and scored
            </p>

            <div className="cert-figures">
              <div className="cert-fig">
                <div className="cert-big">
                  <CountUp value={pct(cert.accuracy_bps)} ms={1600} />
                </div>
                <span className="label">Overall · {rangeText(cert)}</span>
              </div>
              <div className="cert-fig">
                <div className="cert-mid">
                  <CountUp value={pct(cert.detection_bps)} />
                </div>
                <span className="label">Scams caught</span>
              </div>
              <div className="cert-fig">
                <div className="cert-mid">
                  <CountUp value={pct(cert.false_alarm_bps)} />
                </div>
                <span className="label">Real messages flagged</span>
              </div>
            </div>
          </div>
          <FoilSeal hash={certSealKey(cert)} code={serial} label="Certified" sub={`No. ${cert.eval_id} · NEAR`} size={176} />
        </div>

        <div className="cert-foot">
          <div>
            <span className="label">Test fingerprint</span>
            <div className="seal-chip">
              <FingerprintSeal hash={cert.set_commitment} size={46} />
              <span className="hash">{cert.set_commitment.slice(0, 20)}…</span>
            </div>
          </div>
          <div>
            <span className="label">Recorded on NEAR {config.networkId}</span>
            <div className="sig">Block {Number(cert.issued_at_block).toLocaleString("en-US")}</div>
          </div>
          <div>
            <span className="label">Issued and checked by</span>
            <div className="sig">{config.contractId}</div>
          </div>
        </div>
        <div className="cert-actions">
          <button className="btn secondary small" onClick={copy}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          <button className="btn secondary small" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <Microprint text={`SIGNED ANSWERS VERIFIED ON CHAIN ${cert.signers.join(" ")}`} />
        <GuillocheBand hash={cert.set_commitment} />
      </div>
    </article>
  );
}
