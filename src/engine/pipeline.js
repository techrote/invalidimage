import { hashWords } from '../core/prng.js';
import { advanceLatch, tapeValue } from '../core/legacy-tape.js';
import { makeSurface } from './surface.js';
import { warpImage } from './field.js';
import { addressTransform } from './address.js';
import { remapPalette } from './palette.js';
import { mixFrames } from './frame-mix.js';

const ROUTES = Object.freeze([
  ['field', 'address', 'palette'],
  ['address', 'field', 'palette'],
  ['palette', 'address', 'field'],
  ['field', 'palette', 'address']
]);

function energyOf(bytes) {
  let total = 0;
  let previous = bytes[0] || 0;
  const stride = Math.max(4, Math.floor(bytes.length / 4096 / 4) * 4);
  for (let i = 0; i < bytes.length; i += stride) {
    const value = bytes[i] + bytes[i + 1] + bytes[i + 2];
    total += Math.abs(value - previous);
    previous = value;
  }
  return total / Math.max(1, bytes.length / stride);
}

function applyPass(name, image, width, height, frame, state, phase) {
  if (name === 'field') return warpImage(image, width, height, frame, state);
  if (name === 'address') return addressTransform(image, width, height, frame, state, phase);
  if (name === 'palette') return remapPalette(image, phase, state.pressure);
  return image;
}

export function initialRouter() {
  return { phase: 0, charge: 0, flips: 0, pulse: 0, orphan: 0 };
}

export function advanceRouter(router, frame, energy, state) {
  const updated = advanceLatch(router, frame, energy + router.orphan, state.seed, state.autonomy);
  const pulse = tapeValue(frame, state.seed);
  const orphan = router.orphan * 0.91 + ((energy * (pulse % 5)) / 64);

  if (!state.adaptive) {
    return { ...router, pulse, orphan };
  }

  return {
    phase: updated.phase,
    charge: updated.charge,
    flips: updated.flips,
    pulse,
    orphan
  };
}

export function routeFor(router) {
  return ROUTES[router.phase & 3];
}

export function renderFrame({ width, height, frame, state, source, history, router }) {
  const generated = source ? source.slice() : makeSurface(width, height, state.seed, frame);
  let image = generated;
  const route = routeFor(router);
  let detachedEnergy = 0;

  for (let i = 0; i < route.length; i++) {
    const before = image;
    image = applyPass(route[i], image, width, height, frame, state, router.phase);
    if (((router.pulse + i) & 3) === 0) {
      detachedEnergy += Math.abs(energyOf(image) - energyOf(before));
    }
  }

  const dx = ((hashWords(state.seed, frame >> 2) & 7) - 3) * Math.round(state.displacement * 2);
  const dy = ((router.pulse % 5) - 2) * Math.round(state.pressure * 2);
  image = mixFrames(image, history, width, height, state.memory, dx, dy);

  const energy = energyOf(image);
  const nextRouter = advanceRouter(
    { ...router, orphan: router.orphan + detachedEnergy },
    frame,
    energy,
    state
  );

  return {
    image,
    energy,
    route: route.join(' > '),
    router: nextRouter
  };
}
