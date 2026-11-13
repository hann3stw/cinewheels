// Spielmodi und Level: Freies Filmen, Weg folgen, Ziel verfolgen, Kranfahrt.
import * as THREE from './vendor/three.module.min.js';
import { dirFromAngles, anglesTo, CAMERA_POS } from './camera.js';
import { lam, makeCar, spinWheels, makePerson, animatePerson, makeDrone, spinRotors } from './scene.js';

const TAU = Math.PI * 2;
const PATH_RADIUS = 25; // Abstand des Pfads von der Kamera (m)

// =====================================================================
// Level-Definitionen
// =====================================================================

const lerp = (a, b, k) => a + (b - a) * k;
const pingpong = (t, period) => 0.5 - 0.5 * Math.cos((TAU * t) / period); // 0 -> 1 -> 0, weich
/** Zeitverzerrung für wechselndes Tempo (monoton, solange amp*freq < 1). */
const warp = (t, amp, freq) => t + amp * Math.sin(freq * t);

const frac = x => x - Math.floor(x);
const smooth = k => k * k * (3 - 2 * k);
/** Dreieckswelle -1..1 mit Periode 1, Start bei -1. */
const tri = x => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1;
/** Stop & Go: n Etappen hin und n zurück, jede dauert segT Sekunden (60 % fahren, 40 % stehen). */
const stopGo = (t, n, segT) => {
  const s = t / segT, i = Math.floor(s);
  const v = (i + smooth(Math.min(1, frac(s) / 0.6))) % (2 * n);
  return v <= n ? v / n : (2 * n - v) / n;
};

