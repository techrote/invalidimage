import { renderFrame, initialRouter } from './engine/pipeline.js';
import { makeSurface } from './engine/surface.js';

const canvas = document.querySelector('#view');
const fileInput = document.querySelector('#file');
const status = document.querySelector('#status');

if (!canvas || !fileInput || !status) {
  throw new Error('required application elements are missing');
}

const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
if (!context) {
  throw new Error('2D canvas context is unavailable');
}

const ids = [
  'seed',
  'autonomy',
  'displacement',
  'memory',
  'pressure',
  'textureMotion',
  'textureComplexity',
  'swirl',
  'localWarp',
  'directions',
  'macroMode',
  'globalAmount',
  'skewPan',
  'feedbackX',
  'feedbackY',
  'addressAmount',
  'stridePan',
  'xorIdentity',
  'routeIndex',
  'palettePosition',
  'themeAmount',
  'paletteAlphaVariant',
  'addressing',
  'adaptive',
  'calm'
];
const controls = Object.fromEntries(ids.map((id) => [id, document.querySelector('#' + id)]));
const readout = {
  frame: document.querySelector('#frame'),
  route: document.querySelector('#route'),
  energy: document.querySelector('#energy'),
  latch: document.querySelector('#latch')
};

for (const [id, control] of Object.entries(controls)) {
  if (!control) throw new Error('missing control #' + id);
}
for (const [id, node] of Object.entries(readout)) {
  if (!node) throw new Error('missing readout #' + id);
}

let frame = 0;
let paused = false;
let history = null;
let source = null;
let generatedSource = null;
let generatedSeed = null;
let router = initialRouter();
let raf = 0;
let failed = false;

function reportFailure(error) {
  failed = true;
  paused = true;
  const message = error instanceof Error ? error.message : String(error);
  status.textContent = 'renderer failed — ' + message;
  console.error('Invalid Image renderer failed:', error);
}

function readState() {
  return {
    seed: Number(controls.seed.value) | 0,
    autonomy: Number(controls.autonomy.value),
    displacement: Number(controls.displacement.value),
    memory: Number(controls.memory.value),
    pressure: Number(controls.pressure.value),
    textureMotion: Number(controls.textureMotion.value),
    textureComplexity: Number(controls.textureComplexity.value),
    swirl: Number(controls.swirl.value),
    localWarp: Number(controls.localWarp.value),
    directions: Number(controls.directions.value),
    macroMode: controls.macroMode.value,
    globalAmount: Number(controls.globalAmount.value),
    skewPan: Number(controls.skewPan.value),
    feedbackX: Number(controls.feedbackX.value),
    feedbackY: Number(controls.feedbackY.value),
    addressAmount: Number(controls.addressAmount.value),
    stridePan: Number(controls.stridePan.value),
    xorIdentity: Number(controls.xorIdentity.value),
    routeIndex: Number(controls.routeIndex.value),
    palettePosition: Number(controls.palettePosition.value),
    themeAmount: Number(controls.themeAmount.value),
    paletteAlphaVariant: controls.paletteAlphaVariant.checked ? 1 : 0,
    addressing: controls.addressing.checked,
    adaptive: controls.adaptive.checked,
    calm: controls.calm.checked
  };
}

function reset() {
  frame = 0;
  history = null;
  router = initialRouter();
}

function syncOutputs() {
  document.querySelectorAll('input[type="range"]').forEach((input) => {
    const output = input.parentElement.querySelector('output');
    if (output) output.value = Number(input.value).toFixed(2);
  });
}

function sourceFor(state) {
  if (source) return source;
  if (!generatedSource || generatedSeed !== state.seed) {
    status.textContent = 'building generated source';
    generatedSource = makeSurface(canvas.width, canvas.height, state.seed, 0);
    generatedSeed = state.seed;
  }
  return generatedSource;
}

function drawOne() {
  if (failed) return;

  try {
    const state = readState();
    const frameSource = sourceFor(state);
    const result = renderFrame({
      width: canvas.width,
      height: canvas.height,
      frame,
      state,
      source: frameSource,
      history,
      router
    });

    history = result.image.slice();
    router = result.router;
    context.putImageData(new ImageData(result.image, canvas.width, canvas.height), 0, 0);

    readout.frame.textContent = String(frame);
    readout.route.textContent = result.route;
    readout.energy.textContent = result.energy.toFixed(2);
    readout.latch.textContent = router.phase + ':' + router.flips;
    status.textContent = source ? 'external source / live state' : 'generated source / live state';
    frame += 1;
  } catch (error) {
    reportFailure(error);
  }
}

function loop() {
  if (!paused && !failed) drawOne();
  raf = requestAnimationFrame(loop);
}

async function loadFile(file) {
  if (!file || failed) return;

  try {
    status.textContent = 'loading image';
    const bitmap = await createImageBitmap(file);
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tctx = temp.getContext('2d');

    if (!tctx) {
      bitmap.close();
      throw new Error('temporary 2D canvas context is unavailable');
    }

    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, temp.width, temp.height);

    const scale = Math.max(temp.width / bitmap.width, temp.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    tctx.drawImage(bitmap, (temp.width - width) / 2, (temp.height - height) / 2, width, height);
    source = tctx.getImageData(0, 0, temp.width, temp.height).data.slice();
    bitmap.close();
    reset();
    status.textContent = 'external source / ready';
  } catch (error) {
    reportFailure(error);
  }
}

for (const input of Object.values(controls)) input.addEventListener('input', syncOutputs);
controls.seed.addEventListener('change', reset);

document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#pause').addEventListener('click', (event) => {
  if (failed) return;
  paused = !paused;
  event.currentTarget.textContent = paused ? 'resume' : 'pause';
});
document.querySelector('#step').addEventListener('click', () => {
  if (failed) return;
  paused = true;
  drawOne();
});
document.querySelector('#mutate').addEventListener('click', () => {
  if (failed) return;
  const seed = (Number(controls.seed.value) | 0) + 1 + ((router.pulse * 17) % 997);
  controls.seed.value = String(seed);
  controls.pressure.value = String(Math.min(1, Math.max(0, Number(controls.pressure.value) + ((router.phase - 1.5) * 0.03))));
  syncOutputs();
  reset();
});

canvas.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadFile(fileInput.files?.[0]));
canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  loadFile(event.dataTransfer?.files?.[0]);
});

window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));

syncOutputs();
status.textContent = 'starting renderer';
window.__invalidImageBooted = true;
window.dispatchEvent(new Event('invalid-image-ready'));

raf = requestAnimationFrame(() => {
  drawOne();
  if (!failed) raf = requestAnimationFrame(loop);
});
