#!/usr/bin/env node
// Headless frame-by-frame renderer: Three.js (WebGL via Chromium) -> JPEG frames -> ffmpeg -> MP4.
// Every frame is a pure function of its timestamp, so the video can be rendered in independent chunks.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DURATION = 480;                                   // seconds on the master timeline (8:00)

// ── args ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; };
const RES = String(opt('res', '1080'));                 // 480 | 720 | 1080 | 4k
const OUT_W = { '480': 854, '720': 1280, '1080': 1920, '1080p': 1920, '4k': 3840, '2160': 3840 }[RES.toLowerCase()];
if (!OUT_W) { console.error('--res must be one of 480, 720, 1080, 4k'); process.exit(1); }
const OUT_H = Math.round(OUT_W * 9 / 16);
const FPS = Number(opt('fps', 30));
const CHUNK = Number(opt('chunk', 0)), CHUNKS = Number(opt('chunks', 1));
const TOTAL = Math.round(DURATION * FPS);
const F0 = opt('start') !== undefined ? Math.round(Number(opt('start')) * FPS) : Math.floor(CHUNK * TOTAL / CHUNKS);
const F1 = opt('end') !== undefined ? Math.round(Number(opt('end')) * FPS) : Math.floor((CHUNK + 1) * TOTAL / CHUNKS);
const OUT = String(opt('out', `out/chunk_${String(CHUNK).padStart(3, '0')}.mp4`));
const CRF = String(opt('crf', OUT_W >= 3840 ? 18 : 17));
const PRESET = String(opt('preset', 'medium'));
const BADGE = String(opt('badge', 'SOLAR SYSTEM EXPLORER'));
const BLOOM = String(opt('bloom', 1));
const PNG_TIMES = opt('png');                           // --png 10,60,120  -> still frames for checking
const PNG_DIR = String(opt('outdir', 'preview'));
const USE_GPU = !!opt('gpu', false);
const DSF = OUT_W / 1920;                               // the page is laid out at 1920x1080 CSS px

// ── tiny static server (project root) ─────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/public/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/public/index.html?badge=${encodeURIComponent(BADGE)}&bloom=${BLOOM}`;

// ── browser ───────────────────────────────────────────
const GL_ARGS = USE_GPU
  ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser, page;
async function launch() {
  try { await browser?.close(); } catch {}
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [...GL_ARGS, '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
  page = await ctx.newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.error('[page]', m.text()); });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
}
await launch();
console.log(`WebGL ready · textures loaded: ${await page.evaluate(() => window.__realTextures)} (0 = procedural fallback) · ${OUT_W}x${OUT_H} @ ${FPS}fps`);

const shot = async t => {
  await page.evaluate(tt => window.setTime(tt), t);
  return page.screenshot({ type: 'jpeg', quality: 95 });
};

// ── still-frame mode ──────────────────────────────────
if (PNG_TIMES) {
  fs.mkdirSync(PNG_DIR, { recursive: true });
  for (const ts of String(PNG_TIMES).split(',')) {
    const t0 = Date.now();
    await page.evaluate(tt => window.setTime(tt), Number(ts));
    await page.screenshot({ type: 'png', path: path.join(PNG_DIR, `t${String(ts).padStart(3, '0')}.png`) });
    console.log(`t=${ts}s rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await browser.close(); server.close(); process.exit(0);
}

// ── video mode ────────────────────────────────────────
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const n = F1 - F0;
console.log(`Chunk ${CHUNK + 1}/${CHUNKS}: frames ${F0}..${F1 - 1} (${n} frames, ${(F0 / FPS).toFixed(1)}s → ${(F1 / FPS).toFixed(1)}s) → ${OUT}`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS), '-vf', 'scale=in_range=full:out_range=tv,setsar=1',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => { ff.on('exit', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))); ff.on('error', rej); });
ff.stdin.on('error', () => {});

const started = Date.now();
for (let f = F0; f < F1; f++) {
  let buf, attempt = 0;
  while (true) {
    try { buf = await shot(f / FPS); break; }
    catch (e) {
      if (++attempt > 3) throw e;
      console.error(`frame ${f} failed (${e.message.split('\n')[0]}) — restarting browser, attempt ${attempt}`);
      await launch();
    }
  }
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  const done = f - F0 + 1;
  if (done % 15 === 0 || done === n) {
    const el = (Date.now() - started) / 1000, eta = el / done * (n - done);
    console.log(`  ${done}/${n} frames · ${(el / done).toFixed(2)} s/frame · elapsed ${(el / 60).toFixed(1)} min · ETA ${(eta / 60).toFixed(1)} min`);
  }
}
ff.stdin.end();
await ffDone;
await browser.close(); server.close();
console.log(`Done → ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
