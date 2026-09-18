import { hashWords } from '../core/prng.js';

export const MACRO_KEYFRAME_COUNT = 6;
export const MACRO_SEGMENT_COUNT = MACRO_KEYFRAME_COUNT - 1;
export const MAX_MACRO_SPEED = 1;

const ROUTE_COUNT = 4;
const MAX_FEEDBACK_X = 8;
const MAX_FEEDBACK_Y = 4;
const PALETTE_MAX = 2;

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

function routeIndex(value) {
  return Math.trunc(clamp(finiteNumber(value), 0, ROUTE_COUNT - 1));
}

function palettePosition(value) {
  return clamp(finiteNumber(value), 0, PALETTE_MAX);
}

function byteValue(value) {
  return Math.round(clamp(finiteNumber(value), 0, 255));
}

function signedHash(seed, index, salt) {
  return (hashWords(seed, index, salt) / 0xffffffff) * 2 - 1;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function canonicalZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function wrapUnit(value) {
  const wrapped = ((value % 1) + 1) % 1;
  return canonicalZero(wrapped);
}

export function normalizeMacroMode(value) {
  if (value === 'manual' || value === 'sweep') return value;
  return 'legacy-auto';
}

/**
 * Derive the fixed six-keyframe macro path for a seed.
 *
 * Keyframe zero is intentionally neutral so macroPan=0 preserves the explicit
 * primitive controls exactly. Later keyframes are deterministic offsets layered
 * on top of those controls; Macro Pan therefore remains a navigator over the
 * explicit IMC-003/004 primitives rather than replacing them.
 */
export function macroKeyframes(seed = 0) {
  const safeSeed = finiteNumber(seed) | 0;
  const keyframes = [];

  for (let index = 0; index < MACRO_KEYFRAME_COUNT; index++) {
    if (index === 0) {
      keyframes.push(Object.freeze({
        skewDelta: 0,
        strideDelta: 0,
        feedbackXDelta: 0,
        feedbackYDelta: 0,
        addressDelta: 0,
        xorIdentityDelta: 0,
        paletteDelta: 0,
        themeDelta: 0,
        routeOffset: 0
      }));
      continue;
    }

    keyframes.push(Object.freeze({
      skewDelta: signedHash(safeSeed, index, 0x243f6a88) * 0.75,
      strideDelta: signedHash(safeSeed, index, 0x85a308d3) * 0.70,
      feedbackXDelta: signedHash(safeSeed, index, 0x13198a2e) * 5.5,
      feedbackYDelta: signedHash(safeSeed, index, 0x03707344) * 3.0,
      addressDelta: signedHash(safeSeed, index, 0xa4093822) * 0.40,
      xorIdentityDelta: signedHash(safeSeed, index, 0x299f31d0) * 96,
      paletteDelta: signedHash(safeSeed, index, 0x082efa98) * 1.15,
      themeDelta: signedHash(safeSeed, index, 0xec4e6c89) * 0.35,
      // Non-zero offsets guarantee that leaving the neutral first keyframe can
      // exercise route changes without coupling route identity to palette state.
      routeOffset: 1 + (hashWords(safeSeed, index, 0x452821e6) % (ROUTE_COUNT - 1))
    }));
  }

  return Object.freeze(keyframes);
}

/**
 * Resolve a 0..1 Macro Pan coordinate onto explicit macro primitives.
 * Continuous dimensions interpolate linearly between keyframes. Route is the
 * only discrete dimension and switches at each segment midpoint; no route
 * crossfade or second full render path is introduced.
 */
export function resolveMacroPan({ seed = 0, pan = 0, base = {} } = {}) {
  const macroPan = unitValue(pan);
  const keyframes = macroKeyframes(seed);
  const position = macroPan * MACRO_SEGMENT_COUNT;
  const segment = macroPan >= 1
    ? MACRO_SEGMENT_COUNT - 1
    : Math.min(MACRO_SEGMENT_COUNT - 1, Math.floor(position));
  const nextSegment = segment + 1;
  const segmentT = macroPan >= 1 ? 1 : position - segment;
  const a = keyframes[segment];
  const b = keyframes[nextSegment];
  const discrete = segmentT < 0.5 ? a : b;

  const baseRoute = routeIndex(base.routeIndex);
  const controls = {
    skewPan: signedUnitValue(
      signedUnitValue(base.skewPan) + lerp(a.skewDelta, b.skewDelta, segmentT)
    ),
    stridePan: signedUnitValue(
      signedUnitValue(base.stridePan) + lerp(a.strideDelta, b.strideDelta, segmentT)
    ),
    feedbackX: clamp(
      finiteNumber(base.feedbackX) + lerp(a.feedbackXDelta, b.feedbackXDelta, segmentT),
      -MAX_FEEDBACK_X,
      MAX_FEEDBACK_X
    ),
    feedbackY: clamp(
      finiteNumber(base.feedbackY) + lerp(a.feedbackYDelta, b.feedbackYDelta, segmentT),
      -MAX_FEEDBACK_Y,
      MAX_FEEDBACK_Y
    ),
    addressAmount: unitValue(
      unitValue(base.addressAmount) + lerp(a.addressDelta, b.addressDelta, segmentT)
    ),
    xorIdentity: byteValue(
      byteValue(base.xorIdentity) + lerp(a.xorIdentityDelta, b.xorIdentityDelta, segmentT)
    ),
    palettePosition: palettePosition(
      palettePosition(base.palettePosition) + lerp(a.paletteDelta, b.paletteDelta, segmentT)
    ),
    themeAmount: unitValue(
      unitValue(base.themeAmount) + lerp(a.themeDelta, b.themeDelta, segmentT)
    ),
    routeIndex: (baseRoute + discrete.routeOffset) % ROUTE_COUNT
  };

  return {
    controls,
    macroPan,
    segment,
    segmentT,
    keyframeIndex: segment,
    nextKeyframeIndex: nextSegment
  };
}

/**
 * Advance explicit Macro Pan transport by rendered-frame steps.
 *
 * macroSpeed is measured in normalized pan units per 60 rendered frames.
 * Sweep wraps in [0,1); Manual and Legacy Auto do not advance Macro Pan here.
 * Hold freezes transport only: renderer frames, local texture and history can
 * continue to advance independently.
 */
export function advanceMacroTransport({
  macroMode = 'legacy-auto',
  macroPan = 0,
  macroSpeed = 0,
  macroHold = false,
  frames = 1
} = {}) {
  const mode = normalizeMacroMode(macroMode);
  const pan = unitValue(macroPan);
  const speed = clamp(finiteNumber(macroSpeed), -MAX_MACRO_SPEED, MAX_MACRO_SPEED);
  const hold = Boolean(macroHold);
  const frameSteps = Math.max(0, finiteNumber(frames, 1));
  const nextPan = mode === 'sweep' && !hold && speed !== 0
    ? wrapUnit(pan + (speed * frameSteps) / 60)
    : pan;

  return {
    macroMode: mode,
    macroPan: nextPan,
    macroSpeed: canonicalZero(speed),
    macroHold: hold ? 1 : 0
  };
}
