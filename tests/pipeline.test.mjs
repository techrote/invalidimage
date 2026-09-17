import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRouter, advanceRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';
import { sampleVector, warpImage } from '../src/engine/field.js';
import { mixFrames } from '../src/engine/frame-mix.js';

const state = {
  seed: 5501,
  autonomy: 0.62,
  displacement: 0.48,
  memory: 0.73,
  pressure: 0.37,
  directions: 8,
  addressing: true,
  adaptive: true
};

test('router evolution is reproducible', () => {
  let a = initialRouter();
  let b = initialRouter();

  for (let frame = 0; frame < 50; frame++) {
    a = advanceRouter(a, frame, 12.5 + frame, state);
    b = advanceRouter(b, frame, 12.5 + frame, state);
  }

  assert.deepEqual(a, b);
});

test('headless frame rendering is deterministic', () => {
  const args = {
    width: 32,
    height: 24,
    frame: 8,
    state,
    source: null,
    history: null,
    router: initialRouter()
  };

  const a = renderFrame(args);
  const b = renderFrame(args);

  assert.deepEqual(a.image, b.image);
  assert.equal(a.route, b.route);
});

test('field warp preserves non-square vertical extent', () => {
  const width = 18;
  const height = 54;
  const frame = 5;
  const source = makeSurface(width, height, state.seed, frame);
  const warped = warpImage(source, width, height, frame, state);

  assert.equal(warped.length, source.length);
  assert.deepEqual(
    sampleVector(0.5, 1, frame, state),
    sampleVector(0.5, (height - 1) / (height - 1), frame, state)
  );
  assert.notDeepEqual(warped.slice(0, width * 4), warped.slice((height - 1) * width * 4));
});


function referenceWarp(input, width, height, frame, testState) {
  const out = new Uint8ClampedArray(input.length);
  const scale = testState.displacement * Math.min(width, height) * 0.075;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      const [vx, vy] = sampleVector(u, v, frame, testState);
      const sx = Math.max(0, Math.min(width - 1, Math.round(x + vx * scale)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(y + vy * scale)));
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

test('cached field warp matches reference sampling', () => {
  const width = 19;
  const height = 13;
  const frame = 11;
  const source = makeSurface(width, height, state.seed, frame);

  for (const directions of [4, 8, 16]) {
    const testState = { ...state, directions };
    assert.deepEqual(
      warpImage(source, width, height, frame, testState),
      referenceWarp(source, width, height, frame, testState)
    );
  }
});


test('calm motion morphs the field instead of stepping every four frames', () => {
  const point = [0.23, 0.61];
  const legacyState = { ...state, calm: false };
  const calmState = { ...state, calm: true };

  assert.deepEqual(
    sampleVector(point[0], point[1], 8, legacyState),
    sampleVector(point[0], point[1], 9, legacyState)
  );

  assert.notDeepEqual(
    sampleVector(point[0], point[1], 8, calmState),
    sampleVector(point[0], point[1], 9, calmState)
  );
});

test('calm router enforces a minimum dwell between route changes', () => {
  const calmState = { ...state, calm: true };
  let router = initialRouter();

  for (let frame = 0; frame < 98; frame++) {
    router = advanceRouter(router, frame, 1000, calmState);
    assert.equal(router.phase, 0);
    assert.equal(router.flips, 0);
  }

  let changed = false;
  for (let frame = 98; frame < 160; frame++) {
    const before = router;
    router = advanceRouter(router, frame, 1000, calmState);
    if (router.flips > before.flips) {
      changed = true;
      assert.equal(router.transition, 1);
      assert.equal(router.phaseAge, 0);
      break;
    }
  }

  assert.equal(changed, true);
});

test('calm transition strength decays after a route change', () => {
  const calmState = { ...state, calm: true };
  let router = initialRouter();

  for (let frame = 0; frame < 180; frame++) {
    const before = router;
    router = advanceRouter(router, frame, 1000, calmState);
    if (router.flips > before.flips) {
      const next = advanceRouter(router, frame + 1, 0, calmState);
      assert.ok(next.transition < 1);
      assert.ok(next.transition > 0);
      return;
    }
  }

  assert.fail('expected a calm route transition');
});

test('linear temporal hold avoids brightness pumping', () => {
  const currentFrame = new Uint8ClampedArray([64, 64, 64, 255]);
  const previousFrame = new Uint8ClampedArray([64, 64, 64, 255]);

  const calm = mixFrames(currentFrame, previousFrame, 1, 1, 0.9, 0, 0, true);
  const legacy = mixFrames(currentFrame, previousFrame, 1, 1, 0.9, 0, 0, false);

  assert.deepEqual(calm, currentFrame);
  assert.ok(legacy[0] > calm[0]);
});
