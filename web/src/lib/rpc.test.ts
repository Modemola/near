import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { rpc } from "./near";

const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("rpc", () => {
  it("hands over to the fallback endpoint when the first is rate-limited", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(url);
      if (url === config.rpcUrl) return new Response("busy", { status: 429 });
      return ok({ height: 7 });
    });
    expect(await rpc("block", {})).toEqual({ height: 7 });
    expect(seen).toEqual([config.rpcUrl, config.rpcFallbackUrls[0]]);
  });

  it("treats a refused cross-origin request (TypeError) as busy too", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      if (n++ < 1) throw new TypeError("Failed to fetch");
      return ok(1);
    });
    expect(await rpc("block", {})).toBe(1);
  });

  it("does not retry errors the chain itself returns", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_BLOCK" } } }), { status: 200 });
    });
    await expect(rpc("block", { block_id: 1 })).rejects.toThrow(/UNKNOWN_BLOCK/);
    expect(n).toBe(1);
  });
});
