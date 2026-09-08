/* voce.js — voce narrante Lumimondo Adventure.
 *
 * Pietro deve poter giocare senza saper leggere: ogni testo è ascoltabile.
 * Sorgente primaria: MP3 pre-generati con ElevenLabs (4 voci) in
 * /audio/<idTesto>.mp3. Web Speech è usato SOLO per i testi DINAMICI
 * (numeri/punteggi a runtime): MAI come fallback per i testi fissi, così non
 * parte mai la voce di sistema al posto dell'MP3 (bug trovato nei dialoghi).
 *
 * Robustezza iPad/Safari: un UNICO elemento <audio> condiviso, "sbloccato" al
 * primo gesto utente (play di un MP3 silenzioso dentro l'handler del tocco).
 * Una volta sbloccato, gli MP3 successivi partono anche se la chiamata a play()
 * arriva dal game-loop di Phaser (fuori dallo stack del gesto DOM) — è la causa
 * per cui prima, avanzando i dialoghi, certe battute restavano mute o cadevano
 * sulla voce di sistema.
 *
 * Regole ferree (CLAUDE.md): coda FIFO (niente voci sovrapposte),
 * svuotaCoda()/stop() a ogni cambio schermata.
 *
 * API:
 *   voce.init()                  → arma lo sblocco audio al primo tocco
 *   voce.caricaTesti(url)        → carica la mappa id→frase
 *   voce.parla(idTesto, {testo}) → accoda l'MP3 fisso (niente TTS di fallback)
 *   voce.parlaDinamico(testo)    → accoda testo dinamico via Web Speech
 *   voce.stop() / svuotaCoda()   → ferma l'audio in corso e svuota la coda
 */

import { stato } from './state.js';
import musica from './musica.js';

// MP3 silenzioso (~0.08s) per sbloccare l'elemento audio nel primo gesto.
const SILENZIO = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAABAAAAfgAkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKStra2tra2tra2tra2tra2tra2tra2tra2ttvb29vb29vb29vb29vb29vb29vb29vb29v/////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQEQAAAAAAAAAH4QRo2hwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxLEAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

let testi = {};            // { idTesto: "frase" | { testo, voce } }
let coda = [];             // elementi FIFO { tipo, id, testo, risolvi }
let inRiproduzione = false;
let elInRiproduzione = null;
let sbloccato = false;
let vociIT = [];
let gen = 0;               // token: invalida i callback di clip "vecchie" su stop

const BASE_AUDIO = 'audio/';
let elementoAudio = null;  // UNICO elemento <audio> riusato per tutti gli MP3

// Gli id contengono ':' (es. "pietro:sogno"): normalizziamo per il nome file
// in modo identico a tools/genera-audio.js.
export function nomeFileDa(id) { return String(id).replace(/[^a-z0-9]+/gi, '-').toLowerCase(); }

function elemento() {
  if (!elementoAudio) {
    elementoAudio = new Audio();
    elementoAudio.preload = 'auto';
  }
  return elementoAudio;
}

// --- Stato/impostazioni ----------------------------------------------------
function voceAttiva() { return stato().impostazioni?.voce !== false; }
function volume() {
  const v = stato().impostazioni?.volume;
  return (typeof v === 'number') ? Math.max(0, Math.min(1, v)) : 1;
}

// --- Caricamento testi -----------------------------------------------------
// Fase S (CMS): prova prima i testi MERGE(base, override) serviti dal server
// (`/api/contenuti/testi`) → le modifiche del genitore si vedono al boot. Fallback al
// file statico (`url`) se il server è vecchio/offline, così il gioco non resta mai muto.
export async function caricaTesti(url = 'testi.json') {
  for (const src of ['api/contenuti/testi', url]) {   // API se c'è, poi il file statico
    try {
      const r = await fetch(src);
      if (r.ok) { testi = await r.json(); return testi; }
    } catch {
      /* provo la sorgente successiva */
    }
  }
  return testi;   // entrambe assenti (fase iniziale/offline): mappa vuota, nessun crash
}
/** Il gioco è di Pietro: se il profilo si chiama "Pietro" (qualsiasi maiuscola/minuscola)
 *  i testi restano dedicati. Con un nome DIVERSO i messaggi diventano GENERICI: non
 *  citano alcun nome (es. la Nonna dice "Ah, allora parti davvero!"). */
