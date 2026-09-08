/* motore/mondo.js — regole delle ABILITÀ ESPLORATIVE (F2), PURE (zero Phaser, test).
 *
 * Trasformano le città da corridoi a piccoli enigmi: ogni ostacolo si apre col Lumino
 * dell'ELEMENTO giusto in squadra (HM dolci, Zelda-lite). Il gating è qui (dati + regole);
 * la scena disegna e CHIEDE al motore. Se manca il Lumino adatto: nessun blocco, solo un
 * indizio gentile (deciso dalla vista). PIANO_V2 §6.
 */

// Tipi di ostacolo → elemento che li apre + testi/icona per la vista.
export const OSTACOLI = {
  roccia:      { elemento: 'roccia',      ico: '🪨', testo: 'Un masso blocca il passaggio…',        azione: 'sposta il masso' },
  acqua:       { elemento: 'acqua',       ico: '🌊', testo: 'Acqua profonda da attraversare…',      azione: "attraversa l'acqua" },
  fuoco:       { elemento: 'fuoco',       ico: '🕯️', testo: 'Una grotta buia da illuminare…',       azione: 'illumina la grotta' },
  natura:      { elemento: 'natura',      ico: '🌿', testo: 'Rovi fitti sbarrano la via…',          azione: 'apre un varco tra i rovi' },
  elettricita: { elemento: 'elettricita', ico: '🔌', testo: 'Un meccanismo spento e bloccato…',     azione: 'dà corrente al meccanismo' },
  aria:        { elemento: 'aria',        ico: '🍃', testo: 'Un mucchio di foglie da spostare…',     azione: 'soffia via le foglie' },
};

// Nome leggibile dell'elemento (per l'indizio "Serve un amico di …").
export const NOME_ELEMENTO = {
  roccia: 'Roccia', acqua: 'Acqua', fuoco: 'Fuoco', natura: 'Erba', elettricita: 'Elettricità', aria: 'Aria',
};

/** Dati statici dell'ostacolo (icona/testi/elemento) o null se tipo sconosciuto. */
export function datiOstacolo(tipo) { return OSTACOLI[tipo] || null; }

/** Elemento che apre l'ostacolo, o null. */
export function elementoPerOstacolo(tipo) { return OSTACOLI[tipo] ? OSTACOLI[tipo].elemento : null; }

/** Il Lumino della squadra che può aprire l'ostacolo, o null se nessuno è adatto.
 *  `squadra` = [{ specie, elemento }] (l'elemento lo passa la vista da LUMINI). */
export function aiutantePerOstacolo(tipo, squadra) {
  const el = elementoPerOstacolo(tipo);
  if (!el) return null;
  return (squadra || []).find((l) => l && l.elemento === el) || null;
}

/** true se la squadra può aprire quell'ostacolo. */
export function puoiAprire(tipo, squadra) { return !!aiutantePerOstacolo(tipo, squadra); }