export const PATH_LEVELS = [
  {
    id: 'path-1', title: 'Gerade Linie', difficulty: 1, focal: 35, duration: 28,
    desc: 'Ruhiger horizontaler Schwenk – nur das Pan-Wheel.',
    closed: false,
    shape: u => [lerp(-40, 40, u), 0],
    pos: t => [lerp(-40, 40, pingpong(t, 14)), 0],
  },
  {
    id: 'path-vert', title: 'Senkrechte', difficulty: 1, focal: 35, duration: 25,
    desc: 'Rauf und runter – nur das Tilt-Wheel.',
    closed: false,
    shape: u => [0, lerp(-14, 22, u)],
    pos: t => [0, lerp(-14, 22, pingpong(t, 10))],
  },
  {
    id: 'path-2', title: 'Diagonale', difficulty: 2, focal: 35, duration: 28,
    desc: 'Pan und Tilt gleichzeitig – beide Hände arbeiten.',
    closed: false,
    shape: u => [lerp(-34, 34, u), lerp(-12, 16, u)],
    pos: t => { const k = pingpong(t, 11); return [lerp(-34, 34, k), lerp(-12, 16, k)]; },
  },
  {
    id: 'path-3', title: 'Kreis', difficulty: 3, focal: 50, duration: 30,
    desc: 'Gleichmäßige Kreisbewegung mit 50 mm.',
    closed: true,
    shape: u => [16 * Math.cos(TAU * u), 4 + 13 * Math.sin(TAU * u)],
    pos: t => { const a = TAU * t / 12; return [16 * Math.cos(a), 4 + 13 * Math.sin(a)]; },
  },
  {
    id: 'path-4', title: 'Acht', difficulty: 3, focal: 50, duration: 30,
    desc: 'Liegende Acht – Richtungswechsel auf beiden Achsen.',
    closed: true,
    shape: u => [28 * Math.sin(TAU * u), 4 + 10 * Math.sin(2 * TAU * u)],
    pos: t => { const a = TAU * t / 15; return [28 * Math.sin(a), 4 + 10 * Math.sin(2 * a)]; },
  },
  {
    id: 'path-wave', title: 'Welle', difficulty: 3, focal: 50, duration: 40,
    desc: 'Langer Schwenk, dabei wogt der Tilt auf und ab.',
    closed: false,
    shape: u => [lerp(-38, 38, u), 4 + 9 * Math.sin(TAU * 2.5 * u)],
    pos: t => { const k = pingpong(t, 20); return [lerp(-38, 38, k), 4 + 9 * Math.sin(TAU * 2.5 * k)]; },
  },
  {
    id: 'path-zigzag', title: 'Zickzack', difficulty: 3, focal: 35, duration: 32,
    desc: 'Harte Ecken: Der Tilt kehrt schlagartig um.',
    closed: false,
    shape: u => [lerp(-36, 36, u), 4 + 9 * tri(3 * u)],
    pos: t => { const k = pingpong(t, 16); return [lerp(-36, 36, k), 4 + 9 * tri(3 * k)]; },
  },
  {
    id: 'path-5', title: 'Wechselndes Tempo', difficulty: 4, focal: 50, duration: 32,
    desc: 'Ellipse, aber der Marker beschleunigt und bremst.',
    closed: true,
    shape: u => [34 * Math.cos(TAU * u), 4 + 14 * Math.sin(TAU * u)],
    pos: t => { const a = TAU * warp(t, 2.6, 0.32) / 13; return [34 * Math.cos(a), 4 + 14 * Math.sin(a)]; },
  },
  {
    id: 'path-stopgo', title: 'Stop & Go', difficulty: 4, focal: 50, duration: 32,
    desc: 'Der Marker fährt los, hält an, fährt weiter. Sauber anhalten!',
    closed: false,
    shape: u => [lerp(-40, 40, u), 2 + 8 * Math.sin(Math.PI * u)],
    pos: t => { const k = stopGo(t, 4, 4); return [lerp(-40, 40, k), 2 + 8 * Math.sin(Math.PI * k)]; },
  },
  {
    id: 'path-spiral', title: 'Spirale', difficulty: 4, focal: 50, duration: 40,
    desc: 'Von innen nach außen und zurück – der Radius ändert sich ständig.',
    closed: false,
    shape: u => { const a = TAU * 2 * u, r = 4 + 18 * u; return [1.4 * r * Math.cos(a), 4 + 0.75 * r * Math.sin(a)]; },
    pos: t => { const k = pingpong(t, 40), a = TAU * 2 * k, r = 4 + 18 * k; return [1.4 * r * Math.cos(a), 4 + 0.75 * r * Math.sin(a)]; },
  },
  {
    id: 'path-telecircle', title: 'Tele-Kreis', difficulty: 4, focal: 135, duration: 30,
    desc: 'Kleiner Kreis mit 135 mm – jede Unruhe ist sofort sichtbar.',
    closed: true,
    shape: u => [9 * Math.cos(TAU * u), 4 + 7 * Math.sin(TAU * u)],
    pos: t => { const a = TAU * t / 15; return [9 * Math.cos(a), 4 + 7 * Math.sin(a)]; },
  },
  {
    id: 'path-6', title: 'Profi-Acht', difficulty: 5, focal: 85, duration: 35,
    desc: 'Acht mit 85 mm und unruhigem Tempo.',
    closed: true,
    shape: u => [22 * Math.sin(TAU * u), 4 + 8 * Math.sin(2 * TAU * u)],
    pos: t => { const a = TAU * warp(t, 3.2, 0.27) / 14; return [22 * Math.sin(a), 4 + 8 * Math.sin(2 * a)]; },
  },
  {
    id: 'path-clover', title: 'Kleeblatt', difficulty: 5, focal: 85, duration: 40,
    desc: 'Vier Blätter durch die Mitte, mit 85 mm.',
    closed: true,
    shape: u => { const a = TAU * u, r = Math.cos(2 * a); return [26 * r * Math.cos(a), 4 + 15 * r * Math.sin(a)]; },
    pos: t => { const a = TAU * t / 26, r = Math.cos(2 * a); return [26 * r * Math.cos(a), 4 + 15 * r * Math.sin(a)]; },
  },
];

