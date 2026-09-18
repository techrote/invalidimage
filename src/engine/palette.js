const PALETTES = [
  [[8,10,18],[20,46,63],[21,111,119],[73,195,190],[202,75,169],[113,72,190],[78,98,202]],
  [[7,9,12],[38,22,62],[100,42,122],[214,78,154],[74,182,196],[214,218,222]],
  [[4,10,18],[20,68,78],[41,143,131],[232,194,92],[219,83,122],[94,59,156]]
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function luminance(r, g, b) {
  return (r * 54 + g * 183 + b * 19) / 256;
}

function samplePalette(palette, control, themeAmount) {
  const scaled = clamp(control / 255, 0, 0.9999) * palette.length;
  const index = Math.floor(scaled);
  const next = Math.min(palette.length - 1, index + 1);
  const t = (scaled - index) * (0.25 + themeAmount * 0.75);
  const a = palette[index];
  const b = palette[next];

  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

/**
 * Remap an RGBA image through an explicit continuous palette coordinate.
 *
 * palettePosition spans 0..PALETTES.length-1. Fractional positions blend the
 * independently remapped colours of the two neighbouring palettes, which keeps
 * interpolation deterministic even though palette arrays have different lengths.
 * Integer positions keep the historical single-palette hot path. themeAmount
 * preserves the legacy within-palette interpolation-strength role. alphaVariant
 * is an explicit 0..1 blend from luminance-driven to alpha-driven control;
 * route/pass order never enters this function.
 */
export function remapPalette(input, palettePosition = 0, themeAmount = 1, alphaVariant = 0) {
  const position = clamp(finiteNumber(palettePosition), 0, PALETTES.length - 1);
  const amount = clamp(finiteNumber(themeAmount, 1), 0, 1);
  const alphaMix = clamp(finiteNumber(alphaVariant), 0, 1);
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(PALETTES.length - 1, firstIndex + 1);
  const paletteMix = position - firstIndex;
  const firstPalette = PALETTES[firstIndex];
  const secondPalette = PALETTES[secondIndex];
  const blendPalettes = paletteMix > 0 && secondIndex !== firstIndex;
  const out = new Uint8ClampedArray(input.length);

  for (let i = 0; i < input.length; i += 4) {
    const light = luminance(input[i], input[i + 1], input[i + 2]);
    const control = light + (input[i + 3] - light) * alphaMix;
    const first = samplePalette(firstPalette, control, amount);
    const second = blendPalettes ? samplePalette(secondPalette, control, amount) : first;

    out[i] = first[0] + (second[0] - first[0]) * paletteMix;
    out[i + 1] = first[1] + (second[1] - first[1]) * paletteMix;
    out[i + 2] = first[2] + (second[2] - first[2]) * paletteMix;
    out[i + 3] = alphaMix > 0
      ? Math.max(12, input[i + 3] - amount * 24 * alphaMix)
      : input[i + 3];
  }

  return out;
}
