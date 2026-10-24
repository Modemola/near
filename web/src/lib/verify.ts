/**
 * Re-check a certificate in the browser, trusting nothing but NEAR RPC:
 *
 * 1. Find the transactions that dispatched the eval's chunks. The contract
 *    records, for every accepted chunk, the block it was dispatched in and the
 *    account that signed that transaction, so a few block and chunk reads find
 *    it. No explorer or indexer is involved.
 * 2. Read those transactions' receipt outcomes and the contract's
 *    `chunk_accepted` events: every signed answer for every chunk.
 * 3. Check each Ed25519 signature against the keys the certificate names,
 *    that each event belongs to this eval, run and model, and that the signed
 *    chunks add up to every number on the certificate.
 */
import * as ed from "@noble/ed25519";
import { config } from "./config";
import { rpc, proctor, type TxOutcome } from "./near";
import type { Certificate, ChunkAcceptedEvent, Confusion, Eval } from "./types";

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

/** The text NEAR AI signed for one answer. */
export const signedText = (modelId: string, a: { req: string; resp: string }) => `${modelId}:${a.req}:${a.resp}`;

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

// ---- The certificate's arithmetic, exactly as the contract does it ----------

const bps = (num: number, den: number) => (den === 0 ? 0 : Math.floor((num * 10000) / den));
const total = (c: Confusion) => c.tp + c.fp + c.tn + c.fn_;

export function certificateFigures(runs: Confusion[]) {
  const mean = (f: (r: Confusion) => number) => Math.floor(runs.reduce((s, r) => s + f(r), 0) / runs.length);
  const acc = runs.map((r) => bps(r.tp + r.tn, total(r)));
  return {
    accuracy_bps: mean((r) => bps(r.tp + r.tn, total(r))),
    accuracy_min_bps: Math.min(...acc),
    accuracy_max_bps: Math.max(...acc),
    detection_bps: mean((r) => bps(r.tp, r.tp + r.fn_)),
    false_alarm_bps: mean((r) => bps(r.fp, r.fp + r.tn)),
  };
}

// ---- Checking --------------------------------------------------------------

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
  /** Done chunks whose event could not be found. */
  missing: number[];
  answersChecked: number;
  answersValid: number;
  /** Whether the signed chunks add up to every figure on the certificate. */
  totalsMatch: boolean;
  totalsProblems: string[];
}

const same = (a: Confusion, b: Confusion) =>
  a.tp === b.tp && a.fp === b.fp && a.tn === b.tn && a.fn_ === b.fn_ && a.unparsed === b.unparsed;

/** Check every `chunk_accepted` event for `ev` against its certificate. Each signature is checked once. */
export async function checkEvents(ev: Eval, cert: Certificate, events: ChunkAcceptedEvent[]): Promise<VerifyReport> {
  const byIndex = new Map<number, ChunkAcceptedEvent>();
  for (const e of events) if (String(e.eval_id) === String(ev.id)) byIndex.set(Number(e.index), e);

  const chunks: ChunkCheck[] = [];
  const missing: number[] = [];
  const runs: Confusion[] = Array.from({ length: ev.runs }, () => ({ tp: 0, fp: 0, tn: 0, fn_: 0, unparsed: 0 }));
  let answersChecked = 0;
  let answersValid = 0;
  for (let i = 0; i < ev.chunks.length; i++) {
    const state = ev.chunks[i];
    if (state.state !== "Done") continue;
    const e = byIndex.get(i);
    if (!e) {
      missing.push(i);
      continue;
    }
    const problems: string[] = [];
    const run = Math.floor(i / ev.chunks_per_run);
    if (e.nonce !== ev.nonces[run]) problems.push("not this run's nonce");
    if (e.model_id !== ev.model_id || e.model_id !== cert.model_id) problems.push("for another model");
    if (!cert.signers.includes(e.signer)) problems.push("signed by a key the certificate doesn't name");
    if (!same(e.confusion, state.confusion)) problems.push("counts differ from the contract's record");
    if (e.answers.length !== total(e.confusion)) problems.push("number of answers differs from the counts");
    const seen = new Set<string>();
    let valid = 0;
    for (const a of e.answers) {
      if (seen.has(a.req)) problems.push("a request is repeated");
      seen.add(a.req);
      if (await verifyAnswer(e.signer, signedText(ev.model_id, a), a.sig)) valid++;
    }
    if (valid < e.answers.length) problems.push(`${e.answers.length - valid} signature(s) failed`);
    answersChecked += e.answers.length;
    answersValid += valid;
    const r = runs[run];
    r.tp += e.confusion.tp;
    r.fp += e.confusion.fp;
    r.tn += e.confusion.tn;
    r.fn_ += e.confusion.fn_;
    r.unparsed += e.confusion.unparsed;
    chunks.push({ index: i, run, chunk: Number(e.chunk), answers: e.answers.length, valid, problems });
  }

  const totalsProblems: string[] = [];
  if (missing.length === 0) {
    runs.forEach((r, k) => {
      if (!cert.runs[k] || !same(r, cert.runs[k])) totalsProblems.push(`run ${k + 1}'s signed answers don't add up to its certified counts`);
      if (total(r) !== cert.item_count) totalsProblems.push(`run ${k + 1} graded ${total(r)} of ${cert.item_count} messages`);
    });
    const f = certificateFigures(runs);
    for (const [k, v] of Object.entries(f)) {
      if (cert[k as keyof typeof f] !== v) totalsProblems.push(`${k.replace(/_bps$/, "").replace(/_/g, " ")} is ${cert[k as keyof typeof f]} on the certificate but ${v} from the signed answers`);
    }
  } else {
    totalsProblems.push("some batches could not be found, so the totals were not checked");
  }
  return { chunks, missing, answersChecked, answersValid, totalsMatch: totalsProblems.length === 0, totalsProblems };
}

