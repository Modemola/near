/** Step-by-step transaction notifications: Sign, Pending, Confirmed (or Failed / Cancelled). */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type TxStep = "Sign" | "Pending" | "Confirmed" | "Failed" | "Cancelled";

export interface Toast {
  id: number;
  title: string;
  step: TxStep;
  detail?: ReactNode;
}

interface Toasts {
  /** Start a notification; returns a function that moves it to a new step. */
  start: (title: string, detail?: ReactNode) => (step: TxStep, detail?: ReactNode) => void;
}

const Ctx = createContext<Toasts | null>(null);
let nextId = 1;
const ORDER: TxStep[] = ["Sign", "Pending", "Confirmed"];

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));

  const start = useCallback((title: string, detail?: ReactNode) => {
    const id = nextId++;
    setToasts((ts) => [...ts.slice(-3), { id, title, step: "Sign", detail }]);
    return (step: TxStep, d?: ReactNode) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, step, detail: d ?? t.detail } : t)));
      if (step === "Confirmed" || step === "Cancelled") setTimeout(() => dismiss(id), 12000);
    };
  }, []);

  return (
    <Ctx.Provider value={{ start }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.step}`}>
            <div className="t-head">
              <span className="t-title">{t.title}</span>
              <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ×
              </button>
            </div>
            <div className="t-steps">
              {ORDER.map((s, i) => {
                const at = ORDER.indexOf(t.step);
                const failedHere = (t.step === "Failed" || t.step === "Cancelled") && i === (t.step === "Cancelled" ? 0 : 1);
                const cls = failedHere ? "bad" : at > i || t.step === "Confirmed" ? "ok" : at === i ? "on" : "";
                return (
                  <span key={s} className={cls}>
                    {failedHere ? t.step : s}
                  </span>
                );
              })}
            </div>
            {t.detail && <p>{t.detail}</p>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToasts(): Toasts {
  const t = useContext(Ctx);
  if (!t) throw new Error("useToasts outside ToastProvider");
  return t;
}
