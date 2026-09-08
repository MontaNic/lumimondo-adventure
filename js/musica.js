/* musica.js — musica di sottofondo Lumimondo Adventure.
 *
 * Una traccia in loop per scena (mappa / città / battaglia) con CROSSFADE morbido,
 * fanfara di vittoria one-shot, e DUCKING quando una voce parla. Volume base basso
 * per non coprire mai le voci. Toggle in `impostazioni.musica`.
 *
 * ⚠️ iOS: due trappole, ENTRAMBE risolte qui.
 *  1) `HTMLAudioElement.volume` è READ-ONLY su iPhone (resta al massimo).
 *  2) Anche il Web Audio con `MediaElementAudioSourceNode` + GainNode NON controlla il
 *     volume su iOS (limite WebKit storico): l'elemento suona a volume pieno e il gain
 *     viene IGNORATO → "lo slider non fa nulla, la musica copre tutto" (bug reale).
 * Soluzione DEFINITIVA: niente <audio>. Si DECODIFICANO gli MP3 in AudioBuffer e si
 * suonano via `AudioBufferSourceNode → GainNode → master`. I buffer source RISPETTANO
 * il gain anche su iOS → volume, crossfade e ducking finalmente corretti.
 *
 * API invariata: init() · suona() · suonaCitta() · ferma() · fanfara() · setDuck() · aggiorna()
 */

import { stato } from './state.js';

const BASE = 'assets/audio/musica/';
const TRACCE = { mappa: 'musica-mappa.mp3', citta: 'musica-citta.mp3', battaglia: 'musica-battaglia.mp3' };
const FANFARA_FILE = 'fanfara-vittoria.mp3';
const VOL_DUCK = 0.4;       // sotto una voce la musica si abbassa ma resta presente
const FADE = 0.7;           // durata crossfade/volume (secondi), rampa lineare
const VOL_MAX = 0.34;       // TETTO reale della musica: anche al 100% resta SOTTO voci/effetti

let ctx = null;             // AudioContext (Web Audio)
let master = null;          // GainNode master
const buffers = {};         // chiave -> AudioBuffer (decodificato)
const voci = {};            // chiave -> { gain: GainNode, src: AudioBufferSourceNode|null }
let fanfara_ = null;        // { gain, src } per la fanfara
let sbloccato = false;
let duck = false;
let chiaveCorrente = null;
let chiavePendente = null;

// --- Volume (slider 0..1 → curva percettiva sotto un tetto basso) ---------
/** Posizione dello slider Musica (0..1), default 0 = spenta. */
function sliderMusica() { const v = stato().impostazioni?.volumeMusica; return (typeof v === 'number') ? Math.max(0, Math.min(1, v)) : 0; }
/** Gain REALE della musica: curva percettiva (s²) sotto un tetto basso → il basso
 *  dello slider è davvero silenzioso e il massimo non copre mai voci/effetti. */
function volBase() { const s = sliderMusica(); return s <= 0.02 ? 0 : s * s * VOL_MAX; }
function musicaAttiva() { return stato().impostazioni?.musica !== false && volBase() > 0.0005; }
function targetLoop() { return musicaAttiva() ? volBase() * (duck ? VOL_DUCK : 1) : 0; }
function targetFanfara() { return musicaAttiva() ? Math.min(VOL_MAX * 1.25, volBase() * 1.3 * (duck ? VOL_DUCK : 1)) : 0; }

// --- Web Audio ------------------------------------------------------------
function creaCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination); } catch { ctx = null; }
  return ctx;
}

/** Scarica e DECODIFICA un MP3 in AudioBuffer (una volta). Best-effort. */
async function caricaBuffer(chiave, file) {
  if (buffers[chiave] || !ctx) return buffers[chiave] || null;
  try {
    const res = await fetch(BASE + file);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    // decodeAudioData con callback per compatibilità Safari (alcune versioni non
    // ritornano la Promise): wrappo io la Promise.
    const buf = await new Promise((ris, rif) => {
      try { const p = ctx.decodeAudioData(arr, ris, rif); if (p && p.then) p.then(ris, rif); } catch (e) { rif(e); }
    });
    if (buf) buffers[chiave] = buf;
    return buf || null;
  } catch { return null; }
}

/** Ritorna (creando una volta) il nodo gain di una traccia, collegato al master. */
function gainDi(chiave) {
  if (!voci[chiave]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); voci[chiave] = { gain: g, src: null }; }
  return voci[chiave];
}

/** Rampa lineare del gain verso `target` (immediato = salto secco). */
function fadeGain(g, target, immediato) {
  if (!g || !ctx) return;
  const t = ctx.currentTime;
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    if (immediato) g.gain.setValueAtTime(target, t);
    else g.gain.linearRampToValueAtTime(target, t + FADE);
  } catch { try { g.gain.value = target; } catch { /* niente */ } }
}

