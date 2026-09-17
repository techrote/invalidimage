import { renderFrame, initialRouter } from './engine/pipeline.js';

const canvas = document.querySelector('#view');
const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
const fileInput = document.querySelector('#file');
const status = document.querySelector('#status');

const ids = ['seed', 'autonomy', 'displacement', 'memory', 'pressure', 'directions', 'addressing', 'adaptive'];
const controls = Object.fromEntries(ids.map((id) => [id, document.querySelector('#' + id)]));
const readout = {
  frame: document.querySelector('#frame'),
  route: document.querySelector('#route'),
  energy: document.querySelector('#energy'),
  latch: document.querySelector('#latch')
};

let frame = 0;
let paused = false;
let history = null;
let source = null;
let router = initialRouter();
let raf = 0;

function readState() {
  return {
    seed: Number(controls.seed.value) | 0,
    autonomy: Number(controls.autonomy.value),
    displacement: Number(controls.displacement.value),
    memory: Number(controls.memory.value),
    pressure: Number(controls.pressure.value),
    directions: Number(controls.directions.value),
    addressing: controls.addressing.checked,
    adaptive: controls.adaptive.checked
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

function drawOne() {
  const state = readState();
  const result = renderFrame({
    width: canvas.width,
    height: canvas.height,
    frame,
    state,
    source,
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
}

function loop() {
  if (!paused) drawOne();
  raf = requestAnimationFrame(loop);
}

async function loadFile(file) {
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  const temp = document.createElement('canvas');
  temp.width = canvas.width;
  temp.height = canvas.height;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = '#000';
  tctx.fillRect(0, 0, temp.width, temp.height);

  const scale = Math.max(temp.width / bitmap.width, temp.height / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  tctx.drawImage(bitmap, (temp.width - width) / 2, (temp.height - height) / 2, width, height);
  source = tctx.getImageData(0, 0, temp.width, temp.height).data.slice();
  bitmap.close();
  reset();
}

for (const input of Object.values(controls)) input.addEventListener('input', syncOutputs);
controls.seed.addEventListener('change', reset);

document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#pause').addEventListener('click', (event) => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'resume' : 'pause';
});
document.querySelector('#step').addEventListener('click', () => {
  paused = true;
  drawOne();
});
document.querySelector('#mutate').addEventListener('click', () => {
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
drawOne();
raf = requestAnimationFrame(loop);
