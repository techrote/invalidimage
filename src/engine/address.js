const CHANNEL_ORDERS = Object.freeze([
  Object.freeze([0, 1, 2, 3]),
  Object.freeze([1, 2, 0, 3]),
  Object.freeze([2, 0, 1, 3]),
  Object.freeze([0, 2, 3, 1]),
  Object.freeze([3, 1, 0, 2])
]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rotateByte(value, amount) {
  const rotation = amount & 7;
  if (rotation === 0) return value & 255;
  return ((value << rotation) | (value >>> (8 - rotation))) & 255;
}

function normalizedOrder(index) {
  const safe = Math.trunc(Number.isFinite(index) ? index : 0);
  return CHANNEL_ORDERS[((safe % CHANNEL_ORDERS.length) + CHANNEL_ORDERS.length) % CHANNEL_ORDERS.length];
}

/**
 * Apply address/global transforms using already-resolved macro state.
 *
 * The manual path deliberately has no frame/router inputs. Its XOR effect blends
 * toward a deterministic identity byte by addressAmount, while the legacy path
 * preserves the previous bit-mask behaviour for compatibility.
 */
export function addressTransform(input, width, height, state, macro = {}) {
  if (!state.addressing) return input.slice();

  const manual = macro.manualMode === 1;
  const globalAmount = clamp(Number(macro.globalAmount) || 0, 0, 1);
  if (manual && globalAmount === 0) return input.slice();

  const out = new Uint8ClampedArray(input.length);
  const order = normalizedOrder(macro.channelOrderIndex);
  const byteStride = Math.trunc(Number(macro.byteStride) || 0);
  const rowSkew = Math.trunc(Number(macro.rowSkew) || 0);
  const xorMask = Math.trunc(Number(macro.xorMask) || 0) & 255;
  const xorIdentity = Math.trunc(Number(macro.xorIdentity) || 0) & 255;
  const addressAmount = clamp(Number(macro.addressAmount) || 0, 0, 1);
  const rotate = Math.trunc(Number(macro.byteRotation) || 0) & 7;
  const patternPhase = manual ? (xorIdentity & 3) : (Math.trunc(Number(macro.routeIndex) || 0) & 3);

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const dst = rowBase + x * 4;
      const logical = dst + byteStride * 4 + rowSkew * y;
      const srcBase = ((logical % input.length) + input.length) % input.length;

      for (let channel = 0; channel < 4; channel++) {
        let value = input[(srcBase + order[channel]) % input.length];

        if (channel !== 3 && ((x + y + patternPhase) & 3) === channel) {
          if (manual) {
            const xored = value ^ xorIdentity;
            value = Math.round(value + (xored - value) * addressAmount);
          } else {
            value ^= xorMask;
          }
        }

        if (channel !== 3 && !manual && macro.routeIndex === 2) {
          value = rotateByte(value, rotate);
        }

        out[dst + channel] = value;
      }
    }
  }

  return out;
}
