/**
 * The wallet libraries, loaded on demand: they are most of the app's
 * JavaScript and only matter for connecting and signing, so pages render
 * without waiting for them.
 */
// Wallet libraries expect Node's Buffer and process; load the shim first.
import "../polyfills";
import { actionCreators } from "@near-js/transactions";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { config } from "./config";

export async function setupWallets() {
  const selector = await setupWalletSelector({ network: config.networkId, modules: [setupMyNearWallet(), setupMeteorWallet()] });
  const modal = setupModal(selector, { contractId: config.contractId });
  return { selector, modal };
}

export const functionCall = (method: string, args: Record<string, unknown>, gas: bigint, deposit: bigint) =>
  actionCreators.functionCall(method, args, gas, deposit);
