/* gare-data.js — DATI delle Gare di Stile (F3). Zero logica (in motore/gare.js). Editabile
 * in futuro dal CMS. Ogni gara ha un CRITERIO che la giuria premia, un numero di turni e
 * un premio (cosmetico/collezione: mai una punizione). */

// Criteri: cosa ama la giuria. `favorisce` = 'base' | 'speciale' | 'signature' | 'varieta'.
export const CRITERI = {
  grazia:   { nome: 'Grazia',    emoji: '🌸', favorisce: 'base',      frase: 'La giuria premia le mosse eleganti e delicate!' },
  energia:  { nome: 'Energia',   emoji: '⚡', favorisce: 'speciale',  frase: 'La giuria adora le mosse potenti e scenografiche!' },
  fantasia: { nome: 'Fantasia',  emoji: '🎨', favorisce: 'varieta',   frase: 'La giuria vuole vedere tante mosse DIVERSE!' },
};

// Giurie buffe (reagiscono all'esibizione). Solo estetica.
export const GIUDICI = [
  { nome: 'Gufo Saggio', emoji: '🦉' },
  { nome: 'Gatta Elegante', emoji: '🐱' },
  { nome: 'Riccio Buffo', emoji: '🦔' },
];

// Gare disponibili (una città può ospitarne una — vedi campo `gara` nel JSON città).
export const GARE = {
  'gara-prati': { id: 'gara-prati', nome: 'Gara dei Prati', criterio: 'grazia', turni: 3, premio: { tipo: 'stelline', n: 6 } },
  'gara-luci':  { id: 'gara-luci',  nome: 'Gara delle Luci', criterio: 'energia', turni: 3, premio: { tipo: 'stelline', n: 6 } },
  'gara-arte':  { id: 'gara-arte',  nome: 'Gara della Fantasia', criterio: 'fantasia', turni: 4, premio: { tipo: 'oggetto', id: 'lumiball', n: 2 } },
  'gara-bosco':  { id: 'gara-bosco',  nome: 'Gara del Bosco',   criterio: 'grazia',  turni: 3, premio: { tipo: 'stelline', n: 6 } },   // Terraverde (natura)
  'gara-roccia': { id: 'gara-roccia', nome: 'Gara della Roccia', criterio: 'energia', turni: 3, premio: { tipo: 'stelline', n: 6 } },   // Pietrasanta (roccia)
};

export function getGara(id) { return GARE[id] || null; }
export function getCriterio(id) { return CRITERI[id] || null; }
