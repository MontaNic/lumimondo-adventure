/* pepole-actor.js — Pepole come GameObject Phaser.
 *
 * RIFACIMENTO_PHASER → ASSET PNG: il corpo procedurale (Graphics + coda/fiamma)
 * è stato sostituito dallo sprite PNG `pepole` (caricato in PreloadScene). La
 * GEOMETRIA LOCALE e l'API restano identiche (origine al centro, `scala` via
 * opts, metodi idle()/reagisci()) così i call-site (spalla di Pietro su mappa e
 * città, angolo in battaglia, evoluzione, album) funzionano senza modifiche.
 *
 * Animazioni mantenute, applicate allo sprite: respiro (scala verticale) +
 * dondolio vispo (sostituisce lo scodinzolio della coda procedurale); reagisci()
 * resta il saltello tween. La fiammella sulla coda fa parte dell'asset PNG.
 */

import { creaOmbra, deformaOmbra } from './ombra.js';

// GRANDEZZA COSTANTE fra le espressioni. Le PNG sono tutte 256×256 ma Pepole ci sta
// dentro in modo diverso: in 'pepole' (normale) la figura è larga ~165px con molto
// margine trasparente, nelle espressioni ~252px. Prima si scalava sulla larghezza
// dell'IMMAGINE → passando da normale a felice/sorpresa Pepole diventava ~1,5× più
// grande di colpo (e i piedi si spostavano). Ora si misura la FIGURA reale (pixel non
// trasparenti) e si scala su √(larghezza×altezza) della figura: stessa "massa" anche
// tra posa seduta e sdraiata (dorme), e piedi sempre alla stessa quota.
const TAGLIA = 56;   // √(area) della figura a scala 1 (= la Pepole "normale" di prima)
const PIEDE_Y = 26;  // linea del suolo locale (ombra)
const PIEDI = 20;    // dove poggia il fondo della figura (un filo sopra l'ombra)
const _misure = new Map();   // texture → riquadro della figura (cache per tutto il gioco)

/** Riquadro dei pixel non trasparenti di una texture (misurato una volta sola). */
function misuraFigura(scene, key) {
  if (_misure.has(key)) return _misure.get(key);
  let m = null;
  try {
    const img = scene.textures.get(key).getSourceImage();
    const w = img.width, h = img.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) m = { w, h, cx: (x0 + x1 + 1) / 2, fondo: y1 + 1, fw: x1 - x0 + 1, fh: y1 - y0 + 1 };
  } catch { /* immagine non leggibile: si usa il riquadro intero */ }
  if (!m) {
    const f = scene.textures.get(key).getSourceImage() || { width: 256, height: 256 };
    m = { w: f.width, h: f.height, cx: f.width / 2, fondo: f.height, fw: f.width, fh: f.height };
  }
  _misure.set(key, m);
  return m;
}
// Espressioni → texture (caricate, se presenti, in PreloadScene).
const ESPR = { felice: 'pepole-felice', sorpresa: 'pepole-sorpresa', dorme: 'pepole-dorme', incoraggia: 'pepole-incoraggia' };

export class Pepole extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.scaleBase = opts.scala || 1;

    this.ombra = creaOmbra(scene, 42, PIEDE_Y, { alpha: 0.5 });
    this.sprite = scene.add.image(0, PIEDI, 'pepole');
    this._adatta('pepole');
    this.add([this.ombra, this.sprite]);   // ombra dietro
    this._esprTex = 'pepole';
    this._revertA = 0;

    this.setScale(this.scaleBase);
    scene.add.existing(this);
    this._t0 = scene.time.now + Math.random() * 800;
  }

  /** Scala e origine dalla FIGURA della texture: grandezza costante, centrata in
   *  orizzontale sul corpo, piedi appoggiati a quota PIEDI. */
  _adatta(key) {
    const m = misuraFigura(this.scene, key);
    this._baseScale = TAGLIA / Math.sqrt(m.fw * m.fh);
    this.sprite.setOrigin(m.cx / m.w, m.fondo / m.h);
    this.sprite.setScale(this._baseScale);
  }

  /** Cambia espressione (texture) senza cambiare grandezza né quota dei piedi.
   *  Fallback a 'pepole'. */
  setEspressione(nome) {
    const key = (nome && nome !== 'normale' && ESPR[nome] && this.scene.textures.exists(ESPR[nome])) ? ESPR[nome] : 'pepole';
    if (key === this._esprTex) return;
    this._esprTex = key;
    this.sprite.setTexture(key);
    this._adatta(key);
  }

  /** Espressione temporanea: mostra `nome` per `durata` ms, poi torna a normale. */
  emote(nome, durata = 900) {
    this.setEspressione(nome);
    this._revertA = this.scene.time.now + durata;
  }

  idle(now) {
    // Fine emote temporanea → torna normale (ma non svegliare se sta "dorme").
    if (this._revertA && now > this._revertA) {
      this._revertA = 0;
      if (this._esprTex !== ESPR.dorme) this.setEspressione('normale');
    }
    const t = (now - this._t0) / 1000;
    // Respiro (scala verticale) + lieve dondolio (al posto dello scodinzolio).
    const r = Math.sin(t * 3) * 0.03;
    this.sprite.scaleX = this._baseScale;
    this.sprite.scaleY = this._baseScale * (1 + r);
    this.sprite.rotation = Math.sin(t * 6) * 0.04;
    // L'ombra si deforma se Pepole è sollevata (saltello di reagisci()).
    deformaOmbra(this.ombra, Math.max(0, PIEDI - this.sprite.y), 12);
  }

  reagisci() {
    // Saltello (lo SPRITE, non il container: l'ombra resta a terra) + faccia felice.
    this.emote('felice', 900);
    // (Tween dalla quota dei piedi: se un saltello parte mentre l'altro è in corso,
    //  si ferma il precedente così Pepole non resta "sollevata".)
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.y = PIEDI;
    this.scene.tweens.add({ targets: this.sprite, y: PIEDI - 12, duration: 120, yoyo: true, ease: 'Quad.out' });
  }
}
