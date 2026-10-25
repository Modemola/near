// Responsive audit: every page on 15 device sizes. Reports components that
// overlap each other, content that escapes its container, anything cut off at
// the screen edge, and the pinned story, header and popups at each scroll step.
//
// Usage: node responsive.mjs <base-url> <out-dir> [device-filter]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const [BASE, OUT, ONLY] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  ({ chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`));
}

const DEVICES = [
  ["fold", 280, 653, true], ["se", 320, 568, true], ["mini", 375, 667, true], ["iphone", 390, 844, true], ["pixel", 412, 915, true],
  ["se-land", 568, 320, true], ["phone-land", 844, 390, true], ["zoom-200", 640, 360, false],
  ["ipad-mini", 768, 1024, true], ["ipad-land", 1024, 768, true], ["ipad-pro", 1024, 1366, true],
  ["laptop-720", 1280, 720, false], ["laptop", 1366, 768, false], ["desktop", 1440, 900, false], ["fhd", 1920, 1080, false], ["qhd", 2560, 1440, false],
].filter(([n]) => !ONLY || ONLY.split(",").includes(n));
const PAGES = process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/sets", "/sets/e2e-scams", "/evals/0", "/certificates/0", "/publish", "/how", "/nowhere"];
const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/\//g, "_"));

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : [],
});

/** Runs in the page: component overlaps, escapes, edge cuts and spilled text. */
function inspect() {
  // The hero card is tilted in 3D; its children's bounding boxes become sloped
  // shapes. Measure the layout flat, then put the tilt back.
  const tilted = [...document.querySelectorAll(".deck, .deck-float")];
  for (const el of tilted) { el.style.setProperty("transform", "none", "important"); el.style.setProperty("animation", "none", "important"); el.style.setProperty("transition", "none", "important"); }
  try { return measure(); } finally { for (const el of tilted) { el.style.removeProperty("transform"); el.style.removeProperty("animation"); el.style.removeProperty("transition"); } }
  function measure() {
  const vw = document.documentElement.clientWidth;
  const out = { overlaps: [], escapes: [], edges: [], spills: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05;
  };
  const describe = (el) => {
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(" ").filter(Boolean).slice(0, 2).join(".");
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${t ? ` "${t}"` : ""}`;
  };
  // Decoration that overlaps by design, and places whose insides move by design.
  const DECOR = ".aurora, .scroll-progress, .cursor-dot, .cursor-ring, .skip-link, .toasts, .ghost, .shadow, .float-stamp, .stamp, .cert-watermark, .sr-only, [aria-hidden=true], .stage, .vault-floor, .celebrate, .chip-pop .pop, .nav-pill";
  const SCROLLERS = ".table-wrap, nav.main, .scan-strip, pre, .bubbles";
  const isDecor = (el) => !!el.closest(DECOR);
  const inClosed = (el) => { const d = el.closest("details:not([open])"); return !!d && !el.closest("summary"); };

  // 1. Components that overlap each other (neither contains the other).
  const COMP = ".panel, .tile, .stat, .board-row, .scan-card, .cert, .note, .btn, h1, h2, h3, .lede, .eyebrow, .points > div, input, select, textarea, .fseal, .vault, .cube-scene, footer.site, .bar-glass, .brand, nav.main, .chips, .net, .table-wrap, .rows > div, dl.facts > div, .sheet-group, .story-text, .say, .label, .serial, .status, .copy, .hash, .metric, .rank, .model, .cert-big, .cert-mid, .cert-fig, .foil, .seal-chip, .scene, .deck, .front, .publish-seal, .set-seal, .batch, .progress, details.more, .bar, .stats, .bento, .board, .hero > *, .page-head > *";
  const comps = [...document.querySelectorAll(COMP)].filter((el) => visible(el) && !isDecor(el) && !inClosed(el));
  const rects = comps.map((el) => el.getBoundingClientRect());
  for (let i = 0; i < comps.length && out.overlaps.length < 15; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i], b = comps[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rects[i], rb = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 3 && h > 3) out.overlaps.push(`${describe(a)} ⟂ ${describe(b)} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  // 2. Content that escapes its container.
  const CONTAINERS = ".panel, .tile, .stat, .board-row, .scan-card, .cert-frame, .note, .bar-glass, .rows > div, dl.facts > div, .points > div, details.more, .btn, .chip-pop > summary";
  for (const box of document.querySelectorAll(CONTAINERS)) {
    if (!visible(box) || isDecor(box) || inClosed(box)) continue;
    const rb = box.getBoundingClientRect();
    for (const el of box.querySelectorAll("*")) {
      if (!visible(el) || isDecor(el) || inClosed(el) || el.closest(SCROLLERS) || el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      const r = el.getBoundingClientRect();
      const dx = Math.max(rb.left - r.left, r.right - rb.right);
      const dy = Math.max(rb.top - r.top, r.bottom - rb.bottom);
      if (dx > 2 || dy > 2) {
        out.escapes.push(`${describe(el)} escapes ${describe(box)} by ${Math.round(Math.max(dx, dy))}px`);
        break;
      }
    }
    if (out.escapes.length > 15) break;
  }
  // 3. Anything cut off at the screen's left or right edge.
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || isDecor(el) || inClosed(el) || el.closest(SCROLLERS) || el.closest(".scan-strip, .bubbles")) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      out.edges.push(`${describe(el)} (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
      if (out.edges.length > 10) break;
    }
  }
  // 3b. Decoration is allowed to overlap content, but not to be cut off by the screen edge.
  for (const el of document.querySelectorAll(".deck .ghost, .float-stamp, .stamp, .st-stamp, .foil, .cert-watermark, .vault, .cube-scene")) {
    const r = el.getBoundingClientRect();
    if (!visible(el) || inClosed(el)) continue;
    if (r.right > vw + 1 || r.left < -1) out.edges.push(`decoration ${describe(el)} cut off by the screen edge (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  }
  // 4. Text spilling out of its own box (no scroll, no ellipsis).
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || isDecor(el) || inClosed(el) || el.closest(SCROLLERS)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && cs.display !== "inline") {
      out.spills.push(`${describe(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px`);
      if (out.spills.length > 10) break;
    }
  }
  for (const el of document.querySelectorAll(".split > aside")) {
    const cs = getComputedStyle(el);
    if (cs.position === "sticky" && el.getBoundingClientRect().height > innerHeight - parseFloat(cs.top) - 4)
      out.overlaps.push(`pinned sidebar is taller than the screen (${Math.round(el.getBoundingClientRect().height)}px)`);
  }
  out.overflowX = document.documentElement.scrollWidth > vw + 1;
  return out;
  }
}

