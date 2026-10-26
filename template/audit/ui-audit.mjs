// UI audit for any built site. Per page: axe in light and dark mode,
// keyboard-only use, reduced motion, a backend outage, copy rules, metadata,
// load metrics, and whether pre-rendered pages attach without redrawing.
//
// Usage: node ui-audit.mjs <base-url> <out-dir>      (pages in audit.config.json)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config, launch, slug } from "./browser.mjs";

const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PAGES = config.pages;
const report = { axe: {}, keyboard: {}, reducedMotion: {}, outage: {}, copy: {}, meta: {}, metrics: {}, prerender: {} };
const browser = await launch();

async function open(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 }, colorScheme: opts.scheme ?? "light", reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  if (opts.outage && config.outage.how === "block") await page.route(new RegExp(config.outage.apiPattern), (r) => r.abort("connectionrefused"));
  const url = BASE + path + (opts.outage && config.outage.how === "query" ? config.outage.query : "");
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(opts.settle ?? 1500);
  if (opts.scroll !== false) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 350) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(700);
  }
  return { ctx, page };
}

// ---- 1. axe, light and dark ----------------------------------------------------------
for (const path of PAGES)
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open(path, { scheme, reducedMotion: "reduce" });
    await page.addScriptTag({ content: AXE });
    report.axe[`${path} ${scheme}`] = await page.evaluate(async () => {
      const res = await window.axe.run(document, { resultTypes: ["violations"] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0]?.target.join(" ") }));
    });
    await ctx.close();
  }

// ---- 2. keyboard: every visible control reachable by Tab, with a visible focus ---------
for (const path of PAGES) {
  const { ctx, page } = await open(path, { reducedMotion: "reduce" });
  const visited = [];
  const problems = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.setAttribute("data-tabbed", "1");
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return {
        tag: el.tagName.toLowerCase(),
        name,
        visibleFocus: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"),
        onScreen: r.width > 0 && r.height > 0,
        hidden: el.closest("[aria-hidden=true]") !== null,
      };
    });
    if (!info) break;
    const key = `${info.tag}:${info.name}`;
    if (visited.length && visited[0] === key && i > 3) break;
    visited.push(key);
    if (!info.visibleFocus) problems.push(`no visible focus on ${key}`);
    if (!info.onScreen) problems.push(`focus on an invisible element ${key}`);
    if (info.hidden) problems.push(`focus inside aria-hidden ${key}`);
    if (!info.name) problems.push(`unnamed control ${info.tag}`);
  }
  const unreachable = await page.evaluate(() =>
    [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const inClosed = e.closest("details:not([open])") && !e.matches("summary");
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[aria-hidden=true]") && !inClosed;
      })
      .filter((e) => !e.hasAttribute("data-tabbed"))
      .map((e) => `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}"`),
  );
  if (unreachable.length) problems.push(`not reachable by Tab: ${unreachable.join(", ")}`);
  report.keyboard[path] = { tabStops: visited.length, problems: [...new Set(problems)] };
  await ctx.close();
}

// ---- 3. reduced motion: nothing keeps moving -------------------------------------------
for (const path of PAGES) {
  const { ctx, page } = await open(path, { reducedMotion: "reduce" });
  report.reducedMotion[path] = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 600));
    const running = document.getAnimations().filter((a) => a.playState === "running");
    return {
      running: running.length,
      examples: running.slice(0, 4).map((a) => `${a.animationName ?? "transition"} on ${a.effect?.target?.className ?? "?"}`),
      customCursor: document.documentElement.classList.contains("has-cursor"),
      smoothScroll: document.documentElement.classList.contains("lenis"),
    };
  });
  await ctx.close();
}

