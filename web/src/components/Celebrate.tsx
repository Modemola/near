import { useEffect, useState, type CSSProperties } from "react";
import { reducedMotion } from "./motion";

/** The certified moment: the stamp slams down and green beads burst out. */
export function Celebrate({ show, score }: { show: boolean; score?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!show || reducedMotion()) return;
    setOn(true);
    const main = document.querySelector("main");
    main?.classList.add("shake");
    const t = setTimeout(() => {
      setOn(false);
      main?.classList.remove("shake");
    }, 3300);
    return () => clearTimeout(t);
  }, [show]);
  if (!on) return null;
  return (
    <div className="celebrate" role="status" aria-label="Certified">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="bit"
          style={{ "--a": `${(i * 360) / 28 + (i % 3) * 7}deg`, "--r": `${150 + (i % 5) * 45}px` } as CSSProperties}
        />
      ))}
      <div className="big-stamp">
        <b>Certified</b>
        <span>{score ? `${score} overall` : "recorded on NEAR"}</span>
      </div>
    </div>
  );
}
