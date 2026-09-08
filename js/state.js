/* state.js — stato di gioco e salvataggio Lumimondo Adventure.
 *
 * Responsabilità:
 *  - schema di salvataggio VERSIONATO (saveVersion) con migrazione automatica
 *  - persistenza su localStorage (offline-first)
 *  - timestamp `aggiornato` su ogni salvataggio → usato da sync.js per
 *    risolvere i conflitti col criterio "vince il più recente"
 *  - pub/sub minimale perché le schermate reagiscano ai cambi di stato
 *
 * I progressi di Pietro non si perdono mai: ogni mutazione passa da qui e
 * viene salvata; sync.js fonde col cloud senza distruggere il locale.
 */

export const SAVE_VERSION = 2;
const PREFISSO = 'lumimondo-adventure:save:';
const PROFILO_DEFAULT = 'pietro';

// --- Schema di default (saveVersion corrente) -----------------------------
export function salvataggioDiDefault(profilo = PROFILO_DEFAULT) {
  return {
    saveVersion: SAVE_VERSION,
    profilo,
    aggiornato: 0, // epoch ms dell'ultimo salvataggio reale (0 = mai salvato) — orologio dei PROGRESSI
    adminRev: 0,   // contatore delle azioni del genitore (/admin): autorità sui campi impostazioni/nome
    giocatore: {
      nome: 'Pietro',
      cittaCorrente: 'pietropoli',
      medaglie: [],          // es. ['onda']
      cittaSbloccate: ['pietropoli'],   // Acquaverde si sblocca dopo aver finito Pietropoli (propedeutico)
    },
    squadra: [],             // max 6 Lumini attivi (vedi MAX_SQUADRA)
    deposito: [],            // #58 — Rifugio dei Lumini: oltre i 6 in squadra
    // Borsa oggetti (#36/#39): si comprano al Negozio con le stelline e si usano
    // in battaglia. Scorta iniziale generosa (anti-frustrazione: mai "a secco").
    inventario: { lumiball: 8, caramella: 2, trifoglio: 1 },
    album: {},               // { specie: { visto, catturato, quantita, affezione } }
    storia: {
      flags: {},             // flag narrativi: { 'pietropoli:intro': true, ... }
      amiciNelGruppo: [],    // es. ['lauri','nico']
    },
    impostazioni: {
      voce: true,
      suoni: true,
      musica: true,
      // Livelli d'avvio richiesti da Nicolò: musica 20% · dialoghi 60% · effetti 50%.
      volume: 0.6,         // volume dialoghi/voce (0..1) — default 60%
      volumeEffetti: 0.5,  // volume effetti sonori SFX (0..1) — default 50%
      volumeMusica: 0.2,   // slider Musica a 20% (curva percettiva slider²+tetto in musica.js:
                           // resta volutamente sotto voci/effetti, non li copre mai).
      testoGrande: false,  // #78 — dialoghi/quiz a caratteri più grandi
      velocitaTesto: 'normale', // #80 — typewriter: 'lento' | 'normale' | 'veloce'
      difficolta: 'piccoli', // #77 — 'piccoli' (più aiuti in battaglia) | 'grandi' (più sfida). Gestita dal superadmin per profilo.
    },
    statistiche: {
      battaglieGiocate: 0,
      catture: 0,
      luminiVisti: 0,
      passi: 0,            // #70 — statistiche di gioco nel profilo
    },
    // #56 — progresso educativo per materia + sticker-traguardi sbloccati.
    progressoEducativo: { numeri: 0, parole: 0, logica: 0, stickers: [] },
  };
}

export const MAX_SQUADRA = 6;

// --- Migrazioni -----------------------------------------------------------
// MIGRAZIONI[n] trasforma un salvataggio da saveVersion n a n+1.
// Aggiungere qui una funzione per ogni nuova versione dello schema.
// Esempio per il futuro (V2):
//   MIGRAZIONI[1] = (s) => { s.squadra.forEach(l => l.affezione ??= 0); return s; };
const MIGRAZIONI = {};
// v1 → v2: allinea i profili ESISTENTI ai livelli audio d'avvio richiesti
// (musica 20% · dialoghi 60% · effetti 50%) e ACCENDE l'audio. Senza questo, un
// profilo già salvato (es. `pietro`, che aveva voce/suoni/musica = false) non
// sentirebbe nulla pur cambiando i default. Gira UNA volta sola (poi saveVersion=2).
// NB: sovrascrive una eventuale regolazione manuale precedente dei tre cursori/toggle.
MIGRAZIONI[1] = (s) => {
  s.impostazioni = s.impostazioni || {};
  s.impostazioni.voce = true;
  s.impostazioni.suoni = true;
  s.impostazioni.musica = true;
  s.impostazioni.volume = 0.6;
  s.impostazioni.volumeEffetti = 0.5;
  s.impostazioni.volumeMusica = 0.2;
  return s;
};

