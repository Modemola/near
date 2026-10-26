// Smoothness: frames per second while the page sits idle and while scrolling,
// at laptop size with a mouse. Load-time scores (Lighthouse) don't measure
// this, and it's what people feel: below about 50 fps, motion looks choppy.
// Flags any page under 50 fps idle or 40 fps scrolling.
//
// Usage: node smoothness.mjs <base-url> <out-dir>
// Headless Chromium draws in software, so real machines with a graphics card
// do better; a page that passes here is smooth almost anywhere.
import { mkdirSync, writeFileSync } from "node:fs";
import { config, launch } from "./browser.mjs";

const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const count = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        let long = 0;
        let last = performance.now();
        const t0 = last;
        const tick = (t) => {
          n++;
          if (t - last > 34) long++;
          last = t;
          if (t - t0 < 4000) requestAnimationFrame(tick);
          else done({ fps: Math.round(n / 4), long });
        };
        requestAnimationFrame(tick);
      }),
  );
const lines = [];
for (const path of config.pages) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.mouse.move(600, 400);
  await page.waitForTimeout(5000);
  const idle = await count(page);
  const during = count(page);
  for (let i = 0; i < 36; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  const scroll = await during;
  const flag = idle.fps < 50 || scroll.fps < 40 ? "  CHOPPY" : "";
  lines.push(`smoothness ${path}: idle ${idle.fps} fps (${idle.long} long frames), scrolling ${scroll.fps} fps (${scroll.long} long frames)${flag}`);
  await page.context().close();
}
await browser.close();
writeFileSync(`${OUT}/smoothness.txt`, lines.join("\n"));
console.log(lines.join("\n"));
console.log(lines.some((l) => l.includes("CHOPPY")) ? "\nSome pages are choppy: look for endless animations behind live blurs (backdrop-filter, filter: blur), loops that never stop, and style values set on <html> while scrolling." : "\nAll pages smooth.");
