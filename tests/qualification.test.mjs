import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { advanceMacroTransport } from '../src/engine/macro-transport.js';
import { resolveModulation } from '../src/engine/modulation.js';
import { initialRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function inputTag(id) {
  const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  assert.ok(match, `missing input #${id}`);
  return match[0];
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;
}

function inputNumber(id) {
  const value = attr(inputTag(id), 'value');
  assert.notEqual(value, null, `missing value for #${id}`);
  return Number(value);
}

function inputChecked(id) {
  return /\bchecked\b/i.test(inputTag(id));
}

function selectedValue(id) {
  const match = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
  assert.ok(match, `missing select #${id}`);
  const options = [...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  assert.ok(options.length > 0, `missing options for #${id}`);
  const selected = options.find((option) => /\bselected\b/i.test(option[1])) ?? options[0];
  return selected[1].match(/\bvalue="([^"]*)"/i)?.[1] ?? selected[2].trim();
}

function productionState() {
  return {
    seed: inputNumber('seed'),
    autonomy: inputNumber('autonomy'),
    displacement: inputNumber('displacement'),
    memory: inputNumber('memory'),
    pressure: inputNumber('pressure'),
    textureMotion: inputNumber('textureMotion'),
    textureComplexity: inputNumber('textureComplexity'),
    swirl: inputNumber('swirl'),
    localWarp: inputNumber('localWarp'),
    directions: Number(selectedValue('directions')),
    macroMode: selectedValue('macroMode'),
    macroPan: inputNumber('macroPan'),
    macroSpeed: inputNumber('macroSpeed'),
    macroHold: inputChecked('macroHold'),
    globalAmount: inputNumber('globalAmount'),
    skewPan: inputNumber('skewPan'),
    feedbackX: inputNumber('feedbackX'),
    feedbackY: inputNumber('feedbackY'),
    addressAmount: inputNumber('addressAmount'),
    stridePan: inputNumber('stridePan'),
    xorIdentity: inputNumber('xorIdentity'),
    routeIndex: Number(selectedValue('routeIndex')),
    palettePosition: inputNumber('palettePosition'),
    themeAmount: inputNumber('themeAmount'),
    paletteAlphaVariant: inputChecked('paletteAlphaVariant') ? 1 : 0,
    addressing: inputChecked('addressing'),
    adaptive: inputChecked('adaptive'),
    calm: inputChecked('calm')
  };
}

const VISUAL_MACRO_FIELDS = Object.freeze([
  'manualMode',
  'globalAmount',
  'skewPan',
  'rowSkew',
  'stridePan',
  'byteStride',
  'addressAmount',
  'xorAmount',
  'xorIdentity',
  'xorMask',
  'feedbackX',
  'feedbackY',
  'routeIndex',
  'palettePosition',
  'themeAmount',
  'paletteAlphaVariant',
  'channelOrderIndex',
  'byteRotation'
]);

function visualMacroSignature(macro) {
  return Object.fromEntries(VISUAL_MACRO_FIELDS.map((key) => [key, macro[key]]));
}

function microTimeSignature(micro) {
  return [micro.fieldGroup, micro.fieldNextGroup, micro.fieldPhase];
}

function meanRgbDelta(a, b) {
  assert.equal(a.length, b.length);
  let total = 0;
  let samples = 0;
  for (let i = 0; i < a.length; i += 4) {
    total += Math.abs(a[i] - b[i]);
    total += Math.abs(a[i + 1] - b[i + 1]);
    total += Math.abs(a[i + 2] - b[i + 2]);
    samples += 3;
  }
  return total / Math.max(1, samples);
}

function hostileRouter(index) {
  return {
    ...initialRouter(),
    phase: index & 3,
    pulse: index * 97,
    transition: (index % 11) / 10,
    driftX: (index % 7) - 3,
    driftY: 3 - (index % 7),
    flips: index * 13,
    orphan: (index % 17) * 3.25,
    charge: (index % 19) - 9
  };
}

function runHeadless(state, { frames = 96, width = 40, height = 30 } = {}) {
  const active = { ...state };
  const source = makeSurface(width, height, active.seed, 0);
  let history = null;
  let router = initialRouter();
  let previousImage = null;
  let previousMacro = null;
  let firstMicro = null;
  let lastMicro = null;
  let macroChanges = 0;
  let routeChanges = 0;
  let paletteChanges = 0;
  let totalPixelDelta = 0;
  let pixelDeltaSamples = 0;

  for (let frame = 0; frame < frames; frame++) {
    const result = renderFrame({
      width,
      height,
      frame,
      state: active,
      source,
      history,
      router
    });
    const macro = visualMacroSignature(result.modulation.macro);

    if (!firstMicro) firstMicro = microTimeSignature(result.modulation.micro);
    lastMicro = microTimeSignature(result.modulation.micro);

    if (previousMacro) {
      if (!Object.is(JSON.stringify(macro), JSON.stringify(previousMacro))) macroChanges += 1;
      if (macro.routeIndex !== previousMacro.routeIndex) routeChanges += 1;
      if (macro.palettePosition !== previousMacro.palettePosition) paletteChanges += 1;
    }

    if (previousImage) {
      totalPixelDelta += meanRgbDelta(previousImage, result.image);
      pixelDeltaSamples += 1;
    }

    previousMacro = macro;
    previousImage = result.image.slice();
    history = result.image.slice();
    router = result.router;

    const next = advanceMacroTransport({
      macroMode: active.macroMode,
      macroPan: active.macroPan,
      macroSpeed: active.macroSpeed,
      macroHold: active.macroHold,
      frames: 1
    });
    active.macroPan = next.macroPan;
  }

  return {
    macroChanges,
    routeChanges,
    paletteChanges,
    meanPixelDelta: totalPixelDelta / Math.max(1, pixelDeltaSamples),
    firstMicro,
    lastMicro,
    finalPan: active.macroPan,
    finalMacro: previousMacro
  };
}

function sweepSequence(state, frames = 180) {
  const active = { ...state };
  const sequence = [];

  for (let frame = 0; frame < frames; frame++) {
    const resolved = resolveModulation({
      state: active,
      frame: frame * 13,
      router: hostileRouter(frame),
      width: 113
    });
    sequence.push(visualMacroSignature(resolved.macro));
    active.macroPan = advanceMacroTransport({
      macroMode: active.macroMode,
      macroPan: active.macroPan,
      macroSpeed: active.macroSpeed,
      macroHold: active.macroHold,
      frames: 1
    }).macroPan;
  }

  return { sequence, finalPan: active.macroPan };
}

test('production defaults keep the complete resolved macro visual state stationary for 300 sequential frames while local texture stays live', () => {
  const state = productionState();
  assert.equal(state.macroMode, 'manual');
  assert.equal(state.macroSpeed, 0);
  assert.ok(state.textureMotion > 0);

  const run = runHeadless(state, { frames: 300, width: 48, height: 36 });

  assert.equal(run.macroChanges, 0);
  assert.equal(run.routeChanges, 0);
  assert.equal(run.paletteChanges, 0);
  assert.notDeepEqual(run.lastMicro, run.firstMicro);
  assert.ok(run.meanPixelDelta > 0, 'local/history rendering should continue changing pixels');
  assert.equal(run.finalMacro.routeIndex, state.routeIndex);
  assert.equal(run.finalMacro.palettePosition, state.palettePosition);
});

test('Macro Hold freezes sweep macro evolution for 300 frames without freezing micro time or rendering', () => {
  const state = {
    ...productionState(),
    macroMode: 'sweep',
    macroPan: 0.42,
    macroSpeed: 0.6,
    macroHold: true
  };

  const run = runHeadless(state, { frames: 300, width: 40, height: 32 });
  assert.equal(run.finalPan, 0.42);
  assert.equal(run.macroChanges, 0);
  assert.notDeepEqual(run.lastMicro, run.firstMicro);
  assert.ok(run.meanPixelDelta > 0);
});

test('manual route and palette stay independent under hostile router/time changes', () => {
  const state = {
    ...productionState(),
    macroPan: 0,
    routeIndex: 3,
    palettePosition: 1.25,
    themeAmount: 0.63,
    paletteAlphaVariant: 1
  };
  const baseline = resolveModulation({ state, frame: 0, router: hostileRouter(0), width: 257 }).macro;
  const baselineVisual = visualMacroSignature(baseline);

  for (let frame = 1; frame <= 240; frame++) {
    const current = resolveModulation({ state, frame, router: hostileRouter(frame), width: 257 }).macro;
    assert.deepEqual(visualMacroSignature(current), baselineVisual);
    assert.equal(current.routeIndex, 3);
    assert.equal(current.palettePosition, 1.25);
  }

  const routeOnly = resolveModulation({
    state: { ...state, routeIndex: 1 },
    frame: 999,
    router: hostileRouter(999),
    width: 257
  }).macro;
  assert.equal(routeOnly.routeIndex, 1);
  assert.equal(routeOnly.palettePosition, baseline.palettePosition);
  assert.equal(routeOnly.themeAmount, baseline.themeAmount);
  assert.equal(routeOnly.paletteAlphaVariant, baseline.paletteAlphaVariant);

  const paletteOnly = resolveModulation({
    state: { ...state, palettePosition: 0.2 },
    frame: 1999,
    router: hostileRouter(1999),
    width: 257
  }).macro;
  assert.equal(paletteOnly.routeIndex, baseline.routeIndex);
  assert.equal(paletteOnly.palettePosition, 0.2);
});

test('sweep macro sequence is deterministic, endpoint-safe, and returns to stability at zero speed', () => {
  const state = {
    ...productionState(),
    macroMode: 'sweep',
    macroPan: 0.17,
    macroSpeed: 0.37,
    macroHold: false
  };
  const a = sweepSequence(state, 180);
  const b = sweepSequence(state, 180);

  assert.deepEqual(a, b);
  assert.ok(new Set(a.sequence.map((entry) => JSON.stringify(entry))).size > 1);

  for (const pan of [0, 1]) {
    const resolved = resolveModulation({
      state: { ...state, macroPan: pan, macroSpeed: 0 },
      frame: Number.MAX_SAFE_INTEGER,
      router: hostileRouter(4096),
      width: 257
    });
    assert.ok(resolved.macro.routeIndex >= 0 && resolved.macro.routeIndex <= 3);
    assert.ok(resolved.macro.palettePosition >= 0 && resolved.macro.palettePosition <= 2);
  }

  const stopped = { ...state, macroPan: a.finalPan, macroSpeed: 0 };
  const baseline = visualMacroSignature(resolveModulation({
    state: stopped,
    frame: 0,
    router: hostileRouter(0),
    width: 257
  }).macro);

  for (let frame = 1; frame <= 240; frame++) {
    const current = resolveModulation({
      state: stopped,
      frame,
      router: hostileRouter(frame),
      width: 257
    }).macro;
    assert.deepEqual(visualMacroSignature(current), baseline);
  }
});

test('zero global amount is a neutral macro-transform boundary while local texture still evolves', () => {
  const state = {
    ...productionState(),
    macroMode: 'manual',
    macroPan: 0,
    globalAmount: 0,
    skewPan: 1,
    stridePan: -1,
    feedbackX: 8,
    feedbackY: -4,
    addressAmount: 1
  };
  const first = resolveModulation({ state, frame: 0, router: hostileRouter(0), width: 384 });
  const later = resolveModulation({ state, frame: 300, router: hostileRouter(300), width: 384 });

  for (const resolved of [first, later]) {
    assert.equal(resolved.macro.rowSkew, 0);
    assert.equal(resolved.macro.byteStride, 0);
    assert.equal(resolved.macro.addressAmount, 0);
    assert.equal(resolved.macro.xorAmount, 0);
    assert.equal(resolved.macro.feedbackX, 0);
    assert.equal(resolved.macro.feedbackY, 0);
    assert.equal(resolved.micro.directions, state.directions);
  }

  assert.notDeepEqual(microTimeSignature(first.micro), microTimeSignature(later.micro));
});

test('headless frame-delta metric distinguishes live local motion, moving macro transport, and a stopped macro transport without an arbitrary pixel threshold', () => {
  const production = productionState();
  const stationary = runHeadless(production, { frames: 96, width: 48, height: 36 });
  assert.equal(stationary.macroChanges, 0);
  assert.equal(stationary.routeChanges, 0);
  assert.equal(stationary.paletteChanges, 0);
  assert.ok(stationary.meanPixelDelta > 0);

  const moving = runHeadless({
    ...production,
    macroMode: 'sweep',
    macroPan: 0,
    macroSpeed: 0.24,
    macroHold: false
  }, { frames: 96, width: 48, height: 36 });
  assert.ok(moving.macroChanges > 0);

  const stopped = runHeadless({
    ...production,
    macroMode: 'sweep',
    macroPan: moving.finalPan,
    macroSpeed: 0,
    macroHold: false
  }, { frames: 96, width: 48, height: 36 });
  assert.equal(stopped.macroChanges, 0);
  assert.ok(stopped.meanPixelDelta > 0);
});
