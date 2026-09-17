import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRouter, advanceRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';
import { sampleVector, warpImage } from '../src/engine/field.js';

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
