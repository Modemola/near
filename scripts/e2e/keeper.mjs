// End-to-end keeper: plays OutLayer's worker for the mock OutLayer, answering
// each grading job the way the grader would (signed with the test model key).
// It gets 2 of the public sample's 20 messages wrong, so the score isn't 100%.
//
// Usage: node keeper.mjs <out.json from chain.mjs>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { Account, JsonRpcProvider } from "near-api-js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const env = JSON.parse(readFileSync(process.argv[2], "utf8"));
const provider = new JsonRpcProvider({ url: "http://127.0.0.1:3030" });
const keeper = new Account(env.keeper.id, provider, env.keeper.key);
const sample = JSON.parse(readFileSync(new URL("../../data/public-sample/scam-sample.json", import.meta.url), "utf8")).items;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const commitment = sha(Buffer.from(JSON.stringify(sample.map((i) => ({ id: i.id, channel: i.channel, from: i.from, text: i.text, label: i.label }))), "utf8"));
const priv = Buffer.from(env.modelKey, "hex");
const WRONG = new Set(["pub-03", "pub-12"]);

function output(job) {
  const items = sample.slice(job.chunk * job.chunk_size, (job.chunk + 1) * job.chunk_size);
  const c = { tp: 0, fp: 0, tn: 0, fn_: 0, unparsed: 0 };
  const answers = items.map((it) => {
    const said = WRONG.has(it.id) ? (it.label === "SCAM" ? "LEGIT" : "SCAM") : it.label;
    if (it.label === "SCAM") said === "SCAM" ? c.tp++ : c.fn_++;
    else said === "LEGIT" ? c.tn++ : c.fp++;
    const text = `${job.model}:${sha(`${job.nonce}|${it.id}`)}:${sha(`${said}|${it.id}`)}`;
    return { text, signature: Buffer.from(ed.sign(Buffer.from(text), priv)).toString("hex") };
  });
  return JSON.stringify({
    success: true, error: null,
    output: {
      set_id: job.set_id, model: job.model, chunk: job.chunk, nonce: job.nonce, set_commitment: commitment,
      n: items.length, confusion: c, signer: Buffer.from(ed.getPublicKey(priv)).toString("hex"),
      answers, records_digest: sha(answers.map((a) => a.signature).join("")),
    },
  });
}

async function view(method) {
  const r = await provider.query({ request_type: "call_function", finality: "optimistic", account_id: env.outlayer, method_name: method, args_base64: "e30=" });
  return JSON.parse(Buffer.from(r.result).toString());
}

for (;;) {
  try {
    for (const r of (await view("list_requests")).filter((q) => !q.resolved)) {
      await keeper.callFunction({ contractId: env.outlayer, methodName: "resolve", args: { request_id: r.id, output: output(JSON.parse(r.input_data)) }, gas: 100n * 10n ** 12n });
      console.log("resolved request", r.id);
    }
  } catch (e) {
    console.log("keeper:", e.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
