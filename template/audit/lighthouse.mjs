// Lighthouse (phone and desktop) for the pages in audit.config.json.
// Usage: node lighthouse.mjs <base-url> <out-dir>
import { mkdirSync, writeFileSync } from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktop from "lighthouse/core/config/desktop-config.js";
import { config, slug } from "./browser.mjs";

const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME || undefined,
  chromeFlags: ["--headless=new", "--no-sandbox", "--proxy-bypass-list=localhost;127.0.0.1", ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [])],
});
const lines = [];
for (const path of config.lighthouse)
  for (const [label, cfg] of [["phone", undefined], ["desktop", desktop]]) {
    const r = await lighthouse(BASE + path, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, cfg);
    const c = r.lhr.categories;
    const score = (k) => Math.round((c[k]?.score ?? 0) * 100);
    const a = r.lhr.audits;
    lines.push(`lighthouse ${path} ${label}: performance ${score("performance")}, accessibility ${score("accessibility")}, best practices ${score("best-practices")}, SEO ${score("seo")} (first paint ${a["first-contentful-paint"].displayValue}, largest ${a["largest-contentful-paint"].displayValue}, shift ${a["cumulative-layout-shift"].displayValue})`);
    writeFileSync(`${OUT}/lighthouse-${slug(path)}-${label}.json`, JSON.stringify(r.lhr.audits));
  }
await chrome.kill();
writeFileSync(`${OUT}/lighthouse.txt`, lines.join("\n"));
console.log(lines.join("\n"));
