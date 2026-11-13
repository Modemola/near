// Real certifications on the testnet deployment: registers NEAR AI models
// that sign their answers in NEAR's TEE format, with the signing keys taken
// from their attestation reports, registers a sealed test by its fingerprint
// only, and requests one certification per model. The keeper-live script then
// grades every batch with the real grader against the real models.
//
// The one thing still simulated: the grader runs on the operator's machine,
// called through the mock OutLayer, instead of inside OutLayer's TDX enclave.
//
// Usage: node setup-live.mjs <root-account.testnet> <set.json> <signers.json>
//   set.json:     {"items": [...]}   (never committed; only its hash goes on-chain)
//   signers.json: {"<model>": {"signer": "<hex>", "attestation_report_sha256": "<hex>"}}
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { call, loadAccount, setCommitment, sleep, view } from "./lib.mjs";

const [root, setPath, signersPath] = process.argv.slice(2);
if (!signersPath) throw new Error("usage: node setup-live.mjs <root-account.testnet> <set.json> <signers.json>");
const PROCTOR = `proctor-demo.${root}`;
const SET = "sealed-scams";
const NEAR = 10n ** 24n;
const rootAccount = loadAccount(root);
const items = JSON.parse(readFileSync(setPath, "utf8")).items;
const signers = JSON.parse(readFileSync(signersPath, "utf8"));
const graderHash = createHash("sha256")
  .update(readFileSync(new URL("../../grader/target/wasm32-wasip2/release/proctor-grader.wasm", import.meta.url)))
  .digest("hex");

// Three runs per certification, as designed; a small per-job deposit, since
// the escrow reserves one for every retry and the mock OutLayer keeps none.
const config = await view(PROCTOR, "get_config");
const wanted = { ...config, grader_hash: graderHash, runs_per_eval: 3, job_deposit: (NEAR / 1000n).toString() };
if (JSON.stringify(wanted) !== JSON.stringify(config)) {
  await call(rootAccount, PROCTOR, "set_config", { config: wanted }, { tgas: 30 });
  console.log("config: 3 runs per certification, grader hash", graderHash.slice(0, 12));
}

for (const [model, { signer, attestation_report_sha256 }] of Object.entries(signers)) {
  if (!(await view(PROCTOR, "get_model", { model_id: model }))) {
    await call(rootAccount, PROCTOR, "register_model", { model_id: model, signers: [signer], attestation_report_sha256 }, { tgas: 30 });
    console.log("registered", model, signer.slice(0, 12));
  }
}

if (!(await view(PROCTOR, "get_set", { set_id: SET }))) {
  await call(rootAccount, PROCTOR, "register_set", {
    set: {
      set_id: SET,
      title: "Everyday scam messages (sealed)",
      description: `${items.length} realistic texts, emails and chat messages, about half of them scams, across 12 kinds of fraud. Sealed: only its fingerprint is public. Graded with real NEAR AI models in secure hardware; on this testnet deployment the grader itself runs outside OutLayer's enclave.`,
      commitment: setCommitment(items),
      item_count: items.length,
      chunk_size: 10,
      max_tokens: 4000,
      price: (NEAR / 100n).toString(),
      author_bps: 7000,
      secrets_profile: SET,
      eval_cap_per_model: 2,
    },
  }, { deposit: NEAR / 10n, tgas: 30 });
  console.log("registered set", SET, "fingerprint", setCommitment(items).slice(0, 12));
}
await sleep(3000);

for (const model of Object.keys(signers)) {
  if ((await view(PROCTOR, "evals_started", { set_id: SET, model_id: model })) > 0) continue;
  const quote = BigInt(await view(PROCTOR, "quote_eval", { set_id: SET }));
  // Headroom over the quote, as keeper.mjs uses; the contract refunds the rest.
  await call(rootAccount, PROCTOR, "request_eval", { set_id: SET, model_id: model }, { deposit: quote + NEAR / 10n });
  console.log("requested certification for", model, `(${Number(quote) / 1e24} NEAR)`);
}
