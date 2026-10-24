import * as ed from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import type { TxOutcome } from "./near";
import type { ChunkAcceptedEvent, Eval, Model } from "./types";
import { checkEvents, chunkEvents, hexToBytes, verifyAnswer } from "./verify";

const MODEL = "Qwen/Qwen3.8-27B";
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const priv = new Uint8Array(32).fill(5);

async function keyHex() {
  return toHex(await ed.getPublicKeyAsync(priv));
}

async function answer(text: string) {
  return { text, signature: toHex(await ed.signAsync(new TextEncoder().encode(text), priv)) };
}

function evalWith(chunks: number): Eval {
  return {
    id: "7",
    requester: "r.testnet",
    set_id: "scam-v1",
    model_id: MODEL,
    runs: 1,
    chunks_per_run: chunks,
    nonces: ["n0"],
    price: "0",
    job_deposit: "0",
    escrow: "0",
    grader_hash: "g",
    chunks: Array.from({ length: chunks }, () => ({
      state: "Done" as const,
      confusion: { tp: 1, fp: 0, tn: 1, fn_: 0, unparsed: 0 },
      records_digest: "d",
      signer: "",
      block_height: "1",
    })),
    status: "Certified",
    error: null,
    created_at: "0",
  };
}

async function event(index: number, overrides: Partial<ChunkAcceptedEvent> = {}): Promise<ChunkAcceptedEvent> {
  return {
    eval_id: "7",
    index,
    run: 0,
    chunk: index,
    set_id: "scam-v1",
    model_id: MODEL,
    nonce: "n0",
    signer: await keyHex(),
    records_digest: "d",
    confusion: { tp: 1, fp: 0, tn: 1, fn_: 0, unparsed: 0 },
    answers: [await answer(`${MODEL}:${"a".repeat(64)}:${"b".repeat(64)}`), await answer(`${MODEL}:${"c".repeat(64)}:${"d".repeat(64)}`)],
    ...overrides,
  };
}

async function setup(chunks: number) {
  const signer = await keyHex();
  const ev = evalWith(chunks);
  for (const c of ev.chunks) if (c.state === "Done") c.signer = signer;
  const model: Model = { model_id: MODEL, signers: [signer], attestation_report_sha256: "r", registered_at: "0" };
  return { ev, model };
}

describe("verifyAnswer", () => {
  it("accepts a real signature and rejects any change", async () => {
    const a = await answer("hello");
    expect(await verifyAnswer(await keyHex(), a.text, a.signature)).toBe(true);
    expect(await verifyAnswer(await keyHex(), "hellO", a.signature)).toBe(false);
    expect(await verifyAnswer(await keyHex(), a.text, "zz")).toBe(false);
    expect(() => hexToBytes("abc")).toThrow();
  });
});

describe("checkEvents", () => {
  it("passes when every chunk's answers verify", async () => {
    const { ev, model } = await setup(2);
    const r = await checkEvents(ev, model, [await event(0), await event(1)]);
    expect(r.missing).toEqual([]);
    expect(r.answersChecked).toBe(4);
    expect(r.answersValid).toBe(4);
    expect(r.chunks.every((c) => c.problems.length === 0)).toBe(true);
  });

  it("reports a forged answer, a wrong run and an unregistered key", async () => {
    const { ev, model } = await setup(3);
    const forged = await event(0);
    forged.answers[1] = { ...forged.answers[1], text: forged.answers[1].text.replace("c", "e") };
    const otherRun = await event(1, { nonce: "another run" });
    const otherKey = await event(2, { signer: "ab".repeat(32) });
    const r = await checkEvents(ev, model, [forged, otherRun, otherKey]);
    expect(r.chunks[0].problems.join()).toMatch(/1 signature\(s\) failed/);
    expect(r.chunks[1].problems.join()).toMatch(/nonce/);
    expect(r.chunks[2].problems.join()).toMatch(/not a registered key/);
    expect(r.answersValid).toBeLessThan(r.answersChecked);
  });

  it("lists chunks whose events were not found and ignores other evals", async () => {
    const { ev, model } = await setup(2);
    const r = await checkEvents(ev, model, [await event(0), await event(1, { eval_id: "8" })]);
    expect(r.missing).toEqual([1]);
  });
});

describe("chunkEvents", () => {
  it("reads only proctor events from the contract's receipts", async () => {
    const e = await event(0);
    const log = (std: string) => `EVENT_JSON:${JSON.stringify({ standard: std, version: "1.0.0", event: "chunk_accepted", data: [e] })}`;
    const tx: TxOutcome = {
      transaction: { hash: "h", signer_id: "k.testnet", receiver_id: "proctor.testnet" },
      receipts_outcome: [
        { id: "1", block_hash: "b", outcome: { executor_id: "proctor.testnet", logs: ["plain log", log("proctor")], status: {} } },
        { id: "2", block_hash: "b", outcome: { executor_id: "evil.testnet", logs: [log("proctor")], status: {} } },
        { id: "3", block_hash: "b", outcome: { executor_id: "proctor.testnet", logs: [log("nep171"), "EVENT_JSON:{bad"], status: {} } },
      ],
    };
    const found = chunkEvents(tx, "proctor.testnet");
    expect(found).toHaveLength(1);
    expect(found[0].index).toBe(0);
  });
});
