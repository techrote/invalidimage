import test from 'node:test';
import assert from 'node:assert/strict';
import { addressTransform } from '../src/engine/address.js';
import { mixFrames } from '../src/engine/frame-mix.js';
import { modulationBounds, resolveModulation } from '../src/engine/modulation.js';
import { initialRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';

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
  globalAmount: 0.75,
  skewPan: -0.35,
  feedbackX: 5,
  feedbackY: -3,
  addressAmount: 0.6,
  stridePan: 0.42,
  xorIdentity: 173,
  routeIndex: 2,
  palettePosition: 2,
  themeAmount: 0.37,
  paletteAlphaVariant: 0,
  addressing: true,
  adaptive: true,
  calm: true
};

function transformSignature(macro) {
  return {
    manualMode: macro.manualMode,
    globalAmount: macro.globalAmount,
    skewPan: macro.skewPan,
    rowSkew: macro.rowSkew,
    stridePan: macro.stridePan,
    byteStride: macro.byteStride,
    addressAmount: macro.addressAmount,
    xorAmount: macro.xorAmount,
    xorIdentity: macro.xorIdentity,
    xorMask: macro.xorMask,
    feedbackX: macro.feedbackX,
    feedbackY: macro.feedbackY,
    channelOrderIndex: macro.channelOrderIndex,
    byteRotation: macro.byteRotation
  };
}

function withoutFeedback(macro) {
  const { feedbackX, feedbackY, ...rest } = transformSignature(macro);
  return rest;
}

test('manual macro transforms remain stationary across frame and router churn', () => {
  const width = 384;
  const baseline = resolveModulation({
    state: manualState,
    frame: 0,
    router: initialRouter(),
    width
  });
  const signature = transformSignature(baseline.macro);

  for (let frame = 1; frame <= 512; frame++) {
    const router = {
      ...initialRouter(),
      phase: frame & 3,
      pulse: frame * 19,
      transition: (frame % 17) / 16,
      driftX: ((frame % 7) - 3) * 0.9,
      driftY: ((frame % 5) - 2) * 1.1
    };
    const resolved = resolveModulation({ state: manualState, frame, router, width });
    assert.deepEqual(transformSignature(resolved.macro), signature);
  }
});

test('manual macro state can stay fixed while local texture time advances', () => {
  const router = initialRouter();
  const a = resolveModulation({ state: manualState, frame: 0, router, width: 96 });
  const b = resolveModulation({ state: manualState, frame: 160, router, width: 96 });

  assert.deepEqual(transformSignature(a.macro), transformSignature(b.macro));
  assert.notDeepEqual(
    [a.micro.fieldGroup, a.micro.fieldNextGroup, a.micro.fieldPhase],
    [b.micro.fieldGroup, b.micro.fieldNextGroup, b.micro.fieldPhase]
  );
  assert.equal(a.micro.directions, manualState.directions);
  assert.equal(b.micro.directions, manualState.directions);
});

test('global amount zero neutralises every required transform and the address pass', () => {
  const width = 11;
  const height = 7;
  const state = {
    ...manualState,
    globalAmount: 0,
    skewPan: 1,
    feedbackX: 8,
    feedbackY: -4,
    addressAmount: 1,
    stridePan: -1,
    xorIdentity: 255
  };
  const resolved = resolveModulation({ state, frame: 999, router: { ...initialRouter(), phase: 3 }, width });

  assert.equal(resolved.macro.rowSkew, 0);
  assert.equal(resolved.macro.byteStride, 0);
  assert.equal(resolved.macro.addressAmount, 0);
  assert.equal(resolved.macro.xorAmount, 0);
  assert.equal(resolved.macro.xorMask, 0);
  assert.equal(resolved.macro.feedbackX, 0);
  assert.equal(resolved.macro.feedbackY, 0);
  assert.equal(resolved.macro.channelOrderIndex, 0);
  assert.equal(resolved.macro.byteRotation, 0);

  const source = makeSurface(width, height, state.seed, 0);
  assert.deepEqual(addressTransform(source, width, height, state, resolved.macro), source);
});

test('skew pan is monotonic and isolated from route/theme diagnostics', () => {
  const router = { ...initialRouter(), phase: 2 };
  const values = [-1, -0.5, 0, 0.5, 1].map((skewPan) => resolveModulation({
    state: { ...manualState, globalAmount: 1, skewPan },
    frame: 73,
    router,
    width: 384
  }).macro);

  assert.deepEqual(values.map((value) => value.rowSkew), [-48, -24, 0, 24, 48]);
  for (const value of values) {
    assert.equal(value.routeIndex, manualState.routeIndex);
    assert.equal(value.palettePosition, manualState.palettePosition);
    assert.equal(value.themeAmount, manualState.themeAmount);
  }
});

