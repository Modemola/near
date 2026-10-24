import { afterEach, describe, expect, it } from "vitest";
import { isIdParam, takeWalletReturn } from "./walletReturn";

function at(url: string) {
  // Minimal window for node.
  const state = { href: url };
  (globalThis as unknown as { window: unknown }).window = {
    location: state,
    history: { state: null, replaceState: (_s: unknown, _t: string, u: string) => (state.href = u) },
  };
  return state;
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("takeWalletReturn", () => {
  it("reads hashes and cleans the address bar", () => {
    const loc = at("https://p.app/sets/x?transactionHashes=a,b&keep=1");
    expect(takeWalletReturn()).toEqual({ hashes: ["a", "b"], error: null });
    expect(loc.href).toBe("https://p.app/sets/x?keep=1");
    expect(takeWalletReturn()).toBeNull();
  });
  it("treats a rejection as Cancelled and passes other errors on", () => {
    at("https://p.app/?errorCode=userRejected");
    expect(takeWalletReturn()?.error).toBe("Cancelled");
    at("https://p.app/?errorCode=failed&errorMessage=Not%20enough%20balance");
    expect(takeWalletReturn()?.error).toBe("Not enough balance");
  });
  it("is null for an ordinary visit", () => {
    at("https://p.app/sets/x");
    expect(takeWalletReturn()).toBeNull();
  });
});

describe("isIdParam", () => {
  it("accepts u64-like ids only", () => {
    expect(isIdParam("0")).toBe(true);
    expect(isIdParam("12")).toBe(true);
    expect(isIdParam("abc")).toBe(false);
    expect(isIdParam("-1")).toBe(false);
    expect(isIdParam("")).toBe(false);
  });
});
