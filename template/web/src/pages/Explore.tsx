import { Link } from "react-router-dom";
import { GlassCube } from "../components/motion";
import { Bar, Empty, Loading, PageHead, Panel, Unavailable, useAsync, useTitle } from "../components/ui";
import { data } from "../lib/data";

/** A list page: loading, error, empty and full, each one designed. */
export function Explore() {
  useTitle("Explore");
  const { data: items, error, loading } = useAsync(() => data.items(), []);
  return (
    <>
      <PageHead eyebrow="Explore" title={<>Everything, <em>at a glance</em></>} art={<GlassCube />}>
        One sentence on what's listed here and how to read it.
      </PageHead>
      {loading && <Loading what="Loading" height={320} />}
      {error && <Unavailable what="The list" error={error} />}
      {items?.length === 0 && (
        <Empty>
          Nothing here yet. <Link viewTransition to="/new">Create the first one</Link>.
        </Empty>
      )}
      <div className="grid cols-2">
        {items?.map((it) => (
          <Panel key={it.id} eyebrow="Item" title={<Link viewTransition to={`/items/${it.id}`}>{it.name}</Link>} serial={it.id}>
            <p className="small" style={{ color: "var(--ink-secondary)" }}>
              {it.summary}
            </p>
            <dl className="rows">
              <div>
                <dt>Overall</dt>
                <dd>{it.score.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Measure A</dt>
                <dd>{it.a}%</dd>
              </div>
            </dl>
            <Bar value={it.score} />
            <div style={{ marginTop: "1rem" }}>
              <Link viewTransition className="btn secondary small" to={`/items/${it.id}`}>
                See details
              </Link>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
