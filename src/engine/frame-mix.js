export function mixFrames(current, previous, width, height, amount, dx, dy) {
  if (!previous || previous.length !== current.length) return current.slice();

  const out = new Uint8ClampedArray(current.length);
  const keep = Math.max(0, Math.min(0.98, amount));

  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(height - 1, y + dy));
    for (let x = 0; x < width; x++) {
      const sx = (x + dx + width) % width;
      const a = (y * width + x) * 4;
      const b = (sy * width + sx) * 4;

      for (let c = 0; c < 3; c++) {
        const fresh = current[a + c] / 255;
        const held = previous[b + c] / 255;
        out[a + c] = (fresh * (1 - keep) + Math.sqrt(held) * keep) * 255;
      }
      out[a + 3] = Math.max(current[a + 3], previous[b + 3] * keep);
    }
  }

  return out;
}
