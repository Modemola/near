// Live keeper: plays OutLayer's worker for the sealed test's batches by
// running the real grader (grader/examples/live.rs in --job mode: the same
// library as the WASI build, with curl for HTTP) against the real NEAR AI
// models, and returning its output unchanged. Requests for other sets are
// left to keeper.mjs.
//
// The contract retries a batch that has been out for 500 blocks, so new
// batches start for a run only when none of its batches are still out, and
// batches are small (10 messages).
//
// Usage: NEARAI_API_KEY=... [PAUSED_MODELS=a,b] node keeper-live.mjs <root-account.testnet> <set.json> [parallel]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { call, loadAccount, provider, sleep, view } from "./lib.mjs";

const [root, setPath, parallel = "16"] = process.argv.slice(2);
const PROCTOR = `proctor-demo.${root}`;
const OUTLAYER = `outlayer-mock.${root}`;
const SET = "sealed-scams";
const GRADER = new URL("../../grader/target/release/examples/live", import.meta.url).pathname;
const TEST_SET = JSON.stringify(JSON.parse(readFileSync(setPath, "utf8")).items);
const keeper = loadAccount(root);
const working = new Map(); // request id -> eval id
// Models whose provider is failing right now: leave their runs untouched, so
// their retries aren't spent, and resume them later.
const PAUSED = new Set((process.env.PAUSED_MODELS ?? "").split(",").filter(Boolean));
const MAX = Number(parallel);
// Transactions go out one at a time: NEAR checks each one's gas against a
// pessimistic price (up to 10x), so many in flight at once can tie up the
// whole balance even though nearly all of it is refunded.
let txQueue = Promise.resolve();
const tx = (fn) => (txQueue = txQueue.then(fn, fn));

function grade(input) {
  return new Promise((resolve) => {
    const child = spawn(GRADER, ["--job"], { env: { ...process.env, TEST_SET } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", () => {});
    child.on("close", () => resolve(out || JSON.stringify({ success: false, output: null, error: "grader produced no output" })));
    child.stdin.end(input);
  });
}

async function work(r) {
  const t0 = Date.now();
  const output = await grade(r.input_data);
  const ok = JSON.parse(output).success;
  // Resolving only resumes a yield whose gas was reserved when it was created.
  await tx(() => call(keeper, OUTLAYER, "resolve", { request_id: r.id, output }, { tgas: 30 })).catch((e) => console.log("resolve failed", r.id, String(e).slice(0, 160)));
  console.log(`request ${r.id} ${ok ? "graded" : "FAILED: " + JSON.parse(output).error} in ${Math.round((Date.now() - t0) / 1000)}s`);
  working.delete(r.id);
}

// A request is worth grading only while the contract still waits for it: its
// batch is in flight and was sent less than ~180 blocks ago (a yield is
// abandoned after about 200). Older open requests are dead: the contract has
// marked those batches failed or will, and sends them again.
async function live(r, evals, head) {
  const job = JSON.parse(r.input_data);
  const ev = evals.find((e) => e.model_id === job.model && e.nonces.includes(job.nonce));
  if (!ev) return false;
  const c = ev.chunks[ev.nonces.indexOf(job.nonce) * ev.chunks_per_run + job.chunk];
  return c?.state === "InFlight" && head - Number(c.since) < 180;
}

async function round() {
  const count = Number(await view(PROCTOR, "eval_count"));
  const evals = [];
  for (let id = 0; id < count; id++) {
    const ev = await view(PROCTOR, "get_eval", { eval_id: String(id) });
    if (ev.set_id === SET) evals.push(ev);
  }
  const head = (await provider.viewBlock({ finality: "final" })).header.height;
  const requests = (await view(OUTLAYER, "list_requests")).filter((r) => !r.resolved && JSON.parse(r.input_data).set_id === SET);
  for (const r of requests) {
    if (working.has(r.id) || working.size >= MAX || !(await live(r, evals, head))) continue;
    working.set(r.id, true);
    work(r);
  }
  let running = 0;
  for (const ev of evals) {
    const id = ev.id;
    const done = ev.chunks.filter((c) => c.state === "Done").length;
    if (ev.status !== "Running" || PAUSED.has(ev.model_id)) continue;
    running++;
    const out = ev.chunks.filter((c) => c.state === "InFlight").length;
    const waiting = ev.chunks.filter((c) => c.state === "Pending" || (c.state === "Failed" && c.attempts < 3)).length;
    if (out === 0 && waiting > 0 && working.size < MAX) {
      // Each dispatch starts about 2 batches (its gas allows no more), so
      // start a few rounds at once; all of them are graded in parallel.
      for (let k = 0; k < Math.min(3, Math.ceil(waiting / 2)); k++)
        await tx(() => call(keeper, PROCTOR, "dispatch", { eval_id: String(id) })).catch((e) => console.log("dispatch failed", id, String(e).slice(0, 160)));
      console.log(`eval ${id} ${ev.model_id}: ${done}/${ev.chunks.length} batches done, started more`);
    }
  }
  return running === 0 && working.size === 0;
}

// A busy RPC node (HTTP 429) or a dropped connection must not stop grading:
// wait and try again.
for (let pause = 5000; ; ) {
  try {
    if (await round()) {
      console.log("all certifications on", SET, "finished", PAUSED.size ? `(paused: ${[...PAUSED].join(", ")})` : "");
      break;
    }
    pause = 5000;
  } catch (e) {
    pause = Math.min(60000, pause * 2);
    console.log("RPC trouble, retrying in", pause / 1000, "s:", String(e).split("\n")[0].slice(0, 120));
  }
  await sleep(pause);
}
