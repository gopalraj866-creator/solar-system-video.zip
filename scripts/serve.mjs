// Live preview server:  npm run live   → open the printed URL in a 1920x1080 window (or as an OBS Browser Source).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const port = Number(process.env.PORT || 8080);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/public/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`\n  Live preview: http://localhost:${port}/public/index.html?live=1\n  (use a 1920x1080 window / OBS Browser Source; add &badge=LIVE%20%E2%80%A2%20SOLAR%20SYSTEM%20EXPLORER for a LIVE badge)\n`));
