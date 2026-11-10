import './fog.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildHeightfield, ll } from './geo.js';
import { buildWorld } from './world.js';
import { Sky } from './sky.js';
import { Water } from './water.js';
import { BOATS, buildBoat } from './boats.js';
import { SailSim, KT } from './physics.js';
import { Weather, PRESETS } from './weather.js';
import { Traffic } from './traffic.js';
import { Sound } from './audio.js';
import { createUI } from './ui.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const tick = () => new Promise((r) => setTimeout(r, 30));
const loadStep = async (msg, pct) => { $('load-msg').textContent = msg; $('load-bar').style.width = pct + '%'; await tick(); };

const SPOTS = {
  'Golden Gate': [37.8200, -122.4640], 'Crissy Field': [37.8125, -122.4520], Alcatraz: [37.8215, -122.4300],
  'City Front': [37.8150, -122.4060], 'Raccoon Strait': [37.8665, -122.4490], Sausalito: [37.8500, -122.4690],
  'Bay Bridge': [37.8060, -122.3850], 'Berkeley Circle': [37.8600, -122.3520],
};
const START = [37.8195, -122.4420];

// ---------- renderer ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(PR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, 0.0001); // parameters are driven by the custom fog chunk
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 90000);
camera.position.set(0, 10, 30);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth * PR, window.innerHeight * PR, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.6, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
});

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x0a2028, 0.45);
scene.add(hemi);

// ---------- state ----------
const state = { hour: 18.8, timeScale: 1, boatIdx: 0, paused: false };
const cam = { mode: 'chase', az: -62 * DEG, el: 7 * DEG, dist: 23, yaw: 0, target: new THREE.Vector3(), lookAz: 0, lookEl: 0 };
const keys = new Set();
const weather = new Weather();
const sound = new Sound();
let hf, world, sky, water, traffic, ui, boat, sim;
let simTime = 0, lastEnv = -1e9, frameN = 0, started = false;
const motion = { y: 0, pitch: 0 };
const lastWake = new THREE.Vector2(1e9, 1e9);
let lastSpot = START;

// ---------- particles ----------
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const SPRAY_N = 500;
const spray = {
  pos: new Float32Array(SPRAY_N * 3).fill(-9999), vel: new Float32Array(SPRAY_N * 3), life: new Float32Array(SPRAY_N), next: 0, acc: 0,
};
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3));
const sprayMat = new THREE.PointsMaterial({ size: 0.2, map: softDot(), transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true, color: 0xffffff });
const sprayPts = new THREE.Points(sprayGeo, sprayMat);
sprayPts.frustumCulled = false;
scene.add(sprayPts);

const RAIN_N = 3500;
const rain = { p: new Float32Array(RAIN_N * 3), pos: new Float32Array(RAIN_N * 6) };
for (let i = 0; i < RAIN_N * 3; i++) rain.p[i] = Math.random();
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rain.pos, 3));
const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: 0.3, depthWrite: false }));
rainLines.frustumCulled = false; rainLines.visible = false;
scene.add(rainLines);

// ---------- app actions (used by the UI) ----------
const app = {
  boats: BOATS, presets: PRESETS, spots: SPOTS, weather,
  setBoat(i) {
    state.boatIdx = i;
    if (boat) scene.remove(boat.group);
    boat = buildBoat(BOATS[i]);
    scene.add(boat.group);
    sim.spec = BOATS[i];
    const r = Math.max(9, BOATS[i].loa * 1.15), sc = sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r * 1.6; sc.bottom = -r; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix();
    cam.dist = clamp(cam.dist, BOATS[i].loa * 1.6, 600);
    ui?.setBoat(i);
    ui?.toast(BOATS[i].name);
  },
  setPreset(k) { weather.setPreset(k); },
  setWx(k, v) { weather.target[k] = v; if (k === 'cloud') { weather.target.dark = Math.max(0, v - 0.75) * 1.6; weather.target.rain = v > 0.93 ? 1 : 0; } },
  setHour(h) { state.hour = h % 24; lastEnv = -1e9; },
  setTimeScale(s) { state.timeScale = s; },
  setCam(m) {
    const wasRel = cam.mode === 'chase', isRel = m === 'chase';
    if (wasRel && !isRel) cam.az += cam.yaw + Math.PI; else if (!wasRel && isRel) cam.az -= cam.yaw + Math.PI;
    if (cam.mode === 'helm' && m !== 'helm' && !isRel) cam.az = cam.yaw + Math.PI;
    cam.mode = m; if (m === 'drone') { cam.el = Math.max(cam.el, 0.6); cam.dist = Math.max(cam.dist, 160); } if (m === 'chase') { cam.dist = Math.min(cam.dist, 60); cam.el = Math.min(cam.el, 0.5); } },
  setTide(v) { weather.tide = v; },
  teleport(k) {
    lastSpot = SPOTS[k] || START;
    const [x, z] = ll(lastSpot[0], lastSpot[1]);
    sim.reset(x, z, (weather.cur.dir + 90) * DEG);
    cam.yaw = sim.psi; water.clearWake(); lastWake.set(1e9, 1e9);
    if (SPOTS[k]) ui.toast(k);
  },
  toggleAuto() { sim.autoTrim = !sim.autoTrim; ui.setAuto(sim.autoTrim); },
  toggleSound() { return sound.toggle(); },
};

