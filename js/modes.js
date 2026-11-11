// Spielmodi und Level: Freies Filmen, Weg folgen, Ziel verfolgen.
import * as THREE from './vendor/three.module.min.js';
import { dirFromAngles, anglesTo, CAMERA_POS } from './camera.js';
import { makeCar, spinWheels, makePerson, animatePerson, makeDrone, spinRotors } from './scene.js';

const TAU = Math.PI * 2;
const PATH_RADIUS = 25; // Abstand des Pfads von der Kamera (m)

// =====================================================================
// Level-Definitionen
// =====================================================================

const lerp = (a, b, k) => a + (b - a) * k;
const pingpong = (t, period) => 0.5 - 0.5 * Math.cos((TAU * t) / period); // 0 -> 1 -> 0, weich
/** Zeitverzerrung für wechselndes Tempo (monoton, solange amp*freq < 1). */
const warp = (t, amp, freq) => t + amp * Math.sin(freq * t);

export const PATH_LEVELS = [
  {
    id: 'path-1', title: 'Gerade Linie', difficulty: 1, focal: 35, duration: 28,
    desc: 'Ruhiger horizontaler Schwenk – nur das Pan-Wheel.',
    closed: false,
    shape: u => [lerp(-40, 40, u), 0],
    pos: t => [lerp(-40, 40, pingpong(t, 14)), 0],
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
    id: 'path-5', title: 'Wechselndes Tempo', difficulty: 4, focal: 50, duration: 32,
    desc: 'Ellipse, aber der Marker beschleunigt und bremst.',
    closed: true,
    shape: u => [34 * Math.cos(TAU * u), 4 + 14 * Math.sin(TAU * u)],
    pos: t => { const a = TAU * warp(t, 2.6, 0.32) / 13; return [34 * Math.cos(a), 4 + 14 * Math.sin(a)]; },
  },
  {
    id: 'path-6', title: 'Profi-Acht', difficulty: 5, focal: 85, duration: 35,
    desc: 'Acht mit 85 mm und unruhigem Tempo.',
    closed: true,
    shape: u => [22 * Math.sin(TAU * u), 4 + 8 * Math.sin(2 * TAU * u)],
    pos: t => { const a = TAU * warp(t, 3.2, 0.27) / 14; return [22 * Math.sin(a), 4 + 8 * Math.sin(2 * a)]; },
  },
];

export const TRACK_LEVELS = [
  {
    id: 'track-1', title: 'Auto auf dem Rundkurs', difficulty: 1, focal: 35, duration: 30,
    desc: 'Ein Auto fährt Runden auf dem Platz.', kind: 'car-oval',
  },
  {
    id: 'track-2', title: 'Läufer', difficulty: 2, focal: 50, duration: 30,
    desc: 'Ein Jogger mit wechselndem Tempo.', kind: 'runner',
  },
  {
    id: 'track-3', title: 'Drohne', difficulty: 3, focal: 35, duration: 30,
    desc: 'Eine Drohne kreist über dem Platz – Tilt ist gefragt.', kind: 'drone-calm',
  },
  {
    id: 'track-4', title: 'Verfolgungsjagd', difficulty: 4, focal: 50, duration: 35,
    desc: 'Schnelles Auto um den Block. Tipp: Gang 3.', kind: 'car-chase',
  },
  {
    id: 'track-5', title: 'Drohnen-Akrobatik', difficulty: 5, focal: 85, duration: 35,
    desc: 'Unberechenbare Flugbahn mit 85 mm.', kind: 'drone-wild',
  },
];

export const MODES = {
  free:  { id: 'free',  title: 'Freies Filmen', desc: 'Schwenke frei über das Filmset. Kein Score.' },
  path:  { id: 'path',  title: 'Weg folgen',    desc: 'Halte den Marker auf dem Pfad im Fadenkreuz.', levels: PATH_LEVELS },
  track: { id: 'track', title: 'Ziel verfolgen', desc: 'Halte Auto, Läufer und Drohne im Bild.', levels: TRACK_LEVELS },
};

