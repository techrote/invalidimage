import { createRng, hashWords, unitHash } from '../core/prng.js';

function parity32(v) {
  v >>>= 0;
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

function localRank(x, y, seed) {
  const values = [];
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      values.push(hashWords(seed, x + ox, y + oy));
    }
  }
  const center = values[4];
  values.sort((a, b) => a - b);
  return values.indexOf(center) / 8;
}

function blockFold(x, y, seed) {
  const block = 12;
  const bx = Math.floor(x / block);
  const by = Math.floor(y / block);
  const lx = x % block;
  const ly = y % block;
  const p = hashWords(seed, bx, by);
  const q = hashWords(seed ^ 0xa511e9b3, by, bx);
  const rx = (lx + (p % block) + ((q >>> 4) % block)) % block;
  const ry = (ly + (q % block) + ((p >>> 7) % block)) % block;
  return hashWords(seed, bx, by, rx, ry) / 0xffffffff;
}

function recursiveMesh(x, y, frame, seed) {
  const a = parity32((x ^ (frame >> 2)) + (seed & 255));
  const b = parity32((y + (frame >> 3)) ^ ((seed >>> 8) & 255));
  const c = parity32((x + y) ^ (frame >> 1));
  return (a + b + c) / 3;
}

function reactionApprox(x, y, frame, seed) {
  const nx = x * 0.037 + frame * 0.004;
  const ny = y * 0.041 - frame * 0.003;
  const a = Math.sin(nx * 2.1 + Math.cos(ny * 1.7));
  const b = Math.cos(ny * 2.3 + Math.sin(nx * 1.3));
  const jitter = unitHash(seed, x >> 2, y >> 2) - 0.5;
  return Math.max(0, Math.min(1, 0.5 + (a * b) * 0.34 + jitter * 0.18));
}

function level(v) {
  if (v < 0.15) return 0;
  if (v < 0.31) return 1;
  if (v < 0.49) return 2;
  if (v < 0.68) return 3;
  if (v < 0.84) return 4;
  return 5;
}

const BASE = Object.freeze([
  [8, 10, 18], [20, 46, 63], [21, 111, 119],
  [73, 195, 190], [202, 75, 169], [113, 72, 190]
]);

export function makeSurface(width, height, seed, frame = 0) {
  const rng = createRng(seed);
  const out = new Uint8ClampedArray(width * height * 4);
  const mix = 0.34 + rng.next() * 0.22;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = parity32(x) ^ parity32(y);
      const a = blockFold(x, y, seed);
      const b = localRank(x >> 2, y >> 2, seed ^ 0x3c6ef372);
      const c = recursiveMesh(x >> 1, y >> 1, frame, seed);
      const d = reactionApprox(x, y, frame, seed);
      let v = a * 0.27 + b * 0.23 + c * 0.18 + d * 0.32;
      if (p) v = v * (1 - mix) + Math.abs(0.5 - v) * 2 * mix;
      const band = level(v);
      const colour = BASE[(band + ((x >> 5) ^ (y >> 5))) % BASE.length];
      const i = (y * width + x) * 4;
      out[i] = Math.min(255, colour[0] + Math.floor(v * 40));
      out[i + 1] = Math.min(255, colour[1] + Math.floor((1 - v) * 28));
      out[i + 2] = Math.min(255, colour[2] + ((hashWords(seed, x, y) >>> 29) * 5));
      out[i + 3] = 255;
    }
  }
  return out;
}
