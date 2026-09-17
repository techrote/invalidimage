import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

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

server.listen(port, '127.0.0.1', () => {
  console.log('Invalid Image: http://127.0.0.1:' + port);
});
