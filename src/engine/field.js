import { signedHash } from '../core/prng.js';

const DIRECTIONS = {
  4: [[1,0],[0,1],[-1,0],[0,-1]],
  8: [[1,0],[.707,.707],[0,1],[-.707,.707],[-1,0],[-.707,-.707],[0,-1],[.707,-.707]],
  16: Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI * 2 / 16;
    return [Math.cos(angle), Math.sin(angle)];
  })
};

function quantize(vx, vy, sectors) {
  const table = DIRECTIONS[sectors] || DIRECTIONS[8];
  if (vx === 0 && vy === 0) return [0, 0];
  const magnitude = Math.max(Math.abs(vx), Math.abs(vy));
  let best = table[0];
  let score = -Infinity;
  for (const direction of table) {
    const dot = vx * direction[0] + vy * direction[1];
    if (dot > score) {
      score = dot;
      best = direction;
    }
  }
  return [best[0] * magnitude, best[1] * magnitude];
}

export function sampleVector(x, y, frame, state) {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const distance = Math.max(Math.abs(cx), Math.abs(cy)) + 1e-6;
  const falloff = Math.max(0, 1 - distance * 1.55);

  const attract = state.pressure * falloff;
  let vx = (-cx / distance) * attract;
  let vy = (-cy / distance) * attract;

  const spin = 0.25 + state.displacement * 0.9;
  vx += -cy * spin;
  vy += cx * spin;

  const cell = 18 + ((state.seed >>> 3) % 29);
  const nx = Math.floor(x * cell);
  const ny = Math.floor(y * cell);
  vx += signedHash(state.seed, nx, ny, frame >> 2, 0x243f6a88) * 0.17;
  vy += signedHash(state.seed, nx, ny, frame >> 2, 0xb7e15162) * 0.17;

  return quantize(vx, vy, Number(state.directions));
}

export function warpImage(input, width, height, frame, state) {
  const out = new Uint8ClampedArray(input.length);
  const scale = state.displacement * Math.min(width, height) * 0.075;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      const [vx, vy] = sampleVector(u, v, frame, state);
      const sx = Math.max(0, Math.min(width - 1, Math.round(x + vx * scale)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(y + vy * scale)));
      const src = (sy * width + sx) * 4;
      const dst = (y * width + x) * 4;
      out[dst] = input[src];
      out[dst + 1] = input[src + 1];
      out[dst + 2] = input[src + 2];
      out[dst + 3] = input[src + 3];
    }
  }

  return out;
}
