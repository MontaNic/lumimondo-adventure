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

const BASE_W = 88;   // LARGHEZZA visiva a scala 1. Scalo per larghezza (non altezza)
                     // perché le espressioni hanno ritagli d'altezza diversi (dorme è
                     // raccolta) ma larghezza simile → così Pepole resta sempre grande uguale.
const PIEDE_Y = 26;  // linea del suolo locale (sotto la pancia, sprite origine 0.58)
// Espressioni → texture (caricate, se presenti, in PreloadScene).
const ESPR = { felice: 'pepole-felice', sorpresa: 'pepole-sorpresa', dorme: 'pepole-dorme', incoraggia: 'pepole-incoraggia' };

export class Pepole extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.scaleBase = opts.scala || 1;

    this.ombra = creaOmbra(scene, 42, PIEDE_Y, { alpha: 0.5 });
    this.sprite = scene.add.image(0, 0, 'pepole').setOrigin(0.5, 0.58);
    this._baseScale = BASE_W / (this.sprite.width || BASE_W);
    this.sprite.setScale(this._baseScale);
    this.add([this.ombra, this.sprite]);   // ombra dietro
    this._esprTex = 'pepole';
    this._revertA = 0;

    this.setScale(this.scaleBase);
    scene.add.existing(this);
    this._t0 = scene.time.now + Math.random() * 800;
  }

  /** Cambia espressione (texture). Scalo per LARGHEZZA → Pepole resta della stessa
   *  dimensione anche con pose di altezza diversa. Fallback a 'pepole'. */
  setEspressione(nome) {
    const key = (nome && nome !== 'normale' && ESPR[nome] && this.scene.textures.exists(ESPR[nome])) ? ESPR[nome] : 'pepole';
    if (key === this._esprTex) return;
    this._esprTex = key;
    this.sprite.setTexture(key);
    this._baseScale = BASE_W / (this.sprite.width || BASE_W);
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
    deformaOmbra(this.ombra, Math.max(0, -this.sprite.y), 12);
  }

  reagisci() {
    // Saltello (lo SPRITE, non il container: l'ombra resta a terra) + faccia felice.
    this.emote('felice', 900);
    this.scene.tweens.add({ targets: this.sprite, y: -12, duration: 120, yoyo: true, ease: 'Quad.out' });
  }
}