const RUN_ROUTE = [[-28, -13], [-10, -13.3], [8, -13], [20, -15], [26, -22], [22, -30], [10, -33], [-2, -28],
  [-14, -31], [-26, -26], [-32, -18]];
const WALK_ROUTE = [[-22, -13], [0, -13.2], [22, -13], [27, -18], [12, -21], [-12, -21], [-27, -18]];
const BIKE_ROUTE = [[-45, -10], [0, -10], [45, -10], [51, -12.8], [45, -15.5], [0, -15.5], [-45, -15.5], [-51, -12.8]];

export const TRACK_LEVELS = [
  {
    id: 'track-walker', title: 'Spaziergänger', difficulty: 1, focal: 35, duration: 25,
    desc: 'Zum Aufwärmen: ein Fußgänger in gemütlichem Tempo.',
    kind: 'person', opts: { route: WALK_ROUTE, vmax: 1.7, shirt: 0x4f8fc0, steady: true },
  },
  {
    id: 'track-1', title: 'Auto auf dem Rundkurs', difficulty: 1, focal: 35, duration: 30,
    desc: 'Ein Auto fährt Runden auf dem Platz.',
    kind: 'car', opts: { route: 'oval', color: 0xd13b2a, vmax: 10, aLat: 3, acc: 2.5, brake: 4 },
  },
  {
    id: 'track-2', title: 'Läufer', difficulty: 2, focal: 50, duration: 30,
    desc: 'Ein Jogger mit wechselndem Tempo.',
    kind: 'person', opts: { route: RUN_ROUTE, vmax: 6.2, shirt: 0xe8641e },
  },
  {
    id: 'track-bike', title: 'Radfahrer', difficulty: 3, focal: 50, duration: 34,
    desc: 'Fährt dicht an der Kamera vorbei und kommt zurück.',
    kind: 'bike', opts: { route: BIKE_ROUTE, vmax: 6, aLat: 3 },
  },
  {
    id: 'track-3', title: 'Drohne', difficulty: 3, focal: 35, duration: 30,
    desc: 'Eine Drohne kreist über dem Platz – Tilt ist gefragt.',
    kind: 'drone', opts: { flight: 'calm' },
  },
  {
    id: 'track-launch', title: 'Start & Landung', difficulty: 3, focal: 35, duration: 30,
    desc: 'Die Drohne steigt vom Boden auf und landet wieder – viel Tilt.',
    kind: 'drone', opts: { flight: 'launch' },
  },
  {
    id: 'track-ball', title: 'Springender Ball', difficulty: 4, focal: 35, duration: 30,
    desc: 'Hüpft über den Platz. Der Tilt muss im Rhythmus bleiben.',
    kind: 'ball',
  },
  {
    id: 'track-4', title: 'Verfolgungsjagd', difficulty: 4, focal: 50, duration: 35,
    desc: 'Schnelles Auto um den Block. Tipp: Gang 3.',
    kind: 'car', opts: { route: 'block', color: 0x1f6fd1, vmax: 17, aLat: 6.5, acc: 4, brake: 7 },
  },
  {
    id: 'track-runner-tele', title: 'Läufer im Tele', difficulty: 4, focal: 85, duration: 30,
    desc: 'Derselbe Jogger, aber mit 85 mm.',
    kind: 'person', opts: { route: RUN_ROUTE, vmax: 6.2, shirt: 0x9b3fd1 },
  },
  {
    id: 'track-car-tele', title: 'Rundkurs im Tele', difficulty: 5, focal: 85, duration: 30,
    desc: 'Schnelleres Auto auf dem Rundkurs, mit 85 mm.',
    kind: 'car', opts: { route: 'oval', color: 0xe0b13c, vmax: 12, aLat: 4, acc: 3, brake: 5 },
  },
  {
    id: 'track-5', title: 'Drohnen-Akrobatik', difficulty: 5, focal: 85, duration: 35,
    desc: 'Unberechenbare Flugbahn mit 85 mm.',
    kind: 'drone', opts: { flight: 'wild' },
  },
];

