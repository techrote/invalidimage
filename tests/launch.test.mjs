import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser entry explains direct file launch failure', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /location\.protocol === 'file:'/);
  assert.match(html, /0Play\.cmd or npm run dev/);
  assert.match(html, /type="module" src="\.\/src\/app\.js"/);
});

test('Windows launcher starts the supported local server', async () => {
  const launcher = await readFile(new URL('../0Play.cmd', import.meta.url), 'utf8');
  assert.match(launcher, /where node/i);
  assert.match(launcher, /npm run dev/i);
});

test('dev server has an explicit no-open escape hatch', async () => {
  const dev = await readFile(new URL('../scripts/dev.mjs', import.meta.url), 'utf8');
  assert.match(dev, /NO_OPEN/);
  assert.match(dev, /openBrowser\(url\)/);
});
