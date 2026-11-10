// Sailing dynamics: sail lift/drag from apparent wind, hull resistance with a
// hull-speed wall, keel side force and leeway, heel/righting moment, weather helm,
// rudder authority that depends on flow, current, and grounding.
const RHO_A = 1.225, RHO_W = 1025, G = 9.81;
export const KT = 0.5144;

const AL = [0, 5, 12, 18, 25, 35, 50, 70, 90, 181];
const CLT = [0, 0.45, 1.15, 1.45, 1.5, 1.3, 1.0, 0.55, 0.1, 0.0];
const CDT = [0.06, 0.07, 0.12, 0.2, 0.34, 0.6, 0.95, 1.2, 1.3, 1.3];
function coef(aDeg) {
  let i = 0;
  while (i < AL.length - 2 && aDeg > AL[i + 1]) i++;
  const t = Math.min(1, Math.max(0, (aDeg - AL[i]) / (AL[i + 1] - AL[i])));
  return [CLT[i] + (CLT[i + 1] - CLT[i]) * t, CDT[i] + (CDT[i + 1] - CDT[i]) * t];
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class SailSim {
  constructor(spec) {
    this.spec = spec;
    this.autoTrim = true;
    this.reset(0, 0, 0);
  }
  reset(x, z, heading) {
    Object.assign(this, {
      x, z, psi: heading, u: 2.0, v: 0, r: 0, heel: 0, heelRate: 0, rudder: 0, sheet: 0.6, boom: 0.4, side: 1,
      awa: 0, aws: 0, twa: 0, tws: 0, alpha: 0, waveRoll: 0, wavePitch: 0, aground: false, depth: 30, sog: 0, cog: 0, drive: 0,
    });
  }
  step(dt, env, input) {
    const s = this.spec, m = s.disp;
    // helm
    if (input.steer !== 0) this.rudder = clamp(this.rudder + input.steer * dt * 1.9, -1, 1);
    else this.rudder -= clamp(this.rudder, -dt * 2.6, dt * 2.6);

    const sp = Math.sin(this.psi), cp = Math.cos(this.psi);
    const fx = sp, fz = -cp, rx = cp, rz = sp;
    const w = env.wind(this.x, this.z), cur = env.current(this.x, this.z);
    const vgx = fx * this.u + rx * this.v + cur.x, vgz = fz * this.u + rz * this.v + cur.z;
    const relx = w.x - vgx, relz = w.z - vgz;
    const aws = Math.hypot(relx, relz);
    const awa = Math.atan2(-(relx * rx + relz * rz), -(relx * fx + relz * fz));
    const a = Math.abs(awa);
    this.aws = aws; this.awa = awa;
    this.tws = Math.hypot(w.x, w.z);
    this.twa = Math.atan2(-(w.x * rx + w.z * rz), -(w.x * fx + w.z * fz));
    const sgn = a > 0.04 ? Math.sign(awa) : Math.sign(this.side) || 1;
    this.side += clamp(sgn - this.side, -dt * 3.2, dt * 3.2);

    // trim
    const opt = clamp(a - 0.3 + Math.max(0, Math.abs(this.heel) - 0.44) * 1.6, 0.06, 1.46);
    this.optBoom = opt;
    if (this.autoTrim) this.sheet += clamp(opt - this.sheet, -dt * 0.9, dt * 0.9);
    else this.sheet = clamp(this.sheet + input.trim * dt * 0.55, 0.06, 1.5);
    const boomT = Math.min(this.sheet, Math.max(a - 0.03, 0));
    this.boom += (boomT - this.boom) * Math.min(1, dt * 6);
    const alpha = Math.max(a - this.boom, 0);
    this.alpha = alpha;
    const [CL, CD] = coef((alpha * 180) / Math.PI);
    const ch = Math.cos(this.heel), full = Math.abs(this.side);
    const q = 0.5 * RHO_A * s.sa * aws * aws * ch * ch * (0.35 + 0.65 * full);
    const qw = 0.5 * RHO_A * (s.loa * 0.75) * aws * aws; // hull + rig windage
    const drive = q * (CL * Math.sin(a) - CD * Math.cos(a)) - qw * Math.cos(a);
    const sideF = q * (CL * Math.cos(a) + CD * Math.sin(a)) + qw * Math.sin(a) * 0.6;
    this.drive = drive;

    // hull
    const u = this.u, v = this.v;
    const Fr = Math.abs(u) / Math.sqrt(G * s.lwl);
    const Rf = 0.5 * RHO_W * 0.0045 * s.wet * u * Math.abs(u);
    const Rw = m * G * s.cw * Math.pow(Fr / 0.4, s.cwExp) * Math.sign(u);
    const Rr = 0.5 * RHO_W * 0.22 * this.rudder * this.rudder * u * Math.abs(u);
    const surf = -m * G * Math.sin(this.wavePitch) * 0.22;
    const heelDrag = 1 + 1.2 * this.heel * this.heel;
    this.u += ((drive - (Rf + Rw) * heelDrag - Rr + surf) / (m * 1.08)) * dt;

    const lam = Math.atan2(v, Math.abs(u) + 0.25);
    const CLk = clamp(lam * s.keelSlope, -0.85, 0.85);
    const Fk = 0.5 * RHO_W * s.latArea * (u * u + v * v) * CLk + 0.5 * RHO_W * s.latArea * 1.1 * v * Math.abs(v);
    this.v += ((-sgn * sideF * ch - Fk) / (m * 1.6)) * dt;

    // yaw
    const ue = Math.abs(u) > 0.35 ? u : 0.35;
    let rT = this.rudder * s.turn * ue * 1.0;
    rT += sgn * s.weather * Math.max(0, Math.abs(this.heel) - 0.22) * Math.max(u, 0);
    const stall = clamp(1 - Math.abs(u) / 1.2, 0, 1);
    rT += -sgn * 0.1 * stall * Math.sin(a) * Math.min(aws / 8, 1.5);
    this.r += (rT - this.r) * Math.min(1, dt * 2.4);
    this.psi += this.r * dt;

    // heel (positive = starboard side down)
    const ixx = m * s.kxx * s.kxx, om = Math.sqrt((m * G * s.gm) / ixx);
    const Mh = -sgn * sideF * s.ceH * ch;
    const Mr = m * G * s.gm * Math.sin(this.heel - this.waveRoll * 0.8);
    this.heelRate += ((Mh - Mr) / ixx - 2 * 0.42 * om * this.heelRate) * dt;
    this.heel = clamp(this.heel + this.heelRate * dt, -1.25, 1.25);

    // move
    this.x += vgx * dt; this.z += vgz * dt;
    this.sog = Math.hypot(vgx, vgz);
    this.cog = Math.atan2(vgx, -vgz);

    // shoals and shore
    const h = env.height(this.x, this.z);
    this.depth = -h;
    this.aground = this.depth < s.draft * 0.9;
    if (this.aground) {
      const gx = env.height(this.x + 10, this.z) - env.height(this.x - 10, this.z);
      const gz = env.height(this.x, this.z + 10) - env.height(this.x, this.z - 10);
      const gl = Math.hypot(gx, gz) || 1;
      this.x -= (gx / gl) * 2.2 * dt; this.z -= (gz / gl) * 2.2 * dt;
      const k = Math.exp(-3.5 * dt);
      this.u *= k; this.v *= k;
    }
    const lim = 16800;
    if (Math.abs(this.x) > lim || Math.abs(this.z) > lim) {
      this.x = clamp(this.x, -lim, lim); this.z = clamp(this.z, -lim, lim); this.u *= 0.95;
      this.offChart = true;
    } else this.offChart = false;
  }
}