test('manual feedback coordinates only change resolved feedback translation', () => {
  const router = { ...initialRouter(), phase: 1 };
  const baseline = resolveModulation({
    state: { ...manualState, globalAmount: 1, feedbackX: 0, feedbackY: 0 },
    frame: 41,
    router,
    width: 128
  }).macro;
  const moved = resolveModulation({
    state: { ...manualState, globalAmount: 1, feedbackX: -7, feedbackY: 4 },
    frame: 41,
    router,
    width: 128
  }).macro;

  assert.equal(moved.feedbackX, -7);
  assert.equal(moved.feedbackY, 4);
  assert.deepEqual(withoutFeedback(moved), withoutFeedback(baseline));
});

test('manual address identity is explicit and address output ignores frame/route churn', () => {
  const width = 13;
  const height = 9;
  const source = makeSurface(width, height, manualState.seed, 0);
  const a = resolveModulation({
    state: manualState,
    frame: 3,
    router: { ...initialRouter(), phase: 0, driftX: -3, driftY: 3 },
    width
  });
  const b = resolveModulation({
    state: manualState,
    frame: 500,
    router: { ...initialRouter(), phase: 3, pulse: 777, driftX: 3, driftY: -3 },
    width
  });

  assert.equal(a.macro.xorIdentity, manualState.xorIdentity);
  assert.equal(b.macro.xorIdentity, manualState.xorIdentity);
  assert.deepEqual(transformSignature(a.macro), transformSignature(b.macro));
  assert.deepEqual(
    addressTransform(source, width, height, manualState, a.macro),
    addressTransform(source, width, height, manualState, b.macro)
  );
});

test('pipeline temporal feedback consumes resolved manual X/Y translation', () => {
  const width = 9;
  const height = 6;
  const frame = 27;
  const router = initialRouter();
  const state = {
    ...manualState,
    addressing: false,
    globalAmount: 1,
    feedbackX: 3,
    feedbackY: -2,
    calm: true
  };
  const source = makeSurface(width, height, state.seed, 0);
  const history = makeSurface(width, height, state.seed + 99, 0);
  const fresh = renderFrame({ width, height, frame, state, source, history: null, router });
  const mixed = renderFrame({ width, height, frame, state, source, history, router });
  const expected = mixFrames(
    fresh.image,
    history,
    width,
    height,
    mixed.modulation.micro.feedbackAmount,
    mixed.modulation.macro.feedbackX,
    mixed.modulation.macro.feedbackY,
    state.calm
  );

  assert.equal(mixed.modulation.macro.feedbackX, 3);
  assert.equal(mixed.modulation.macro.feedbackY, -2);
  assert.deepEqual(mixed.image, expected);
});

test('manual macro inputs clamp at adversarial boundaries and stay within documented bounds', () => {
  const width = 257;
  const resolved = resolveModulation({
    state: {
      ...manualState,
      globalAmount: 9,
      skewPan: -99,
      feedbackX: 999,
      feedbackY: -999,
      addressAmount: 17,
      stridePan: 42,
      xorIdentity: 9001
    },
    frame: Number.MAX_SAFE_INTEGER,
    router: { ...initialRouter(), phase: 3, pulse: Number.MAX_SAFE_INTEGER },
    width
  });
  const bounds = modulationBounds(width).macro;

  assert.equal(resolved.macro.globalAmount, 1);
  assert.equal(resolved.macro.skewPan, -1);
  assert.equal(resolved.macro.feedbackX, 8);
  assert.equal(resolved.macro.feedbackY, -4);
  assert.equal(resolved.macro.addressAmount, 1);
  assert.equal(resolved.macro.stridePan, 1);
  assert.equal(resolved.macro.xorIdentity, 255);

  for (const [name, value] of Object.entries(resolved.macro)) {
    assert.equal(Number.isFinite(value), true, `${name} must remain finite`);
    assert.ok(value >= bounds[name][0], `${name} below documented minimum`);
    assert.ok(value <= bounds[name][1], `${name} above documented maximum`);
  }
});

test('legacy-auto compatibility path remains deterministic', () => {
  const legacy = { ...manualState, macroMode: 'legacy-auto' };
  const router = { ...initialRouter(), phase: 3, pulse: 91, transition: 0.45, driftX: 1.2, driftY: -2.2 };
  const args = { state: legacy, frame: 133, router, width: 384 };

  assert.deepEqual(resolveModulation(args), resolveModulation(args));
  assert.equal(resolveModulation(args).macro.manualMode, 0);
});
