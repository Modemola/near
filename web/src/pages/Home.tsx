import { Link } from "react-router-dom";
import { Leaderboard } from "../components/Leaderboard";
import { ErrorNote, Loading, useAsync } from "../components/ui";
import { isConfigured } from "../lib/config";
import { proctor } from "../lib/near";

export function Home() {
  const featured = import.meta.env.VITE_FEATURED_SET as string | undefined;
  const { data, error, loading } = useAsync(async () => {
    if (!isConfigured) return null;
    const sets = await proctor.sets();
    const set = sets.find((s) => s.set_id === featured) ?? sets[0];
    return set ? { set, certs: await proctor.certificates(set.set_id) } : null;
  }, []);

  return (
    <>
      <h1>How good is your AI scam filter, really?</h1>
      <p className="lede">
        Every vendor grades its own scam detection. Proctor certifies AI models on scam messages they have never
        seen: the test set stays sealed inside a TEE, every answer is signed by the model's TEE, and the score is
        checked and recorded on NEAR.
      </p>

      {loading && <Loading what="Loading certificates" />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <h2>
            <Link to={`/sets/${data.set.set_id}`}>{data.set.title}</Link>
          </h2>
          <p className="muted small">
            {data.set.item_count} messages in the sealed set. {data.set.description}
          </p>
          <Leaderboard certs={data.certs} />
        </>
      )}
      {data === null && isConfigured && <p className="muted">No test sets registered yet.</p>}

      <h2>Why you can trust a score</h2>
      <div className="grid cols-3">
        <div className="card">
          <h3>Nobody sees the test set</h3>
          <p className="small">
            The set is encrypted in the author's browser to one audited grader build. Only that build, running in an
            Intel TDX enclave on OutLayer, can decrypt it. Not us, not the model vendor.
          </p>
        </div>
        <div className="card">
          <h3>Every answer is signed</h3>
          <p className="small">
            Models run in NEAR AI Cloud GPU TEEs and sign each response over the exact request and response bytes.
            The contract checks every signature on-chain before counting it.
          </p>
        </div>
        <div className="card">
          <h3>You can check it yourself</h3>
          <p className="small">
            Each certificate page re-verifies every signed answer in your browser from NEAR RPC data.{" "}
            <Link to="/how">How it works</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
