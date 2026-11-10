// Procedural sky: sun/moon by time of day, atmosphere palette, stars, volumetric-looking
// clouds, plus a cube-map capture used for water reflections and image-based lighting.
import * as THREE from 'three';
import { FOG_GLSL, fogUniforms, nightUniform } from './fog.js';

const DEG = Math.PI / 180;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.3, 9.1); a *= 0.5; } return s; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.3, 9.1); a *= 0.5; } return s; }
`;

// sun elevation (deg) -> zenith, horizon, sun colour, sun intensity (linear)
const KEYS = [
  [-90, [0.003, 0.006, 0.016], [0.012, 0.016, 0.035], [1, 0.4, 0.2], 0],
  [-18, [0.003, 0.006, 0.016], [0.012, 0.016, 0.035], [1, 0.4, 0.2], 0],
  [-10, [0.008, 0.015, 0.05], [0.05, 0.045, 0.09], [1, 0.4, 0.2], 0],
  [-5, [0.03, 0.05, 0.16], [0.42, 0.20, 0.16], [1, 0.35, 0.12], 0],
  [-1, [0.07, 0.11, 0.30], [0.90, 0.42, 0.20], [1, 0.36, 0.12], 0.35],
  [2, [0.09, 0.15, 0.42], [1.0, 0.52, 0.24], [1, 0.48, 0.20], 1.5],
  [7, [0.09, 0.19, 0.50], [0.86, 0.62, 0.40], [1, 0.70, 0.42], 2.6],
  [16, [0.07, 0.20, 0.56], [0.52, 0.63, 0.78], [1, 0.88, 0.72], 3.4],
  [35, [0.045, 0.15, 0.50], [0.36, 0.54, 0.82], [1, 0.96, 0.90], 4.0],
  [90, [0.04, 0.14, 0.48], [0.33, 0.52, 0.82], [1, 0.98, 0.94], 4.2],
];
function palette(el) {
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (el - a[0]) / (b[0] - a[0])));
  const m = (x, y) => x.map((v, k) => v + (y[k] - v) * t);
  return { zen: m(a[1], b[1]), hor: m(a[2], b[2]), sun: m(a[3], b[3]), sunI: a[4] + (b[4] - a[4]) * t };
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function sunDirection(hour, decDeg, out) {
  const lat = 37.8 * DEG, dec = decDeg * DEG, h = (hour - 13.1) * 15 * DEG;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 1000.0, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunColor, uFogColor, uGround;
uniform float uSunI, uMoonI, uNight, uTime, uCoverage, uDark, uEnv, uWarm;
uniform vec2 uCloudOff;
varying vec3 vDir;
${NOISE_GLSL}
${FOG_GLSL}
float hash31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-4));
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  float side = dot(dxz, sxz) * 0.5 + 0.5;
  vec3 hor = mix(uHorizon, mix(uZenith * 1.6 + 0.01, uHorizon, side * side), uWarm);
  vec3 col = mix(hor, uZenith, pow(y, 0.38));
  float mu = max(dot(d, uSunDir), 0.0);
  col += uSunColor * uSunI * (0.025 * pow(mu, 5.0) + 0.09 * pow(mu, 48.0) + 0.4 * pow(mu, 700.0));

  float starVis = uNight * smoothstep(0.02, 0.25, d.y);
  if (starVis > 0.01) {
    vec3 sp = d * 260.0; vec3 c = floor(sp); float hh = hash31(c);
    float st = step(0.994, hh) * (1.0 - smoothstep(0.03, 0.2, length(fract(sp) - 0.5))) * (0.3 + 0.7 * fract(hh * 173.0));
    col += vec3(0.9, 0.95, 1.0) * st * starVis * (0.7 + 0.5 * sin(uTime * 2.5 + hh * 90.0)) * 1.6;
  }
  float mm = dot(d, uMoonDir);
  col += vec3(0.8, 0.87, 1.0) * uMoonI * (smoothstep(0.99955, 0.9997, mm) * 5.0 + 0.25 * pow(max(mm, 0.0), 400.0));

  float disc = smoothstep(0.99972, 0.99990, mu) * (1.0 - uEnv);
  col += uSunColor * disc * 55.0 * clamp(uSunI, 0.0, 1.5);

  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.09);
    vec2 p = uv * 1.25 + uCloudOff;
    float dens = fbm(p) * 0.72 + fbm(p * 2.9 + 11.0) * 0.28;
    float thr = mix(0.80, 0.24, uCoverage);
    float a = smoothstep(thr, thr + 0.20, dens);
    if (a > 0.001) {
      float dl = fbm(p + sxz * 0.22 * (1.0 - uSunDir.y * 0.5)) * 0.72 + 0.14;
      float shade = clamp(0.55 + (dens - dl) * 3.2, 0.0, 1.0);
      vec3 amb = mix(uHorizon, uZenith, 0.55);
      vec3 lit = uSunColor * uSunI * 0.30 + amb * 0.75 + vec3(0.8, 0.87, 1.0) * uMoonI * 0.05;
      vec3 shd = amb * 0.42 * (1.0 - 0.55 * uDark) + uSunColor * uSunI * 0.02;
      vec3 cc = mix(shd, lit, shade * (1.0 - 0.45 * smoothstep(thr + 0.2, thr + 0.5, dens)));
      cc += uSunColor * uSunI * 0.22 * pow(mu, 14.0) * (1.0 - a * 0.8);
      float fade = smoothstep(0.0, 0.11, d.y);
      col = mix(col, cc, a * fade);
    }
  }
  if (d.y < 0.0) col = mix(col, uGround, (1.0 - smoothstep(-0.04, 0.0, d.y)) * uEnv);
  vec3 dd = d; dd.y = max(dd.y, 0.0005);
  vec4 fg = bayFog(cameraPosition + normalize(dd) * 30000.0, cameraPosition, uFogColor);
  col = mix(col, fg.rgb, fg.a);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.lightColor = new THREE.Color(1, 1, 1);
    this.lightI = 1;
    this.ambient = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.zenith = new THREE.Color();
    this.horizon = new THREE.Color();
    this.night = 0;
    this.elev = 0;
    this.cloudOff = new THREE.Vector2();
    this.uniforms = {
      uSunDir: { value: this.sunDir }, uMoonDir: { value: this.moonDir },
      uZenith: { value: this.zenith }, uHorizon: { value: this.horizon },
      uSunColor: { value: new THREE.Color() }, uFogColor: { value: this.fogColor }, uGround: { value: new THREE.Color() },
      uSunI: { value: 1 }, uMoonI: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 },
      uCoverage: { value: 0.3 }, uDark: { value: 0 }, uEnv: { value: 0 }, uWarm: { value: 0 },
      uCloudOff: { value: this.cloudOff },
      ...fogUniforms,
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;

    this.envScene = new THREE.Scene();
    const envMesh = new THREE.Mesh(geo, this.material);
    envMesh.frustumCulled = false;
    this.envScene.add(envMesh);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(256, {
      type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCam = new THREE.CubeCamera(0.1, 10, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmremRT = null;
  }

  update(hour, wx, time, dt) {
    sunDirection(hour, 4, this.sunDir);
    sunDirection(hour + 11.3, -14, this.moonDir);
    const el = Math.asin(this.sunDir.y) / DEG;
    this.elev = el;
    const p = palette(el);
    const overcast = Math.min(1, Math.max(0, (wx.cloud - 0.55) / 0.45));
    const dark = wx.dark;
    const tone = (c) => {
      const l = lum(c) * 0.85, k = overcast * 0.85, s = (1 - 0.55 * dark) * (1 - 0.25 * overcast);
      return c.map((v) => (v + (l - v) * k) * s);
    };
    const zen = tone(p.zen), hor = tone(p.hor);
    const sunI = p.sunI * (1 - 0.93 * overcast) * (1 - 0.35 * wx.fog);
    const night = Math.min(1, Math.max(0, (-2 - el) / 10));
    this.night = night;
    nightUniform.value = night;
    const moonUp = Math.max(0, this.moonDir.y);
    const moonI = night * 0.3 * Math.min(1, moonUp * 4) * (1 - 0.8 * overcast);

    this.zenith.setRGB(zen[0], zen[1], zen[2]);
    this.horizon.setRGB(hor[0], hor[1], hor[2]);
    const u = this.uniforms;
    u.uSunColor.value.setRGB(p.sun[0], p.sun[1], p.sun[2]);
    u.uSunI.value = sunI; u.uMoonI.value = moonI; u.uNight.value = night * (1 - overcast);
    u.uTime.value = time; u.uCoverage.value = wx.cloud; u.uDark.value = dark;
    u.uWarm.value = Math.min(1, Math.max(0, (14 - el) / 14)) * Math.min(1, Math.max(0, (el + 12) / 8)) * (1 - overcast);
    const wd = wx.dir * DEG;
    this.cloudOff.x += -Math.sin(wd) * dt * 0.004 * (0.4 + wx.wind / 20);
    this.cloudOff.y += Math.cos(wd) * dt * 0.004 * (0.4 + wx.wind / 20);

    if (sunI > 0.03) {
      this.lightDir.copy(this.sunDir);
      this.lightColor.setRGB(p.sun[0], p.sun[1], p.sun[2]);
      this.lightI = sunI;
    } else {
      if (moonUp > 0.05) this.lightDir.copy(this.moonDir); else this.lightDir.set(0.3, 0.9, 0.2).normalize();
      this.lightColor.setRGB(0.6, 0.72, 1.0);
      this.lightI = moonI + 0.02;
    }
    this.ambient.setRGB(zen[0] * 0.55 + hor[0] * 0.45, zen[1] * 0.55 + hor[1] * 0.45, zen[2] * 0.55 + hor[2] * 0.45);
    const fl = lum(hor) * 0.85 + 0.05 * sunI, k = 0.12 + 0.6 * wx.fog;
    this.fogColor.setRGB(hor[0] + (fl - hor[0]) * k, hor[1] + (fl - hor[1]) * k, hor[2] + (fl - hor[2]) * k);
    const al = lum([this.ambient.r, this.ambient.g, this.ambient.b]);
    u.uGround.value.setRGB(0.03 * al * 3 + hor[0] * 0.12, 0.09 * al * 3 + hor[1] * 0.12, 0.10 * al * 3 + hor[2] * 0.12);

    // fog parameters
    const f = wx.fog;
    fogUniforms.uFogA.value.set(
      1.6e-5 + 5e-5 * f + 6e-5 * wx.rain + 2e-5 * overcast,
      f * f * 0.0024,
      1 / (60 + 110 * f),
      -9000 + 18000 * f,
    );
    fogUniforms.uFogSun.value.set(this.lightDir.x, this.lightDir.y, this.lightDir.z, 0.55);
    fogUniforms.uFogSunColor.value.copy(this.lightColor).multiplyScalar(this.lightI * 0.07);
  }

  captureEnv() {
    this.uniforms.uEnv.value = 1;
    this.cubeCam.update(this.renderer, this.envScene);
    this.uniforms.uEnv.value = 0;
    const old = this.pmremRT;
    this.pmremRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    if (old) old.dispose();
    return this.pmremRT.texture;
  }
}