// =====================================================================
// Kranfahrt: Die Kamera bewegt sich (Kran, Dolly, Kamera-Auto), das Ziel auch
// =====================================================================
const BLOCK_ROUTE = [[40, -10], [0, -10], [-40, -10], [-60, -12], [-67, -20], [-68, -45], [-66, -70], [-56, -76],
  [0, -76], [56, -76], [66, -70], [68, -45], [67, -20], [60, -12]];

export const CRANE_LEVELS = [
  {
    id: 'crane-rise', title: 'Kran hoch', difficulty: 1, focal: 35, duration: 26,
    desc: 'Der Kran hebt die Kamera auf 9 m und senkt sie wieder. Ziel: ein Spaziergänger.',
    crane: 'rise',
  },
  {
    id: 'crane-swing', title: 'Kranschwenk', difficulty: 2, focal: 35, duration: 30,
    desc: 'Der Kranarm schwenkt über die Straße, das Auto fährt auf dem Rundkurs.',
    crane: 'swing',
  },
  {
    id: 'crane-dolly', title: 'Dolly-Fahrt', difficulty: 3, focal: 35, duration: 30,
    desc: 'Die Kamera fährt auf Schienen am Gehweg entlang und begleitet den Läufer.',
    crane: 'dolly',
  },
  {
    id: 'crane-parallel', title: 'Parallelfahrt', difficulty: 3, focal: 24, duration: 30,
    desc: 'Kamera-Auto fährt neben dem Zielauto her. Das Ziel zieht vor und fällt zurück.',
    crane: 'parallel', opts: { relA: 5, relB: 2.5, f: 1.3, lift: 0, sway: 0 },
  },
  {
    id: 'crane-chase', title: 'Verfolgerfahrt', difficulty: 4, focal: 50, duration: 36,
    desc: 'Das Kamera-Auto folgt dem Ziel um den Block. In den Kurven wandert es aus dem Bild.',
    crane: 'chase',
  },
  {
    id: 'crane-parallel-arm', title: 'Parallelfahrt mit Kran', difficulty: 5, focal: 35, duration: 32,
    desc: 'Nebenher fahren, während der Kran hebt, senkt und ausschwenkt.',
    crane: 'parallel', opts: { relA: 7, relB: 3, f: 1.5, lift: 1.6, sway: 1.0 },
  },
];

