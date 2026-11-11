// Sucher-Overlay: Abdeckung außerhalb der Framelines, Framelines, Fadenkreuz,
// Zielbereich und Richtungspfeil. Außerdem Projektion des Ziels -> Abweichung.
import * as THREE from './vendor/three.module.min.js';

const tmp = new THREE.Vector3();

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.W = 1; this.H = 1;
  }

  resize(W, H) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
  }

  /**
   * Projiziert einen Weltpunkt und liefert Bildposition + Abweichung vom Bildmittelpunkt
   * in Anteilen der Bildbreite (Frameline-Breite).
   */
  measure(worldPos, camera, frame) {
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    tmp.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
    const inFront = tmp.z < -0.01;
    let sx, sy, dirX, dirY;
    if (inFront) {
      tmp.copy(worldPos).project(camera);
      sx = (tmp.x + 1) / 2 * this.W;
      sy = (1 - tmp.y) / 2 * this.H;
      dirX = sx - cx; dirY = sy - cy;
    } else {
      // Hinter der Kamera: Richtung aus dem Kameraraum, Abweichung maximal
      dirX = tmp.x; dirY = -tmp.y;
      if (Math.abs(dirX) < 1e-6 && Math.abs(dirY) < 1e-6) dirX = 1;
    }
    const err = inFront ? Math.min(0.5, Math.hypot(dirX, dirY) / frame.w) : 0.5;
    const visible = inFront && sx >= frame.x && sx <= frame.x + frame.w && sy >= frame.y && sy <= frame.y + frame.h;
    return { err, visible, sx, sy, dirX, dirY };
  }

  /**
   * @param {object} o
   *  frame: Bildrechteck, zone: Zielbereich-Radius (Anteil Bildbreite) oder 0,
   *  onTarget: bool, target: Ergebnis von measure() oder null, arrows: bool
   */
  draw(o) {
    const { ctx, dpr, W, H } = this;
    const f = o.frame;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Abdeckung außerhalb des Bildformats
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    if (f.y > 0.5) { ctx.fillRect(0, 0, W, f.y); ctx.fillRect(0, f.y + f.h, W, H - f.y - f.h); }
    if (f.x > 0.5) { ctx.fillRect(0, f.y, f.x, f.h); ctx.fillRect(f.x + f.w, f.y, W - f.x - f.w, f.h); }
    if (o.matteOnly) return;

    // Framelines
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    // Ecken betont
    const L = Math.min(f.w, f.h) * 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [x, y, sx, sy] of [
      [f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1],
    ]) {
      const ix = x + sx * 1, iy = y + sy * 1;
      ctx.moveTo(ix, iy + sy * L); ctx.lineTo(ix, iy); ctx.lineTo(ix + sx * L, iy);
    }
    ctx.stroke();

    // Fadenkreuz
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const s = Math.max(10, f.h * 0.04), gap = s * 0.35;
    ctx.strokeStyle = o.onTarget ? 'rgba(120,230,140,0.95)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    // Zielbereich
    if (o.zone > 0) {
      const r = o.zone * f.w;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = o.onTarget ? 2 : 1.2;
      ctx.strokeStyle = o.onTarget ? 'rgba(120,230,140,0.9)' : 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Richtungspfeil, wenn das Ziel nicht im Bild ist
    const t = o.target;
    if (t && o.arrows && !t.visible) {
      const len = Math.hypot(t.dirX, t.dirY) || 1;
      const ux = t.dirX / len, uy = t.dirY / len;
      // Schnittpunkt mit dem (etwas eingerückten) Bildrand
      const hw = f.w / 2 - 34, hh = f.h / 2 - 34;
      const k = Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
      const ax = cx + ux * k, ay = cy + uy * k;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(uy, ux));
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13);
      ctx.closePath();
      ctx.fillStyle = 'rgba(232,163,61,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }
  }
}
