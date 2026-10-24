/**
 * Redirect wallets (MyNearWallet) leave the site to sign and come back with
 * `?transactionHashes=…` on success or `?errorCode=…` when cancelled or
 * failed. Read that once, and tidy the address bar.
 */
export interface WalletReturn {
  hashes: string[];
  /** "Cancelled" when the user rejected; otherwise the wallet's message. */
  error: string | null;
}

export function takeWalletReturn(): WalletReturn | null {
  const url = new URL(window.location.href);
  const hashes = url.searchParams.get("transactionHashes");
  const code = url.searchParams.get("errorCode");
  if (!hashes && !code) return null;
  const message = url.searchParams.get("errorMessage");
  for (const k of ["transactionHashes", "errorCode", "errorMessage"]) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, "", url.toString());
  return {
    hashes: hashes ? hashes.split(",").filter(Boolean) : [],
    error: code ? (/reject|cancel/i.test(code) ? "Cancelled" : decodeURIComponent(message ?? code)) : null,
  };
}

/** Whether a numeric id from the address bar is usable (contract ids are u64). */
export const isIdParam = (s: string) => /^\d{1,19}$/.test(s);

let cached: WalletReturn | null | undefined;

/** The wallet's return for this page load, read once and kept until a page handles it. */
export function walletReturn(): WalletReturn | null {
  if (cached === undefined) cached = takeWalletReturn();
  return cached;
}

export function clearWalletReturn() {
  cached = null;
}
