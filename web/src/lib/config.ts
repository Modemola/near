/** Deployment settings, from Vite env vars (see .env.example). */
export const config = {
  networkId: (import.meta.env.VITE_NETWORK_ID ?? "testnet") as "testnet" | "mainnet",
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "",
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://rpc.testnet.near.org",
  /** Finds transaction hashes for an account; verification data itself comes from RPC. */
  txLookupUrl: import.meta.env.VITE_TX_LOOKUP_URL ?? "https://tx.test.fastnear.com",
  explorerUrl: import.meta.env.VITE_EXPLORER_URL ?? "https://testnet.nearblocks.io",
  sourceUrl: import.meta.env.VITE_SOURCE_URL ?? "https://github.com/Modemola/near",
};

export const isConfigured = config.contractId.length > 0;
