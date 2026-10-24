import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "./motion";

interface Item {
  id: string;
  channel: string;
  from: string;
  text: string;
  label: "SCAM" | "LEGIT";
}

const CHANNEL: Record<string, string> = { sms: "Text", email: "Email", whatsapp: "WhatsApp", social_dm: "Direct message", voice_transcript: "Voicemail" };

/**
 * Messages from the public sample glide through a scan line and are stamped
 * with the answer key as they pass. Public items only: the private test is
 * never shown anywhere.
 */
export function ScanStrip() {
  const [items, setItems] = useState<Item[] | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/examples/scam-sample.json")
      .then((r) => r.json())
      .then((d: { items: Item[] }) => setItems(d.items.slice(0, 14)))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const el = track.current;
    const host = strip.current;
    if (!el || !host || !items?.length) return;
    const cards = [...el.children] as HTMLElement[];
    if (reducedMotion()) {
      cards.forEach((c) => c.classList.add("scanned"));
      return;
    }
    let x = 0;
    let last = 0;
    let raf = 0;
    let paused = false;
    let visible = true;
    const half = el.scrollWidth / 2;
    const frame = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      if (!paused && visible && !document.hidden) {
        x -= dt * 0.055;
        if (x <= -half) x += half;
        el.style.transform = `translate3d(${x}px,0,0)`;
        const beam = host.getBoundingClientRect().left + host.clientWidth / 2;
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          if (r.left + r.width * 0.5 < beam) c.classList.add("scanned");
          else c.classList.remove("scanned");
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);
    const pause = () => (paused = true);
    const play = () => (paused = false);
    host.addEventListener("pointerenter", pause);
    host.addEventListener("pointerleave", play);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      host.removeEventListener("pointerenter", pause);
      host.removeEventListener("pointerleave", play);
    };
  }, [items]);

  if (!items?.length) return <div className="scan-strip placeholder" aria-hidden="true" />;
  const loop = [...items, ...items];
  return (
    <div className="scan-strip" ref={strip} role="region" aria-label="Example messages from the public sample, with their answers">
      <div className="scan-beam" aria-hidden="true" />
      <div className="scan-track" ref={track}>
        {loop.map((m, i) => (
          <article className={`scan-card ${m.label === "SCAM" ? "is-scam" : "is-real"}`} key={i} aria-hidden={i >= items.length}>
            <header>
              <span className="chan">{CHANNEL[m.channel] ?? m.channel}</span>
              <span className="from">{m.from}</span>
            </header>
            <p>{m.text}</p>
            <span className="verdict">{m.label === "SCAM" ? "Scam" : "Real"}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
