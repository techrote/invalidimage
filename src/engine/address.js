import { hashWords } from '../core/prng.js';

function rotateByte(value, amount) {
  const rotation = amount & 7;
  if (rotation === 0) return value & 255;
  return ((value << rotation) | (value >>> (8 - rotation))) & 255;
}

function channelOrder(seed, phase) {
  const orders = [
    [0, 1, 2, 3],
    [1, 2, 0, 3],
    [2, 0, 1, 3],
    [0, 2, 3, 1],
    [3, 1, 0, 2]
  ];
  return orders[hashWords(seed, phase) % orders.length];
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function calmRowSkew(seed, frame, pressure) {
  const span = 48;
  const position = Math.max(0, frame) / span;
  const group = Math.floor(position);
  const t = smoothstep(position - group);
  const a = (hashWords(seed, group, 0x6a09e667) & 31) - 16;
  const b = (hashWords(seed, group + 1, 0x6a09e667) & 31) - 16;
  const scale = Math.max(1, Math.round(pressure * 2));
  return Math.round((a + (b - a) * t) * scale);
}

export function addressTransform(input, width, height, frame, state, phase) {
  if (!state.addressing) return input.slice();

  const out = new Uint8ClampedArray(input.length);
  const order = channelOrder(state.seed, phase);
  const byteStride = Math.round((state.memory - 0.5) * width * 0.22) * 4;

  const rowSkew = state.calm
    ? calmRowSkew(state.seed, frame, state.pressure)
    : ((hashWords(state.seed, frame >> 3) & 31) - 16) * Math.max(1, Math.round(state.pressure * 3));

  // Calm mode keeps the destructive mask stable within a route. The route
  // transition itself is then handled temporally by the pipeline instead of
  // introducing another unrelated hard flash every 16 frames.
  const xorMask = state.calm
    ? (hashWords(state.seed, phase, 0xbb67ae85) >>> 24) & Math.round(state.pressure * 160)
    : (hashWords(state.seed, phase, frame >> 4) >>> 24) & Math.round(state.pressure * 255);

  const rotate = (phase + Math.floor(state.autonomy * 7)) & 7;

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const dst = rowBase + x * 4;
      const logical = dst + byteStride * 4 + rowSkew * y;
      const srcBase = ((logical % input.length) + input.length) % input.length;

      for (let channel = 0; channel < 4; channel++) {
        let value = input[(srcBase + order[channel]) % input.length];
        if (channel !== 3 && ((x + y + phase) & 3) === channel) value ^= xorMask;
        if (channel !== 3 && phase === 2) value = rotateByte(value, rotate);
        out[dst + channel] = value;
      }
    }
  }

  return out;
}