// ---- Finding the transactions with plain RPC --------------------------------

/** Set once the archival node proves unreachable, so it isn't retried for every call. */
let archivalDown = false;

/** RPC with the archival node first (it keeps old transactions), then the regular one. */
async function rpcArchival<T>(method: string, params: unknown): Promise<T> {
  if (!archivalDown && config.archivalRpcUrl && config.archivalRpcUrl !== config.rpcUrl) {
    try {
      return await rpc<T>(method, params, config.archivalRpcUrl);
    } catch (e) {
      if (e instanceof TypeError) archivalDown = true; // unreachable (network or CORS)
    }
  }
  return rpc<T>(method, params);
}

/**
 * The shard that holds an account's transactions under a NEAR shard layout
 * (V1 to V3): accounts are split by sorted boundary accounts.
 */
export function shardIdOf(accountId: string, layout: unknown): number | null {
  const v = layout && typeof layout === "object" ? Object.values(layout as Record<string, unknown>)[0] : null;
  const l = v as { boundary_accounts?: string[]; shard_ids?: number[] } | null;
  if (!l?.boundary_accounts) return null;
  const index = l.boundary_accounts.filter((b) => accountId >= b).length;
  return l.shard_ids ? l.shard_ids[index] ?? null : index;
}

let layoutCache: Promise<unknown> | null = null;
const shardLayout = () =>
  (layoutCache ??= rpc<{ shard_layout: unknown }>("EXPERIMENTAL_protocol_config", { finality: "final" }).then(
    (c) => c.shard_layout,
    () => null,
  ));

interface BlockView {
  header: { height: number };
  chunks: { chunk_hash: string; shard_id: number; height_included: number; tx_root: string }[];
}
interface ChunkView {
  transactions: { hash: string; signer_id: string; receiver_id: string }[];
}

const EMPTY_ROOT = "11111111111111111111111111111111";

/**
 * Hashes of transactions from `signer` to `receiver` included at or shortly
 * before `height`: where the transaction that dispatched a chunk must be.
 */
export async function findDispatchTxs(
  height: number,
  signer: string,
  receiver: string,
  call: <T>(method: string, params: unknown) => Promise<T> = rpcArchival,
  shardId: number | null = null,
): Promise<string[]> {
  const found = new Set<string>();
  // The dispatching receipt runs in the block that includes the transaction or
  // within a few after it; look back further only if nothing turns up.
  for (const [from, to] of [
    [height, height - 2],
    [height - 3, height - 8],
  ]) {
    for (let h = from; h >= to; h--) {
      let block: BlockView;
      try {
        block = await call<BlockView>("block", { block_id: h });
      } catch {
        continue; // skipped height
      }
      // A transaction lands in its signer's shard; read only that chunk when
      // the shard is known (and every chunk if the layout has changed since).
      const inShard = shardId === null ? [] : block.chunks.filter((c) => c.shard_id === shardId);
      for (const c of inShard.length ? inShard : block.chunks) {
        if (c.height_included !== h || c.tx_root === EMPTY_ROOT) continue;
        const chunk = await call<ChunkView>("chunk", { chunk_id: c.chunk_hash });
        for (const t of chunk.transactions) if (t.signer_id === signer && t.receiver_id === receiver) found.add(t.hash);
      }
    }
    if (found.size) break;
  }
  return [...found];
}

/** Run `f` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, f: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await f(items[next++]);
    }),
  );
}

/** Full verification: find the eval's transactions, read events from RPC, check everything. */
export async function verifyEval(evalId: string, onProgress?: (msg: string) => void): Promise<VerifyReport> {
  const [ev, cert] = await Promise.all([proctor.eval(evalId), proctor.certificate(evalId)]);
  if (!ev) throw new Error("No such test run.");
  if (!cert) throw new Error("This test run has no certificate yet.");

  // One lookup per dispatching transaction, not per chunk.
  const groups = new Map<string, { height: number; by: string }>();
  for (const c of ev.chunks) {
    if (c.state !== "Done") continue;
    groups.set(`${c.dispatched_at}|${c.by}`, { height: Number(c.dispatched_at), by: c.by });
  }
  const lookups = [...groups.values()];
  const txs = new Map<string, string>(); // hash -> signer
  let done = 0;
  onProgress?.(`Finding ${lookups.length} transactions on NEAR…`);
  const layout = await shardLayout();
  await pool(lookups, 2, async (g) => {
    for (const hash of await findDispatchTxs(g.height, g.by, config.contractId, rpcArchival, shardIdOf(g.by, layout))) txs.set(hash, g.by);
    onProgress?.(`Finding transactions on NEAR: ${++done} of ${lookups.length}…`);
  });

  const events: ChunkAcceptedEvent[] = [];
  done = 0;
  const list = [...txs.entries()];
  await pool(list, 2, async ([hash, signer]) => {
    try {
      const tx = await rpcArchival<TxOutcome>("EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: signer, wait_until: "NONE" });
      events.push(...chunkEvents(tx, config.contractId));
    } catch {
      /* reported as missing below */
    }
    onProgress?.(`Reading results: ${++done} of ${list.length} transactions…`);
  });
  onProgress?.("Checking every signature…");
  return checkEvents(ev, cert, events);
}
