import { describe, expect, it } from "vitest";
import { friendlyError, isCancel } from "./errors";

describe("friendlyError", () => {
  it("says Cancelled when the user rejects", () => {
    const m = friendlyError(new Error("User rejected the request"));
    expect(m).toBe("Cancelled. Nothing was sent.");
    expect(isCancel(m)).toBe(true);
  });
  it("explains contract panics", () => {
    expect(friendlyError("Smart contract panicked: eval cap reached for this model on this set")).toMatch(/used all its test runs/);
    expect(friendlyError(new Error("Smart contract panicked: set id taken"))).toMatch(/already taken/);
  });
  it("explains network trouble", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Can't reach NEAR/);
    expect(friendlyError(new Error("RPC query: HTTP 429"))).toMatch(/busy/);
  });
  it("keeps unknown errors visible", () => {
    expect(friendlyError(new Error("weird"))).toBe("Something went wrong: weird");
  });
});
