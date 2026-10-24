// End-to-end test setup: on a fresh local NEAR sandbox, create accounts, deploy
// the real Proctor contract and the mock OutLayer, register a test model, and
// write the web app's e2e settings. Keys are throwaway and local only.
//
// Usage: node chain.mjs <sandbox-home> <out.json>
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const [home, outFile] = process.argv.slice(2);
const RPC = "http://127.0.0.1:3030";
const provider = new JsonRpcProvider({ url: RPC });
const repo = new URL("../../", import.meta.url);
const NEAR = 10n ** 24n;

const vk = JSON.parse(readFileSync(`${home}/validator_key.json`, "utf8"));
const root = new Account(vk.account_id, provider, vk.secret_key);

async function sub(name, near) {
  const kp = KeyPair.fromRandom("ed25519");
  const id = `${name}.${vk.account_id}`;
  await root.createAccount({ newAccountId: id, publicKey: kp.getPublicKey(), nearToTransfer: BigInt(near) * NEAR });
  return { id, key: kp.toString(), account: new Account(id, provider, kp.toString()) };
}

const proctor = await sub("proctor", 50);
const outlayer = await sub("outlayer", 20);
const attester = await sub("attester", 10);
const treasury = await sub("treasury", 5);
const keeper = await sub("keeper", 20);
const alice = await sub("alice", 100);

await outlayer.account.deployContract(readFileSync(new URL("contract/target/near/mock_outlayer/mock_outlayer.wasm", repo)));
await outlayer.account.callFunction({ contractId: outlayer.id, methodName: "new", args: {} });
await proctor.account.deployContract(readFileSync(new URL("contract/target/near/proctor.wasm", repo)));
await proctor.account.callFunction({
  contractId: proctor.id,
  methodName: "new",
  args: {
    owner: proctor.id,
    config: {
      outlayer: outlayer.id,
      grader_url: "https://grader.example.com/proctor-grader.wasm",
      grader_hash: "bdd0f9f8d66f542c681528124e02786c2ee116b590b4266f5d42f1e61cc48200",
      sealed_api_key: "sealed-for-e2e",
      job_deposit: (10n ** 22n).toString(),
      max_execution_seconds: 180,
      runs_per_eval: 2,
      treasury: treasury.id,
      attester: attester.id,
    },
  },
});

const modelKey = randomBytes(32).toString("hex");
const MODEL = "e2e/careful-model";
await attester.account.callFunction({
  contractId: proctor.id,
  methodName: "register_model",
  args: {
    model_id: MODEL,
    signers: [Buffer.from(ed.getPublicKey(Buffer.from(modelKey, "hex"))).toString("hex")],
    attestation_report_sha256: "0".repeat(64),
  },
});

writeFileSync(outFile, JSON.stringify({ proctor: proctor.id, outlayer: outlayer.id, keeper: { id: keeper.id, key: keeper.key }, alice: alice.id, model: MODEL, modelKey }, null, 2), { mode: 0o600 });
writeFileSync(
  new URL("web/.env.e2e.local", repo),
  [
    "VITE_NETWORK_ID=testnet",
    `VITE_CONTRACT_ID=${proctor.id}`,
    `VITE_RPC_URL=${RPC}`,
    `VITE_ARCHIVAL_RPC_URL=${RPC}`,
    "VITE_RPC_FALLBACK_URLS=",
    "VITE_FEATURED_SET=",
    `VITE_DEV_ACCOUNT_ID=${alice.id}`,
    `VITE_DEV_PRIVATE_KEY=${alice.key}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`deployed ${proctor.id} with mock ${outlayer.id}; signer ${alice.id}`);
