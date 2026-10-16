// Procedural fallbacks so the video renders even if no texture files are downloaded.
// Real textures (textures/*.jpg) always take priority — see scripts/download_textures.sh.
import * as THREE from 'three';

function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf), yf), zf);
}
export function fbm3(x, y, z, oct = 5) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; f *= 2.03; a *= 0.5; }
  return s / n;                                    // 0..1, mean ≈ 0.5
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// cheap sphere craters: nearest feature point in a 3x3x3 neighbourhood
function craters(x, y, z, s) {
  const X = x * s, Y = y * s, Z = z * s, xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z);
  let out = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    if (hash3(cx, cy, cz + 77) < 0.45) continue;
    const px = cx + hash3(cx, cy, cz), py = cy + hash3(cx + 9, cy, cz), pz = cz + hash3(cx, cy + 5, cz);
    const rad = 0.18 + 0.3 * hash3(cx, cy + 3, cz + 4);
    const d = Math.hypot(X - px, Y - py, Z - pz) / rad;
    if (d < 1.25) out += d < 0.9 ? -0.35 * (1 - d * d) : 0.25 * Math.exp(-((d - 1) * (d - 1)) * 40);
  }
  return out;
}

const COLORS = {
  mercury: (x, y, z) => { const n = fbm3(x * 3 + 1, y * 3, z * 3, 5), c = craters(x, y, z, 5) + 0.6 * craters(x, y, z, 11);
    const g = (0.36 + 0.34 * n) * (1 + c); return [g * 1.0, g * 0.96, g * 0.92]; },
  venus: (x, y, z) => { const w = fbm3(x * 2, y * 5, z * 2, 4), n = fbm3(x * 3 + w * 2, y * 7 + w, z * 3, 5);
    return mix([0.82, 0.58, 0.28], [0.97, 0.87, 0.62], n); },
  earth: (x, y, z, lat) => {
    const h = fbm3(x * 1.7 + 3, y * 1.7, z * 1.7, 6), m = fbm3(x * 4, y * 4 + 5, z * 4, 4);
    if (Math.abs(lat) > 1.28 + 0.12 * m) return [0.93, 0.96, 0.98];
    if (h > 0.53) { const e = sstep(0.53, 0.68, h);
      const dry = sstep(0.4, 0.62, m) * (1 - Math.abs(lat) / 1.4) * 0.8;
      return mix(mix([0.10, 0.32, 0.09], [0.35, 0.40, 0.14], e), [0.62, 0.50, 0.30], dry); }
    const d = sstep(0.53, 0.30, h); return mix([0.07, 0.30, 0.52], [0.01, 0.07, 0.25], d); },
  mars: (x, y, z, lat) => { const n = fbm3(x * 3, y * 3, z * 3, 6), p = fbm3(x * 1.5 + 8, y * 1.5, z * 1.5, 4), c = craters(x, y, z, 6) * 0.4;
    if (Math.abs(lat) > 1.45 + 0.1 * n) return [0.93, 0.92, 0.9];
    const t = mix([0.66, 0.32, 0.16], [0.82, 0.5, 0.28], n); const dk = sstep(0.55, 0.68, p) * 0.55;
    return mix(t, [0.28, 0.17, 0.13], dk).map(v => v * (1 + c)); },
  jupiter: (x, y, z, lat, lon) => {
    const w = fbm3(x * 4, y * 1.2, z * 4, 5) - 0.5, band = Math.sin(lat * 15 + w * 5.5) * 0.5 + 0.5, fine = fbm3(x * 10, y * 40, z * 10, 3);
    let c = mix(mix([0.88, 0.80, 0.66], [0.62, 0.40, 0.26], band), [0.95, 0.90, 0.82], sstep(0.55, 0.9, fine) * 0.6);
    const dl = lon - 2.6, dla = (lat + 0.4) * 1.9, r = Math.hypot(Math.sin(dl) * 1.0, dla);
    if (r < 0.26) { const s = sstep(0.26, 0.1, r); c = mix(c, [0.76, 0.30, 0.20], s * 0.9); }
    return c; },
  saturn: (x, y, z, lat) => { const w = fbm3(x * 3, y * 1, z * 3, 4) - 0.5, band = Math.sin(lat * 22 + w * 3) * 0.5 + 0.5;
    return mix([0.78, 0.68, 0.48], [0.92, 0.83, 0.62], band); },
  uranus: (x, y, z, lat) => { const b = Math.sin(lat * 10) * 0.5 + 0.5, n = fbm3(x * 2, y * 4, z * 2, 3);
    return mix([0.52, 0.80, 0.84], [0.66, 0.90, 0.92], b * 0.5 + n * 0.5); },
  neptune: (x, y, z, lat, lon) => { const w = fbm3(x * 3, y * 2, z * 3, 5) - 0.5, band = Math.sin(lat * 9 + w * 6) * 0.5 + 0.5;
    let c = mix([0.12, 0.25, 0.78], [0.22, 0.42, 0.92], band);
    const r = Math.hypot(Math.sin(lon - 1.0), (lat + 0.35) * 2.5); if (r < 0.25) c = mix(c, [0.05, 0.1, 0.4], sstep(0.25, 0.1, r)); return c; },
  moon: (x, y, z) => { const mare = sstep(0.52, 0.62, fbm3(x * 1.6 + 4, y * 1.6, z * 1.6, 4)), g = (0.58 - 0.26 * mare) * (1 + craters(x, y, z, 6) + 0.6 * craters(x, y, z, 14));
    return [g, g * 0.98, g * 0.95]; },
  io: (x, y, z) => { const n = fbm3(x * 4, y * 4, z * 4, 5), s = fbm3(x * 9 + 3, y * 9, z * 9, 3);
    let c = mix([0.86, 0.78, 0.30], [0.95, 0.90, 0.55], n); c = mix(c, [0.85, 0.42, 0.14], sstep(0.62, 0.72, s));
    return mix(c, [0.16, 0.12, 0.09], sstep(0.78, 0.84, fbm3(x * 12, y * 12, z * 12, 2))); },
  europa: (x, y, z) => { const n = fbm3(x * 3, y * 3, z * 3, 4), l = Math.abs(fbm3(x * 7, y * 7, z * 7, 3) - 0.5) < 0.03 ? 1 : 0;
    return mix(mix([0.86, 0.84, 0.78], [0.78, 0.74, 0.66], n), [0.50, 0.32, 0.20], l * 0.8); },
  ganymede: (x, y, z) => { const n = fbm3(x * 3, y * 3, z * 3, 5), g = 0.3 + 0.35 * n; return [g * 1.05, g, g * 0.92].map(v => v * (1 + craters(x, y, z, 7) * 0.6)); },
  callisto: (x, y, z) => { const n = fbm3(x * 3, y * 3, z * 3, 4), g = 0.22 + 0.15 * n, c = craters(x, y, z, 8) + craters(x, y, z, 16);
    return [g * 1.1 * (1 + c * 1.4), g * (1 + c * 1.4), g * 0.9 * (1 + c * 1.4)]; },
  titan: (x, y, z) => { const n = fbm3(x * 2, y * 3, z * 2, 4); return mix([0.78, 0.52, 0.18], [0.92, 0.70, 0.32], n); },
  enceladus: (x, y, z) => { const n = fbm3(x * 4, y * 4, z * 4, 4); return mix([0.90, 0.94, 0.98], [0.78, 0.86, 0.95], n); },
  rhea: (x, y, z) => { const n = fbm3(x * 3, y * 3, z * 3, 4), g = (0.5 + 0.25 * n) * (1 + craters(x, y, z, 7) + 0.6 * craters(x, y, z, 15)); return [g, g, g * 0.97]; },
};

