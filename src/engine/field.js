import { signedHash } from '../core/prng.js';

const DIRECTIONS = {
  4: [[1,0],[0,1],[-1,0],[0,-1]],
  8: [[1,0],[.707,.707],[0,1],[-.707,.707],[-1,0],[-.707,-.707],[0,-1],[.707,-.707]],
  16: Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI * 2 / 16;
    return [Math.cos(angle), Math.sin(angle)];
  })
};

function directionIndex(vx, vy, sectors) {
  if (vx === 0 && vy === 0) return 0;

  if (sectors === 4) {
    if (Math.abs(vx) >= Math.abs(vy)) return vx >= 0 ? 0 : 2;
    return vy >= 0 ? 1 : 3;
  }

  if (sectors === 8) {
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    const diagonalThreshold = (1 - 0.707) / 0.707;

    if (ay <= ax * diagonalThreshold) return vx >= 0 ? 0 : 4;
    if (ax <= ay * diagonalThreshold) return vy >= 0 ? 2 : 6;
    if (vx >= 0) return vy >= 0 ? 1 : 7;
    return vy >= 0 ? 3 : 5;
  }

  const table = DIRECTIONS[sectors] || DIRECTIONS[8];
  let bestIndex = 0;
  let score = -Infinity;
  for (let i = 0; i < table.length; i++) {
    const direction = table[i];
    const dot = vx * direction[0] + vy * direction[1];
    if (dot > score) {
      score = dot;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function quantize(vx, vy, sectors) {
  if (vx === 0 && vy === 0) return [0, 0];
  const table = DIRECTIONS[sectors] || DIRECTIONS[8];
  const direction = table[directionIndex(vx, vy, sectors)];
  const magnitude = Math.max(Math.abs(vx), Math.abs(vy));
  return [direction[0] * magnitude, direction[1] * magnitude];
}

function temporalNoise(seed, nx, ny, micro, salt) {
  const a = signedHash(seed, nx, ny, micro.fieldGroup, salt);
  if (micro.fieldPhase === 0 || micro.fieldNextGroup === micro.fieldGroup) {
    return a * micro.noiseAmount;
  }

  const b = signedHash(seed, nx, ny, micro.fieldNextGroup, salt);
  return (a + (b - a) * micro.fieldPhase) * micro.noiseAmount;
}

function vectorComponents(x, y, micro, noiseX, noiseY) {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const distance = Math.max(Math.abs(cx), Math.abs(cy)) + 1e-6;
  const falloff = Math.max(0, 1 - distance * 1.55);

  const attract = micro.attraction * falloff;
  let vx = (-cx / distance) * attract;
  let vy = (-cy / distance) * attract;

  vx += -cy * micro.swirl;
  vy += cx * micro.swirl;
  vx += noiseX;
  vy += noiseY;

  return [vx, vy];
}

/**
 * Sample the local vector field using already-resolved micro modulation.
 * frame is retained in the signature for compatibility but deliberately is not
 * consulted here: temporal identity is owned by micro.fieldGroup/fieldPhase.
 */
export function sampleVector(x, y, frame, state, micro) {
  void frame;
  const cell = 18 + ((state.seed >>> 3) % 29);
  const nx = Math.floor(x * cell);
  const ny = Math.floor(y * cell);
  const noiseX = temporalNoise(state.seed, nx, ny, micro, 0x243f6a88);
  const noiseY = temporalNoise(state.seed, nx, ny, micro, 0xb7e15162);
  const [vx, vy] = vectorComponents(x, y, micro, noiseX, noiseY);
  return quantize(vx, vy, Number(micro.directions));
}

export function warpImage(input, width, height, frame, state, micro) {
  void frame;
  const out = new Uint8ClampedArray(input.length);
  const scale = micro.localWarp * Math.min(width, height) * 0.075;
  const sectors = Number(micro.directions);
  const table = DIRECTIONS[sectors] || DIRECTIONS[8];

  const cell = 18 + ((state.seed >>> 3) % 29);
  const side = cell + 1;
  const noiseX = new Float64Array(side * side);
  const noiseY = new Float64Array(side * side);

  for (let ny = 0; ny < side; ny++) {
    for (let nx = 0; nx < side; nx++) {
      const index = ny * side + nx;
      const x0 = signedHash(state.seed, nx, ny, micro.fieldGroup, 0x243f6a88);
      const y0 = signedHash(state.seed, nx, ny, micro.fieldGroup, 0xb7e15162);

      if (micro.fieldPhase === 0 || micro.fieldNextGroup === micro.fieldGroup) {
        noiseX[index] = x0 * micro.noiseAmount;
        noiseY[index] = y0 * micro.noiseAmount;
      } else {
        const x1 = signedHash(state.seed, nx, ny, micro.fieldNextGroup, 0x243f6a88);
        const y1 = signedHash(state.seed, nx, ny, micro.fieldNextGroup, 0xb7e15162);
        noiseX[index] = (x0 + (x1 - x0) * micro.fieldPhase) * micro.noiseAmount;
        noiseY[index] = (y0 + (y1 - y0) * micro.fieldPhase) * micro.noiseAmount;
      }
    }
  }

  const widthDenominator = Math.max(1, width - 1);
  const heightDenominator = Math.max(1, height - 1);

  for (let y = 0; y < height; y++) {
    const v = y / heightDenominator;
    const ny = Math.floor(v * cell);
    const cy = v - 0.5;

    for (let x = 0; x < width; x++) {
      const u = x / widthDenominator;
      const nx = Math.floor(u * cell);
      const noiseIndex = ny * side + nx;
      const cx = u - 0.5;
      const distance = Math.max(Math.abs(cx), Math.abs(cy)) + 1e-6;
      const falloff = Math.max(0, 1 - distance * 1.55);
      const attract = micro.attraction * falloff;

      let vx = (-cx / distance) * attract;
      let vy = (-cy / distance) * attract;
      vx += -cy * micro.swirl;
      vy += cx * micro.swirl;
      vx += noiseX[noiseIndex];
      vy += noiseY[noiseIndex];

      const direction = table[directionIndex(vx, vy, sectors)];
      const magnitude = Math.max(Math.abs(vx), Math.abs(vy));
      const qx = direction[0] * magnitude;
      const qy = direction[1] * magnitude;

      const sx = Math.max(0, Math.min(width - 1, Math.round(x + qx * scale)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(y + qy * scale)));
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
