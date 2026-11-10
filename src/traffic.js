// Life on the water: other sailboats, a container ship in the shipping lane, and channel buoys.
import * as THREE from 'three';
import { BOATS, buildBoat } from './boats.js';
import { ll } from './geo.js';

const DEG = Math.PI / 180;
const HULLS = ['#f3f0e6', '#1d3557', '#fafafa', '#7a1f1f', '#0f5a4a', '#f3f0e6', '#2b2d42', '#e9d8a6'];

class AIBoat {
  constructor(scene, i, x, z) {
    const base = BOATS[i % 3];
    const spec = { ...base, colors: { ...base.colors, hull: HULLS[i % HULLS.length], crew: ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d'][i % 4] }, sailNo: String(100 + i * 37) };
    this.model = buildBoat(spec, { simple: true });
    this.spec = spec;
    scene.add(this.model.group);
    this.home = [x, z]; this.x = x; this.z = z;
    this.tack = i % 2 ? 1 : -1; this.psi = 0; this.init = false;
    this.u = 2; this.heel = 0; this.side = 1; this.range = 1200 + (i % 3) * 500; this.off = (i * 37) % 40 - 20;
    this.pitch = 0; this.y = 0; this.cool = 0;
  }
  update(dt, time, weather, water, hf, night, sunI) {
    const w = weather.wind(this.x, this.z);
    const from = w.from, sp = w.speed;
    const want = from + this.tack * (90 + this.off) * DEG; // beam reach back and forth
    if (!this.init) { this.psi = want; this.init = true; }
    this.cool -= dt;
    const fx = Math.sin(this.psi), fz = -Math.cos(this.psi);
    const far = Math.hypot(this.x - this.home[0], this.z - this.home[1]) > this.range;
    const shoal = hf.heightAt(this.x + fx * 220, this.z + fz * 220) > -5;
    if ((far || shoal) && this.cool <= 0) { this.tack *= -1; this.cool = 40; }
    let d = ((want - this.psi + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = Math.min(Math.abs(d), dt * 0.2) * Math.sign(d);
    this.psi += turn;
    const awa = ((from - this.psi + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const a = Math.abs(awa);
    const eff = Math.min(1, Math.max(0, (a - 0.5) / 0.6));
    const target = Math.min(1.25 * Math.sqrt(this.spec.lwl) * 0.8, sp * 0.42) * eff;
    this.u += (target - this.u) * Math.min(1, dt * 0.3);
    this.x += fx * this.u * dt; this.z += fz * this.u * dt;
    const sgn = Math.sign(awa) || 1;
    this.side += Math.max(-dt * 2.5, Math.min(dt * 2.5, sgn - this.side));
    const heelT = -this.side * Math.min(0.5, sp * sp * 0.0042) * eff;
    this.heel += (heelT - this.heel) * Math.min(1, dt * 1.5);
    const L = this.spec.loa * 0.35;
    const hb = water.heightAt(this.x + fx * L, this.z + fz * L, time), hs = water.heightAt(this.x - fx * L, this.z - fz * L, time);
    this.y += ((hb + hs) / 2 - this.y) * Math.min(1, dt * 5);
    this.pitch += (Math.atan2(hb - hs, 2 * L) - this.pitch) * Math.min(1, dt * 4);
    const g = this.model.group;
    g.position.set(this.x, this.y - 0.03, this.z);
    g.rotation.set(this.pitch, -this.psi, -this.heel);
    const boom = Math.min(1.45, Math.max(0.08, a - 0.3));
    this.model.update({ boom, side: this.side, alpha: Math.max(0, a - boom), aws: sp, awa, rudder: turn / (dt + 1e-6) * 2, time: time + this.off, heel: this.heel, night, sunI });
  }
}

function buildShip() {
  const g = new THREE.Group();
  const L = 280, Bm = 40;
  const sh = new THREE.Shape();
  sh.moveTo(-L / 2, -Bm / 2); sh.lineTo(L / 2 - 50, -Bm / 2); sh.quadraticCurveTo(L / 2 - 10, -Bm / 2, L / 2, 0);
  sh.quadraticCurveTo(L / 2 - 10, Bm / 2, L / 2 - 50, Bm / 2); sh.lineTo(-L / 2, Bm / 2); sh.lineTo(-L / 2, -Bm / 2);
  const hullG = new THREE.ExtrudeGeometry(sh, { depth: 22, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ color: 0x1c2f4a, roughness: 0.6 }));
  hull.position.y = -9; g.add(hull);
  const boot = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 9.4, bevelEnabled: false }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a1f1f, roughness: 0.7 }));
  boot.position.y = -9; boot.scale.set(1.002, 1, 1.01); g.add(boot);
  const house = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 36), new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.7 }));
  house.position.set(-L / 2 + 45, 28, 0); g.add(house);
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9a21b }));
  funnel.position.set(-L / 2 + 28, 38, 0); g.add(funnel);
  const cols = ['#b23a2e', '#2e6f9e', '#d98b2b', '#3e8e5a', '#8a8f94', '#c9c4b5', '#7a3e8e', '#1f4e79'];
  const bays = [];
  for (let b = 0; b < 16; b++) { const x = -L / 2 + 70 + b * 12.8; if (x > L / 2 - 45) break; for (let c = 0; c < 13; c++) bays.push([x, c]); }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 1, 2.44).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.75 }), bays.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  bays.forEach(([x, c], i) => {
    const n = 3 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 4 | 0;
    m.makeScale(1, n * 2.6, 1); m.setPosition(x, 13, (c - 6) * 2.6);
    inst.setMatrixAt(i, m); inst.setColorAt(i, col.set(cols[(i * 7 + c * 3) % cols.length]));
  });
  inst.frustumCulled = false; g.add(inst);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, y, z] of [[-L / 2 + 45, 46, 0], [L / 2 - 20, 20, 0], [-L / 2 + 45, 42, 16], [-L / 2 + 45, 42, -16]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), lamp); s.position.set(x, y, z); g.add(s);
  }
  g.userData.lamp = lamp;
  return g;
}

