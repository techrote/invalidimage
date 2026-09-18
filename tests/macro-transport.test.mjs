import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MACRO_KEYFRAME_COUNT,
  advanceMacroTransport,
  macroKeyframes,
  resolveMacroPan
} from '../src/engine/macro-transport.js';
import { resolveModulation } from '../src/engine/modulation.js';
import { initialRouter } from '../src/engine/pipeline.js';

const manualState = {
  seed: 5501,
  autonomy: 0.62,
  displacement: 0.48,
  memory: 0.73,
  pressure: 0.37,
  textureMotion: 1,
  textureComplexity: 0.5,
  swirl: 0.682,
  localWarp: 0.48,
  directions: 8,
  macroMode: 'manual',
  macroPan: 0,
  macroSpeed: 0,
  macroHold: false,
  globalAmount: 0.75,
  skewPan: -0.2,
  feedbackX: 0,
  feedbackY: 0,
  addressAmount: 0.5,
  stridePan: 0.1,
  xorIdentity: 128,
  routeIndex: 2,
  palettePosition: 1,
  themeAmount: 0.5,
  paletteAlphaVariant: 0,
  addressing: true,
  adaptive: true,
  calm: true
};

const baseControls = {
  skewPan: manualState.skewPan,
  stridePan: manualState.stridePan,
  feedbackX: manualState.feedbackX,
  feedbackY: manualState.feedbackY,
  addressAmount: manualState.addressAmount,
  xorIdentity: manualState.xorIdentity,
  routeIndex: manualState.routeIndex,
  palettePosition: manualState.palettePosition,
  themeAmount: manualState.themeAmount
};

function closeTo(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function legacyVisualSignature(macro) {
  const {
    macroModeIndex,
    macroPan,
    macroSpeed,
    macroHold,
    macroSegment,
    macroSegmentT,
    macroKeyframeIndex,
    macroNextKeyframeIndex,
    ...visual
  } = macro;
  return visual;
}

test('seeded macro keyframes are fixed, deterministic, and start from a neutral trim', () => {
  const first = macroKeyframes(5501);
  const repeat = macroKeyframes(5501);
  const other = macroKeyframes(5502);

  assert.equal(first.length, MACRO_KEYFRAME_COUNT);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);
  assert.deepEqual(first[0], {
    skewDelta: 0,
    strideDelta: 0,
    feedbackXDelta: 0,
    feedbackYDelta: 0,
    addressDelta: 0,
    xorIdentityDelta: 0,
    paletteDelta: 0,
    themeDelta: 0,
    routeOffset: 0
  });
});

test('Macro Pan endpoints and route midpoint boundaries are explicit and deterministic', () => {
  const start = resolveMacroPan({ seed: 5501, pan: 0, base: baseControls });
  const end = resolveMacroPan({ seed: 5501, pan: 1, base: baseControls });
  const beforeMidpoint = resolveMacroPan({ seed: 5501, pan: 0.099, base: baseControls });
  const atMidpoint = resolveMacroPan({ seed: 5501, pan: 0.1, base: baseControls });
  const afterMidpoint = resolveMacroPan({ seed: 5501, pan: 0.101, base: baseControls });

  assert.deepEqual(start.controls, baseControls);
  assert.equal(start.segment, 0);
  assert.equal(start.segmentT, 0);
  assert.equal(end.segment, MACRO_KEYFRAME_COUNT - 2);
  assert.equal(end.nextKeyframeIndex, MACRO_KEYFRAME_COUNT - 1);
  assert.equal(end.segmentT, 1);

  assert.equal(beforeMidpoint.controls.routeIndex, baseControls.routeIndex);
  assert.notEqual(atMidpoint.controls.routeIndex, baseControls.routeIndex);
  assert.equal(afterMidpoint.controls.routeIndex, atMidpoint.controls.routeIndex);
  assert.deepEqual(
    resolveMacroPan({ seed: 5501, pan: 0.1, base: baseControls }),
    atMidpoint
  );
});

test('stationary manual Macro Pan remains frame/router independent across hostile churn', () => {
  const state = { ...manualState, macroPan: 0.63 };
  const baseline = resolveModulation({
    state,
    frame: 0,
    router: initialRouter(),
    width: 384
  }).macro;

  for (let frame = 1; frame <= 512; frame++) {
    const router = {
      ...initialRouter(),
      phase: frame & 3,
      pulse: frame * 31,
      transition: (frame % 23) / 22,
      driftX: ((frame % 9) - 4) * 0.75,
      driftY: ((frame % 7) - 3) * 0.8
    };
    assert.deepEqual(
      resolveModulation({ state, frame, router, width: 384 }).macro,
      baseline
    );
  }
});

