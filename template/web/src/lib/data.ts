/**
 * Sample data with realistic delays, so loading, empty and error states are
 * visible from the first minute. Replace these functions with calls to your
 * API (lib/api.ts) and keep their shapes, and the pages keep working.
 *
 * Try the states: add ?empty or ?fail to any address.
 */
export interface Item {
  id: string;
  name: string;
  summary: string;
  /** The hero number, 0 to 100. */
  score: number;
  /** Two secondary figures, shown as bars. */
  a: number;
  b: number;
  /** How many independent parts back the score; the ceremony checks each one. */
  parts: number;
  updated: string;
}

const ITEMS: Item[] = [
  { id: "aurora-7", name: "Aurora 7", summary: "The strongest all-rounder in the sample.", score: 92.5, a: 95, b: 4, parts: 40, updated: "2026-10-20" },
  { id: "kestrel", name: "Kestrel", summary: "Fast, with a few more misses.", score: 86.0, a: 88, b: 9, parts: 40, updated: "2026-10-18" },
  { id: "basalt-2", name: "Basalt 2", summary: "Careful: fewer false alarms, more misses.", score: 81.3, a: 76, b: 2, parts: 40, updated: "2026-10-15" },
  { id: "tern", name: "Tern", summary: "A small model that holds up well.", score: 74.8, a: 79, b: 14, parts: 40, updated: "2026-10-11" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mode = () => (typeof location === "undefined" ? "" : location.search);

async function respond<T>(value: T, ms = 600): Promise<T> {
  await wait(ms);
  if (mode().includes("fail")) throw new Error("Failed to fetch");
  return value;
}

export const data = {
  items: () => respond(mode().includes("empty") ? [] : [...ITEMS].sort((x, y) => y.score - x.score)),
  item: (id: string) => respond(ITEMS.find((i) => i.id === id) ?? null),
  /** Creates an item; rejects a taken id the way a real API would. */
  create: async (draft: { id: string; name: string; summary: string }) => {
    await wait(900);
    if (ITEMS.some((i) => i.id === draft.id)) throw new Error("That id is already taken. Choose another.");
    const item: Item = { ...draft, score: 0, a: 0, b: 0, parts: 0, updated: new Date().toISOString().slice(0, 10) };
    ITEMS.push(item);
    return item;
  },
};

export interface CheckReport {
  checked: number;
  passed: number;
  problems: string[];
}

/**
 * The signature moment's work: check every part behind a result, reporting
 * progress as it goes. Replace with the real check (signatures, hashes, a
 * recount); the Ceremony component only needs this shape.
 */
export async function checkItem(id: string, onProgress: (msg: string) => void): Promise<CheckReport> {
  const item = await data.item(id);
  if (!item) throw new Error("not found");
  onProgress(`Fetching the ${item.parts} parts…`);
  await wait(900);
  onProgress(`Checking ${item.parts} of ${item.parts}…`);
  await wait(1200);
  onProgress("Adding them up…");
  await wait(500);
  return { checked: item.parts, passed: item.parts, problems: [] };
}
