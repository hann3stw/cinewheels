// Handräder (Geared-Head-Wheels) mit echtem Multitouch.
//
// - Jedes Wheel ist ein eigenes DOM-Element mit Pointer-Capture: der Finger, der ein
//   Wheel greift, bleibt daran gebunden, bis er losgelassen wird. Beide Wheels sind
//   damit unabhängig voneinander gleichzeitig bedienbar.
// - Die Drehung ergibt sich aus der Winkeländerung des Fingers um die Wheel-Mitte.
// - Modus "realistisch": Schwungmasse – nach dem Loslassen läuft das Wheel mit der
//   zuletzt gemessenen Winkelgeschwindigkeit weiter und wird gedämpft. Antippen stoppt.
// - Modus "direkt": keine Trägheit.

import { settings, gearOf, GEARS, saveSettings, onSettingsChange } from './settings.js';

const TAU = Math.PI * 2;
const MAX_OMEGA = 40;          // rad/s, Obergrenze für den Auslauf
const STOP_OMEGA = 0.06;       // rad/s, darunter steht das Wheel
const VEL_WINDOW_MS = 90;      // Zeitfenster zur Geschwindigkeitsschätzung
const STALE_MS = 70;           // Finger stand still vor dem Loslassen -> kein Auslauf
const DEADZONE = 0.14;         // Anteil des Radius um die Mitte ohne Wirkung (Winkel instabil)

const SIZE_FACTOR = { S: 0.40, M: 0.48, L: 0.56 };

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

class Wheel {
  constructor(axis, root) {
    this.axis = axis;                 // 'pan' | 'tilt'
    this.root = root;                 // .wheel-unit
    this.el = root.querySelector('.wheel');
    this.rotCanvas = root.querySelector('.wheel-rot');
    this.fixCanvas = root.querySelector('.wheel-fix');
    this.gearBtn = root.querySelector('.gear-btn');

    this.angle = 0;          // sichtbarer Wheel-Winkel (rad, im Uhrzeigersinn positiv)
    this.omega = 0;          // rad/s im Auslauf
    this.pending = 0;        // noch nicht abgeholte Drehung (rad)
    this.pointerId = null;
    this.lastFinger = 0;
    this.samples = [];
    this.size = 0;
    this.drawnHeld = null;

    this.el.addEventListener('pointerdown', e => this.onDown(e));
    this.el.addEventListener('pointermove', e => this.onMove(e));
    this.el.addEventListener('pointerup', e => this.onUp(e));
    this.el.addEventListener('pointercancel', e => this.onUp(e));
    this.el.addEventListener('lostpointercapture', e => this.onUp(e));

    this.gearBtn.addEventListener('click', () => {
      const idx = GEARS.findIndex(g => g.id === settings[this.axis].gear);
      settings[this.axis].gear = GEARS[(idx + 1) % GEARS.length].id;
      saveSettings();
    });
    this.updateGearLabel();
  }

  get held() { return this.pointerId !== null; }

