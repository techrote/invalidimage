import test from 'node:test';
import assert from 'node:assert/strict';
import { remapPalette } from '../src/engine/palette.js';
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
  globalAmount: 0.4,
  skewPan: 0.1,
  feedbackX: 1,
  feedbackY: -1,
  addressAmount: 0.3,
  stridePan: 0.2,
  xorIdentity: 137,
  routeIndex: 1,
  palettePosition: 0.75,
  themeAmount: 0.6,
  paletteAlphaVariant: 0,
  addressing: true,
  adaptive: true,
  calm: true
};

function themeSignature(macro) {
  return {
    palettePosition: macro.palettePosition,
    themeAmount: macro.themeAmount,
    paletteAlphaVariant: macro.paletteAlphaVariant
  };
}

function legacyLuminance(r, g, b) {
  return (r * 54 + g * 183 + b * 19) / 256;
}

const LEGACY_PALETTES = [
  [[8,10,18],[20,46,63],[21,111,119],[73,195,190],[202,75,169],[113,72,190],[78,98,202]],
  [[7,9,12],[38,22,62],[100,42,122],[214,78,154],[74,182,196],[214,218,222]],
  [[4,10,18],[20,68,78],[41,143,131],[232,194,92],[219,83,122],[94,59,156]]
];

function legacyPaletteReference(input, phase, pressure) {
  const palette = LEGACY_PALETTES[phase % LEGACY_PALETTES.length];
  const out = new Uint8ClampedArray(input.length);

  for (let i = 0; i < input.length; i += 4) {
    const control = phase === 3 ? input[i + 3] : legacyLuminance(input[i], input[i + 1], input[i + 2]);
    const scaled = Math.max(0, Math.min(0.9999, control / 255)) * palette.length;
    const index = Math.floor(scaled);
    const next = Math.min(palette.length - 1, index + 1);
    const t = (scaled - index) * (0.25 + pressure * 0.75);
    const a = palette[index];
    const b = palette[next];
    out[i] = a[0] + (b[0] - a[0]) * t;
    out[i + 1] = a[1] + (b[1] - a[1]) * t;
    out[i + 2] = a[2] + (b[2] - a[2]) * t;
    out[i + 3] = phase === 3 ? Math.max(12, input[i + 3] - pressure * 24) : input[i + 3];
  }

  return out;
}

test('manual route changes do not alter resolved theme state', () => {
  const router = { ...initialRouter(), phase: 3, pulse: 991, driftX: 2.5, driftY: -2.5 };
  const baseline = resolveModulation({ state: manualState, frame: 81, router, width: 384 });

  for (let routeIndex = 0; routeIndex < 4; routeIndex++) {
    const resolved = resolveModulation({
      state: { ...manualState, routeIndex },
      frame: 81,
      router,
      width: 384
    });
    assert.equal(resolved.macro.routeIndex, routeIndex);
    assert.deepEqual(themeSignature(resolved.macro), themeSignature(baseline.macro));
  }
});

test('manual palette movement does not alter route or transform identity', () => {
  const router = { ...initialRouter(), phase: 0 };
  const baseline = resolveModulation({ state: manualState, frame: 19, router, width: 128 });

  for (const palettePosition of [0, 0.01, 0.5, 0.999, 1, 1.25, 1.999, 2]) {
    const resolved = resolveModulation({
      state: { ...manualState, palettePosition },
      frame: 19,
      router,
      width: 128
    });
    assert.equal(resolved.macro.routeIndex, manualState.routeIndex);
    assert.equal(resolved.macro.palettePosition, palettePosition);
    assert.equal(resolved.macro.rowSkew, baseline.macro.rowSkew);
    assert.equal(resolved.macro.xorIdentity, baseline.macro.xorIdentity);
  }
});

test('manual route and theme stay fixed across frame time and hostile router churn', () => {
  const expected = resolveModulation({
    state: manualState,
    frame: 0,
    router: initialRouter(),
    width: 384
  }).macro;
  const expectedSignature = {
    routeIndex: expected.routeIndex,
    ...themeSignature(expected)
  };

  for (let frame = 1; frame <= 512; frame++) {
    const router = {
      ...initialRouter(),
      phase: frame & 3,
      pulse: frame * 101,
      transition: (frame % 23) / 22,
      driftX: (frame % 7) - 3,
      driftY: (frame % 5) - 2
    };
    const resolved = resolveModulation({ state: manualState, frame, router, width: 384 });
    assert.deepEqual({ routeIndex: resolved.macro.routeIndex, ...themeSignature(resolved.macro) }, expectedSignature);
  }
});

test('all four explicit manual routes reach the renderer without theme substitution', () => {
  const expectedRoutes = [
    'field > address > palette',
    'address > field > palette',
    'palette > address > field',
    'field > palette > address'
  ];
  const width = 10;
  const height = 7;
  const source = makeSurface(width, height, manualState.seed, 0);
  const router = { ...initialRouter(), phase: 3, pulse: 77 };

  for (let routeIndex = 0; routeIndex < 4; routeIndex++) {
    const state = { ...manualState, routeIndex };
    const result = renderFrame({ width, height, frame: 31, state, source, history: null, router });
    assert.equal(result.route, expectedRoutes[routeIndex]);
    assert.equal(result.modulation.macro.routeIndex, routeIndex);
    assert.equal(result.modulation.macro.palettePosition, manualState.palettePosition);
    assert.equal(result.modulation.macro.paletteAlphaVariant, manualState.paletteAlphaVariant);
  }
});

