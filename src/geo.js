// San Francisco Bay geography: coastline polygons (lat/lon), hills, and a
// procedurally generated heightfield. World units are metres, +X east, +Z south,
// origin at Alcatraz.
import * as THREE from 'three';

export const WORLD = { size: 36000, n: 1024 };
const LAT0 = 37.8267, LON0 = -122.423;
export const ll = (lat, lon) => [(lon - LON0) * 87800, -(lat - LAT0) * 111000];

const RAW = [
  ['sf', 260, [
    [37.8106, -122.4771], [37.8075, -122.4720], [37.8058, -122.4630], [37.8063, -122.4520], [37.8072, -122.4480],
    [37.8068, -122.4400], [37.8085, -122.4330], [37.8090, -122.4290], [37.8068, -122.4245], [37.8088, -122.4200],
    [37.8098, -122.4150], [37.8108, -122.4105], [37.8085, -122.4055], [37.8055, -122.4030], [37.8010, -122.3985],
    [37.7955, -122.3930], [37.7905, -122.3885], [37.7850, -122.3870], [37.7780, -122.3860], [37.7700, -122.3845],
    [37.7600, -122.3800], [37.7500, -122.3760], [37.7400, -122.3680], [37.7300, -122.3570], [37.7200, -122.3600],
    [37.7080, -122.3800], [37.6900, -122.3850], [37.6500, -122.3800], [37.6500, -122.5000], [37.7000, -122.5020],
    [37.7350, -122.5075], [37.7600, -122.5110], [37.7780, -122.5140], [37.7875, -122.5075], [37.7880, -122.4950],
    [37.7930, -122.4840], [37.8020, -122.4790],
  ]],
  ['marin', 230, [
    [37.8255, -122.4787], [37.8300, -122.4770], [37.8325, -122.4745], [37.8368, -122.4725], [37.8450, -122.4770],
    [37.8560, -122.4790], [37.8650, -122.4960], [37.8780, -122.5080], [37.8880, -122.5180], [37.8900, -122.5080],
    [37.8830, -122.4990], [37.8760, -122.4930], [37.8850, -122.4880], [37.8930, -122.4850], [37.8850, -122.4720],
    [37.8720, -122.4680], [37.8640, -122.4640], [37.8690, -122.4560], [37.8725, -122.4500], [37.8760, -122.4420],
    [37.8830, -122.4360], [37.8920, -122.4420], [37.9080, -122.4630], [37.9300, -122.4800], [37.9450, -122.4850],
    [37.9700, -122.4900], [38.0000, -122.4800], [38.0000, -122.6500], [37.8960, -122.6500], [37.8780, -122.6050],
    [37.8590, -122.5770], [37.8410, -122.5520], [37.8310, -122.5390], [37.8215, -122.5330], [37.8155, -122.5297],
    [37.8195, -122.5230], [37.8225, -122.5120], [37.8200, -122.4995], [37.8250, -122.4920], [37.8268, -122.4860],
  ]],
  ['angel', 320, [
    [37.8605, -122.4465], [37.8660, -122.4420], [37.8690, -122.4365], [37.8672, -122.4345], [37.8705, -122.4320],
    [37.8722, -122.4290], [37.8710, -122.4225], [37.8690, -122.4190], [37.8640, -122.4175], [37.8590, -122.4178],
    [37.8545, -122.4205], [37.8528, -122.4190], [37.8522, -122.4225], [37.8540, -122.4300], [37.8548, -122.4380],
    [37.8562, -122.4425], [37.8585, -122.4460],
  ]],
  ['alcatraz', 55, [
    [37.8283, -122.4250], [37.8280, -122.4232], [37.8268, -122.4212], [37.8255, -122.4203], [37.8250, -122.4212],
    [37.8258, -122.4232], [37.8270, -122.4250], [37.8278, -122.4256],
  ]],
  ['ti', 150, [
    [37.8320, -122.3765], [37.8318, -122.3665], [37.8185, -122.3630], [37.8140, -122.3605], [37.8100, -122.3595],
    [37.8068, -122.3625], [37.8065, -122.3680], [37.8085, -122.3720], [37.8125, -122.3725], [37.8160, -122.3735],
    [37.8180, -122.3775],
  ]],
  ['east', 300, [
    [37.6500, -122.2200], [37.7200, -122.2550], [37.7450, -122.2650], [37.7640, -122.2900], [37.7720, -122.3200],
    [37.7800, -122.3320], [37.7900, -122.3300], [37.7960, -122.3380], [37.8060, -122.3420], [37.8120, -122.3300],
    [37.8210, -122.3220], [37.8280, -122.3050], [37.8350, -122.2980], [37.8375, -122.3130], [37.8410, -122.3010],
    [37.8600, -122.3040], [37.8625, -122.3180], [37.8690, -122.3180], [37.8700, -122.3080], [37.8850, -122.3120],
    [37.8895, -122.3250], [37.8960, -122.3200], [37.9050, -122.3300], [37.9080, -122.3600], [37.9050, -122.3880],
    [37.9200, -122.3950], [37.9330, -122.4080], [37.9480, -122.4220], [37.9650, -122.4290], [37.9750, -122.4000],
    [38.0000, -122.3700], [38.0000, -122.2000],
  ]],
];

