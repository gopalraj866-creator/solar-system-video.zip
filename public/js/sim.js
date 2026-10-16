// Orbital model shared by the renderer, the camera director and the tests.
// Everything is a pure function of time t (seconds on the 480 s master timeline),
// so any frame can be rendered independently => chunked rendering on GitHub Actions.
import * as THREE from 'three';

export const BASE_DURATION = 480;      // master timeline length in seconds
export const YEAR_SEC = 60;            // 1 Earth year = 60 s of video  (1 s ≈ 6.1 days)
export const TAU = Math.PI * 2;

export const SUN = { key: 'sun', name: 'Sun', radius: 14 };

// radius / orbit radii are DISPLAY units (not to scale). `au` and `years` are the real values.
export const PLANETS = [
  { key: 'mercury', name: 'Mercury', radius: 0.9, au: 0.387, years: 0.2408, phase: 0.6, spin: 40,  tilt: 0.03 },
  { key: 'venus',   name: 'Venus',   radius: 1.7, au: 0.723, years: 0.6152, phase: 2.1, spin: -120, tilt: 177.4 },
  { key: 'earth',   name: 'Earth',   radius: 1.8, au: 1.000, years: 1.0,    phase: 4.0, spin: 18,  tilt: 23.4 },
  { key: 'mars',    name: 'Mars',    radius: 1.2, au: 1.524, years: 1.8808, phase: 5.3, spin: 18.5, tilt: 25.2 },
  { key: 'jupiter', name: 'Jupiter', radius: 6.0, au: 5.203, years: 11.862, phase: 1.2, spin: 8,   tilt: 3.1 },
  { key: 'saturn',  name: 'Saturn',  radius: 5.2, au: 9.537, years: 29.457, phase: 3.3, spin: 8.5, tilt: 26.7 },
  { key: 'uranus',  name: 'Uranus',  radius: 3.0, au: 19.19, years: 84.01,  phase: 0.2, spin: 15,  tilt: 97.8 },
  { key: 'neptune', name: 'Neptune', radius: 2.9, au: 30.07, years: 164.8,  phase: 5.0, spin: 13,  tilt: 28.3 },
];

// Moon periods are compressed for visibility (real periods would flicker at 30 fps).
export const MOONS = [
  { key: 'moon',     name: 'Moon',     parent: 'earth',   radius: 0.5,  orbit: 6.0,  period: 24, phase: 2.0, incl: 5.1 },
  { key: 'io',       name: 'Io',       parent: 'jupiter', radius: 0.55, orbit: 9.8,  period: 9,  phase: 0.4, incl: 0.0 },
  { key: 'europa',   name: 'Europa',   parent: 'jupiter', radius: 0.48, orbit: 12.5, period: 14, phase: 2.5, incl: 0.5 },
  { key: 'ganymede', name: 'Ganymede', parent: 'jupiter', radius: 0.85, orbit: 16.5, period: 22, phase: 4.6, incl: 0.2 },
  { key: 'callisto', name: 'Callisto', parent: 'jupiter', radius: 0.75, orbit: 21.5, period: 36, phase: 1.3, incl: 0.3 },
  { key: 'enceladus',name: 'Enceladus',parent: 'saturn',  radius: 0.22, orbit: 13.4, period: 16, phase: 0.9, incl: 0.0 },
  { key: 'rhea',     name: 'Rhea',     parent: 'saturn',  radius: 0.34, orbit: 17.0, period: 27, phase: 3.9, incl: 0.3 },
  { key: 'titan',    name: 'Titan',    parent: 'saturn',  radius: 0.8,  orbit: 22.5, period: 42, phase: 2.2, incl: 0.3 },
];

export const BELT = { inner: 82, outer: 112, count: 14000, period: 276 };

export const PLANET = Object.fromEntries(PLANETS.map(p => [p.key, p]));
export const MOON = Object.fromEntries(MOONS.map(m => [m.key, m]));

// Compressed orbit scale: display radius = 60 * sqrt(AU)
export const orbitRadius = au => 60 * Math.sqrt(au);
export const planetAngle = (p, t) => p.phase + TAU * t / (p.years * YEAR_SEC);

// Convention: counter-clockwise seen from +Y, position = (r cos a, 0, -r sin a);
// a body spinning by +a about Y keeps the same face toward the centre (tidal lock).
export function planetPos(p, t, out = new THREE.Vector3()) {
  const r = orbitRadius(p.au), a = planetAngle(p, t);
  return out.set(r * Math.cos(a), 0, -r * Math.sin(a));
}
export const moonAngle = (m, t) => m.phase + TAU * t / m.period;
export function moonOffset(m, t, out = new THREE.Vector3()) {
  const a = moonAngle(m, t), i = m.incl * Math.PI / 180;
  return out.set(m.orbit * Math.cos(a), m.orbit * Math.sin(a) * Math.sin(i), -m.orbit * Math.sin(a) * Math.cos(i));
}
const _tmp = new THREE.Vector3();
export function bodyPos(key, t, out = new THREE.Vector3()) {
  if (key === 'sun') return out.set(0, 0, 0);
  if (PLANET[key]) return planetPos(PLANET[key], t, out);
  const m = MOON[key];
  planetPos(PLANET[m.parent], t, out);
  return out.add(moonOffset(m, t, _tmp));
}
export const bodyRadius = key => key === 'sun' ? SUN.radius : (PLANET[key] || MOON[key]).radius;
