import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  // Close an open notice when clicking elsewhere or changing page.
  useEffect(() => {
    const close = (e: Event) =>
      document.querySelectorAll<HTMLDetailsElement>(".chip-pop[open]").forEach((d) => {
        if (!d.contains(e.target as Node)) d.open = false;
      });
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>(".chip-pop[open]").forEach((d) => (d.open = false));
  }, [location.pathname]);
  // The header's height changes with the screen (one row or two), so publish its
  // bottom edge for anything that must sit below it: popups and the pinned story.
  useLayoutEffect(() => {
    const bar = document.querySelector("header.site .bar-glass");
    if (!bar) return;
    const set = () =>
      document.documentElement.style.setProperty("--hdr-bottom", `${Math.ceil(bar.getBoundingClientRect().bottom)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // A sidebar stays pinned only while it fits on screen; a taller one scrolls
  // with the page so its end can always be reached.
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    const check = () =>
      main.querySelectorAll<HTMLElement>(".split > aside").forEach((a) => {
        const room = window.innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr-bottom") || "80") - 32;
        a.classList.toggle("tall", a.offsetHeight > room);
      });
    const ro = new ResizeObserver(check);
    const watch = () => main.querySelectorAll(".split > aside").forEach((a) => ro.observe(a));
    const mo = new MutationObserver(() => { watch(); check(); });
    mo.observe(main, { childList: true, subtree: true });
    watch();
    check();
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener("resize", check); };
  }, []);
  const [announce, setAnnounce] = useState("");
  const firstLoad = useRef(true);
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    // Pages set their title in an effect; read it once they have.
    const t = setTimeout(() => setAnnounce(document.title), 300);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Skip to content
      </a>
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
            {(simulated || devSignerActive) && (
              // In the fixed-height header: always visible, never shifts the page.
              <div className="chips">
                {simulated && (
                  <details className="chip-pop demo">
                    <summary>
                      Demo<span className="short-hide"> · simulated</span>
                    </summary>
                    <div className="pop" role="note">
                      <p>
                        <strong>You are looking at a demo.</strong> Grading jobs go to{" "}
                        <code>{cfg.data?.outlayer}</code>, a stand-in for OutLayer, not secure hardware. Its models and
                        scores only show how Proctor works. They are not real results.
                      </p>
                    </div>
                  </details>
                )}
                {devSignerActive && (
                  <details className="chip-pop">
                    <summary>
                      Test signer<span className="short-hide"> active</span>
                    </summary>
                    <div className="pop" role="note">
                      <p>
                        This development build signs as <code>{accountId}</code> with a local test key. Production builds
                        never include it.
                      </p>
                    </div>
                  </details>
                )}
              </div>
            )}
            <span className="net" title="NEAR network">
              {config.networkId}
            </span>
            {accountId ? (
              <button className="btn secondary small account-btn" onClick={() => signOut()} title={`${accountId}: disconnect wallet`}>
                <span>{accountId}</span>
              </button>
            ) : (
              <button className="btn small" onClick={signIn} disabled={!ready}>
                Connect<span className="short-hide"> wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="wrap">
          {!isConfigured && (
            <div className="note">
              <strong>Proctor isn't connected to a contract yet.</strong> Set <code>VITE_CONTRACT_ID</code> in{" "}
              <code>web/.env.local</code> (see <code>.env.example</code>).
            </div>
          )}
          {/* Screen readers hear the new page's title after each navigation. */}
          <div className="sr-only" role="status" aria-live="polite">
            {announce}
          </div>
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
