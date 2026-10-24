import * as ed from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import type { TxOutcome } from "./near";
import type { Certificate, ChunkAcceptedEvent, Confusion, Eval } from "./types";
import { certificateFigures, checkEvents, chunkEvents, findDispatchTxs, hexToBytes, signedText, verifyAnswer } from "./verify";

const MODEL = "Qwen/Qwen3.8-27B";
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const priv = new Uint8Array(32).fill(5);
const keyHex = async () => toHex(await ed.getPublicKeyAsync(priv));
const h64 = (c: string, i: number) => (c + i.toString(16)).padEnd(64, c).slice(0, 64);

async function answer(req: string, resp: string) {
  const text = signedText(MODEL, { req, resp });
  return { req, resp, sig: toHex(await ed.signAsync(new TextEncoder().encode(text), priv)) };
}

// Two runs of two chunks; each chunk has 1 scam caught and 1 real message let through.
const C: Confusion = { tp: 1, fp: 0, tn: 1, fn_: 0, unparsed: 0 };

function evalOf(): Eval {
  return {
    id: "7", requester: "r.testnet", set_id: "scam-v1", model_id: MODEL, runs: 2, chunks_per_run: 2,
    nonces: ["n0", "n1"], price: "0", job_deposit: "0", escrow: "0", grader_url: "https://g", grader_hash: "g",
    signers: [], status: "Certified", error: null, created_at: "0",
    chunks: Array.from({ length: 4 }, () => ({ state: "Done" as const, confusion: { ...C }, block_height: "10", dispatched_at: "9", by: "keeper.testnet" })),
  };
}

async function certOf(): Promise<Certificate> {
  const runs = [
    { tp: 2, fp: 0, tn: 2, fn_: 0, unparsed: 0 },
    { tp: 2, fp: 0, tn: 2, fn_: 0, unparsed: 0 },
  ];
  return {
    eval_id: "7", set_id: "scam-v1", set_commitment: "c", model_id: MODEL, grader_hash: "g", item_count: 4, max_tokens: 4000,
    runs, ...certificateFigures(runs), signers: [await keyHex()], issued_at: "0", issued_at_block: "11",
  };
}

async function events(): Promise<ChunkAcceptedEvent[]> {
  const out: ChunkAcceptedEvent[] = [];
  for (let i = 0; i < 4; i++) {
    out.push({
      eval_id: "7", index: i, run: Math.floor(i / 2), chunk: i % 2, set_id: "scam-v1", model_id: MODEL,
      nonce: i < 2 ? "n0" : "n1", signer: await keyHex(), records_digest: "d", confusion: { ...C },
      answers: [await answer(h64("a", i), h64("b", i)), await answer(h64("c", i), h64("d", i))],
    });
  }
  return out;
}

describe("verifyAnswer", () => {
  it("accepts a real signature and rejects any change", async () => {
    const a = await answer(h64("a", 1), h64("b", 1));
    const text = signedText(MODEL, a);
    expect(await verifyAnswer(await keyHex(), text, a.sig)).toBe(true);
    expect(await verifyAnswer(await keyHex(), text.replace("a", "e"), a.sig)).toBe(false);
    expect(await verifyAnswer(await keyHex(), text, "zz")).toBe(false);
    expect(() => hexToBytes("abc")).toThrow();
  });
});

