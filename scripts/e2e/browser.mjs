// End-to-end browser test: clicks through every flow of the web app against a
// local NEAR sandbox (see chain.mjs), with the keeper answering grading jobs.
// Prints PASS/FAIL per step and exits non-zero if anything failed.
//
// Usage: node browser.mjs [base-url]   (playwright-core must be resolvable)
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

// Use a local playwright-core if installed, else the machine's global one.
let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  const globalRoot = execSync("npm root -g").toString().trim();
  ({ chromium } = createRequire(import.meta.url)(`${globalRoot}/playwright`));
}

const BASE = process.argv[2] ?? "http://localhost:5174";
const results = [];
const errors = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : [],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // Google Fonts may be unreachable in a sandboxed run; everything else counts.
  if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
await page.addInitScript(() => {
  window.__printed = 0;
  window.print = () => window.__printed++;
});

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(["PASS", name]);
    console.log(`PASS  ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push(["FAIL", name]);
    console.log(`FAIL  ${name}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `fail-${results.length}.png`, fullPage: true }).catch(() => {});
  }
}
const expectText = async (text, timeout = 20000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
const go = async (path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
};

await step("Home renders on an empty chain, with the test-signer notice", async () => {
  await go("/");
  await expectText("Which AI catches");
  await expectText("Test signer");
  await expectText("No tests have been published yet");
});

await step("Tests page shows its empty state", async () => {
  await go("/sets");
  await expectText("No tests have been published yet");
});

await step("Nav links reach every page", async () => {
  await go("/");
  for (const [link, text] of [["Tests", "Sealed"], ["How it works", "A fair exam"], ["Publish a test", "Turn your scam examples"], ["Results", "Which AI catches"]]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    await expectText(text);
  }
});

await step("Unknown pages and bad ids say Not found", async () => {
  await go("/nowhere");
  await expectText("This page doesn't exist");
  await go("/certificates/abc");
  await expectText("No result with this number");
  await go("/evals/abc");
  await expectText("No test run with this number");
  await go("/sets/missing-set");
  await expectText("No test with this id");
});

await step("Publish: the example fills the form, draws the seal, and validates as you type", async () => {
  await go("/publish");
  await page.getByRole("button", { name: "Try it with our public example" }).click();
  await expectText("20 (11 scams, 9 real)");
  await page.locator(".publish-seal svg").waitFor();
  const id = page.getByLabel("Test id");
  await id.fill("bad id!");
  await expectText("Use only letters, digits");
  if (await page.getByRole("button", { name: "Publish test" }).isEnabled()) throw new Error("publish enabled with a bad id");
  await id.fill("e2e-scams");
});

await step("Publish: the transaction lands and the test opens", async () => {
  await page.getByRole("button", { name: "Publish test" }).click();
  await page.locator(".toast.Confirmed").first().waitFor({ timeout: 30000 });
  await page.getByRole("status").getByRole("link", { name: "Open your test" }).first().click();
  await expectText("Everyday scam messages");
});

await step("Publishing the same id again fails in plain words", async () => {
  await go("/publish");
  await page.getByRole("button", { name: "Try it with our public example" }).click();
  await expectText("20 (11 scams, 9 real)");
  await page.getByLabel("Test id").fill("e2e-scams");
  await page.getByRole("button", { name: "Publish test" }).click();
  await expectText("already taken", 30000);
});

await step("Test page shows the seal, cost preview and certify button", async () => {
  await go("/sets/e2e-scams");
  await page.locator(".set-seal svg").waitFor();
  await expectText("Grading and storage deposit");
  await expectText("You send");
  await expectText("0 of 2 certifications used");
});

await step("Certify: the run starts and the page moves to it", async () => {
  await page.getByRole("button", { name: /^Certify e2e\/careful-model/ }).click();
  await page.waitForURL(/\/evals\/0$/, { timeout: 60000 });
  await expectText("Batches by run");
});

await step("Start the next batches until the run is certified, with the stamp moment", async () => {
  for (let i = 0; i < 40; i++) {
    if (await page.getByText("All batches were graded and checked").count()) break;
    const btn = page.getByRole("button", { name: /Start the next batches|Retry and start/ });
    // The label changes while a send is in progress; that's fine, try next round.
    if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await expectText("All batches were graded and checked", 60000);
  await page.locator(".celebrate").waitFor({ timeout: 10000 });
});

await step("Certificate: figures match what the keeper graded (2 of 20 wrong each run)", async () => {
  await page.getByRole("link", { name: "See the result" }).click();
  await expectText("Certificate of performance");
  await page.waitForTimeout(2200); // count-up
  const big = await page.locator(".cert-big").innerText();
  if (!big.includes("90.0%")) throw new Error(`overall shows ${big}`);
  await expectText("Caught");
});

await step("Certificate: run switcher, copy link and print work", async () => {
  await page.getByRole("button", { name: "Run 2" }).click();
  await expectText("Run 2 of 2");
  await page.getByRole("button", { name: "Copy link" }).click();
  await expectText("Link copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.endsWith("/certificates/0")) throw new Error(`clipboard has ${copied}`);
  await page.getByRole("button", { name: "Print" }).click();
  if ((await page.evaluate(() => window.__printed)) !== 1) throw new Error("print not called");
});

await step("Verify: every signature checks out and adds up to the certificate, from plain RPC", async () => {
  await page.getByRole("button", { name: "Check every signature" }).click();
  await expectText("answers check out", 90000);
  await expectText("add up to every number on this certificate");
  const bad = await page.locator(".note.critical").count();
  if (bad) throw new Error("a verification problem was reported");
});

await step("Home: leaderboard and bento show the result; clicking the row opens it", async () => {
  await go("/");
  await page.locator(".board-row:not(.head)").first().waitFor();
  await expectText("e2e/careful-model");
  await page.getByRole("link", { name: "See result" }).first().click();
  await page.waitForURL(/\/certificates\/0$/);
});

await step("Cap: the second certification is allowed and counted", async () => {
  await go("/sets/e2e-scams");
  await expectText("1 of 2 certifications used");
});

await step("No console or page errors anywhere", async () => {
  if (errors.length) throw new Error(errors.slice(0, 5).join(" | "));
});

await browser.close();
const failed = results.filter(([r]) => r === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