function migra(salvataggio) {
  let s = salvataggio;
  // Salvataggio senza versione = pre-versionamento → trattalo come v0 grezzo.
  if (typeof s.saveVersion !== 'number') s.saveVersion = 0;

  while (s.saveVersion < SAVE_VERSION) {
    const passo = MIGRAZIONI[s.saveVersion];
    if (typeof passo !== 'function') {
      // Nessuna migrazione definita: non possiamo trasformare in sicurezza.
      // Per non perdere dati, fondiamo i campi noti sui default correnti.
      console.warn(`Migrazione mancante da v${s.saveVersion}: applico merge sui default.`);
      return fondiSuDefault(s);
    }
    s = passo(s);
    s.saveVersion++;
  }
  // Garantisce che eventuali nuovi campi del default esistano comunque.
  return fondiSuDefault(s);
}

// Fonde un salvataggio (anche parziale) sopra lo schema di default,
// preservando i valori esistenti. Difensivo contro campi mancanti.
//
// #10 — INVARIANTE: la riconciliazione cloud↔locale è "vince il timestamp più
// recente" e adotta il salvataggio vincente PER INTERO (applicaSalvataggio →
// migra → fondiSuDefault, con base = default VUOTO). Quindi le cancellazioni
// annidate (es. un Lumino rimosso dall'album sul device recente) SONO preservate:
// l'album risultante è esattamente quello del save vincente. `fondiProfondo` va
// usato SOLO per riempire i campi mancanti sui default, MAI per fondere due save
// "pieni" (fonderebbe le chiavi e farebbe riapparire ciò che era stato rimosso).
function fondiSuDefault(parziale) {
  const base = salvataggioDiDefault(parziale.profilo);
  const fuso = fondiProfondo(base, parziale);
  // Il risultato è strutturalmente allineato allo schema corrente.
  fuso.saveVersion = SAVE_VERSION;
  return fuso;
}

function fondiProfondo(base, sovra) {
  if (Array.isArray(base)) return Array.isArray(sovra) ? sovra : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(sovra || {})) {
      const bv = base[k];
      const sv = sovra[k];
      out[k] = (bv && typeof bv === 'object' && !Array.isArray(bv) && sv && typeof sv === 'object')
        ? fondiProfondo(bv, sv)
        : (sv !== undefined ? sv : bv);
    }
    return out;
  }
  return sovra !== undefined ? sovra : base;
}

// --- Singleton di stato ----------------------------------------------------
let STATO = salvataggioDiDefault();
let profiloAttivo = PROFILO_DEFAULT;
const ascoltatori = new Map(); // evento -> Set(cb)

function chiave(profilo) { return PREFISSO + profilo; }

/** Carica il salvataggio del profilo da localStorage (con migrazione). */
export function carica(profilo = PROFILO_DEFAULT) {
  profiloAttivo = profilo;
  try {
    const grezzo = localStorage.getItem(chiave(profilo));
    if (grezzo) {
      const parsed = JSON.parse(grezzo);
      STATO = migra(parsed);
    } else {
      STATO = salvataggioDiDefault(profilo);
    }
  } catch (e) {
    console.warn('Salvataggio illeggibile, riparto dai default:', e.message);
    STATO = salvataggioDiDefault(profilo);
  }
  STATO.profilo = profilo;
  emetti('caricato', STATO);
  return STATO;
}

let timerSalva = null;
/** Salva su localStorage. Debounce per non scrivere ad ogni micro-mutazione. */
export function salva({ immediato = false } = {}) {
  const scrivi = () => {
    STATO.aggiornato = Date.now();
    try {
      localStorage.setItem(chiave(profiloAttivo), JSON.stringify(STATO));
      emetti('salvato', STATO);
    } catch (e) {
      console.error('Salvataggio fallito:', e.message);
    }
  };
  if (immediato) {
    if (timerSalva) { clearTimeout(timerSalva); timerSalva = null; }
    scrivi();
    return;
  }
  if (timerSalva) clearTimeout(timerSalva);
  timerSalva = setTimeout(() => { timerSalva = null; scrivi(); }, 400);
}

/** Ritorna lo stato corrente (oggetto vivo — modificare poi chiamare salva). */
export function stato() { return STATO; }

/** Applica una mutazione e salva. `fn(stato)` modifica in place. */
export function aggiorna(fn, opzioni) {
  fn(STATO);
  emetti('cambiato', STATO);
  salva(opzioni);
  return STATO;
}

