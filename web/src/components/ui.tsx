import { useEffect, useState, type ReactNode } from "react";
import { config } from "../lib/config";
import type { EvalStatus } from "../lib/types";

/** Run an async loader; re-runs when `deps` change, and every `pollMs` if set. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    const run = () =>
      load().then(
        (data) => live && setState({ data, loading: false }),
        (e: unknown) => live && setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), loading: false })),
      );
    run();
    const timer = pollMs ? setInterval(run, pollMs) : undefined;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <p className="muted" role="status">
      {what}…
    </p>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="notice bad" role="alert">
      {error}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: EvalStatus }) {
  const cls = status === "Certified" ? "good" : status === "Failed" ? "bad" : "warn";
  return <span className={`badge ${cls}`}>{status}</span>;
}

/** A hash shown in full (wrapping), with a copy button. */
export function Hash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="hash">
      {value}{" "}
      <button
        type="button"
        className="btn secondary"
        style={{ minHeight: 0, padding: "0 0.4rem", fontSize: "0.75rem" }}
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}
        aria-label="Copy"
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
