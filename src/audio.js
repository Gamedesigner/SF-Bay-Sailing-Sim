// Tiny procedural soundscape: wind in the rig and water along the hull, from filtered noise.
export class Sound {
  constructor() { this.on = false; this.ctx = null; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; }
    const mk = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(flt).connect(gain).connect(this.master); src.start();
      return { flt, gain };
    };
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    this.wind = mk('bandpass', 500, 0.6);
    this.hiss = mk('highpass', 2500, 0.3);
    this.water = mk('lowpass', 900, 0.4);
  }
  toggle() {
    this.on = !this.on;
    if (this.on) this.start();
    if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.15);
    return this.on;
  }
  update(aws, speed, rain) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(Math.min(0.5, aws * aws * 0.0016), t, 0.3);
    this.wind.flt.frequency.setTargetAtTime(350 + aws * 45, t, 0.3);
    this.hiss.gain.gain.setTargetAtTime(Math.min(0.12, aws * aws * 0.00025) + rain * 0.1, t, 0.3);
    this.water.gain.gain.setTargetAtTime(Math.min(0.45, 0.03 + speed * speed * 0.03), t, 0.2);
    this.water.flt.frequency.setTargetAtTime(500 + speed * 260, t, 0.2);
  }
}
