// Ocean: Gerstner-displaced polar grid centred on the camera, with analytic per-pixel
// normals, sky reflections, sun glitter, sub-surface scatter, whitecaps, shore foam,
// gust patches and a boat wake. The JS side mirrors the wave function for buoyancy.
import * as THREE from 'three';
import { FOG_GLSL, fogUniforms } from './fog.js';
import { NOISE_GLSL } from './sky.js';
import { WORLD, smooth } from './geo.js';

const DEG = Math.PI / 180;
// wavelength m, angle offset deg, relative amplitude, wind speed (m/s) at which it is developed
const WAVES = [
  [62, -8, 0.42, 12], [41, 12, 0.34, 9], [27, -18, 0.30, 6], [19, 6, 0.24, 4.5],
  [13, 27, 0.17, 3], [9.1, -31, 0.12, 2.2], [6.3, 41, 0.085, 1.5], [4.4, -47, 0.06, 1.0],
];
const RIPPLES = [[2.9, 15, 0.035], [1.9, -25, 0.04], [1.25, 50, 0.045], [0.8, -60, 0.045], [0.52, 80, 0.04], [0.33, -100, 0.035]];
export const WAKE_N = 24;

export const GUST_GLSL = /* glsl */ `
uniform vec2 uGustOff;
float gustField(vec2 p){
  vec2 q = p - uGustOff;
  float a = sin(q.x*0.0071 + 1.3*sin(q.y*0.0043)) * sin(q.y*0.0063 + 1.7*sin(q.x*0.0037 + 2.0));
  float b = sin(q.x*0.021 + q.y*0.013) * sin(q.y*0.019 - q.x*0.011 + 1.0);
  return a*0.75 + b*0.35;
}`;
export function gustField(x, z, off) {
  const qx = x - off.x, qz = z - off.y;
  const a = Math.sin(qx * 0.0071 + 1.3 * Math.sin(qz * 0.0043)) * Math.sin(qz * 0.0063 + 1.7 * Math.sin(qx * 0.0037 + 2.0));
  const b = Math.sin(qx * 0.021 + qz * 0.013) * Math.sin(qz * 0.019 - qx * 0.011 + 1.0);
  return a * 0.75 + b * 0.35;
}

