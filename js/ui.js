// DOM-Oberfläche: Menü, Levelauswahl, Einstellungen, Pause, Ergebnis, HUD-Anzeigen, Objektiv.
import { settings, saveSettings, resetSettings, onSettingsChange } from './settings.js';
import { FOCAL_PRESETS, FOCAL_MIN, FOCAL_MAX } from './camera.js';
import { MODES } from './modes.js';
import { getBest, resetBest } from './score.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function starsHtml(n, total = 3) {
  let s = '';
  for (let i = 0; i < total; i++) s += i < n ? '★' : '<span class="off">★</span>';
  return s;
}

function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }
function setPath(obj, path, v) {
  const keys = path.split('.'); const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
}

const focalToT = mm => Math.log(mm / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN);
const tToFocal = t => FOCAL_MIN * Math.pow(FOCAL_MAX / FOCAL_MIN, t);

export class UI {
  /**
   * @param {object} h Handler: startFree, startLevel(mode, id), pause, resume, restart, toMenu,
   *                   setFocal(mm), center(), next()
   */
  constructor(h) {
    this.h = h;
    this.gameUI = $('#game-ui');
    this.menu = $('#menu');
    this.levels = $('#levels');
    this.settingsModal = $('#settings');
    this.pauseModal = $('#pause');
    this.resultsModal = $('#results');
    this.helpModal = $('#help');
    this.countdownEl = $('#countdown');
    this.settingsReturn = null;
    this.ro = { focal: $('#ro-focal'), pan: $('#ro-pan'), tilt: $('#ro-tilt'), fmt: $('#ro-fmt') };
    this.st = { box: $('.status'), title: $('#st-title'), meter: $('#st-meter'), acc: $('#st-acc'), time: $('#st-time') };
    this.last = {};

    this.buildLens();
    this.bindMenu();
    this.bindSettings();
    this.bindModals();
    onSettingsChange(() => this.syncSettings());
    this.syncSettings();
    this.refreshMenuStars();
  }

  // ---------- Bildschirme ----------
  showMenu() {
    this.hideAll();
    this.menu.hidden = false;
    this.refreshMenuStars();
  }

  showLevels(modeId) {
    this.hideAll();
    const mode = MODES[modeId];
    this.levelsMode = modeId;
    $('#levels-title').textContent = mode.title;
    $('#levels-desc').textContent = mode.desc;
    const grid = $('#level-grid');
    grid.innerHTML = '';
    mode.levels.forEach((lv, i) => {
      const best = getBest(lv.id);
      const b = document.createElement('button');
      b.className = 'level-card';
      b.innerHTML = `
        <div class="lc-top"><span class="lc-num">LEVEL ${i + 1}</span>
          <span class="lc-diff">${[1, 2, 3, 4, 5].map(d => `<i class="${d <= lv.difficulty ? 'on' : ''}"></i>`).join('')}</span></div>
        <div class="lc-title">${lv.title}</div>
        <div class="lc-desc">${lv.desc}</div>
        <div class="lc-meta"><span>${lv.focal} mm · ${lv.duration} s</span>
          <span>${best ? `<span class="stars">${starsHtml(best.stars)}</span> ${best.accuracy.toFixed(1)} %` : '<span class="stars">' + starsHtml(0) + '</span>'}</span></div>`;
      b.addEventListener('click', () => this.h.startLevel(modeId, lv.id));
      grid.appendChild(b);
    });
    this.levels.hidden = false;
  }

  showGame({ title, free, lensLocked }) {
    this.hideAll();
    this.gameUI.hidden = false;
    this.st.title.textContent = title;
    this.st.box.classList.toggle('free', !!free);
    $('#btn-center').hidden = !free;
    $('#btn-restart').hidden = !!free;
    $('#lens').classList.toggle('locked', !!lensLocked);
    this.setLive(null, 0);
  }

  hideAll() {
    for (const el of [this.menu, this.levels, this.gameUI, this.pauseModal, this.resultsModal, this.settingsModal, this.helpModal]) el.hidden = true;
    this.countdownEl.hidden = true;
  }

  showPause() { this.pauseModal.hidden = false; }
  hidePause() { this.pauseModal.hidden = true; }
  get modalOpen() { return !this.pauseModal.hidden || !this.settingsModal.hidden || !this.resultsModal.hidden; }

