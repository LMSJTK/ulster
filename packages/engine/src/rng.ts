/**
 * Seeded RNG (mulberry32). The simulation must be fully deterministic for a
 * given seed, so all randomness flows through here. To keep determinism
 * independent of call ordering across systems, derive a fresh stream per
 * purpose with `derive(seed, ...labels)` rather than sharing one stream.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a deterministic sub-stream from a seed and a list of labels. */
export function derive(seed: number, ...labels: (string | number)[]): Rng {
  let h = seed >>> 0;
  for (const label of labels) {
    const s = String(label);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
      h = (h << 13) | (h >>> 19);
    }
  }
  return mulberry32(h >>> 0);
}

/** Integer in [min, max], inclusive. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngPick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Pick n distinct elements. */
export function rngPickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function rngChance(rng: Rng, p: number): boolean {
  return rng() < p;
}
