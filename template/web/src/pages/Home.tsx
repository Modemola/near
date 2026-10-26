import { Link } from "react-router-dom";
import { Board } from "../components/Board";
import { Ceremony } from "../components/Ceremony";
import { CountUp, Reveal, useTilt } from "../components/motion";
import { Story } from "../components/Story";
import { Empty, Loading, Panel, Stamp, Unavailable, useAsync, useTitle, Words } from "../components/ui";
import { checkItem, data, type Item } from "../lib/data";

/**
 * The landing page, in the order a judge reads it: the question (hero), the
 * proof they can run themselves, the live figures, how it works, the full
 * list, the fine print, and one call to action.
 */
export function Home() {
  const { data: items, error, loading } = useAsync(() => data.items(), []);
  useTitle();
  const top = items?.[0];

  return (
    <>
      <section className="hero" style={{ marginTop: 0 }}>
        <div>
          <p className="eyebrow">Who it's for, in five words</p>
          <h1>
            <Words text="The question your product answers, asked plainly?" accent={["plainly?"]} />
          </h1>
          <p className="lede">
            One or two sentences: what it does, for whom, and why anyone can trust it. No jargon; the details are one
            click away.
          </p>
          <div className="actions">
            <a className="btn" href="#results">
              See the results
            </a>
            <a className="btn secondary" href="#check">
              Check one yourself
            </a>
          </div>
        </div>
        <HeroCard top={top} loading={loading} error={error} />
      </section>

      {/* Shown while loading too, at its usual size, so nothing below it moves when data arrives. */}
      {(loading || top) && <ClaimAndCheck top={top} />}

      <section>
        <div className="bento">
          <Reveal className="tile ink span-2 tall" i={0}>
            <div>
              <span className="label">The hero number</span>
              <div className="big">{top ? <CountUp value={`${top.score.toFixed(1)}%`} ms={1600} /> : "…"}</div>
              <p>{top ? `${top.name}, the current leader` : "Loading"}</p>
            </div>
          </Reveal>
          <Reveal className="tile glass span-2" i={1}>
            <div className="row">
              <div>
                <span className="label">A promise</span>
                <div className="mid">{items ? <CountUp value={items.length} /> : "…"}</div>
                <p>things measured, each one checkable by anyone.</p>
              </div>
              <div className="block3d" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </Reveal>
          <Reveal className="tile" i={2}>
            <span className="label">A second figure</span>
            <div className="mid">{top ? <CountUp value={`${top.b}%`} /> : "…"}</div>
            <p>what it means, in plain words</p>
          </Reveal>
          <Reveal className="tile" i={3}>
            <span className="label">A third figure</span>
            <div className="mid">{top ? <CountUp value={top.parts} /> : "…"}</div>
            <p>parts behind every result</p>
          </Reveal>
        </div>
      </section>

      <section id="results">
        <div className="section-head">
          <p className="eyebrow">Results</p>
          <h2>The full list</h2>
          <p>Ranked by the hero number. Each row opens the details.</p>
        </div>
        {loading && <Loading what="Loading results" height={210} />}
        {error && <Unavailable what="The results list" error={error} />}
        {items && items.length > 0 && <Board items={items} label="Results" />}
        {items && items.length === 0 && (
          <Empty>
            Nothing here yet. <Link viewTransition to="/new">Create the first one</Link>.
          </Empty>
        )}
      </section>

      <Story
        label="How it works"
        eyebrow="How it works"
        title={
          <>
            Three steps. <em>Nothing</em> hidden.
          </>
        }
        steps={[
          { title: "First step", text: "One sentence on what happens first, in the user's words.", card: { label: "Step 1", value: "Collected" } },
          { title: "Second step", text: "One sentence on the step that makes it trustworthy.", card: { label: "Step 2", value: "Checked" } },
          { title: "Third step", text: "One sentence on the result the user gets.", card: { label: "Step 3", value: "Published" } },
        ]}
      />

      <Reveal as="section">
        <Panel eyebrow="Read results fairly" title="What a result does and doesn't tell you" className="quiet">
          <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-secondary)" }}>
            <li>The honest limit that matters most, said first.</li>
            <li>What varies, and how the page shows it.</li>
            <li>Who can take part, and what they need.</li>
          </ul>
        </Panel>
      </Reveal>

      <Reveal as="section">
        <div className="panel closing">
          <p className="eyebrow">Get involved</p>
          <h2>
            One line that makes the reader <em>act</em>
          </h2>
          <p>Who should do what next, and what they get from it.</p>
          <div className="actions">
            <Link viewTransition className="btn" to="/new">
              Create one
            </Link>
            <Link viewTransition className="btn secondary" to="/items">
              Explore
            </Link>
          </div>
        </div>
      </Reveal>
    </>
  );
}

