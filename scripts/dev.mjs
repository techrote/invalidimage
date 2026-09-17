import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function openBrowser(url) {
  if (process.env.NO_OPEN === '1' || process.env.CI) return;

  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    console.log('Open this URL in a browser: ' + url);
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const raw = decodeURIComponent((request.url || '/').split('?')[0]);
    const relative = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
    const candidate = normalize(join(root, relative));

    if (!candidate.startsWith(root)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (!(await stat(candidate)).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }

    const data = await readFile(candidate);
    response.writeHead(200, {
      'content-type': mime.get(extname(candidate)) || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(data);
  } catch {
    response.writeHead(404).end('not found');
  }
});

server.on('error', (error) => {
  console.error('Invalid Image server failed:', error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const url = 'http://' + host + ':' + port;
  console.log('Invalid Image: ' + url);
  console.log('Close this terminal to stop the local server.');
  openBrowser(url);
});