  showResults({ level, levelIndex, res, isBest, prev, hasNext }) {
    $('#res-level').textContent = `Level ${levelIndex + 1} · ${level.title}`;
    $('#res-stars').innerHTML = starsHtml(res.stars);
    $('#res-best').hidden = !isBest;
    $('#res-acc').textContent = `${res.accuracy.toFixed(1)} %`;
    $('#res-err').textContent = `${res.avgError.toFixed(1)} %`;
    $('#res-in').textContent = `${res.timeIn.toFixed(1)} s`;
    $('#res-in-pct').textContent = `${res.timeInPct} % der Zeit`;
    $('#res-prev').textContent = prev ? `${prev.accuracy.toFixed(1)} %` : '–';
    $('#btn-res-next').hidden = !hasNext;
    this.resultsModal.hidden = false;
  }

  setCountdown(v) {
    if (v === null) { this.countdownEl.hidden = true; return; }
    this.countdownEl.hidden = false;
    this.countdownEl.textContent = v;
    this.countdownEl.classList.toggle('go', v === 'LOS');
  }

  refreshMenuStars() {
    for (const el of $$('[data-stars]')) {
      const mode = MODES[el.dataset.stars];
      let got = 0;
      for (const lv of mode.levels) got += (getBest(lv.id) || { stars: 0 }).stars;
      el.textContent = `★ ${got} / ${mode.levels.length * 3}`;
    }
  }

  // ---------- Laufende Anzeigen ----------
  setReadouts(focal, pan, tilt) {
    const f = Math.round(focal) + '';
    const fmt = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '°';
    const p = fmt(pan), t = fmt(tilt);
    if (this.last.f !== f) { this.ro.focal.textContent = f; this.last.f = f; this.syncPrimes(focal); }
    if (this.last.p !== p) { this.ro.pan.textContent = p; this.last.p = p; }
    if (this.last.t !== t) { this.ro.tilt.textContent = t; this.last.t = t; }
    const tt = focalToT(focal);
    if (this.last.zt === undefined || Math.abs(this.last.zt - tt) > 0.001) {
      this.last.zt = tt;
      this.zoomFill.style.width = (tt * 100) + '%';
      this.zoomThumb.style.left = (tt * 100) + '%';
    }
  }

  /** acc: 0..1 oder null (kein Score), progress: 0..1 */
  setLive(acc, progress, onTarget = false) {
    const a = acc === null ? '–' : Math.round(acc * 100) + ' %';
    if (this.last.a !== a) { this.st.acc.textContent = a; this.last.a = a; }
    this.st.meter.style.width = ((acc || 0) * 100).toFixed(1) + '%';
    this.st.meter.classList.toggle('good', onTarget);
    this.st.time.style.width = (progress * 100).toFixed(1) + '%';
  }