test('Macro Pan traverses macro primitives while leaving local field state untouched', () => {
  const pans = [0, 0.15, 0.35, 0.55, 0.75, 0.95, 1];
  const macros = pans.map((macroPan) => resolveModulation({
    state: { ...manualState, macroPan },
    frame: 77,
    router: { ...initialRouter(), phase: 3, pulse: 91, transition: 0.8 },
    width: 384
  }).macro);
  const keys = [
    'skewPan',
    'stridePan',
    'feedbackX',
    'feedbackY',
    'addressAmount',
    'xorIdentity',
    'palettePosition',
    'themeAmount',
    'routeIndex'
  ];

  for (const key of keys) {
    assert.ok(new Set(macros.map((macro) => macro[key])).size > 1, `${key} did not traverse`);
  }

  const a = resolveModulation({
    state: { ...manualState, macroPan: 0 },
    frame: 77,
    router: initialRouter(),
    width: 384
  });
  const b = resolveModulation({
    state: { ...manualState, macroPan: 0.73 },
    frame: 77,
    router: initialRouter(),
    width: 384
  });
  assert.deepEqual(a.micro, b.micro);
  assert.equal(a.micro.directions, 8);
  assert.equal(b.micro.directions, 8);
});

test('sweep transport supports forward, reverse, zero speed and deterministic wrapping', () => {
  closeTo(advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.5, macroSpeed: 0.25, frames: 60
  }).macroPan, 0.75);
  closeTo(advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.5, macroSpeed: -0.25, frames: 60
  }).macroPan, 0.25);
  closeTo(advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.9, macroSpeed: 0.2, frames: 60
  }).macroPan, 0.1);
  closeTo(advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.1, macroSpeed: -0.2, frames: 60
  }).macroPan, 0.9);
  assert.equal(advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.42, macroSpeed: 0, frames: 600
  }).macroPan, 0.42);
  assert.equal(advanceMacroTransport({
    macroMode: 'manual', macroPan: 0.42, macroSpeed: 1, frames: 600
  }).macroPan, 0.42);
});

test('macro hold freezes sweep state while local micro time continues and release resumes in place', () => {
  const held = advanceMacroTransport({
    macroMode: 'sweep', macroPan: 0.42, macroSpeed: 0.6, macroHold: true, frames: 600
  });
  assert.equal(held.macroPan, 0.42);
  assert.equal(held.macroHold, 1);

  const state = {
    ...manualState,
    macroMode: 'sweep',
    macroPan: held.macroPan,
    macroSpeed: held.macroSpeed,
    macroHold: true
  };
  const a = resolveModulation({ state, frame: 0, router: initialRouter(), width: 128 });
  const b = resolveModulation({ state, frame: 160, router: initialRouter(), width: 128 });
  assert.deepEqual(a.macro, b.macro);
  assert.notDeepEqual(
    [a.micro.fieldGroup, a.micro.fieldNextGroup, a.micro.fieldPhase],
    [b.micro.fieldGroup, b.micro.fieldNextGroup, b.micro.fieldPhase]
  );

  const released = advanceMacroTransport({
    macroMode: 'sweep',
    macroPan: held.macroPan,
    macroSpeed: held.macroSpeed,
    macroHold: false,
    frames: 1
  });
  closeTo(released.macroPan, 0.43);
  assert.deepEqual(
    advanceMacroTransport({
      macroMode: 'sweep',
      macroPan: held.macroPan,
      macroSpeed: held.macroSpeed,
      macroHold: false,
      frames: 1
    }),
    released
  );
});

test('transport inputs clamp malformed and adversarial values without hidden frame sourcing', () => {
  const invalid = advanceMacroTransport({
    macroMode: 'wat',
    macroPan: Infinity,
    macroSpeed: Infinity,
    macroHold: 1,
    frames: -999
  });
  assert.deepEqual(invalid, {
    macroMode: 'legacy-auto',
    macroPan: 0,
    macroSpeed: 0,
    macroHold: 1
  });

  const resolved = resolveModulation({
    state: {
      ...manualState,
      macroMode: 'sweep',
      macroPan: 99,
      macroSpeed: -99,
      macroHold: true
    },
    frame: Number.MAX_SAFE_INTEGER,
    router: { ...initialRouter(), phase: 3, pulse: Number.MAX_SAFE_INTEGER },
    width: 257
  }).macro;
  assert.equal(resolved.macroPan, 1);
  assert.equal(resolved.macroSpeed, -1);
  assert.equal(resolved.macroHold, 1);
  assert.equal(resolved.macroModeIndex, 1);
  assert.equal(resolved.macroNextKeyframeIndex, MACRO_KEYFRAME_COUNT - 1);
});

test('Legacy Auto remains isolated from Macro Pan transport coordinates', () => {
  const router = {
    ...initialRouter(),
    phase: 3,
    pulse: 91,
    transition: 0.4,
    driftX: 1.2,
    driftY: -2.2
  };
  const a = resolveModulation({
    state: { ...manualState, macroMode: 'legacy-auto', macroPan: 0, macroSpeed: -1 },
    frame: 133,
    router,
    width: 384
  }).macro;
  const b = resolveModulation({
    state: { ...manualState, macroMode: 'legacy-auto', macroPan: 1, macroSpeed: 1, macroHold: true },
    frame: 133,
    router,
    width: 384
  }).macro;

  assert.deepEqual(legacyVisualSignature(a), legacyVisualSignature(b));
  assert.equal(a.macroModeIndex, 2);
  assert.equal(b.macroModeIndex, 2);
  assert.equal(a.routeIndex, router.phase);
  assert.equal(b.routeIndex, router.phase);
});
