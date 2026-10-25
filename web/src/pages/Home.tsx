import { Link } from "react-router-dom";
import { Leaderboard, latestPerModel, medianRun, plainCounts } from "../components/Leaderboard";
import { Bento } from "../components/Bento";
import { ExamStory } from "../components/ExamStory";
import { Reveal, useTilt } from "../components/motion";
import { VerifyPanel } from "../components/VerifyPanel";
import { ScanStrip } from "../components/ScanStrip";
import { AnswerSheet, Panel, Stamp, Unavailable, useAsync, Words, useTitle, Loading } from "../components/ui";
import { isConfigured } from "../lib/config";
import { pct, proctor } from "../lib/near";
import type { Certificate } from "../lib/types";

export function Home() {
  const featured = import.meta.env.VITE_FEATURED_SET as string | undefined;
  const { data, error, loading } = useAsync(async () => {
    if (!isConfigured) return null;
    const sets = await proctor.sets();
    const set = sets.find((s) => s.set_id === featured) ?? sets[0];
    return set ? { set, certs: await proctor.certificates(set.set_id) } : null;
  }, []);
  useTitle();
  const rows = data ? latestPerModel(data.certs) : [];
  const top = rows[0];

  return (
    <>
      <section className="hero" style={{ marginTop: 0 }}>
        <div>
          <p className="eyebrow">Independent results for AI scam filters</p>
          <h1>
            <Words text="Which AI catches scams without blocking your real messages?" accent={["without"]} />
          </h1>
          <p className="lede">
            Proctor tests AI models on scam messages they have never seen, under exam conditions nobody can cheat,
            and publishes results anyone can check.
          </p>
          <div className="actions">
            <a className="btn" href="#results">
              See the results
            </a>
            <a className="btn secondary" href="#verify">
              Check a result yourself
            </a>
          </div>
        </div>
        <HeroResult top={top} loading={loading} error={error} setTitle={data?.set.title} />
      </section>

      {/* Shown while loading too, at its usual size, so nothing below it moves when the result arrives. */}
      {(loading || top) && <CheckIt top={top} setTitle={data?.set.title} />}

      <section>
        <Bento set={data?.set} rows={rows} loading={loading} />
      </section>

      <Reveal as="section">
        <div className="section-head">
          <p className="eyebrow">The exam</p>
          <h2>
            Every message is a <em>question</em>
          </h2>
          <p>
            A test mixes scams with real messages, because a good filter has to catch one without blocking the other.
            These come from our public sample; the real tests stay sealed.
          </p>
        </div>
        <ScanStrip />
        <div className="scan-caption">
          <span>Shown with the answer key. Hover to pause.</span>
          <span>Models never see a sealed test's messages, or its answers.</span>
        </div>
      </Reveal>

      <section id="results">
        <div className="section-head">
          <p className="eyebrow">Results</p>
          <h2>{data ? data.set.title : "Latest results"}</h2>
          <p>
            {data
              ? `${data.set.description} Ranked by overall score. Each model was tested several times, because AI answers vary from run to run.`
              : "Ranked by overall score on the featured test."}
          </p>
        </div>
        {loading && <Loading what="Loading results" height={210} />}
        {error && <Unavailable what="The results list" error={error} />}
        {data && <Leaderboard certs={data.certs} setTitle={data.set.title} />}
        {data === null && isConfigured && (
          <div className="panel quiet">
            <p className="state" style={{ padding: 0 }}>
              No tests have been published yet. <Link viewTransition to="/publish">Publish the first one</Link>.
            </p>
          </div>
        )}
        {data && (
          <p className="small" style={{ marginTop: "0.9rem" }}>
            <Link viewTransition to={`/sets/${data.set.set_id}`}>About this test, and how to get a model certified on it</Link>
          </p>
        )}
      </section>

      <ExamStory />

      <Reveal as="section">
        <Panel eyebrow="Read results fairly" title="What a result does and doesn't tell you" className="quiet">
          <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-secondary)" }}>
            <li>A result speaks for one test, one model version and one point in time. It is not a promise about every scam.</li>
            <li>Scores vary between runs, so each result shows the range across runs as well as the average.</li>
            <li>Only models running in secure hardware can be tested, because the test has to stay private.</li>
            <li>Anyone can publish a test, such as a bank's fraud team. Each test page says who wrote it.</li>
          </ul>
        </Panel>
      </Reveal>

      <Reveal as="section">
        <div className="panel closing">
          <p className="eyebrow">Get involved</p>
          <h2>
            Have scams your filter <em>must</em> catch?
          </h2>
          <p>
            Publish them as a sealed test. Models get graded on them without anyone seeing them, and you earn a share
            of every certification.
          </p>
          <div className="actions">
            <Link viewTransition className="btn" to="/publish">
              Publish a test
            </Link>
            <Link viewTransition className="btn secondary" to="/sets">
              Certify a model
            </Link>
          </div>
        </div>
      </Reveal>
    </>
  );
}

