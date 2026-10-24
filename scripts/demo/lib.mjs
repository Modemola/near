// Shared helpers for the testnet demo scripts. Keys are read from
// ~/.near-credentials (never from the repo).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";

export const RPC = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const provider = new JsonRpcProvider({ url: RPC });
const CREDS = join(homedir(), ".near-credentials", "testnet");

export function loadAccount(accountId) {
  const file = join(CREDS, `${accountId}.json`);
  const { private_key } = JSON.parse(readFileSync(file, "utf8"));
  return new Account(accountId, provider, private_key);
}

export function saveKey(accountId, keyPair) {
  mkdirSync(CREDS, { recursive: true });
  const file = join(CREDS, `${accountId}.json`);
  if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`);
  writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
}

export function newKeyPair() {
  return KeyPair.fromRandom("ed25519");
}

export async function accountExists(accountId) {
  try {
    await provider.query({ request_type: "view_account", finality: "final", account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

export async function view(contractId, method, args = {}) {
  const r = await provider.query({
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}

/** Send a function call and return once it is included (not executed). */
export function call(account, contractId, methodName, args, { deposit = 0n, tgas = 300 } = {}) {
  return account.callFunctionRaw({
    contractId,
    methodName,
    args,
    deposit,
    gas: BigInt(tgas) * 10n ** 12n,
    waitUntil: "INCLUDED_FINAL",
  });
}

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

/** Same canonical form as grader/src/lib.rs `set_commitment` and web/src/lib/commitment.ts. */
export function setCommitment(items) {
  return sha256Hex(Buffer.from(JSON.stringify(items.map((i) => ({ id: i.id, channel: i.channel, from: i.from, text: i.text, label: i.label }))), "utf8"));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
