/** Deployment settings, from Vite env vars (see .env.example). */
export const config = {
  networkId: (import.meta.env.VITE_NETWORK_ID ?? "testnet") as "testnet" | "mainnet",
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "",
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://rpc.testnet.near.org",
  /** Other public RPC endpoints to use when rpcUrl is busy (comma-separated; empty for none). */
  rpcFallbackUrls: (
    (import.meta.env.VITE_RPC_FALLBACK_URLS as string | undefined) ??
    ((import.meta.env.VITE_NETWORK_ID ?? "testnet") === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com")
  )
    .split(",")
    .map((u: string) => u.trim())
    .filter(Boolean) as string[],
  /**
   * Keeps old transactions (regular RPC nodes drop them after a few days), so
   * results stay verifiable. Verification falls back to rpcUrl if unreachable.
   */
  archivalRpcUrl:
    import.meta.env.VITE_ARCHIVAL_RPC_URL ??
    ((import.meta.env.VITE_NETWORK_ID ?? "testnet") === "mainnet"
      ? "https://archival-rpc.mainnet.near.org"
      : "https://archival-rpc.testnet.near.org"),
  explorerUrl: import.meta.env.VITE_EXPLORER_URL ?? "https://testnet.nearblocks.io",
  sourceUrl: import.meta.env.VITE_SOURCE_URL ?? "https://github.com/Modemola/near",
};

export const isConfigured = config.contractId.length > 0;
