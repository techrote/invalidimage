import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { resolveModulation } from '../src/engine/modulation.js';
import { advanceMacroTransport } from '../src/engine/macro-transport.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

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

function hostileRouter(index) {
  return {
    phase: index & 3,
    pulse: index * 97,
    transition: (index % 11) / 10,
    driftX: (index % 7) - 3,
    driftY: 3 - (index % 7),
    flips: index * 13
  };
}

test('production controls are grouped by explicit modulation responsibility', () => {
  for (const group of ['local-texture', 'global-transform', 'theme', 'macro-transport']) {
    assert.match(html, new RegExp(`data-control-group="${group}"`));
  }

  for (const legend of ['Local Texture', 'Global Transform', 'Theme', 'Macro Transport']) {
    assert.match(html, new RegExp(`<legend>${legend}<\\/legend>`));
  }

  assert.match(html, /<details class="legacy-controls">/);
  assert.doesNotMatch(html, /<details class="legacy-controls"\s+open/);
});

test('production startup defaults keep macro state stationary and local motion alive', () => {
  const state = productionState();

  assert.equal(state.macroMode, 'manual');
  assert.equal(state.macroSpeed, 0);
  assert.equal(state.macroPan, 0);
  assert.equal(state.macroHold, false);
  assert.ok(state.textureMotion > 0);
  assert.ok(state.globalAmount >= 0.05 && state.globalAmount <= 0.15);
  assert.equal(state.routeIndex, 0);
  assert.equal(state.palettePosition, 0);

  const baseline = resolveModulation({
    state,
    frame: 0,
    router: hostileRouter(0),
    width: 384
  });

  for (const frame of [1, 17, 63, 239, 512, 4096]) {
    const current = resolveModulation({
      state,
      frame,
      router: hostileRouter(frame),
      width: 384
    });
    assert.deepEqual(current.macro, baseline.macro, `macro changed at frame ${frame}`);
  }

  const later = resolveModulation({
    state,
    frame: 512,
    router: hostileRouter(0),
    width: 384
  });

  assert.notDeepEqual(
    [later.micro.fieldGroup, later.micro.fieldNextGroup, later.micro.fieldPhase],
    [baseline.micro.fieldGroup, baseline.micro.fieldNextGroup, baseline.micro.fieldPhase]
  );
  assert.equal(baseline.macro.rowSkew, 0);
  assert.equal(baseline.macro.feedbackX, 0);
  assert.equal(baseline.macro.feedbackY, 0);
  assert.equal(baseline.macro.routeIndex, 0);
  assert.equal(baseline.macro.palettePosition, 0);
});

test('mode changes leave micro state alone and stationary transports do not move pan', () => {
  const state = productionState();
  const router = hostileRouter(9);
  const frame = 137;

  const manual = resolveModulation({ state, frame, router, width: 384 });
  const sweep = resolveModulation({ state: { ...state, macroMode: 'sweep' }, frame, router, width: 384 });
  const legacy = resolveModulation({ state: { ...state, macroMode: 'legacy-auto' }, frame, router, width: 384 });

  assert.deepEqual(sweep.micro, manual.micro);
  assert.deepEqual(legacy.micro, manual.micro);

  assert.equal(advanceMacroTransport({ macroMode: 'manual', macroPan: 0.375, macroSpeed: 1, frames: 600 }).macroPan, 0.375);
  assert.equal(advanceMacroTransport({ macroMode: 'sweep', macroPan: 0.375, macroSpeed: 0, frames: 600 }).macroPan, 0.375);
  assert.equal(advanceMacroTransport({ macroMode: 'sweep', macroPan: 0.375, macroSpeed: 1, macroHold: true, frames: 600 }).macroPan, 0.375);
});

test('Hold Macro and Pause remain distinct production interactions', () => {
  assert.match(html, /id="macroHold"[^>]*> Hold Macro/);
  assert.match(html, /id="pause"[^>]*aria-pressed="false"[^>]*>pause<\/button>/);
  assert.match(html, /Hold freezes macro transport only\. Pause freezes rendering\./);

  assert.match(app, /function setPaused\(nextPaused\)/);
  assert.match(app, /setPaused\(true\);\s*drawOne\(\);/);
  assert.match(app, /advanceMacroTransport\(\{/);
});

test('existing load/reset/step/mutate production controls remain present', () => {
  for (const id of ['file', 'reset', 'pause', 'step', 'mutate']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const id of [
    'textureMotion', 'textureComplexity', 'swirl', 'localWarp',
    'globalAmount', 'skewPan', 'feedbackX', 'feedbackY', 'addressAmount', 'stridePan',
    'palettePosition', 'themeAmount', 'routeIndex',
    'macroPan', 'macroMode', 'macroSpeed', 'macroHold'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
