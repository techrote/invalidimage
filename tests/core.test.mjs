import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashWords } from '../src/core/prng.js';
import { tapeValue, advanceLatch } from '../src/core/legacy-tape.js';
import { makeSurface } from '../src/engine/surface.js';
import { addressTransform } from '../src/engine/address.js';

test('seeded generator is repeatable', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  assert.deepEqual(
    [a.nextUint(), a.nextUint(), a.nextUint()],
    [b.nextUint(), b.nextUint(), b.nextUint()]
  );
  assert.equal(hashWords(1, 2, 3), hashWords(1, 2, 3));
});

test('cadence and latch are deterministic', () => {
  assert.equal(tapeValue(17, 42), tapeValue(17, 42));
  const state = { phase: 0, charge: 0, flips: 0 };
  assert.deepEqual(
    advanceLatch(state, 31, 19.5, 42, 0.6),
    advanceLatch(state, 31, 19.5, 42, 0.6)
  );
});

test('generated surface is stable for same frame', () => {
  const a = makeSurface(24, 18, 5501, 9);
  const b = makeSurface(24, 18, 5501, 9);
  assert.deepEqual(a, b);
  assert.equal(a.length, 24 * 18 * 4);
});

test('address pass preserves extent', () => {
  const source = makeSurface(16, 12, 99, 1);
  const state = {
    seed: 99,
    memory: 0.7,
    pressure: 0.4,
    autonomy: 0.5,
    addressing: true
  };
  const out = addressTransform(source, 16, 12, 3, state, 2);
  assert.equal(out.length, source.length);
});
