import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { reducedMotion } from "./motion";

export interface StoryStep {
  title: string;
  text: string;
  /** What the stage shows for this step: a small label and a big word or figure. */
  card: { label: string; value: string };
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Pinned only when the whole scene fits below the header; on short screens
// (phones held sideways, small phones, 200% zoom) it lays out as a plain section.
const TOO_SHORT = "(max-width: 860px) and (max-height: 759px), (min-width: 861px) and (max-height: 619px)";

/**
 * A pinned scene that tells how the product works as you scroll: the steps on
 * one side, and on the stage a glass card per step that stacks up. Keep it to
 * three or four steps, each one sentence.
 */
export function Story({ eyebrow, title, steps, label }: { eyebrow: string; title: ReactNode; steps: StoryStep[]; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  // Decided before the first paint, not during render, so pre-rendered HTML
  // and the browser's first render match.
  const [still, setStill] = useState(false);
  useIsoLayoutEffect(() => {
    if (reducedMotion()) return setStill(true);
    const mq = matchMedia(TOO_SHORT);
    const change = () => setStill(mq.matches);
    change();
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);

  const last = steps.length - 1;
  useEffect(() => {
    if (still) {
      ref.current?.style.removeProperty("--p");
      return setStep(last);
    }
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      el.style.setProperty("--p", p.toFixed(4));
      setStep(Math.min(last, Math.floor(p * (steps.length + 0.2))));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [still, last, steps.length]);

  return (
    <section className={`story${still ? " still" : ""}`} ref={ref} data-step={step} aria-label={label}>
      <div className="story-pin">
        <div className="story-text">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <ol className="story-steps">
            {steps.map((s, i) => (
              <li key={i} className={i === step ? "active" : i < step ? "done" : ""}>
                <span className="dot">{i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="story-rail" aria-hidden="true">
            <div />
          </div>
        </div>
        <div className="stage" aria-hidden="true">
          <div className="stage-orb" />
          {steps.map((s, i) => (
            <div
              key={i}
              className={`stage-card${i <= step ? " on" : ""}${i < step ? " behind" : ""}`}
              style={{ "--o": (i - step) * 26, "--back": step - i } as CSSProperties}
            >
              <span className="label">{s.card.label}</span>
              <b>{s.card.value}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
