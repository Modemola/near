/** Inertia scrolling on desktop. Phones and reduced-motion users keep native scrolling. */
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

let lenis: Lenis | null = null;

export function useSmoothScroll() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;
    lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.95,
      anchors: { offset: -96 },
      autoRaf: true,
      // Inner scrollers (tables, code, the phone nav strip, modals) scroll natively.
      prevent: (node) => !!node.closest?.(".table-wrap, pre, nav.main, [data-lenis-prevent]"),
    });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
}

/** Jump to the top on a page change, through Lenis when it is running. */
export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo({ top: 0 });
}
