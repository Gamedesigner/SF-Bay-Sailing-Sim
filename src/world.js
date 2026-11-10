// Static world: terrain mesh, city blocks, Golden Gate + Bay Bridge, Alcatraz and landmarks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ll, LAND, landColor, isUrban, hash2 } from './geo.js';
import { attachFog, nightUniform } from './fog.js';

const _m = new THREE.Matrix4(), _e = new THREE.Euler();

class Batch {
  constructor() { this.map = new Map(); this.lines = new Map(); }
  add(mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, frame = null) {
    _m.makeRotationFromEuler(_e.set(rx, ry, rz)); _m.setPosition(x, y, z);
    if (frame) _m.premultiply(frame);
    g.applyMatrix4(_m);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
  }
  box(mat, frame, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz, frame); }
  cyl(mat, frame, rt, rb, h, x, y, z, seg = 12) { this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, 0, 0, 0, frame); }
  ball(mat, frame, r, x, y, z) { this.add(mat, new THREE.SphereGeometry(r, 6, 4), x, y, z, 0, 0, 0, frame); }
  tube(mat, frame, pts, r) {
    const v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(frame));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), Math.max(8, pts.length * 2), r, 5, false);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
  }
  line(mat, frame, a, b) {
    const va = new THREE.Vector3(...a).applyMatrix4(frame), vb = new THREE.Vector3(...b).applyMatrix4(frame);
    if (!this.lines.has(mat)) this.lines.set(mat, []);
    this.lines.get(mat).push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
  }
  build(parent) {
    for (const [mat, list] of this.map) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      parent.add(mesh);
      if (mat.userData.light) mat.userData.mesh = mesh;
    }
    for (const [mat, arr] of this.lines) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      parent.add(new THREE.LineSegments(g, mat));
    }
  }
}

function frameOf(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const m = new THREE.Matrix4().makeRotationY(Math.atan2(-dz, dx));
  m.setPosition(a[0], 0, a[1]);
  return { m, len };
}
const cable = (x0, y0, x1, y1, sag, n, z) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - sag * 4 * t * (1 - t), z]); }
  return pts;
};
const cableY = (x0, y0, x1, y1, sag, x) => { const t = (x - x0) / (x1 - x0); return y0 + (y1 - y0) * t - sag * 4 * t * (1 - t); };