export function proceduralColorTexture(key, w = 1024, h = 512) {
  const fn = COLORS[key] || COLORS.moon;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let py = 0; py < h; py++) {
    const lat = Math.PI * (0.5 - (py + 0.5) / h), cl = Math.cos(lat), sl = Math.sin(lat);
    for (let px = 0; px < w; px++) {
      const lon = Math.PI * 2 * (px + 0.5) / w - Math.PI;
      const col = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon), o = (py * w + px) * 4;
      d[o] = Math.min(255, Math.max(0, col[0] * 255)); d[o + 1] = Math.min(255, Math.max(0, col[1] * 255)); d[o + 2] = Math.min(255, Math.max(0, col[2] * 255)); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

export function proceduralClouds(w = 1024, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let py = 0; py < h; py++) {
    const lat = Math.PI * (0.5 - (py + 0.5) / h), cl = Math.cos(lat), sl = Math.sin(lat);
    for (let px = 0; px < w; px++) {
      const lon = Math.PI * 2 * (px + 0.5) / w - Math.PI, x = cl * Math.cos(lon), z = cl * Math.sin(lon);
      const warp = fbm3(x * 2, sl * 3, z * 2, 3), n = fbm3(x * 3 + warp * 1.5, sl * 6, z * 3 + warp, 6);
      const a = sstep(0.5, 0.72, n), o = (py * w + px) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a * 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

// Strip texture: u = 0 (inner edge) .. 1 (outer edge)
export function proceduralRings(w = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = 4;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, 4), d = img.data;
  for (let x = 0; x < w; x++) {
    const t = x / w, n = fbm3(t * 60, 1.3, 0.2, 4);
    let dens = 0;
    if (t < 0.14) dens = 0.12 + 0.12 * n;                       // C ring
    else if (t < 0.56) dens = 0.55 + 0.45 * n;                  // B ring
    else if (t < 0.62) dens = 0.03;                             // Cassini division
    else if (t < 0.93) dens = 0.40 + 0.30 * n;                  // A ring
    else if (t < 0.945) dens = 0.02;                            // Encke gap
    else if (t < 0.99) dens = 0.25;
    dens *= 0.75 + 0.5 * fbm3(t * 300, 4, 1, 2);
    const col = mix([0.60, 0.52, 0.40], [0.90, 0.82, 0.68], n);
    for (let y = 0; y < 4; y++) { const o = (y * w + x) * 4; d[o] = col[0] * 255; d[o + 1] = col[1] * 255; d[o + 2] = col[2] * 255; d[o + 3] = Math.min(255, dens * 255); }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}
export function proceduralFaintRings(w = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = 2;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, 2), d = img.data;
  for (let x = 0; x < w; x++) { const t = x / w, a = (Math.exp(-Math.pow((t - 0.35) / 0.03, 2)) + 0.6 * Math.exp(-Math.pow((t - 0.7) / 0.02, 2))) * 90;
    for (let y = 0; y < 2; y++) { const o = (y * w + x) * 4; d[o] = 170; d[o + 1] = 200; d[o + 2] = 210; d[o + 3] = a; } }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

export function glowTexture(size = 256, stops = [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,235,190,0.55)'], [0.5, 'rgba(255,170,70,0.14)'], [1, 'rgba(255,120,30,0)']]) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return finish(c);
}
export function rayTexture(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, h = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - h) / h, dy = (y - h) / h, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ray = fbm3(Math.cos(a) * 3 + 10, Math.sin(a) * 3, 0.5, 4) * 1.6 - 0.3;
    const fall = Math.max(0, 1 - r) ** 1.7 * sstep(0.12, 0.3, r), v = Math.max(0, ray) * fall;
    const o = (y * size + x) * 4; d[o] = 255; d[o + 1] = 200 + 40 * v; d[o + 2] = 140; d[o + 3] = Math.min(255, v * 255);
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

export function milkyWayTexture(w = 1024, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const tilt = 0.9;
  for (let py = 0; py < h; py++) {
    const lat = Math.PI * (0.5 - (py + 0.5) / h), cl = Math.cos(lat), sl = Math.sin(lat);
    for (let px = 0; px < w; px++) {
      const lon = Math.PI * 2 * (px + 0.5) / w, x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const by = y * Math.cos(tilt) - x * Math.sin(tilt);                  // distance from the galactic plane
      const band = Math.exp(-(by * by) / 0.035), n = fbm3(x * 3, y * 3, z * 3, 6), n2 = fbm3(x * 8 + 2, y * 8, z * 8, 4);
      const dust = sstep(0.5, 0.7, n2), v = band * (0.35 + 0.9 * n) * (1 - 0.7 * dust);
      const neb = sstep(0.55, 0.8, fbm3(x * 2 + 9, y * 2, z * 2, 4)) * 0.18;
      const o = (py * w + px) * 4;
      d[o] = (v * 0.62 + neb * 0.5) * 255; d[o + 1] = (v * 0.55 + neb * 0.2) * 255; d[o + 2] = (v * 0.7 + neb * 0.8) * 255; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

function finish(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
  return t;
}