  center() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }

  fingerPolar(e) {
    const c = this.center();
    const dx = e.clientX - c.x, dy = e.clientY - c.y;
    return { a: Math.atan2(dy, dx), d: Math.hypot(dx, dy) / c.r };
  }

  onDown(e) {
    if (this.held) return;                 // ein Finger pro Wheel
    const p = this.fingerPolar(e);
    if (p.d > 1.08) return;                // außerhalb des Rads
    e.preventDefault();
    this.pointerId = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* egal */ }
    this.omega = 0;                        // Antippen stoppt das Wheel
    this.lastFinger = p.a;
    this.samples = [{ t: e.timeStamp, a: this.angle }];
    this.redrawFixed();
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    const list = events && events.length ? events : [e];
    for (const ev of list) {
      const p = this.fingerPolar(ev);
      if (p.d < DEADZONE) { this.lastFinger = p.a; continue; }
      const d = wrapAngle(p.a - this.lastFinger);
      this.lastFinger = p.a;
      this.angle += d;
      this.pending += d;
    }
    const now = e.timeStamp;
    this.samples.push({ t: now, a: this.angle });
    while (this.samples.length > 2 && now - this.samples[0].t > VEL_WINDOW_MS) this.samples.shift();
  }

  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (settings.wheelMode === 'realistic') {
      this.omega = this.releaseVelocity(e.timeStamp);
    } else {
      this.omega = 0;
    }
    this.samples = [];
    this.redrawFixed();
  }

  releaseVelocity(now) {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    if (now - last.t > STALE_MS) return 0;
    const first = s[0];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0.008) return 0;
    const v = (last.a - first.a) / dt;
    return Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, v));
  }

  stop() { this.omega = 0; this.pending = 0; }

  update(dt) {
    if (!this.held && this.omega !== 0) {
      const d = this.omega * dt;
      this.angle += d;
      this.pending += d;
      this.omega *= Math.exp(-settings.damping * dt);
      if (Math.abs(this.omega) < STOP_OMEGA) this.omega = 0;
    }
    // Rotation nur per CSS-Transform: sehr günstig, kein Neuzeichnen nötig.
    this.rotCanvas.style.transform = `rotate(${this.angle}rad)`;
  }

  /** Liefert die seit dem letzten Aufruf erfolgte Kameradrehung in Grad. */
  consumeDegrees() {
    const rad = this.pending;
    this.pending = 0;
    const cfg = settings[this.axis];
    const sign = cfg.invert ? -1 : 1;
    return (rad / TAU) * gearOf(this.axis).degPerRev * sign;
  }

  updateGearLabel() {
    const g = gearOf(this.axis);
    this.gearBtn.innerHTML = `<span class="gear-n">Gang ${g.label}</span><span class="gear-r">${g.degPerRev}°/U</span>`;
  }

  setSize(px) {
    if (px === this.size) return;
    this.size = px;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.rotCanvas, this.fixCanvas]) {
      c.width = Math.round(px * dpr);
      c.height = Math.round(px * dpr);
    }
    this.drawRotating();
    this.drawnHeld = null;
    this.redrawFixed();
  }

  // ---------- Zeichnen ----------

  /** Der rotierende Teil: Felge mit Riffelung, Speichen, Nabe, Kurbelgriff. */
  drawRotating() {
    const c = this.rotCanvas, ctx = c.getContext('2d');
    const S = c.width, cx = S / 2, cy = S / 2;
    const R = S * 0.46;
    ctx.clearRect(0, 0, S, S);

    // Halbtransparente Scheibe zwischen den Speichen
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, 0, TAU);
    ctx.fillStyle = 'rgba(8,9,12,0.35)';
    ctx.fill();

    // Felge
    const rimOuter = R, rimInner = R * 0.82;
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, '#6c717a');
    g.addColorStop(0.45, '#2b2e34');
    g.addColorStop(0.55, '#3a3e46');
    g.addColorStop(1, '#16181c');
    ctx.beginPath();
    ctx.arc(cx, cy, rimOuter, 0, TAU);
    ctx.arc(cx, cy, rimInner, 0, TAU, true);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, S * 0.006);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(cx, cy, rimOuter - ctx.lineWidth, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(cx, cy, rimInner, 0, TAU); ctx.stroke();

    // Riffelung (macht die Drehung gut sichtbar)
    const knurls = 48;
    ctx.lineWidth = Math.max(1, S * 0.008);
    for (let i = 0; i < knurls; i++) {
      const a = (i / knurls) * TAU;
      const cos = Math.cos(a), sin = Math.sin(a);
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,190,90,0.55)' : 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.moveTo(cx + cos * (rimInner + R * 0.03), cy + sin * (rimInner + R * 0.03));
      ctx.lineTo(cx + cos * (rimOuter - R * 0.03), cy + sin * (rimOuter - R * 0.03));
      ctx.stroke();
    }

    // Speichen
    const spokes = 4;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + Math.PI / 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      const w = R * 0.12;
      const sg = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
      sg.addColorStop(0, '#565b64');
      sg.addColorStop(0.5, '#2c2f35');
      sg.addColorStop(1, '#17191d');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(R * 0.15, -w * 0.62);
      ctx.lineTo(rimInner + 2, -w * 0.4);
      ctx.lineTo(rimInner + 2, w * 0.4);
      ctx.lineTo(R * 0.15, w * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Nabe
    const hg = ctx.createRadialGradient(cx - R * 0.06, cy - R * 0.06, R * 0.02, cx, cy, R * 0.24);
    hg.addColorStop(0, '#8d929c');
    hg.addColorStop(0.6, '#3a3e45');
    hg.addColorStop(1, '#15171a');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.24, 0, TAU);
    ctx.fillStyle = hg;
    ctx.fill();
    // Schraubenköpfe
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.16, cy + Math.sin(a) * R * 0.16, R * 0.022, 0, TAU);
      ctx.fillStyle = '#0d0e10';
      ctx.fill();
    }

    // Kurbelgriff (sitzt auf der Felge, oben rechts)
    const ha = -Math.PI / 2; // oben
    const hx = cx + Math.cos(ha) * R * 0.66, hy = cy + Math.sin(ha) * R * 0.66;
    const hr = R * 0.15;
    // Schatten
    ctx.beginPath();
    ctx.arc(hx + hr * 0.15, hy + hr * 0.25, hr * 1.05, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    // Griff
    const kg = ctx.createRadialGradient(hx - hr * 0.35, hy - hr * 0.4, hr * 0.1, hx, hy, hr);
    kg.addColorStop(0, '#5b5f66');
    kg.addColorStop(0.5, '#1e2024');
    kg.addColorStop(1, '#0a0b0d');
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, TAU);
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, R * 0.025);
    ctx.strokeStyle = '#e8a33d';
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 0.78, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx - hr * 0.3, hy - hr * 0.35, hr * 0.18, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }

  /** Der feste Teil: Index-Marke, Achsenbeschriftung, Griff-Glühen. */
  redrawFixed() {
    if (this.drawnHeld === this.held || !this.size) return;
    this.drawnHeld = this.held;
    const c = this.fixCanvas, ctx = c.getContext('2d');
    const S = c.width, cx = S / 2, cy = S / 2;
    const R = S * 0.46;
    ctx.clearRect(0, 0, S, S);

    if (this.held) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, TAU);
      ctx.lineWidth = S * 0.018;
      ctx.strokeStyle = 'rgba(232,163,61,0.75)';
      ctx.stroke();
    }

    // Index-Marke oben (zeigt die Drehung relativ zur Riffelung)
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 1.0);
    ctx.lineTo(cx - R * 0.06, cy - R * 1.09);
    ctx.lineTo(cx + R * 0.06, cy - R * 1.09);
    ctx.closePath();
    ctx.fillStyle = '#e8a33d';
    ctx.fill();

    // Achsenbeschriftung in der Nabe
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${Math.round(R * 0.13)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.axis === 'pan' ? 'PAN' : 'TILT', cx, cy + 1);
  }
}

