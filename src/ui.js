// HUD: instruments, wind dial, control panel and chart.
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const MAP = { cx: -500, cz: 600, half: 9000 };

export function createUI(app, hf) {
  const panel = $('panel');
  panel.innerHTML = `
    <h3>Boat</h3><div class="chips" id="boats"></div>
    <h3>Time of day</h3>
    <div class="clock"><span id="clock">18:20</span><small id="daypart"></small></div>
    <input type="range" id="hour" min="0" max="24" step="0.02" />
    <div class="chips" style="margin-top:8px" id="speeds"></div>
    <h3>Weather</h3><div class="chips" id="presets"></div>
    <div style="margin-top:8px">
      <div class="row"><span>Wind</span><input type="range" id="wx-wind" min="0" max="40" step="1" /><output id="o-wind"></output></div>
      <div class="row"><span>From</span><input type="range" id="wx-dir" min="0" max="359" step="1" /><output id="o-dir"></output></div>
      <div class="row"><span>Fog</span><input type="range" id="wx-fog" min="0" max="1" step="0.01" /><output id="o-fog"></output></div>
      <div class="row"><span>Clouds</span><input type="range" id="wx-cloud" min="0" max="1" step="0.01" /><output id="o-cloud"></output></div>
    </div>
    <h3>Tide</h3><div class="chips" id="tides"></div>
    <h3>Sail to</h3><div class="chips" id="spots"></div>
    <h3>View</h3><div class="chips" id="cams"></div>
    <div class="chips" style="margin-top:8px"><button id="b-auto" class="on">Auto-trim</button><button id="b-sound">Sound</button></div>`;

  const group = (id, items, onPick, active) => {
    const el = $(id), btns = [];
    items.forEach(([key, label, cls]) => {
      const b = document.createElement('button');
      b.innerHTML = label; if (cls) b.className = cls;
      b.onclick = () => { onPick(key); set(key); b.blur(); };
      el.appendChild(b); btns.push([key, b]);
    });
    const set = (k) => btns.forEach(([key, b]) => b.classList.toggle('on', key === k));
    if (active !== undefined) set(active);
    return set;
  };
  const setBoat = group('boats', app.boats.map((b, i) => [i, `<b>${b.name}</b><span>${b.tag}</span>`, 'boat']), (i) => app.setBoat(i), 0);
  const setPreset = group('presets', Object.entries(app.presets).map(([k, p]) => [k, p.label]), (k) => { app.setPreset(k); syncWx(); }, 'summer');
  const setSpeed = group('speeds', [[0, 'Hold'], [1, 'Real time'], [120, '2 min/s'], [1200, '20 min/s']], (s) => app.setTimeScale(s), 1);
  group('tides', [[-1, 'Ebb'], [0, 'Slack'], [1, 'Flood']], (v) => app.setTide(v), 0);
  group('spots', Object.keys(app.spots).map((k) => [k, k]), (k) => app.teleport(k));
  const setCam = group('cams', [['chase', 'Chase'], ['orbit', 'Orbit'], ['helm', 'Helm'], ['drone', 'Drone']], (m) => app.setCam(m), 'chase');

  const sl = { wind: $('wx-wind'), dir: $('wx-dir'), fog: $('wx-fog'), cloud: $('wx-cloud') };
  const compass = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  function syncWx() {
    const t = app.weather.target;
    sl.wind.value = t.wind; sl.dir.value = t.dir; sl.fog.value = t.fog; sl.cloud.value = t.cloud;
    $('o-wind').textContent = `${Math.round(t.wind)} kt`; $('o-dir').textContent = `${compass(t.dir)} ${Math.round(t.dir)}°`;
    $('o-fog').textContent = `${Math.round(t.fog * 100)}%`; $('o-cloud').textContent = `${Math.round(t.cloud * 100)}%`;
  }
  for (const [k, el] of Object.entries(sl)) el.oninput = () => { app.setWx(k, parseFloat(el.value)); setPreset(null); syncWx(); };
  syncWx();
  const hour = $('hour');
  hour.oninput = () => app.setHour(parseFloat(hour.value));
  $('b-auto').onclick = (e) => { app.toggleAuto(); e.target.blur(); };
  $('b-sound').onclick = (e) => { e.target.classList.toggle('on', app.toggleSound()); e.target.blur(); };

  // ----- chart base -----
  const mm = $('minimap'), mctx = mm.getContext('2d'), MS = mm.width;
  const base = document.createElement('canvas'); base.width = base.height = MS;
  {
    const b = base.getContext('2d'), img = b.createImageData(MS, MS);
    for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
      const x = MAP.cx + (i / MS - 0.5) * 2 * MAP.half, z = MAP.cz + (j / MS - 0.5) * 2 * MAP.half;
      const h = hf.heightAt(x, z), k = (j * MS + i) * 4;
      let r, g, bl;
      if (h > 0.3) { const s = Math.min(1, h / 300); r = 52 + 60 * s; g = 66 + 50 * s; bl = 58 + 30 * s; }
      else { const d = Math.min(1, -h / 25); r = 30 - 18 * d; g = 66 - 28 * d; bl = 86 - 30 * d; }
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = 235;
    }
    b.putImageData(img, 0, 0);
    b.strokeStyle = 'rgba(255,120,90,0.9)'; b.lineWidth = 2;
    const P = (x, z) => [((x - MAP.cx) / (2 * MAP.half) + 0.5) * MS, ((z - MAP.cz) / (2 * MAP.half) + 0.5) * MS];
    for (const [a, c] of [[[-4778, 1795], [-4967, -163]], [[3073, 4296], [4961, 2020]], [[5549, 1465], [9000, 466]]]) {
      b.beginPath(); b.moveTo(...P(...a)); b.lineTo(...P(...c)); b.stroke(); b.strokeStyle = 'rgba(210,215,220,0.8)';
    }
  }
  const toMap = (x, z) => [((x - MAP.cx) / (2 * MAP.half) + 0.5) * MS, ((z - MAP.cz) / (2 * MAP.half) + 0.5) * MS];

  const dial = $('dial'), dctx = dial.getContext('2d'), DS = dial.width;
  function drawDial(d) {
    const c = dctx, R = DS / 2;
    c.clearRect(0, 0, DS, DS);
    c.save(); c.translate(R, R);
    // no-go zone around the true wind
    c.fillStyle = 'rgba(255,107,94,0.16)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 26, d.twa - 40 * DEG - Math.PI / 2, d.twa + 40 * DEG - Math.PI / 2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, R - 26, 0, Math.PI * 2); c.stroke();
    for (let a = 0; a < 360; a += 10) {
      const big = a % 30 === 0, r0 = R - 26, r1 = r0 - (big ? 14 : 7), s = Math.sin(a * DEG), co = -Math.cos(a * DEG);
      c.strokeStyle = big ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
      c.beginPath(); c.moveTo(s * r0, co * r0); c.lineTo(s * r1, co * r1); c.stroke();
    }
    c.fillStyle = 'rgba(234,242,246,0.6)'; c.font = '600 19px Avenir Next, system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [a, t] of [[0, '0'], [90, '90'], [180, '180'], [270, '90']]) c.fillText(t, Math.sin(a * DEG) * (R - 11), -Math.cos(a * DEG) * (R - 11));
    // hull
    c.fillStyle = 'rgba(234,242,246,0.92)';
    c.beginPath(); c.moveTo(0, -62); c.bezierCurveTo(26, -26, 24, 34, 15, 60); c.lineTo(-15, 60); c.bezierCurveTo(-24, 34, -26, -26, 0, -62); c.fill();
    // boom
    c.strokeStyle = '#0c1a26'; c.lineWidth = 6; c.lineCap = 'round';
    const b = d.boom * d.side; c.beginPath(); c.moveTo(0, -14); c.lineTo(-Math.sin(b) * 62, -14 + Math.cos(b) * 62); c.stroke();
    const arrow = (ang, col, len, w) => {
      c.save(); c.rotate(ang); c.fillStyle = col;
      c.beginPath(); c.moveTo(0, -(R - 30) + len); c.lineTo(w, -(R - 30)); c.lineTo(-w, -(R - 30)); c.closePath(); c.fill(); c.restore();
    };
    arrow(d.twa, '#6fd3ff', 30 + d.tws * 1.3, 11);
    arrow(d.awa, '#ffb454', 30 + d.aws * 1.3, 8);
    c.restore();
  }

  const toastEl = $('toast'); let toastT = 0;
  function toast(msg, warn = false, hold = 2600) {
    toastEl.textContent = msg; toastEl.className = 'show' + (warn ? ' warn' : '');
    clearTimeout(toastT); toastT = setTimeout(() => (toastEl.className = ''), hold);
  }
  const fmtAng = (a) => `${Math.round(Math.abs(a) / DEG)}°${a < 0 ? ' P' : ' S'}`;
  const pointOfSail = (a) => { a = Math.abs(a) / DEG; return a < 32 ? 'IN IRONS' : a < 55 ? 'CLOSE HAULED' : a < 80 ? 'CLOSE REACH' : a < 105 ? 'BEAM REACH' : a < 150 ? 'BROAD REACH' : 'RUNNING'; };

  return {
    toast, setBoat, setCam, setPreset, setSpeed, syncWx,
    setAuto(on) { $('b-auto').classList.toggle('on', on); $('trim-mode').textContent = on ? 'AUTO TRIM' : 'MANUAL TRIM'; $('trim-mode').classList.toggle('on', on); },
    update(d) {
      $('v-spd').textContent = d.spd.toFixed(1); $('v-sog').textContent = d.sog.toFixed(1);
      $('v-hdg').textContent = String(Math.round(d.hdg) % 360).padStart(3, '0') + '°';
      $('v-tws').textContent = d.tws.toFixed(0) + ' kt'; $('v-twa').textContent = fmtAng(d.twa);
      $('v-aws').textContent = d.aws.toFixed(0) + ' kt'; $('v-awa').textContent = fmtAng(d.awa);
      $('v-heel').textContent = Math.round(Math.abs(d.heel) / DEG) + '°';
      $('v-depth').textContent = d.depth > 28 ? '30+ m' : Math.max(0, d.depth).toFixed(1) + ' m';
      $('rudder-knob').style.left = 50 + d.rudder * 46 + '%';
      $('sheet-fill').style.width = (d.sheet / 1.5) * 100 + '%';
      $('sheet-opt').style.left = (d.opt / 1.5) * 100 + '%';
      $('point').textContent = pointOfSail(d.twa);
      const hh = Math.floor(d.hour), mi = Math.floor((d.hour - hh) * 60);
      $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      $('daypart').textContent = d.elev > 8 ? 'DAYLIGHT' : d.elev > 0 ? 'GOLDEN HOUR' : d.elev > -8 ? 'TWILIGHT' : 'NIGHT';
      if (document.activeElement !== hour) hour.value = d.hour;
      drawDial(d);
      // chart
      const c = mctx; c.clearRect(0, 0, MS, MS); c.drawImage(base, 0, 0);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      for (const o of d.others) { const [x, y] = toMap(o[0], o[1]); c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
      if (d.ship) { const [x, y] = toMap(d.ship[0], d.ship[1]); c.fillStyle = '#ff9d6b'; c.fillRect(x - 5, y - 3, 10, 6); }
      const [bx, by] = toMap(d.x, d.z);
      c.save(); c.translate(Math.min(MS - 8, Math.max(8, bx)), Math.min(MS - 8, Math.max(8, by))); c.rotate(d.hdg * DEG);
      c.fillStyle = '#ffb454'; c.strokeStyle = '#0c1a26'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -15); c.lineTo(9, 11); c.lineTo(0, 6); c.lineTo(-9, 11); c.closePath(); c.fill(); c.stroke(); c.restore();
      // wind arrow (blowing toward)
      c.save(); c.translate(44, 44); c.rotate(d.twd * DEG + Math.PI);
      c.strokeStyle = c.fillStyle = '#6fd3ff'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 20); c.lineTo(0, -14); c.stroke();
      c.beginPath(); c.moveTo(0, -26); c.lineTo(10, -10); c.lineTo(-10, -10); c.closePath(); c.fill(); c.restore();
    },
  };
}