// building material with procedural windows (dark glass by day, lit at night)
function bldgMat(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, ...opts });
  mat.onBeforeCompile = (shader) => {
    attachFog(shader);
    shader.uniforms.uNight = nightUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        float bHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bN = normalize(cross(dFdx(vFogWorldPos), dFdy(vFogWorldPos)));
        float bWall = step(abs(bN.y), 0.5);
        float bU = dot(vFogWorldPos.xz, vec2(-bN.z, bN.x));
        vec2 bC = vec2(bU / 3.3, vFogWorldPos.y / 3.5);
        vec2 bF = fract(bC);
        float bWin = bWall * step(0.2, bF.x) * step(bF.x, 0.8) * step(0.3, bF.y) * step(bF.y, 0.82);
        float bRnd = bHash(vec3(floor(bC), floor(bN.x * 2.0 + bN.z * 4.0 + 0.5)));
        float bFar = smoothstep(500.0, 1900.0, length(vFogWorldPos - cameraPosition));
        diffuseColor.rgb *= mix(mix(1.0, 0.42 + 0.3 * bRnd, bWin), 0.82, bFar * bWall);
        float bLit = mix(step(0.62, bRnd) * bWin, 0.05 + 0.05 * bRnd, bFar) * bWall;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.70, 0.36) * bLit * uNight * 1.5;`);
  };
  mat.customProgramCacheKey = () => 'bldg';
  return mat;
}

function buildTerrain(hf) {
  const { n, H, D, ID, cell, half } = hf;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + i * cell, z = -half + j * cell, h = H[k];
    const hx = (H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)]) / (2 * cell);
    const hz = (H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i]) / (2 * cell);
    const l = 1 / Math.hypot(hx, 1, hz);
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    nor[k * 3] = -hx * l; nor[k * 3 + 1] = l; nor[k * 3 + 2] = -hz * l;
    if (h > -3) {
      const c = landColor(x, z, h, Math.hypot(hx, hz), ID[k], D[k]);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (Math.max(H[a], H[b], H[c], H[d]) < -2.5) continue;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, o), 1));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 }));
  mesh.frustumCulled = false;
  return mesh;
}

function buildCity(hf) {
  const items = [];
  const DT = ll(37.7915, -122.3985), OAK = ll(37.8044, -122.2712);
  const SF_COL = ['#f2efe6', '#e8e0d0', '#f4e9d8', '#dfe6ea', '#f0d9c8', '#e6d3b3', '#cfd8dc', '#f7f3ee', '#d9c7b8', '#e9c9b6', '#c9d6c2'];
  const TOWER_COL = ['#b9c6d0', '#d6dbde', '#9aa8b4', '#e8e4da', '#7f8f9c', '#cdbfa8', '#e2d8c6', '#dcd6ca', '#c4ccd2', '#a89c8c'];
  const MARIN_COL = ['#f1eee6', '#e3ddd0', '#cfc6b4', '#b8a88f', '#f6f3ec', '#d8d4cc'];
  const regions = [
    { x0: -8100, x1: 6000, z0: 1500, z1: 14100, cell: 46, rot: -0.15, kind: 'sf' },
    { x0: 8000, x1: 17900, z0: -17500, z1: 15000, cell: 95, rot: 0.3, kind: 'east' },
    { x0: 4000, x1: 5400, z0: -800, z1: 1300, cell: 60, rot: 0.1, kind: 'ti' },
    { x0: -6600, x1: -2000, z0: -6300, z1: -2300, cell: 44, rot: 0.4, kind: 'marin' },
  ];
  const col = new THREE.Color();
  for (const R of regions) {
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, cs = Math.cos(R.rot), sn = Math.sin(R.rot);
    const nx = Math.ceil((R.x1 - R.x0) / R.cell), nz = Math.ceil((R.z1 - R.z0) / R.cell);
    const ext = Math.ceil(Math.max(nx, nz) * 0.75);
    for (let iz = -ext; iz < ext; iz++) for (let ix = -ext; ix < ext; ix++) {
      const lx = ix * R.cell, lz = iz * R.cell;
      const x = cx + lx * cs - lz * sn, z = cz + lx * sn + lz * cs;
      if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) continue;
      const inf = hf.info(x, z);
      if (inf.id === 255 || !isUrban(x, z, inf.h, inf.id, inf.d) || inf.d < 45) continue;
      const h1 = hash2(ix * 7 + 3, iz * 13 + 1), h2 = hash2(ix * 3 + 11, iz * 5 + 7), h3 = hash2(ix + 101, iz + 57), h4 = hash2(ix * 17, iz * 19 + 5), h5 = hash2(ix * 23 + 9, iz * 29);
      if (h1 < (R.kind === 'marin' ? 0.5 : 0.1)) continue;
      let w = R.cell * (0.5 + 0.25 * h2), d = R.cell * (0.5 + 0.25 * h3), hgt = 7 + 10 * h3 * h3, tower = false;
      if (R.kind === 'sf') {
        const r = Math.hypot(x - DT[0], z - DT[1]);
        if (r < 1150 && h4 > 0.3) { hgt = 22 + 185 * Math.pow(1 - r / 1150, 1.3) * h5 + 22 * h3; tower = hgt > 45; }
        else if (h4 > 0.975) { hgt = 28 + 32 * h5; tower = true; }
      } else if (R.kind === 'east') {
        const r = Math.hypot(x - OAK[0], z - OAK[1]);
        hgt = 8 + 12 * h3;
        if (r < 900 && h4 > 0.35) { hgt = 25 + 100 * (1 - r / 900) * h5; tower = true; }
        else if (h4 > 0.985) { hgt = 30 + 50 * h5; tower = true; }
      } else if (R.kind === 'marin') { hgt = 5 + 3 * h3; w *= 0.5; d *= 0.5; }
      if (tower) { w = Math.min(w, 34); d = Math.min(d, 34); }
      col.set(tower ? TOWER_COL[(h1 * 97) % TOWER_COL.length | 0] : R.kind === 'marin' ? MARIN_COL[(h1 * 131) % MARIN_COL.length | 0] : SF_COL[(h1 * 131) % SF_COL.length | 0]);
      items.push([x, hf.heightAt(x, z), z, w, hgt, d, R.rot + (h2 > 0.5 ? Math.PI / 2 : 0), col.r, col.g, col.b]);
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, bldgMat(), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    p.set(it[0], it[1] - 3, it[2]); s.set(it[3], it[4] + 3, it[5]); q.setFromAxisAngle(up, -it[6]);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, col.setRGB(it[7], it[8], it[9]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function buildWorld(scene, hf) {
  const group = new THREE.Group();
  scene.add(group);
  group.add(buildTerrain(hf));
  group.add(buildCity(hf));

  const B = new Batch();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const light = (color) => { const m = new THREE.MeshBasicMaterial({ color }); m.userData.light = true; m.userData.base = new THREE.Color(color); return m; };
  const L = { warm: light(0xffb060), white: light(0xdfeaff), red: light(0xff2a18) };
  const orange = std(0xc0362c, { roughness: 0.6 }), road = std(0x2a2c2e, { roughness: 0.9 }), concrete = std(0xa9a69e), steel = std(0xb4b8bb, { roughness: 0.55, metalness: 0.3 });
  const white = std(0xf1efe8), cream = std(0xd9cdb2), brick = std(0x8a4b3a), rust = std(0x8b5a3c);
  const lineOrange = new THREE.LineBasicMaterial({ color: 0xa83228 }), lineGrey = new THREE.LineBasicMaterial({ color: 0x9a9ea2 }), lineWhite = new THREE.LineBasicMaterial({ color: 0xe8e8e4 });

  // ================= Golden Gate Bridge =================
  {
    const S = ll(37.8136, -122.4778), N = ll(37.8251, -122.4792);
    const { m: F, len } = frameOf(S, N);
    const deckY = 67, top = 227, side = 343, half = 13.7, app = 280;
    for (const tx of [0, len]) {
      for (const [y0, y1, wz, wx] of [[0, 67, 7.5, 11], [67, 125, 6.5, 9.5], [125, 170, 5.5, 8.5], [170, 203, 4.8, 7.5], [203, 227, 4.2, 6.5]])
        for (const sz of [-1, 1]) B.box(orange, F, wx, y1 - y0, wz, tx, (y0 + y1) / 2, sz * half);
      for (const [y, hh] of [[98, 8], [134, 7], [168, 6.5], [200, 6], [223.5, 7]]) B.box(orange, F, 5, hh, 2 * half, tx, y, 0);
      for (const sg of [-1, 1]) B.box(orange, F, 3, 54, 2.4, tx, 34, 0, sg * Math.atan2(2 * half, 46));
      B.box(orange, F, 4, 4, 2 * half, tx, 10, 0);
      B.box(concrete, F, 24, 16, 2 * half + 26, tx, 0, 0);
      for (const sz of [-1, 1]) B.ball(L.red, F, 1.6, tx, top + 2.5, sz * half);
    }
    B.box(orange, F, len + 2 * side + 2 * app, 7.6, 27.4, len / 2, deckY - 3.8, 0);
    B.box(road, F, len + 2 * side + 2 * app, 0.5, 19, len / 2, deckY + 0.2, 0);
    for (const x of [-side - 90, -side - 190, len + side + 80, len + side + 170]) B.box(concrete, F, 6, deckY, 22, x, deckY / 2 - 4, 0);
    B.box(brick, F, 70, 16, 50, -side - 5, 7, 0); // Fort Point
    for (const sz of [-1, 1]) {
      const z = sz * half;
      B.tube(orange, F, [...cable(-side, deckY + 3, 0, top, 9, 12, z), ...cable(0, top, len, top, top - deckY - 5, 48, z).slice(1), ...cable(len, top, len + side, deckY + 3, 9, 12, z).slice(1)], 0.7);
      for (let x = 15.2; x < len; x += 15.2) B.line(lineOrange, F, [x, cableY(0, top, len, top, top - deckY - 5, x), z], [x, deckY, z]);
      for (let x = -side + 15; x < 0; x += 15.2) B.line(lineOrange, F, [x, cableY(-side, deckY + 3, 0, top, 9, x), z], [x, deckY, z]);
      for (let x = len + 15; x < len + side; x += 15.2) B.line(lineOrange, F, [x, cableY(len, top, len + side, deckY + 3, 9, x), z], [x, deckY, z]);
      for (let x = -side - app + 20; x < len + side + app; x += 46) B.ball(L.warm, F, 0.9, x, deckY + 8, sz * 11.5);
    }
  }

  // ================= Bay Bridge: western suspension spans =================
  {
    const { m: F, len } = frameOf(ll(37.7880, -122.3880), ll(37.8085, -122.3665));
    const f = len / 2824, T = [354, 1058, 1766, 2470].map((v) => v * f), Cx = 1412 * f;
    const deckY = 58, top = 158, half = 11;
    for (const tx of T) {
      for (const sz of [-1, 1]) B.box(steel, F, 5, top, 4.5, tx, top / 2, sz * half);
      for (let y = deckY + 14; y < top; y += 24) {
        B.box(steel, F, 3.5, 3, 2 * half, tx, y, 0);
        if (y + 24 < top + 10) for (const sg of [-1, 1]) B.box(steel, F, 2, 30, 1.6, tx, y + 12, 0, sg * Math.atan2(2 * half, 22));
      }
      B.box(steel, F, 4, 4, 2 * half, tx, top - 2, 0);
      B.box(concrete, F, 16, 22, 2 * half + 18, tx, 4, 0);
      B.ball(L.red, F, 1.5, tx, top + 3, 0);
    }
    B.box(concrete, F, 24, 104, 32, Cx, 46, 0);
    B.box(steel, F, len + 60, 9, 21, len / 2, deckY - 4.5, 0);
    B.box(road, F, len + 60, 0.5, 18, len / 2, deckY + 0.2, 0);
    const spans = [[0, deckY + 4, T[0], top, 8], [T[0], top, T[1], top, top - deckY - 9], [T[1], top, Cx, 99, 8], [Cx, 99, T[2], top, 8], [T[2], top, T[3], top, top - deckY - 9], [T[3], top, len, deckY + 4, 8]];
    for (const sz of [-1, 1]) {
      const z = sz * half; let pts = [];
      for (const [x0, y0, x1, y1, sag] of spans) {
        const c = cable(x0, y0, x1, y1, sag, 24, z); pts = pts.concat(pts.length ? c.slice(1) : c);
        for (let x = x0 + 18; x < x1 - 4; x += 18) {
          const y = cableY(x0, y0, x1, y1, sag, x);
          if (y > deckY + 2) { B.line(lineGrey, F, [x, y, z], [x, deckY, z]); if (sz < 0) for (let yy = deckY + 8; yy < y; yy += 14) B.ball(L.white, F, 0.55, x, yy, z); }
        }
      }
      B.tube(steel, F, pts, 0.55);
      for (let x = 10; x < len; x += 50) B.ball(L.warm, F, 0.85, x, deckY + 7, sz * 9.5);
    }
  }
  // ================= Bay Bridge: eastern span (single tower + skyway) =================
  {
    const { m: F, len } = frameOf(ll(37.8135, -122.3598), ll(37.8225, -122.3205));
    const tx = 420, top = 160, hi = 52, lo = 14, flat = 900;
    B.box(white, F, 9, top, 9, tx, top / 2, 0);
    B.ball(L.red, F, 1.5, tx, top + 3, 0);
    B.box(white, F, flat + 40, 5, 50, flat / 2 - 20, hi - 2.5, 0);
    const sl = Math.hypot(len - flat, hi - lo);
    B.box(white, F, sl + 10, 5, 50, (flat + len) / 2, (hi + lo) / 2 - 2.5, 0, 0, 0, Math.atan2(lo - hi, len - flat));
    const yAt = (x) => (x < flat ? hi : hi + ((lo - hi) * (x - flat)) / (len - flat));
    for (let x = 60; x < len - 40; x += 150) if (Math.abs(x - tx) > 60) B.box(concrete, F, 8, yAt(x), 30, x, yAt(x) / 2 - 3, 0);
    for (const sz of [-1, 1]) {
      for (let x = tx - 180; x <= tx + 385; x += 13) if (Math.abs(x - tx) > 22) B.line(lineWhite, F, [tx, top - 4, sz * 3], [x, hi, sz * 25]);
      for (let x = 20; x < len; x += 55) B.ball(L.warm, F, 0.85, x, yAt(x) + 8, sz * 22);
    }
  }

  // ================= Alcatraz =================
  {
    const at = (la, lo) => { const [x, z] = ll(la, lo); return [x, hf.heightAt(x, z), z]; };
    const rot = Math.atan2(-311, 413);
    let p = at(37.8267, -122.4230); B.box(cream, null, 120, 16, 36, p[0], p[1] + 5, p[2], 0, rot, 0);
    B.box(std(0x6b6f72), null, 122, 1.5, 38, p[0], p[1] + 13.5, p[2], 0, rot, 0);
    p = at(37.8259, -122.4219); B.cyl(white, null, 1.7, 2.6, 28, p[0], p[1] + 13, p[2]);
    L.lighthouse = light(0xfff3c8); B.ball(L.lighthouse, null, 2.0, p[0], p[1] + 28.5, p[2]);
    p = at(37.8279, -122.4246); B.cyl(rust, null, 4.5, 4.5, 8, p[0], p[1] + 22, p[2]);
    for (const [ax, az] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) B.cyl(rust, null, 0.35, 0.35, 20, p[0] + ax, p[1] + 9, p[2] + az, 6);
    p = at(37.8262, -122.4213); B.box(cream, null, 70, 15, 16, p[0], p[1] + 5, p[2], 0, rot, 0);
    p = at(37.8275, -122.4252); B.box(std(0xb9b2a0), null, 40, 12, 22, p[0], p[1] + 4, p[2], 0, rot + 0.4, 0);
    B.cyl(std(0x9a8f80), null, 1.5, 2.2, 30, p[0] + 18, p[1] + 14, p[2] + 6);
  }

  // ================= San Francisco landmarks =================
  {
    const at = (la, lo) => { const [x, z] = ll(la, lo); return [x, hf.heightAt(x, z), z]; };
    const glass = bldgMat({ color: 0x9db4c8, roughness: 0.3, metalness: 0.5 }), stone = bldgMat({ color: 0xe6e1d5 }), brown = bldgMat({ color: 0x6b4a3a }), dark = bldgMat({ color: 0x4d5d6c, roughness: 0.4, metalness: 0.4 });
    let p = at(37.7952, -122.4028);
    B.add(stone, new THREE.ConeGeometry(37, 260, 4), p[0], p[1] + 130, p[2], 0, Math.PI / 4 - 0.15, 0);
    p = at(37.7897, -122.3972); B.cyl(glass, null, 13, 25, 326, p[0], p[1] + 163, p[2], 20);
    p = at(37.7921, -122.4038); B.box(brown, null, 36, 237, 62, p[0], p[1] + 118, p[2], 0, 0.15, 0);
    p = at(37.7905, -122.3962); B.box(dark, null, 30, 245, 30, p[0], p[1] + 122, p[2], 0, 0.15, 0);
    p = at(37.7907, -122.3945); B.box(glass, null, 32, 197, 40, p[0], p[1] + 98, p[2], 0, 0.15, 0);
    p = at(37.7880, -122.3925); B.box(stone, null, 28, 184, 34, p[0], p[1] + 92, p[2], 0, 0.15, 0);
    p = at(37.7935, -122.3975); B.box(dark, null, 44, 172, 44, p[0], p[1] + 86, p[2], 0, 0.15, 0);
    // Coit Tower
    p = at(37.8024, -122.4058); B.cyl(white, null, 5.2, 6, 64, p[0], p[1] + 30, p[2], 16); B.cyl(white, null, 4.2, 4.2, 6, p[0], p[1] + 64, p[2], 16);
    // Ferry Building
    p = at(37.7955, -122.3937); B.box(white, null, 9, 75, 9, p[0], p[1] + 36, p[2], 0, 0.6, 0); B.box(std(0xcfc8b8), null, 200, 16, 46, p[0], p[1] + 7, p[2], 0, 0.6 + Math.PI / 2, 0);
    B.ball(L.white, null, 1.6, p[0], p[1] + 76, p[2]);
    // Palace of Fine Arts
    p = at(37.8029, -122.4484); B.cyl(std(0xc9a27a), null, 19, 19, 26, p[0], p[1] + 13, p[2], 16);
    B.add(std(0xb86b3a), new THREE.SphereGeometry(19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), p[0], p[1] + 26, p[2]);
    // Sutro Tower
    p = at(37.7552, -122.4528);
    const stw = std(0xd9d2c8, { roughness: 0.6 }), str = std(0xc23b2a);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, bx = Math.cos(a) * 22, bz = Math.sin(a) * 22, tx = Math.cos(a) * 7, tz = Math.sin(a) * 7;
      const hh = 230, len = Math.hypot(hh, 15);
      B.box(k % 2 ? stw : str, null, 3, len, 3, p[0] + (bx + tx) / 2, p[1] + hh / 2, p[2] + (bz + tz) / 2, Math.atan2(15, hh) * Math.sin(a) * -1, 0, Math.atan2(15, hh) * Math.cos(a));
      B.cyl(k % 2 ? str : stw, null, 0.8, 1.2, 68, p[0] + tx, p[1] + hh + 34, p[2] + tz, 6);
      B.ball(L.red, null, 1.6, p[0] + tx, p[1] + hh + 69, p[2] + tz);
    }
    for (const [y, r] of [[80, 20], [160, 13], [228, 9]]) B.cyl(stw, null, r, r, 4, p[0], p[1] + y, p[2], 3);
    // Embarcadero piers
    const P = LAND[0], shed = std(0xe7e2d6), deck = std(0x6f6a62);
    for (let i = 11; i < 17; i++) {
      const ax = P.X[i], az = P.Z[i], bx = P.X[i + 1], bz = P.Z[i + 1], sl = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / sl, dz = (bz - az) / sl;
      let nx = dz, nz = -dx;
      if (hf.info(ax + dx * sl * 0.5 + nx * 150, az + dz * sl * 0.5 + nz * 150).d > 0) { nx = -nx; nz = -nz; }
      for (let s = 60; s < sl - 40; s += 175) {
        const px = ax + dx * s, pz = az + dz * s;
        const { m } = frameOf([px - nx * 20, pz - nz * 20], [px + nx * 100, pz + nz * 100]);
        B.box(deck, m, 210, 5, 38, 105, 1.2, 0);
        B.box(shed, m, 170, 9, 28, 100, 8, 0);
        B.box(std(0x7c8388), m, 172, 1.2, 30, 100, 13, 0);
        B.ball(L.warm, m, 0.9, 205, 6, 0);
      }
    }
    // Point Bonita light
    p = at(37.8160, -122.5290); B.cyl(white, null, 1.6, 2, 12, p[0], p[1] + 6, p[2]);
    L.bonita = light(0xfff3c8); B.ball(L.bonita, null, 1.6, p[0], p[1] + 13, p[2]);
  }

  B.build(group);

  return {
    group,
    update(time, night) {
      const k = night * 4.5;
      for (const key of ['warm', 'white', 'red']) {
        const m = L[key];
        m.color.copy(m.userData.base).multiplyScalar(key === 'red' ? 0.6 + k * (0.6 + 0.4 * Math.sin(time * 2.2)) : k);
        if (m.userData.mesh && key !== 'red') m.userData.mesh.visible = night > 0.03;
      }
      const flash = (period, off) => (((time + off) % period) < 0.7 ? 1 : 0.04);
      L.lighthouse.color.copy(L.lighthouse.userData.base).multiplyScalar((0.3 + night * 9) * flash(5, 0));
      L.bonita.color.copy(L.bonita.userData.base).multiplyScalar((0.3 + night * 9) * flash(4, 1.7));
    },
  };
}
