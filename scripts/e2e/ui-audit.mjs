// UI audit: runs against the e2e chain after browser.mjs has created data.
// Accessibility (axe, keyboard), layout at 7 widths, reduced motion, states
// with NEAR unreachable, copy rules, page metadata and load metrics.
// Writes a JSON report and screenshots to OUT.
//
// Usage: node ui-audit.mjs <dev-base-url> <prod-base-url> <out-dir>
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const [DEV, PROD, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  ({ chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`));
}
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["/", "/sets", "/sets/e2e-scams", "/evals/0", "/certificates/0", "/publish", "/how", "/nowhere"];
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const report = { axe: {}, keyboard: {}, layout: {}, reducedMotion: {}, offline: {}, copy: {}, meta: {}, metrics: {} };

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : [],
});

async function open(base, path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 }, colorScheme: opts.scheme ?? "light", reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  if (opts.offline) await page.route(/127\.0\.0\.1:3030|localhost:3030/, (r) => r.abort("connectionrefused"));
  await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(opts.settle ?? 1800);
  if (opts.scroll !== false) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 350) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(900);
  }
  return { ctx, page };
}

const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/\//g, "_"));

// ---- 1. axe, light and dark --------------------------------------------------
for (const path of PAGES) {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open(DEV, path, { scheme, reducedMotion: "reduce" });
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, { resultTypes: ["violations"] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), summary: v.nodes[0]?.failureSummary?.slice(0, 220) }));
    });
    report.axe[`${path} ${scheme}`] = r;
    await ctx.close();
  }
}

// ---- 2. keyboard ---------------------------------------------------------------
for (const path of PAGES) {
  const { ctx, page } = await open(DEV, path, { reducedMotion: "reduce" });
  const visited = [];
  const problems = [];
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60); // let focus styles settle
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.setAttribute("data-tabbed", "1");
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.getAttribute("title") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow && cs.boxShadow !== "none";
      return { tag: el.tagName.toLowerCase(), name, visibleFocus: outline || ring, onScreen: r.width > 0 && r.height > 0, hidden: el.closest("[aria-hidden=true]") !== null };
    });
    if (!info) break;
    const key = `${info.tag}:${info.name}`;
    if (visited.length && visited[0] === key && i > 3) break; // wrapped around
    visited.push(key);
    if (!info.visibleFocus) problems.push(`no visible focus on ${key}`);
    if (!info.onScreen) problems.push(`focus lands on an invisible element ${key}`);
    if (info.hidden) problems.push(`focus inside aria-hidden ${key}`);
    if (!info.name) problems.push(`unnamed focusable ${info.tag}`);
  }
  const { interactive, unreachable } = await page.evaluate(() => {
    const els = [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[aria-hidden=true]") && !e.closest("details:not([open])")?.contains(e) || e.matches("summary");
    });
    const name = (e) => `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)}"`;
    return { interactive: els.length, unreachable: els.filter((e) => !e.hasAttribute("data-tabbed")).map(name) };
  });
  if (unreachable.length) problems.push(`not reachable by Tab: ${unreachable.join(", ")}`);
  report.keyboard[path] = { tabStops: visited.length, interactiveVisible: interactive, problems: [...new Set(problems)] };
  await ctx.close();
}

