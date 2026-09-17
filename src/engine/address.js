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

export function addressTransform(input, width, height, frame, state, phase) {
  if (!state.addressing) return input.slice();

  const out = new Uint8ClampedArray(input.length);
  const order = channelOrder(state.seed, phase);
  const byteStride = Math.round((state.memory - 0.5) * width * 0.22) * 4;
  const rowSkew = ((hashWords(state.seed, frame >> 3) & 31) - 16) * Math.max(1, Math.round(state.pressure * 3));
  const xorMask = (hashWords(state.seed, phase, frame >> 4) >>> 24) & Math.round(state.pressure * 255);
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