/** Avvia (se non già in play) la sorgente in loop della traccia. */
function avviaSorgente(chiave, rate) {
  const v = gainDi(chiave);
  if (v.src) { try { if (rate) v.src.playbackRate.value = rate; } catch { /* niente */ } return; }
  if (!buffers[chiave]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[chiave];
  src.loop = true;
  if (rate) { try { src.playbackRate.value = rate; } catch { /* niente */ } }
  src.connect(v.gain);
  try { src.start(0); } catch { /* niente */ }
  v.src = src;
}

/** Ferma la sorgente di una traccia poco DOPO il fade (così non taglia di netto). */
function stopSorgente(chiave) {
  const v = voci[chiave]; if (!v || !v.src) return;
  const src = v.src; v.src = null;
  setTimeout(() => { try { src.stop(); } catch { /* niente */ } try { src.disconnect(); } catch { /* niente */ } }, Math.round(FADE * 1000) + 200);
}

// --- Sblocco al primo gesto + prefetch buffer -----------------------------
export function init() {
  const sblocca = () => {
    if (sbloccato) return;
    sbloccato = true;
    creaCtx();
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch { /* niente */ } }
    if (ctx) {
      // Lazy: decodifico ORA solo la fanfara (piccola); le 3 tracce si decodificano alla
      // prima riproduzione (meno memoria/jank su iOS). Se c'è una traccia pendente, la
      // suono: suona() la carica da sé se il buffer non è pronto.
      caricaBuffer('_fanfara', FANFARA_FILE);
      if (chiavePendente) { const k = chiavePendente; chiavePendente = null; suona(k); }
    }
    window.removeEventListener('pointerdown', sblocca);
    window.removeEventListener('touchstart', sblocca);
  };
  window.addEventListener('pointerdown', sblocca);
  window.addEventListener('touchstart', sblocca);
}

// --- API -------------------------------------------------------------------
/** Crossfade verso la traccia di scena (loop). */
export function suona(chiave, opts = {}) {
  if (!TRACCE[chiave]) return;
  chiaveCorrente = chiave;
  if (!musicaAttiva()) { ferma(); return; }
  if (!sbloccato || !ctx) { chiavePendente = chiave; return; }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* niente */ } }
  if (!buffers[chiave]) {
    // Buffer non ancora pronto: caricalo e riprova (se è ancora la traccia voluta).
    chiavePendente = chiave;
    caricaBuffer(chiave, TRACCE[chiave]).then(() => { if (chiaveCorrente === chiave) { chiavePendente = null; suona(chiave, opts); } });
    return;
  }
  const rate = Math.max(0.85, Math.min(1.15, opts.rate || 1));
  // Le ALTRE tracce scendono a 0 e poi si fermano.
  for (const k in voci) if (k !== chiave) { fadeGain(voci[k].gain, 0); stopSorgente(k); }
  // Questa traccia: avvia (se serve) e sale al volume target.
  avviaSorgente(chiave, rate);
  fadeGain(gainDi(chiave).gain, targetLoop());
}

/** Tema di città con variazione per-id (#73). */
export function suonaCitta(id) {
  const rates = { pietropoli: 1.0, acquaverde: 0.92, terraverde: 1.04, voltopoli: 1.12, pietrasanta: 0.88, luminia: 1.08 };
  suona('citta', { rate: rates[id] || 1 });
}

/** Ferma (dissolvenza) la musica corrente + fanfara. */
export function ferma() {
  for (const k in voci) { fadeGain(voci[k].gain, 0); stopSorgente(k); }
  if (fanfara_) { fadeGain(fanfara_.gain, 0); }
}

/** Ducking: alza/abbassa la traccia corrente quando una voce parla. */
export function setDuck(on) {
  duck = !!on;
  if (chiaveCorrente && voci[chiaveCorrente]) fadeGain(voci[chiaveCorrente].gain, targetLoop());
  if (fanfara_ && fanfara_.src) fadeGain(fanfara_.gain, targetFanfara());
}

/** Fanfara di vittoria, una volta (no loop). Abbassa il loop di scena mentre suona. */
export function fanfara() {
  if (!musicaAttiva() || !sbloccato || !ctx || !buffers['_fanfara']) return;
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* niente */ } }
  if (chiaveCorrente && voci[chiaveCorrente]) fadeGain(voci[chiaveCorrente].gain, 0);
  if (!fanfara_) { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); fanfara_ = { gain: g, src: null }; }
  if (fanfara_.src) { try { fanfara_.src.stop(); } catch { /* niente */ } fanfara_.src = null; }
  const src = ctx.createBufferSource();
  src.buffer = buffers['_fanfara'];
  src.loop = false;
  src.connect(fanfara_.gain);
  src.onended = () => { fanfara_.src = null; if (chiaveCorrente && musicaAttiva()) suona(chiaveCorrente); };
  fanfara_.src = src;
  fadeGain(fanfara_.gain, targetFanfara(), true);
  try { src.start(0); } catch { /* niente */ }
}

/** Riallinea allo stato del toggle/volume impostazioni (chiamare dopo un cambio). */
export function aggiorna() {
  if (musicaAttiva()) { if (chiaveCorrente) suona(chiaveCorrente); }
  else ferma();
}

export default { init, suona, suonaCitta, ferma, setDuck, fanfara, aggiorna };
