/**
 * Re-check a certificate in the browser, without trusting Proctor's servers:
 *
 * 1. Find the transactions that dispatched the eval's chunks (an explorer API
 *    is used only to find their hashes).
 * 2. Fetch those transactions' receipt outcomes from NEAR RPC and read the
 *    contract's `chunk_accepted` events: every signed answer for every chunk.
 * 3. Check each Ed25519 signature against the model's key as registered in the
 *    contract, and that each event belongs to this eval, run and model.
 */
import * as ed from "@noble/ed25519";
import { config } from "./config";
import { proctor, txStatus, type TxOutcome } from "./near";
import type { ChunkAcceptedEvent, Eval, Model } from "./types";

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) throw new Error("not hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export async function verifyAnswer(signerHex: string, text: string, signatureHex: string): Promise<boolean> {
  try {
    return await ed.verifyAsync(hexToBytes(signatureHex), new TextEncoder().encode(text), hexToBytes(signerHex));
  } catch {
    return false;
  }
}

/** `chunk_accepted` events found in a transaction's receipt outcomes, from the given contract. */
export function chunkEvents(tx: TxOutcome, contractId: string): ChunkAcceptedEvent[] {
  const out: ChunkAcceptedEvent[] = [];
  for (const r of tx.receipts_outcome) {
    if (r.outcome.executor_id !== contractId) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const e = JSON.parse(log.slice("EVENT_JSON:".length));
        if (e.standard === "proctor" && e.event === "chunk_accepted") out.push(...(e.data as ChunkAcceptedEvent[]));
      } catch {
        /* not ours */
      }
    }
  }
  return out;
}

export interface TxRef {
  hash: string;
  signer: string;
}

/**
 * Transactions sent to the contract, newest first, from FastNEAR's
 * transaction API. Only hashes and signers are taken from it.
 */
export async function findContractTxs(contractId: string, limit = 400): Promise<TxRef[]> {
  const res = await fetch(`${config.txLookupUrl}/v0/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: contractId, max_block_height: null }),
  });
  if (!res.ok) throw new Error(`transaction lookup: HTTP ${res.status}`);
  const body = await res.json();
  const txs: { transaction_hash: string; signer_id?: string; transaction?: { signer_id: string } }[] =
    body.account_txs ?? body.transactions ?? [];
  return txs
    .slice(0, limit)
    .map((t) => ({ hash: t.transaction_hash, signer: t.signer_id ?? t.transaction?.signer_id ?? "" }))
    .filter((t) => t.hash && t.signer);
}

export interface ChunkCheck {
  index: number;
  run: number;
  chunk: number;
  answers: number;
  valid: number;
  problems: string[];
}

export interface VerifyReport {
  chunks: ChunkCheck[];
  missing: number[];
  answersChecked: number;
  answersValid: number;
}

/** Check every `chunk_accepted` event for `ev` against the registered model keys. */
export async function checkEvents(ev: Eval, model: Model, events: ChunkAcceptedEvent[]): Promise<VerifyReport> {
  const done = ev.chunks.map((c, i) => (c.state === "Done" ? i : -1)).filter((i) => i >= 0);
  const byIndex = new Map<number, ChunkAcceptedEvent>();
  for (const e of events) if (String(e.eval_id) === String(ev.id)) byIndex.set(e.index, e);

  const chunks: ChunkCheck[] = [];
  let answersChecked = 0;
  let answersValid = 0;
  for (const i of done) {
    const e = byIndex.get(i);
    if (!e) continue;
    const problems: string[] = [];
    const run = Math.floor(i / ev.chunks_per_run);
    if (e.nonce !== ev.nonces[run]) problems.push("event nonce is not this run's nonce");
    if (e.model_id !== ev.model_id) problems.push("event is for another model");
    if (!model.signers.includes(e.signer)) problems.push("signer is not a registered key of this model");
    const state = ev.chunks[i];
    if (state.state === "Done" && state.signer !== e.signer) problems.push("signer differs from the contract's record");
    let valid = 0;
    for (const a of e.answers) {
      if (!a.text.startsWith(`${ev.model_id}:`)) problems.push("answer names another model");
      if (await verifyAnswer(e.signer, a.text, a.signature)) valid++;
    }
    if (valid < e.answers.length) problems.push(`${e.answers.length - valid} signature(s) failed`);
    answersChecked += e.answers.length;
    answersValid += valid;
    chunks.push({ index: i, run, chunk: e.chunk, answers: e.answers.length, valid, problems });
  }
  const found = new Set(chunks.map((c) => c.index));
  return { chunks, missing: done.filter((i) => !found.has(i)), answersChecked, answersValid };
}

/** Full verification: locate the eval's transactions, read events from RPC, check signatures. */
export async function verifyEval(evalId: string, onProgress?: (msg: string) => void): Promise<VerifyReport> {
  const ev = await proctor.eval(evalId);
  if (!ev) throw new Error("No such eval.");
  const model = await proctor.model(ev.model_id);
  if (!model) throw new Error("The model is no longer registered.");
  onProgress?.("Finding the eval's transactions…");
  const txs = await findContractTxs(config.contractId);
  const events: ChunkAcceptedEvent[] = [];
  let n = 0;
  for (const t of txs) {
    n++;
    onProgress?.(`Reading transaction ${n} of ${txs.length} from NEAR RPC…`);
    try {
      events.push(...chunkEvents(await txStatus(t.hash, t.signer), config.contractId));
    } catch {
      /* a transaction RPC no longer serves; reported as missing below */
    }
    const report = await checkEvents(ev, model, events);
    if (report.missing.length === 0) return report;
  }
  return checkEvents(ev, model, events);
}
