/** NEAR wallet connection (wallet-selector) and contract calls. */
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
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

/** End-to-end tests against a local sandbox sign with a throwaway key (development builds only). */
const DEV_ACCOUNT = import.meta.env.DEV ? (import.meta.env.VITE_DEV_ACCOUNT_ID as string | undefined) : undefined;
const DEV_KEY = import.meta.env.DEV ? (import.meta.env.VITE_DEV_PRIVATE_KEY as string | undefined) : undefined;
export const devSignerActive = !!(DEV_ACCOUNT && DEV_KEY);

export function WalletProvider({ children }: { children: ReactNode }) {
  if (devSignerActive) return <DevWalletProvider>{children}</DevWalletProvider>;
  return <SelectorWalletProvider>{children}</SelectorWalletProvider>;
}

function DevWalletProvider({ children }: { children: ReactNode }) {
  const value: WalletState = {
    accountId: DEV_ACCOUNT!,
    ready: true,
    signIn: () => {},
    signOut: async () => {},
    call: async (method, args, depositYocto = "0", tgas = 300) => {
      const { devSignAndSend } = await import("./devSigner");
      return devSignAndSend(DEV_ACCOUNT!, DEV_KEY!, config.contractId, method, args, BigInt(tgas) * 10n ** 12n, BigInt(depositYocto));
    },
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function SelectorWalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    // The page renders first; wallet code (the bulk of the app's JavaScript)
    // loads when the browser is idle, well before anyone can click Connect.
    const whenIdle = (f: () => void) =>
      "requestIdleCallback" in window ? window.requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 800);
    new Promise<void>((resolve) => whenIdle(resolve))
      .then(() => import("./walletSetup"))
      .then(async ({ setupWallets }) => {
      const { selector: s, modal: m } = await setupWallets();
      if (cancelled) return;
      setSelector(s);
      setModal(m);
      const update = () => setAccountId(s.store.getState().accounts.find((a) => a.active)?.accountId ?? null);
      update();
      const sub = s.store.observable.subscribe(update);
      unsubscribe = () => sub.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
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
      const [wallet, { functionCall }] = await Promise.all([selector.wallet(), import("./walletSetup")]);
      return wallet.signAndSendTransaction({
        receiverId: config.contractId,
        actions: [functionCall(method, args, BigInt(tgas) * 10n ** 12n, BigInt(depositYocto))],
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