export const LAND = RAW.map(([name, ramp, pts], id) => {
  const n = pts.length, X = new Float64Array(n), Z = new Float64Array(n);
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  pts.forEach(([la, lo], i) => {
    const [x, z] = ll(la, lo);
    X[i] = x; Z[i] = z;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z);
  });
  return { name, id, ramp, n, X, Z, minx, maxx, minz, maxz };
});

// [lat, lon, height m, radius m]
const PEAKS = [
  // San Francisco
  [37.7544, -122.4477, 280, 1100], [37.7552, -122.4528, 262, 750], [37.7383, -122.4547, 283, 1100],
  [37.7930, -122.4160, 105, 600], [37.8010, -122.4190, 90, 450], [37.8024, -122.4058, 84, 300],
  [37.7930, -122.4370, 115, 800], [37.7950, -122.4680, 110, 900], [37.8072, -122.4752, 62, 330],
  [37.7830, -122.5000, 110, 700], [37.7430, -122.4140, 130, 500], [37.7590, -122.4000, 90, 500],
  [37.6880, -122.4350, 400, 2500], [37.7680, -122.4410, 170, 400], [37.7550, -122.4700, 220, 700],
  [37.7200, -122.4400, 150, 1500],
  // Marin
  [37.8255, -122.4995, 280, 900], [37.8330, -122.4880, 285, 800], [37.8290, -122.4815, 200, 480],
  [37.8520, -122.5000, 340, 1500], [37.8650, -122.5450, 310, 1800], [37.8370, -122.5350, 290, 900],
  [37.9235, -122.5965, 784, 4500], [37.8900, -122.4650, 180, 1100], [37.8780, -122.4520, 120, 600],
  [37.8690, -122.4650, 100, 400], [37.9100, -122.4850, 180, 1000], [37.8200, -122.5250, 100, 500],
  [37.9000, -122.5500, 400, 3000], [37.9400, -122.6300, 500, 4000], [37.9600, -122.5300, 300, 3000],
  [37.8440, -122.4830, 210, 800], [37.8760, -122.5250, 260, 1500],
  // islands
  [37.8612, -122.4318, 240, 800], [37.8267, -122.4230, 46, 170], [37.8100, -122.3660, 103, 380],
  // East Bay
  [37.8830, -122.2420, 510, 3500], [37.8300, -122.2100, 450, 4000], [37.8000, -122.2000, 400, 4500],
  [37.8870, -122.2250, 580, 3000], [37.9120, -122.3880, 110, 500], [37.9400, -122.4100, 130, 900],
  [37.9200, -122.2800, 250, 2500], [37.8930, -122.3050, 95, 300], [37.7500, -122.1900, 380, 4500],
  [37.9600, -122.3000, 300, 3500],
].map(([la, lo, h, r]) => { const [x, z] = ll(la, lo); return [x, z, h, r]; });

export const GATE = ll(37.8194, -122.4785); // mid-span of the Golden Gate Bridge

// ---------- noise ----------
export function hash2(i, j) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let a = 0.5, s = 0, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x, y); norm += a; x = x * 2.03 + 17.3; y = y * 2.03 + 9.1; a *= 0.5; }
  return s / norm;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sdPoly(px, pz, P) {
  const { X, Z, n } = P;
  let d2 = Infinity, inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = X[j], az = Z[j], bx = X[i], bz = Z[i];
    const ex = bx - ax, ez = bz - az, wx = px - ax, wz = pz - az;
    let t = (wx * ex + wz * ez) / (ex * ex + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = wx - ex * t, dz = wz - ez * t, d = dx * dx + dz * dz;
    if (d < d2) d2 = d;
    if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
  }
  return (inside ? 1 : -1) * Math.sqrt(d2);
}

function elevation(x, z, d, ramp) {
  if (d <= 0) return -Math.min(0.6 - d * 0.045, 30);
  const base = d < 60 ? -0.6 + 0.06 * d : 3 + Math.min((d - 60) * 0.004, 14);
  const mask = smooth(12, ramp, d);
  let s = 0;
  for (let i = 0; i < PEAKS.length; i++) {
    const p = PEAKS[i], dx = x - p[0], dz = z - p[1], r2 = (dx * dx + dz * dz) / (p[3] * p[3]);
    if (r2 < 9) { const v = p[2] * Math.exp(-r2); s += v * v * v; }
  }
  const pk = Math.cbrt(s);
  const n1 = fbm(x / 1100 + 3.1, z / 1100 + 7.7, 5), n2 = fbm(x / 260, z / 260, 3);
  const rough = Math.min(1, Math.max(0.12, pk / 60));
  const h = base + mask * (pk * (0.78 + 0.5 * n1) + (n1 - 0.5) * 34 * rough + (n2 - 0.5) * (5 + pk * 0.12) * rough);
  return Math.max(h, Math.min(base, 1.2));
}

