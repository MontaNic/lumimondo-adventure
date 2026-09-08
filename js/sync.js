/* sync.js — salvataggio ibrido localStorage + cloud per Lumimondo Adventure.
 *
 * Principio: il gioco funziona SEMPRE offline (state.js su localStorage).
 * sync.js aggiunge la sincronizzazione col save-server quando c'è rete,
 * risolvendo i conflitti con la regola "vince il timestamp più recente"
 * (campo `aggiornato`). I progressi di Pietro non si perdono mai:
 *  - all'avvio: pull dal cloud, se più recente → adotta in locale
 *  - dopo ogni salvataggio: push verso il cloud (debounce)
 *  - offline: nessun errore, si riprova alla prossima occasione
 */

import * as Stato from './state.js';

const BASE_API = '/api/save/';
let inSync = false;
let pushInSospeso = false;
let timerPush = null;

function urlProfilo() {
  return BASE_API + encodeURIComponent(Stato.stato().profilo);
}

async function conTimeout(promise, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promise(ctrl.signal); }
  finally { clearTimeout(t); }
}

/** Scarica il salvataggio cloud. Ritorna l'oggetto o null (assente/offline). */
export async function pull() {
  try {
    const res = await conTimeout((signal) => fetch(urlProfilo(), { signal }));
    if (res.status === 204) return null;   // niente sul cloud
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // offline o server giù: non è un errore di gioco
  }
}

/** Invia il salvataggio locale al cloud. Ritorna la versione vincente o null.
 *  `adotta` (default true): se il server ritorna una versione riconciliata diversa, la
 *  adotta in locale PER INTERO. A gioco in corso si passa `adotta:false` per NON
 *  sostituire lo stato attivo a metà partita (evita divergenze window.GS↔STATO). */
export async function push({ adotta = true } = {}) {
  const locale = Stato.stato();
  // Non pushare uno stato MAI salvato davvero (aggiornato:0): eviti che un default
  // appena inizializzato possa sovrascrivere un cloud reale a parità sfavorevole.
  if ((Number(locale.aggiornato) || 0) === 0) return null;
  try {
    const res = await conTimeout((signal) => fetch(urlProfilo(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locale),
      signal,
    }));
    if (!res.ok) return null;
    const esito = await res.json();
    // Se il server aveva una versione più recente/riconciliata, adottala in locale.
    if (adotta && esito.stato === 'conflitto' && esito.salvataggio) {
      Stato.applicaSalvataggio(esito.salvataggio);
    }
    return esito.salvataggio || null;
  } catch {
    pushInSospeso = true; // riprova più tardi
    return null;
  }
}

/**
 * Sincronizzazione completa: pull → riconcilia col locale (vince il più
 * recente) → push. Da chiamare all'avvio e quando torna la connessione.
 */
export async function sincronizza() {
  if (inSync) return Stato.stato();
  inSync = true;
  try {
    const cloud = await pull();
    const locale = Stato.stato();
    if (cloud) {
      const tsCloud = Number(cloud.aggiornato) || 0;
      const tsLocale = Number(locale.aggiornato) || 0;
      if (tsCloud > tsLocale) {
        // Il cloud è più recente: adottalo in locale.
        Stato.applicaSalvataggio(cloud);
      } else if (tsLocale > tsCloud) {
        // Il locale è più recente: lo caricheremo col push qui sotto.
      }
      // pari merito → nessuna azione, sono uguali
    }
    await push();
    pushInSospeso = false;
    return Stato.stato();
  } finally {
    inSync = false;
  }
}

/** Invia al cloud il salvataggio di UN profilo qualsiasi (anche non attivo), per
 *  allineare l'elenco profili: un profilo creato su questo device ma mai arrivato al
 *  server (es. creato offline) viene così reso visibile anche al pannello admin.
 *  Il server risolve i conflitti per timestamp → non sovrascrive mai una versione più
 *  recente (incluse le modifiche del genitore). Best-effort. */
export async function pushProfilo(profilo, salvataggio) {
  if (!profilo || !salvataggio) return false;
  if ((Number(salvataggio.aggiornato) || 0) === 0) return false;   // mai salvato davvero
  try {
    const res = await conTimeout((signal) => fetch(BASE_API + encodeURIComponent(profilo), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(salvataggio), signal,
    }));
    return res.ok;
  } catch { return false; }
}

/** Push "di chiusura" via navigator.sendBeacon: affidabile su pagehide/visibilitychange
 *  (la fetch normale verrebbe interrotta dalla sospensione dell'app). Best-effort: se
 *  non c'è sendBeacon o è offline, non fa nulla (il prossimo sincronizza() recupera). */
export function pushBeacon() {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
    const s = Stato.stato();
    if ((Number(s.aggiornato) || 0) === 0) return false;   // mai salvato: niente beacon
    const corpo = new Blob([JSON.stringify(s)], { type: 'application/json' });
    return navigator.sendBeacon(urlProfilo(), corpo);
  } catch { return false; }
}

/** Push col debounce, da agganciare all'evento 'salvato' di state.js. */
function pushDebounced() {
  if (timerPush) clearTimeout(timerPush);
  timerPush = setTimeout(() => { timerPush = null; push(); }, 1500);
}

/**
 * Avvia la sincronizzazione automatica:
 *  - sync iniziale
 *  - push dopo ogni salvataggio locale
 *  - re-sync quando torna online
 */
/** Sync LEGGERA per il rientro a GIOCO IN CORSO: applica SOLO le impostazioni del
 *  genitore (difficoltà/pausa/nome) senza mai sostituire i progressi attivi, e invia
 *  i progressi locali. Un AZZERAMENTO non viene applicato qui (sostituirebbe lo stato a
 *  metà partita): resta pendente e attecchisce al rientro nella schermata profili. */
export async function sincronizzaImpostazioni() {
  const cloud = await pull();
  if (cloud) {
    const locale = Stato.stato();
    const revC = Number(cloud.adminRev) || 0;
    const revL = Number(locale.adminRev) || 0;
    const eReset = (Number(cloud.resetRev) || 0) === revC && revC > 0;
    if (revC > revL && !eReset) Stato.applicaCampiAdmin(cloud);
  }
  return push({ adotta: false });   // manda i progressi, ma NON adottare swap a metà partita
}

let ultimoResync = 0;
// Re-sync "al rientro": quando l'app torna in primo piano (focus / tab di nuovo
// visibile) applica le eventuali modifiche del genitore (nome/difficoltà/pausa-salute).
// Leggera e SICURA: mai swap dei progressi. Throttle a 5s.
function resyncAlRientro() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const ora = Date.now();
  if (ora - ultimoResync < 5000) return;
  ultimoResync = ora;
  sincronizzaImpostazioni();
}

let listenerRegistrati = false;
function suVisibilita() { if (!document.hidden) resyncAlRientro(); }
function suOnline() { if (pushInSospeso) sincronizza(); }

export function avviaSyncAutomatica() {
  // Registra i listener globali UNA sola volta (la funzione può essere richiamata a
  // ogni cambio profilo): riferimenti a funzioni STABILI → niente doppioni.
  if (!listenerRegistrati) {
    listenerRegistrati = true;
    Stato.on('salvato', pushDebounced);
    window.addEventListener('online', suOnline);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', suVisibilita);
    window.addEventListener('focus', resyncAlRientro);
    window.addEventListener('pageshow', resyncAlRientro);
  }
  return sincronizza();
}
