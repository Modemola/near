/** Plain NEAR JSON-RPC: contract views, transaction outcomes, account info. */
import { config } from "./config";
import type { Certificate, ContractConfig, Eval, Model, TestSet } from "./types";

let nextId = 1;

/** Public RPC nodes rate-limit bursts; retry network failures and 429s twice with backoff. */
export async function rpc<T>(method: string, params: unknown, url = config.rpcUrl): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rpcOnce<T>(method, params, url);
    } catch (e) {
      const retryable = e instanceof TypeError || (e instanceof Error && /HTTP (429|50\d)/.test(e.message));
      if (!retryable || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    }
  }
}

async function rpcOnce<T>(method: string, params: unknown, url: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) {
    const cause = body.error.cause?.name ?? body.error.name ?? "error";
    throw new Error(`RPC ${method}: ${cause}: ${JSON.stringify(body.error.data ?? body.error.message)}`);
  }
  return body.result as T;
}

function toBase64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

export async function view<T>(method: string, args: Record<string, unknown> = {}, contractId = config.contractId): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
}

export const proctor = {
  config: () => view<ContractConfig>("get_config"),
  models: () => view<Model[]>("list_models"),
  model: (model_id: string) => view<Model | null>("get_model", { model_id }),
  sets: () => view<TestSet[]>("list_sets", { from_index: 0, limit: 100 }),
  set: (set_id: string) => view<TestSet | null>("get_set", { set_id }),
  evalCount: async () => Number(await view<string>("eval_count")),
  eval: (eval_id: number | string) => view<Eval | null>("get_eval", { eval_id: String(eval_id) }),
  certificate: (eval_id: number | string) => view<Certificate | null>("get_certificate", { eval_id: String(eval_id) }),
  certificates: (set_id: string) => view<Certificate[]>("list_certificates", { set_id, from_index: 0, limit: 100 }),
  quote: (set_id: string) => view<string>("quote_eval", { set_id }),
  evalsStarted: (set_id: string, model_id: string) => view<number>("evals_started", { set_id, model_id }),
};

export interface ReceiptOutcome {
  id: string;
  block_hash: string;
  outcome: { logs: string[]; executor_id: string; status: unknown };
}

export interface TxOutcome {
  transaction: { hash: string; signer_id: string; receiver_id: string };
  receipts_outcome: ReceiptOutcome[];
}

/** A transaction and all its receipts' outcomes, straight from RPC. */
export function txStatus(txHash: string, senderId: string): Promise<TxOutcome> {
  return rpc<TxOutcome>("EXPERIMENTAL_tx_status", { tx_hash: txHash, sender_account_id: senderId, wait_until: "NONE" });
}

/** SHA-256 of the deployed contract code (base58), for comparing with a reproducible build. */
export async function codeHash(accountId: string): Promise<string> {
  const r = await rpc<{ code_hash: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId });
  return r.code_hash;
}

/** NEAR amounts are yoctoNEAR strings; show them in NEAR. */
export function formatNear(yocto: string, digits = 3): string {
  const v = BigInt(yocto);
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n).toString().padStart(24, "0").slice(0, digits);
  return `${whole}.${frac}`.replace(/\.?0+$/, "") || "0";
}

export function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/** Explorer page for a transaction. */
export const explorerTx = (hash: string) => `${config.explorerUrl}/txns/${hash}`;

/** The transaction hash in whatever a wallet returns after submitting, if it says. */
export function txHashOf(outcome: unknown): string | null {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}

/**
 * How the transaction's first receipt (the call to our contract) ended:
 * `null` if it succeeded, the failure message if it failed, `undefined` if it
 * hasn't run yet. Doesn't wait for later receipts, so it works for calls whose
 * callbacks stay pending (request_eval, dispatch).
 */
export async function callOutcome(txHash: string, signer: string): Promise<string | null | undefined> {
  let tx: TxOutcome & { transaction_outcome?: { outcome: { receipt_ids: string[] } } };
  try {
    tx = await rpc("EXPERIMENTAL_tx_status", { tx_hash: txHash, sender_account_id: signer, wait_until: "NONE" });
  } catch {
    return undefined;
  }
  const first = tx.transaction_outcome?.outcome.receipt_ids[0];
  const receipt = tx.receipts_outcome.find((r) => r.id === first);
  if (!receipt) return undefined;
  const status = receipt.outcome.status as { Failure?: unknown; SuccessValue?: unknown; SuccessReceiptId?: unknown; Unknown?: unknown };
  if (status.Failure !== undefined) {
    const f = JSON.stringify(status.Failure);
    const m = /ExecutionError\\?":\\?"([^"\\]+)/.exec(f);
    return m ? m[1] : f;
  }
  return status.SuccessValue !== undefined || status.SuccessReceiptId !== undefined ? null : undefined;
}

/** Poll `callOutcome` until the call has run, for up to `ms`. */
export async function waitForCall(txHash: string, signer: string, ms = 30000): Promise<string | null | undefined> {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    const r = await callOutcome(txHash, signer);
    if (r !== undefined) return r;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return undefined;
}
