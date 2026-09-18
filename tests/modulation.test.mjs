import test from 'node:test';
import assert from 'node:assert/strict';
import { modulationBounds, resolveModulation } from '../src/engine/modulation.js';
import { initialRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';

const state = {
  seed: 5501,
  autonomy: 0.62,
  displacement: 0.48,
  memory: 0.73,
  pressure: 0.37,
  textureMotion: 1,
  textureComplexity: 0.5,
  swirl: 0.25 + 0.48 * 0.9,
  localWarp: 0.48,
  directions: 8,
  addressing: true,
  adaptive: true,
  calm: true
};

const router = {
  ...initialRouter(),
  phase: 3,
  pulse: 17,
  transition: 0.4,
  driftX: 1.4,
  driftY: -1.8
};

function assertWithinDocumentedBounds(resolved, width) {
  const bounds = modulationBounds(width);

  for (const section of ['micro', 'macro']) {
    for (const [name, value] of Object.entries(resolved[section])) {
      assert.equal(typeof value, 'number', `${section}.${name} must be numeric`);
      assert.equal(Number.isFinite(value), true, `${section}.${name} must be finite`);
      const range = bounds[section][name];
      assert.ok(range, `missing documented bound for ${section}.${name}`);
      assert.ok(value >= range[0], `${section}.${name} ${value} is below ${range[0]}`);
      assert.ok(value <= range[1], `${section}.${name} ${value} is above ${range[1]}`);
    }
  }
}

test('modulation resolution is deterministic for fixed state', () => {
  const args = { state, frame: 97, router, width: 384 };
  assert.deepEqual(resolveModulation(args), resolveModulation(args));
});

test('resolved numeric state stays finite and within documented bounds', () => {
  const fixtures = [
    {
      state: {
        ...state,
        autonomy: 0,
        displacement: 0,
        memory: 0,
        pressure: 0,
        textureMotion: 0,
        textureComplexity: 0,
        swirl: 0,
        localWarp: 0,
        calm: false
      },
      frame: 0,
      router: initialRouter(),
      width: 1
    },
    {
      state: {
        ...state,
        autonomy: 1,
        displacement: 1,
        memory: 1,
        pressure: 1,
        textureMotion: 2,
        textureComplexity: 1,
        swirl: 1.5,
        localWarp: 1
      },
      frame: 4095,
      router: { ...router, driftX: 3, driftY: -3 },
      width: 4096
    },
    {
      state: {
        ...state,
        seed: Infinity,
        autonomy: 4,
        displacement: -3,
        memory: NaN,
        pressure: 12,
        textureMotion: Infinity,
        textureComplexity: -Infinity,
        swirl: NaN,
        localWarp: 12,
        directions: 99
      },
      frame: Infinity,
      router: { ...router, phase: Infinity, pulse: -50, transition: 9, driftX: Infinity, driftY: -Infinity },
      width: Infinity
    }
  ];

  for (const fixture of fixtures) {
    const resolved = resolveModulation(fixture);
    assertWithinDocumentedBounds(resolved, fixture.width);
  }
});

test('explicit local texture controls are isolated from resolved macro state', () => {
  const baseline = resolveModulation({ state, frame: 97, router, width: 384 });
  const variations = [
    { textureMotion: 0 },
    { textureMotion: 2 },
    { textureComplexity: 0 },
    { textureComplexity: 1 },
    { swirl: 0 },
    { swirl: 1.5 },
    { localWarp: 0 },
    { localWarp: 1 }
  ];

  for (const variation of variations) {
    const resolved = resolveModulation({ state: { ...state, ...variation }, frame: 97, router, width: 384 });
    assert.deepEqual(resolved.macro, baseline.macro);
  }
});

test('texture motion zero freezes resolved field temporal state across frames', () => {
  const frozen = { ...state, textureMotion: 0 };
  const baseline = resolveModulation({ state: frozen, frame: 0, router, width: 384 }).micro;

  for (const frame of [1, 17, 31, 32, 97, 4096]) {
    const micro = resolveModulation({ state: frozen, frame, router, width: 384 }).micro;
    assert.deepEqual(micro, baseline);
  }
});

test('positive texture motion evolves deterministically without modulating directions', () => {
  const moving = { ...state, textureMotion: 1.35, directions: 16 };
  const a = resolveModulation({ state: moving, frame: 9, router, width: 384 }).micro;
  const b = resolveModulation({ state: moving, frame: 57, router, width: 384 }).micro;
  const bRepeat = resolveModulation({ state: moving, frame: 57, router, width: 384 }).micro;

  assert.notDeepEqual(
    { group: a.fieldGroup, next: a.fieldNextGroup, phase: a.fieldPhase },
    { group: b.fieldGroup, next: b.fieldNextGroup, phase: b.fieldPhase }
  );
  assert.deepEqual(b, bRepeat);
  assert.equal(a.directions, 16);
  assert.equal(b.directions, 16);
});

test('local-control boundaries clamp continuously without changing topology settings', () => {
  const low = resolveModulation({
    state: { ...state, textureMotion: -4, textureComplexity: -2, swirl: -8, localWarp: -3 },
    frame: 73,
    router,
    width: 384
  });
  const high = resolveModulation({
    state: { ...state, textureMotion: 9, textureComplexity: 7, swirl: 9, localWarp: 6 },
    frame: 73,
    router,
    width: 384
  });

  assert.equal(low.micro.textureMotion, 0);
  assert.equal(low.micro.textureComplexity, 0);
  assert.equal(low.micro.noiseAmount, 0);
  assert.equal(low.micro.swirl, 0);
  assert.equal(low.micro.localWarp, 0);
  assert.equal(low.micro.directions, state.directions);

  assert.equal(high.micro.textureMotion, 2);
  assert.equal(high.micro.textureComplexity, 1);
  assert.equal(high.micro.noiseAmount, 0.34);
  assert.equal(high.micro.swirl, 1.5);
  assert.equal(high.micro.localWarp, 1);
  assert.equal(high.micro.directions, state.directions);
});

test('legacy callers without new local controls retain prior field defaults', () => {
  const legacyState = {
    seed: state.seed,
    autonomy: state.autonomy,
    displacement: state.displacement,
    memory: state.memory,
    pressure: state.pressure,
    directions: state.directions,
    addressing: state.addressing,
    adaptive: state.adaptive,
    calm: state.calm
  };
  const resolved = resolveModulation({ state: legacyState, frame: 97, router, width: 384 });

  assert.equal(resolved.micro.textureMotion, 1);
  assert.equal(resolved.micro.textureComplexity, 0.5);
  assert.equal(resolved.micro.noiseAmount, 0.17);
  assert.equal(resolved.micro.swirl, 0.25 + state.displacement * 0.9);
  assert.equal(resolved.micro.localWarp, state.displacement);
});

test('directions is a micro-only input in the compatibility contract', () => {
  const fourWay = resolveModulation({ state: { ...state, directions: 4 }, frame: 97, router, width: 384 });
  const sixteenWay = resolveModulation({ state: { ...state, directions: 16 }, frame: 97, router, width: 384 });

  assert.equal(fourWay.micro.directions, 4);
  assert.equal(sixteenWay.micro.directions, 16);
  assert.deepEqual(fourWay.macro, sixteenWay.macro);

  const { directions: ignoredFour, ...fourRest } = fourWay.micro;
  const { directions: ignoredSixteen, ...sixteenRest } = sixteenWay.micro;
  assert.deepEqual(fourRest, sixteenRest);
});

test('compatibility diagnostics make current route-theme coupling explicit', () => {
  const resolved = resolveModulation({ state, frame: 97, router, width: 384 });
  assert.equal(resolved.macro.routeIndex, 3);
  assert.equal(resolved.macro.palettePosition, 0);
  assert.equal(resolved.macro.paletteAlphaVariant, 1);
});

test('disabled addressing reports neutral effective address modulation', () => {
  const resolved = resolveModulation({ state: { ...state, addressing: false }, frame: 97, router, width: 384 });
  assert.equal(resolved.macro.rowSkew, 0);
  assert.equal(resolved.macro.byteStride, 0);
  assert.equal(resolved.macro.xorAmount, 0);
  assert.equal(resolved.macro.xorMask, 0);
  assert.equal(resolved.macro.byteRotation, 0);
});

test('renderFrame exposes the resolver result without changing the render contract', () => {
  const width = 12;
  const height = 9;
  const frame = 23;
  const source = makeSurface(width, height, state.seed, 0);
  const initial = initialRouter();
  const result = renderFrame({ width, height, frame, state, source, history: null, router: initial });

  assert.deepEqual(
    result.modulation,
    resolveModulation({ state, frame, router: initial, width })
  );
  assert.equal(result.image.length, width * height * 4);
});
