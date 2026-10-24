/**
 * The test-set commitment, computed in the author's browser before
 * registering a set. Must match `set_commitment` in grader/src/lib.rs byte for
 * byte: SHA-256 (hex) of `JSON.stringify` of the items as
 * `{id, channel, from, text, label}` objects, in set order.
 */

export type Label = "SCAM" | "LEGIT";

export interface TestItem {
  id: string;
  channel: string;
  from: string;
  text: string;
  label: Label;
}

export function canonicalJson(items: TestItem[]): string {
  return JSON.stringify(
    items.map((i) => ({ id: i.id, channel: i.channel, from: i.from, text: i.text, label: i.label })),
  );
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function setCommitment(items: TestItem[]): Promise<string> {
  return sha256Hex(canonicalJson(items));
}

export interface ParsedSet {
  items: TestItem[];
  scams: number;
  legit: number;
}

const CHANNELS = new Set(["sms", "email", "whatsapp", "voice_transcript", "social_dm"]);

/**
 * Parse and check an uploaded set: either an array of items or an object with
 * an `items` array. Extra fields (category, rationale...) are allowed and
 * ignored by the commitment, since the grader never sends them to a model.
 */
export function parseTestSet(raw: string): ParsedSet {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Expected a non-empty array of items, or an object with an `items` array.");
  }
  if (list.length > 10_000) throw new Error("At most 10,000 items.");
  const seen = new Set<string>();
  const items = list.map((x, n): TestItem => {
    const where = `Item ${n + 1}`;
    if (typeof x !== "object" || x === null) throw new Error(`${where} is not an object.`);
    const it = x as Record<string, unknown>;
    for (const k of ["id", "channel", "from", "text", "label"]) {
      if (typeof it[k] !== "string" || (it[k] as string).length === 0) {
        throw new Error(`${where} needs a non-empty string \`${k}\`.`);
      }
    }
    const id = it.id as string;
    if (seen.has(id)) throw new Error(`${where}: duplicate id "${id}".`);
    seen.add(id);
    if (it.label !== "SCAM" && it.label !== "LEGIT") {
      throw new Error(`${where}: label must be "SCAM" or "LEGIT".`);
    }
    if (!CHANNELS.has(it.channel as string)) {
      throw new Error(`${where}: channel must be one of ${[...CHANNELS].join(", ")}.`);
    }
    return { id, channel: it.channel as string, from: it.from as string, text: it.text as string, label: it.label as Label };
  });
  const scams = items.filter((i) => i.label === "SCAM").length;
  return { items, scams, legit: items.length - scams };
}