  // ---------- Objektiv ----------
  buildLens() {
    const primes = $('#primes');
    this.primeBtns = FOCAL_PRESETS.map(mm => {
      const b = document.createElement('button');
      b.className = 'prime';
      b.textContent = mm;
      b.addEventListener('click', () => this.h.setFocal(mm, false));
      primes.appendChild(b);
      return { mm, b };
    });
    const zoom = $('#zoom');
    const track = zoom.querySelector('.zoom-track');
    this.zoomFill = $('#zoom-fill');
    this.zoomThumb = $('#zoom-thumb');
    let pid = null;
    const setFromX = x => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (x - r.left) / r.width));
      this.h.setFocal(tToFocal(t), true);
    };
    zoom.addEventListener('pointerdown', e => {
      if (pid !== null) return;
      pid = e.pointerId;
      try { zoom.setPointerCapture(pid); } catch { /* egal */ }
      setFromX(e.clientX);
    });
    zoom.addEventListener('pointermove', e => { if (e.pointerId === pid) setFromX(e.clientX); });
    const end = e => { if (e.pointerId === pid) pid = null; };
    zoom.addEventListener('pointerup', end);
    zoom.addEventListener('pointercancel', end);
    zoom.addEventListener('lostpointercapture', end);
  }

  syncPrimes(focal) {
    for (const { mm, b } of this.primeBtns) b.classList.toggle('active', Math.abs(mm - focal) < 0.6);
  }

  // ---------- Menü & Buttons ----------
  bindMenu() {
    for (const card of $$('.mode-card')) {
      card.addEventListener('click', () => {
        const m = card.dataset.mode;
        if (m === 'free') this.h.startFree();
        else this.showLevels(m);
      });
    }
    $('#btn-levels-back').addEventListener('click', () => this.showMenu());
    $('#btn-settings-menu').addEventListener('click', () => this.openSettings());
    $('#btn-help').addEventListener('click', () => { this.helpModal.hidden = false; });

    const fsBtn = $('#btn-fullscreen');
    const de = document.documentElement;
    const canFs = !!(de.requestFullscreen || de.webkitRequestFullscreen) && !window.matchMedia('(display-mode: standalone)').matches;
    fsBtn.hidden = !canFs;
    fsBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          await (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
          try { await screen.orientation.lock('landscape'); } catch { /* nicht unterstützt */ }
        }
      } catch { /* abgelehnt */ }
    });

    $('#btn-pause').addEventListener('click', () => this.h.pause());
    $('#btn-center').addEventListener('click', () => this.h.center());
    this.ro.fmt.addEventListener('click', () => {
      settings.frameline = settings.frameline === '2.39' ? '1.78' : '2.39';
      saveSettings();
    });
    $('#btn-resume').addEventListener('click', () => this.h.resume());
    $('#btn-restart').addEventListener('click', () => this.h.restart());
    $('#btn-menu').addEventListener('click', () => this.h.toMenu());
    $('#btn-settings-pause').addEventListener('click', () => this.openSettings(this.pauseModal));
    $('#btn-res-retry').addEventListener('click', () => this.h.restart());
    $('#btn-res-next').addEventListener('click', () => this.h.next());
    $('#btn-res-levels').addEventListener('click', () => this.h.toLevels());
  }

  bindModals() {
    for (const m of [this.settingsModal, this.helpModal]) {
      m.querySelector('[data-close]').addEventListener('click', () => this.closeModal(m));
      m.addEventListener('click', e => { if (e.target === m) this.closeModal(m); });
    }
  }

  openSettings(returnTo = null) {
    this.settingsReturn = returnTo;
    if (returnTo) returnTo.hidden = true;
    this.settingsModal.hidden = false;
  }

  closeModal(m) {
    m.hidden = true;
    if (m === this.settingsModal && this.settingsReturn) {
      this.settingsReturn.hidden = false;
      this.settingsReturn = null;
    }
  }

  // ---------- Einstellungen ----------
  bindSettings() {
    for (const seg of $$('#settings .seg')) {
      const key = seg.dataset.setting, num = seg.dataset.type === 'number';
      for (const b of seg.querySelectorAll('button')) {
        b.addEventListener('click', () => {
          setPath(settings, key, num ? Number(b.dataset.value) : b.dataset.value);
          saveSettings();
        });
      }
    }
    for (const t of $$('#settings .toggle')) {
      const key = t.dataset.setting;
      t.addEventListener('click', () => { setPath(settings, key, !getPath(settings, key)); saveSettings(); });
    }
    const damp = $('#set-damping');
    damp.addEventListener('input', () => { settings.damping = Number(damp.value); saveSettings(); });
    $('#btn-reset-settings').addEventListener('click', () => resetSettings());
    $('#btn-reset-best').addEventListener('click', () => {
      if (confirm('Alle Bestwerte löschen?')) { resetBest(); this.refreshMenuStars(); }
    });
  }

  syncSettings() {
    for (const seg of $$('#settings .seg')) {
      const v = String(getPath(settings, seg.dataset.setting));
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.value === v);
    }
    for (const t of $$('#settings .toggle')) t.classList.toggle('on', !!getPath(settings, t.dataset.setting));
    const damp = $('#set-damping');
    if (Number(damp.value) !== settings.damping) damp.value = settings.damping;
    $('#row-damping').classList.toggle('disabled', settings.wheelMode !== 'realistic');
    this.ro.fmt.textContent = settings.frameline === '2.39' ? '2.39:1' : '16:9';
  }
}
