import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PLANETS, MOONS, PLANET, SUN, BELT, BASE_DURATION, orbitRadius, planetPos, bodyPos, moonAngle, TAU } from './sim.js';
import { getCamera, newCam } from './director.js';
import { INFO } from './info.js';
import * as P from './procedural.js';

const qs = new URLSearchParams(location.search);
const LIVE = qs.get('live') === '1';
const BADGE = qs.get('badge') || 'SOLAR SYSTEM EXPLORER';
const BLOOM = parseFloat(qs.get('bloom') ?? '1');
const DPR = LIVE ? Math.min(window.devicePixelRatio || 1, 2) : (window.devicePixelRatio || 1);
const DEG = Math.PI / 180;

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);
const gl = renderer.getContext();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 9000);

const rt = new THREE.WebGLRenderTarget(W * DPR, H * DPR, { type: THREE.HalfFloatType, samples: DPR > 1.4 ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7 * BLOOM, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ───────────────────────── textures ─────────────────────────
const loader = new THREE.TextureLoader();
const loadTex = file => new Promise(res => loader.load('/textures/' + file, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
const TEX = {};
let realTextures = 0;
async function loadAll() {
  const files = ['mercury', 'venus', 'earth', 'earth_clouds', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon', 'milkyway'].map(k => [k, k + '.jpg']);
  files.push(['saturn_ring', 'saturn_ring.png']);
  await Promise.all(files.map(async ([k, f]) => { const t = await loadTex(f); if (t) { TEX[k] = t; realTextures++; } }));
}
const colorTex = (key, w = 1024, h = 512) => TEX[key] || P.proceduralColorTexture(key, w, h);

// ───────────────────────── shaders ─────────────────────────
const NOISE_GLSL = `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.02+vec3(1.7,9.2,3.1); a*=.5;} return s; }`;

const sunMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE_GLSL}
    void main(){
      vec3 p = normalize(vP); float t = uTime;
      float n1 = fbm(p*2.6 + vec3(0.,0.,t*0.03));
      float n2 = fbm(p*9. + vec3(t*0.07, 0., -t*0.05));
      float n3 = fbm(p*26. - vec3(0., t*0.12, 0.));
      float v = n1*0.45 + n2*0.35 + n3*0.2;
      float spots = smoothstep(0.63, 0.72, fbm(p*2.2 + vec3(4.,1.,t*0.01)));
      float cell = smoothstep(0.35, 0.8, n2);
      vec3 deep = vec3(0.75,0.17,0.01), mid = vec3(1.0,0.46,0.07), hot = vec3(1.25,0.88,0.45);
      vec3 col = mix(deep, mid, smoothstep(0.25,0.55,v)); col = mix(col, hot, smoothstep(0.5,0.85,v)*cell);
      col *= 1.0 - 0.65*spots;
      float mu = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
      col *= mix(0.45, 1.0, pow(mu, 0.55));
      gl_FragColor = vec4(col*1.05, 1.0);
    }`
});
const flareMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: sunMat.vertexShader,
  fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE_GLSL}
    void main(){
      vec3 p = normalize(vP); float mu = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
      float f = pow(1.0 - mu, 2.2) * smoothstep(0.0, 0.22, mu);
      float n = fbm(p*4.5 + vec3(uTime*0.05, uTime*0.03, -uTime*0.04));
      float loops = smoothstep(0.5, 0.85, fbm(p*7. + vec3(0., uTime*0.08, 0.)));
      float a = f * (0.35 + 1.5*n*n + 1.6*loops);
      gl_FragColor = vec4(vec3(1.0,0.45,0.1)*a*1.5, a);
    }`
});

function atmosphereMat(color, power, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uInt: { value: intensity } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uInt; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 n = normalize(vN); vec3 V = normalize(cameraPosition - vW); vec3 L = normalize(-vW);
        float f = pow(1.0 - abs(dot(n,V)), uPow); float lit = clamp(dot(n,L)*0.9 + 0.30, 0., 1.);
        float a = f*lit*uInt; gl_FragColor = vec4(uColor*a, a); }`
  });
}
const ATMOS = {
  venus: [0xffd9a0, 3.0, 1.0], earth: [0x5aa8ff, 3.2, 1.5], mars: [0xe0905a, 4.0, 0.55],
  jupiter: [0xe8d5b0, 4.0, 0.45], saturn: [0xf0dfae, 4.0, 0.45], uranus: [0x9ff0f0, 3.0, 1.0], neptune: [0x4f7dff, 3.0, 1.1],
};

// ───────────────────────── scene objects ─────────────────────────
// stars + nebula follow the camera (infinitely far)
const sky = new THREE.Group(); scene.add(sky);
{
  const mwTex = TEX.milkyway || null;
  const mw = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24),
    new THREE.MeshBasicMaterial({ map: null, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: true }));
  mw.renderOrder = -20; mw.frustumCulled = false; mw.userData.late = true; sky.add(mw);
  sky.userData.mw = mw;
  const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u);
    pos.set([5000 * r * Math.cos(a), 5000 * u, 5000 * r * Math.sin(a)], i * 3);
    const b = Math.pow(rnd(), 3) * 0.9 + 0.1, tint = rnd();
    const c = tint < 0.2 ? [1.0, 0.8, 0.65] : tint < 0.4 ? [0.7, 0.8, 1.0] : [1, 1, 1];
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7 * DPR, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false, transparent: true, opacity: 0.95 }));
  stars.renderOrder = -19; stars.frustumCulled = false; sky.add(stars);
}

const bodies = {};
const sunGroup = new THREE.Group(); scene.add(sunGroup);
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius, 96, 64), sunMat);
const flare = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius * 1.045, 96, 64), flareMat);
sunGroup.add(sunMesh, flare);
const coronaSprites = [];
function addSprite(tex, scale, opacity, rot) {
  const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, color: 0xffffff });
  const sp = new THREE.Sprite(m); sp.scale.set(scale, scale, 1); sunGroup.add(sp); coronaSprites.push({ sp, rot }); return sp;
}
const light = new THREE.PointLight(0xfff1de, 4.2, 0, 0); scene.add(light);
scene.add(new THREE.AmbientLight(0x1a2240, 0.55));

const orbitLines = [];
const rockDummy = new THREE.Object3D();
let rocks, rockData, dust;
const labelEls = {};

function makeBodies() {
  const sphere = (r, w = 96, h = 64) => new THREE.SphereGeometry(r, w, h);
  for (const p of PLANETS) {
    const pivot = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group();
    tilt.rotation.z = p.tilt * DEG;
    const mat = new THREE.MeshStandardMaterial({ map: colorTex(p.key, 1024, 512), roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(sphere(p.radius), mat);
    spin.add(mesh); tilt.add(spin); pivot.add(tilt); scene.add(pivot);
    const b = { pivot, tilt, spin, mesh };
    if (ATMOS[p.key]) { const [c, pw, it] = ATMOS[p.key]; b.atmo = new THREE.Mesh(sphere(p.radius * 1.07, 64, 48), atmosphereMat(c, pw, it)); pivot.add(b.atmo); }
    if (p.key === 'earth') {
      const ct = TEX.earth_clouds || P.proceduralClouds(1024, 512);
      b.clouds = new THREE.Mesh(sphere(p.radius * 1.012, 96, 64), new THREE.MeshStandardMaterial({ map: ct, transparent: true, depthWrite: false, roughness: 1, alphaMap: TEX.earth_clouds ? ct : null }));
      tilt.add(b.clouds);
    }
    if (p.key === 'saturn' || p.key === 'uranus') {
      const inner = p.radius * (p.key === 'saturn' ? 1.24 : 1.6), outer = p.radius * (p.key === 'saturn' ? 2.35 : 2.1);
      const g = new THREE.RingGeometry(inner, outer, 192, 1), pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
      g.rotateX(-Math.PI / 2);
      const tex = p.key === 'saturn' ? (TEX.saturn_ring || P.proceduralRings()) : P.proceduralFaintRings();
      const ring = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, alphaMap: null }));
      tilt.add(ring); b.ring = ring;
    }
    bodies[p.key] = b;
    const r = orbitRadius(p.au), pts = [];
    for (let i = 0; i <= 360; i++) { const a = i / 360 * TAU; pts.push(new THREE.Vector3(r * Math.cos(a), 0, -r * Math.sin(a))); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6f93c9, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(line); orbitLines.push(line);
  }
  for (const m of MOONS) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(m.radius, 48, 32),
      new THREE.MeshStandardMaterial({ map: m.key === 'moon' ? colorTex('moon', 1024, 512) : P.proceduralColorTexture(m.key, 512, 256), roughness: 1 }));
    scene.add(mesh); bodies[m.key] = { mesh };
  }
}

function makeBelt() {
  const N = 4500, g = new THREE.IcosahedronGeometry(1, 1), pa = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const k = 0.78 + 0.45 * P.noise3(v.x * 2.1 + 5, v.y * 2.1, v.z * 2.1); pa.setXYZ(i, v.x * k, v.y * k, v.z * k); }
  g.computeVertexNormals();
  rocks = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), N);
  rocks.frustumCulled = false; scene.add(rocks);
  let s = 987654321; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  rockData = [];
  for (let i = 0; i < N; i++) {
    const r = BELT.inner + (BELT.outer - BELT.inner) * (0.5 + (rnd() + rnd() + rnd() - 1.5) / 1.5 * 0.5 * 1.1);
    const au = Math.pow(r / 60, 2), w = TAU / (Math.pow(au, 1.5) * 60);
    const sz = 0.08 + Math.pow(rnd(), 4) * 0.42;
    rockData.push({ a: rnd() * TAU, r, y: (rnd() + rnd() - 1) * 3.0, w, sx: sz * (0.7 + 0.6 * rnd()), sy: sz * (0.7 + 0.6 * rnd()), sz: sz * (0.7 + 0.6 * rnd()),
      rx: rnd() * 6, ry: rnd() * 6, rs: (rnd() - 0.5) * 0.5 });
    const c = 0.13 + 0.2 * rnd(); rocks.setColorAt(i, new THREE.Color(c * 1.1, c * 0.95, c * 0.8));
  }
  const D = 22000, dp = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) { const r = BELT.inner - 3 + (BELT.outer - BELT.inner + 6) * (0.5 + (rnd() + rnd() + rnd() - 1.5) / 1.5 * 0.5 * 1.1), a = rnd() * TAU; dp.set([r * Math.cos(a), (rnd() + rnd() - 1) * 3.5, -r * Math.sin(a)], i * 3); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.25 * DPR, sizeAttenuation: false, color: 0x8a7e72, transparent: true, opacity: 0.4, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);
}

function makeLabels() {
  const host = document.getElementById('labels');
  const add = (key, name, au) => {
    const d = document.createElement('div'); d.className = 'label';
    d.innerHTML = `<i></i><b>${name}</b>${au ? `<em>${au}</em>` : ''}`; host.appendChild(d); labelEls[key] = d;
  };
  add('sun', 'Sun', '');
  for (const p of PLANETS) add(p.key, p.name, p.au.toFixed(2) + ' AU');
}

// ───────────────────────── per-frame update ─────────────────────────
const cam = newCam(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const el = id => document.getElementById(id);
const dom = { badge: el('badge-text'), dot: el('dot'), lower: el('lower'), name: el('l-name'), type: el('l-type'), stats: el('l-stats'),
  facts: el('facts'), fact: el('f-text'), title: el('title'), outro: el('outro'), fade: el('fade'), sim: el('sim') };
dom.badge.textContent = BADGE;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
let lastKey = null;

function update(t) {
  getCamera(t, cam);
  camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look);
  const dist = cam.pos.distanceTo(cam.look);
  camera.near = cam.shot === 'belt' ? 0.06 : clamp(dist * 0.01, 0.02, 8); camera.far = 9000; camera.updateProjectionMatrix();
  sky.position.copy(cam.pos);

  sunMat.uniforms.uTime.value = t; flareMat.uniforms.uTime.value = t;
  sunMesh.rotation.y = t * 0.01;
  const sunDist = cam.pos.length(), kBloom = clamp(1.25 - sunDist / 900, 0.55, 1.25);
  bloom.strength = 0.6 * BLOOM * kBloom;
  coronaSprites.forEach((c, i) => { c.sp.material.rotation = t * c.rot; });

  for (const p of PLANETS) {
    const b = bodies[p.key]; planetPos(p, t, tmp); b.pivot.position.copy(tmp);
    b.spin.rotation.y = p.spin * DEG * t;
    if (b.clouds) b.clouds.rotation.y = (p.spin * 1.15) * DEG * t;
  }
  for (const m of MOONS) { const b = bodies[m.key]; bodyPos(m.key, t, tmp); b.mesh.position.copy(tmp); b.mesh.rotation.y = moonAngle(m, t); }

  for (let i = 0; i < rockData.length; i++) {
    const d = rockData[i], a = d.a + d.w * t;
    rockDummy.position.set(d.r * Math.cos(a), d.y, -d.r * Math.sin(a));
    rockDummy.rotation.set(d.rx + d.rs * t, d.ry + d.rs * 0.7 * t, 0); rockDummy.scale.set(d.sx, d.sy, d.sz);
    rockDummy.updateMatrix(); rocks.setMatrixAt(i, rockDummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  dust.rotation.y = TAU * t / (Math.pow(Math.pow(97 / 60, 2), 1.5) * 60);

  orbitLines.forEach(l => { l.material.opacity = 0.32 * cam.rings; l.visible = cam.rings > 0.01; });
  updateLabels(t);
  updateOverlay(t);
}

const LABEL_PRIORITY = ['sun', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune', 'mars', 'venus', 'mercury'];
function updateLabels(t) {
  const placed = [];
  for (const key of LABEL_PRIORITY) {
    const d = labelEls[key];
    if (cam.labels < 0.02) { d.style.opacity = 0; continue; }
    bodyPos(key, t, tmp2); tmp2.project(camera);
    if (tmp2.z > 1 || Math.abs(tmp2.x) > 1.05 || Math.abs(tmp2.y) > 1.05) { d.style.opacity = 0; continue; }
    const x = (tmp2.x * 0.5 + 0.5) * W, y = (1 - (tmp2.y * 0.5 + 0.5)) * H;
    let ok = true; for (const q of placed) if (Math.abs(q[0] - x) < 105 && Math.abs(q[1] - y) < 34) { ok = false; break; }
    if (!ok) { d.style.opacity = 0; continue; }
    placed.push([x, y]);
    d.style.opacity = cam.labels.toFixed(3); d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

function updateOverlay(t) {
  const info = INFO[cam.key] || INFO.overview;
  const dt = t - cam.keyT0, rem = cam.keyEnd - t;
  const inTitle = t < 7, inOutro = t > 462;
  if (cam.key !== lastKey) {
    lastKey = cam.key;
    dom.name.textContent = info.name; dom.type.textContent = info.type;
    dom.stats.innerHTML = info.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
  const lo = ease(dt / 0.9) * ease(rem / 0.7) * (inTitle || inOutro ? 0 : 1);
  dom.lower.style.opacity = lo.toFixed(3); dom.lower.style.transform = `translateY(${((1 - lo) * 16).toFixed(1)}px)`;
  // facts: rotate every 8 s with cross-fades
  const fi = Math.floor(Math.max(0, dt - 2.0) / 8), fp = Math.max(0, dt - 2.0) % 8;
  const fo = ease(fp / 0.8) * ease((8 - fp) / 0.8) * ease((dt - 2.0) / 0.8) * ease((rem - 0.2) / 0.7) * (inTitle || inOutro ? 0 : 1);
  dom.fact.textContent = info.facts[fi % info.facts.length];
  dom.facts.style.opacity = fo.toFixed(3);
  // title / outro / fades
  const to = ease((t - 0.6) / 1.0) * ease((6.9 - t) / 1.2);
  dom.title.style.opacity = to.toFixed(3); dom.title.style.transform = `scale(${(1 + 0.03 * (1 - clamp(t / 7))).toFixed(4)})`;
  const oo = ease((t - 464) / 1.5);
  dom.outro.style.opacity = (oo * (t < BASE_DURATION ? 1 : 0)).toFixed(3);
  const fade = Math.max(1 - t / 1.2, (t - (BASE_DURATION - 2.5)) / 2.5);
  dom.fade.style.opacity = clamp(fade).toFixed(3);
  dom.dot.style.opacity = (0.55 + 0.45 * Math.sin(t * 4)).toFixed(3);
  const years = t / 60;
  dom.sim.textContent = `SIMULATED TIME  +${years.toFixed(2)} EARTH YEARS`;
}

// ───────────────────────── boot ─────────────────────────
function resizeLive() { /* live mode keeps the initial size */ }
(async function init() {
  await loadAll();
  const mwTex = TEX.milkyway || P.milkyWayTexture(1024, 512);
  sky.userData.mw.material.map = mwTex; sky.userData.mw.material.color.setScalar(TEX.milkyway ? 0.55 : 1.0); sky.userData.mw.material.needsUpdate = true;
  addSprite(P.glowTexture(256), SUN.radius * 7, 0.55, 0);
  addSprite(P.glowTexture(256, [[0, 'rgba(255,200,120,0.5)'], [0.35, 'rgba(255,140,50,0.12)'], [1, 'rgba(255,100,20,0)']]), SUN.radius * 26, 0.3, 0);
  addSprite(P.rayTexture(512), SUN.radius * 14, 0.5, 0.012);
  addSprite(P.rayTexture(512), SUN.radius * 10, 0.38, -0.02);
  makeBodies(); makeBelt(); makeLabels();
  el('credits').style.display = realTextures > 3 ? 'block' : 'none';
  window.__realTextures = realTextures;
  window.setTime = t => { update(t); composer.render(); gl.finish(); return cam.shot; };
  window.__ready = true;
  if (LIVE) {
    const t0 = performance.now(); const loop = () => { window.setTime(((performance.now() - t0) / 1000) % BASE_DURATION); requestAnimationFrame(loop); }; loop();
  }
})();