describe("checkEvents", () => {
  it("passes a certificate whose signed answers add up", async () => {
    const r = await checkEvents(evalOf(), await certOf(), await events());
    expect(r.missing).toEqual([]);
    expect(r.answersChecked).toBe(8);
    expect(r.answersValid).toBe(8);
    expect(r.chunks.every((c) => c.problems.length === 0)).toBe(true);
    expect(r.totalsMatch).toBe(true);
  });

  it("catches a tampered signature", async () => {
    const ev = await events();
    ev[1].answers[0].sig = ev[1].answers[1].sig;
    const r = await checkEvents(evalOf(), await certOf(), ev);
    expect(r.answersValid).toBe(7);
    expect(r.chunks[1].problems.join()).toMatch(/signature/);
  });

  it("catches a certificate whose figures don't match the signed answers", async () => {
    const cert = await certOf();
    cert.accuracy_bps = 9000;
    cert.runs[1] = { tp: 2, fp: 0, tn: 1, fn_: 1, unparsed: 0 };
    const r = await checkEvents(evalOf(), cert, await events());
    expect(r.totalsMatch).toBe(false);
    expect(r.totalsProblems.join(" ")).toMatch(/run 2/);
    expect(r.totalsProblems.join(" ")).toMatch(/accuracy/);
  });

  it("catches events from another run, model or key, and counts that differ from the contract", async () => {
    const ev = await events();
    ev[0].nonce = "n1";
    ev[1].model_id = "other/model";
    ev[2].signer = "00".repeat(32);
    ev[3].confusion = { tp: 2, fp: 0, tn: 0, fn_: 0, unparsed: 0 };
    const r = await checkEvents(evalOf(), await certOf(), ev);
    expect(r.chunks[0].problems.join()).toMatch(/nonce/);
    expect(r.chunks[1].problems.join()).toMatch(/another model/);
    expect(r.chunks[2].problems.join()).toMatch(/doesn't name/);
    expect(r.chunks[3].problems.join()).toMatch(/differ/);
  });

  it("reports missing batches and does not claim the totals match", async () => {
    const r = await checkEvents(evalOf(), await certOf(), (await events()).slice(0, 3));
    expect(r.missing).toEqual([3]);
    expect(r.totalsMatch).toBe(false);
  });
});

describe("certificateFigures", () => {
  it("does the contract's integer arithmetic", () => {
    // 9 of 11 scams caught and 1 of 9 real messages flagged, then a perfect run.
    const f = certificateFigures([
      { tp: 9, fn_: 2, fp: 1, tn: 8, unparsed: 0 },
      { tp: 11, fn_: 0, fp: 0, tn: 9, unparsed: 0 },
    ]);
    expect(f).toEqual({ accuracy_bps: 9250, accuracy_min_bps: 8500, accuracy_max_bps: 10000, detection_bps: 9090, false_alarm_bps: 555 });
  });
});

describe("findDispatchTxs", () => {
  it("finds the signer's transaction to the contract in or just before the dispatch block", async () => {
    const blocks: Record<number, unknown> = {
      100: { header: { height: 100 }, chunks: [{ chunk_hash: "c100", shard_id: 0, height_included: 100, tx_root: "11111111111111111111111111111111" }] },
      99: { header: { height: 99 }, chunks: [{ chunk_hash: "c99", shard_id: 0, height_included: 99, tx_root: "x" }] },
    };
    const chunks: Record<string, unknown> = {
      c99: { transactions: [
        { hash: "mine", signer_id: "keeper.testnet", receiver_id: "proctor.testnet" },
        { hash: "other-signer", signer_id: "x.testnet", receiver_id: "proctor.testnet" },
        { hash: "other-contract", signer_id: "keeper.testnet", receiver_id: "y.testnet" },
      ] },
    };
    const calls: string[] = [];
    const call = async <T,>(method: string, params: unknown): Promise<T> => {
      const p = params as { block_id?: number; chunk_id?: string };
      calls.push(`${method}:${p.block_id ?? p.chunk_id}`);
      const v = method === "block" ? blocks[p.block_id!] : chunks[p.chunk_id!];
      if (!v) throw new Error("unknown");
      return v as T;
    };
    expect(await findDispatchTxs(100, "keeper.testnet", "proctor.testnet", call)).toEqual(["mine"]);
    expect(calls).not.toContain("chunk:c100"); // empty chunks are skipped
  });
});

describe("chunkEvents", () => {
  it("reads only Proctor events logged by the contract", () => {
    const ev = { eval_id: "7", index: 0 };
    const log = `EVENT_JSON:${JSON.stringify({ standard: "proctor", version: "1.0.0", event: "chunk_accepted", data: [ev] })}`;
    const tx = {
      transaction: { hash: "h", signer_id: "s", receiver_id: "proctor.testnet" },
      receipts_outcome: [
        { id: "1", block_hash: "b", outcome: { logs: [log, "EVENT_JSON:{bad"], executor_id: "proctor.testnet", status: {} } },
        { id: "2", block_hash: "b", outcome: { logs: [log], executor_id: "impostor.testnet", status: {} } },
      ],
    } as TxOutcome;
    expect(chunkEvents(tx, "proctor.testnet")).toEqual([ev]);
  });
});