function createCraneTarget(level, group) {
  const camPos = new THREE.Vector3();
  const kind = level.crane;

  // Varianten mit einem Ziel aus "Ziel verfolgen" und einer festen Kamerabahn
  const simple = {
    rise: {
      target: { kind: 'person', opts: { route: WALK_ROUTE, vmax: 1.7, shirt: 0x4f8fc0, steady: true } },
      cam: t => camPos.set(0, 1.7 + 7.5 * smooth(pingpong(t, 26)), 0),
    },
    swing: {
      target: { kind: 'car', opts: { route: 'oval', color: 0xd13b2a, vmax: 10, aLat: 3, acc: 2.5, brake: 4 } },
      cam: t => { const a = 0.9 * Math.sin(0.3 * t); return camPos.set(9 * Math.sin(a), 5 + 2.5 * Math.sin(0.21 * t), 4 - 9 * Math.cos(a)); },
    },
    dolly: {
      target: { kind: 'person', opts: { route: RUN_ROUTE, vmax: 6.2, shirt: 0xe8641e } },
      cam: t => camPos.set(lerp(-18, 18, pingpong(t, 30)), 1.8, -3),
    },
  }[kind];
  if (simple) {
    const obj = createTrackTarget(simple.target, group);
    simple.cam(0);
    return {
      target: obj.target, camPos,
      update(t, dt) { obj.update(t, dt); simple.cam(t); },
    };
  }

  const target = new THREE.Vector3();

  if (kind === 'parallel') {
    // Beide fahren die Hauptstraße entlang (+X). Das Ziel pendelt relativ zur Kamera vor und zurück.
    const o = level.opts;
    const car = makeCar(0xd13b2a);
    group.add(car);
    const V = 9.5, X0 = -140;
    const rel = t => o.relA * Math.sin(0.3 * o.f * t + 0.4) + o.relB * Math.sin(0.75 * o.f * t + 1);
    return {
      target, camPos,
      update(t, dt) {
        const base = X0 + V * t;
        const x = base + rel(t);
        car.position.set(x, 0, -10.4);
        car.rotation.y = 0;
        spinWheels(car, V + (rel(t + 0.05) - rel(t)) / 0.05, dt);
        target.set(x, 1.0, -10.4);
        camPos.set(base, 2.2 + o.lift * (1 + Math.sin(0.45 * t - 1.2)), -4.4 + o.sway * (1 + Math.sin(0.33 * t - 1.5)));
      },
    };
  }

  // chase: Kamera-Auto fährt dem Ziel auf derselben Strecke hinterher
  const car = makeCar(0x1f6fd1);
  group.add(car);
  const cfg = { vmax: 13, aLat: 5, acc: 3.5, brake: 6 };
  const lead = new CurveFollower(BLOCK_ROUTE, cfg);
  const cam = new CurveFollower(BLOCK_ROUTE, cfg);
  lead.s = 34; lead.sample();
  cam.s = 14; cam.sample();
  return {
    target, camPos,
    update(t, dt) {
      if (dt > 0) { lead.advance(dt); cam.advance(dt, 1 + 0.12 * Math.sin(0.4 * t)); }
      // Abstand begrenzen, damit das Kamera-Auto weder auffährt noch abreißt
      const gap = lead.s - cam.s;
      if (gap < 14) { cam.s = lead.s - 14; cam.sample(); }
      if (gap > 28) { cam.s = lead.s - 28; cam.sample(); }
      car.position.copy(lead.pos);
      car.rotation.y = Math.atan2(-lead.tan.z, lead.tan.x);
      spinWheels(car, lead.speed, dt);
      target.set(lead.pos.x, 1.0, lead.pos.z);
      camPos.set(cam.pos.x, 2.6 + 0.5 * Math.sin(0.5 * t), cam.pos.z);
    },
  };
}

export const MODES = {
  free:  { id: 'free',  title: 'Freies Filmen', desc: 'Schwenke frei über das Filmset. Kein Score.' },
  path:  { id: 'path',  title: 'Weg folgen',    desc: 'Halte den Marker auf dem Pfad im Fadenkreuz.', levels: PATH_LEVELS },
  track: { id: 'track', title: 'Ziel verfolgen', desc: 'Halte Auto, Läufer und Drohne im Bild.', levels: TRACK_LEVELS },
  crane: { id: 'crane', title: 'Kranfahrt', desc: 'Die Kamera fährt selbst – halte das Ziel trotzdem im Fadenkreuz.', levels: CRANE_LEVELS },
};

export function findLevel(id) {
  return [...PATH_LEVELS, ...TRACK_LEVELS, ...CRANE_LEVELS].find(l => l.id === id) || null;
}

export function nextLevel(id) {
  for (const list of [PATH_LEVELS, TRACK_LEVELS, CRANE_LEVELS]) {
    const i = list.findIndex(l => l.id === id);
    if (i >= 0) return list[i + 1] || null;
  }
  return null;
}

