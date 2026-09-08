/* motore/gare.js — GARE DI STILE (F3), PURE (zero Phaser, testabili). PIANO_V2 §7.
 *
 * Una competizione NON di lotta: usi le STESSE mosse dei Lumini, ma valgono per "stile/
 * bellezza", non per danno. Combini le mosse per fare colpo sulla giuria; un punteggio-
 * stile decide, ma non c'è MAI un perdente umiliato: tutti ricevono un applauso, il migliore
 * una coccarda. Le regole (punteggio + giudizio) stanno qui; la scena disegna e chiede.
 */

// Punti base per categoria di mossa (le speciali/signature "fanno più scena").
const PUNTI_CAT = { base: 2, speciale: 4, signature: 6 };

/** Punti-stile di UNA mossa, dato lo storico delle mosse già usate nella gara e il
 *  CRITERIO che la giuria premia (`favorisce`: 'base'|'speciale'|'signature'|'varieta').
 *  - Varietà: una mossa NUOVA fa più scena (+2); ripeterla annoia un po' (-1), ma mai 0.
 *  - Criterio: la giuria dà un bonus alla categoria che ama (o alla varietà).
 *  Minimo 1: ogni esibizione merita un applauso. */
export function valutaMossa(mossa, storia, favorisce) {
  let punti = PUNTI_CAT[(mossa && mossa.tipo)] || 2;
  const nuova = !(storia || []).includes(mossa && mossa.nome);
  punti += nuova ? 2 : -1;
  if (favorisce === 'varieta') { if (nuova) punti += 2; }
  else if (favorisce && favorisce === (mossa && mossa.tipo)) punti += 3;
  return Math.max(1, punti);
}

/** Punteggio totale di una sequenza di mosse (accumula lo storico giro per giro). */
export function punteggioTotale(sequenza, favorisce) {
  const storia = [];
  let tot = 0;
  for (const m of (sequenza || [])) { tot += valutaMossa(m, storia, favorisce); storia.push(m && m.nome); }
  return tot;
}

/** Punteggio "pieno" stimato per N turni (per normalizzare l'esito): categoria max + varietà + criterio. */
export function punteggioMax(turni) { return Math.max(1, turni) * (PUNTI_CAT.signature + 2 + 3); }

// F3 v2 — "A TEMPO": ogni mossa si esegue su un cursore che scorre; toccare vicino al centro
// della zona bersaglio vale di più. La QUALITÀ del tempo moltiplica i punti-stile base della
// mossa; azzeccare di fila costruisce una COMBO. Puro e testabile (la scena misura solo la x).
export const SOGLIE_TEMPO = { perfetto: 0.18, bene: 0.5 };   // scostamento 0..1 dal centro della zona

/** Qualità del tempo dato lo scostamento 0..1 dal centro (0 = centro pieno). Mai un "mancato":
 *  ogni tocco è comunque un'esibizione ('quasi'). Ritorna 'perfetto' | 'bene' | 'quasi'. */
export function qualitaTempo(scostamento) {
  const s = Math.max(0, Math.min(1, Math.abs(scostamento || 0)));
  if (s <= SOGLIE_TEMPO.perfetto) return 'perfetto';
  if (s <= SOGLIE_TEMPO.bene) return 'bene';
  return 'quasi';
}

/** Moltiplicatore della qualità del tempo. */
export function moltTempo(qualita) { return qualita === 'perfetto' ? 2 : qualita === 'bene' ? 1.4 : 1; }

/** Moltiplicatore combo (fino a +50% da 5 in su). */
export function moltCombo(combo) { return 1 + Math.min(Math.max(0, combo | 0), 5) * 0.1; }

/** Punti-stile di un'esibizione a tempo: base della mossa × tempo × combo, minimo 1. */
export function puntiEsibizione(base, qualita, combo) {
  return Math.max(1, Math.round((base || 0) * moltTempo(qualita) * moltCombo(combo)));
}

/** La combo AVANZA con 'perfetto'/'bene'; si azzera con 'quasi'. */
export function prossimaCombo(combo, qualita) { return qualita === 'quasi' ? 0 : (Math.max(0, combo | 0) + 1); }

/** Punteggio "pieno" per la modalità a tempo (base max × perfetto × combo medio): normalizza l'esito. */
export function punteggioMaxRitmo(turni) { return Math.max(1, turni) * puntiEsibizione(PUNTI_CAT.signature + 2 + 3, 'perfetto', 4); }

/** Esito della gara a TEMPO: come esito(), ma normalizzato sul massimo "a tempo". Sempre positivo. */
export function esitoRitmo(punteggio, turni) {
  const frac = punteggio / punteggioMaxRitmo(turni);
  const livello = frac >= 0.7 ? 3 : frac >= 0.45 ? 2 : frac >= 0.22 ? 1 : 0;
  const titoli = [
    'Che bella prova! Tutti applaudono 👏',
    'Bravo! La giuria sorride 👏',
    'Fantastico! Coccarda d\'argento 🥈',
    'Meraviglioso! Coccarda d\'oro 🏆',
  ];
  return { livello, titolo: titoli[livello], coccarda: livello >= 2, punteggio };
}

/** Esito SEMPRE positivo: livello 0-3, titolo incoraggiante, coccarda ai migliori.
 *  Nessun "hai perso": il livello 0 è comunque "che bella prova!". */
export function esito(punteggio, turni) {
  const frac = punteggio / punteggioMax(turni);
  const livello = frac >= 0.8 ? 3 : frac >= 0.55 ? 2 : frac >= 0.3 ? 1 : 0;
  const titoli = [
    'Che bella prova! Tutti applaudono 👏',
    'Bravo! La giuria sorride 👏',
    'Fantastico! Coccarda d\'argento 🥈',
    'Meraviglioso! Coccarda d\'oro 🏆',
  ];
  return { livello, titolo: titoli[livello], coccarda: livello >= 2, punteggio };
}