export function buildHeightfield() {
  const { size, n } = WORLD, cell = size / (n - 1), half = size / 2;
  const H = new Float32Array(n * n), D = new Float32Array(n * n), ID = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -half + j * cell;
    for (let i = 0; i < n; i++) {
      const x = -half + i * cell;
      let best = -900, id = 255, ramp = 200;
      for (const P of LAND) {
        if (x < P.minx - 900 || x > P.maxx + 900 || z < P.minz - 900 || z > P.maxz + 900) continue;
        const d = sdPoly(x, z, P);
        if (d > best) { best = d; id = P.id; ramp = P.ramp; }
      }
      const k = j * n + i;
      D[k] = best; ID[k] = id; H[k] = elevation(x, z, best, ramp);
    }
  }
  const hf = {
    n, size, cell, half, H, D, ID,
    heightAt(x, z) {
      let fx = (x + half) / cell, fz = (z + half) / cell;
      fx = fx < 0 ? 0 : fx > n - 1.001 ? n - 1.001 : fx;
      fz = fz < 0 ? 0 : fz > n - 1.001 ? n - 1.001 : fz;
      const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
    },
    info(x, z) {
      const i = Math.min(n - 1, Math.max(0, Math.round((x + half) / cell)));
      const j = Math.min(n - 1, Math.max(0, Math.round((z + half) / cell)));
      const k = j * n + i;
      return { h: H[k], d: D[k], id: ID[k] };
    },
    depthTexture() {
      const data = new Uint8Array(n * n * 4);
      for (let k = 0; k < n * n; k++) {
        const v = Math.min(255, Math.max(0, Math.round(((H[k] + 12) / 16) * 255)));
        data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
      }
      const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      tex.magFilter = tex.minFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    },
  };
  return hf;
}

// ---------- land classification ----------
const circle = (la, lo, r) => { const [x, z] = ll(la, lo); return [x, z, r * r]; };
const inC = (c, x, z) => (x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2];
const PRESIDIO = circle(37.7975, -122.4660, 1250), LANDSEND = circle(37.7835, -122.5010, 650);
const GGP = [...ll(37.7745, -122.5110), ...ll(37.7655, -122.4540)]; // x0,z0,x1,z1
const SAUSALITO = circle(37.8570, -122.4850, 900), TIBURON = circle(37.8725, -122.4585), TIB2 = circle(37.8725, -122.4585, 950);
const TI_SPLIT = ll(37.8165, 0)[1];

export function isUrban(x, z, h, id, d) {
  if (d < 25) return false;
  if (id === 0) {
    if (h > 190) return false;
    if (inC(PRESIDIO, x, z) || inC(LANDSEND, x, z)) return false;
    if (x > GGP[0] && x < GGP[2] && z > GGP[1] && z < GGP[3]) return false;
    return true;
  }
  if (id === 5) return h < 85;
  if (id === 4) return z < TI_SPLIT;
  if (id === 1) return (inC(SAUSALITO, x, z) && h < 150) || (inC(TIB2, x, z) && h < 120);
  return false;
}

const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const SAND = lin([0.80, 0.74, 0.60]), ROCK = lin([0.45, 0.41, 0.36]), GOLD = lin([0.66, 0.54, 0.29]);
const GREEN = lin([0.25, 0.36, 0.16]), DKGREEN = lin([0.12, 0.22, 0.11]);
const URBAN = lin([0.64, 0.63, 0.61]), URBAN2 = lin([0.50, 0.50, 0.49]);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function landColor(x, z, h, slope, id, d) {
  let c;
  const urban = isUrban(x, z, h, id, d);
  if (urban) {
    c = mix3(URBAN, URBAN2, hash2(Math.floor(x / 90), Math.floor(z / 90)));
    const tr = fbm(x / 300 + 40, z / 300, 3);
    if (tr > 0.6) c = mix3(c, GREEN, Math.min(0.6, (tr - 0.6) * 4));
  } else {
    if (id === 3) return mix3(lin([0.50, 0.45, 0.38]), GREEN, Math.min(0.5, fbm(x / 60, z / 60, 3) * 0.8));
    const bias = id === 2 ? 0.45 : id === 0 ? 0.5 : id === 1 ? (h > 330 ? 0.5 : 0.08) : id === 4 ? 0.4 : 0;
    const g = Math.min(1, Math.max(0, fbm(x / 700, z / 700, 4) * 2.2 - 0.75 + bias));
    c = mix3(GOLD, GREEN, g);
    c = mix3(c, DKGREEN, Math.min(1, Math.max(0, fbm(x / 240 + 9, z / 240, 3) * 2.4 - 1.0 + bias * 0.8)) * 0.7);
    if (slope > 0.7) c = mix3(c, ROCK, smooth(0.7, 1.3, slope));
    if (h < 3.2) c = mix3(SAND, c, smooth(1.2, 3.2, h));
  }
  if (h < 0.4) c = mix3(lin([0.42, 0.40, 0.33]), c, smooth(-1.5, 0.4, h));
  const shade = 0.78 + 0.44 * fbm(x / 70, z / 70, 3);
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}
