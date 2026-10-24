/** Motion helpers. Everything resolves to its final state under reduced motion. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, i = 0, className = "", as: Tag = "div" }: { children: ReactNode; i?: number; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      className={`reveal${shown ? " in" : ""} ${className}`}
      style={{ "--i": i } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

const NUM = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/s;

/** Counts a figure up from zero when it appears, keeping its format ("90.0%", "274,536,618", "0.1 N"). */
export function CountUp({ value, ms = 1400 }: { value: string | number; ms?: number }) {
  const text = String(value);
  const m = NUM.exec(text);
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(m && !reducedMotion() ? null : text);
  useEffect(() => {
    if (!m || reducedMotion()) return setShown(text);
    const [, pre, num, post] = m;
    const target = Number(num.replace(/,/g, ""));
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const grouped = num.includes(",");
    const fmt = (v: number) =>
      pre +
      (grouped
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals)) +
      post;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      start ||= t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(2, -10 * p);
      setShown(fmt(p >= 1 ? target : target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        raf = requestAnimationFrame(tick);
        io.disconnect();
      }
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <span ref={ref} aria-label={text}>
      <span aria-hidden="true">{shown ?? (m ? m[1] + "0" + m[3] : text)}</span>
    </span>
  );
}

/**
 * Tilts its child in 3D towards the pointer (fine pointers only).
 * Sets --rx/--ry on the element; CSS decides how far it turns.
 */
export function useTilt<T extends HTMLElement>(maxX = 10, maxY = 14, rest = { rx: 6, ry: -10 }) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const host = el.parentElement ?? el;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add("live");
      el.style.setProperty("--rx", `${(-y * maxX).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * maxY).toFixed(2)}deg`);
    };
    const leave = () => {
      el.classList.remove("live");
      el.style.setProperty("--rx", `${rest.rx}deg`);
      el.style.setProperty("--ry", `${rest.ry}deg`);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [maxX, maxY, rest.rx, rest.ry]);
  return ref;
}

/** Page-wide effects: the cursor spotlight on panels and the scroll progress bar. */
export function useAmbientMotion() {
  useEffect(() => {
    let raf = 0;
    const fine = window.matchMedia("(pointer: fine)").matches && !reducedMotion();
    let magnet: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const btn = fine ? ((e.target as Element | null)?.closest?.(".btn:not(:disabled)") as HTMLElement | null) : null;
      if (magnet && magnet !== btn) {
        magnet.style.setProperty("--tx", "0px");
        magnet.style.setProperty("--ty", "0px");
      }
      magnet = btn;
      if (btn) {
        const b = btn.getBoundingClientRect();
        btn.style.setProperty("--tx", `${((e.clientX - b.left - b.width / 2) * 0.22).toFixed(1)}px`);
        btn.style.setProperty("--ty", `${((e.clientY - b.top - b.height / 2) * 0.3).toFixed(1)}px`);
      }
      const el = (e.target as Element | null)?.closest?.(".panel, .stat, .points > div") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      if (el.parentElement?.classList.contains("points") && !reducedMotion()) {
        el.style.setProperty("--rx", `${(-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2)}deg`);
      }
    };
    const onLeave = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el?.parentElement?.classList?.contains("points")) {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        document.documentElement.style.setProperty("--p", String(max > 0 ? window.scrollY / max : 0));
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave as EventListener, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave as EventListener);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
}

export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

const Check = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="16" cy="16" r="11" />
    <path d="M11 16.5l3.5 3.5L21.5 12" strokeLinecap="square" />
  </svg>
);
const Lock = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="7" y="14" width="18" height="13" rx="3" />
    <path d="M11 14v-3a5 5 0 0110 0v3" />
  </svg>
);

/** The sealed test: a turning glass box with the messages glowing inside. */
export function SealedCube({ label = "A sealed test, readable only inside secure hardware" }: { label?: string }) {
  return (
    <div className="cube-scene" role="img" aria-label={label}>
      <div className="cube">
        <div className="face"><Check /></div>
        <div className="face"><div className="dots" /></div>
        <div className="face"><Lock /></div>
        <div className="face"><div className="dots" /></div>
        <div className="face"><Check /></div>
        <div className="face"><Lock /></div>
        <div className="core" />
      </div>
    </div>
  );
}

const HEX = "0123456789abcdef";

/** Text that decodes from random characters into its real value, left to right. */
export function useScramble(value: string, ms = 900) {
  const [text, setText] = useState(() => (reducedMotion() ? value : value.replace(/[0-9a-zA-Z]/g, () => HEX[(Math.random() * 16) | 0])));
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reducedMotion()) return setText(value);
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      start ||= t;
      const p = Math.min(1, (t - start) / ms);
      const fixed = Math.floor(p * value.length);
      setText(value.slice(0, fixed) + value.slice(fixed).replace(/[0-9a-zA-Z]/g, () => HEX[(Math.random() * 16) | 0]));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        raf = requestAnimationFrame(tick);
        io.disconnect();
      }
    });
    if (ref.current) io.observe(ref.current);
    else setText(value);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, ms]);
  return { ref, text };
}
