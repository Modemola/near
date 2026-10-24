import { NavLink, Outlet } from "react-router-dom";
import { config, isConfigured } from "../lib/config";
import { proctor } from "../lib/near";
import { useWallet } from "../lib/wallet";
import { useAsync } from "./ui";

/** OutLayer contracts that run real TEE workers. */
const REAL_OUTLAYER = new Set(["outlayer.testnet", "outlayer.near"]);

export function Layout() {
  const { accountId, signIn, signOut, ready } = useWallet();
  const cfg = useAsync(() => (isConfigured ? proctor.config() : Promise.resolve(null)), []);
  const simulated = cfg.data && !REAL_OUTLAYER.has(cfg.data.outlayer);
  return (
    <>
      <header className="site">
        <div className="wrap">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" alt="" />
            Proctor
          </NavLink>
          <nav className="main" aria-label="Main">
            <NavLink to="/" end>
              Results
            </NavLink>
            <NavLink to="/sets">Tests</NavLink>
            <NavLink to="/how">How it works</NavLink>
            <NavLink to="/publish">Publish a test</NavLink>
          </nav>
          <span className="net" title="NEAR network">
            {config.networkId}
          </span>
          {accountId ? (
            <button className="btn secondary small" onClick={() => signOut()} title="Disconnect wallet">
              {accountId.length > 22 ? `${accountId.slice(0, 20)}…` : accountId}
            </button>
          ) : (
            <button className="btn secondary small" onClick={signIn} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main>
        <div className="wrap">
          {simulated && (
            <div className="note demo" role="note">
              <strong>You are looking at a demo.</strong> Its grading is simulated (jobs go to{" "}
              <code>{cfg.data?.outlayer}</code>, not secure hardware), so its models and scores only show how Proctor
              works. They are not real results.
            </div>
          )}
          {!isConfigured && (
            <div className="note">
              <strong>Proctor isn't connected to a contract yet.</strong> Set <code>VITE_CONTRACT_ID</code> in{" "}
              <code>web/.env.local</code> (see <code>.env.example</code>).
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <footer className="site">
        <div className="wrap">
          <span>Proctor. Independent results for AI scam filters, checked on NEAR.</span>
          <span>
            Contract <code>{config.contractId || "not set"}</code> on {config.networkId} ·{" "}
            <a href={config.sourceUrl}>Source code</a>
          </span>
        </div>
      </footer>
    </>
  );
}
