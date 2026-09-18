import { spawnSync } from 'node:child_process';

const files = [
  'src/app.js',
  'src/core/prng.js',
  'src/core/legacy-tape.js',
  'src/engine/surface.js',
  'src/engine/field.js',
  'src/engine/address.js',
  'src/engine/palette.js',
  'src/engine/frame-mix.js',
  'src/engine/macro-transport.js',
  'src/engine/modulation.js',
  'src/engine/pipeline.js',
  'scripts/dev.mjs'
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('syntax check passed');