// ---- 4. backend down: every page says so plainly, quickly, and keeps working -----------
for (const path of PAGES) {
  const { ctx, page } = await open(path, { outage: true, settle: 6000, scroll: false });
  report.outage[path] = await page.evaluate(() => {
    const text = document.querySelector("main")?.innerText ?? "";
    return {
      blank: text.trim().length < 40,
      stuckLoading: /Loading[^\n]*…\s*$/m.test(text) && !/unavailable|Can't reach|went wrong|busy/i.test(text),
      says: (text.match(/[^\n]*(unavailable|Can't reach|went wrong|busy)[^\n]*/i) ?? [""])[0].slice(0, 140),
    };
  });
  await page.screenshot({ path: `${OUT}/outage-${slug(path)}.png` });
  await ctx.close();
}

// ---- 5. copy rules and 6. metadata ----------------------------------------------------------
const HYPE = /\b(revolutionary|seamless(ly)?|unlock|leverage|game[- ]changer|cutting[- ]edge|blazing|supercharge|empower|next[- ]gen|world[- ]class|best[- ]in[- ]class|disrupt\w*)\b/gi;
const JARGON = new RegExp(`\\b(${config.jargon.join("|")})\\b`, "gi");
for (const path of PAGES) {
  const { ctx, page } = await open(path, { reducedMotion: "reduce" });
  const m = await page.evaluate(() => ({
    text: document.body.innerText,
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    lang: document.documentElement.lang,
    h1s: document.querySelectorAll("h1").length,
    imgsNoAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
  }));
  report.copy[path] = {
    emDashes: (m.text.match(/—/g) ?? []).length,
    hype: [...new Set((m.text.match(HYPE) ?? []).map((w) => w.toLowerCase()))],
    jargon: [...new Set((m.text.match(JARGON) ?? []).map((w) => w.toLowerCase()))],
    placeholders: (m.text.match(/\b(TODO|CHANGE|lorem ipsum)\b/gi) ?? []).length,
  };
  report.meta[path] = { title: m.title, desc: m.desc.slice(0, 60), lang: m.lang, h1s: m.h1s, imgsNoAlt: m.imgsNoAlt };
  await ctx.close();
}

// ---- 7. load metrics: layout shift and largest paint --------------------------------------
for (const path of config.lighthouse)
  for (const [label, width] of [["phone", 390], ["desktop", 1440]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      window.__lcp = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    report.metrics[`${path} ${label}`] = await page.evaluate(() => ({ lcpMs: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(3)) }));
    await ctx.close();
  }

// ---- 8. pre-rendered pages: React attaches to the HTML instead of redrawing it ------------
for (const motion of ["no-preference", "reduce"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: motion });
  await ctx.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      window.__firstH1 = document.querySelector("#root h1");
      window.__pre = !!document.querySelector("#root")?.firstElementChild;
    }),
  );
  for (const path of config.prerendered) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 100)));
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    report.prerender[`${path} motion ${motion}`] = {
      ...(await page.evaluate(() => ({
        prerendered: window.__pre,
        reused: window.__firstH1 ? window.__firstH1 === document.querySelector("#root h1") : null,
        hydrationErrors: (window.__hydrationErrors ?? []).length,
      }))),
      errors,
    };
    await page.close();
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/ui-audit.json`, JSON.stringify(report, null, 2));

// ---- Summary: one line per problem; "clean" lines only where it's useful to see them --------
const lines = [];
const axe = Object.entries(report.axe).flatMap(([k, v]) => v.map((x) => `${k}: ${x.impact} ${x.id} (${x.nodes}) ${x.target ?? ""}`));
lines.push(`axe violations: ${axe.length}`, ...axe.slice(0, 30).map((l) => "  " + l));
for (const [k, v] of Object.entries(report.keyboard)) lines.push(`keyboard ${k}: ${v.tabStops} tab stops${v.problems.length ? "; " + v.problems.slice(0, 4).join("; ") : ", all reachable"}`);
for (const [k, v] of Object.entries(report.reducedMotion)) if (v.running || v.customCursor || v.smoothScroll) lines.push(`reduced motion ${k}: ${v.running} still running (${v.examples.join(", ")}) cursor=${v.customCursor} smooth=${v.smoothScroll}`);
for (const [k, v] of Object.entries(report.outage)) lines.push(`outage ${k}: ${v.blank ? "BLANK " : ""}${v.stuckLoading ? "STUCK LOADING " : ""}${v.says ? `says "${v.says}"` : "(no data needed)"}`);
for (const [k, v] of Object.entries(report.copy)) if (v.emDashes || v.hype.length || v.jargon.length || v.placeholders) lines.push(`copy ${k}: em-dashes ${v.emDashes}, hype ${v.hype.join("/") || "-"}, jargon ${v.jargon.join("/") || "-"}, placeholders left ${v.placeholders}`);
for (const [k, v] of Object.entries(report.meta)) if (v.h1s !== 1 || !v.lang || v.imgsNoAlt || !v.desc) lines.push(`meta ${k}: title "${v.title}", lang ${v.lang || "MISSING"}, h1 ${v.h1s}, images without alt ${v.imgsNoAlt}, description ${v.desc ? "ok" : "MISSING"}`);
for (const [k, v] of Object.entries(report.metrics)) lines.push(`metrics ${k}: largest paint ${v.lcpMs} ms, layout shift ${v.cls}`);
for (const [k, v] of Object.entries(report.prerender)) lines.push(`prerender ${k}: ${v.prerendered ? "pre-rendered" : "NOT PRE-RENDERED"}${v.reused === false ? ", REDRAWN" : v.reused ? ", reused" : ""}, hydration errors ${v.hydrationErrors}${v.errors.length ? ", console: " + v.errors.join(" | ") : ""}`);
writeFileSync(`${OUT}/ui-audit.txt`, lines.join("\n"));
console.log(lines.join("\n"));