// =====================================================================
// Kurvenfolger mit realistischem Geschwindigkeitsprofil
// =====================================================================
class CurveFollower {
  /**
   * @param {number[][]} pts  [x, z]-Punkte, geschlossene Kurve
   * @param {object} o vmax (m/s), aLat (m/s², Kurvengrenze), acc, brake (m/s²), cap(x,z) optionale Tempogrenze
   */
  constructor(pts, { vmax, aLat, acc = 3, brake = 5, cap = null, y = 0 }) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
    this.length = this.curve.getLength();
    const N = 600;
    this.N = N;
    const ds = this.length / N;
    const v = new Float32Array(N);
    const ta = new THREE.Vector3(), tb = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / N, du = 1.5 / N;
      this.curve.getTangentAt((u - du + 1) % 1, ta);
      this.curve.getTangentAt((u + du) % 1, tb);
      const kappa = ta.angleTo(tb) / (2 * du * this.length);
      let lim = kappa > 1e-5 ? Math.sqrt(aLat / kappa) : vmax;
      lim = Math.min(lim, vmax);
      if (cap) { this.curve.getPointAt(u, p); lim = Math.min(lim, cap(p.x, p.z)); }
      v[i] = lim;
    }
    // Bremsen vorausschauend (rückwärts), Beschleunigen begrenzt (vorwärts); 2 Runden für den Ringschluss
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % N] ** 2 + 2 * brake * ds));
      for (let i = 0; i < N; i++) v[i] = Math.min(v[i], Math.sqrt(v[(i - 1 + N) % N] ** 2 + 2 * acc * ds));
    }
    this.v = v;
    this.s = 0;
    this.speed = v[0];
    this.pos = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    this.sample();
  }

  speedAt(s) {
    const f = ((s / this.length) % 1) * this.N;
    const i = Math.floor(f), k = f - i;
    return lerp(this.v[i % this.N], this.v[(i + 1) % this.N], k);
  }

  advance(dt, mul = 1) {
    this.speed = this.speedAt(this.s) * mul;
    this.s += this.speed * dt;
    this.sample();
  }

  sample() {
    const u = ((this.s / this.length) % 1 + 1) % 1;
    this.curve.getPointAt(u, this.pos);
    this.curve.getTangentAt(u, this.tan);
  }
}

// =====================================================================
// Ziel-Erzeugung für "Ziel verfolgen"
// =====================================================================
function makeBike() {
  const g = new THREE.Group(); // schaut nach +Z
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 12).rotateZ(Math.PI / 2);
  const wheels = [];
  for (const z of [-0.52, 0.52]) {
    const w = new THREE.Mesh(wheelGeo, lam(0x141518));
    w.position.set(0, 0.34, z);
    g.add(w); wheels.push(w);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), lam(0x2fae6b));
  frame.position.y = 0.62;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), lam(0x1c1d20));
  bar.position.set(0, 1.0, 0.45);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), lam(0x2fae6b));
  stem.position.set(0, 0.8, 0.45);
  const rider = makePerson({ shirt: 0xf2d13a, pants: 0x1c2230 });
  rider.position.set(0, 0.12, -0.15);
  g.add(frame, bar, stem, rider);
  g.userData = { wheels, rider };
  return g;
}

