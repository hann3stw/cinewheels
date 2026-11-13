// Stativ-Kamera: feste Position, nur Pan und Tilt. Brennweite -> Bildwinkel (Super 35).
import * as THREE from './vendor/three.module.min.js';

/** Super 35 (ARRI, 3-perf/4-perf aktiv): Sensorbreite in mm. */
export const SENSOR_WIDTH_MM = 24.89;
export const FOCAL_PRESETS = [18, 24, 35, 50, 85, 135];
export const FOCAL_MIN = 18;
export const FOCAL_MAX = 135;
export const TILT_LIMIT = 80;
export const CAMERA_POS = new THREE.Vector3(0, 2.0, 0); // Stativ auf Podest

const DEG = Math.PI / 180;

/** Horizontaler Bildwinkel (Grad) für eine Brennweite auf Super 35. */
export function hfovForFocal(mm) {
  return 2 * Math.atan(SENSOR_WIDTH_MM / (2 * mm)) / DEG;
}

/** Richtungsvektor für Pan/Tilt in Grad. Pan 0 = Blick nach -Z, positiv = nach rechts. */
export function dirFromAngles(panDeg, tiltDeg, out = new THREE.Vector3()) {
  const p = panDeg * DEG, t = tiltDeg * DEG;
  return out.set(Math.sin(p) * Math.cos(t), Math.sin(t), -Math.cos(p) * Math.cos(t));
}

/** Pan/Tilt (Grad), die von der Kamera auf einen Weltpunkt zeigen. */
export function anglesTo(worldPos, from = CAMERA_POS) {
  const d = worldPos.clone().sub(from);
  const pan = Math.atan2(d.x, -d.z) / DEG;
  const tilt = Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG;
  return { pan, tilt };
}

/** Rechteck des gewählten Bildformats, eingepasst in den Viewport. */
export function frameRect(W, H, ratio) {
  let w = W, h = W / ratio;
  if (h > H) { h = H; w = H * ratio; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export class CameraRig {
  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1200);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(CAMERA_POS);
    this.pan = 0;
    this.tilt = 0;
    this.focal = 35;
    this.focalTarget = 35;
    this.frame = { x: 0, y: 0, w: 1, h: 1 };
  }

  /** Kameraposition setzen (Kran/Dolly); ohne Argument zurück aufs Stativ. */
  setPosition(v = CAMERA_POS) { this.camera.position.copy(v); }

  addPan(deg) { this.pan += deg; }
  addTilt(deg) { this.tilt = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, this.tilt + deg)); }

  setAngles(pan, tilt) {
    this.pan = pan;
    this.tilt = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, tilt));
  }

  /** Brennweite setzen; instant=false fährt weich hin (wie ein Zoom). */
  setFocal(mm, instant = false) {
    this.focalTarget = Math.max(FOCAL_MIN, Math.min(FOCAL_MAX, mm));
    if (instant) this.focal = this.focalTarget;
  }

  /** Pan für die Anzeige auf -180..180 normiert. */
  get panDisplay() {
    let p = ((this.pan + 180) % 360 + 360) % 360 - 180;
    return p;
  }

  update(dt) {
    if (this.focal !== this.focalTarget) {
      // Glätten im log-Raum, damit sich der Zoom gleichmäßig anfühlt
      const a = Math.log(this.focal), b = Math.log(this.focalTarget);
      const k = 1 - Math.exp(-12 * dt);
      const n = a + (b - a) * k;
      this.focal = Math.abs(n - b) < 0.002 ? this.focalTarget : Math.exp(n);
    }
  }

  /** Kamera für Viewport und Bildformat konfigurieren. */
  apply(W, H, ratio) {
    const cam = this.camera;
    this.frame = frameRect(W, H, ratio);
    // Die Breite des Bildfensters entspricht der Sensorbreite.
    const halfH = Math.tan((hfovForFocal(this.focal) * DEG) / 2);
    const halfV = halfH * (H / this.frame.w);
    cam.fov = 2 * Math.atan(halfV) / DEG;
    cam.aspect = W / H;
    cam.rotation.y = -this.pan * DEG;
    cam.rotation.x = this.tilt * DEG;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
