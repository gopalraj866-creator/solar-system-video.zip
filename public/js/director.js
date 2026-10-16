// Cinematic camera director: a list of shots, each a pure function of time.
// Neighbouring shots are blended over TR seconds so the camera never cuts.
import * as THREE from 'three';
import { PLANET, planetAngle, planetPos, bodyPos, BASE_DURATION } from './sim.js';

export const TR = 3.6;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const sm5 = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };

const _c = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
// angle (in sim convention) pointing from a body towards the Sun => camera on the lit side
const litAngle = c => Math.atan2(c.z, -c.x);
function orbitAt(o, c, a, r, h) { o.pos.set(c.x + r * Math.cos(a), c.y + h, c.z - r * Math.sin(a)); o.look.copy(c); }

// Orbit a planet on its sunlit side. off = angular offset from the sun direction (rad).
function planetShot(key, r0, r1, h0, h1, off0, off1, moon) {
  const p = PLANET[key];
  return (u, t, o) => {
    planetPos(p, t, _c);
    let r = lerp(r0, r1, sm(u)), h = lerp(h0, h1, sm(u));
    const a = litAngle(_c) + lerp(off0, off1, u);
    if (moon) {                                     // glide over to a moon at the end of the shot
      const s = sm((u - moon.from) / (1 - moon.from - 0.04));
      bodyPos(moon.key, t, _c2);
      _c3.copy(_c).lerp(_c2, s);
      r = lerp(r, moon.r, s); h = lerp(h, moon.h, s);
      orbitAt(o, _c3, litAngle(_c3) + lerp(off0, off1, u) * (1 - s) + 0.5 * s, r, h);
      return;
    }
    orbitAt(o, _c, a, r, h);
  };
}
const wide = (a0, a1, r0, r1, h0, h1) => (u, t, o) => {
  const a = lerp(a0, a1, u), r = lerp(r0, r1, sm(u)), h = lerp(h0, h1, sm(u));
  o.pos.set(r * Math.cos(a), h, -r * Math.sin(a)); o.look.set(0, 0, 0);
};

const A_N = planetAngle(PLANET.neptune, 340) + 0.35;       // where the pull-back starts
const THETA_J = planetAngle(PLANET.jupiter, 175);           // asteroid-belt flight heads for Jupiter