function createTrackTarget(level, group) {
  const target = new THREE.Vector3();
  const kind = level.kind, o = level.opts || {};

  if (kind === 'car') {
    const car = makeCar(o.color);
    group.add(car);
    let pts, cap = null;
    if (o.route === 'block') {
      pts = [[40, -10], [0, -10], [-40, -10], [-60, -12], [-67, -20], [-68, -45], [-66, -70], [-56, -76],
        [0, -76], [56, -76], [66, -70], [68, -45], [67, -20], [60, -12]];
      cap = (x, z) => (z > -14 ? (x < -8 && x > -22 ? 4 : 9) : 99);
    } else {
      pts = [];
      for (let i = 0; i < 20; i++) {
        const a = Math.PI / 2 - (i / 20) * TAU; // Start vorne
        pts.push([31 * Math.cos(a), -44 + 19 * Math.sin(a)]);
      }
    }
    const f = new CurveFollower(pts, { vmax: o.vmax, aLat: o.aLat, acc: o.acc, brake: o.brake, cap });
    return {
      target,
      update(t, dt) {
        if (dt > 0) f.advance(dt);
        car.position.copy(f.pos);
        car.rotation.y = Math.atan2(-f.tan.z, f.tan.x);
        spinWheels(car, f.speed, dt);
        target.set(f.pos.x, 1.0, f.pos.z);
      },
    };
  }

  if (kind === 'person') {
    const p = makePerson({ shirt: o.shirt, pants: 0x1c2230, hair: 0x1a1410 });
    group.add(p);
    const f = new CurveFollower(o.route, { vmax: o.vmax, aLat: 4, acc: 2.5, brake: 4 });
    let phase = 0;
    return {
      target,
      update(t, dt) {
        // Tempowechsel: Sprints und Verschnaufen (Spaziergänger bleibt gleichmäßig)
        const mul = o.steady ? 1 : 0.72 + 0.22 * Math.sin(t * 0.55) + 0.12 * Math.sin(t * 1.7 + 1);
        if (dt > 0) f.advance(dt, mul);
        const ground = f.pos.z > -14 && f.pos.z < -11.9 ? 0.15 : 0; // Gehweg
        p.position.set(f.pos.x, ground, f.pos.z);
        p.rotation.y = Math.atan2(f.tan.x, f.tan.z);
        phase += f.speed * dt * (o.steady ? 3.4 : 2.4);
        animatePerson(p, phase, Math.min(1.1, 0.4 + f.speed * 0.15));
        target.set(f.pos.x, ground + 1.25, f.pos.z);
      },
    };
  }

  if (kind === 'bike') {
    const b = makeBike();
    group.add(b);
    const f = new CurveFollower(o.route, { vmax: o.vmax, aLat: o.aLat, acc: 1.5, brake: 3 });
    let phase = 0;
    return {
      target,
      update(t, dt) {
        if (dt > 0) f.advance(dt);
        b.position.copy(f.pos);
        b.rotation.y = Math.atan2(f.tan.x, f.tan.z);
        for (const w of b.userData.wheels) w.rotation.x += (f.speed / 0.34) * dt;
        phase += f.speed * dt * 1.2;
        animatePerson(b.userData.rider, phase, 0.45);
        b.userData.rider.userData.parts.torso.rotation.x = 0.35;
        target.set(f.pos.x, 1.2, f.pos.z);
      },
    };
  }

  if (kind === 'ball') {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), lam(0xe63946));
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    group.add(ball, shadow);
    return {
      target,
      update(t) {
        const x = 22 * Math.sin(0.35 * t), z = -24 + 4 * Math.sin(0.2 * t);
        const y = 0.55 + 6 * Math.abs(Math.sin(Math.PI * t / 1.6));
        ball.position.set(x, y, z);
        ball.rotation.set(t * 2, 0, -x * 0.8);
        shadow.position.set(x, 0.03, z);
        shadow.scale.setScalar(1 - Math.min(0.6, y * 0.08));
        target.copy(ball.position);
      },
    };
  }

  // Drohnen
  const d = makeDrone(o.flight === 'wild' ? 1.5 : 1.6);
  group.add(d);
  const flights = {
    wild: t => (t *= 0.85, new THREE.Vector3(
      26 * Math.sin(0.37 * t) + 4 * Math.sin(1.31 * t + 0.5),
      9 + 5 * Math.sin(0.61 * t + 1) + 1.5 * Math.sin(1.9 * t),
      -26 + 9 * Math.sin(0.53 * t + 0.3) + 3 * Math.cos(1.1 * t))),
    calm: t => new THREE.Vector3(
      24 * Math.sin(0.28 * t),
      10 + 4 * Math.sin(0.43 * t + 1),
      -34 + 11 * Math.sin(0.55 * t)),
    // Vom Boden auf 15 m und zurück, zweimal pro Level
    launch: t => new THREE.Vector3(
      18 * Math.sin(0.2 * t),
      0.6 + 14.5 * smooth(0.5 - 0.5 * Math.cos(TAU * t / 15)),
      -26 + 5 * Math.sin(0.31 * t)),
  };
  const posAt = flights[o.flight] || flights.calm;
  return {
    target,
    update(t) {
      const p = posAt(t), q = posAt(t + 0.1);
      d.position.copy(p);
      const vx = (q.x - p.x) * 10, vz = (q.z - p.z) * 10;
      d.rotation.set(0, 0, 0);
      d.rotation.y = Math.atan2(vx, vz);
      d.rotateX(Math.min(0.35, Math.hypot(vx, vz) * 0.03));
      spinRotors(d, t);
      target.copy(p);
    },
  };
}

