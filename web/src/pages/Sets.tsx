import { Link } from "react-router-dom";
import { GlassVault } from "../components/GlassVault";
import { Loading, PageHead, Panel, Unavailable, useAsync } from "../components/ui";
import { isConfigured } from "../lib/config";
import { formatNear, proctor } from "../lib/near";

export function Sets() {
  const { data, error, loading } = useAsync(() => (isConfigured ? proctor.sets() : Promise.resolve([])), []);
  return (
    <>
      <PageHead eyebrow="Tests" title={<>Sealed <em>tests</em></>} art={<GlassVault />}>
        Each test is a set of real-looking messages, some scams and some not. Nobody can read them, not even us; only
        their fingerprints are public.
      </PageHead>
      {loading && <Loading what="Loading tests" />}
      {error && <Unavailable what="The list of tests" error={error} />}
      <div className="grid cols-2">
        {data?.map((s) => (
          <Panel
            key={s.set_id}
            eyebrow={s.active ? "Open for certification" : "Retired"}
            title={<Link viewTransition to={`/sets/${s.set_id}`}>{s.title}</Link>}
            serial={s.set_id}
          >
            <p className="small" style={{ color: "var(--ink-secondary)" }}>
              {s.description}
            </p>
            <dl className="rows">
              <div>
                <dt>Messages</dt>
                <dd>{s.item_count}</dd>
              </div>
              <div>
                <dt>Price per certification</dt>
                <dd>{formatNear(s.price)} NEAR</dd>
              </div>
              <div>
                <dt>Author's share</dt>
                <dd>{s.author_bps / 100}%</dd>
              </div>
            </dl>
            <div style={{ marginTop: "1rem" }}>
              <Link viewTransition className="btn secondary small" to={`/sets/${s.set_id}`}>
                See results
              </Link>
            </div>
          </Panel>
        ))}
      </div>
      {data?.length === 0 && (
        <div className="panel quiet">
          <p className="state" style={{ padding: 0 }}>
            No tests have been published yet. <Link viewTransition to="/publish">Publish the first one</Link>.
          </p>
        </div>
      )}
    </>
  );
}
