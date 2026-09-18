import { hashWords } from '../core/prng.js';

const MAX_DIMENSION = 0x7fffffff;
const MAX_FRAME = Number.MAX_SAFE_INTEGER;
const MAX_TEXTURE_MOTION = 2;
const MAX_SWIRL = 1.5;
const MAX_NOISE_AMOUNT = 0.34;
const MAX_ROW_SKEW = 48;
const MAX_FEEDBACK_X = 8;
const MAX_FEEDBACK_Y = 4;
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

function signedUnitValue(value) {
  return clamp(finiteNumber(value), -1, 1);
}

function canonicalZero(value) {
  return Object.is(value, -0) ? 0 : value;
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

function normalizedByte(value, fallback = 0) {
  return Math.trunc(clamp(finiteNumber(value, fallback), 0, 255));
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

function byteStrideForPan(stridePan, width) {
  return canonicalZero(Math.round(stridePan * width * 0.11) * 4);
}

function effectiveFeedbackAmount(memory, calm, transition) {
  const requested = calm
    ? Math.min(0.985, memory + 0.06 + transition * 0.18)
    : memory;
  // mixFrames() clamps the actually applied retention to 0.98.
  return clamp(requested, 0, 0.98);
}

function manualMacroState({ state, seed, width, addressing, pressure, memory, phase }) {
  const globalAmount = unitValue(finiteNumber(state.globalAmount, 1));
  const skewPan = signedUnitValue(state.skewPan);
  const stridePan = signedUnitValue(finiteNumber(state.stridePan, memory * 2 - 1));
  const requestedFeedbackX = clamp(finiteNumber(state.feedbackX), -MAX_FEEDBACK_X, MAX_FEEDBACK_X);
  const requestedFeedbackY = clamp(finiteNumber(state.feedbackY), -MAX_FEEDBACK_Y, MAX_FEEDBACK_Y);
  const requestedAddressAmount = unitValue(finiteNumber(state.addressAmount, pressure));
  const identityFallback = hashWords(seed, 0xbb67ae85) >>> 24;
  const xorIdentity = normalizedByte(state.xorIdentity, identityFallback);
  const addressAmount = addressing ? requestedAddressAmount * globalAmount : 0;

  return {
    manualMode: 1,
    globalAmount,
    skewPan,
    rowSkew: addressing ? canonicalZero(Math.round(skewPan * MAX_ROW_SKEW * globalAmount)) : 0,
    stridePan,
    byteStride: addressing ? byteStrideForPan(stridePan * globalAmount, width) : 0,
    addressAmount,
    xorAmount: Math.round(addressAmount * 255),
    xorIdentity,
    // Diagnostic approximation only. The manual address path blends toward
    // value ^ xorIdentity using addressAmount rather than AND-masking bytes.
    xorMask: Math.round(xorIdentity * addressAmount),
    feedbackX: canonicalZero(Math.round(requestedFeedbackX * globalAmount)),
    feedbackY: canonicalZero(Math.round(requestedFeedbackY * globalAmount)),
    routeIndex: phase,
    palettePosition: phase % PALETTE_COUNT,
    themeAmount: pressure,
    paletteAlphaVariant: phase === 3 ? 1 : 0,
    // Manual transform identity is deliberately independent from route/frame.
    // Route and palette are separated later by IMC-004.
    channelOrderIndex: 0,
    byteRotation: 0
  };
}

function legacyMacroState({ seed, frame, width, autonomy, displacement, memory, pressure, calm, addressing, phase, pulse, router }) {
  const rawRowSkew = calm
    ? calmRowSkew(seed, frame, pressure)
    : legacyRowSkew(seed, frame, pressure);
  const rawByteStride = byteStrideFor(memory, width);

  const xorIdentity = calm
    ? (hashWords(seed, phase, 0xbb67ae85) >>> 24)
    : (hashWords(seed, phase, frame >> 4) >>> 24);
  const xorAmount = addressing ? Math.round(pressure * (calm ? 160 : 255)) : 0;

  const feedbackX = calm
    ? Math.round(clamp(finiteNumber(router.driftX), -3, 3))
    : ((hashWords(seed, frame >> 2) & 7) - 3) * Math.round(displacement * 2);
  const feedbackY = calm
    ? Math.round(clamp(finiteNumber(router.driftY), -3, 3))
    : ((pulse % 5) - 2) * Math.round(pressure * 2);

  return {
    manualMode: 0,
    globalAmount: 1,
    skewPan: clamp(rawRowSkew / MAX_ROW_SKEW, -1, 1),
    rowSkew: addressing ? rawRowSkew : 0,
    stridePan: memory * 2 - 1,
    byteStride: addressing ? rawByteStride : 0,
    addressAmount: addressing ? xorAmount / 255 : 0,
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
  };
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
      manualMode: [0, 1],
      globalAmount: [0, 1],
      skewPan: [-1, 1],
      rowSkew: [-MAX_ROW_SKEW, MAX_ROW_SKEW],
      stridePan: [-1, 1],
      byteStride: [minimumStride, maximumStride],
      addressAmount: [0, 1],
      xorAmount: [0, 255],
      xorIdentity: [0, 255],
      xorMask: [0, 255],
      feedbackX: [-MAX_FEEDBACK_X, MAX_FEEDBACK_X],
      feedbackY: [-MAX_FEEDBACK_Y, MAX_FEEDBACK_Y],
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
 * Local field controls are renderer-facing through textureMotion,
 * textureComplexity, swirl and localWarp. IMC-003 adds an explicit manual macro
 * transform path selected with state.macroMode === 'manual'. In that mode row
 * skew, stride, destructive address amount/identity and feedback translation are
 * functions only of seed + explicit controls and never of frame/router drift.
 * Omitted/legacy macroMode values retain the deterministic compatibility path.
 * Route/palette coupling intentionally remains for IMC-004.
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

  const macroArgs = {
    state,
    seed,
    frame: safeFrame,
    width: safeWidth,
    autonomy,
    displacement,
    memory,
    pressure,
    calm,
    addressing,
    phase,
    pulse,
    router
  };
  const macro = state.macroMode === 'manual'
    ? manualMacroState(macroArgs)
    : legacyMacroState(macroArgs);

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
    macro
  };
}
