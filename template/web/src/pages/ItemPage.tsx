import { Link, useParams } from "react-router-dom";
import { Ceremony } from "../components/Ceremony";
import { ErrorNote, Hash, PageHead, Panel, Stat, StatusBadge, useAsync, useTitle } from "../components/ui";
import { checkItem, data } from "../lib/data";

/** A detail page: the content, and a sidebar for the action (pinned while it fits). */
export function ItemPage() {
  const { id = "" } = useParams();
  const { data: item, error, loading } = useAsync(() => data.item(id), [id]);
  useTitle(item ? item.name : "Details");
  // The placeholder has the page's real shape, so nothing moves when it arrives.
  if (loading)
    return (
      <div role="status" aria-label="Loading…">
        <div className="page-head">
          <div>
            <div className="skeleton" style={{ width: 90, height: 14, marginBottom: 14 }} />
            <div className="skeleton item-skel-title" />
            <div className="skeleton" style={{ width: "min(32rem, 100%)", height: 22, marginTop: 18 }} />
          </div>
        </div>
        <div className="split">
          <div className="stack">
            <div className="skeleton item-skel-stats" />
            <div className="skeleton" style={{ height: 412 }} />
          </div>
          <div className="stack">
            <div className="skeleton" style={{ height: 425 }} />
          </div>
        </div>
      </div>
    );
  if (error) return <ErrorNote error={error} />;
  if (!item)
    return (
      <PageHead eyebrow="Details" title="Not found">
        There's nothing at this address. <Link viewTransition to="/items">See everything</Link>.
      </PageHead>
    );
  return (
    <>
      <PageHead eyebrow="Details" title={item.name}>
        {item.summary}
      </PageHead>
      <section className="split" style={{ marginTop: 0 }}>
        <div className="stack">
          <div className="stats">
            <Stat label="Overall" value={`${item.score.toFixed(1)}%`} hero />
            <Stat label="Measure A" value={`${item.a}%`} sub="what it means" />
            <Stat label="Measure B" value={`${item.b}%`} sub="lower is better" />
          </div>
          <Panel eyebrow="Breakdown" title="Part by part" sub="A table for the people who want every number.">
            <div className="table-wrap" style={{ border: 0 }} tabIndex={0} role="region" aria-label="Part by part">
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="num">Measure A</th>
                    <th className="num">Measure B</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((n) => (
                    <tr key={n}>
                      <td>Part {n}</td>
                      <td className="num">{item.a}%</td>
                      <td className="num">{item.b}%</td>
                      <td>
                        <StatusBadge word="Checked" tone="good" />
                      </td>
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
                  <dt>Identifier</dt>
                  <dd>
                    <Hash value={`${item.id}-0f3a9c27d1e84b6a`} />
                    <div className="small muted">Where it comes from, and how to check it independently.</div>
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{item.updated}</dd>
                </div>
              </dl>
            </div>
          </details>
        </div>
        <aside className="stack">
          <Ceremony
            parts={item.parts}
            intro={<>Re-checks all {item.parts} parts behind this result. Free, and no account needed.</>}
            run={(onProgress) => checkItem(item.id, onProgress)}
          />
          <Panel className="quiet" eyebrow="Read it fairly">
            <p className="small" style={{ margin: 0, color: "var(--ink-secondary)" }}>
              The honest limit of this result, in one or two sentences.
            </p>
          </Panel>
        </aside>
      </section>
    </>
  );
}
