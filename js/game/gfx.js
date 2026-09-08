/* gfx.js — utility per gli asset procedurali Phaser (niente immagini esterne).
 * Colori dal canone, generazione texture tile, piccole primitive condivise. */

/** Feedback aptico (solo dove supportato, fail-safe altrove — iPad ignora). */
export function vibra(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* niente */ }
}

/** Fattore qualità per particelle/effetti (1 = piena, 0.5 = ridotta). Lo regola
 *  il monitor FPS in main.js scrivendo window.LUMI.qualita. #83 — con
 *  prefers-reduced-motion riduce ulteriormente gli effetti d'ambiente (sensibilità
 *  sensoriali). */
let _reduced = null;
function preferisceMenoMovimento() {
  if (_reduced === null) {
    try { _reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch { _reduced = false; }
  }
  return _reduced;
}
export function fattoreQualita() {
  const bassa = (typeof window !== 'undefined' && window.LUMI && window.LUMI.qualita === 'bassa');
  let f = bassa ? 0.5 : 1;
  if (preferisceMenoMovimento()) f *= 0.4;   // molte meno particelle/ambiente
  return f;
}

/** '#rrggbb' → intero 0xrrggbb per le API Phaser. */
export function col(hex) {
  return typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
}

/** Schiarisce/scurisce un colore hex di `amt` (-1..1). */
export function shade(hex, amt) {
  const n = col(hex);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/**
 * Genera una texture "erba" tileabile (32×32) con qualche ciuffo, registrata
 * nel TextureManager con la chiave data. Idempotente.
 */
export function generaTextureErba(scene, chiave = 'erba', base = '#7ec85a') {
  if (scene.textures.exists(chiave)) return chiave;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(col(base), 1);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(shade(base, -0.06), 1);
  // ciuffi d'erba pseudo-casuali ma deterministici
  const ciuffi = [[6, 10], [20, 6], [12, 22], [26, 24], [2, 28], [18, 16]];
  ciuffi.forEach(([x, y]) => {
    g.fillRect(x, y, 2, 5);
    g.fillRect(x + 3, y + 2, 2, 4);
  });
  g.fillStyle(shade(base, 0.06), 0.6);
  g.fillRect(0, 0, 32, 2);
  g.generateTexture(chiave, 32, 32);
  g.destroy();
  return chiave;
}

/** Texture "strada/sentiero" beige tileabile. */
export function generaTextureStrada(scene, chiave = 'strada', base = '#d8c08a') {
  if (scene.textures.exists(chiave)) return chiave;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(col(base), 1);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(shade(base, -0.08), 1);
  [[5, 8], [22, 14], [12, 26], [27, 4]].forEach(([x, y]) => g.fillRect(x, y, 3, 3));
  g.generateTexture(chiave, 32, 32);
  g.destroy();
  return chiave;
}

/**
 * Bordo SPECCHIATO attorno a uno sfondo di mondo, perché su schermi più grandi del mondo
 * (tipico del PC) non resti una striscia scoperta ai lati. Riflettere l'immagine oltre il
 * bordo la rende continua PER COSTRUZIONE: la giunzione cade su una linea di simmetria e
 * non si vede. Prima lì c'era un fondale sfocato di scala diversa, con una cucitura netta.
 *
 * Aggiunge solo i pezzi che servono davvero (i lati e, se serve, gli angoli) e li disegna
 * allo stesso `depth` del terreno, così restano dietro a tutto il resto.
 * Ritorna gli oggetti creati, per poterli rifare a un ridimensionamento.
 */
export function bordoSpecchiato(scene, tex, mondoW, mondoH, bordo, depth = -1000) {
  const pezzi = [];
  const metti = (x, y, ox, oy, flipX, flipY) => {
    const img = scene.add.image(x, y, tex).setOrigin(ox, oy).setDisplaySize(mondoW, mondoH).setDepth(depth);
    img.setFlipX(flipX).setFlipY(flipY);
    pezzi.push(img);
  };
  if (bordo.x > 0) {
    metti(0, 0, 1, 0, true, false);            // a sinistra, riflesso
    metti(mondoW, 0, 0, 0, true, false);       // a destra, riflesso
  }
  if (bordo.y > 0) {
    metti(0, 0, 0, 1, false, true);            // sopra
    metti(0, mondoH, 0, 0, false, true);       // sotto
  }
  if (bordo.x > 0 && bordo.y > 0) {            // angoli: riflesso doppio
    metti(0, 0, 1, 1, true, true);
    metti(mondoW, 0, 0, 1, true, true);
    metti(0, mondoH, 1, 0, true, true);
    metti(mondoW, mondoH, 0, 0, true, true);
  }
  return pezzi;
}
