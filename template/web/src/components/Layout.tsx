import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { brand } from "../brand";
import { scrollToTop, useSmoothScroll } from "../lib/smooth";
import { Cursor } from "./Cursor";
import { Aurora, useAmbientMotion } from "./motion";

export function Layout() {
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
  // bottom edge for anything that must sit below it: popups, the pinned story,
  // pinned sidebars and anchor jumps.
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
    // Measured only in ResizeObserver callbacks, after the browser's own layout,
    // so this never forces an extra one.
    const check = (entries: ResizeObserverEntry[] = []) => {
      const header = document.querySelector("header.site .bar-glass")?.getBoundingClientRect().bottom ?? 80;
      const room = window.innerHeight - header - 32;
      main.querySelectorAll<HTMLElement>(".split > aside").forEach((a) => {
        ro.observe(a);
        const entry = entries.find((e) => e.target === a);
        const height = entry ? entry.borderBoxSize[0].blockSize : a.offsetHeight;
        a.classList.toggle("tall", height > room);
      });
    };
    const ro = new ResizeObserver(check);
    ro.observe(main);
    // A window made only taller or shorter doesn't resize main.
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => check());
    };
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  // Screen readers hear the new page's title after each navigation.
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
              {brand.name}
            </NavLink>
            <nav className="main" aria-label="Main" ref={nav}>
              <span
                className="nav-pill"
                aria-hidden="true"
                style={{ transform: `translateX(${pill?.x ?? 0}px)`, width: pill?.w ?? 0, opacity: pill ? 1 : 0 }}
              />
              {brand.nav.map((n) => (
                <NavLink key={n.to} viewTransition to={n.to} end={n.end}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            {brand.notice && (
              // In the fixed-height header: always visible, never shifts the page.
              <div className="chips">
                <details className="chip-pop demo">
                  <summary>{brand.notice.chip}</summary>
                  <div className="pop" role="note">
                    <p>{brand.notice.text}</p>
                  </div>
                </details>
              </div>
            )}
            {/* The header's main action. Swap for sign-in, a wallet, or remove. */}
            <NavLink viewTransition className="btn small" to="/new">
              Get started
            </NavLink>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="wrap">
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
            <span>{brand.tagline}</span>
            <a href={brand.sourceUrl}>Source code</a>
          </div>
        </div>
      </footer>
    </>
  );
}
