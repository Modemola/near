import { Link } from "react-router-dom";
import { ErrorNote, Loading, useAsync } from "../components/ui";
import { isConfigured } from "../lib/config";
import { formatNear, proctor } from "../lib/near";

export function Sets() {
  const { data, error, loading } = useAsync(() => (isConfigured ? proctor.sets() : Promise.resolve([])), []);
  return (
    <>
      <h1>Test sets</h1>
      <p className="lede">Private sets models are certified on. Their contents are never published; their fingerprints are.</p>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      <div className="grid cols-2">
        {data?.map((s) => (
          <div className="card" key={s.set_id}>
            <h3 style={{ marginTop: 0 }}>
              <Link to={`/sets/${s.set_id}`}>{s.title}</Link>{" "}
              {!s.active && <span className="badge muted">retired</span>}
            </h3>
            <p className="small muted">{s.description}</p>
            <p className="small">
              {s.item_count} items · {formatNear(s.price)} NEAR per eval · author gets {s.author_bps / 100}%
            </p>
          </div>
        ))}
      </div>
      {data?.length === 0 && <p className="muted">No sets yet. <Link to="/publish">Publish one</Link>.</p>}
    </>
  );
}
