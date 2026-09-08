/* audio.js — suoni di gioco sintetizzati con la Web Audio API.
 *
 * Niente file audio: tutti gli effetti sono generati al volo (oscillatori +
 * inviluppi). Rispetta l'impostazione `suoni`. Va sbloccato al primo gesto
 * utente (audio.init()).
 *
 * Uso: import audio from './audio.js';
 *      audio.init();  audio.suono('cattura');
 */

import { stato } from './state.js';

let ctx = null;
let master = null;

function attivo() { return stato().impostazioni?.suoni !== false; }
// Volume effetti (0..1) dalle impostazioni; default 0.5.
function volEffetti() {
  const v = stato().impostazioni?.volumeEffetti;
  return (typeof v === 'number') ? Math.max(0, Math.min(1, v)) : 0.5;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volEffetti();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Riallinea il volume effetti al valore corrente delle impostazioni (live). */
export function applicaVolume() {
  if (master) { try { master.gain.value = volEffetti(); } catch { /* niente */ } }
}

export function init() {
  const sblocca = () => { ac(); window.removeEventListener('pointerdown', sblocca); window.removeEventListener('touchstart', sblocca); };
  window.addEventListener('pointerdown', sblocca, { once: true });
  window.addEventListener('touchstart', sblocca, { once: true });
}

// Un singolo tono con inviluppo ed eventuale glissando.
function tono(freq, dur, opt = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + (opt.ritardo || 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opt.tipo || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opt.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.slideTo), t0 + dur);
  const vol = opt.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + (opt.attacco ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function rumore(dur, opt = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + (opt.ritardo || 0);
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const dati = buf.getChannelData(0);
  for (let i = 0; i < n; i++) dati[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = opt.vol ?? 0.15;
  const filtro = c.createBiquadFilter(); filtro.type = 'bandpass'; filtro.frequency.value = opt.freq || 1200;
  src.connect(filtro); filtro.connect(g); g.connect(master);
  src.start(t0);
}

// Libreria effetti.
const SUONI = {
  tocco: () => tono(520, 0.08, { tipo: 'triangle', vol: 0.12 }),
  mossa: () => { tono(180, 0.12, { tipo: 'square', vol: 0.18, slideTo: 90 }); rumore(0.1, { freq: 800, vol: 0.1 }); },
  mossaSpeciale: () => { tono(440, 0.12, { tipo: 'sawtooth', vol: 0.15 }); tono(660, 0.16, { tipo: 'sine', vol: 0.12, ritardo: 0.06 }); },
  colpito: () => { rumore(0.14, { freq: 500, vol: 0.18 }); tono(120, 0.12, { tipo: 'square', vol: 0.14, slideTo: 70 }); },
  stellina: () => { tono(880, 0.09, { tipo: 'sine', vol: 0.14 }); tono(1320, 0.12, { tipo: 'sine', vol: 0.1, ritardo: 0.05 }); },
  lancio: () => { tono(300, 0.25, { tipo: 'sine', vol: 0.14, slideTo: 900 }); rumore(0.2, { freq: 1500, vol: 0.08 }); },
  cattura: () => { [523, 659, 784].forEach((f, i) => tono(f, 0.16, { tipo: 'triangle', vol: 0.16, ritardo: i * 0.1 })); tono(1046, 0.3, { tipo: 'sine', vol: 0.16, ritardo: 0.32 }); },
  stanco: () => tono(330, 0.5, { tipo: 'sine', vol: 0.14, slideTo: 110 }),
  vittoria: () => { [523, 659, 784, 1046].forEach((f, i) => tono(f, 0.22, { tipo: 'triangle', vol: 0.18, ritardo: i * 0.12 })); },
  sblocco: () => { [392, 523, 659].forEach((f, i) => tono(f, 0.18, { tipo: 'sine', vol: 0.16, ritardo: i * 0.1 })); },
  // Evoluzione: glissando ascendente lungo + arpeggio risonante finale.
  evoluzione: () => { tono(196, 1.6, { tipo: 'sine', vol: 0.16, slideTo: 784 }); [523, 659, 784, 1046, 1318].forEach((f, i) => tono(f, 0.4, { tipo: 'triangle', vol: 0.13, ritardo: 1.1 + i * 0.09 })); },
  evolveStart: () => tono(330, 0.8, { tipo: 'sine', vol: 0.14, slideTo: 130 }),
};

export function suono(nome) {
  if (!attivo()) return;
  const fn = SUONI[nome];
  if (fn) { try { fn(); } catch (e) { /* audio non critico */ } }
}

// #74 — Leitmotiv per Lumino: un motivetto di 3 note RICONOSCIBILE e SEMPRE uguale
// per una data specie (derivato da un hash del nome), su scala pentatonica dolce.
const PENTA = [392, 440, 523, 587, 659, 784, 880];   // Sol-La-Do-Re-Mi-Sol-La
export function motivo(seed) {
  if (!attivo()) return;
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  try {
    for (let i = 0; i < 3; i++) {
      const f = PENTA[(h >> (i * 4)) % PENTA.length];
      tono(f, 0.18, { tipo: 'triangle', vol: 0.13, ritardo: i * 0.13 });
    }
  } catch (e) { /* audio non critico */ }
}

export default { init, suono, motivo, applicaVolume };
