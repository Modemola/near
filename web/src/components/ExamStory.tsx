import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { reducedMotion, SealedCube } from "./motion";

const STEPS = [
  { title: "The test is sealed", text: "Scam and real messages go into a box only the grader can open, inside secure hardware." },
  { title: "The model takes the exam", text: "Each message is put to the model, which also runs in secure hardware. Nobody can watch." },
  { title: "Every answer is signed", text: "The hardware signs each answer with the exact question, so nothing can be swapped." },
  { title: "NEAR checks and records it", text: "The contract checks every signature, then stamps the result on-chain for good." },
];

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const TOO_SHORT = "(max-width: 860px) and (max-height: 759px), (min-width: 861px) and (max-height: 619px)";

/** A pinned scene that plays the exam as you scroll through it. */
export function ExamStory() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  // Pinned only when the whole scene fits below the header; on short screens
  // (phones held sideways, small phones) it lays out as a plain section instead.
  // Decided before the first paint, not during render, so the pre-rendered HTML
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

  useEffect(() => {
    if (still) {
      ref.current?.querySelector<HTMLElement>(".story-rail > div")?.style.removeProperty("transform");
      return setStep(3);
    }
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      // Only the rail moves; setting a style value on the whole section would
      // recheck every element in it on every scroll frame.
      const rail = el.querySelector<HTMLElement>(".story-rail > div");
      if (rail) rail.style.transform = `scaleX(${p.toFixed(4)})`;
      setStep(Math.min(3, Math.floor(p * 4.2)));
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
  }, [still]);

  return (
    <section className={`story${still ? " still" : ""}`} ref={ref} data-step={step} aria-label="How an exam runs">
      <div className="story-pin">
        <div className="story-text">
          <p className="eyebrow">How an exam runs</p>
          <h2>
            Four steps. <em>Nobody</em> can cheat.
          </h2>
          <ol className="story-steps">
            {STEPS.map((s, i) => (
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
          <div className="tee-frame">
            <span>Secure hardware</span>
          </div>
          <div className="st-cube">
            <SealedCube label="" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="mini" key={i} style={{ "--i": i } as CSSProperties}>
              <i />
              <i />
              <i />
            </div>
          ))}
          <div className="model-chip">
            <span className="chip-core" />
            <b>AI model</b>
            <small>secure GPU</small>
          </div>
          <div className="lane">
            {Array.from({ length: 8 }, (_, i) => (
              <span className="qbead" key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
          <div className="near-block">
            <div className="nb-top" />
            <div className="nb-front">
              <b>NEAR</b>
              <small>contract checks every signature</small>
            </div>
            <div className="nb-side" />
          </div>
          <div className="st-stamp">
            <b>Certified</b>
            <span>on chain</span>
          </div>
        </div>
      </div>
    </section>
  );
}
