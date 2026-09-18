import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';

import { advanceMacroTransport } from '../src/engine/macro-transport.js';
import { initialRouter, renderFrame } from '../src/engine/pipeline.js';
import { makeSurface } from '../src/engine/surface.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fail(message) {
  throw new Error(`IMC-007 qualification failed: ${message}`);
}

function inputTag(id) {
  const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  if (!match) fail(`missing input #${id}`);
  return match[0];
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;
}

function inputNumber(id) {
  const value = attr(inputTag(id), 'value');
  if (value === null) fail(`missing value for #${id}`);
  return Number(value);
}

function inputChecked(id) {
  return /\bchecked\b/i.test(inputTag(id));
}

function selectedValue(id) {
  const match = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
  if (!match) fail(`missing select #${id}`);
  const options = [...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  if (options.length === 0) fail(`missing options for #${id}`);
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

function macroSignature(macro) {
  return Object.fromEntries(VISUAL_MACRO_FIELDS.map((key) => [key, macro[key]]));
}

function meanRgbDelta(a, b) {
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

function runScenario(label, state, { width, height, frames }) {
  const active = { ...state };
  const source = makeSurface(width, height, active.seed, 0);
  let history = null;
  let router = initialRouter();
  let previousImage = null;
  let previousMacro = null;
  let macroChanges = 0;
  let routeChanges = 0;
  let paletteChanges = 0;
  let totalPixelDelta = 0;
  let maximumPixelDelta = 0;
  let pixelDeltaSamples = 0;
  const started = performance.now();

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
    const macro = macroSignature(result.modulation.macro);

    if (previousMacro) {
      if (JSON.stringify(macro) !== JSON.stringify(previousMacro)) macroChanges += 1;
      if (macro.routeIndex !== previousMacro.routeIndex) routeChanges += 1;
      if (macro.palettePosition !== previousMacro.palettePosition) paletteChanges += 1;
    }

    if (previousImage) {
      const delta = meanRgbDelta(previousImage, result.image);
      totalPixelDelta += delta;
      maximumPixelDelta = Math.max(maximumPixelDelta, delta);
      pixelDeltaSamples += 1;
    }

    previousMacro = macro;
    previousImage = result.image.slice();
    history = result.image.slice();
    router = result.router;

    active.macroPan = advanceMacroTransport({
      macroMode: active.macroMode,
      macroPan: active.macroPan,
      macroSpeed: active.macroSpeed,
      macroHold: active.macroHold,
      frames: 1
    }).macroPan;
  }

  const elapsedMs = performance.now() - started;
  return {
    label,
    width,
    height,
    frames,
    macroChanges,
    routeChanges,
    paletteChanges,
    meanPixelDelta: totalPixelDelta / Math.max(1, pixelDeltaSamples),
    maximumPixelDelta,
    finalPan: active.macroPan,
    elapsedMs,
    meanFrameMs: elapsedMs / Math.max(1, frames)
  };
}

const defaults = productionState();
const stationary = runScenario('stationary-default', defaults, {
  width: 48,
  height: 36,
  frames: 120
});
if (stationary.macroChanges !== 0) fail('production Manual macro state changed');
if (stationary.routeChanges !== 0) fail('production route changed');
if (stationary.paletteChanges !== 0) fail('production palette position changed');
if (!(stationary.meanPixelDelta > 0)) fail('local rendering did not remain live');

const moving = runScenario('explicit-sweep', {
  ...defaults,
  macroMode: 'sweep',
  macroPan: 0,
  macroSpeed: 0.24,
  macroHold: false
}, {
  width: 48,
  height: 36,
  frames: 120
});
if (!(moving.macroChanges > 0)) fail('explicit sweep did not move resolved macro state');

const stopped = runScenario('stopped-sweep', {
  ...defaults,
  macroMode: 'sweep',
  macroPan: moving.finalPan,
  macroSpeed: 0,
  macroHold: false
}, {
  width: 48,
  height: 36,
  frames: 120
});
if (stopped.macroChanges !== 0) fail('zero-speed sweep did not return to macro stability');
if (!(stopped.meanPixelDelta > 0)) fail('zero-speed sweep stopped local rendering');

const small = runScenario('benchmark-small', defaults, {
  width: 64,
  height: 64,
  frames: 60
});
const medium = runScenario('benchmark-medium', defaults, {
  width: 160,
  height: 120,
  frames: 40
});

const report = {
  schema: 'imc-007-qualification-v1',
  continuity: {
    stationaryDefault: stationary,
    explicitSweep: moving,
    stoppedSweep: stopped,
    interpretation: 'Pixel deltas prove local/history motion remains live; exact resolved macro-change counts detect hidden macro motion without imposing an aesthetic pixel threshold.'
  },
  performance: {
    note: 'Diagnostic only. Timing is reported for repeatability but is intentionally not compared with a brittle absolute CI threshold. IMC-007 makes no renderer hot-path change.',
    small,
    medium
  }
};

console.log(JSON.stringify(report, null, 2));
