/* motore/layout-citta.js — geometria degli EDIFICI di una città, PURA (zero Phaser, test).
 *
 * Perché esiste (bug del torneo, 2026-09): il 2° allenatore di ogni città stava a (300,980)
 * — le stesse identiche coordinate di uno degli edifici. Risultato: il personaggio veniva
 * disegnato DENTRO la casa (la casa ha depth più alto → lo copre del tutto) e la sua
 * impronta di collisione impediva di avvicinarsi. Pietro non poteva vederlo né sfidarlo.
 * A Luminia questo BLOCCAVA il gioco: il Maestro si sblocca solo battendo tutti e 3 gli
 * sfidanti del torneo, e il 2° era invisibile → "te ne manca 1" per sempre.
 *
 * La geometria vive qui, come DATI, così una regressione del genere la becca un test
 * (`test/citta-layout.test.mjs`) invece di un bambino di 7 anni.
 */

// Impronta a terra degli edifici: {x,y} = CENTRO del rettangolo di collisione, w×h la sua
// dimensione. Identica per tutte le città (lo sfondo cambia, il layout no).
export const EDIFICI = [
  { x: 220, y: 200, w: 180, h: 130 },
  { x: 560, y: 180, w: 170, h: 120 },
  { x: 950, y: 240, w: 180, h: 140 },
  { x: 300, y: 980, w: 200, h: 150 },
  { x: 900, y: 1040, w: 190, h: 150 },
];

// Sorgente di `obj-casa` (assets/oggetti/casa.png) e come la scena la scala: larghezza
// disegnata = w*1.5, origine (0.5, 1) posata a y + h/2. Serve a calcolare l'INGOMBRO
// VISIVO, che è molto più alto dell'impronta (il tetto copre ciò che sta "dietro").
export const CASA = { sorgenteW: 512, sorgenteH: 369, fattoreLarghezza: 1.5 };

/** Rettangolo {x1,y1,x2,y2} dell'impronta di collisione di un edificio. */
export function impronta(e) {
  return { x1: e.x - e.w / 2, y1: e.y - e.h / 2, x2: e.x + e.w / 2, y2: e.y + e.h / 2 };
}

/** Rettangolo {x1,y1,x2,y2} coperto dal DISEGNO della casa (tetto compreso). */
export function ingombroVisivo(e) {
  const larghezza = e.w * CASA.fattoreLarghezza;
  const altezza = CASA.sorgenteH * (larghezza / CASA.sorgenteW);
  const base = e.y + e.h / 2;             // i piedi della casa (origine 0.5,1)
  return { x1: e.x - larghezza / 2, y1: base - altezza, x2: e.x + larghezza / 2, y2: base };
}

function dentro(r, x, y) { return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; }

/** L'edificio che rende IMPRATICABILE il punto (dentro la collisione), o null. */
export function edificioCheBlocca(x, y, edifici = EDIFICI) {
  return edifici.find((e) => dentro(impronta(e), x, y)) || null;
}

/**
 * L'edificio che NASCONDE un personaggio piantato in (x,y), o null.
 * Un NPC è alto ~92px con i piedi a y+16: se quel corpo cade nel disegno di una casa che
 * gli sta davanti (depth della casa = base, maggiore del depth dell'NPC = y), sparisce.
 */
export function edificioCheNasconde(x, y, edifici = EDIFICI) {
  const piedi = y + 16, testa = piedi - 92;
  return edifici.find((e) => {
    const r = ingombroVisivo(e);
    if (x < r.x1 || x > r.x2) return false;
    if (r.y2 <= y) return false;                       // casa DIETRO l'NPC (depth minore): ok
    return piedi >= r.y1 && testa <= r.y2;             // corpo sovrapposto al disegno
  }) || null;
}

/** True se un personaggio in (x,y) è visibile e raggiungibile. Usato dal test di layout. */
export function postoBuono(x, y, edifici = EDIFICI) {
  return !edificioCheBlocca(x, y, edifici) && !edificioCheNasconde(x, y, edifici);
}