// ---------- controls card (remembers whether you hid it) ----------
function setControls(show) {
  $('hud').classList.toggle('no-controls', !show);
  try { localStorage.setItem('windward.controls', show ? '1' : '0'); } catch {}
}
try { if (localStorage.getItem('windward.controls') === '0') $('hud').classList.add('no-controls'); } catch {}
$('controls-hide').onclick = () => setControls(false);
$('controls-show').onclick = (e) => { setControls(true); e.target.blur(); };

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  keys.add(e.code);
  if (!started) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyC') { const m = ['chase', 'orbit', 'helm', 'drone']; const n = m[(m.indexOf(cam.mode) + 1) % m.length]; app.setCam(n); ui.setCam(n); }
  if (e.code === 'KeyT') app.toggleAuto();
  if (e.code === 'KeyR') { const k = Object.keys(SPOTS).find((s) => SPOTS[s] === lastSpot); app.teleport(k); if (!k) ui.toast('Back to the start'); }
  if (e.code === 'KeyH') $('hud').classList.toggle('min');
  if (e.code === 'KeyK' || e.code === 'Slash') setControls($('hud').classList.contains('no-controls'));
  if (e.code === 'KeyM') $('b-sound').click();
  if (e.code === 'Space') { state.paused = !state.paused; ui.toast(state.paused ? 'Paused' : 'Sailing'); }
  if (/^Digit[1-4]$/.test(e.code)) app.setBoat(+e.code.slice(5) - 1);
  if ((e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'ArrowUp' || e.code === 'ArrowDown') && sim.autoTrim) { sim.autoTrim = false; ui.setAuto(false); ui.toast('Manual trim — press T for auto'); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY];
  if (cam.mode === 'helm') { cam.lookAz -= dx * 0.004; cam.lookEl = clamp(cam.lookEl + dy * 0.003, -0.6, 0.9); }
  else { cam.az -= dx * 0.005; cam.el = clamp(cam.el + dy * 0.004, -0.02, 1.5); }
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 7, 900); }, { passive: false });

// ---------- boot ----------
async function boot() {
  await loadStep('Surveying the coastline…', 12);
  hf = buildHeightfield();
  await loadStep('Raising the city and bridges…', 40);
  world = buildWorld(scene, hf);
  await loadStep('Filling the Bay…', 65);
  sky = new Sky(renderer);
  scene.add(sky.mesh);
  water = new Water(hf, sky);
  scene.add(water.mesh);
  await loadStep('Rigging the fleet…', 82);
  sim = new SailSim(BOATS[0]);
  traffic = new Traffic(scene, hf);
  ui = createUI(app, hf);
  app.setBoat(0);
  const [sx, sz] = ll(START[0], START[1]);
  sim.reset(sx, sz, 340 * DEG);
  sim.u = 2.6; cam.yaw = sim.psi;
  ui.setAuto(true);
  await loadStep('Ready', 100);
  renderer.setAnimationLoop(frame);
  const go = $('start');
  go.disabled = false;
  go.onclick = () => {
    started = true;
    $('intro').classList.add('gone'); $('hud').classList.remove('hidden');
    setTimeout(() => ui.toast('Beam reach, breeze from the Gate — steer with A / D', false, 5000), 900);
  };
  window.__app = { state, sim, weather, cam, app, renderer, THREE, go: () => go.click(),
    view(bearing, dist, el, spot, hour, preset) {
      if (spot) app.teleport(spot); if (hour !== undefined) app.setHour(hour);
      if (preset) { app.setPreset(preset); Object.assign(weather.cur, weather.target); }
      cam.mode = 'orbit'; cam.az = bearing * DEG; cam.dist = dist; cam.el = el * DEG; $('hud').classList.add('min'); return 'ok';
    } };
}

