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
    { state: { ...state, autonomy: 0, displacement: 0, memory: 0, pressure: 0, calm: false }, frame: 0, router: initialRouter(), width: 1 },
    { state: { ...state, autonomy: 1, displacement: 1, memory: 1, pressure: 1 }, frame: 4095, router: { ...router, driftX: 3, driftY: -3 }, width: 4096 },
    {
      state: {
        ...state,
        seed: Infinity,
        autonomy: 4,
        displacement: -3,
        memory: NaN,
        pressure: 12,
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
