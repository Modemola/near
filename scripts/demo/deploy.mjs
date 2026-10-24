// Deploy a DEMO Proctor on testnet wired to the mock OutLayer, register two
// simulated models and the public 20-item sample, and request evals.
//
// Usage: node deploy.mjs <root-account.testnet>
//
// Everything here is labelled as a demo: models are "demo/...", the set title
// says the grader is simulated, and the web app shows a banner for any
// deployment whose OutLayer is not the real one.
import { readFileSync, writeFileSync } from "node:fs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import {
  accountExists, call, loadAccount, newKeyPair, saveKey, setCommitment, sleep, view,
} from "./lib.mjs";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const root = process.argv[2];
if (!root) throw new Error("usage: node deploy.mjs <root-account.testnet>");
const here = new URL(".", import.meta.url);
const PROCTOR = `proctor-demo.${root}`;
const OUTLAYER = `outlayer-mock.${root}`;
const NEAR = 10n ** 24n;

const rootAccount = loadAccount(root);

async function ensureSubAccount(id, near) {
  if (await accountExists(id)) return loadAccount(id);
  const kp = newKeyPair();
  await rootAccount.createSubAccount({ accountOrPrefix: id, publicKey: kp.getPublicKey(), nearToTransfer: near });
  saveKey(id, kp);
  console.log("created", id);
  return loadAccount(id);
}

const outlayer = await ensureSubAccount(OUTLAYER, 2n * NEAR);
const proctor = await ensureSubAccount(PROCTOR, 4n * NEAR);

const mockWasm = readFileSync(new URL("../../contract/target/near/mock_outlayer/mock_outlayer.wasm", here));
const proctorWasm = readFileSync(new URL("../../contract/target/near/proctor.wasm", here));
const graderWasm = readFileSync(new URL("../../grader/target/wasm32-wasip2/release/proctor-grader.wasm", here));
const { createHash } = await import("node:crypto");
const graderHash = createHash("sha256").update(graderWasm).digest("hex");

const deployed = async (id) => (await rootAccount.provider.query({ request_type: "view_account", finality: "final", account_id: id })).code_hash !== "11111111111111111111111111111111";
if (!(await deployed(OUTLAYER))) {
  await outlayer.deployContract(mockWasm);
  await call(outlayer, OUTLAYER, "new", {}, { tgas: 30 });
  console.log("deployed mock OutLayer");
}
if (!(await deployed(PROCTOR))) {
  await proctor.deployContract(proctorWasm);
  await call(proctor, PROCTOR, "new", {
    owner: root,
    config: {
      outlayer: OUTLAYER,
      grader_url: "https://example.invalid/demo-grader-not-published.wasm",
      grader_hash: graderHash,
      sealed_api_key: "demo-simulated-grader",
      job_deposit: (10n ** 22n).toString(), // 0.01 NEAR
      max_execution_seconds: 180,
      runs_per_eval: 2,
      treasury: root,
      attester: root,
    },
  }, { tgas: 30 });
  console.log("deployed Proctor");
}
await sleep(3000);

// Simulated model keys: generated here, kept outside the repo.
const keysFile = new URL("./.demo-model-keys.json", here);
let keys;
try {
  keys = JSON.parse(readFileSync(keysFile, "utf8"));
} catch {
  keys = Object.fromEntries(["demo/careful-model", "demo/eager-model"].map((m) => [m, Buffer.from(ed.utils.randomPrivateKey()).toString("hex")]));
  writeFileSync(keysFile, JSON.stringify(keys), { mode: 0o600 });
}
for (const [model, priv] of Object.entries(keys)) {
  const pub = Buffer.from(ed.getPublicKey(Buffer.from(priv, "hex"))).toString("hex");
  if (!(await view(PROCTOR, "get_model", { model_id: model }))) {
    await call(rootAccount, PROCTOR, "register_model", { model_id: model, signers: [pub], attestation_report_sha256: "0".repeat(64) }, { tgas: 30 });
    console.log("registered", model);
  }
}

const sample = JSON.parse(readFileSync(new URL("../../data/public-sample/scam-sample.json", here), "utf8"));
const SET = "public-sample-demo";
if (!(await view(PROCTOR, "get_set", { set_id: SET }))) {
  await call(rootAccount, PROCTOR, "register_set", {
    set: {
      set_id: SET,
      title: "Public scam sample (demo, simulated grader)",
      description: "The 20 public sample messages, graded by a simulated grader with simulated models. Shows the flow; not a real certificate.",
      commitment: setCommitment(sample.items),
      item_count: sample.items.length,
      chunk_size: 5,
      max_tokens: 4000,
      price: (NEAR / 10n).toString(),
      author_bps: 7000,
      secrets_profile: "public-sample-demo",
      eval_cap_per_model: 3,
    },
  }, { deposit: NEAR / 10n, tgas: 30 });
  console.log("registered set", SET);
}
await sleep(3000);

for (const model of Object.keys(keys)) {
  if ((await view(PROCTOR, "evals_started", { set_id: SET, model_id: model })) > 0) continue;
  const quote = BigInt(await view(PROCTOR, "quote_eval", { set_id: SET }));
  await call(rootAccount, PROCTOR, "request_eval", { set_id: SET, model_id: model }, { deposit: quote + NEAR / 10n });
  console.log("requested eval for", model);
}
console.log(JSON.stringify({ proctor: PROCTOR, outlayer: OUTLAYER, set: SET }));
