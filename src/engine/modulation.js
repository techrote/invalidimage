import { hashWords } from '../core/prng.js';

const MAX_DIMENSION = 0x7fffffff;
const MAX_FRAME = Number.MAX_SAFE_INTEGER;
const MAX_TEXTURE_MOTION = 2;
const MAX_SWIRL = 1.5;
const MAX_NOISE_AMOUNT = 0.34;
const VALID_DIRECTIONS = Object.freeze([4, 8, 16]);
const PALETTE_COUNT = 3;
const CHANNEL_ORDER_COUNT = 5;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unitValue(value) {
  return clamp(finiteNumber(value), 0, 1);
}

function normalizedFrame(frame) {
  return Math.trunc(clamp(finiteNumber(frame), 0, MAX_FRAME));
}

function normalizedWidth(width) {
  return Math.trunc(clamp(finiteNumber(width, 1), 1, MAX_DIMENSION));
}

function normalizedDirections(value) {
  const directions = Math.trunc(finiteNumber(value, 8));
  return VALID_DIRECTIONS.includes(directions) ? directions : 8;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function fieldTemporalState(frame, calm, textureMotion) {
  if (textureMotion === 0) {
    return { group: 0, nextGroup: 0, phase: 0 };
  }

  const span = calm ? 32 : 4;
  const position = (frame * textureMotion) / span;
  const group = Math.floor(position);

  if (!calm) {
    return { group, nextGroup: group, phase: 0 };
  }

  return {
    group,
    nextGroup: group + 1,
    phase: smoothstep(position - group)
  };
}

function calmRowSkew(seed, frame, pressure) {
  const position = frame / 48;
  const group = Math.floor(position);
  const t = smoothstep(position - group);
  const a = (hashWords(seed, group, 0x6a09e667) & 31) - 16;
  const b = (hashWords(seed, group + 1, 0x6a09e667) & 31) - 16;
  const scale = Math.max(1, Math.round(pressure * 2));
  return Math.round((a + (b - a) * t) * scale);
}

function legacyRowSkew(seed, frame, pressure) {
  return ((hashWords(seed, frame >> 3) & 31) - 16) * Math.max(1, Math.round(pressure * 3));
}

function byteStrideFor(memory, width) {
  return Math.round((memory - 0.5) * width * 0.22) * 4;
}

function effectiveFeedbackAmount(memory, calm, transition) {
  const requested = calm
    ? Math.min(0.985, memory + 0.06 + transition * 0.18)
    : memory;
  // mixFrames() clamps the actually applied retention to 0.98.
  return clamp(requested, 0, 0.98);
}

/**
 * Return numeric bounds for the resolved modulation contract.
 *
 * byteStride depends on render width, so its bound is computed for the supplied
 * width. textureComplexity is a normalized creative control; noiseAmount is its
 * effective continuous perturbation amplitude.
 */
export function modulationBounds(width = 1) {
  const safeWidth = normalizedWidth(width);
  const minimumStride = byteStrideFor(0, safeWidth);
  const maximumStride = byteStrideFor(1, safeWidth);
  const maximumFieldGroup = Math.floor((MAX_FRAME * MAX_TEXTURE_MOTION) / 4) + 1;

  return {
    micro: {
      textureMotion: [0, MAX_TEXTURE_MOTION],
      textureComplexity: [0, 1],
      fieldGroup: [0, maximumFieldGroup],
      fieldNextGroup: [0, maximumFieldGroup],
      fieldPhase: [0, 1],
      noiseAmount: [0, MAX_NOISE_AMOUNT],
      attraction: [0, 1],
      swirl: [0, MAX_SWIRL],
      localWarp: [0, 1],
      warpAmount: [0, 1],
      directions: [4, 16],
      feedbackAmount: [0, 0.98]
    },
    macro: {
      rowSkew: [-48, 48],
      byteStride: [minimumStride, maximumStride],
      xorAmount: [0, 255],
      xorIdentity: [0, 255],
      xorMask: [0, 255],
      feedbackX: [-8, 8],
      feedbackY: [-4, 4],
      routeIndex: [0, 3],
      palettePosition: [0, PALETTE_COUNT - 1],
      themeAmount: [0, 1],
      paletteAlphaVariant: [0, 1],
      channelOrderIndex: [0, CHANNEL_ORDER_COUNT - 1],
      byteRotation: [0, 7]
    }
  };
}

/**
 * Resolve renderer state into explicit micro and macro dimensions.
 *
 * IMC-002 makes local field motion renderer-facing through textureMotion,
 * textureComplexity, swirl and localWarp. If those controls are absent, legacy
 * values reproduce the pre-IMC-002 defaults so headless/external callers remain
 * compatible while the UI migrates. Macro compatibility coupling is retained
 * intentionally for IMC-003/004.
 */
export function resolveModulation({ state = {}, frame = 0, router = {}, width = 1 } = {}) {
  const safeFrame = normalizedFrame(frame);
  const safeWidth = normalizedWidth(width);
  const seed = finiteNumber(state.seed) | 0;
  const autonomy = unitValue(state.autonomy);
  const displacement = unitValue(state.displacement);
  const memory = unitValue(state.memory);
  const pressure = unitValue(state.pressure);
  const calm = Boolean(state.calm);
  const addressing = Boolean(state.addressing);
  const directions = normalizedDirections(state.directions);

  const textureMotion = clamp(finiteNumber(state.textureMotion, 1), 0, MAX_TEXTURE_MOTION);
  const textureComplexity = unitValue(finiteNumber(state.textureComplexity, 0.5));
  const swirl = clamp(
    finiteNumber(state.swirl, 0.25 + displacement * 0.9),
    0,
    MAX_SWIRL
  );
  const localWarp = unitValue(finiteNumber(state.localWarp, displacement));
  const noiseAmount = textureComplexity * MAX_NOISE_AMOUNT;

  const phase = (Math.trunc(finiteNumber(router.phase)) & 3) >>> 0;
  const pulse = Math.trunc(clamp(finiteNumber(router.pulse), 0, MAX_FRAME));
  const transition = unitValue(router.transition);
  const field = fieldTemporalState(safeFrame, calm, textureMotion);

  const rawRowSkew = calm
    ? calmRowSkew(seed, safeFrame, pressure)
    : legacyRowSkew(seed, safeFrame, pressure);
  const rawByteStride = byteStrideFor(memory, safeWidth);

  const xorIdentity = calm
    ? (hashWords(seed, phase, 0xbb67ae85) >>> 24)
    : (hashWords(seed, phase, safeFrame >> 4) >>> 24);
  const xorAmount = addressing ? Math.round(pressure * (calm ? 160 : 255)) : 0;

  const feedbackX = calm
    ? Math.round(clamp(finiteNumber(router.driftX), -3, 3))
    : ((hashWords(seed, safeFrame >> 2) & 7) - 3) * Math.round(displacement * 2);
  const feedbackY = calm
    ? Math.round(clamp(finiteNumber(router.driftY), -3, 3))
    : ((pulse % 5) - 2) * Math.round(pressure * 2);

  return {
    micro: {
      textureMotion,
      textureComplexity,
      fieldGroup: field.group,
      fieldNextGroup: field.nextGroup,
      fieldPhase: field.phase,
      noiseAmount,
      attraction: pressure,
      swirl,
      localWarp,
      // Compatibility alias retained while downstream IMC work migrates.
      warpAmount: localWarp,
      directions,
      feedbackAmount: effectiveFeedbackAmount(memory, calm, transition)
    },
    macro: {
      rowSkew: addressing ? rawRowSkew : 0,
      byteStride: addressing ? rawByteStride : 0,
      xorAmount,
      xorIdentity,
      xorMask: addressing ? (xorIdentity & xorAmount) : 0,
      feedbackX,
      feedbackY,
      routeIndex: phase,
      palettePosition: phase % PALETTE_COUNT,
      themeAmount: pressure,
      paletteAlphaVariant: phase === 3 ? 1 : 0,
      channelOrderIndex: hashWords(seed, phase) % CHANNEL_ORDER_COUNT,
      byteRotation: addressing ? ((phase + Math.floor(autonomy * 7)) & 7) : 0
    }
  };
}
