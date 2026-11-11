// Laufende Messung der Abweichung, Auswertung, Sterne und Bestwerte.

const BEST_KEY = 'cinewheels.best.v1';

/** Abweichung (Anteil Bildbreite), ab der eine Messung 0 % Genauigkeit ergibt. */
export const ERR_FALLOFF = 0.2;
/** Radius des Zielbereichs (Anteil Bildbreite). */
export const ZONE = 0.05;
export const STAR_THRESHOLDS = [50, 70, 85]; // Genauigkeit in % für 1/2/3 Sterne

export class ScoreTracker {
  constructor() { this.reset(); }

  reset() {
    this.time = 0;
    this.errSum = 0;     // ∫ err dt
    this.accSum = 0;     // ∫ acc dt
    this.inZone = 0;     // Sekunden im Zielbereich
    this.lastErr = 0;
    this.lastAcc = 0;
    // geglättete Live-Anzeige
    this.liveAcc = 1;
  }

  add(err, dt) {
    if (dt <= 0) return;
    const acc = Math.max(0, Math.min(1, 1 - err / ERR_FALLOFF));
    this.time += dt;
    this.errSum += err * dt;
    this.accSum += acc * dt;
    if (err <= ZONE) this.inZone += dt;
    this.lastErr = err;
    this.lastAcc = acc;
    this.liveAcc += (acc - this.liveAcc) * (1 - Math.exp(-dt * 3));
  }

  get accuracy() { return this.time > 0 ? this.accSum / this.time : 0; }

  result() {
    const accuracy = Math.round(this.accuracy * 1000) / 10;              // %
    const avgError = this.time > 0 ? (this.errSum / this.time) * 100 : 0; // % Bildbreite
    const timeIn = this.inZone;
    const timeInPct = this.time > 0 ? (this.inZone / this.time) * 100 : 0;
    return {
      accuracy,
      avgError: Math.round(avgError * 10) / 10,
      timeIn: Math.round(timeIn * 10) / 10,
      timeInPct: Math.round(timeInPct),
      duration: Math.round(this.time * 10) / 10,
      stars: starsFor(accuracy),
    };
  }
}

export function starsFor(accuracy) {
  let s = 0;
  for (const t of STAR_THRESHOLDS) if (accuracy >= t) s++;
  return s;
}

// ---------- Bestwerte ----------
function loadAll() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}

export function getBest(levelId) {
  return loadAll()[levelId] || null;
}

/** Speichert, falls besser. Gibt true zurück, wenn ein neuer Bestwert erzielt wurde. */
export function submitBest(levelId, res) {
  const all = loadAll();
  const prev = all[levelId];
  if (prev && prev.accuracy >= res.accuracy) return false;
  all[levelId] = { ...res, date: new Date().toISOString() };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* blockiert */ }
  return true;
}

export function resetBest() {
  try { localStorage.removeItem(BEST_KEY); } catch { /* egal */ }
}
