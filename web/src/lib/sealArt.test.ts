import { describe, expect, it } from "vitest";
import { bandFor, hashBytes, sealFor } from "./sealArt";

const A = "6f1539f38a1105ba09e4d2c9620c748c49158b8eb64e4cdbb9efdf0bb0358685";
const B = "6f1539f38a1105ba09e4d2c9620c748c49158b8eb64e4cdbb9efdf0bb0358686";

describe("seal art", () => {
  it("reads a hex hash byte for byte", () => {
    expect(hashBytes(A).slice(0, 3)).toEqual([0x6f, 0x15, 0x39]);
    expect(hashBytes("ed25519:Abc").length).toBe(32);
  });
  it("draws the same seal for the same hash", () => {
    expect(sealFor(A)).toEqual(sealFor(A));
    expect(bandFor(A)).toEqual(bandFor(A));
  });
  it("redraws the whole seal when only the last bit changes", () => {
    const a = sealFor(A);
    const b = sealFor(B);
    expect(a.ticks.map((t) => t.long)).not.toEqual(b.ticks.map((t) => t.long));
    expect(a.rings[0].d).not.toEqual(b.rings[0].d);
    expect(bandFor(A)).not.toEqual(bandFor(B));
  });
  it("has 96 ticks and closed rings", () => {
    const s = sealFor(A);
    expect(s.ticks).toHaveLength(96);
    expect(s.rings.every((r) => r.d.startsWith("M") && r.d.endsWith("Z"))).toBe(true);
  });
});