// ---------- per-frame ----------
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3();
let last = performance.now(), ironsT = 0, wasAground = false;

function updateBoat(dt) {
  const S = sim.spec;
  const steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const trim = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const fx = Math.sin(sim.psi), fz = -Math.cos(sim.psi), rx = Math.cos(sim.psi), rz = Math.sin(sim.psi);
  const L = S.loa * 0.36, Bw = S.beam * 0.4;
  const hb = water.heightAt(sim.x + fx * L, sim.z + fz * L), hs = water.heightAt(sim.x - fx * L, sim.z - fz * L);
  const hp = water.heightAt(sim.x - rx * Bw, sim.z - rz * Bw), hr = water.heightAt(sim.x + rx * Bw, sim.z + rz * Bw);
  sim.waveRoll = Math.atan2(hp - hr, 2 * Bw);
  sim.wavePitch = Math.atan2(hb - hs, 2 * L);
  if (!state.paused) {
    const env = { wind: weather.wind, current: weather.current, height: (x, z) => hf.heightAt(x, z) };
    const input = { steer, trim };
    const n = 3;
    for (let i = 0; i < n; i++) sim.step(dt / n, env, input);
  }
  motion.y += ((hb + hs + hp + hr) / 4 - motion.y) * Math.min(1, dt * 6);
  motion.pitch += (sim.wavePitch * 0.9 - motion.pitch) * Math.min(1, dt * 4.5);
  const g = boat.group;
  g.position.set(sim.x, motion.y - 0.02 - Math.abs(sim.heel) * 0.12, sim.z);
  g.rotation.set(motion.pitch - 0.012 * sim.u, -sim.psi, -sim.heel);
  boat.update({ boom: sim.boom, side: sim.side, alpha: sim.alpha, aws: sim.aws, awa: sim.awa, rudder: sim.rudder, time: simTime, heel: sim.heel, night: sky.night, sunI: sky.lightI });

  // wake
  const sx = sim.x - fx * S.loa * 0.42, sz = sim.z - fz * S.loa * 0.42;
  const emit = Math.hypot(sx - lastWake.x, sz - lastWake.y) > 2.6;
  if (emit) lastWake.set(sx, sz);
  water.wakePoint(sx, sz, clamp(Math.abs(sim.u) / 2.4, 0, 1), emit);

  // bow spray
  const sp = Math.abs(sim.u);
  spray.acc += dt * Math.max(0, sp - 1.6) * 60 * (1 + Math.max(0, -motion.pitch) * 12 + weather.cur.wind / 25);
  const bx = sim.x + fx * S.loa * 0.44, bz = sim.z + fz * S.loa * 0.44;
  while (spray.acc >= 1) {
    spray.acc -= 1;
    const i = spray.next; spray.next = (spray.next + 1) % SPRAY_N;
    const sd = Math.random() < 0.5 ? -1 : 1, k = 0.6 + Math.random() * 1.6, back = Math.random() * S.loa * 0.25;
    spray.pos[i * 3] = bx - fx * back + rx * sd * 0.25; spray.pos[i * 3 + 1] = motion.y + 0.1 + Math.random() * 0.2; spray.pos[i * 3 + 2] = bz - fz * back + rz * sd * 0.25;
    spray.vel[i * 3] = fx * sp * 0.55 + rx * sd * k * (0.5 + sp * 0.3); spray.vel[i * 3 + 1] = 0.6 + Math.random() * (1 + sp * 0.45); spray.vel[i * 3 + 2] = fz * sp * 0.55 + rz * sd * k * (0.5 + sp * 0.3);
    spray.life[i] = 0.5 + Math.random() * 0.7;
  }
  const w = weather.wind(sim.x, sim.z);
  for (let i = 0; i < SPRAY_N; i++) {
    if (spray.life[i] <= 0) continue;
    spray.life[i] -= dt;
    spray.vel[i * 3 + 1] -= 9.8 * dt;
    spray.vel[i * 3] += (w.x - spray.vel[i * 3]) * dt * 0.8; spray.vel[i * 3 + 2] += (w.z - spray.vel[i * 3 + 2]) * dt * 0.8;
    spray.pos[i * 3] += spray.vel[i * 3] * dt; spray.pos[i * 3 + 1] += spray.vel[i * 3 + 1] * dt; spray.pos[i * 3 + 2] += spray.vel[i * 3 + 2] * dt;
    if (spray.life[i] <= 0 || spray.pos[i * 3 + 1] < -0.3) { spray.life[i] = 0; spray.pos[i * 3 + 1] = -9999; }
  }
  sprayGeo.attributes.position.needsUpdate = true;
  const sl = sky.lightI * 0.12;
  sprayMat.color.setRGB(sky.ambient.r * 1.2 + sky.lightColor.r * sl, sky.ambient.g * 1.2 + sky.lightColor.g * sl, sky.ambient.b * 1.2 + sky.lightColor.b * sl);
}