function eGenerico() {
  try { const n = (typeof window !== 'undefined' && window.GS && window.GS.profilo && window.GS.profilo.nome) || ''; return String(n).trim().toLowerCase() !== 'pietro'; } catch { return false; }
}
/** Profilo "bimba": le battute del protagonista (pietro:*) hanno la variante voce
 *  femminile `<id>#f` (voce di Doda/carlotta), così non parla più con la voce di Pietro. */
function eFemmina() {
  try { return (typeof window !== 'undefined' && window.GS && window.GS.profilo && window.GS.profilo.genere) === 'femmina'; } catch { return false; }
}
/** Sceglie la variante giusta: prima la voce femminile (`#f`, per le battute del
 *  protagonista), poi il testo generico senza nome (`#gen`, profilo ≠ Pietro). Non si
 *  sovrappongono (battute diverse), quindi l'ordine è solo una priorità di sicurezza. */
function idEffettivo(id) {
  if (eFemmina()) { const f = id + '#f'; if (testi[f] != null) return f; }
  if (eGenerico()) { const g = id + '#gen'; if (testi[g] != null) return g; }
  return id;
}

export function testoDi(id) {
  const v = testi[idEffettivo(id)];
  return typeof v === 'string' ? v : (v && v.testo) || '';
}

// --- Sblocco audio (serve un gesto utente) ---------------------------------
export function init() {
  const sblocca = () => {
    if (sbloccato) return;
    sbloccato = true;
    // Sblocca l'elemento <audio> riprodotto un MP3 muto DENTRO il gesto.
    const a = elemento();
    try {
      a.muted = true;
      a.src = SILENZIO;
      const p = a.play();
      if (p && p.then) p.then(() => { try { a.pause(); a.currentTime = 0; } catch {} a.muted = false; })
        .catch(() => { a.muted = false; });
      else a.muted = false;
    } catch { a.muted = false; }
    // Scalda anche la sintesi vocale (per i testi dinamici).
    if ('speechSynthesis' in window) {
      vociIT = speechSynthesis.getVoices().filter((v) => /it/i.test(v.lang));
      speechSynthesis.onvoiceschanged = () => {
        vociIT = speechSynthesis.getVoices().filter((v) => /it/i.test(v.lang));
      };
    }
    window.removeEventListener('pointerdown', sblocca);
    window.removeEventListener('touchstart', sblocca);
  };
  window.addEventListener('pointerdown', sblocca);
  window.addEventListener('touchstart', sblocca);
}

// --- Coda FIFO -------------------------------------------------------------
function accoda(elementoCoda) {
  return new Promise((risolvi) => {
    if (!voceAttiva()) { risolvi('disattivata'); return; }
    coda.push({ ...elementoCoda, risolvi });
    processa();
  });
}

function processa() {
  if (inRiproduzione || coda.length === 0) {
    // Coda vuota e niente in riproduzione → la musica può risalire (fine ducking).
    if (!inRiproduzione && coda.length === 0) { try { musica.setDuck(false); } catch {} }
    return;
  }
  const el = coda.shift();
  inRiproduzione = true;
  elInRiproduzione = el;
  try { musica.setDuck(true); } catch {}   // una voce parla → abbassa la musica

  const finita = (esito) => {
    inRiproduzione = false;
    elInRiproduzione = null;
    el.risolvi(esito);
    processa(); // prossimo in coda
  };

  if (el.tipo === 'mp3') riproduciMp3(el, finita);
  else riproduciWebSpeech(el.testo, finita);
}