function HeroCard({ top, loading, error }: { top?: Item; loading: boolean; error?: string }) {
  const deck = useTilt<HTMLDivElement>();
  if (loading)
    return (
      <div className="scene" role="status" aria-label="Loading the top result…">
        <div className="skeleton" style={{ height: 380 }} />
      </div>
    );
  if (error) return <Unavailable what="The top result" error={error} />;
  if (!top)
    return (
      <Panel eyebrow="Top result" title="Nothing yet">
        <p className="muted">When the first result arrives, it appears here.</p>
      </Panel>
    );
  return (
    <div className="scene">
      <div className="deck-float">
        <div className="deck" ref={deck}>
          <div className="shadow" aria-hidden="true" />
          <div className="ghost g2" aria-hidden="true" />
          <div className="ghost g1" aria-hidden="true" />
          <div className="front">
            <Panel className="glass" eyebrow="Top result" title={top.name} sub={top.summary} serial={`Updated ${top.updated}`}>
              <dl className="rows">
                <div>
                  <dt>Measure A</dt>
                  <dd>{top.a}%</dd>
                </div>
                <div>
                  <dt>Measure B</dt>
                  <dd>{top.b}%</dd>
                </div>
                <div>
                  <dt>Parts behind it</dt>
                  <dd>{top.parts}</dd>
                </div>
              </dl>
              <p className="say">
                In one sentence: <em>what this result means</em> for the reader.
              </p>
              <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
                <Link viewTransition to={`/items/${top.id}`}>See the full result</Link>
              </p>
            </Panel>
          </div>
          <div className="float-stamp">
            <Stamp value={`${top.score.toFixed(1)}%`} label="Overall" delay={1.5} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The claim next to the action that proves it, run in the visitor's own browser. */
function ClaimAndCheck({ top }: { top?: Item }) {
  return (
    <section id="check">
      <div className="section-head">
        <p className="eyebrow">Don't take our word for it</p>
        <h2>
          Check this result <em>yourself</em>
        </h2>
        <p>One or two sentences on what the visitor can verify, and that it needs no account.</p>
      </div>
      {!top ? (
        <div className="check-grid" role="status" aria-label="Loading the top result…">
          <div className="skeleton check-skel-claim" />
          <div className="skeleton check-skel-check" />
        </div>
      ) : (
        <div className="check-grid">
          <div className="panel quiet claim">
            <p className="eyebrow">The claim</p>
            <p className="claim-score">{top.score.toFixed(1)}%</p>
            <p className="claim-what">
              <strong>{top.name}</strong> scored this overall, from {top.parts} independent parts.
            </p>
            <p className="small" style={{ margin: 0 }}>
              <Link viewTransition to={`/items/${top.id}`}>See the details</Link>
            </p>
          </div>
          <Ceremony
            title="The check"
            parts={top.parts}
            intro={<>Checks all {top.parts} parts behind this result and adds them up. A few seconds; nothing to install.</>}
            run={(onProgress) => checkItem(top.id, onProgress)}
            explain={(report) => (
              <>
                <p className="eyebrow">What just happened</p>
                <ol className="explain-steps">
                  <li>
                    <strong>Fetched from the source, not from us.</strong> Where the data came from, in one sentence.
                  </li>
                  <li>
                    <strong>Checked {report.checked} parts.</strong> What each check proves.
                  </li>
                  <li>
                    <strong>Added them up.</strong> They give exactly the {top.score.toFixed(1)}% shown.
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
