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
// Usage: NEARAI_API_KEY=... node keeper-live.mjs <root-account.testnet> <set.json> [parallel]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { call, loadAccount, sleep, view } from "./lib.mjs";

const [root, setPath, parallel = "16"] = process.argv.slice(2);
const PROCTOR = `proctor-demo.${root}`;
const OUTLAYER = `outlayer-mock.${root}`;
const SET = "sealed-scams";
const GRADER = new URL("../../grader/target/release/examples/live", import.meta.url).pathname;
const TEST_SET = JSON.stringify(JSON.parse(readFileSync(setPath, "utf8")).items);
const keeper = loadAccount(root);
const working = new Map(); // request id -> eval id
const MAX = Number(parallel);

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
  await call(keeper, OUTLAYER, "resolve", { request_id: r.id, output }, { tgas: 100 }).catch((e) => console.log("resolve failed", r.id, String(e).slice(0, 160)));
  console.log(`request ${r.id} ${ok ? "graded" : "FAILED: " + JSON.parse(output).error} in ${Math.round((Date.now() - t0) / 1000)}s`);
  working.delete(r.id);
}

for (;;) {
  const requests = (await view(OUTLAYER, "list_requests")).filter((r) => !r.resolved && JSON.parse(r.input_data).set_id === SET);
  for (const r of requests) {
    if (working.has(r.id) || working.size >= MAX) continue;
    working.set(r.id, true);
    work(r);
  }
  const count = Number(await view(PROCTOR, "eval_count"));
  let running = 0;
  for (let id = 0; id < count; id++) {
    const ev = await view(PROCTOR, "get_eval", { eval_id: String(id) });
    if (ev.set_id !== SET) continue;
    const done = ev.chunks.filter((c) => c.state === "Done").length;
    if (ev.status !== "Running") continue;
    running++;
    const out = ev.chunks.filter((c) => c.state === "InFlight").length;
    const waiting = ev.chunks.filter((c) => c.state === "Pending" || (c.state === "Failed" && c.attempts < 3)).length;
    if (out === 0 && waiting > 0 && working.size < MAX) {
      await call(keeper, PROCTOR, "dispatch", { eval_id: String(id) }).catch((e) => console.log("dispatch failed", id, String(e).slice(0, 160)));
      console.log(`eval ${id} ${ev.model_id}: ${done}/${ev.chunks.length} batches done, started more`);
    }
  }
  if (running === 0 && working.size === 0) {
    console.log("all certifications on", SET, "finished");
    break;
  }
  await sleep(5000);
}
