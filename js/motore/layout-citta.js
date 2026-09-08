/* motore/layout-citta.js — DOVE stanno le cose in una città. Dati puri, zero Phaser.
 *
 * Perché esiste (bug del torneo, 2026-09): il 2° allenatore di ogni città stava a (300,980)
 * — le stesse identiche coordinate di uno degli edifici. Risultato: il personaggio veniva
 * disegnato DENTRO la casa (la casa ha depth più alto → lo copre del tutto) e la sua
 * impronta di collisione impediva di avvicinarsi. A Luminia questo BLOCCAVA il gioco.
 *
 * Perché è cresciuto (PIANO_V3 filone A1): le sei città erano la STESSA città ridipinta —
 * stessi edifici, stessi punti per allenatori, capo, rivale, palloncini, tesori e ombre.
 * Cambiavano solo lo sfondo, la palette e i nomi. Era questa la monotonia, ed era la stessa
 * radice del bug: una posizione scritta una volta sola vale per tutte e sei.
 * Ora il layout è un DATO: ogni città può portare il suo in `layout` dentro il suo JSON, e
 * ciò che non dichiara ricade su questa base (che è esattamente com'era prima: zero
 * regressioni per chi non la personalizza).
 */

// Impronta a terra degli edifici: {x,y} = CENTRO del rettangolo di collisione, w×h la sua
// dimensione.
export const EDIFICI = [
  { x: 220, y: 200, w: 180, h: 130 },
  { x: 560, y: 180, w: 170, h: 120 },
  { x: 950, y: 240, w: 180, h: 140 },
  { x: 300, y: 980, w: 200, h: 150 },
  { x: 900, y: 1040, w: 190, h: 150 },
];

// Dimensioni del mondo-città (le stesse per tutte: cambia il contenuto, non il recinto).
export const MONDO = { larghezza: 1200, altezza: 1400 };

/**
 * Layout di base — i valori che il gioco usava quando erano scritti nel codice. Una città
 * che non dichiara nulla resta identica a prima.
 *   palestra          dove sorge l'edificio del capopalestra (se la città ne ha uno)
 *   ombre             punti dei Lumini selvatici (silhouette da toccare)
 *   tesori            forzieri nascosti
 *   palloncini        i palloncini della missione dei fiori + il cartello che la invita
 *   civile / rivale   Nonna Pina e Vido
 *   cartelli          uscita verso la mappa, insegna palestra, invito ai selvatici
 */
export const LAYOUT_BASE = {
  edifici: EDIFICI,
  palestra: { x: 600, y: 240 },
  ombre: [
    { x: 250, y: 650 }, { x: 470, y: 800 }, { x: 780, y: 560 },
    { x: 920, y: 860 }, { x: 360, y: 470 }, { x: 700, y: 980 },
  ],
  tesori: [{ x: 160, y: 280 }, { x: 1020, y: 1080 }],
  palloncini: [{ x: 260, y: 360 }, { x: 700, y: 1050 }, { x: 1040, y: 820 }, { x: 480, y: 720 }],
  cartelloPalloncini: { x: 900, y: 600 },
  civile: { x: 980, y: 480 },
  rivale: { x: 220, y: 480 },
  cartelli: {
    uscita: { x: 800, y: 1230 },
    palestra: { x: 770, y: 330 },
    selvatici: { x: 150, y: 560 },
  },
};

/** Il layout di una città: il suo `layout` (dal JSON) sopra la base. Mai un buco. */
export function layoutCitta(contenuto) {
  const l = (contenuto && contenuto.layout) || {};
  return {
    ...LAYOUT_BASE,
    ...l,
    // I cartelli sono un oggetto di oggetti: si fondono voce per voce, così una città può
    // spostare la sola uscita senza dover riscrivere anche gli altri due.
    cartelli: { ...LAYOUT_BASE.cartelli, ...(l.cartelli || {}) },
  };
}

// La PALESTRA è un edificio anche lei: impronta 220×150 e un disegno largo 260 posato a
// y+75 (origine in basso). Copre e blocca esattamente come una casa, quindi entra nei
// controlli — è la stessa geometria che aveva sepolto l'allenatore.
export const PALESTRA = { w: 220, h: 150, disegnoW: 260, sorgenteW: 512, sorgenteH: 301 };

/** Gli ingombri di una città: le case PIÙ la palestra, se la città ne ha una. */
export function occupanti(layout, haPalestra) {
  const e = [...layout.edifici];
  if (haPalestra && layout.palestra) {
    e.push({ x: layout.palestra.x, y: layout.palestra.y, w: PALESTRA.w, h: PALESTRA.h, palestra: true });
  }
  return e;
}

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
  const larghezza = e.palestra ? PALESTRA.disegnoW : e.w * CASA.fattoreLarghezza;
  const src = e.palestra ? PALESTRA : CASA;
  const altezza = src.sorgenteH * (larghezza / src.sorgenteW);
  const base = e.palestra ? e.y + 75 : e.y + e.h / 2;   // i piedi del disegno (origine 0.5,1)
  return { x1: e.x - larghezza / 2, y1: base - altezza, x2: e.x + larghezza / 2, y2: base };
}

function dentro(r, x, y) { return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; }

/** L'edificio che rende IMPRATICABILE il punto (dentro la collisione), o null. */
export function edificioCheBlocca(x, y, edifici = EDIFICI) {
  return edifici.find((e) => dentro(impronta(e), x, y)) || null;
}

/**
 * L'edificio che NASCONDE qualcosa piantato in (x,y), o null.
 * `altezza` = quanto è alto l'oggetto (un NPC ~92 px con i piedi a y+16; un forziere o un
 * palloncino molto meno): se il suo corpo cade nel disegno di una casa che gli sta DAVANTI
 * (depth della casa = base, maggiore del depth dell'oggetto = y), sparisce.
 */
export function edificioCheNasconde(x, y, edifici = EDIFICI, altezza = 92) {
  const piedi = y + 16, testa = piedi - altezza;
  return edifici.find((e) => {
    const r = ingombroVisivo(e);
    if (x < r.x1 || x > r.x2) return false;
    if (r.y2 <= y) return false;                       // casa DIETRO l'oggetto: ok
    return piedi >= r.y1 && testa <= r.y2;
  }) || null;
}

/** True se un oggetto in (x,y) è visibile e raggiungibile. Usato dal test di layout. */
export function postoBuono(x, y, edifici = EDIFICI, altezza = 92) {
  return !edificioCheBlocca(x, y, edifici) && !edificioCheNasconde(x, y, edifici, altezza);
}

/** Il punto sta dentro il recinto del mondo (con un margine)? */
export function dentroIlMondo(x, y, margine = 60) {
  return x >= margine && x <= MONDO.larghezza - margine
      && y >= margine && y <= MONDO.altezza - margine;
}
