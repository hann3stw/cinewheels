// CineWheels – Einstieg: Renderer, Game-Loop, Zustandsverwaltung.
import * as THREE from './vendor/three.module.min.js';
import { settings, onSettingsChange } from './settings.js';
import { CameraRig, CAMERA_POS } from './camera.js';
import { WheelController } from './wheels.js';
import { Hud } from './hud.js';
import { buildWorld } from './scene.js';
import { LevelSession, MODES, findLevel, nextLevel } from './modes.js';
import { ScoreTracker, ZONE, getBest, submitBest } from './score.js';
import { UI } from './ui.js';

// ---------- Grundgerüst ----------
const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
const rig = new CameraRig();
const world = buildWorld(scene);
const hud = new Hud(document.getElementById('hud'));
const wheels = new WheelController(document.getElementById('game-ui'));
const score = new ScoreTracker();

const PIXEL_RATIO = { low: 1, mid: 1.5, high: 2 };

let W = 1, H = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[settings.quality] || 1.5));
  renderer.setSize(W, H, false);
  hud.resize(W, H);
  wheels.layout();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
onSettingsChange(resize);
resize();

// ---------- Zustand ----------
/** 'menu' | 'playing' | 'paused' | 'results' */
let state = 'menu';
let mode = null;          // 'free' | 'path' | 'track'
let level = null;
let session = null;
let simTime = 0;
let menuTime = 0;
let lastCountdownShown = null;

function frameRatio() { return settings.frameline === '1.78' ? 16 / 9 : 2.39; }

function clearSession() {
  if (session) { session.dispose(); session = null; }
}

function startFree() {
  clearSession();
  mode = 'free'; level = null;
  world.setAmbientVisible(true);
  rig.setPosition(CAMERA_POS);
  rig.setAngles(0, 0);
  rig.setFocal(35, true);
  wheels.stopAll();
  ui.showGame({ title: MODES.free.title, free: true, lensLocked: false });
  state = 'playing';
}

function startLevel(modeId, levelId) {
  clearSession();
  mode = modeId;
  level = findLevel(levelId);
  world.setAmbientVisible(false);
  session = new LevelSession(scene, modeId, level);
  rig.setPosition(session.camPos || CAMERA_POS);
  const a = session.startAngles();
  rig.setAngles(a.pan, a.tilt);
  rig.setFocal(level.focal, true);
  wheels.stopAll();
  score.reset();
  lastCountdownShown = null;
  const idx = MODES[modeId].levels.indexOf(level);
  ui.showGame({ title: `Level ${idx + 1} · ${level.title}`, free: false, lensLocked: true, focal: level.focal });
  state = 'playing';
}

function finishLevel() {
  state = 'results';
  ui.setCountdown(null);
  const res = score.result();
  const prev = getBest(level.id);
  const isBest = submitBest(level.id, res);
  ui.showResults({
    level, levelIndex: MODES[mode].levels.indexOf(level), res, isBest, prev,
    hasNext: !!nextLevel(level.id),
  });
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  wheels.stopAll();
  ui.showPause();
}

function resume() {
  if (state !== 'paused') return;
  ui.hidePause();
  wheels.consume(); // während der Pause gekurbelte Drehung verwerfen
  state = 'playing';
}

function toMenu() {
  clearSession();
  state = 'menu';
  mode = null; level = null;
  world.setAmbientVisible(true);
  rig.setPosition(CAMERA_POS);
  rig.setFocal(35, true);
  ui.showMenu();
}

const ui = new UI({
  startFree,
  startLevel,
  pause,
  resume,
  restart: () => { if (level) startLevel(mode, level.id); else startFree(); },
  toMenu,
  toLevels: () => { const m = mode; toMenu(); ui.showLevels(m); },
  next: () => { const n = level && nextLevel(level.id); if (n) startLevel(mode, n.id); },
  setFocal: (mm, instant) => { if (!(session && state === 'playing')) rig.setFocal(mm, instant); },
  center: () => { wheels.stopAll(); rig.setAngles(0, 0); },
});

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
// Ins Hochformat gedreht -> Spiel anhalten (der "Bitte drehen"-Hinweis liegt darüber)
window.matchMedia('(orientation: portrait)').addEventListener('change', e => { if (e.matches) pause(); });
// iOS: Pinch-Zoom und Kontextmenü unterbinden
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// ---------- Game-Loop ----------
let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
  prev = now;

  wheels.update(dt);
  const turn = wheels.consume();
  let target = null, onTarget = false;

  if (state === 'menu') {
    // Langsamer Kameraschwenk als Hintergrund
    menuTime += dt;
    rig.setAngles(-20 + Math.sin(menuTime * 0.05) * 50, 2 + Math.sin(menuTime * 0.08) * 3);
    simTime += dt;
    world.update(simTime, dt);
  } else if (state === 'playing') {
    simTime += dt;
    world.update(simTime, dt);
    if (session) {
      session.update(dt);
      if (session.camPos) rig.setPosition(session.camPos);
      if (session.phase === 'countdown') {
        // Während des Countdowns zeigt die Kamera auf den Start – Kurbeln wird ignoriert
        const a = session.startAngles();
        rig.setAngles(a.pan, a.tilt);
        showCountdown(Math.max(1, Math.ceil(session.countdown)));
      } else {
        rig.addPan(turn.pan);
        rig.addTilt(turn.tilt);
        showCountdown(session.time < 0.7 ? 'LOS' : null);
      }
    } else {
      rig.addPan(turn.pan);
      rig.addTilt(turn.tilt);
    }
  }

  rig.update(dt);
  rig.apply(W, H, frameRatio());

  if (session) {
    target = hud.measure(session.target, rig.camera, rig.frame);
    onTarget = target.err <= ZONE;
    if (state === 'playing' && session.phase === 'running') score.add(target.err, dt);
    if (state === 'playing') ui.setLive(session.phase === 'countdown' ? null : score.liveAcc, session.time / session.duration, onTarget && session.phase !== 'countdown');
    if (state === 'playing' && session.phase === 'done') finishLevel();
  }

  if (state !== 'menu') {
    hud.draw({ frame: rig.frame, zone: session ? ZONE : 0, onTarget, target, arrows: settings.guideArrows });
    ui.setReadouts(rig.focal, rig.panDisplay, rig.tilt);
  } else {
    hud.draw({ frame: rig.frame, zone: 0, onTarget: false, target: null, arrows: false, matteOnly: true });
  }

  renderer.render(scene, rig.camera);
}
requestAnimationFrame(frame);

function showCountdown(v) {
  if (v === lastCountdownShown) return;
  lastCountdownShown = v;
  ui.setCountdown(v);
}

// ---------- PWA ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service Worker nicht registriert:', err));
  });
}

// Debug-Zugriff für Tests in der Konsole
window.__cine = { renderer, rig, wheels, settings, startLevel, startFree, get state() { return state; }, get session() { return session; }, score };