const VERT = /* glsl */ `
uniform vec3 uCenter;
uniform float uTime;
uniform vec4 uWave[8];
uniform sampler2D uDepth;
uniform float uWorldSize;
varying vec2 vOrig;
varying vec3 vWorld;
varying float vShore;
void main(){
  vec2 xz = position.xz + uCenter.xz;
  float r = length(position.xz);
  float spacing = 0.03 * r + 0.5;
  float hgt = texture2D(uDepth, xz / uWorldSize + 0.5).r * 16.0 - 12.0;
  float shore = 1.0 - smoothstep(-5.0, 0.3, hgt);
  vec3 p = vec3(xz.x, 0.0, xz.y);
  for (int i = 0; i < 8; i++){
    vec4 w = uWave[i];
    float L = 6.28318 / w.z;
    float att = clamp(L / spacing * 0.25 - 0.5, 0.0, 1.0) * shore;
    float ph = w.z * dot(w.xy, xz) - sqrt(9.81 * w.z) * uTime;
    float grp = 1.0 + 0.5 * sin(w.z * (0.11 * dot(xz, vec2(-w.y, w.x)) + 0.023 * dot(xz, w.xy)) + float(i) * 2.4);
    float A = w.w * att * grp;
    p.y += A * sin(ph);
    p.xz += w.xy * A * cos(ph);
  }
  vOrig = xz; vWorld = p; vShore = shore;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec4 uWave[8];
uniform vec4 uRip[6];
uniform samplerCube uEnv;
uniform sampler2D uDepth;
uniform float uWorldSize;
uniform vec3 uSunDir, uSunColor, uAmbient, uDeep, uScatter, uShallow, uFogColor;
uniform float uFoam, uFoamTh, uRipple, uHs;
uniform vec2 uSeaDir;
uniform vec4 uWake[${WAKE_N}];
uniform vec4 uWakeBound;
varying vec2 vOrig;
varying vec3 vWorld;
varying float vShore;
${NOISE_GLSL}
${FOG_GLSL}
${GUST_GLSL}
void main(){
  vec3 V = cameraPosition - vWorld;
  float dist = length(V);
  V /= dist;
  vec2 fw = fwidth(vOrig);
  float px = max(sqrt(length(dFdx(vOrig)) * length(dFdy(vOrig))) * 1.5, 1e-4);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float h = 0.0, lost = 0.0;
  for (int i = 0; i < 8; i++){
    vec4 w = uWave[i];
    float L = 6.28318 / w.z;
    float att = clamp(L / px * 0.22 - 0.45, 0.0, 1.0);
    float ph = w.z * dot(w.xy, vOrig) - sqrt(9.81 * w.z) * uTime;
    float grp = 1.0 + 0.5 * sin(w.z * (0.11 * dot(vOrig, vec2(-w.y, w.x)) + 0.023 * dot(vOrig, w.xy)) + float(i) * 2.4);
    float ka = w.z * w.w * vShore * grp;
    float s = ka * att;
    n.xz -= w.xy * s * cos(ph);
    n.y -= s * sin(ph);
    h += w.w * vShore * grp * att * sin(ph);
    lost += 0.5 * ka * ka * (1.0 - att * att);
  }
  float gust = clamp(gustField(vOrig) * 0.5 + 0.5, 0.0, 1.0);
  float rip = uRipple * mix(0.5, 1.5, gust) * (0.35 + 0.65 * vShore);
  for (int i = 0; i < 6; i++){
    vec4 r = uRip[i];
    float L = 6.28318 / r.z;
    float att = clamp(L / px * 0.22 - 0.45, 0.0, 1.0);
    float ph = r.z * dot(r.xy, vOrig) - sqrt(9.81 * r.z + 0.000074 * r.z * r.z * r.z) * uTime;
    float s = r.w * rip;
    n.xz -= r.xy * s * att * cos(ph);
    lost += 0.5 * s * s * (1.0 - att * att);
  }
  float na = clamp(1.1 / px * 0.22 - 0.3, 0.0, 1.0);
  if (na > 0.0) {
    vec2 q = vOrig * 0.85 - uSeaDir * uTime * 0.9;
    float e = 0.12;
    float a0 = fbm3(q);
    vec2 g = vec2(fbm3(q + vec2(e, 0.0)) - a0, fbm3(q + vec2(0.0, e)) - a0) / e;
    n.xz -= g * 0.11 * rip * na;
  }
  lost += pow(0.07 * rip, 2.0) * (1.0 - na * na);
  vec3 N = normalize(n);

  float NdV = max(dot(N, V), 0.001);
  float F = 0.02 + 0.98 * pow(1.0 - min(NdV + sqrt(lost) * 0.9, 1.0), 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.01;
  R = normalize(R);
  vec3 refl = textureCube(uEnv, R, clamp(lost * 18.0, 0.0, 1.0) * 5.0).rgb;

  vec3 L = uSunDir;
  vec3 Hh = normalize(V + L);
  float sig2 = 0.0016 + lost;
  float nexp = clamp(1.0 / sig2 - 2.0, 4.0, 700.0);
  float spec = pow(max(dot(N, Hh), 0.0), nexp) * (nexp + 8.0) / 25.13;
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  vec3 sunSpec = uSunColor * spec * mix(Fs, 1.0, 0.08) * 0.3 * smoothstep(-0.02, 0.06, L.y);

  float NdL = max(dot(N, L), 0.0);
  float crest = clamp(h / max(uHs, 0.05) * 0.5 + 0.5, 0.0, 1.0);
  float back = pow(max(dot(-V, L) * 0.5 + 0.5, 0.0), 2.0);
  vec3 body = uDeep * (uAmbient + uSunColor * 0.12 * (0.4 + 0.6 * NdL));
  body += uScatter * (uAmbient * 0.6 + uSunColor * 0.10 * (0.3 + back * 1.5)) * (0.2 + crest * 0.9 * (1.0 - NdV * 0.5));
  body *= mix(1.0, 0.8, gust * 0.6);

  float dpt = -(texture2D(uDepth, vOrig / uWorldSize + 0.5).r * 16.0 - 12.0);
  body = mix(body, uShallow * (uAmbient + uSunColor * 0.1), (1.0 - smoothstep(0.0, 6.0, dpt)) * 0.6);

  vec3 col = mix(body, refl, F) + sunSpec;

  // ---- foam ----
  float fn = fbm3(vOrig * 1.7 + uSeaDir * uTime * 0.25);
  vec2 fq = mat2(0.8, 0.6, -0.6, 0.8) * vOrig;
  float fn2 = fbm3(fq * 2.3 - uSeaDir * uTime * 0.5 + fn * 1.5);
  float hn = h / max(uHs, 0.05);
  float cap = smoothstep(uFoamTh, uFoamTh + 0.35, hn + (fn - 0.5) * 0.9) * smoothstep(0.46, 0.72, fn * 0.55 + fn2 * 0.45 + 0.08) * uFoam;
  cap *= clamp(13.0 / px * 0.22 - 0.2, 0.0, 1.0) * 0.75 + 0.25;
  float wake = 0.0;
  if (distance(vOrig, uWakeBound.xy) < uWakeBound.z) {
    for (int i = 0; i < ${WAKE_N - 1}; i++){
      vec4 a = uWake[i]; vec4 b = uWake[i + 1];
      if (a.w <= 0.0 || b.w <= 0.0) continue;
      vec2 pa = vOrig - a.xy, ba = b.xy - a.xy;
      float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
      float dd = length(pa - ba * t);
      float age = mix(a.z, b.z, t);
      float wdt = 0.5 + age * 0.17;
      wake = max(wake, mix(a.w, b.w, t) * exp(-dd * dd / (wdt * wdt)) * exp(-age * 0.16));
    }
  }
  float wk = smoothstep(0.22, 0.75, wake * (0.25 + 1.5 * fn2 * fn + 0.55 * wake)) * 0.9;
  float sf = (1.0 - smoothstep(0.0, 1.6, dpt)) * (0.45 + 0.55 * sin(dpt * 5.0 - uTime * 1.3 + fn * 6.0));
  sf = max(sf, 1.0 - smoothstep(0.0, 0.35, dpt)) * smoothstep(0.3, 0.6, fn + 0.2) * 0.85;
  float foam = clamp(max(max(cap, wk), sf), 0.0, 1.0);
  vec3 foamCol = uAmbient * 0.95 + uSunColor * 0.2 * (0.5 + 0.5 * NdL);
  col = mix(col, foamCol, foam);

  vec4 fg = bayFog(vWorld, cameraPosition, uFogColor);
  col = mix(col, fg.rgb, fg.a);
  gl_FragColor = vec4(col, 1.0);
}`;