export class WheelController {
  constructor(container) {
    this.container = container;
    this.pan = new Wheel('pan', container.querySelector('[data-axis="pan"]'));
    this.tilt = new Wheel('tilt', container.querySelector('[data-axis="tilt"]'));
    this.layout();
    onSettingsChange(() => {
      this.pan.updateGearLabel();
      this.tilt.updateGearLabel();
      if (settings.wheelMode === 'direct') { this.pan.omega = 0; this.tilt.omega = 0; }
      this.layout();
    });
  }

  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const f = SIZE_FACTOR[settings.wheelSize] || SIZE_FACTOR.M;
    const d = Math.round(Math.max(120, Math.min(vh * f, vw * 0.3, 420)));
    document.documentElement.style.setProperty('--wheel-d', d + 'px');
    const swap = settings.swapWheels;
    this.pan.root.classList.toggle('left', !swap);
    this.pan.root.classList.toggle('right', swap);
    this.tilt.root.classList.toggle('left', swap);
    this.tilt.root.classList.toggle('right', !swap);
    this.pan.setSize(d);
    this.tilt.setSize(d);
  }

  update(dt) {
    this.pan.update(dt);
    this.tilt.update(dt);
  }

  /** Kameradrehung in Grad seit dem letzten Aufruf. */
  consume() {
    return { pan: this.pan.consumeDegrees(), tilt: this.tilt.consumeDegrees() };
  }

  stopAll() { this.pan.stop(); this.tilt.stop(); }

  get active() { return this.pan.held || this.tilt.held || this.pan.omega !== 0 || this.tilt.omega !== 0; }
}