// ---- 3. layout at 7 widths ---------------------------------------------------------
for (const path of PAGES) {
  for (const width of WIDTHS) {
    const { ctx, page } = await open(DEV, path, { width, height: 900, reducedMotion: "reduce" });
    const r = await page.evaluate(() => {
      const out = { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, clipped: [], overlaps: [], tinyTargets: [] };
      const vw = window.innerWidth;
      // Text that is cut off without an ellipsis.
      const hiddenInClosedDetails = (el) => { const d = el.closest("details:not([open])"); return !!d && !el.closest("summary"); };
      for (const el of document.querySelectorAll("body *")) {
        if (hiddenInClosedDetails(el)) continue;
        const cs = getComputedStyle(el);
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && !el.closest(".scan-strip, .microprint, .words, [aria-hidden=true], .sr-only"))
          out.clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${el.textContent.trim().slice(0, 30)}"`);
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && !el.closest(".scan-strip, .table-wrap, nav.main, pre, .microprint, [aria-hidden=true]")) out.clipped.push(`off-screen ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
      }
      // Overlapping text blocks (leaf elements with their own text).
      const leaves = [...document.querySelectorAll("body *")].filter((el) => {
        if (el.closest("[aria-hidden=true], .cursor-ring, .toasts, svg, .scan-strip, .stamp, .float-stamp, .foil, .cert-watermark, .story, .sr-only") || hiddenInClosedDetails(el)) return false;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const r = el.getBoundingClientRect();
        return own && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && parseFloat(getComputedStyle(el).opacity) > 0.1;
      });
      // Each text node's own line boxes, so wrapped inline text isn't one big box.
      const boxes = [];
      for (const el of leaves)
        for (const n of el.childNodes) {
          if (n.nodeType !== 3 || !n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push([el, r]);
        }
      for (let i = 0; i < boxes.length && out.overlaps.length < 12; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, ra] = boxes[i];
          const [b, rb] = boxes[j];
          if (a === b || a.contains(b) || b.contains(a)) continue;
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          // Glyph boxes include line-height padding; require real ink overlap.
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) - 0.25 * Math.min(ra.height, rb.height);
          if (w > 4 && h > 2) out.overlaps.push(`"${a.textContent.trim().slice(0, 24)}" over "${b.textContent.trim().slice(0, 24)}"`);
        }
      }
      // Touch targets under 24px (WCAG 2.2 minimum) on small screens.
      if (vw <= 420)
        for (const el of document.querySelectorAll("a[href], button, input, select, summary")) {
          if (hiddenInClosedDetails(el) || el.closest(".note")) continue; // inline links in a sentence are exempt (WCAG 2.5.8)
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && !el.closest("p, li, dd, .small, .risk, .sub, .cert-line, footer, .say")) out.tinyTargets.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      out.clipped = [...new Set(out.clipped)].slice(0, 10);
      out.tinyTargets = [...new Set(out.tinyTargets)].slice(0, 10);
      return out;
    });
    report.layout[`${path} @${width}`] = r;
    if (width === 375 || width === 1440) await page.screenshot({ path: `${OUT}/${slug(path)}-${width}.png`, fullPage: true });
    await ctx.close();
  }
}

// ---- 4. reduced motion: nothing keeps moving --------------------------------------
for (const path of PAGES) {
  const { ctx, page } = await open(DEV, path, { reducedMotion: "reduce" });
  report.reducedMotion[path] = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 600));
    const running = document.getAnimations().filter((a) => a.playState === "running");
    return {
      runningAnimations: running.length,
      examples: running.slice(0, 5).map((a) => `${a.animationName ?? a.constructor.name} on ${a.effect?.target?.className ?? "?"}`),
      customCursor: document.documentElement.classList.contains("has-cursor"),
      smoothScroll: document.documentElement.classList.contains("lenis"),
    };
  });
  await ctx.close();
}

// ---- 5. NEAR unreachable: every page says so plainly ------------------------------
for (const path of PAGES) {
  const { ctx, page } = await open(DEV, path, { offline: true, settle: 9000, scroll: false });
  report.offline[path] = await page.evaluate(() => {
    const text = document.querySelector("main")?.innerText ?? "";
    return {
      blank: text.trim().length < 40,
      stuckLoading: /Loading[^\n]*…\s*$/m.test(text) && !/unavailable|Can't reach|went wrong/i.test(text),
      says: (text.match(/[^\n]*(unavailable|Can't reach|went wrong|busy)[^\n]*/i) ?? [""])[0].slice(0, 160),
    };
  });
  await page.screenshot({ path: `${OUT}/offline-${slug(path)}.png`, fullPage: false });
  await ctx.close();
}

// ---- 6. copy rules and 7. metadata ----------------------------------------------------
const HYPE = /\b(revolutionary|seamless(ly)?|unlock|leverage|game[- ]changer|cutting[- ]edge|blazing|supercharge|empower|next[- ]gen|world[- ]class|best[- ]in[- ]class|disrupt\w*)\b/gi;
for (const path of PAGES) {
  const { ctx, page } = await open(DEV, path, { reducedMotion: "reduce" });
  const { text, title, desc, lang, h1s, imgsNoAlt } = await page.evaluate(() => ({
    text: document.body.innerText,
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    lang: document.documentElement.lang,
    h1s: document.querySelectorAll("h1").length,
    imgsNoAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
  }));
  writeFileSync(`${OUT}/text-${slug(path)}.txt`, text);
  report.copy[path] = {
    emDashes: (text.match(/—/g) ?? []).length,
    hype: [...new Set((text.match(HYPE) ?? []).map((w) => w.toLowerCase()))],
    jargon: [...new Set((text.match(/\b(evals?|chunks?|TEE|dispatch|commitment|yocto\w*)\b/g) ?? []))],
    doubleSpaces: (text.match(/[^\s] {2,}[^\s]/g) ?? []).length,
    emoji: (text.match(/\p{Extended_Pictographic}/gu) ?? []).length,
  };
  report.meta[path] = { title, desc: desc.slice(0, 60), lang, h1s, imgsNoAlt };
  await ctx.close();
}

// ---- 8. load metrics on the production build ---------------------------------------
for (const path of ["/", "/certificates/0", "/how"]) {
  for (const [label, width] of [["mobile", 390], ["desktop", 1440]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      window.__lcp = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
      window.__long = 0;
      new PerformanceObserver((l) => (window.__long += l.getEntries().length)).observe({ type: "longtask", buffered: true });
    });
    const t0 = Date.now();
    await page.goto(PROD + path, { waitUntil: "load" });
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(5000);
    report.metrics[`${path} ${label}`] = await page.evaluate((loadMs) => {
      const res = performance.getEntriesByType("resource");
      const js = res.filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
      return {
        loadMs,
        lcpMs: Math.round(window.__lcp),
        cls: Number(window.__cls.toFixed(3)),
        longTasks: window.__long,
        jsKB: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024),
        requests: res.length,
      };
    }, loadMs);
    await ctx.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

// ---- Summary ------------------------------------------------------------------------
const lines = [];
const axeAll = Object.entries(report.axe).flatMap(([k, v]) => v.map((x) => `${k}: ${x.impact} ${x.id} (${x.nodes}) ${x.targets[0] ?? ""}`));
lines.push(`axe violations: ${axeAll.length}`, ...axeAll.slice(0, 40).map((l) => "  " + l));
for (const [k, v] of Object.entries(report.keyboard)) lines.push(`keyboard ${k}: ${v.tabStops} tab stops / ${v.interactiveVisible} visible controls${v.problems.length ? "; " + v.problems.slice(0, 4).join("; ") : ""}`);
for (const [k, v] of Object.entries(report.layout)) if (v.overflow || v.clipped.length || v.overlaps.length || v.tinyTargets.length) lines.push(`layout ${k}: ${v.overflow ? "OVERFLOW " : ""}${v.clipped.length ? "clipped " + v.clipped.slice(0, 3).join(", ") + " " : ""}${v.overlaps.length ? "overlaps " + v.overlaps.slice(0, 3).join(", ") + " " : ""}${v.tinyTargets.length ? "small targets " + v.tinyTargets.slice(0, 3).join(", ") : ""}`);
for (const [k, v] of Object.entries(report.reducedMotion)) if (v.runningAnimations || v.customCursor || v.smoothScroll) lines.push(`reduced motion ${k}: ${v.runningAnimations} running (${v.examples.join(", ")}) cursor=${v.customCursor} lenis=${v.smoothScroll}`);
for (const [k, v] of Object.entries(report.offline)) lines.push(`offline ${k}: ${v.blank ? "BLANK " : ""}${v.stuckLoading ? "STUCK LOADING " : ""}says "${v.says}"`);
for (const [k, v] of Object.entries(report.copy)) if (v.emDashes || v.hype.length || v.jargon.length || v.doubleSpaces || v.emoji) lines.push(`copy ${k}: em-dashes ${v.emDashes}, hype ${v.hype.join("/") || "-"}, jargon ${v.jargon.join("/") || "-"}, double spaces ${v.doubleSpaces}, emoji ${v.emoji}`);
for (const [k, v] of Object.entries(report.meta)) lines.push(`meta ${k}: title "${v.title}", lang ${v.lang || "MISSING"}, h1 ${v.h1s}, img without alt ${v.imgsNoAlt}`);
for (const [k, v] of Object.entries(report.metrics)) lines.push(`metrics ${k}: load ${v.loadMs}ms, LCP ${v.lcpMs}ms, CLS ${v.cls}, long tasks ${v.longTasks}, JS ${v.jsKB}KB, ${v.requests} requests`);
writeFileSync(`${OUT}/summary.txt`, lines.join("\n"));
console.log(lines.join("\n"));
