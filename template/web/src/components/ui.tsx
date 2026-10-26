import type React from "react";
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { brand } from "../brand";
import { friendlyError } from "../lib/errors";
import { CountUp, useScramble } from "./motion";

/**
 * Run an async loader; re-runs when `deps` change, and every `pollMs` if set.
 * Polling pauses while the tab is hidden and catches up when it is shown again.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    const run = () =>
      load().then(
        (data) => live && setState({ data, loading: false }),
        (e: unknown) => live && setState((s) => ({ ...s, error: friendlyError(e), loading: false })),
      );
    run();
    const timer = pollMs ? setInterval(() => !document.hidden && run(), pollMs) : undefined;
    const onShow = () => pollMs && !document.hidden && run();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Loading({ what = "Loading", height }: { what?: string; height?: number }) {
  // With a height, a placeholder reserves the space the content will take,
  // so nothing jumps when it arrives.
  if (height)
    return (
      <div role="status" aria-label={`${what}…`}>
        <div className="skeleton" style={{ height }} />
      </div>
    );
  return (
    <p className="state" role="status">
      {what}…
    </p>
  );
}

/** Sets the browser tab's title (and what screen readers announce on navigation). */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${brand.name}` : brand.title;
  }, [title]);
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="note critical" role="alert">
      {error}
    </div>
  );
}

/** A part of the page that couldn't load, said so without blocking the rest. */
export function Unavailable({ what, error }: { what: string; error: string }) {
  return (
    <div className="note" role="note">
      <strong>{what} is unavailable right now.</strong> {error} The rest of the page still works.
    </div>
  );
}

/** Nothing to show yet, and what to do about it. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="panel quiet">
      <p className="state" style={{ padding: 0 }}>
        {children}
      </p>
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  sub,
  serial,
  className = "",
  level = 2,
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  sub?: ReactNode;
  serial?: string;
  className?: string;
  /** Heading level of the title, so headings never skip a level (h1, then h2). */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <div className={`panel ${className}`}>
      {(title || eyebrow) && (
        <div className="panel-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <Title className="panel-title">{title}</Title>}
            {sub && <p>{sub}</p>}
          </div>
          {serial && <span className="serial">{serial}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHead({ eyebrow, title, children, art }: { eyebrow: string; title: ReactNode; children?: ReactNode; art?: ReactNode }) {
  return (
    <header className={`page-head${art ? " with-art" : ""}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {art}
    </header>
  );
}

/** A headline whose words rise through a mask, 65 ms apart. `accent` words are set in the accent italic. */
export function Words({ text, accent = [] }: { text: string; accent?: string[] }) {
  return (
    <span className="words">
      {text.split(" ").map((w, i) => (
        <Fragment key={i}>
          <span>
            <span style={{ "--i": i } as CSSProperties}>{accent.includes(w) ? <em>{w}</em> : w}</span>
          </span>{" "}
        </Fragment>
      ))}
    </span>
  );
}

export function Stat({ label, value, sub, hero }: { label: string; value: ReactNode; sub?: ReactNode; hero?: boolean }) {
  return (
    <div className={`stat${hero ? " lead" : ""}`}>
      <div className="label">{label}</div>
      <div className="stat-value">{typeof value === "string" || typeof value === "number" ? <CountUp value={value} /> : value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** A status in words, never colour alone. Map your own states to good / warning / critical / muted. */
export function StatusBadge({ word, tone, live }: { word: string; tone: "good" | "warning" | "critical" | "muted"; live?: boolean }) {
  return <span className={`status ${tone}${live ? " live" : ""}`}>{word}</span>;
}

/** A long value (id, hash, key) shown in full, decoding into place, with a copy button. */
export function Hash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { ref, text } = useScramble(value);
  return (
    <span className="hash">
      <span ref={ref as React.RefObject<HTMLSpanElement>}>
        <span className="sr-only">{value}</span>
        <span aria-hidden="true">{text}</span>
      </span>
      <button
        type="button"
        className="copy"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        aria-label="Copy to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/** The stamp that lands on a finished result. */
export function Stamp({ value, label, delay = 1.2 }: { value: string; label: string; delay?: number }) {
  return (
    <div className="stamp" style={{ "--d": `${delay}s` } as CSSProperties} role="img" aria-label={`${label}: ${value}`}>
      <div>
        <b>
          <CountUp value={value} ms={900} />
        </b>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** A labelled bar for a 0 to 100 figure. */
export function Bar({ value, inverse, delay = 0.2 }: { value: number; inverse?: boolean; delay?: number }) {
  return (
    <div className={`bar${inverse ? " inverse" : ""}`} aria-hidden="true">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, "--d": `${delay}s` } as CSSProperties} />
    </div>
  );
}