function HeroResult({
  top,
  loading,
  error,
  setTitle,
}: {
  top?: Certificate;
  loading: boolean;
  error?: string;
  setTitle?: string;
}) {
  if (loading)
    return (
      <div className="scene" role="status" aria-label="Loading the latest result…">
        <div className="skeleton" style={{ height: 470 }} />
      </div>
    );
  if (error) return <Unavailable what="The latest result" error={error} />;
  if (!top)
    return (
      <Panel eyebrow="Top result" title="No results yet">
        <p className="muted">When the first model finishes a test, its answer sheet appears here.</p>
      </Panel>
    );
  return <HeroDeck top={top} setTitle={setTitle} />;
}

/** The runs as a fanned stack of glass answer sheets that turns towards the pointer. */
function HeroDeck({ top, setTitle }: { top: Certificate; setTitle?: string }) {
  const deck = useTilt<HTMLDivElement>();
  const { index } = medianRun(top);
  const n = plainCounts(top);
  return (
    <div className="scene">
      <div className="deck-float">
        <div className="deck" ref={deck}>
          <div className="shadow" aria-hidden="true" />
          {top.runs.length > 2 && <div className="ghost g2" aria-hidden="true" />}
          {top.runs.length > 1 && <div className="ghost g1" aria-hidden="true" />}
          <div className="front">
            <Panel
              className="glass"
              eyebrow="Top result"
              title={top.model_id}
              sub={setTitle ? `on ${setTitle}` : undefined}
              serial={`No. ${top.eval_id}`}
            >
              <AnswerSheet run={top.runs[index]} />
              <p className="say">
                Caught <em>{n.caught} of {n.scams}</em> scams and wrongly flagged {n.flagged} of {n.real} real messages.
              </p>
              <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
                Answer sheet from its typical run (run {index + 1} of {top.runs.length}).{" "}
                <Link viewTransition to={`/certificates/${top.eval_id}`}>See the full result</Link>
              </p>
            </Panel>
          </div>
          <div className="float-stamp">
            <Stamp value={pct(top.accuracy_bps)} label="Average" delay={1.5} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The top result as a claim next to the check that proves it, run in the visitor's own browser. */
function CheckIt({ top, setTitle }: { top?: Certificate; setTitle?: string }) {
  const answers = top ? top.item_count * top.runs.length : 0;
  return (
    <section id="verify" className="check-it">
      <div className="section-head">
        <p className="eyebrow">Don't take our word for it</p>
        <h2>
          Check this result <em>yourself</em>
        </h2>
        <p>
          Every answer behind a result was signed inside the model's secure hardware and recorded on NEAR. Your browser
          can fetch them and check every signature, with no account, no wallet and nothing from our servers.
        </p>
      </div>
      {!top ? (
        <div className="check-grid" role="status" aria-label="Loading the latest result…">
          <div className="skeleton check-skel-claim" />
          <div className="skeleton check-skel-check" />
        </div>
      ) : (
        <div className="check-grid">
          <div className="panel quiet claim">
            <p className="eyebrow">The claim</p>
            <p className="claim-score">{pct(top.accuracy_bps)}</p>
            <p className="claim-what">
              <strong>{top.model_id}</strong> was asked every message in {setTitle ?? "the test"}, {top.runs.length}{" "}
              times over, and on average judged this share of them correctly.
            </p>
            <p className="small" style={{ margin: 0 }}>
              <Link viewTransition to={`/certificates/${top.eval_id}`}>See the certificate</Link>
            </p>
          </div>
          <VerifyPanel
            evalId={top.eval_id}
            answers={answers}
            title="The check"
            intro={
              <>
                Fetches the {answers} signed answers from a public NEAR node, checks each signature against the model's
                key, and adds them up. About a minute; nothing to install.
              </>
            }
            explain={(report) => (
              <>
                <p className="eyebrow">What just happened</p>
                <ol className="explain-steps">
                  <li>
                    <strong>Read from NEAR, not from us.</strong> Your browser found all {report.chunks.length} batches of
                    these answers in NEAR's own records, on a public NEAR node.
                  </li>
                  <li>
                    <strong>Checked {report.answersChecked} signatures.</strong> Each answer is signed together with its
                    exact question, by a key made inside the model's secure hardware. Change one word and the signature
                    fails.
                  </li>
                  <li>
                    <strong>Added them up.</strong> The checked answers give exactly the figures on the certificate:{" "}
                    {pct(top.accuracy_bps)} overall.
                  </li>
                </ol>
              </>
            )}
          />
        </div>
      )}
    </section>
  );
}
