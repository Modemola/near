/**
 * Generative seals drawn from a hash, so every test and certificate has its
 * own recognisable mark. A changed hash gives a visibly different seal.
 * Pure functions: same input, same drawing.
 */

/** 32 bytes from a hex hash, or a stable expansion of any other string (base58 keys, ids). */
export function hashBytes(input: string): number[] {
  const hex = input.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(hex)) return Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  const out: number[] = [];
  let h = 0x811c9dc5;
  for (let i = 0; out.length < 32; i++) {
    h ^= input.charCodeAt(i % Math.max(1, input.length)) + i;
    h = Math.imul(h, 0x01000193) >>> 0;
    out.push((h >>> 16) & 0xff);
  }
  return out;
}

const f = (n: number) => n.toFixed(1);

/**
 * Mix every byte into every output byte (FNV-1a over the whole hash, seeded
 * per position), so changing any bit of the input redraws the whole seal.
 */
export function artBytes(input: string): number[] {
  const b = hashBytes(input);
  return Array.from({ length: 32 }, (_, i) => {
    let h = (0x811c9dc5 ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
    for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    return h & 0xff;
  });
}

/** A closed curve r(θ) = R + a·sin(kθ + p), the building block of guilloché rosettes. */
export function rosette(cx: number, cy: number, R: number, a: number, k: number, p: number, steps = 180): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = R + a * Math.sin(k * t + p);
    d += `${i ? "L" : "M"}${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`;
  }
  return d + "Z";
}

export interface Seal {
  rings: { d: string; o: number }[];
  ticks: { x1: number; y1: number; x2: number; y2: number; long: boolean }[];
}

/** A seal in a 200×200 box: three woven guilloché bands and a ring of 96 ticks, drawn from all 256 bits. */
export function sealFor(hash: string): Seal {
  const b = artBytes(hash);
  const rings: Seal["rings"] = [];
  const bands = [
    { R: 78, i: 0 },
    { R: 60, i: 4 },
    { R: 42, i: 8 },
  ];
  for (const { R, i } of bands) {
    const k = 5 + (b[i] % 11);
    const a = R * (0.05 + (b[i + 1] % 8) / 100);
    const copies = 5 + (b[i + 2] % 3);
    const base = (b[i + 3] / 255) * Math.PI * 2;
    for (let j = 0; j < copies; j++) rings.push({ d: rosette(100, 100, R, a, k, base + (j * Math.PI * 2) / (k * copies)), o: 0.55 + 0.45 * ((j % 2) as number) });
  }
  const ticks: Seal["ticks"] = [];
  for (let i = 0; i < 96; i++) {
    const bit = (b[16 + (i >> 3)] >> (i & 7)) & 1;
    const t = (i / 96) * Math.PI * 2 - Math.PI / 2;
    const r1 = 88;
    const r2 = bit ? 96 : 92;
    ticks.push({ x1: 100 + r1 * Math.cos(t), y1: 100 + r1 * Math.sin(t), x2: 100 + r2 * Math.cos(t), y2: 100 + r2 * Math.sin(t), long: !!bit });
  }
  return { rings, ticks };
}

/** A horizontal guilloché band (for certificate borders) in a width×h box. */
export function bandFor(hash: string, width = 600, h = 28, lines = 7): string[] {
  const b = artBytes(hash);
  const k1 = 3 + (b[24] % 5);
  const k2 = 7 + (b[25] % 7);
  const paths: string[] = [];
  for (let j = 0; j < lines; j++) {
    const p = (j / lines) * Math.PI * 2;
    let d = "";
    for (let x = 0; x <= width; x += 3) {
      const t = (x / width) * Math.PI * 2;
      const y = h / 2 + (h / 2 - 2) * (0.62 * Math.sin(k1 * 4 * t + p) + 0.38 * Math.sin(k2 * 4 * t - p));
      d += `${x ? "L" : "M"}${x} ${f(y)}`;
    }
    paths.push(d);
  }
  return paths;
}
