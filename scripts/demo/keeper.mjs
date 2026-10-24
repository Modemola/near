// Demo keeper: plays OutLayer's worker for the mock OutLayer (a SIMULATED
// grader with simulated model answers), and calls `dispatch` until every eval
// is finished.
//
// Usage: node keeper.mjs <root-account.testnet>
import { readFileSync } from "node:fs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { call, loadAccount, setCommitment, sha256Hex, sleep, view } from "./lib.mjs";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const root = process.argv[2];
const PROCTOR = `proctor-demo.${root}`;
const OUTLAYER = `outlayer-mock.${root}`;
const here = new URL(".", import.meta.url);
const keys = JSON.parse(readFileSync(new URL("./.demo-model-keys.json", here), "utf8"));
const sample = JSON.parse(readFileSync(new URL("../../data/public-sample/scam-sample.json", here), "utf8")).items;
const commitment = setCommitment(sample);
const keeper = loadAccount(root);

// Simulated behaviour, loosely based on what real TEE models did on this
// sample: the careful model cries wolf on genuine look-alikes, the eager one
// misses subtle scams.
const SIMULATED_WRONG = {
  "demo/careful-model": new Set(["pub-12", "pub-13"]),
  "demo/eager-model": new Set(["pub-06", "pub-07", "pub-03"]),
};

function graderOutput(job) {
  const items = sample.slice(job.chunk * job.chunk_size, (job.chunk + 1) * job.chunk_size);
  const priv = Buffer.from(keys[job.model], "hex");
  const c = { tp: 0, fp: 0, tn: 0, fn_: 0, unparsed: 0 };
  const answers = items.map((it) => {
    const wrong = SIMULATED_WRONG[job.model].has(it.id);
    const said = wrong ? (it.label === "SCAM" ? "LEGIT" : "SCAM") : it.label;
    if (it.label === "SCAM") said === "SCAM" ? c.tp++ : c.fn_++;
    else said === "LEGIT" ? c.tn++ : c.fp++;
    const text = `${job.model}:${sha256Hex(`${job.nonce}|${it.id}`)}:${sha256Hex(`${said}|${it.id}`)}`;
    return { text, signature: Buffer.from(ed.sign(Buffer.from(text), priv)).toString("hex") };
  });
  return JSON.stringify({
    success: true,
    error: null,
    output: {
      set_id: job.set_id, model: job.model, chunk: job.chunk, nonce: job.nonce, set_commitment: commitment,
      n: items.length, confusion: c, signer: Buffer.from(ed.getPublicKey(priv)).toString("hex"),
      attestation_report_sha256: "0".repeat(64), answers, records_digest: sha256Hex(answers.map((a) => a.signature).join("")),
    },
  });
}

for (let round = 0; round < 200; round++) {
  const requests = (await view(OUTLAYER, "list_requests")).filter((r) => !r.resolved);
  for (const r of requests) {
    await call(keeper, OUTLAYER, "resolve", { request_id: r.id, output: graderOutput(JSON.parse(r.input_data)) }, { tgas: 100 });
    console.log("resolved request", r.id);
  }
  const count = Number(await view(PROCTOR, "eval_count"));
  let running = 0;
  for (let id = 0; id < count; id++) {
    const ev = await view(PROCTOR, "get_eval", { eval_id: String(id) });
    if (ev.status !== "Running") continue;
    running++;
    const waiting = ev.chunks.filter((c) => c.state === "Pending" || (c.state === "Failed" && c.attempts < 3)).length;
    if (waiting > 0) {
      await call(keeper, PROCTOR, "dispatch", { eval_id: String(id) });
      console.log(`dispatched eval ${id} (${waiting} waiting)`);
    }
  }
  if (running === 0 && requests.length === 0) {
    console.log("all evals finished");
    break;
  }
  await sleep(4000);
}