test('palette position interpolates deterministically across unequal palette lengths', () => {
  const input = new Uint8ClampedArray([
    23, 91, 177, 211,
    201, 44, 83, 123,
    250, 240, 10, 255
  ]);
  const left = remapPalette(input, 0, 0.6, 0);
  const middle = remapPalette(input, 0.5, 0.6, 0);
  const right = remapPalette(input, 1, 0.6, 0);

  assert.deepEqual(middle, remapPalette(input, 0.5, 0.6, 0));
  for (let i = 0; i < input.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const lo = Math.min(left[i + channel], right[i + channel]);
      const hi = Math.max(left[i + channel], right[i + channel]);
      assert.ok(middle[i + channel] >= lo && middle[i + channel] <= hi);
      assert.ok(Math.abs(middle[i + channel] - (left[i + channel] + right[i + channel]) / 2) <= 1);
    }
    assert.equal(middle[i + 3], input[i + 3]);
  }
});

test('integer palette coordinates retain legacy remap output including explicit alpha variant', () => {
  const input = new Uint8ClampedArray([
    5, 17, 241, 255,
    93, 140, 37, 190,
    201, 49, 119, 85
  ]);
  const pressure = 0.37;

  for (const phase of [0, 1, 2]) {
    assert.deepEqual(
      remapPalette(input, phase, pressure, 0),
      legacyPaletteReference(input, phase, pressure)
    );
  }
  assert.deepEqual(
    remapPalette(input, 0, pressure, 1),
    legacyPaletteReference(input, 3, pressure)
  );
});

test('manual theme inputs clamp adversarial values to documented boundaries', () => {
  const width = 257;
  const low = resolveModulation({
    state: {
      ...manualState,
      routeIndex: -99,
      palettePosition: -99,
      themeAmount: -9,
      paletteAlphaVariant: -4
    },
    frame: Number.MAX_SAFE_INTEGER,
    router: { ...initialRouter(), phase: 3, pulse: Number.MAX_SAFE_INTEGER },
    width
  }).macro;
  const high = resolveModulation({
    state: {
      ...manualState,
      routeIndex: 99,
      palettePosition: 99,
      themeAmount: 9,
      paletteAlphaVariant: 4
    },
    frame: Number.MAX_SAFE_INTEGER,
    router: { ...initialRouter(), phase: 0 },
    width
  }).macro;
  const bounds = modulationBounds(width).macro;

  assert.equal(low.routeIndex, bounds.routeIndex[0]);
  assert.equal(low.palettePosition, bounds.palettePosition[0]);
  assert.equal(low.themeAmount, bounds.themeAmount[0]);
  assert.equal(low.paletteAlphaVariant, bounds.paletteAlphaVariant[0]);
  assert.equal(high.routeIndex, bounds.routeIndex[1]);
  assert.equal(high.palettePosition, bounds.palettePosition[1]);
  assert.equal(high.themeAmount, bounds.themeAmount[1]);
  assert.equal(high.paletteAlphaVariant, bounds.paletteAlphaVariant[1]);
});

test('manual theme defaults are router-independent while legacy auto remains deterministic and isolated', () => {
  const minimalManual = {
    ...manualState,
    routeIndex: undefined,
    palettePosition: undefined,
    themeAmount: undefined,
    paletteAlphaVariant: undefined
  };
  const a = resolveModulation({
    state: minimalManual,
    frame: 1,
    router: { ...initialRouter(), phase: 0 },
    width: 96
  });
  const b = resolveModulation({
    state: minimalManual,
    frame: 999,
    router: { ...initialRouter(), phase: 3, pulse: 700, driftX: 3, driftY: -3 },
    width: 96
  });

  assert.equal(a.macro.routeIndex, 0);
  assert.equal(a.macro.palettePosition, 0);
  assert.equal(a.macro.paletteAlphaVariant, 0);
  assert.deepEqual({ routeIndex: a.macro.routeIndex, ...themeSignature(a.macro) }, { routeIndex: b.macro.routeIndex, ...themeSignature(b.macro) });

  const legacyState = { ...manualState, macroMode: 'legacy-auto' };
  const legacyRouter = { ...initialRouter(), phase: 3, pulse: 91, transition: 0.4, driftX: 1.5, driftY: -2 };
  const args = { state: legacyState, frame: 73, router: legacyRouter, width: 96 };
  const legacy = resolveModulation(args);
  assert.deepEqual(legacy, resolveModulation(args));
  assert.equal(legacy.macro.routeIndex, 3);
  assert.equal(legacy.macro.palettePosition, 0);
  assert.equal(legacy.macro.paletteAlphaVariant, 1);
});
