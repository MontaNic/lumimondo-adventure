/* motore/cura.js — regole di CURA & LEGAME (F1), PURO (zero Phaser, testabile).
 *
 * Il legame di un Lumino è la sua AFFEZIONE (0-5), già usata in battaglia ("resiste
 * col cuore", vedi battaglia.js) e cresciuta vincendo. La CURA (accarezza/nutri/gioca
 * nel Rifugio) è un SECONDO modo, DOLCE, di farla salire: ogni gesto aggiunge dei
 * `curaPunti`; ogni PUNTI_PER_LIVELLO l'affezione sale di 1 (max 5). Zero fallimento,
 * zero punizione: si può solo crescere. Nessun side effect qui: la vista salva il risultato.
 */

export const MAX_AFFEZIONE = 5;
export const PUNTI_PER_LIVELLO = 20;

// Nome del legame per livello 0..5 (mostrato nel Rifugio e nell'album).
export const LIVELLI = ['Timido', 'Amico', 'Affiatato', 'Complice', 'Cuore', 'Inseparabile'];

// SAZIETÀ (0-100): frena il grind. Ogni gesto sazia; da sazio, le coccole NON danno più
// legame (solo felicità). La sazietà cala col tempo reale → il legame cresce nell'ARCO DEI
// GIORNI (stile Tamagotchi), non spammando i bottoni in un colpo solo.
export const SAZIETA_MAX = 100;
export const SAZIETA_PER_GESTO = 40;             // ~3 gesti prima di saziarsi
const DECAY_MS = 3 * 60 * 60 * 1000;             // sazio → affamato in ~3 ore

function clampAff(a) { return Math.max(0, Math.min(MAX_AFFEZIONE, Math.floor(a || 0))); }

/** { n: 0..5, nome } per una data affezione. */
export function livelloLegame(affezione) {
  const n = clampAff(affezione);
  return { n, nome: LIVELLI[n] };
}

/** Sazietà EFFETTIVA ora (0-100), applicando il decadimento dal momento dell'ultima cura. */
export function sazietaOra(stato, oraMs) {
  const base = Math.max(0, (stato && stato.sazieta) || 0);
  const dt = Math.max(0, (oraMs || 0) - ((stato && stato.sazietaTs) || 0));
  return Math.max(0, Math.min(SAZIETA_MAX, base - SAZIETA_MAX * (dt / DECAY_MS)));
}
/** true se il Lumino è SAZIO ora (ha ricevuto abbastanza coccole per un po'). */
export function eSazio(stato, oraMs) { return sazietaOra(stato, oraMs) >= SAZIETA_MAX; }

/** Applica un gesto di cura a { affezione, curaPunti, sazieta, sazietaTs }. Se il Lumino è
 *  SAZIO, il legame NON sale (ritorna `sazio:true`): è felice così, torna più tardi. Altrimenti
 *  accumula legame e un po' di sazietà. Puro: non tocca l'input. `oraMs` = orologio (Date.now). */
export function applicaCura(stato, guadagno, oraMs = 0) {
  const affPrec = clampAff(stato && stato.affezione);
  const saz = sazietaOra(stato, oraMs);
  if (saz >= SAZIETA_MAX) {
    return { affezione: affPrec, curaPunti: (stato && stato.curaPunti) || 0, sazieta: SAZIETA_MAX, sazietaTs: (stato && stato.sazietaTs) || oraMs, salito: false, delta: 0, sazio: true };
  }
  let aff = affPrec;
  let punti = Math.max(0, (stato && stato.curaPunti) || 0) + Math.max(0, Math.floor(guadagno || 0));
  while (aff < MAX_AFFEZIONE && punti >= PUNTI_PER_LIVELLO) { punti -= PUNTI_PER_LIVELLO; aff++; }
  if (aff >= MAX_AFFEZIONE) punti = 0;   // al massimo: niente accumulo inutile
  return { affezione: aff, curaPunti: punti, sazieta: Math.min(SAZIETA_MAX, saz + SAZIETA_PER_GESTO), sazietaTs: oraMs, salito: aff > affPrec, delta: aff - affPrec, sazio: false };
}

// F1 (v2) — "CAPISCI L'EMOZIONE": il Lumino PROVA qualcosa (ha fame, è triste, giocoso,
// stanco) e il bimbo deve LEGGERE il suo stato d'animo e rispondere col gesto giusto. È
// educazione emotiva (riconoscere le emozioni), non un semplice tocca-e-sale. Azzeccare la
// lettura dà legame pieno; sbagliare dà comunque un pochino (MAI punizione) + un indizio.
export const GUADAGNO_LETTURA_OK = 12;
export const GUADAGNO_LETTURA_NO = 3;

/** Valuta la lettura dell'emozione: `giusto` se il gesto scelto soddisfa il BISOGNO del
 *  Lumino. Ritorna { giusto, guadagno } (il guadagno alimenta lo stesso applicaCura). Puro. */
export function valutaLettura(bisognoLumino, bisognoGesto) {
  const giusto = !!bisognoLumino && bisognoLumino === bisognoGesto;
  return { giusto, guadagno: giusto ? GUADAGNO_LETTURA_OK : GUADAGNO_LETTURA_NO };
}

/** Progresso 0..1 verso il prossimo livello (per la barra del Rifugio). Al massimo = 1. */
export function progressoLegame(stato) {
  if (clampAff(stato && stato.affezione) >= MAX_AFFEZIONE) return 1;
  return Math.max(0, Math.min(1, ((stato && stato.curaPunti) || 0) / PUNTI_PER_LIVELLO));
}

/** Descrizione del micro-bonus di battaglia dato dal legame (già attivo in battaglia.js:
 *  "resiste col cuore" con prob. crescente). Solo per la UI, non è una regola nuova. */
export function bonusLegame(affezione) {
  const a = clampAff(affezione);
  if (a >= 4) return 'Resiste col cuore quasi sempre 💗';
  if (a >= 2) return 'Ogni tanto resiste col cuore 💗';
  return 'Il legame sta sbocciando';
}