function riproduciMp3(el, finita) {
  const a = elemento();
  const mioGen = ++gen;        // questa è la clip "corrente"; stop() farà gen++
  a.volume = volume();
  a.muted = false;

  let gestito = false;
  let watchdog = null;
  const fine = (esito) => {
    if (gestito || mioGen !== gen) return;  // ignora i callback di clip superate
    gestito = true;
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    a.onended = null; a.onerror = null;
    finita(esito);
  };
  a.onended = () => fine('fine');
  // MP3 mancante/illeggibile: NIENTE voce di sistema per i testi fissi → silenzio.
  a.onerror = () => { if (mioGen === gen) { console.warn('voce: MP3 assente per', el.id); fine('assente'); } };

  try { a.pause(); } catch {}
  a.src = `${BASE_AUDIO}${nomeFileDa(el.id)}.mp3`;
  try { a.currentTime = 0; } catch {}
  const p = a.play();
  if (p && p.catch) p.catch(() => { if (mioGen === gen) fine('bloccato'); });
  // Rete di sicurezza (audit): se su iOS NESSUN evento scatta (clip che non parte né
  // fallisce), la coda FIFO resterebbe bloccata (niente più voci). Sblocco dopo 15s.
  watchdog = setTimeout(() => fine('timeout'), 15000);
}

function riproduciWebSpeech(testo, finita) {
  if (!('speechSynthesis' in window) || !testo) { finita('no-tts'); return; }
  try {
    const u = new SpeechSynthesisUtterance(testo);
    u.lang = 'it-IT';
    u.rate = 0.95;
    u.pitch = 1.15;
    u.volume = volume();
    if (vociIT.length) u.voice = vociIT[0];
    u.onend = () => finita('fine');
    u.onerror = () => finita('errore');
    speechSynthesis.speak(u);
  } catch {
    finita('errore');
  }
}

// --- API pubblica ----------------------------------------------------------
/** Accoda un testo FISSO: riproduce audio/<id>.mp3. Niente fallback Web Speech:
 *  se l'MP3 manca resta in silenzio (mai la voce di sistema). */
export function parla(idTesto, { testo } = {}) {
  // Risolvo la variante generica (se serve) per id MP3 e testo, così audio e testo restano
  // coerenti anche quando il profilo non è "Pietro".
  const id = idEffettivo(idTesto);
  return accoda({ tipo: 'mp3', id, testo: testo || testoDi(idTesto) });
}

/** Accoda un testo DINAMICO (numeri contati a runtime…) via Web Speech. */
export function parlaDinamico(testo) {
  return accoda({ tipo: 'dinamico', testo });
}

/** Ferma DAVVERO l'audio in corso (pause + currentTime=0) e svuota la coda.
 *  Da chiamare a ogni cambio schermata e PRIMA di ogni nuova battuta del dialogo,
 *  così audio e testo restano sempre sincronizzati anche avanzando veloci. */
export function svuotaCoda() {
  gen++; // invalida i callback delle clip in volo
  const inAttesa = coda.splice(0);
  if (elementoAudio) {
    try { elementoAudio.pause(); } catch {}
    try { elementoAudio.currentTime = 0; } catch {}
    elementoAudio.onended = null;
    elementoAudio.onerror = null;
  }
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch {} }
  if (elInRiproduzione) { try { elInRiproduzione.risolvi('interrotta'); } catch {} elInRiproduzione = null; }
  inRiproduzione = false;
  inAttesa.forEach((el) => el.risolvi('interrotta'));
  try { musica.setDuck(false); } catch {}   // niente più voce → fine ducking
}

/** Alias esplicito. */
export function stop() { svuotaCoda(); }

/** Vero se la voce è attiva nelle impostazioni. */
export function attiva() { return voceAttiva(); }

export default { init, caricaTesti, testoDi, parla, parlaDinamico, svuotaCoda, stop, attiva, nomeFileDa };
