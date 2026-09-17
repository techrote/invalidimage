const PALETTES = [
  [[8,10,18],[20,46,63],[21,111,119],[73,195,190],[202,75,169],[113,72,190],[78,98,202]],
  [[7,9,12],[38,22,62],[100,42,122],[214,78,154],[74,182,196],[214,218,222]],
  [[4,10,18],[20,68,78],[41,143,131],[232,194,92],[219,83,122],[94,59,156]]
];

function luminance(r, g, b) {
  return (r * 54 + g * 183 + b * 19) / 256;
}

export function remapPalette(input, phase, pressure) {
  const palette = PALETTES[phase % PALETTES.length];
  const out = new Uint8ClampedArray(input.length);

  for (let i = 0; i < input.length; i += 4) {
    const control = phase === 3 ? input[i + 3] : luminance(input[i], input[i + 1], input[i + 2]);
    const scaled = Math.max(0, Math.min(0.9999, control / 255)) * palette.length;
    const index = Math.floor(scaled);
    const next = Math.min(palette.length - 1, index + 1);
    const t = (scaled - index) * (0.25 + pressure * 0.75);
    const a = palette[index];
    const b = palette[next];
    out[i] = a[0] + (b[0] - a[0]) * t;
    out[i + 1] = a[1] + (b[1] - a[1]) * t;
    out[i + 2] = a[2] + (b[2] - a[2]) * t;
    out[i + 3] = phase === 3 ? Math.max(12, input[i + 3] - pressure * 24) : input[i + 3];
  }

  return out;
}