const SHIP_PATH = [[-15500, 1900], [-9000, 1300], [-4872, 816], [-1500, 1250], [1500, 1100], [3000, 2300], [3545, 3727], [4300, 5300], [5600, 9000], [6500, 15500]];
const BUOYS = [[37.8205, -122.4350, 0], [37.8135, -122.4040, 1], [37.8330, -122.4500, 1], [37.8150, -122.4560, 0], [37.8440, -122.4190, 0],
  [37.8060, -122.3830, 1], [37.8610, -122.4560, 1], [37.8520, -122.3600, 0], [37.8230, -122.4660, 1], [37.8300, -122.3950, 0]];

export class Traffic {
  constructor(scene, hf) {
    this.hf = hf;
    this.boats = [[-2500, 300], [-800, -900], [600, 900], [1800, -400], [2600, 1500], [-3200, 1300], [300, -2200], [3600, -1200]]
      .map(([x, z], i) => new AIBoat(scene, i, x, z));
    this.ship = buildShip(); scene.add(this.ship);
    this.shipS = 0.18; this.shipPsi = 0;
    this.buoys = BUOYS.map(([la, lo, red]) => {
      const [x, z] = ll(la, lo), g = new THREE.Group();
      const c = red ? 0xc8261c : 0x1f8a3b;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })); body.position.y = 0.5; g.add(body);
      const cage = new THREE.Mesh(red ? new THREE.ConeGeometry(0.7, 2.6, 8) : new THREE.CylinderGeometry(0.5, 0.5, 2.4, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })); cage.position.y = 2.5; g.add(cage);
      const lm = new THREE.MeshBasicMaterial({ color: c });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lm); lamp.position.y = 4.0; g.add(lamp);
      g.position.set(x, 0, z); scene.add(g);
      return { g, x, z, lm, base: new THREE.Color(red ? 0xff3020 : 0x30ff60), ph: x * 0.01 };
    });
  }
  update(dt, time, weather, water, night, sunI) {
    for (const b of this.boats) b.update(dt, time, weather, water, this.hf, night, sunI);
    // ship along its lane
    const P = SHIP_PATH, n = P.length - 1;
    const seg = Math.min(n - 1, Math.floor(this.shipS)), t = this.shipS - seg;
    const a = P[seg], b = P[seg + 1], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.shipS += (6.2 * dt) / sl;
    if (this.shipS >= n) this.shipS = 0;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const want = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    let d = ((want - this.shipPsi + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.shipPsi += d * Math.min(1, dt * 0.25);
    if (this.shipS < 0.01) this.shipPsi = want;
    this.ship.position.set(x, 0, z); this.ship.rotation.y = this.shipPsi;
    this.ship.userData.lamp.color.setScalar(0.2 + night * 6);
    this.shipPos = [x, z];
    for (const bu of this.buoys) {
      const h = water.heightAt(bu.x, bu.z, time), h2 = water.heightAt(bu.x + 1.5, bu.z, time), h3 = water.heightAt(bu.x, bu.z + 1.5, time);
      bu.g.position.y = h - 0.2;
      bu.g.rotation.z = (h2 - h) * 0.5; bu.g.rotation.x = -(h3 - h) * 0.5;
      const on = ((time + bu.ph) % 4) < 0.6 ? 1 : 0.05;
      bu.lm.color.copy(bu.base).multiplyScalar((0.25 + night * 7) * on);
    }
  }
}
