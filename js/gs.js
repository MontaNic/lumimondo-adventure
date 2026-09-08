/* gs.js — bridge tra `window.GS` (stato runtime delle Scene Phaser) e la
 * persistenza versionata di `state.js` + `sync.js` (entrambi INVARIATI).
 *
 * RIFACIMENTO_PHASER chiede un oggetto globale `window.GS` accessibile da tutte
 * le Scene senza passaggio esplicito. Ma `state.js` è lo schema di salvataggio
 * versionato con migrazioni, e `sync.js` ci sincronizza il cloud. Soluzione:
 *   - all'avvio: `inizializzaGS()` carica da state.js e popola window.GS
 *   - al salvataggio: `salvaGS()` riversa window.GS dentro state.js → salva →
 *     `sync.js` (agganciato all'evento 'salvato') fa il push cloud in debounce
 *
 * Ogni Scene legge da window.GS all'avvio e chiama salvaGS() agli eventi
 * significativi (fine battaglia, cattura, cambio scena, medaglia, fine dialogo).
 */

import * as Stato from './state.js';

/** Costruisce l'oggetto runtime GS a partire dal salvataggio versionato. */
function daStato(s) {
  // Robustezza (audit): un profilo cloud corrotto può avere sezioni a `null`. Le
  // normalizzo PRIMA di leggerle così l'init non crasha (schermo nero) ma degrada con
  // grazia. `fondiSuDefault` ripara le chiavi ASSENTI, non i valori esplicitamente null.
  s = s || {};
  const gio = s.giocatore || (s.giocatore = {});
  const st = s.storia || (s.storia = {});
  gio.cittaSbloccate = gio.cittaSbloccate || ['pietropoli'];
  gio.medaglie = gio.medaglie || [];
  st.flags = st.flags || {};
  st.amiciNelGruppo = st.amiciNelGruppo || [];
  return {
    profilo: {
      nome: s.giocatore.nome || 'Pietro',
      eta: s.giocatore.eta || 7,
      genere: s.giocatore.genere || 'maschio',
      avatarColore: s.giocatore.avatarColore || '#e23b2e',
    },
    // Progressione del GIOCATORE (cresce di livello col gioco, oltre ai Lumini).
    xp: s.giocatore.xp || 0,
    livello: s.giocatore.livello || 1,
    cittaCorrente: s.giocatore.cittaCorrente,
    starter: s.giocatore.starter || null,   // Lumino iniziale scelto (segue la linea evolutiva)
    cittaSbloccate: [...s.giocatore.cittaSbloccate],
    medaglie: [...s.giocatore.medaglie],
    team: (s.squadra || []).map((l) => ({ ...l })),
    deposito: (s.deposito || []).map((l) => ({ ...l })),   // #58 — Rifugio dei Lumini
    inventario: { ...(s.inventario || {}) },   // borsa oggetti (#36/#39)
    album: JSON.parse(JSON.stringify(s.album || {})),
    // #8 — guard contro album malformato (profilo cloud corrotto): una voce
    // null/undefined non deve far crashare l'init.
    luminiCatturati: Object.keys(s.album || {}).filter((k) => s.album[k] && s.album[k].catturato),
    progressiStoria: { ...s.storia.flags },
    amiciNelGruppo: [...s.storia.amiciNelGruppo],
    // Campi runtime/estesi (persistiti sotto giocatore/storia: lo schema li conserva).
    posizioneMap: s.giocatore.posizioneMap || { x: null, y: null, scena: 'MappaMondoScene' },
    stelline: s.giocatore.stelline || 0,
    pity: s.storia.pity || {},           // { idSfida: tentativiPersi } per il pity system
    statistiche: { ...(s.statistiche || {}) },        // #70
    progressoEducativo: { numeri: 0, parole: 0, logica: 0, stickers: [], ...(s.progressoEducativo || {}) },  // #56
    impostazioni: { ...s.impostazioni },
    onboardingFatto: !!s.storia.flags['onboarding'],
    campione: !!s.storia.flags['campione'],   // #65 — Modalità Campione sbloccata
  };
}

/** Riallinea su window.GS i campi "di competenza del genitore" quando il cloud viene
 *  adottato (modifica dal pannello admin) a gioco già aperto: impostazioni (pausa-salute,
 *  durata, difficoltà, velocità testo) e nome/età. NON tocca i progressi/squadra in corso
 *  per non disturbare la scena attiva: le impostazioni sono rilette a ogni tick/inizio sfida. */
function riallineaImpostazioniDaStato() {
  const g = window.GS; if (!g) return;
  const s = Stato.stato(); if (!s) return;
  g.impostazioni = { ...s.impostazioni };
  const gio = s.giocatore || {};
  if (gio.nome) g.profilo.nome = gio.nome;
  if (gio.eta) g.profilo.eta = gio.eta;
}

let _sottoscrittoAdozione = false;