/** The pinned story at a scroll fraction: text, stage and header must not collide, and both fit on screen. */
async function storyAt(page, f) {
  return page.evaluate(async (f) => {
    const s = document.querySelector(".story");
    if (!s) return null;
    const top = s.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + (s.offsetHeight - innerHeight) * f, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 1700));
    const hdr = document.querySelector("header.site .bar-glass").getBoundingClientRect();
    const t = document.querySelector(".story-text").getBoundingClientRect();
    const st = document.querySelector(".stage").getBoundingClientRect();
    const problems = [];
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
    if (hit(t, st)) problems.push("story text overlaps the stage");
    if (t.top < hdr.bottom - 1) problems.push(`story text under the header by ${Math.round(hdr.bottom - t.top)}px`);
    if (st.top < hdr.bottom - 1) problems.push(`stage under the header by ${Math.round(hdr.bottom - st.top)}px`);
    if (st.bottom > innerHeight + 1) problems.push(`stage cut off at the bottom by ${Math.round(st.bottom - innerHeight)}px`);
    if (t.bottom > innerHeight + 1) problems.push(`story text cut off at the bottom by ${Math.round(t.bottom - innerHeight)}px`);
    // Stage pieces must stay inside the stage.
    for (const el of document.querySelectorAll(".stage > *")) {
      const r = el.getBoundingClientRect();
      if (parseFloat(getComputedStyle(el).opacity) < 0.05 || r.width < 2) continue;
      if (r.left < st.left - 4 || r.right > st.right + 4 || r.top < st.top - 14 || r.bottom > st.bottom + 4) problems.push(`${el.className} leaves the stage`);
    }
    // The pieces of the scene must not cover each other.
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el || parseFloat(getComputedStyle(el).opacity) < 0.05) return null;
      const r = el.getBoundingClientRect();
      return r.width > 2 ? r : null;
    };
    for (const [a, b] of [[".near-block", ".st-stamp"], [".lane", ".near-block"], [".st-stamp", ".tee-frame"], [".st-stamp", ".model-chip"], [".st-cube .cube-scene", ".model-chip"], [".near-block", ".tee-frame"]]) {
      const ra = box(a), rb = box(b);
      if (ra && rb && hit(ra, rb)) problems.push(`${a} covers ${b}`);
    }
    // The model runs in the secure hardware, so its chip stays inside the frame.
    const chip = box(".model-chip"), frame = box(".tee-frame");
    if (chip && frame && (chip.right > frame.right + 1 || chip.left < frame.left - 1 || chip.top < frame.top - 1 || chip.bottom > frame.bottom + 1))
      problems.push("the AI model chip crosses the secure-hardware frame");
    return { step: s.dataset.step, problems };
  }, f);
}

