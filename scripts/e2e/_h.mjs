import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const rm of ["no-preference", "reduce"]) for (const [w,h] of [[390,844],[1366,768],[844,390]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, reducedMotion: rm });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { window.__firstH1 = document.querySelector("#root h1"); window.__preHTML = !!document.querySelector("#root")?.firstElementChild; }));
  for (const path of ["/", "/how", "/sets", "/publish", "/certificates/0", "/nowhere"]) {
    const p = await ctx.newPage(); const errs = [];
    p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120))); p.on("pageerror", (e) => errs.push(String(e).slice(0,120)));
    await p.goto("http://localhost:5176" + path, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ pre: window.__preHTML, same: window.__firstH1 ? window.__firstH1 === document.querySelector("#root h1") : null, hyd: window.__hydrationErrors ?? [], h1: document.querySelector("#root h1")?.textContent.slice(0, 40) }));
    console.log(rm.slice(0,6), w, path.padEnd(16), `prerendered=${r.pre} reused=${r.same} hydrationErrors=${r.hyd.length} h1="${r.h1}"`, errs.length ? "ERR " + errs.join(" | ") : "");
    if (r.hyd.length) console.log("   ", r.hyd[0].slice(0, 300));
    await p.close();
  }
  await ctx.close();
}
const nj = await (await b.newContext({ javaScriptEnabled: false })).newPage();
for (const path of ["/", "/how"]) { await nj.goto("http://localhost:5176" + path); console.log("no-JS", path, JSON.stringify((await nj.locator("#root").innerText()).slice(0, 160))); }
await b.close();
