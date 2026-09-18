import { hashWords } from '../core/prng.js';
import { advanceLatch, tapeValue } from '../core/legacy-tape.js';
import { makeSurface } from './surface.js';
import { warpImage } from './field.js';
import { addressTransform } from './address.js';
import { remapPalette } from './palette.js';
import { mixFrames } from './frame-mix.js';
import { resolveModulation } from './modulation.js';

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

function applyPass(name, image, width, height, frame, state, modulation) {
  if (name === 'field') return warpImage(image, width, height, frame, state, modulation.micro);
  if (name === 'address') return addressTransform(image, width, height, state, modulation.macro);
  if (name === 'palette') {
    return remapPalette(
      image,
      modulation.macro.palettePosition,
      modulation.macro.themeAmount,
      modulation.macro.paletteAlphaVariant
    );
  }
  return image;
}

function calmDriftTarget(seed, frame, salt, scale) {
  const group = frame >> 5;
  const unit = (hashWords(seed, group, salt) & 0xffff) / 0xffff;
  return (unit * 2 - 1) * scale;
}

export function initialRouter() {
  return {
    phase: 0,
    prevPhase: 0,
    phaseAge: 0,
    transition: 0,
    charge: 0,
    flips: 0,
    pulse: 0,
    smoothPulse: 0,
    orphan: 0,
    driftX: 0,
    driftY: 0
  };
}

export function advanceRouter(router, frame, energy, state) {
  const updated = advanceLatch(router, frame, energy + router.orphan, state.seed, state.autonomy);
  const pulse = tapeValue(frame, state.seed);
  const orphan = router.orphan * 0.91 + ((energy * (pulse % 5)) / 64);
  const phaseAge = (router.phaseAge ?? 0) + 1;

  if (!state.calm) {
    if (!state.adaptive) {
      return {
        ...router,
        pulse,
        smoothPulse: pulse,
        orphan,
        phaseAge,
        transition: 0,
        driftX: 0,
        driftY: 0
      };
    }

    return {
      ...router,
      phase: updated.phase,
      prevPhase: router.phase,
      phaseAge: updated.phase === router.phase ? phaseAge : 0,
      transition: 0,
      charge: updated.charge,
      flips: updated.flips,
      pulse,
      smoothPulse: pulse,
      orphan,
      driftX: 0,
      driftY: 0
    };
  }

  const smoothPulse = (router.smoothPulse ?? pulse) * 0.94 + pulse * 0.06;
  const targetX = calmDriftTarget(state.seed, frame, 0x510e527f, state.displacement * 3.0);
  const targetY = calmDriftTarget(state.seed, frame, 0x9b05688c, state.pressure * 3.0);
  const driftX = (router.driftX ?? 0) * 0.96 + targetX * 0.04;
  const driftY = (router.driftY ?? 0) * 0.96 + targetY * 0.04;
  const decayedTransition = (router.transition ?? 0) * 0.90;

  if (!state.adaptive) {
    return {
      ...router,
      prevPhase: router.phase,
      phaseAge,
      transition: decayedTransition,
      pulse,
      smoothPulse,
      orphan,
      driftX,
      driftY
    };
  }

  const minDwell = 72 + Math.round((1 - state.autonomy) * 72);
  const wantsChange = updated.phase !== router.phase;
  const acceptChange = wantsChange && phaseAge >= minDwell;

  return {
    ...router,
    phase: acceptChange ? updated.phase : router.phase,
    prevPhase: acceptChange ? router.phase : (router.prevPhase ?? router.phase),
    phaseAge: acceptChange ? 0 : phaseAge,
    transition: acceptChange ? 1 : decayedTransition,
    charge: updated.charge,
    flips: acceptChange ? updated.flips : router.flips,
    pulse,
    smoothPulse,
    orphan,
    driftX,
    driftY
  };
}

export function routeFor(routeSource) {
  const rawIndex = typeof routeSource === 'number'
    ? routeSource
    : routeSource?.phase;
  const index = Number.isFinite(Number(rawIndex)) ? Math.trunc(Number(rawIndex)) : 0;
  return ROUTES[((index % ROUTES.length) + ROUTES.length) % ROUTES.length];
}

export function renderFrame({ width, height, frame, state, source, history, router }) {
  const modulation = resolveModulation({ state, frame, router, width });
  const generated = source ? source.slice() : makeSurface(width, height, state.seed, frame);
  let image = generated;
  const route = routeFor(modulation.macro.routeIndex);
  let detachedEnergy = 0;

  for (let i = 0; i < route.length; i++) {
    const before = image;
    image = applyPass(route[i], image, width, height, frame, state, modulation);
    if (((router.pulse + i) & 3) === 0) {
      detachedEnergy += Math.abs(energyOf(image) - energyOf(before));
    }
  }

  image = mixFrames(
    image,
    history,
    width,
    height,
    modulation.micro.feedbackAmount,
    modulation.macro.feedbackX,
    modulation.macro.feedbackY,
    state.calm
  );

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
    router: nextRouter,
    modulation
  };
}