/** Sostituisce lo stato (usato da sync dopo merge col cloud). */
export function applicaSalvataggio(nuovo, { salvaLocale = true } = {}) {
  STATO = migra(nuovo);
  STATO.profilo = profiloAttivo;
  emetti('cambiato', STATO);
  // 'adottato' = abbiamo accolto una versione dal cloud (es. una modifica del
  // genitore dal pannello admin): gs.js lo ascolta per riallineare window.GS
  // (impostazioni pausa-salute/difficoltà, nome) a gioco già aperto.
  emetti('adottato', STATO);
  if (salvaLocale) {
    try { localStorage.setItem(chiave(profiloAttivo), JSON.stringify(STATO)); }
    catch (e) { console.error('Persistenza post-sync fallita:', e.message); }
  }
  return STATO;
}

// Campi "di competenza del genitore" (pannello /admin): allineati a parte, per
// autorità di `adminRev`, senza toccare i progressi (vedi sync.js / save-server.js).
const CAMPI_ADMIN_IMP = ['difficolta', 'pausaSalute', 'pausaSaluteMin', 'velocitaTesto'];

/** Applica allo STATO attivo SOLO i campi del genitore presi dal cloud (impostazioni
 *  admin + nome/età + adminRev), senza toccare i progressi: sicuro a gioco in corso.
 *  Emette 'adottato' così gs.js riallinea window.GS. */
export function applicaCampiAdmin(cloud) {
  if (!cloud || typeof cloud !== 'object') return;
  STATO.impostazioni = STATO.impostazioni || {};
  const imp = cloud.impostazioni || {};
  for (const k of CAMPI_ADMIN_IMP) if (imp[k] !== undefined) STATO.impostazioni[k] = imp[k];
  const g = cloud.giocatore || {};
  STATO.giocatore = STATO.giocatore || {};
  if (g.nome !== undefined) STATO.giocatore.nome = g.nome;
  if (g.eta !== undefined) STATO.giocatore.eta = g.eta;
  STATO.adminRev = Math.max(Number(STATO.adminRev) || 0, Number(cloud.adminRev) || 0);
  try { localStorage.setItem(chiave(profiloAttivo), JSON.stringify(STATO)); }
  catch (e) { console.error('Persistenza impostazioni admin fallita:', e.message); }
  emetti('cambiato', STATO);
  emetti('adottato', STATO);
}

/** Legge il salvataggio grezzo di un profilo da localStorage SENZA cambiare il
 *  profilo attivo né lo STATO corrente (per allineare al cloud profili non attivi). */
export function leggiGrezzo(profilo) {
  try { const g = localStorage.getItem(chiave(profilo)); return g ? JSON.parse(g) : null; }
  catch { return null; }
}

/** Cancella il salvataggio LOCALE di un profilo (usato quando il genitore l'ha
 *  eliminato da /admin: la cancellazione deve "attecchire" anche sul device). */
export function rimuoviSalvataggio(profilo) {
  try { localStorage.removeItem(chiave(profilo)); return true; } catch { return false; }
}

/** Azzera il profilo corrente (per test / nuovo gioco). */
export function reset() {
  STATO = salvataggioDiDefault(profiloAttivo);
  salva({ immediato: true });
  emetti('cambiato', STATO);
  return STATO;
}

// --- Pub/sub ---------------------------------------------------------------
export function on(evento, cb) {
  if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set());
  ascoltatori.get(evento).add(cb);
  return () => ascoltatori.get(evento)?.delete(cb);
}
function emetti(evento, dato) {
  ascoltatori.get(evento)?.forEach((cb) => {
    try { cb(dato); } catch (e) { console.error('Ascoltatore', evento, e); }
  });
}

// --- Helper di dominio (comodità per le schermate) -------------------------
export function haMedaglia(id) { return STATO.giocatore.medaglie.includes(id); }

export function aggiungiMedaglia(id) {
  if (!haMedaglia(id)) aggiorna((s) => s.giocatore.medaglie.push(id), { immediato: true });
}

export function settaFlag(id, valore = true) {
  aggiorna((s) => { s.storia.flags[id] = valore; });
}
export function haFlag(id) { return !!STATO.storia.flags[id]; }

/** Registra un Lumino nell'album (visto e/o catturato). */
export function registraLumino(specie, { catturato = false } = {}) {
  aggiorna((s) => {
    const voce = s.album[specie] || { visto: false, catturato: false, quantita: 0, affezione: 0 };
    if (!voce.visto) { voce.visto = true; s.statistiche.luminiVisti++; }
    if (catturato) { voce.catturato = true; voce.quantita++; s.statistiche.catture++; }
    s.album[specie] = voce;
  });
}

/** Aggiunge un Lumino alla squadra (se c'è posto). Ritorna true se aggiunto. */
export function aggiungiInSquadra(lumino) {
  if (STATO.squadra.length >= MAX_SQUADRA) return false;
  aggiorna((s) => s.squadra.push(lumino));
  return true;
}
