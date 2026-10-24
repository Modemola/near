import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorNote, Hash, Loading, Stat, useAsync } from "../components/ui";
import { config } from "../lib/config";
import { codeHash, pct, proctor } from "../lib/near";
import type { Confusion } from "../lib/types";
import { verifyEval, type VerifyReport } from "../lib/verify";

const accuracy = (c: Confusion) => {
  const n = c.tp + c.fp + c.tn + c.fn_;
  return n ? Math.round((10000 * (c.tp + c.tn)) / n) : 0;
};

export function CertificatePage() {
  const { evalId = "" } = useParams();
  const { data, error, loading } = useAsync(async () => {
    const cert = await proctor.certificate(evalId);
    if (!cert) return null;
    const [set, model, contractCode] = await Promise.all([
      proctor.set(cert.set_id),
      proctor.model(cert.model_id),
      codeHash(config.contractId),
    ]);
    return { cert, set, model, contractCode };
  }, [evalId]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return <ErrorNote error={`No certificate for eval #${evalId}.`} />;
  const { cert, set, model, contractCode } = data;

  return (
    <>
      <p className="small muted">
        Certificate for <Link to={`/evals/${cert.eval_id}`}>eval #{cert.eval_id}</Link>
      </p>
      <h1>{cert.model_id}</h1>
      <p className="lede">
        on <Link to={`/sets/${cert.set_id}`}>{set?.title ?? cert.set_id}</Link>: {cert.item_count} messages in the sealed set,{" "}
        {cert.runs.length} runs, certified at block {cert.issued_at_block}
      </p>

      <div className="grid cols-3">
        <Stat
          label="Accuracy"
          value={pct(cert.accuracy_bps)}
          sub={`range ${pct(cert.accuracy_min_bps)}–${pct(cert.accuracy_max_bps)} across runs`}
        />
        <Stat label="Scams caught" value={pct(cert.detection_bps)} sub="share of scams flagged as scams" />
        <Stat label="False alarms" value={pct(cert.false_alarm_bps)} sub="share of genuine messages flagged as scams" />
      </div>

      <h2>Per run</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th className="num">Accuracy</th>
              <th className="num">Scams caught</th>
              <th className="num">Scams missed</th>
              <th className="num">Genuine passed</th>
              <th className="num">False alarms</th>
              <th className="num">No usable answer</th>
            </tr>
          </thead>
          <tbody>
            {cert.runs.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="num">{pct(accuracy(r))}</td>
                <td className="num">{r.tp}</td>
                <td className="num">{r.fn_}</td>
                <td className="num">{r.tn}</td>
                <td className="num">{r.fp}</td>
                <td className="num">{r.unparsed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        "No usable answer" (no label, or the {cert.max_tokens}-token budget ran out) is already counted as a wrong
        answer in the other columns.
      </p>

      <h2>What this certificate rests on</h2>
      <div className="card">
        <dl className="facts">
          <dt>Test set</dt>
          <dd>
            <Hash value={cert.set_commitment} />
            <div className="small muted">The sealed set's SHA-256, recomputed by the grader inside the TEE on every job.</div>
          </dd>
          <dt>Grader build</dt>
          <dd>
            <Hash value={cert.grader_hash} />
            <div className="small muted">
              SHA-256 of the open-source grader WASM that ran in OutLayer's Intel TDX enclave. Rebuild it from{" "}
              <a href={config.sourceUrl}>the source</a> and compare.
            </div>
          </dd>
          <dt>Model signing key</dt>
          <dd>
            {cert.signers.map((s) => (
              <Hash key={s} value={s} />
            ))}
            <div className="small muted">
              From the model's TEE attestation report (SHA-256{" "}
              <span className="hash">{model?.attestation_report_sha256 ?? "unknown"}</span>), registered in the contract.
            </div>
          </dd>
          <dt>Contract code</dt>
          <dd>
            <span className="hash">{contractCode}</span>
            <div className="small muted">
              Hash of the code deployed at <code>{config.contractId}</code>, which checked every signature on-chain.
            </div>
          </dd>
        </dl>
      </div>

      <Verify evalId={cert.eval_id} />
    </>
  );
}

function Verify({ evalId }: { evalId: string }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    setReport(null);
    try {
      setReport(await verifyEval(evalId, setProgress));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };
  const ok = report && report.missing.length === 0 && report.answersValid === report.answersChecked && report.chunks.every((c) => c.problems.length === 0);
  return (
    <>
      <h2>Verify it yourself</h2>
      <div className="card">
        <p className="small">
          Re-checks every signed answer in your browser. The answers come from the contract's <code>chunk_accepted</code>{" "}
          events, read directly from NEAR RPC; an explorer API is used only to find the transaction hashes.
        </p>
        <button className="btn" onClick={run} disabled={progress !== null}>
          {progress ? "Verifying…" : "Verify every signature"}
        </button>
        {progress && <p className="small muted" role="status">{progress}</p>}
        {err && <ErrorNote error={err} />}
        {report && (
          <div className={`notice ${ok ? "good" : "bad"}`} role="status">
            {ok ? (
              <>
                All {report.answersChecked} answers in {report.chunks.length} jobs verified against the model's registered
                TEE key.
              </>
            ) : (
              <>
                {report.answersValid} of {report.answersChecked} answers verified.
                {report.missing.length > 0 && <> Events not found for jobs {report.missing.join(", ")}.</>}
                <ul>
                  {report.chunks
                    .filter((c) => c.problems.length)
                    .map((c) => (
                      <li key={c.index}>
                        Job {c.index}: {c.problems.join("; ")}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
