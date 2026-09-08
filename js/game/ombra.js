/* ombra.js — ombre morbide condivise sotto i personaggi e i Lumini (M-03).
 *
 * Un'unica texture "ombra morbida" (ellisse sfumata) generata una volta e
 * riusata come Image sotto ogni attore. L'ombra:
 *  - scala con la dimensione dello sprite (è figlia del container → segue lo scale);
 *  - si deforma col movimento: a terra si schiaccia (più larga), in aria si
 *    rimpicciolisce e si fa più tenue (deformaOmbra in base al "sollevamento").
 * Nero ~25% effettivo, bordo sfumato (somma di ellissi semitrasparenti → blur).
 */

const KEY = 'ombraMorbida';
const TW = 128, TH = 64;            // texture: ellisse larga il doppio dell'altezza

/** Genera (una volta) la texture dell'ombra morbida. Idempotente. */
export function texturaOmbra(scene, key = KEY) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const cx = TW / 2, cy = TH / 2;
  // Sfumatura "finta-blur": tante ellissi concentriche semitrasparenti che,
  // sommandosi (source-over), scuriscono il centro e svaniscono ai bordi.
  const N = 16;
  for (let i = N; i >= 1; i--) {
    const f = i / N;
    g.fillStyle(0x000000, 0.045);
    g.fillEllipse(cx, cy, TW * f, TH * f);
  }
  g.generateTexture(key, TW, TH);
  g.destroy();
  return key;
}

/**
 * Crea un'ombra (Image) da aggiungere come PRIMO figlio del container, così
 * sta dietro all'attore. `larghezza` = larghezza visiva desiderata (px).
 */
export function creaOmbra(scene, larghezza, y = 0, opts = {}) {
  texturaOmbra(scene);
  const o = scene.add.image(0, y, KEY).setOrigin(0.5, 0.5);
  const s = larghezza / TW;
  o._baseSX = s;
  o._baseSY = s;
  o._baseAlpha = opts.alpha != null ? opts.alpha : 0.55;   // picco texture ~0.48 → ~0.26 effettivo
  o.setScale(s).setAlpha(o._baseAlpha);
  return o;
}

/**
 * Deforma l'ombra in base al "sollevamento" dell'attore dal suolo (px).
 * lift=0 → a terra (leggermente più larga e schiacciata, effetto atterraggio);
 * lift≥refLift → in aria (più piccola, più stretta e tenue).
 */
export function deformaOmbra(o, lift = 0, refLift = 8) {
  if (!o) return;
  const s = Math.max(0, Math.min(1, lift / refLift));
  o.scaleX = o._baseSX * (1 + 0.12 * (1 - s) - 0.22 * s);
  o.scaleY = o._baseSY * (1 - 0.05 * (1 - s) - 0.22 * s);
  o.alpha = o._baseAlpha * (1 - 0.5 * s);
}
