/* citta-data.js — le 6 città del viaggio e le zone selvatiche tra loro.
 *
 * Dati condivisi da mappa.js (A1-11) e dalle schermate città (A1-12/13...).
 * Le posizioni `pos` sono coordinate nel viewBox della mappa (0 0 1000 640).
 * `luminiSelvatici` elenca le specie incontrabili nella zona/città (canone
 * aggiornato: Guscetto/Foglino al posto di Splasho/Germolo).
 */

import { possiediLinea } from './lumini-data.js';

export const ORDINE_CITTA = ['pietropoli', 'acquaverde', 'terraverde', 'voltopoli', 'pietrasanta', 'luminia'];

// Quanti palloncini-indovinello sparsi per città (vedi CittaScene._missione).
export const N_PALLONCINI = 4;

export const CITTA = {
  pietropoli: {
    id: 'pietropoli', nome: 'Pietropoli', ordine: 0, elemento: null,
    palette: { primario: '#ff8c28', scuro: '#a85614' },
    descrizione: 'La città di Pietro. Qui comincia tutto.',
    tutorial: true, leader: null, medaglia: null, allenatori: 0,
    luminiSelvatici: ['foglino'],   // villaggio-giardino: Lumini di natura comuni
    pos: { x: 140, y: 540 },
  },
  acquaverde: {
    id: 'acquaverde', nome: 'Acquaverde', ordine: 1, elemento: 'acqua',
    palette: { primario: '#34a0d8', scuro: '#1f6f9c' },
    descrizione: 'Città sul lago. Leader: Marina.',
    leader: 'Marina', medaglia: 'onda', allenatori: 2,
    luminiSelvatici: ['guscetto', 'brizzo', 'buzzino'],   // 3 selvatici (specie base distinte) da catturare
    pos: { x: 340, y: 410 },
  },
  terraverde: {
    id: 'terraverde', nome: 'Terraverde', ordine: 2, elemento: 'natura',
    palette: { primario: '#4caf50', scuro: '#2c7a33' },
    descrizione: 'Città del giardino botanico. Leader: Silvio.',
    leader: 'Silvio', medaglia: 'radice', allenatori: 2,
    luminiSelvatici: ['foglino', 'buzzino', 'roccolo'],
    pos: { x: 540, y: 520 },
  },
  voltopoli: {
    id: 'voltopoli', nome: 'Voltopoli', ordine: 3, elemento: 'elettricita',
    palette: { primario: '#ffd23f', scuro: '#b8860b' },
    descrizione: 'Città delle invenzioni. Leader: Rik.',
    leader: 'Rik', medaglia: 'scintilla', allenatori: 3,
    luminiSelvatici: ['zappix', 'brizzo', 'foglino'],
    pos: { x: 720, y: 360 },
  },
  pietrasanta: {
    id: 'pietrasanta', nome: 'Pietrasanta', ordine: 4, elemento: 'roccia',
    palette: { primario: '#9b8579', scuro: '#5f5046' },
    descrizione: 'Città di pietra. Leader: Rocco.',
    leader: 'Rocco', medaglia: 'granito', allenatori: 3,
    luminiSelvatici: ['roccolo', 'zappix', 'guscetto'],
    pos: { x: 540, y: 210 },
  },
  luminia: {
    id: 'luminia', nome: 'Luminia', ordine: 5, elemento: null,
    palette: { primario: '#ffd23f', scuro: '#c79a1e' },
    descrizione: 'La città del Grande Torneo.',
    torneo: true, leader: null, medaglia: null, allenatori: 3,
    luminiSelvatici: ['fiammino', 'foglino', 'brizzo'],
    pos: { x: 850, y: 120 },
  },
};

