// Einstellungen: Defaults, Laden/Speichern in localStorage, Änderungs-Listener.

const KEY = 'cinewheels.settings.v1';

/** Gänge: Kamera-Grad pro voller Wheel-Umdrehung. */
export const GEARS = [
  { id: 1, label: '1', degPerRev: 15 },
  { id: 2, label: '2', degPerRev: 30 },
  { id: 3, label: '3', degPerRev: 60 },
];

export const DEFAULTS = {
  wheelMode: 'realistic',   // 'realistic' | 'direct'
  damping: 1.2,             // 1/s, Auslauf-Dämpfung im Realistisch-Modus
  pan:  { gear: 2, invert: false },
  tilt: { gear: 2, invert: false },
  wheelSize: 'M',           // 'S' | 'M' | 'L'
  swapWheels: false,
  frameline: '2.39',        // '2.39' | '1.78'
  guideArrows: true,        // Richtungspfeil, wenn Ziel außerhalb des Bildes
  quality: 'mid',           // 'low' | 'mid' | 'high'
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, over) {
  const out = clone(base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    if (base[k] && typeof base[k] === 'object') out[k] = { ...base[k], ...over[k] };
    else if (typeof over[k] === typeof base[k]) out[k] = over[k];
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return merge(DEFAULTS, raw ? JSON.parse(raw) : null);
  } catch {
    return clone(DEFAULTS);
  }
}

export const settings = load();
const listeners = new Set();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* privat / blockiert */ }
  for (const fn of listeners) fn(settings);
}

export function onSettingsChange(fn) { listeners.add(fn); }

export function resetSettings() {
  Object.assign(settings, clone(DEFAULTS));
  saveSettings();
}

export function gearOf(axis) {
  const g = settings[axis].gear;
  return GEARS.find(x => x.id === g) || GEARS[1];
}
