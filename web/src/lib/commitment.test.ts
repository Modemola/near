import { describe, expect, it } from "vitest";
import { canonicalJson, parseTestSet, setCommitment } from "./commitment";

describe("setCommitment", () => {
  it("matches the grader's Rust implementation byte for byte", async () => {
    // Same item and expected hash as `commitment_matches_the_javascript_canonical_form`
    // in grader/src/tests.rs.
    const items = [
      {
        id: "p-1",
        channel: "sms",
        from: "Mum (saved contact)",
        text: "Line one\nnоrthfield \u{1F600} \"quoted\" \\ tab\there",
        label: "SCAM" as const,
      },
    ];
    expect(await setCommitment(items)).toBe("6f1539f38a1105ba09e4d2c9620c748c49158b8eb64e4cdbb9efdf0bb0358685");
  });

  it("ignores extra fields but not order, text or labels", async () => {
    const a = parseTestSet(
      JSON.stringify({
        items: [
          { id: "a", channel: "sms", from: "x", text: "one", label: "SCAM", category: "c", rationale: "r" },
          { id: "b", channel: "email", from: "y", text: "two", label: "LEGIT" },
        ],
      }),
    ).items;
    const base = await setCommitment(a);
    expect(canonicalJson(a)).not.toContain("rationale");
    expect(await setCommitment([a[1], a[0]])).not.toBe(base);
    expect(await setCommitment([{ ...a[0], label: "LEGIT" }, a[1]])).not.toBe(base);
    expect(await setCommitment([{ ...a[0], text: "one " }, a[1]])).not.toBe(base);
  });
});

describe("parseTestSet", () => {
  const ok = { id: "a", channel: "sms", from: "x", text: "t", label: "SCAM" };
  it("accepts an array or an object with items and counts labels", () => {
    expect(parseTestSet(JSON.stringify([ok])).scams).toBe(1);
    expect(parseTestSet(JSON.stringify({ items: [ok, { ...ok, id: "b", label: "LEGIT" }] })).legit).toBe(1);
  });
  it("rejects bad input with a readable reason", () => {
    expect(() => parseTestSet("{")).toThrow(/not valid JSON/);
    expect(() => parseTestSet("[]")).toThrow(/non-empty/);
    expect(() => parseTestSet(JSON.stringify([{ ...ok, label: "scam" }]))).toThrow(/label/);
    expect(() => parseTestSet(JSON.stringify([ok, ok]))).toThrow(/duplicate id/);
    expect(() => parseTestSet(JSON.stringify([{ ...ok, channel: "fax" }]))).toThrow(/channel/);
    expect(() => parseTestSet(JSON.stringify([{ ...ok, text: "" }]))).toThrow(/text/);
  });
  it("parses the committed public sample", async () => {
    const fs = await import("node:fs");
    const raw = fs.readFileSync(new URL("../../../data/public-sample/scam-sample.json", import.meta.url), "utf8");
    const set = parseTestSet(raw);
    expect(set.items.length).toBe(20);
    expect(set.scams).toBe(11);
  });
});