function updateCamera(dt) {
  const S = sim.spec, g = boat.group;
  let d = ((sim.psi - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  cam.yaw += d * Math.min(1, dt * 2.2);
  _v.set(sim.x, motion.y + 1.6 + S.loa * 0.12, sim.z);
  cam.target.lerp(_v, cam.target.lengthSq() === 0 ? 1 : Math.min(1, dt * 10));
  if (cam.mode === 'helm') {
    const hb = S.beam / 2;
    _v.set(sim.side * hb * 0.42, S.fbStern + 1.45, S.loa * 0.37);
    g.updateMatrixWorld();
    camera.position.copy(g.localToWorld(_v));
    const a = cam.lookAz, e = cam.lookEl;
    _v2.set(sim.side * hb * 0.42 - Math.sin(a) * Math.cos(e) * 10, S.fbStern + 1.45 - Math.sin(e) * 10, S.loa * 0.37 - Math.cos(a) * Math.cos(e) * 10);
    g.localToWorld(_v2);
    _up.set(0, 1, 0).applyQuaternion(g.quaternion).lerp(_v.set(0, 1, 0), 0.45).normalize();
    camera.up.copy(_up);
    camera.lookAt(_v2);
    camera.near = 0.15; camera.fov = 64;
  } else {
    const bearing = cam.mode === 'chase' ? cam.yaw + Math.PI + cam.az : cam.az;
    const ce = Math.cos(cam.el), dist = cam.dist;
    camera.position.set(cam.target.x + Math.sin(bearing) * ce * dist, cam.target.y + Math.sin(cam.el) * dist, cam.target.z - Math.cos(bearing) * ce * dist);
    const wy = water.heightAt(camera.position.x, camera.position.z) + 0.7;
    const gy = hf.heightAt(camera.position.x, camera.position.z) + 2;
    camera.position.y = Math.max(camera.position.y, wy, gy);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.near = clamp(dist * 0.08, 0.4, 3); camera.fov = 52;
  }
  camera.updateProjectionMatrix();
}

function updateRain(dt) {
  const amt = weather.cur.rain;
  rainLines.visible = amt > 0.03;
  if (!rainLines.visible) return;
  const w = weather.wind(sim.x, sim.z), R = 45, n = Math.floor(RAIN_N * Math.min(1, amt));
  const vx = w.x * 0.9, vy = -17, vz = w.z * 0.9, c = camera.position;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6;
    if (i >= n) { rain.pos[o + 1] = rain.pos[o + 4] = -9999; continue; }
    rain.p[i * 3 + 1] -= (dt * 17) / R; rain.p[i * 3] += (dt * vx) / (2 * R); rain.p[i * 3 + 2] += (dt * vz) / (2 * R);
    for (let k = 0; k < 3; k++) rain.p[i * 3 + k] -= Math.floor(rain.p[i * 3 + k]);
    const px = c.x + (wrap(rain.p[i * 3] - c.x / (2 * R)) - 0.5) * 2 * R;
    const py = c.y + (wrap(rain.p[i * 3 + 1] - c.y / R) - 0.5) * R;
    const pz = c.z + (wrap(rain.p[i * 3 + 2] - c.z / (2 * R)) - 0.5) * 2 * R;
    rain.pos[o] = px; rain.pos[o + 1] = py; rain.pos[o + 2] = pz;
    rain.pos[o + 3] = px - vx * 0.035; rain.pos[o + 4] = py - vy * 0.035; rain.pos[o + 5] = pz - vz * 0.035;
  }
  rainGeo.attributes.position.needsUpdate = true;
  rainLines.material.opacity = 0.12 + 0.25 * amt * (0.3 + sky.ambient.g * 2);
}
const wrap = (v) => v - Math.floor(v);

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now; frameN++;
  if (!state.paused) {
    simTime += dt;
    state.hour = (state.hour + (dt * state.timeScale) / 3600 + 24) % 24;
  }
  weather.update(dt, simTime);
  sky.update(state.hour, weather.cur, simTime, dt);
  scene.fog.color.copy(sky.fogColor);
  sun.color.copy(sky.lightColor); sun.intensity = sky.lightI;
  hemi.color.copy(sky.ambient); hemi.intensity = 0.5;
  renderer.toneMappingExposure = 0.95 + 0.45 * sky.night;
  bloom.strength = 0.24 + 0.12 * sky.night;

  const w = weather.wind(sim.x, sim.z);
  // waves must be current before the boat samples them
  water.update(dt, simTime, weather.cur.wind * KT * (sim.x < -5200 ? 1 : 0.62 + 0.38 * Math.exp(-(((sim.z - 400) / 3400) ** 2))), weather.cur.dir, 1 + 0.35 * Math.max(0, -weather.tide), camera, weather.gustOff);
  updateBoat(dt);
  traffic.update(state.paused ? 0.0001 : dt, simTime, weather, water, sky.night, sky.lightI);
  world.update(simTime, sky.night);
  updateCamera(dt);
  water.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
  updateRain(dt);

  sun.position.copy(boat.group.position).addScaledVector(sky.lightDir, 90);
  sun.target.position.copy(boat.group.position);
  sun.castShadow = sky.lightI > 0.25;

  const envEvery = state.timeScale > 1 ? 180 : 900;
  if (now - lastEnv > envEvery) { lastEnv = now; scene.environment = sky.captureEnv(); }

  composer.render();

  sound.update(sim.aws, Math.abs(sim.u), weather.cur.rain);
  if (started && frameN % 3 === 0) {
    const twd = ((Math.atan2(-w.x, w.z) / DEG) + 360) % 360;
    ui.update({
      spd: Math.abs(sim.u) / KT, sog: sim.sog / KT, hdg: ((sim.psi / DEG) % 360 + 360) % 360, tws: sim.tws / KT, twa: sim.twa, aws: sim.aws / KT, awa: sim.awa,
      heel: sim.heel, depth: sim.depth, rudder: sim.rudder, sheet: sim.sheet, opt: sim.optBoom || 0, boom: sim.boom, side: sim.side,
      hour: state.hour, elev: sky.elev, x: sim.x, z: sim.z, twd, others: traffic.boats.map((b) => [b.x, b.z]), ship: traffic.shipPos,
    });
    if (sim.aground && !wasAground) ui.toast('Aground! Steer for deeper water', true, 4000);
    wasAground = sim.aground;
    if (sim.offChart) ui.toast('Edge of the chart — turn back toward the Bay', true);
    if (Math.abs(sim.twa) < 32 * DEG && Math.abs(sim.u) < 0.6 && !sim.aground) { ironsT += dt * 3; if (ironsT > 4) { ui.toast('In irons — hold the helm over to fall off the wind', true, 4000); ironsT = -8; } } else ironsT = Math.min(ironsT, 0) + (ironsT < 0 ? dt * 3 : 0);
  }
}

boot().catch((err) => { console.error(err); $('load-msg').textContent = 'Failed to start: ' + err.message; });