export const SHOTS = [
  { id: 'intro',   t0: 0,   t1: 20,  keys: [[0, 'overview']], rings: 1, labels: 1, pose: wide(-2.4, -1.75, 560, 400, 300, 190) },
  { id: 'sun',     t0: 20,  t1: 55,  keys: [[0, 'sun']], rings: 0, labels: 0, pose: (u, t, o) => {
      const a = -1.0 + 1.7 * u, r = lerp(66, 44, sm(u)), h = lerp(10, 5, sm(u));
      o.pos.set(r * Math.cos(a), h, -r * Math.sin(a)); o.look.set(0, 0, 0); } },
  { id: 'mercury', t0: 55,  t1: 70,  keys: [[0, 'mercury']], rings: 0, labels: 0, pose: planetShot('mercury', 4.8, 3.4, 2.0, 1.0, 0.9, -0.5) },
  { id: 'venus',   t0: 70,  t1: 85,  keys: [[0, 'venus']],   rings: 0, labels: 0, pose: planetShot('venus', 8, 5.5, 3.2, 1.6, 0.8, -0.3) },
  { id: 'earth',   t0: 85,  t1: 125, keys: [[0, 'earth'], [0.66, 'moon']], rings: 0, labels: 0,
    pose: planetShot('earth', 8.5, 6.5, 3.4, 1.8, 1.0, 0.2, { key: 'moon', from: 0.34, r: 2.4, h: 0.5 }) },
  { id: 'mars',    t0: 125, t1: 145, keys: [[0, 'mars']], rings: 0, labels: 0, pose: planetShot('mars', 6, 4, 2.6, 1.4, 0.7, -0.4) },
  { id: 'belt',    t0: 145, t1: 175, keys: [[0, 'belt']], rings: 0, labels: 0, pose: (u, t, o) => {
      const r = lerp(66, 104, u), h = 1.0 + 1.6 * Math.sin(u * Math.PI * 2) * 0.5 + 1.2 * (1 - u);
      o.pos.set(r * Math.cos(THETA_J), h, -r * Math.sin(THETA_J));
      const sway = 0.35 * Math.sin(u * Math.PI * 3);
      _c.set(o.pos.x + 26 * Math.cos(THETA_J + sway), 0.5, o.pos.z - 26 * Math.sin(THETA_J + sway));
      planetPos(PLANET.jupiter, t, _c2);
      o.look.copy(_c).lerp(_c2, sm((u - 0.35) / 0.65)); } },
  { id: 'jupiter', t0: 175, t1: 230, keys: [[0, 'jupiter'], [0.8, 'io']], rings: 0, labels: 0,
    pose: planetShot('jupiter', 40, 25, 5, 2.5, 0.15, -1.3, { key: 'io', from: 0.6, r: 2.6, h: 0.4 }) },
  { id: 'saturn',  t0: 230, t1: 290, keys: [[0, 'saturn'], [0.8, 'titan']], rings: 0, labels: 0,
    pose: planetShot('saturn', 38, 17, 9, 3, 0.3, -1.6, { key: 'titan', from: 0.6, r: 3.4, h: 0.5 }) },
  { id: 'uranus',  t0: 290, t1: 315, keys: [[0, 'uranus']],  rings: 0, labels: 0, pose: planetShot('uranus', 15, 8.5, 2, 1, 0.8, -0.4) },
  { id: 'neptune', t0: 315, t1: 340, keys: [[0, 'neptune']], rings: 0, labels: 0, pose: planetShot('neptune', 13, 8, 2, 1, 0.8, -0.4) },
  { id: 'pullback',t0: 340, t1: 400, keys: [[0, 'scale']], rings: 1, labels: 1, pose: (u, t, o) => {
      const a = lerp(A_N, A_N + 1.1, u), r = lerp(330, 640, sm(u)), h = lerp(40, 420, sm(u));
      o.pos.set(r * Math.cos(a), h, -r * Math.sin(a));
      planetPos(PLANET.neptune, t, _c); o.look.set(0, 0, 0).lerp(_c, 1 - sm(u * 1.4)); } },
  { id: 'system',  t0: 400, t1: 460, keys: [[0, 'scale']], rings: 1, labels: 1, pose: wide(A_N + 1.1, A_N + 3.3, 640, 430, 420, 200) },
  { id: 'outro',   t0: 460, t1: BASE_DURATION, keys: [[0, 'overview']], rings: 1, labels: 1, pose: wide(A_N + 3.3, A_N + 3.7, 430, 470, 200, 230) },
];

export function newCam() {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), rings: 0, labels: 0, key: 'overview', keyT0: 0, keyEnd: 20, shot: 'intro' };
}
const pa = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const pb = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
function poseOf(shot, t, o) {
  const u = clamp((t - shot.t0) / (shot.t1 - shot.t0), -0.4, 1.4);
  shot.pose(u, t, o);
}
function keyOf(shot, t, hasNext) {
  const span = shot.t1 - shot.t0, u = (t - shot.t0) / span;
  let idx = 0;
  shot.keys.forEach((kk, i) => { if (u >= kk[0]) idx = i; });
  const k = shot.keys[idx], nx = shot.keys[idx + 1];
  const end = nx ? shot.t0 + nx[0] * span : (hasNext ? shot.t1 - TR / 2 : shot.t1);
  return { key: k[1], t0: shot.t0 + k[0] * span, end };
}

export function getCamera(t, out = newCam()) {
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1);
  if (i < 0) i = t < 0 ? 0 : SHOTS.length - 1;
  const A = SHOTS[i], B = SHOTS[i + 1];
  poseOf(A, t, pa);
  out.pos.copy(pa.pos); out.look.copy(pa.look);
  out.rings = A.rings; out.labels = A.labels; out.shot = A.id;
  const ka = keyOf(A, t, !!B);
  out.key = ka.key; out.keyT0 = ka.t0; out.keyEnd = ka.end;
  if (B && t > A.t1 - TR) {
    const s = sm5((t - (A.t1 - TR)) / TR);
    poseOf(B, t, pb);
    out.pos.lerp(pb.pos, s); out.look.lerp(pb.look, s);
    out.rings = lerp(A.rings, B.rings, s); out.labels = lerp(A.labels, B.labels, s);
    if (t >= A.t1 - TR / 2) { const kb = keyOf(B, t, !!SHOTS[i + 2]); out.key = kb.key; out.keyT0 = Math.max(kb.t0, A.t1 - TR / 2); out.keyEnd = kb.end; out.shot = B.id; }
  }
  // never fly through the Sun
  const d = out.pos.length();
  if (d < 21) { if (d < 1e-3) out.pos.set(21, 0, 0); else out.pos.multiplyScalar(21 / d); }
  return out;
}
