import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { config, isConfigured } from "../lib/config";
import { proctor } from "../lib/near";
import { scrollToTop, useSmoothScroll } from "../lib/smooth";
import { devSignerActive, useWallet } from "../lib/wallet";
import { Cursor } from "./Cursor";
import { Aurora, useAmbientMotion } from "./motion";
import { useAsync } from "./ui";

/** OutLayer contracts that run real TEE workers. */
const REAL_OUTLAYER = new Set(["outlayer.testnet", "outlayer.near"]);

export function Layout() {
  const { accountId, signIn, signOut, ready } = useWallet();
  const cfg = useAsync(() => (isConfigured ? proctor.config() : Promise.resolve(null)), []);
  const simulated = cfg.data && !REAL_OUTLAYER.has(cfg.data.outlayer);
  const location = useLocation();
  useAmbientMotion();

  // The pill slides under whichever nav link is current.
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLElement>("a.active");
      setPill(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    document.fonts?.ready.then(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [location.pathname]);
  useSmoothScroll();
  useLayoutEffect(() => scrollToTop(), [location.pathname]);

  return (
    <>
      <Aurora />
      <Cursor />
      <div className="scroll-progress" aria-hidden="true" />
      <header className="site">
        <div className="wrap">
          <div className="bar-glass">
            <NavLink viewTransition to="/" className="brand">
              <img src="/favicon.svg" alt="" />
              Proctor
            </NavLink>
            <nav className="main" aria-label="Main" ref={nav}>
              <span
                className="nav-pill"
                aria-hidden="true"
                style={{ transform: `translateX(${pill?.x ?? 0}px)`, width: pill?.w ?? 0, opacity: pill ? 1 : 0 }}
              />
              <NavLink viewTransition to="/" end>
                Results
              </NavLink>
              <NavLink viewTransition to="/sets">Tests</NavLink>
              <NavLink viewTransition to="/how">How it works</NavLink>
              <NavLink viewTransition to="/publish">Publish a test</NavLink>
            </nav>
            <span className="net" title="NEAR network">
              {config.networkId}
            </span>
            {accountId ? (
              <button className="btn secondary small" onClick={() => signOut()} title="Disconnect wallet">
                {accountId.length > 22 ? `${accountId.slice(0, 20)}…` : accountId}
              </button>
            ) : (
              <button className="btn small" onClick={signIn} disabled={!ready}>
                Connect wallet
              </button>
            )}
          </div>
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
          {devSignerActive && (
            <div className="note" role="note">
              <strong>Test signer active.</strong> This development build signs as <code>{accountId}</code> with a local
              test key. Production builds never include it.
            </div>
          )}
          {!isConfigured && (
            <div className="note">
              <strong>Proctor isn't connected to a contract yet.</strong> Set <code>VITE_CONTRACT_ID</code> in{" "}
              <code>web/.env.local</code> (see <code>.env.example</code>).
            </div>
          )}
          <div className="route" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>
      <footer className="site">
        <div className="wrap">
          <div>
            <span>Proctor. Independent results for AI scam filters, checked on NEAR.</span>
            <span>
              Contract <code>{config.contractId || "not set"}</code> on {config.networkId} ·{" "}
              <a href={config.sourceUrl}>Source code</a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