const grp = (w, i, x, z) => 1 + 0.5 * Math.sin(w.k * (0.11 * (-w.dz * x + w.dx * z) + 0.023 * (w.dx * x + w.dz * z)) + i * 2.4);

function polarGrid(rings = 260, segs = 256, r0 = 0.5, g = 1.03) {
  const pos = new Float32Array((rings + 1) * segs * 3);
  const idx = new Uint32Array(rings * segs * 6);
  for (let i = 0; i <= rings; i++) {
    const r = (r0 * (Math.pow(g, i) - 1)) / (g - 1);
    for (let s = 0; s < segs; s++) {
      const a = ((s + (i % 2) * 0.5) / segs) * Math.PI * 2, k = (i * segs + s) * 3;
      pos[k] = r * Math.cos(a); pos[k + 1] = 0; pos[k + 2] = r * Math.sin(a);
    }
  }
  let o = 0;
  for (let i = 0; i < rings; i++) for (let s = 0; s < segs; s++) {
    const a = i * segs + s, b = i * segs + ((s + 1) % segs), c = (i + 1) * segs + s, d = (i + 1) * segs + ((s + 1) % segs);
    idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = d; idx[o++] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

export class Water {
  constructor(hf, sky) {
    this.hf = hf;
    this.sky = sky;
    this.seaDir = 250; // degrees, direction the sea is coming FROM
    this.seaFade = 1;
    this.windSm = 8;
    this.waves = WAVES.map(([L, ang, a, u]) => ({ L, ang, a, u, k: (2 * Math.PI) / L, om: Math.sqrt((9.81 * 2 * Math.PI) / L), dx: 0, dz: 0, A: 0 }));
    this.wake = Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 0));
    this.wakeBirth = new Float32Array(WAKE_N);
    this.uniforms = {
      uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uWave: { value: this.waves.map(() => new THREE.Vector4()) },
      uRip: { value: RIPPLES.map(() => new THREE.Vector4()) },
      uEnv: { value: sky.cubeRT.texture }, uDepth: { value: hf.depthTexture() }, uWorldSize: { value: WORLD.size },
      uSunDir: { value: sky.lightDir }, uSunColor: { value: new THREE.Color() }, uAmbient: { value: sky.ambient },
      uDeep: { value: new THREE.Color(0.010, 0.060, 0.072) }, uScatter: { value: new THREE.Color(0.03, 0.20, 0.18) },
      uShallow: { value: new THREE.Color(0.20, 0.28, 0.20) }, uFogColor: { value: sky.fogColor },
      uFoam: { value: 0 }, uFoamTh: { value: 1 }, uRipple: { value: 1 }, uHs: { value: 0.5 },
      uSeaDir: { value: new THREE.Vector2(1, 0) }, uGustOff: { value: new THREE.Vector2() },
      uWake: { value: this.wake }, uWakeBound: { value: new THREE.Vector4(0, 0, 0, 0) },
      ...fogUniforms,
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(polarGrid(), this.material);
    this.mesh.frustumCulled = false;
    this.time = 0;
    this._setDirs();
  }

  _setDirs() {
    const u = this.uniforms;
    this.waves.forEach((w, i) => {
      const a = (this.seaDir + w.ang) * DEG; // travelling toward seaDir + 180
      w.dx = -Math.sin(a); w.dz = Math.cos(a);
    });
    RIPPLES.forEach(([L, ang, s], i) => {
      const a = (this.seaDir + ang) * DEG;
      u.uRip.value[i].set(-Math.sin(a), Math.cos(a), (2 * Math.PI) / L, s);
    });
    const a = this.seaDir * DEG;
    u.uSeaDir.value.set(-Math.sin(a), Math.cos(a));
  }

  update(dt, time, windMs, windDirDeg, chop, camera, gustOff) {
    this.time = time;
    const u = this.uniforms;
    // re-aim the sea when the wind has shifted a lot (fade out, swing, fade in)
    let diff = ((windDirDeg - this.seaDir + 540) % 360) - 180;
    if (Math.abs(diff) > 22 || this._turning) {
      this._turning = true;
      this.seaFade = Math.max(0, this.seaFade - dt * 0.6);
      if (this.seaFade === 0) { this.seaDir = windDirDeg; this._setDirs(); this._turning = false; }
    } else this.seaFade = Math.min(1, this.seaFade + dt * 0.4);
    this.windSm += (windMs - this.windSm) * Math.min(1, dt * 0.25);
    const U = this.windSm;
    let sum = 0;
    this.waves.forEach((w, i) => {
      w.A = 0.45 * w.a * Math.min(1.6, Math.max(0, (U - 0.4 * w.u) / (0.9 * w.u))) * this.seaFade * chop;
      sum += w.A;
      u.uWave.value[i].set(w.dx, w.dz, w.k, w.A);
    });
    u.uHs.value = sum * 0.5 + 0.02;
    u.uTime.value = time;
    u.uCenter.value.set(camera.position.x, 0, camera.position.z);
    u.uRipple.value = Math.min(1.7, Math.max(0.12, U / 8));
    const foam = smooth(5.0, 13.5, U);
    u.uFoam.value = foam;
    u.uFoamTh.value = 1.2 - 0.6 * foam;
    u.uSunColor.value.copy(this.sky.lightColor).multiplyScalar(this.sky.lightI);
    u.uGustOff.value.copy(gustOff);
    for (let i = 0; i < WAKE_N; i++) if (this.wake[i].w > 0) this.wake[i].z = time - this.wakeBirth[i];
  }

  // push a wake sample at the stern; index 0 is always the live stern position
  wakePoint(x, z, strength, emit) {
    if (emit) {
      for (let i = WAKE_N - 1; i > 1; i--) { this.wake[i].copy(this.wake[i - 1]); this.wakeBirth[i] = this.wakeBirth[i - 1]; }
      this.wake[1].set(x, z, 0, strength); this.wakeBirth[1] = this.time;
    }
    this.wake[0].set(x, z, 0, strength); this.wakeBirth[0] = this.time;
    this.uniforms.uWakeBound.value.set(x, z, 110, 0);
  }
  clearWake() { for (const w of this.wake) w.set(0, 0, 0, 0); }

  heightAt(x, z, t = this.time) {
    const shore = 1 - smooth(-5, 0.3, this.hf.heightAt(x, z));
    if (shore <= 0) return 0;
    let px = x, pz = z;
    const W = this.waves;
    for (let it = 0; it < 2; it++) {
      let dx = 0, dz = 0;
      for (let i = 0; i < W.length; i++) {
        const w = W[i], c = Math.cos(w.k * (w.dx * px + w.dz * pz) - w.om * t) * w.A * shore * grp(w, i, px, pz);
        dx += w.dx * c; dz += w.dz * c;
      }
      px = x - dx; pz = z - dz;
    }
    let h = 0;
    for (let i = 0; i < W.length; i++) { const w = W[i]; h += w.A * grp(w, i, px, pz) * Math.sin(w.k * (w.dx * px + w.dz * pz) - w.om * t); }
    return h * shore;
  }
}