const report = {};
for (const [name, w, h, touch] of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000, reducedMotion: "reduce" });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(600);
    const r = await page.evaluate(inspect);
    const key = `${name} ${w}x${h} ${path}`;
    // Header popups: open each chip and check it stays on screen and clear of the header.
    const chips = await page.locator(".chip-pop > summary").count();
    for (let c = 0; c < chips; c++) {
      await page.locator(".chip-pop > summary").nth(c).click().catch(() => {});
      await page.waitForTimeout(300);
      const pop = await page.evaluate(() => {
        const p = [...document.querySelectorAll(".chip-pop[open] .pop")][0];
        if (!p) return null;
        const which = p.closest(".chip-pop").querySelector("summary").textContent.trim();
        const r = p.getBoundingClientRect();
        const hdr = document.querySelector("header.site .bar-glass").getBoundingClientRect();
        const issues = [];
        if (r.left < 0 || r.right > document.documentElement.clientWidth) issues.push(`popup off screen (${Math.round(r.left)}..${Math.round(r.right)})`);
        if (r.bottom > innerHeight) issues.push("popup runs off the bottom");
        if (r.top < hdr.bottom - 2 && r.left < hdr.right) issues.push("popup covers the header");
        return issues.map((i) => `${which} ${i}`);
      });
      if (pop?.length) r.overlaps.push(...pop);
      await page.keyboard.press("Escape").catch(() => {});
      await page.mouse.click(2, h - 2).catch(() => {});
    }
    if (path === "/") {
      r.story = [];
      const mctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000 });
      const mp = await mctx.newPage();
      await mp.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
      await mp.waitForTimeout(1000);
      const pinned = await mp.evaluate(() => !document.querySelector(".story")?.classList.contains("still"));
      r.storyMode = pinned ? "pinned" : "still";
      if (pinned) {
        for (const f of [0.05, 0.3, 0.55, 0.85]) {
          const s = await storyAt(mp, f);
          if (s && s.problems.length) r.story.push(`step ${s.step}: ${s.problems.join("; ")}`);
          if (["fold", "se", "iphone", "phone-land", "ipad-mini", "ipad-land", "laptop-720", "qhd"].includes(name))
            await mp.screenshot({ path: `${OUT}/${name}-story-${s?.step}.png` });
        }
      } else {
        const m = await mp.evaluate(inspect);
        for (const k of ["overlaps", "escapes", "edges", "spills"]) r[k].push(...m[k].map((x) => `(motion on) ${x}`));
      }
      await mctx.close();
    }
    report[key] = r;
    if (["fold", "se", "iphone", "phone-land", "ipad-mini", "ipad-land", "laptop-720", "qhd"].includes(name)) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `${OUT}/${name}-${slug(path)}.png`, fullPage: true });
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/responsive.json`, JSON.stringify(report, null, 2));
const lines = [];
let clean = 0;
for (const [k, r] of Object.entries(report)) {
  const parts = [];
  if (r.overflowX) parts.push("SIDEWAYS SCROLL");
  if (r.overlaps.length) parts.push(`overlaps: ${r.overlaps.slice(0, 4).join(" | ")}`);
  if (r.escapes.length) parts.push(`escapes: ${r.escapes.slice(0, 3).join(" | ")}`);
  if (r.edges.length) parts.push(`edges: ${r.edges.slice(0, 3).join(" | ")}`);
  if (r.spills.length) parts.push(`spills: ${r.spills.slice(0, 3).join(" | ")}`);
  if (r.story?.length) parts.push(`story (${r.storyMode}): ${r.story.join(" | ")}`);
  if (parts.length) lines.push(`${k}\n    ${parts.join("\n    ")}`);
  else clean++;
}
lines.push(`\n${clean}/${Object.keys(report).length} page-device combinations clean`);
writeFileSync(`${OUT}/responsive.txt`, lines.join("\n"));
console.log(lines.join("\n"));