// =====================================================================
// Pfad-Darstellung für "Weg folgen"
// =====================================================================
function anglesToWorld(pan, tilt, out = new THREE.Vector3()) {
  return dirFromAngles(pan, tilt, out).multiplyScalar(PATH_RADIUS).add(CAMERA_POS);
}

function createPathTarget(level, group) {
  const pts = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    if (level.closed && i === N) break;
    const [p, t] = level.shape(i / N);
    pts.push(anglesToWorld(p, t));
  }
  const curve = new THREE.CatmullRomCurve3(pts, level.closed);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, N, 0.07, 6, level.closed),
    new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.55, depthTest: false, fog: false }),
  );
  tube.renderOrder = 10;
  group.add(tube);

  // Endpunkte bei offenen Pfaden markieren
  if (!level.closed) {
    for (const u of [0, 1]) {
      const [p, t] = level.shape(u);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xe8a33d, depthTest: false, transparent: true, opacity: 0.8 }));
      cap.position.copy(anglesToWorld(p, t));
      cap.renderOrder = 10;
      group.add(cap);
    }
  }

  const marker = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, depthTest: false, transparent: true }));
  core.renderOrder = ring.renderOrder = 12;
  marker.add(core, ring);
  group.add(marker);

  const target = new THREE.Vector3();
  return {
    target,
    update(t) {
      const [p, tl] = level.pos(t);
      anglesToWorld(p, tl, target);
      marker.position.copy(target);
      marker.lookAt(CAMERA_POS);
      const pulse = 1 + 0.12 * Math.sin(t * 6);
      ring.scale.setScalar(pulse);
    },
  };
}

// =====================================================================
// Session
// =====================================================================
export const COUNTDOWN = 3;

export class LevelSession {
  constructor(scene, mode, level) {
    this.scene = scene;
    this.mode = mode;          // 'path' | 'track' | 'crane'
    this.level = level;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obj = mode === 'path' ? createPathTarget(level, this.group)
      : mode === 'crane' ? createCraneTarget(level, this.group)
      : createTrackTarget(level, this.group);
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.time = 0;
    this.obj.update(0, 0);
  }

  get target() { return this.obj.target; }
  get duration() { return this.level.duration; }

  /** Pan/Tilt, die auf die Startposition zeigen. */
  startAngles() { return anglesTo(this.obj.target, this.camPos || CAMERA_POS); }

  /** Bewegte Kameraposition (nur Kranfahrt), sonst null. */
  get camPos() { return this.obj.camPos || null; }

  update(dt) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'running'; this.countdown = 0; }
      return;
    }
    if (this.phase !== 'running') return;
    this.time = Math.min(this.duration, this.time + dt);
    this.obj.update(this.time, dt);
    if (this.time >= this.duration) this.phase = 'done';
  }

  dispose() {
    this.scene.remove(this.group);
    // Fahrzeug-/Figurenmodelle teilen Geometrie und Materialien mit der Welt -> nur Pfad-Objekte freigeben
    if (this.mode !== 'path') return;
    this.group.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}
