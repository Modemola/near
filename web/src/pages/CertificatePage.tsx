import { useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { medianRun, rangeText } from "../components/Leaderboard";
import { AnswerSheet, ErrorNote, Hash, Loading, PageHead, Panel, Stamp, Stat, StatStrip, useAsync } from "../components/ui";
import { config } from "../lib/config";
import { friendlyError } from "../lib/errors";
import { codeHash, pct, proctor } from "../lib/near";
import type { Confusion } from "../lib/types";
import { verifyEval, type VerifyReport } from "../lib/verify";

const accuracy = (c: Confusion) => {
  const n = c.tp + c.fp + c.tn + c.fn_;
  return n ? Math.round((10000 * (c.tp + c.tn)) / n) : 0;
};

export function CertificatePage() {
  const { evalId = "" } = useParams();
  const [picked, setPicked] = useState<number | null>(null);
  const { data, error, loading } = useAsync(async () => {
    const cert = await proctor.certificate(evalId);
    if (!cert) return null;
    const [set, model, contractCode] = await Promise.all([
      proctor.set(cert.set_id),
      proctor.model(cert.model_id),
      codeHash(config.contractId).catch(() => "unavailable"),
    ]);
    return { cert, set, model, contractCode };
  }, [evalId]);

  if (loading) return <Loading what="Loading the result" />;
  if (error) return <ErrorNote error={error} />;
  if (!data)
    return (
      <PageHead eyebrow="Result" title="No result with this number">
        It may still be running. <Link viewTransition to={`/evals/${evalId}`}>Check test run No. {evalId}</Link>.
      </PageHead>
    );
  const { cert, set, model, contractCode } = data;
  const runIndex = picked ?? medianRun(cert).index;
  const run = cert.runs[runIndex];
  const scams = run.tp + run.fn_;
  const real = run.tn + run.fp;

  return (
    <>
      <PageHead eyebrow={`Certified result · No. ${cert.eval_id}`} title={<span className="vt-name" style={{ viewTransitionName: `model-${cert.eval_id}` } as CSSProperties}>{cert.model_id}</span>}>
        On <Link viewTransition to={`/sets/${cert.set_id}`}>{set?.title ?? cert.set_id}</Link>: tested {cert.runs.length} times on{" "}
        {cert.item_count} sealed messages it had never seen.
      </PageHead>

      <StatStrip>
        <Stat hero label="Scams caught" value={pct(cert.detection_bps)} sub="average across runs" />
        <Stat label="Real messages flagged" value={pct(cert.false_alarm_bps)} sub="wrongly marked as scams" />
        <Stat
          label="Overall"
          value={pct(cert.accuracy_bps)}
          sub={rangeText(cert)}
        />
        <Stat label="Recorded at block" value={Number(cert.issued_at_block).toLocaleString("en-US")} sub={`on NEAR ${config.networkId}`} />
      </StatStrip>

      <section className="split" style={{ marginTop: "2rem" }}>
        <div className="stack">
          <Panel
            eyebrow="Answer sheet"
            title={`Run ${runIndex + 1} of ${cert.runs.length}`}
            sub="Correct answers first, so the sheet says nothing about which message was which."
            serial={`No. ${cert.eval_id}`}
          >
            {cert.runs.length > 1 && (
              <div className="actions" role="group" aria-label="Choose a run" style={{ marginBottom: "1.1rem", gap: "0.4rem" }}>
                {cert.runs.map((_, i) => (
                  <button
                    key={i}
                    className={`btn small ${i === runIndex ? "" : "secondary"}`}
                    aria-pressed={i === runIndex}
                    onClick={() => setPicked(i)}
                  >
                    Run {i + 1}
                  </button>
                ))}
              </div>
            )}
            <AnswerSheet key={runIndex} run={run} stamp={pct(accuracy(run))} stampLabel={`Run ${runIndex + 1}`} />
            <p className="say">
              Caught <em>{run.tp} of {scams}</em> scams and wrongly flagged {run.fp} of {real} real messages.
            </p>
            {run.unparsed > 0 && (
              <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
                {run.unparsed} answer{run.unparsed === 1 ? "" : "s"} had no clear verdict (or ran past the{" "}
                {cert.max_tokens}-token limit) and counted as mistakes.
              </p>
            )}
          </Panel>

          <Panel eyebrow="Every run" title="Run by run" sub="AI answers vary between runs, so the result combines several.">
            <div className="table-wrap" style={{ border: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th className="num">Overall</th>
                    <th className="num">Scams caught</th>
                    <th className="num">Scams missed</th>
                    <th className="num">Real let through</th>
                    <th className="num">Real flagged</th>
                    <th className="num">No verdict</th>
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
          </Panel>

          <details className="more">
            <summary>
              <span>
                <span className="label">For the technically curious</span>
                <br />
                What this result rests on
              </span>
            </summary>
            <div className="body">
              <dl className="facts">
                <div>
                  <dt>Fingerprint of the sealed test</dt>
                  <dd>
                    <Hash value={cert.set_commitment} />
                    <div className="small muted">
                      SHA-256 of the test messages. The grader recomputes it inside secure hardware (an Intel TDX
                      enclave) on every batch, and the contract rejects any result where it differs.
                    </div>
                  </dd>
                </div>
                <div>
                  <dt>Grader program</dt>
                  <dd>
                    <Hash value={cert.grader_hash} />
                    <div className="small muted">
                      SHA-256 of the open-source grader that ran on OutLayer. Rebuild it from{" "}
                      <a href={config.sourceUrl}>the source</a> and compare.
                    </div>
                  </dd>
                </div>
                <div>
                  <dt>Model's signing key</dt>
                  <dd>
                    {cert.signers.map((s) => (
                      <div key={s}>
                        <Hash value={s} />
                      </div>
                    ))}
                    <div className="small muted">
                      From the model's hardware attestation report (SHA-256{" "}
                      <span className="hash">{model?.attestation_report_sha256 ?? "unknown"}</span>) on NEAR AI Cloud.
                    </div>
                  </dd>
                </div>
                <div>
                  <dt>Contract code</dt>
                  <dd>
                    <span className="hash">{contractCode}</span>
                    <div className="small muted">
                      Hash of the code at <code>{config.contractId}</code>, which checked every signature before
                      counting it.
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        </div>

        <aside className="stack">
          <Verify evalId={cert.eval_id} answers={cert.item_count * cert.runs.length} />
          <Panel className="quiet" eyebrow="Read it fairly">
            <p className="small" style={{ margin: 0, color: "var(--ink-secondary)" }}>
              This result covers this one test, this model version and this point in time. It is not a promise that
              the model catches every scam. Test written by{" "}
              <a href={`${config.explorerUrl}/address/${set?.author}`} target="_blank" rel="noreferrer">
                {set?.author ?? "its author"}
              </a>
              .
            </p>
          </Panel>
        </aside>
      </section>
    </>
  );
}

function Verify({ evalId, answers }: { evalId: string; answers: number }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    setReport(null);
    setProgress("Finding the transactions…");
    try {
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
    report.chunks.every((c) => c.problems.length === 0);
  return (
    <Panel className="glass" eyebrow="Check it yourself" title="Verify every answer">
      <p className="small" style={{ color: "var(--ink-secondary)" }}>
        Your browser re-checks all {answers} signed answers against the model's key, using data straight from the NEAR
        blockchain. Free, and no wallet needed.
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
          {err} The result above is still recorded on-chain; only this check couldn't run.
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
              registered key, across {report.chunks.length} batches.
            </>
          ) : (
            <>
              <strong>
                {report.answersValid} of {report.answersChecked} answers check out.
              </strong>
              {report.missing.length > 0 && <> Couldn't find the records for batches {report.missing.join(", ")}.</>}
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
    </Panel>
  );
}
