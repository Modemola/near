import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, select, summary, label, [role=button], input[type=file]";
const TEXT = "input:not([type=file]), textarea, [contenteditable=true]";

/**
 * A precise dot plus a trailing ring that grows over things you can press and
 * says what will happen: give any element data-cursor="View" (or any word).
 * Desktop pointers only; text fields keep the native caret, and reduced motion
 * keeps the normal cursor.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still || !dot.current || !ring.current) return;
    const root = document.documentElement;
    root.classList.add("has-cursor");
    // Hidden until the mouse first moves, then it appears where the mouse is.
    root.classList.add("cursor-out");
    let seen = false;
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let rx = x;
    let ry = y;
    let raf = 0;
    const frame = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.current!.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        seen = true;
        rx = x;
        ry = y;
      }
      dot.current!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      root.classList.remove("cursor-out");
      const t = e.target as Element;
      const text = !!t.closest?.(TEXT);
      const labelled = t.closest?.("[data-cursor]");
      const hot = !!t.closest?.(INTERACTIVE) || !!labelled;
      ring.current!.classList.toggle("hot", hot && !text);
      ring.current!.classList.toggle("text", text);
      dot.current!.classList.toggle("text", text);
      const word = labelled && !t.closest?.("a, button") ? (labelled.getAttribute("data-cursor") ?? "") : "";
      ring.current!.classList.toggle("labelled", !!word);
      if (label.current) label.current.textContent = word;
    };
    const down = () => ring.current!.classList.add("down");
    const up = () => ring.current!.classList.remove("down");
    const out = (e: PointerEvent) => !e.relatedTarget && root.classList.add("cursor-out");
    // A whole row with data-cursor opens its first link when clicked anywhere.
    const click = (e: MouseEvent) => {
      const t = e.target as Element;
      const row = t.closest?.(".board-row[data-cursor]");
      if (row && !t.closest("a, button")) row.querySelector<HTMLAnchorElement>("a")?.click();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointerout", out);
    document.addEventListener("click", click);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("has-cursor", "cursor-out");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("click", click);
    };
  }, []);

  return (
    <>
      <div className="cursor-ring" ref={ring} aria-hidden="true">
        <span ref={label} />
      </div>
      <div className="cursor-dot" ref={dot} aria-hidden="true" />
    </>
  );
}