/** Carica il salvataggio del profilo e popola window.GS. Ritorna window.GS. */
export function inizializzaGS(profilo = 'pietro') {
  const s = Stato.carica(profilo);
  window.GS = daStato(s);
  normalizzaAlbum(window.GS);
  // Una sola volta: quando sync.js adotta una versione dal cloud, riallinea le
  // impostazioni del genitore su window.GS (vedi resyncAlRientro in sync.js).
  if (!_sottoscrittoAdozione) { Stato.on('adottato', riallineaImpostazioniDaStato); _sottoscrittoAdozione = true; }
  return window.GS;
}

/** #24 — Ogni Lumino in squadra DEVE avere una voce in album (altrimenti i cuori
 *  di affezione risultano vuoti/sbagliati, es. dopo un'evoluzione con chiave
 *  cambiata). Crea la voce mancante (catturato, affezione 0) senza toccare le altre. */
export function normalizzaAlbum(g = window.GS) {
  if (!g) return;
  g.album = g.album || {};
  for (const l of (g.team || [])) {
    if (!l || !l.specie) continue;
    if (!g.album[l.specie]) g.album[l.specie] = { visto: true, catturato: true, quantita: 1, affezione: 0 };
  }
  g.luminiCatturati = Object.keys(g.album).filter((k) => g.album[k] && g.album[k].catturato);
}

/** Riversa window.GS dentro state.js e salva (sync.js fa il push cloud). */
export function salvaGS({ immediato = false } = {}) {
  const g = window.GS;
  if (!g) return;
  Stato.aggiorna((s) => {
    s.giocatore.nome = g.profilo.nome;
    s.giocatore.eta = g.profilo.eta;
    s.giocatore.genere = g.profilo.genere;
    s.giocatore.avatarColore = g.profilo.avatarColore;
    s.giocatore.cittaCorrente = g.cittaCorrente;
    s.giocatore.starter = g.starter || null;   // persistito: l'evoluzione segue lo starter
    s.giocatore.cittaSbloccate = [...g.cittaSbloccate];
    s.giocatore.medaglie = [...g.medaglie];
    s.giocatore.posizioneMap = { ...g.posizioneMap };
    s.giocatore.stelline = g.stelline;
    s.giocatore.xp = g.xp || 0;
    s.giocatore.livello = g.livello || 1;
    s.squadra = g.team.map((l) => ({ ...l }));
    s.deposito = (g.deposito || []).map((l) => ({ ...l }));
    s.inventario = { ...(g.inventario || {}) };
    s.album = JSON.parse(JSON.stringify(g.album));
    s.storia.flags = { ...g.progressiStoria, onboarding: g.onboardingFatto, campione: !!g.campione };
    s.storia.amiciNelGruppo = [...g.amiciNelGruppo];
    s.storia.pity = { ...g.pity };
    if (g.statistiche) s.statistiche = { ...s.statistiche, ...g.statistiche };
    if (g.progressoEducativo) s.progressoEducativo = { ...g.progressoEducativo };
    s.impostazioni = { ...g.impostazioni };
  }, { immediato });
}

/** Icona Lumiball che ruota 1s in alto a destra: conferma visiva di salvataggio.
 *  La Scene chiama salvaGS() e poi mostraIconaSalvataggio(scene) se vuole il feedback. */
export function flagStoria(id, valore = true) {
  if (!window.GS) return;
  window.GS.progressiStoria[id] = valore;
}

/** #70 — Incrementa una statistica di gioco (battaglieGiocate/catture/passi…).
 *  I passi si salvano "a blocchi" per non scrivere su disco a ogni frame. */
export function incrStat(chiave, n = 1) {
  const g = window.GS; if (!g) return;
  g.statistiche = g.statistiche || {};
  g.statistiche[chiave] = (g.statistiche[chiave] || 0) + n;
}

/** Livello del giocatore in base agli XP (soglie crescenti: ogni livello costa di più). */
export function livelloDaXp(xp) {
  let lv = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; lv++; need = Math.round(need * 1.3); }
  return lv;
}

/** Aggiunge XP al giocatore; ritorna { livello, salito, premioStelline }.
 *  #38 — ogni livello dà un premio tangibile in stelline (per il Negozio). */
export function aggiungiXP(n) {
  const g = window.GS; if (!g) return { livello: 1, salito: false, premioStelline: 0 };
  const prima = g.livello || 1;
  g.xp = (g.xp || 0) + (n || 0);
  const nuovo = livelloDaXp(g.xp);
  const salito = nuovo > prima;
  g.livello = nuovo;
  let premioStelline = 0;
  if (salito) {
    // Premio crescente: 5 stelline per ogni livello guadagnato.
    premioStelline = 5 * (nuovo - prima);
    g.stelline = (g.stelline || 0) + premioStelline;
  }
  try { salvaGS(); } catch { /* niente */ }
  return { livello: nuovo, salito, premioStelline };
}
