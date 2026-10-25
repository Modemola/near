// Writes real HTML for the pages that need no chain data before their first
// render, so phones draw them before the JavaScript arrives. Runs after
// `vite build`: node scripts/prerender.mjs [--mode <mode>] [--outDir <dir>]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const mode = arg("mode", "production");
const outDir = resolve(arg("outDir", "dist"));
// Inside the project, so the server build can import its packages.
const ssrDir = resolve("node_modules/.cache/proctor-ssr");

await build({ mode, logLevel: "warn", build: { ssr: "src/entry-server.tsx", outDir: ssrDir, emptyOutDir: true, sourcemap: false } });
const { render, PRERENDERED } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);

const template = readFileSync(join(outDir, "index.html"), "utf8");
if (!template.includes('<div id="root"></div>')) throw new Error("index.html has no empty #root");
// Every other address still gets the plain app shell.
writeFileSync(join(outDir, "app.html"), template);

// React warns that layout effects don't run on the server; that's expected here.
const warn = console.error;
console.error = (msg, ...rest) => (String(msg).includes("useLayoutEffect does nothing on the server") ? undefined : warn(msg, ...rest));

for (const [path, title] of Object.entries(PRERENDERED)) {
  const app = await render(path);
  // A host that falls back to this file for another address must not show
  // this page's HTML there: clear it before anything is drawn.
  const guard = `<script>(function(){var p=location.pathname.replace(/\\/+$/,"")||"/";if(p!==${JSON.stringify(path)})document.getElementById("root").innerHTML=""})()</script>`;
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('<div id="root"></div>', `<div id="root" data-prerendered>${app}</div>${guard}`);
  const file = path === "/" ? join(outDir, "index.html") : join(outDir, path.slice(1), "index.html");
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, html);
  console.log(`prerendered ${path} (${Math.round(app.length / 1024)} KB)`);
}
console.error = warn;
rmSync(ssrDir, { recursive: true, force: true });