// Zone selvatiche tra una città e la successiva (per incontri/cattura).
export const ZONE = [
  { id: 'sentiero-prati', da: 'pietropoli', a: 'acquaverde', nome: 'Sentiero dei Prati', luminiSelvatici: ['guscetto', 'brizzo'] },
  { id: 'riva-lago', da: 'acquaverde', a: 'terraverde', nome: 'Riva del Lago', luminiSelvatici: ['guscetto', 'foglino'] },
  { id: 'bosco-fitto', da: 'terraverde', a: 'voltopoli', nome: 'Bosco Fitto', luminiSelvatici: ['foglino', 'zappix'] },
  { id: 'valle-tuoni', da: 'voltopoli', a: 'pietrasanta', nome: 'Valle dei Tuoni', luminiSelvatici: ['zappix', 'roccolo'] },
  { id: 'sentiero-roccioso', da: 'pietrasanta', a: 'luminia', nome: 'Sentiero Roccioso', luminiSelvatici: ['roccolo', 'brizzo'] },
];

export function getCitta(id) { return CITTA[id] || null; }
export function cittaInOrdine() { return ORDINE_CITTA.map((id) => CITTA[id]); }
export function zonaTra(da, a) { return ZONE.find((z) => z.da === da && z.a === a) || null; }

/** Roster FISSO dei Lumini selvatici di una città: 2-3 specie BASE distinte da
 *  catturare (niente popolazione infinita). Indici/posizioni deterministici in
 *  CittaScene._spawnLuminiOmbra. Pietropoli (tutorial) non ne ha. */
export function wildRoster(id) {
  const c = CITTA[id];
  if (!c || id === 'pietropoli') return [];
  const r = (c.luminiSelvatici || []).slice(0, 3);
  return r.length ? r : ['brizzo'];
}

/** Numero di Lumini selvatici del roster fisso di una città (2-3). */
export function wildTotale(id) { return wildRoster(id).length; }

/** Percentuale di completamento di una città (0-100). Il livello è al 100% quando
 *  è stato fatto TUTTO, pesato in parti uguali:
 *   1. tutti i palloncini-indovinello raccolti;
 *   2. tutti i Lumini selvatici del roster CATTURATI (si possiede la loro linea →
 *      lo scopo è "catturarli tutti"; sconfiggerli senza prenderli non basta);
 *   3. tutti gli allenatori battuti almeno una volta (restano ripetibili);
 *   4. la tappa principale (`<id>:fatta` = medaglia/torneo).
 *  Pietropoli (tutorial) conta solo la tappa principale.
 *  Usata per il badge % sulla casetta in mappa. */
export function completamentoCitta(id) {
  const c = CITTA[id];
  if (!c) return 0;
  const flags = (typeof window !== 'undefined' && window.GS && window.GS.progressiStoria) || {};
  let fatto = 0, totale = 0;
  if (id !== 'pietropoli') {
    // 1. palloncini-indovinello (flag storico `fiore:<id>:<i>`, conservato per i salvataggi)
    totale += N_PALLONCINI;
    for (let i = 0; i < N_PALLONCINI; i++) if (flags['fiore:' + id + ':' + i]) fatto++;
    // 2. selvatici del roster: contano SOLO le specie ANCORA DA CATTURARE qui. Una specie
    //    già posseduta (starter/catturata altrove) NON ricompare in città (vedi
    //    _spawnLuminiOmbra) → non è un "compito" e NON va pre-accreditata. (Bug: prima
    //    ogni specie posseduta contava come fatta → una città appena sbloccata risultava
    //    già al 27% perché aveva specie comuni come lo starter nel roster.)
    for (const sp of wildRoster(id)) if (!possiediLinea(sp)) totale += 1;   // resta da prendere
    // 3. allenatori battuti (idSfida `<id>-all<k>`, flag `sfida:...:vinta`)
    const nall = c.allenatori || 0;
    totale += nall;
    for (let k = 1; k <= nall; k++) if (flags['sfida:' + id + '-all' + k + ':vinta']) fatto++;
  }
  totale += 1;   // 4. tappa principale (medaglia/torneo)
  if (flags[id + ':fatta']) fatto++;
  return totale ? Math.round((100 * fatto) / totale) : 0;
}