export function findLevel(id) {
  return [...PATH_LEVELS, ...TRACK_LEVELS].find(l => l.id === id) || null;
}

export function nextLevel(id) {
  for (const list of [PATH_LEVELS, TRACK_LEVELS]) {
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
function createTrackTarget(kind, group) {
  const target = new THREE.Vector3();

  if (kind === 'car-oval' || kind === 'car-chase') {
    const chase = kind === 'car-chase';
    const car = makeCar(chase ? 0x1f6fd1 : 0xd13b2a);
    group.add(car);
    let pts;
    if (chase) {
      pts = [[40, -10], [0, -10], [-40, -10], [-60, -12], [-67, -20], [-68, -45], [-66, -70], [-56, -76],
        [0, -76], [56, -76], [66, -70], [68, -45], [67, -20], [60, -12]];
    } else {
      pts = [];
      for (let i = 0; i < 20; i++) {
        const a = Math.PI / 2 - (i / 20) * TAU; // Start vorne, Fahrt gegen den Uhrzeigersinn (von oben)
        pts.push([31 * Math.cos(a), -44 + 19 * Math.sin(a)]);
      }
    }
    const f = new CurveFollower(pts, chase
      ? { vmax: 17, aLat: 6.5, acc: 4, brake: 7, cap: (x, z) => (z > -14 ? (x < -8 && x > -22 ? 4 : 9) : 99) }
      : { vmax: 10, aLat: 3, acc: 2.5, brake: 4 });
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

  if (kind === 'runner') {
    const p = makePerson({ shirt: 0xe8641e, pants: 0x1c2230, hair: 0x1a1410 });
    group.add(p);
    const pts = [[-28, -13], [-10, -13.3], [8, -13], [20, -15], [26, -22], [22, -30], [10, -33], [-2, -28],
      [-14, -31], [-26, -26], [-32, -18]];
    const f = new CurveFollower(pts, { vmax: 6.2, aLat: 4, acc: 2.5, brake: 4, y: 0 });
    let phase = 0;
    return {
      target,
      update(t, dt) {
        // Tempowechsel: Sprints und Verschnaufen
        const mul = 0.72 + 0.22 * Math.sin(t * 0.55) + 0.12 * Math.sin(t * 1.7 + 1);
        if (dt > 0) f.advance(dt, mul);
        const ground = Math.abs(f.pos.z) < 14 && f.pos.z < -11.9 ? 0.15 : 0;
        p.position.set(f.pos.x, ground, f.pos.z);
        p.rotation.y = Math.atan2(f.tan.x, f.tan.z);
        phase += f.speed * dt * 2.4;
        animatePerson(p, phase, Math.min(1.1, 0.4 + f.speed * 0.15));
        target.set(f.pos.x, ground + 1.25, f.pos.z);
      },
    };
  }

  // Drohnen
  const wild = kind === 'drone-wild';
  const d = makeDrone(wild ? 1.5 : 1.6);
  group.add(d);
  const posAt = wild
    ? t => (t *= 0.85, new THREE.Vector3(
      26 * Math.sin(0.37 * t) + 4 * Math.sin(1.31 * t + 0.5),
      9 + 5 * Math.sin(0.61 * t + 1) + 1.5 * Math.sin(1.9 * t),
      -26 + 9 * Math.sin(0.53 * t + 0.3) + 3 * Math.cos(1.1 * t)))
    : t => new THREE.Vector3(
      24 * Math.sin(0.28 * t),
      10 + 4 * Math.sin(0.43 * t + 1),
      -34 + 11 * Math.sin(0.55 * t));
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
    this.mode = mode;          // 'path' | 'track'
    this.level = level;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obj = mode === 'path' ? createPathTarget(level, this.group) : createTrackTarget(level.kind, this.group);
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.time = 0;
    this.obj.update(0, 0);
  }

  get target() { return this.obj.target; }
  get duration() { return this.level.duration; }

  /** Pan/Tilt, die auf die Startposition zeigen. */
  startAngles() { return anglesTo(this.obj.target); }

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
