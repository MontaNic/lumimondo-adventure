/* ui.js — scala tipografica condivisa e preferenze di accessibilità (#78/#80/#87).
 *
 * Un'unica fonte per le dimensioni dei testi (così le scene restano coerenti) e
 * per le opzioni "Testo grande" e "Velocità testo", lette a runtime da
 * window.GS.impostazioni. Niente stato: solo funzioni pure di lettura.
 */

// Scala tipografica base (px). Le scene usano queste invece di numeri sparsi.
export const FS = { title: 26, body: 19, small: 16, tiny: 14 };

function imp() { return (window.GS && window.GS.impostazioni) || {}; }

/** #78 — "Testo grande" attivo? */
export function testoGrande() { return imp().testoGrande === true; }

/** Dimensione corpo testo (px) tenendo conto del toggle Testo grande. */
export function fsBody() { return testoGrande() ? 26 : FS.body; }
export function fsSmall() { return testoGrande() ? 20 : FS.small; }
export function fsTitle() { return testoGrande() ? 30 : FS.title; }

/** #80 — Velocità typewriter in ms/carattere; 0 = istantaneo. */
export function velocitaTW() {
  const v = imp().velocitaTesto;
  if (v === 'lento') return 70;
  if (v === 'veloce') return 0;     // istantaneo
  return 40;                        // normale (default storico)
}

/** #83 — l'utente preferisce meno animazioni (sensibilità sensoriali)? */
export function menoMovimento() {
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}
