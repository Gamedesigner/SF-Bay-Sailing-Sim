// Procedural sailboats: lofted hull, deck, cabin, keel, rudder, rig and animated sails.
// Boat-local axes: -Z forward, +X starboard, +Y up, y = 0 at the waterline.
import * as THREE from 'three';

export const BOATS = [
  {
    id: 'catalina27', name: 'Catalina 27', tag: 'Classic cruiser-racer · steady and forgiving',
    loa: 8.2, lwl: 6.6, beam: 2.7, draft: 1.3, disp: 3100, sa: 31.6,
    canoe: 0.5, fbBow: 1.05, fbStern: 0.85, transom: 0.72, rakeBow: 0.75, rakeStern: 0.35, maxBeamAt: 0.56,
    mastT: 0.37, mastH: 10.3, boomH: 0.85, boomL: 3.2, frac: 0.98, jibFoot: 4.2,
    cabin: [0.24, 0.63, 0.46, 0.62], cockpit: [0.66, 0.94],
    keel: { root: 1.5, tip: 1.0, t: 0.5, sweep: 0.35 }, rudder: { hung: false, t: 0.9, span: 1.0, chord: 0.45 },
    colors: { hull: '#f3f0e6', boot: '#1f4e8c', bottom: '#1b3a5c', deck: '#ebe6d8', cabin: '#f1ede1', stripe: '#1f4e8c', sail: '#f7f4ec', crew: '#c8402f' },
    wet: 17, latArea: 1.7, keelSlope: 3.2, ceH: 5.0, gm: 1.0, kxx: 1.12, cw: 0.034, cwExp: 7.5, turn: 0.105, weather: 0.10, sailNo: 'C27',
  },
  {
    id: 'j24', name: 'J/24', tag: 'One-design racer · light, quick and twitchy',
    loa: 7.32, lwl: 6.1, beam: 2.71, draft: 1.22, disp: 1750, sa: 24.2,
    canoe: 0.38, fbBow: 0.86, fbStern: 0.62, transom: 0.7, rakeBow: 0.7, rakeStern: 0.3, maxBeamAt: 0.58,
    mastT: 0.38, mastH: 9.0, boomH: 0.7, boomL: 2.95, frac: 0.85, jibFoot: 3.6,
    cabin: [0.27, 0.56, 0.3, 0.58], cockpit: [0.6, 0.95],
    keel: { root: 1.25, tip: 0.85, t: 0.5, sweep: 0.4 }, rudder: { hung: true, span: 1.25, chord: 0.38 },
    colors: { hull: '#fafafa', boot: '#c62828', bottom: '#263238', deck: '#eceff1', cabin: '#f5f5f5', stripe: '#c62828', sail: '#fbfbf8', crew: '#f2b632' },
    wet: 13, latArea: 1.35, keelSlope: 3.4, ceH: 4.4, gm: 1.15, kxx: 1.0, cw: 0.036, cwExp: 5.2, turn: 0.135, weather: 0.13, sailNo: 'J24',
  },
  {
    id: 'folkboat', name: 'Nordic Folkboat', tag: 'Varnished Bay classic · full keel, tracks like a train',
    loa: 7.68, lwl: 6.0, beam: 2.2, draft: 1.2, disp: 1930, sa: 24,
    canoe: 0.55, fbBow: 0.8, fbStern: 0.6, transom: 0.5, rakeBow: 1.0, rakeStern: 0.5, maxBeamAt: 0.52,
    mastT: 0.34, mastH: 9.4, boomH: 0.65, boomL: 3.6, frac: 0.78, jibFoot: 2.7,
    cabin: [0.3, 0.58, 0.34, 0.6], cockpit: [0.62, 0.92],
    keel: { root: 3.4, tip: 2.0, t: 0.55, sweep: 0.9, full: true }, rudder: { hung: true, span: 1.3, chord: 0.42 },
    colors: { hull: '#8a4a22', boot: '#f5f0e0', bottom: '#2e5d3a', deck: '#d9c7a0', cabin: '#a8672f', stripe: '#f5f0e0', sail: '#f3ead6', crew: '#2f6fb0' },
    wet: 16, latArea: 2.6, keelSlope: 2.2, ceH: 4.2, gm: 1.05, kxx: 0.95, cw: 0.036, cwExp: 8, turn: 0.10, weather: 0.09, sailNo: 'F 76',
  },
  {
    id: 'pacific40', name: 'Pacific 40', tag: 'Performance cruiser · powerful and fast in a breeze',
    loa: 12.2, lwl: 10.7, beam: 3.85, draft: 2.1, disp: 8200, sa: 82,
    canoe: 0.62, fbBow: 1.35, fbStern: 1.1, transom: 0.82, rakeBow: 0.6, rakeStern: 0.2, maxBeamAt: 0.6,
    mastT: 0.4, mastH: 16.8, boomH: 1.0, boomL: 5.2, frac: 0.93, jibFoot: 6.0,
    cabin: [0.26, 0.62, 0.42, 0.6], cockpit: [0.66, 0.96],
    keel: { root: 2.2, tip: 1.5, t: 0.5, sweep: 0.5, bulb: true }, rudder: { hung: false, t: 0.9, span: 1.7, chord: 0.6 }, wheel: true,
    colors: { hull: '#15233a', boot: '#e8e8e8', bottom: '#5a1a1a', deck: '#e9e7e0', cabin: '#efede6', stripe: '#c9a24a', sail: '#f4f3ee', crew: '#e8e8e8' },
    wet: 32, latArea: 3.3, keelSlope: 3.4, ceH: 7.6, gm: 1.35, kxx: 1.5, cw: 0.03, cwExp: 7, turn: 0.09, weather: 0.08, sailNo: 'P40',
  },
];

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function geo(pos, idx, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paintTexture(S, yMin, yMax) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const x = c.getContext('2d');
  for (let py = 0; py < 512; py++) {
    const y = yMin + (1 - py / 511) * (yMax - yMin);
    x.fillStyle = y < 0.03 ? S.colors.bottom : y < 0.11 ? S.colors.boot : S.colors.hull;
    x.fillRect(0, py, 4, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sailTexture(S, main) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = S.colors.sail; x.fillRect(0, 0, 256, 512);
  x.strokeStyle = 'rgba(60,60,50,0.13)'; x.lineWidth = 1.5;
  for (let y = 30; y < 512; y += 46) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y - 14); x.stroke(); }
  if (main) {
    x.fillStyle = S.colors.stripe === '#f5f0e0' ? '#b03024' : S.colors.stripe;
    x.font = 'bold 30px Helvetica, Arial, sans-serif';
    x.fillText(S.sailNo, 14, 250);
    x.fillStyle = 'rgba(30,30,30,0.75)'; x.font = 'bold 24px Helvetica, Arial, sans-serif';
    x.fillText('US ' + (1000 + ((S.loa * 977) | 0) % 8000), 14, 300);
    // batten pockets
    x.strokeStyle = 'rgba(60,60,50,0.25)'; x.lineWidth = 3;
    for (const y of [120, 215, 330, 430]) { x.beginPath(); x.moveTo(256, y); x.lineTo(150, y + 6); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// lofted foil (keel / rudder): root at y=0, tip at y=-span, leading edge toward -Z
function foil(rootC, tipC, span, thick, sweep, n = 12) {
  const pos = [], idx = [];
  for (const [c, y, zo] of [[rootC, 0, 0], [tipC, -span, sweep]]) {
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2;
      pos.push(Math.sin(ang) * c * thick * 0.5 * (1 + 0.35 * Math.cos(ang)), y, zo - Math.cos(ang) * c * 0.5);
    }
  }
  for (let a = 0; a < n; a++) { const b = (a + 1) % n; idx.push(a, b, n + a, b, n + b, n + a); }
  pos.push(0, -span, sweep); const ci = 2 * n;
  for (let a = 0; a < n; a++) idx.push(ci, n + a, n + ((a + 1) % n));
  return geo(pos, idx);
}

export function buildBoat(spec, opts = {}) {
  const S = spec, C = S.colors, L = S.loa, hb = S.beam / 2;
  const g = new THREE.Group();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  const plan = (t) => t < S.maxBeamAt
    ? Math.pow(Math.sin((0.5 * Math.PI * t) / S.maxBeamAt), 0.85)
    : 1 - (1 - S.transom) * Math.pow((t - S.maxBeamAt) / (1 - S.maxBeamAt), 2.2);
  const sheer = (t) => S.fbBow + (S.fbStern - S.fbBow) * t - 0.08 * Math.sin(Math.PI * t);
  const bottom = (t) => { const q = (t - 0.5) / 0.5, a = Math.abs(q); return -S.canoe * (1 - Math.pow(a, 2.4)) + (q < 0 ? 0.28 : 0.12) * Math.pow(a, 5); };
  const zAt = (t) => -L / 2 + t * L;
  const zSheer = (t) => zAt(t) - S.rakeBow * Math.pow(1 - t, 5) + S.rakeStern * Math.pow(t, 8);
  const bd = (t) => Math.max(hb * plan(t), 0.004);

  // ---------- hull ----------
  const NS = 30, NP = 12, ring = 2 * NP + 1;
  const yMin = -S.canoe - 0.03, yMax = S.fbBow + 0.03;
  const section = (t, u, sgn) => {
    const b = bd(t), f = sheer(t), yb = bottom(t), ex = 0.62 + 0.9 * Math.pow(1 - t, 3), th = u * Math.PI * 0.5;
    const x = sgn * b * Math.pow(Math.sin(th), ex), y = yb + (f - yb) * (1 - Math.pow(Math.cos(th), 1.7)), yf = (y - yb) / (f - yb);
    return [x, y, zAt(t) - S.rakeBow * yf * Math.pow(1 - t, 5) + S.rakeStern * yf * Math.pow(t, 8)];
  };
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      for (let k = 0; k < ring; k++) {
        const p = section(t, Math.abs(k - NP) / NP, k < NP ? -1 : k > NP ? 1 : 0);
        pos.push(...p); uv.push(t, (p[1] - yMin) / (yMax - yMin));
      }
    }
    for (let i = 0; i < NS; i++) for (let k = 0; k < ring - 1; k++) {
      const A = i * ring + k, B = (i + 1) * ring + k, Cc = B + 1, D = A + 1;
      idx.push(A, D, B, D, Cc, B);
    }
    // transom
    const last = NS * ring, ci = pos.length / 3;
    pos.push(0, (sheer(1) + bottom(1)) / 2, zAt(1) + S.rakeStern * 0.5); uv.push(1, ((sheer(1) + bottom(1)) / 2 - yMin) / (yMax - yMin));
    for (let k = 0; k < ring - 1; k++) idx.push(ci, last + k, last + k + 1);
    const hullMat = new THREE.MeshPhysicalMaterial({ map: paintTexture(S, yMin, yMax), roughness: 0.33, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    g.add(shadow(new THREE.Mesh(geo(pos, idx, uv), hullMat)));
  }
  // cove stripe
  {
    const pos = [], idx = [];
    for (const sgn of [-1, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= NS; i++) {
        const t = 0.02 + (i / NS) * 0.96;
        for (const u of [0.915, 0.955]) { const p = section(t, u, sgn); pos.push(p[0] + sgn * 0.006, p[1], p[2]); }
      }
      for (let i = 0; i < NS; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    g.add(new THREE.Mesh(geo(pos, idx), std(C.stripe, { side: THREE.DoubleSide, roughness: 0.4 })));
  }
  // deck
  const deckMat = std(C.deck, { roughness: 0.85 });
  {
    const pos = [], idx = [], M = 5;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, b = bd(t), f = sheer(t), z = zSheer(t);
      for (let m = 0; m < M; m++) { const fr = (m / (M - 1)) * 2 - 1; pos.push(fr * b, f + 0.035 * (1 - fr * fr), z); }
    }
    for (let i = 0; i < NS; i++) for (let m = 0; m < M - 1; m++) {
      const A = i * M + m, B = (i + 1) * M + m, Cc = B + 1, D = A + 1;
      idx.push(A, B, D, B, Cc, D);
    }
    g.add(shadow(new THREE.Mesh(geo(pos, idx), deckMat)));
  }
  const deckY = (t) => sheer(t) + 0.035;

  // ---------- cabin ----------
  const [ct0, ct1, cH, cW] = S.cabin;
  const cabinH = (tc) => cH * (0.3 + 0.7 * sm(0, 0.25, tc)) * (1 - 0.18 * sm(0.8, 1, tc));
  {
    const pos = [], idx = [], NC = 10, R = 7;
    for (let i = 0; i <= NC; i++) {
      const tc = i / NC, t = ct0 + (ct1 - ct0) * tc, w = cW * bd(t), yb = sheer(t) - 0.02, h = cabinH(tc), z = zAt(t);
      pos.push(-w, yb, z, -w * 0.9, yb + h * 0.82, z, -w * 0.55, yb + h, z, 0, yb + h + 0.05, z, w * 0.55, yb + h, z, w * 0.9, yb + h * 0.82, z, w, yb, z);
    }
    for (let i = 0; i < NC; i++) for (let k = 0; k < R - 1; k++) {
      const A = i * R + k, B = (i + 1) * R + k, Cc = B + 1, D = A + 1;
      idx.push(A, B, D, B, Cc, D);
    }
    for (let k = 1; k < R - 1; k++) { idx.push(0, k, k + 1); const o = NC * R; idx.push(o, o + k + 1, o + k); }
    g.add(shadow(new THREE.Mesh(geo(pos, idx), std(C.cabin, { roughness: 0.7 }))));
    // windows
    const winMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.15, metalness: 0.4, emissive: 0xffc98a, emissiveIntensity: 0 });
    g.userData.winMat = winMat;
    for (const tc of [0.38, 0.68]) for (const sgn of [-1, 1]) {
      const t = ct0 + (ct1 - ct0) * tc, w = cW * bd(t), len = (ct1 - ct0) * L * 0.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, cabinH(tc) * 0.3, len), winMat);
      m.position.set(sgn * w * 0.955, sheer(t) + cabinH(tc) * 0.47, zAt(t));
      m.rotation.z = sgn * 0.12;
      g.add(m);
    }
  }
  // ---------- cockpit ----------
  {
    const [k0, k1] = S.cockpit, tm = (k0 + k1) / 2, len = (k1 - k0) * L, w = bd(tm) * 0.5;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.04, len), std('#8d8a80', { roughness: 0.9 }));
    sole.position.set(0, deckY(tm) + 0.005, zAt(tm)); sole.receiveShadow = true; g.add(sole);
    for (const sgn of [-1, 1]) {
      const cm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, len), std(C.cabin, { roughness: 0.7 })));
      cm.position.set(sgn * (w + 0.1), deckY(tm) + 0.08, zAt(tm)); g.add(cm);
    }
  }
  // ---------- keel & rudder ----------
  const under = std(C.bottom, { roughness: 0.6, side: THREE.DoubleSide });
  {
    const K = S.keel, yb = bottom(K.t), span = S.draft + yb + 0.08;
    const km = new THREE.Mesh(foil(K.root, K.tip, span, K.full ? 0.07 : 0.13, K.sweep), under);
    km.position.set(0, yb + 0.08, zAt(K.t) - (K.full ? 0.1 : 0)); g.add(km);
    if (K.bulb) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), under);
      b.scale.set(1, 0.9, 5); b.position.set(0, -S.draft + 0.15, zAt(K.t) + K.sweep); g.add(b);
    }
  }
  const rudderPivot = new THREE.Group();
  {
    const Rr = S.rudder;
    const zR = Rr.hung ? zSheer(1) + (S.keel.full ? 0 : 0.06) : zAt(Rr.t);
    const yTop = Rr.hung ? 0.3 : bottom(Rr.t) + 0.05;
    rudderPivot.position.set(0, yTop, zR);
    const rm = new THREE.Mesh(foil(Rr.chord, Rr.chord * 0.7, Rr.span, 0.11, 0.08), under);
    rm.position.z = Rr.chord * 0.4; rudderPivot.add(rm);
    if (S.wheel) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 8, 28), std('#c9ccd0', { metalness: 0.9, roughness: 0.3 }));
      wheel.position.set(0, deckY(0.86) + 0.85, zAt(0.86));
      g.add(wheel); g.userData.wheel = wheel;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.85, 10), std('#e9e7e0'));
      ped.position.set(0, deckY(0.86) + 0.42, zAt(0.86) + 0.08); g.add(ped);
    } else {
      const tl = 1.25, ty = (Rr.hung ? S.fbStern + 0.22 : deckY(Rr.t) + 0.32) - yTop;
      if (!Rr.hung) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ty, 6), std('#888')); post.position.y = ty / 2; rudderPivot.add(post); }
      else { const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, ty + 0.05, 0.22), std(S.keel.full ? '#7a4a25' : '#ddd')); head.position.set(0, ty / 2, 0.08); rudderPivot.add(head); }
      const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, tl), std('#9a6a3a', { roughness: 0.5 }));
      tiller.position.set(0, ty, -tl / 2); tiller.rotation.x = -0.08; rudderPivot.add(tiller);
    }
    g.add(rudderPivot);
  }

  // ---------- rig ----------
  const zM = zAt(S.mastT);
  const tcM = (S.mastT - ct0) / (ct1 - ct0);
  const yMast = sheer(S.mastT) + (tcM > 0 && tcM < 1 ? cabinH(tcM) + 0.03 : 0.04);
  const yHead = yMast + S.mastH, yG = yMast + S.boomH;
  const alu = std('#c9cdd2', { metalness: 0.85, roughness: 0.35 });
  const wood = std('#b07a3f', { roughness: 0.45 });
  const sparMat = S.id === 'folkboat' ? wood : alu;
  const mast = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045 * (L / 8), 0.075 * (L / 8), S.mastH, 10), sparMat));
  mast.position.set(0, yMast + S.mastH / 2, zM); g.add(mast);
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, yG, zM + 0.08); g.add(boomPivot);
  const boom = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05 * (L / 8), 0.05 * (L / 8), S.boomL, 8), sparMat));
  boom.rotation.x = Math.PI / 2; boom.position.z = S.boomL / 2; boomPivot.add(boom);
  const ySpr = yMast + S.mastH * 0.52, sprW = hb * 0.72;
  const spr = new THREE.Mesh(new THREE.BoxGeometry(sprW * 2, 0.03, 0.08), sparMat); spr.position.set(0, ySpr, zM); g.add(spr);

  const stem = [0, sheer(0) + 0.06, zSheer(0) + 0.05];
  const hound = [0, yMast + S.mastH * S.frac, zM - 0.06];
  const lines = [];
  const seg = (a, b) => lines.push(...a, ...b);
  seg(stem, hound);
  seg([0, yHead, zM + 0.05], [0, sheer(1) + 0.05, zSheer(1) - 0.05]);
  for (const sgn of [-1, 1]) {
    const chain = [sgn * bd(S.mastT) * 0.92, deckY(S.mastT), zM + 0.1], tip = [sgn * sprW, ySpr, zM];
    seg(hound, tip); seg(tip, chain); seg([0, ySpr - 0.1, zM], [chain[0], chain[1], chain[2] - 0.35]);
    if (!opts.simple) {
      // lifelines, stanchions, pulpit
      let prev = null;
      for (let i = 0; i <= 8; i++) {
        const t = 0.06 + (i / 8) * 0.9, x = sgn * (bd(t) - 0.05), y = sheer(t), z = zSheer(t);
        const top = [x, y + 0.58, z], mid = [x, y + 0.3, z];
        seg([x, y, z], top);
        if (prev) { seg(prev[0], top); seg(prev[1], mid); }
        prev = [top, mid];
      }
      seg(prev[0], [0, sheer(0.96) + 0.58, zSheer(0.99)]);
      seg([sgn * (bd(0.06) - 0.05), sheer(0.06) + 0.58, zSheer(0.06)], [0, sheer(0) + 0.62, zSheer(0) + 0.1]);
    }
  }
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: 0x55595e })));

  // windex
  const windex = new THREE.Group(); windex.position.set(0, yHead + 0.25, zM);
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.5), std('#d22'));
  arrow.position.z = 0.1; windex.add(arrow);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.14, 0.2), std('#d22')); vane.position.z = 0.3; windex.add(vane);
  g.add(windex);

  // ---------- sails ----------
  const P = S.mastH - S.boomH - 0.25, E = S.boomL * 0.97;
  const sailMat = (main) => new THREE.MeshStandardMaterial({ map: sailTexture(S, main), side: THREE.DoubleSide, roughness: 0.8, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0 });
  const NU = 10, NV = 16;
  const mkSail = (mat) => {
    const n = (NU + 1) * (NV + 1), pos = new Float32Array(n * 3), uv = [], idx = [];
    for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) uv.push(u / NU, v / NV);
    for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) { const a = v * (NU + 1) + u, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    gg.setIndex(idx);
    const m = new THREE.Mesh(gg, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    return m;
  };
  const mainMat = sailMat(true), jibMat = sailMat(false);
  const mainSail = mkSail(mainMat); mainSail.position.set(0, yG + 0.08, zM + 0.08); g.add(mainSail);
  const jib = mkSail(jibMat); g.add(jib);
  const tack = [0, stem[1] + 0.25, stem[2] + 0.25];
  const head = [stem[0] + (hound[0] - stem[0]) * 0.95, stem[1] + (hound[1] - stem[1]) * 0.95, stem[2] + (hound[2] - stem[2]) * 0.95];
  const clewY = deckY(0.5) + 0.75;

  // running rigging (dynamic)
  const runPos = new Float32Array(4 * 3);
  const runGeo = new THREE.BufferGeometry(); runGeo.setAttribute('position', new THREE.BufferAttribute(runPos, 3));
  const runLines = new THREE.LineSegments(runGeo, new THREE.LineBasicMaterial({ color: 0xe9e2cf })); runLines.frustumCulled = false; g.add(runLines);
  const sheetT = (S.cockpit[0] + S.cockpit[1]) / 2;

  // ---------- crew ----------
  const crew = new THREE.Group();
  {
    const jacket = std(C.crew, { roughness: 0.8 }), skin = std('#d9a47a', { roughness: 0.8 }), dark = std('#27313b', { roughness: 0.9 });
    const torso = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.38, 4, 10), jacket)); torso.position.y = 0.48; crew.add(torso);
    const hd = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), skin)); hd.position.y = 0.95; crew.add(hd);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.y = 0.97; crew.add(cap);
    const legs = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.5), dark)); legs.position.set(0, 0.16, -0.2); crew.add(legs);
    g.add(crew);
  }
  const crewT = S.cockpit[0] + (S.cockpit[1] - S.cockpit[0]) * 0.6;

  // ---------- nav lights ----------
  const navMats = [];
  const nav = (color, x, y, z) => {
    const m = new THREE.MeshBasicMaterial({ color }); m.userData.base = new THREE.Color(color); navMats.push(m);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m); s.position.set(x, y, z); g.add(s);
  };
  nav(0xff2a1a, -0.12, sheer(0.02) + 0.5, zSheer(0.02)); nav(0x1aff4a, 0.12, sheer(0.02) + 0.5, zSheer(0.02));
  nav(0xffffff, 0, sheer(1) + 0.5, zSheer(1)); nav(0xffffff, 0, yHead + 0.1, zM);

  g.rotation.order = 'YXZ';

  let crewX = 0;
  function update(st) {
    const bs = st.boom * st.side;
    const wind = Math.min(1, st.aws / 2.5);
    const fill = sm(0.02, 0.15, st.alpha) * wind;
    const luff = (1 - sm(0.0, 0.12, st.alpha)) * Math.min(1.5, st.aws / 6);
    const t = st.time;
    // main
    {
      const pos = mainSail.geometry.attributes.position.array;
      const twist = 0.10 + 0.22 * (st.boom / 1.5);
      let o = 0;
      for (let v = 0; v <= NV; v++) {
        const vv = v / NV;
        const chord = E * (Math.pow(1 - vv, 0.92) * 0.96 + 0.04) + E * 0.15 * Math.sin(Math.PI * vv) * (1 - vv * 0.4);
        const bv = bs + st.side * twist * vv * fill;
        const cx = -Math.sin(bv), cz = Math.cos(bv);
        const vshape = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, vv * 1.15 + 0.08));
        for (let u = 0; u <= NU; u++) {
          const uu = u / NU, s = uu * chord;
          const w = st.side * 0.115 * fill * chord * Math.sin(Math.PI * Math.pow(uu, 0.8)) * vshape
            + luff * 0.05 * chord * Math.sin(uu * 9 - t * 21 + vv * 7) * uu * (0.3 + vv)
            + (1 - wind) * 0.02 * Math.sin(t * 1.3 + vv * 3) * uu;
          pos[o++] = cx * s - cz * w; pos[o++] = vv * P; pos[o++] = cz * s + cx * w;
        }
      }
      mainSail.geometry.attributes.position.needsUpdate = true;
      mainSail.geometry.computeVertexNormals();
    }
    // jib
    const bj = Math.min(1.25, Math.abs(bs) * 0.85 + 0.15) * st.side;
    const clew = [tack[0] - Math.sin(bj) * S.jibFoot, clewY, tack[2] + Math.cos(bj) * S.jibFoot];
    {
      const pos = jib.geometry.attributes.position.array;
      let o = 0;
      for (let v = 0; v <= NV; v++) {
        const vv = v / NV;
        const lx = tack[0] + (head[0] - tack[0]) * vv, ly = tack[1] + (head[1] - tack[1]) * vv, lz = tack[2] + (head[2] - tack[2]) * vv;
        const hollow = 1 - 0.07 * Math.sin(Math.PI * vv);
        const ex = (clew[0] + (head[0] - clew[0]) * vv - lx) * hollow, ey = clew[1] + (head[1] - clew[1]) * vv - ly, ez = (clew[2] + (head[2] - clew[2]) * vv - lz) * hollow;
        const cl = Math.hypot(ex, ez) || 1, nx = -ez / cl, nz = ex / cl;
        for (let u = 0; u <= NU; u++) {
          const uu = u / NU;
          const w = st.side * 0.13 * fill * cl * Math.sin(Math.PI * Math.pow(uu, 0.75)) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, vv + 0.15)))
            + luff * 0.06 * cl * Math.sin(uu * 8 - t * 24 + vv * 9) * uu;
          pos[o++] = lx + ex * uu + nx * w; pos[o++] = ly + ey * uu * (1 - 0.0) ; pos[o++] = lz + ez * uu + nz * w;
        }
      }
      jib.geometry.attributes.position.needsUpdate = true;
      jib.geometry.computeVertexNormals();
    }
    boomPivot.rotation.y = -bs;
    windex.rotation.y = -st.awa;
    rudderPivot.rotation.y = st.rudder * 0.55;
    if (g.userData.wheel) g.userData.wheel.rotation.z = -st.rudder * 2.5;
    // sheets
    const be = 0.85 * S.boomL;
    runPos.set([-Math.sin(bs) * be, yG, zM + 0.08 + Math.cos(bs) * be, 0, deckY(sheetT) + 0.25, zAt(sheetT),
      clew[0], clew[1], clew[2], -st.side * bd(0.62) * 0.8, deckY(0.62), zAt(0.62)]);
    runGeo.attributes.position.needsUpdate = true;
    // crew on the windward side
    crewX += (st.side * bd(crewT) * 0.62 - crewX) * 0.06;
    crew.position.set(crewX, deckY(crewT) + 0.1, zAt(crewT));
    crew.rotation.z = (st.heel || 0) * 0.6;
    crew.rotation.y = -crewX * 0.5;
    // lighting helpers
    const night = st.night || 0;
    mainMat.emissiveIntensity = jibMat.emissiveIntensity = 0.03 + 0.05 * (st.sunI || 0) / 4;
    g.userData.winMat.emissiveIntensity = night * 1.6;
    for (const m of navMats) m.color.copy(m.userData.base).multiplyScalar(0.15 + night * 5);
  }

  return { group: g, spec: S, update, bowZ: zSheer(0), sternZ: zSheer(1), mastTop: yHead };
}
