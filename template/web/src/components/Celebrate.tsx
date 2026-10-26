import { useEffect, useState, type CSSProperties } from "react";
import { reducedMotion } from "./motion";

/** The big moment (something finished while you watched): a stamp slams down and beads burst out. */
export function Celebrate({ show, word = "Done", sub }: { show: boolean; word?: string; sub?: string }) {
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
    <div className="celebrate" role="status" aria-label={word}>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="bit"
          style={{ "--a": `${(i * 360) / 28 + (i % 3) * 7}deg`, "--r": `${150 + (i % 5) * 45}px` } as CSSProperties}
        />
      ))}
      <div className="big-stamp">
        <b>{word}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}
