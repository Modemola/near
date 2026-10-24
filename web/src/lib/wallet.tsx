/** NEAR wallet connection (wallet-selector) and contract calls. */
import { actionCreators } from "@near-js/transactions";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { config } from "./config";

interface WalletState {
  accountId: string | null;
  ready: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  /**
   * Send a function call to the Proctor contract. Resolves when the wallet has
   * submitted it; callers must not rely on it resolving after execution,
   * because evals keep callbacks pending until the grader answers.
   */
  call: (method: string, args: Record<string, unknown>, depositYocto?: string, tgas?: number) => Promise<unknown>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    setupWalletSelector({ network: config.networkId, modules: [setupMyNearWallet(), setupMeteorWallet()] }).then((s) => {
      setSelector(s);
      setModal(setupModal(s, { contractId: config.contractId }));
      const update = () => setAccountId(s.store.getState().accounts.find((a) => a.active)?.accountId ?? null);
      update();
      const sub = s.store.observable.subscribe(update);
      unsubscribe = () => sub.unsubscribe();
    });
    return () => unsubscribe();
  }, []);

  const value: WalletState = {
    accountId,
    ready: selector !== null,
    signIn: () => modal?.show(),
    signOut: async () => {
      if (!selector) return;
      await (await selector.wallet()).signOut();
    },
    call: async (method, args, depositYocto = "0", tgas = 300) => {
      if (!selector) throw new Error("Wallet is still loading.");
      const wallet = await selector.wallet();
      return wallet.signAndSendTransaction({
        receiverId: config.contractId,
        actions: [actionCreators.functionCall(method, args, BigInt(tgas) * 10n ** 12n, BigInt(depositYocto))],
      });
    },
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const w = useContext(WalletContext);
  if (!w) throw new Error("useWallet outside WalletProvider");
  return w;
}
