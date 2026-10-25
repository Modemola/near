// Lighthouse scores for the production build. Usage: node lighthouse.mjs <base> <out-dir>
import { writeFileSync } from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktop from "lighthouse/core/config/desktop-config.js";

const [BASE, OUT] = process.argv.slice(2);
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  chromeFlags: ["--headless=new", "--no-sandbox", "--proxy-bypass-list=localhost;127.0.0.1", ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [])],
});
const lines = [];
for (const path of ["/", "/certificates/0", "/publish"]) {
  for (const [label, config] of [["mobile", undefined], ["desktop", desktop]]) {
    const r = await lighthouse(BASE + path, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, config);
    const c = r.lhr.categories;
    const score = (k) => Math.round((c[k]?.score ?? 0) * 100);
    const failing = Object.values(r.lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "manual" && a.scoreDisplayMode !== "notApplicable").map((a) => a.id);
    lines.push(`lighthouse ${path} ${label}: performance ${score("performance")}, accessibility ${score("accessibility")}, best practices ${score("best-practices")}, SEO ${score("seo")}; below 90: ${failing.slice(0, 12).join(", ") || "none"}`);
    writeFileSync(`${OUT}/lighthouse-${path === "/" ? "home" : path.slice(1).replace(/\//g, "_")}-${label}.json`, JSON.stringify(r.lhr.audits, null, 1));
  }
}
await chrome.kill();
writeFileSync(`${OUT}/lighthouse.txt`, lines.join("\n"));
console.log(lines.join("\n"));
