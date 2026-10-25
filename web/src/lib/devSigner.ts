/**
 * TEST-ONLY signer for end-to-end tests against a local NEAR sandbox. It signs
 * with a throwaway key from VITE_DEV_PRIVATE_KEY instead of a wallet. The
 * wallet provider only loads it in development builds (import.meta.env.DEV)
 * with both VITE_DEV_* variables set, so production builds never contain it.
 */
import "../polyfills";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { actionCreators, createTransaction, encodeTransaction, Signature, SignedTransaction } from "@near-js/transactions";
import { baseDecode } from "@near-js/utils";
import { sha256 } from "@noble/hashes/sha2";
import { rpc } from "./near";

export async function devSignAndSend(
  accountId: string,
  privateKey: string,
  receiverId: string,
  method: string,
  args: Record<string, unknown>,
  gas: bigint,
  deposit: bigint,
): Promise<{ transaction: { hash: string } }> {
  const keyPair = KeyPair.fromString(privateKey as KeyPairString);
  const publicKey = keyPair.getPublicKey();
  const key = await rpc<{ nonce: number }>("query", {
    request_type: "view_access_key",
    finality: "final",
    account_id: accountId,
    public_key: publicKey.toString(),
  });
  const block = await rpc<{ header: { hash: string } }>("block", { finality: "final" });
  const tx = createTransaction(
    accountId,
    publicKey,
    receiverId,
    BigInt(key.nonce) + 1n,
    [actionCreators.functionCall(method, args, gas, deposit)],
    baseDecode(block.header.hash),
  );
  const signature = keyPair.sign(sha256(encodeTransaction(tx)));
  const signed = new SignedTransaction({
    transaction: tx,
    signature: new Signature({ keyType: publicKey.keyType, data: signature.signature }),
  });
  const bytes = signed.encode();
  // Wait for inclusion only, like a wallet: evals keep callbacks pending.
  const res = await rpc<{ transaction: { hash: string }; status?: unknown }>("send_tx", {
    signed_tx_base64: btoa(String.fromCharCode(...bytes)),
    wait_until: "INCLUDED_FINAL",
  });
  return { transaction: { hash: res.transaction?.hash ?? "" } };
}
