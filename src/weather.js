// Weather presets, the Bay wind field (the "slot", gusts and shifts) and tidal current.
import * as THREE from 'three';
import { GATE } from './geo.js';
import { gustField } from './water.js';
import { KT } from './physics.js';

const DEG = Math.PI / 180;

// wind kt, dir deg (from), gust 0..1, fog 0..1, cloud 0..1, rain 0..1, dark 0..1
export const PRESETS = {
  summer: { label: 'Summer Breeze', wind: 17, dir: 250, gust: 0.3, fog: 0.14, cloud: 0.3, rain: 0, dark: 0 },
  clear: { label: 'Crystal Clear', wind: 12, dir: 285, gust: 0.2, fog: 0.0, cloud: 0.1, rain: 0, dark: 0 },
  calm: { label: 'Glassy Morning', wind: 5, dir: 235, gust: 0.12, fog: 0.12, cloud: 0.2, rain: 0, dark: 0 },
  fog: { label: 'Fog Rolling In', wind: 20, dir: 255, gust: 0.3, fog: 0.8, cloud: 0.45, rain: 0, dark: 0.1 },
  advisory: { label: 'Small Craft Advisory', wind: 27, dir: 262, gust: 0.5, fog: 0.15, cloud: 0.6, rain: 0, dark: 0.15 },
  storm: { label: 'Winter Storm', wind: 32, dir: 175, gust: 0.6, fog: 0.3, cloud: 1.0, rain: 1, dark: 0.7 },
};
const KEYS = ['wind', 'gust', 'fog', 'cloud', 'rain', 'dark'];

export class Weather {
  constructor() {
    this.target = { ...PRESETS.summer };
    this.cur = { ...PRESETS.summer };
    this.tide = 0; // -1 full ebb .. +1 full flood
    this.gustOff = new THREE.Vector2();
    this.time = 0;
    this._w = { x: 0, z: 0, speed: 0, from: 0 };
    this._c = { x: 0, z: 0 };
  }
  setPreset(name) { Object.assign(this.target, PRESETS[name]); }
  update(dt, time) {
    this.time = time;
    const k = Math.min(1, dt * 0.45);
    for (const key of KEYS) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    const d = ((this.target.dir - this.cur.dir + 540) % 360) - 180;
    this.cur.dir = (this.cur.dir + d * k + 360) % 360;
    const a = this.cur.dir * DEG, sp = this.cur.wind * KT * 0.7;
    this.gustOff.x += -Math.sin(a) * sp * dt;
    this.gustOff.y += Math.cos(a) * sp * dt;
  }
  // wind velocity vector (direction the air moves toward), m/s
  wind = (x, z) => {
    const c = this.cur;
    const g = gustField(x, z, this.gustOff);
    const slot = x < -5200 ? 1 : 0.62 + 0.38 * Math.exp(-(((z - 400) / 3400) ** 2));
    const slow = 1 + 0.08 * Math.sin(this.time * 0.11) + 0.05 * Math.sin(this.time * 0.37 + 1.3);
    const speed = Math.max(0, c.wind * KT * slot * slow * (1 + c.gust * 0.55 * g));
    const shift = c.gust * 11 * Math.sin(x * 0.0013 + z * 0.0017 + this.time * 0.05) + c.gust * 5 * g;
    const a = (c.dir + shift) * DEG;
    const w = this._w;
    w.x = -Math.sin(a) * speed; w.z = Math.cos(a) * speed; w.speed = speed; w.from = a;
    return w;
  };
  // tidal stream, m/s: funnels through the Golden Gate
  current = (x, z) => {
    const c = this._c;
    if (Math.abs(this.tide) < 0.01) { c.x = 0; c.z = 0; return c; }
    const gx = GATE[0] - x, gz = GATE[1] - z, gd = Math.hypot(gx, gz) || 1;
    const wgt = Math.min(1, Math.max(0, (x + 5800) / 2000));
    let dx = -1 * (1 - wgt) + (gx / gd) * wgt, dz = (gz / gd) * wgt;
    const dl = Math.hypot(dx, dz) || 1;
    const max = this.tide < 0 ? 2.3 : 1.7; // ebb runs harder than flood
    const mag = -this.tide * max * (0.22 + 0.78 * Math.exp(-(gd * gd) / (2600 * 2600)));
    c.x = (dx / dl) * mag; c.z = (dz / dl) * mag;
    return c;
  };
}
