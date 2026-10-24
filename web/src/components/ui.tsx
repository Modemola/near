import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { config } from "../lib/config";
import { friendlyError } from "../lib/errors";
import type { Confusion, EvalStatus } from "../lib/types";

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

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <p className="state" role="status">
      {what}…
    </p>
  );
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

export function Panel({
  eyebrow,
  title,
  sub,
  serial,
  className = "",
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  sub?: ReactNode;
  serial?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`panel ${className}`}>
      {(title || eyebrow) && (
        <div className="panel-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {serial && <span className="serial">{serial}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

/** A headline whose words rise through a mask, 60 ms apart. `accent` words are set in italic green. */
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

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}

export function Stat({ label, value, sub, hero }: { label: string; value: ReactNode; sub?: ReactNode; hero?: boolean }) {
  return (
    <div className={`stat${hero ? " lead" : ""}`}>
      <div className="label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

const STATUS_WORD: Record<EvalStatus, [string, string]> = {
  Running: ["In progress", "warning live"],
  Certified: ["Certified", "good"],
  Failed: ["Failed, refunded", "critical"],
};

export function StatusBadge({ status }: { status: EvalStatus }) {
  const [word, cls] = STATUS_WORD[status];
  return <span className={`status ${cls}`}>{word}</span>;
}

/** A hash shown in full (wrapping), with a copy button. */
export function Hash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="hash">
      {value}
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

export function AccountLink({ id }: { id: string }) {
  return (
    <a href={`${config.explorerUrl}/address/${id}`} target="_blank" rel="noreferrer">
      {id}
    </a>
  );
}

/**
 * One run drawn as a machine-marked answer sheet: a bubble per test message,
 * filled for a correct call and crossed for a mistake, grouped into scams and
 * real messages. Built only from the published totals, correct answers first,
 * so it says nothing about which message was which.
 */
export function AnswerSheet({
  run,
  stamp,
  stampLabel = "Overall",
}: {
  run: Confusion;
  stamp?: string;
  stampLabel?: string;
}) {
  const scams = run.tp + run.fn_;
  const real = run.tn + run.fp;
  const total = scams + real;
  const step = Math.min(0.045, 1.1 / Math.max(total, 1));
  const bubbles = (right: number, wrong: number, offset: number) =>
    Array.from({ length: right + wrong }, (_, i) => (
      <span
        key={i}
        className={`bubble ${i < right ? "right" : "wrong"}`}
        style={{ "--d": `${(offset + i) * step}s` } as CSSProperties}
      />
    ));
  return (
    <div className={`sheet${stamp ? " has-stamp" : ""}`}>
      <div className="sheet-group">
        <div className="label">
          <span>Scams</span>
          <span>
            {run.tp} of {scams} caught
          </span>
        </div>
        <div className="bubbles" role="img" aria-label={`${run.tp} of ${scams} scams caught`}>
          {bubbles(run.tp, run.fn_, 0)}
        </div>
      </div>
      <div className="sheet-group">
        <div className="label">
          <span>Real messages</span>
          <span>
            {run.tn} of {real} let through
          </span>
        </div>
        <div className="bubbles" role="img" aria-label={`${run.tn} of ${real} real messages let through, ${run.fp} wrongly flagged`}>
          {bubbles(run.tn, run.fp, scams)}
        </div>
      </div>
      <div className="sheet-legend" aria-hidden="true">
        <span>
          <i className="bubble right" /> Correct call
        </span>
        <span>
          <i className="bubble wrong" /> Mistake
        </span>
      </div>
      {stamp && (
        <div className="stamp" style={{ "--d": `${total * step + 0.15}s` } as CSSProperties} aria-label={`${stampLabel}: ${stamp}`}>
          <div>
            <b>{stamp}</b>
            <span>{stampLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
