import { hashWords } from './prng.js';

const TAPE = Object.freeze([
  7, 3, 11, 2, 5, 13, 1, 8, 8, 4, 21, 3, 2, 17, 5, 1,
  9, 14, 3, 6, 2, 2, 19, 7, 4, 12, 1, 23, 3, 5, 8, 2,
  16, 4, 1, 11, 6, 18, 2, 9, 5, 3, 15, 1, 7, 20, 4, 2,
  13, 6, 3, 10, 1, 24, 5, 8, 2, 17, 4, 1, 12, 7, 3, 9
]);

export function tapeValue(frame, seed) {
  const offset = hashWords(seed, 0x51f15e) % TAPE.length;
  return TAPE[(frame + offset) % TAPE.length];
}

export function advanceLatch(state, frame, energy, seed, autonomy) {
  const pulse = tapeValue(frame, seed);
  const threshold = 6 + Math.floor((1 - autonomy) * 16);
  let charge = state.charge + Math.max(0, energy * 0.018) + (pulse % 3) * 0.03;
  let phase = state.phase;
  let flips = state.flips;

  if (charge > threshold && (frame + pulse) % Math.max(2, 15 - (pulse % 9)) === 0) {
    phase = (phase + 1 + (pulse % 2)) & 3;
    charge *= 0.21 + ((pulse % 5) * 0.07);
    flips += 1;
  }

  return { phase, charge, flips, pulse };
}
