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
            <NavLink to="/" end>Leaderboard</NavLink>
            <NavLink to="/sets">Test sets</NavLink>
            <NavLink to="/publish">Publish a set</NavLink>
            <NavLink to="/how">How it works</NavLink>
          </nav>
          <span className="badge muted" title="NEAR network">{config.networkId}</span>
          {accountId ? (
            <button className="btn secondary" onClick={() => signOut()} title="Sign out">
              {accountId}
            </button>
          ) : (
            <button className="btn" onClick={signIn} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main>
        <div className="wrap">
          {simulated && (
            <div className="notice bad" role="note">
              <strong>Demo deployment.</strong> This contract sends grading jobs to <code>{cfg.data?.outlayer}</code>, a
              simulated OutLayer, not a real TEE. Its models and scores are simulated to show the flow; they are not real
              certificates.
            </div>
          )}
          {!isConfigured && (
            <div className="notice bad">
              No contract configured. Set <code>VITE_CONTRACT_ID</code> in <code>web/.env.local</code> (see{" "}
              <code>.env.example</code>).
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <footer className="site">
        <div className="wrap">
          Proctor: certified scores for AI models on private test sets. Contract{" "}
          <code>{config.contractId || "not set"}</code> on NEAR {config.networkId}.{" "}
          <a href={config.sourceUrl}>Source</a>
        </div>
      </footer>
    </>
  );
}
