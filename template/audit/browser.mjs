// Shared: launch Chromium through Playwright (local package or global install).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(`${execSync("npm root -g").toString().trim()}/playwright`);
}

export const config = JSON.parse(readFileSync(new URL("./audit.config.json", import.meta.url), "utf8"));

/** CHROME=/path/to/chrome to use a specific browser; otherwise Playwright's own. */
export const launch = () =>
  pw.chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : [],
  });

export const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/[/?]/g, "_"));
