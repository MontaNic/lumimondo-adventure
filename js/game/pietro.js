/* pietro.js — il protagonista come GameObject Phaser.
 *
 * RIFACIMENTO_PHASER → ASSET PNG: il corpo procedurale (Graphics per direzione)
 * è stato sostituito dallo sprite PNG anime `pietro` (caricato in PreloadScene).
 * La GEOMETRIA LOCALE resta identica a prima (origine al centro, piedi/ombra a
 * y≈+22, ingombro ~40×52) così TUTTI i call-site nelle scene (mappa, città,
 * evoluzione, playground) funzionano senza modifiche.
 *
 * Le animazioni esistenti sono mantenute, applicate allo sprite invece che alle
 * forme: falcata → rimbalzo verticale + leggero dondolio col perno ai piedi;
 * da fermo → respiro lento; cambio direzione → flip orizzontale (sx/dx).
 * Non esistendo frame "di spalle", su/giù mostrano comunque lo sprite frontale.
 *
 * Canone (PROJECT_BRIEF / asset): berretto rosso, occhialini, giacca rossa,
 * pantaloncini blu. Niente zaino.
 */

import { creaOmbra, deformaOmbra } from './ombra.js';

const ANCHOR_Y = 22;   // linea dei piedi (come la vecchia ombra)
const TARGET_H = 92;   // altezza visiva a scala 1 (ingrandito: prima 60 era troppo piccolo)

export class Pietro extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);

    this.direzione = 'giu';   // 'giu' | 'su' | 'sx' | 'dx'
    this.fasePasso = 0;       // accumulatore della falcata (cresce con la distanza)
    this.inMovimento = false;

    // Base sprite per GENERE: femmina → 'pietra*' (se il PNG c'è), altrimenti 'pietro*'.
    // Fallback sicuro: senza l'asset femminile resta Pietro, niente si rompe.
    this._base = (typeof window !== 'undefined' && window.GS && window.GS.profilo && window.GS.profilo.genere === 'femmina' && scene.textures.exists('pietra')) ? 'pietra' : 'pietro';
    // Ha i frame di PASSO (camminata animata a sprite)? Pietro sì, la bimba no: per chi
    // non li ha, la camminata è resa con un rimbalzo/oscillazione procedurale più marcato.
    this._haPasso = scene.textures.exists(this._base + '-fronte-passo');
    // Ombra morbida a terra (sotto ai piedi), poi lo sprite con origine sui piedi.
    this.ombra = creaOmbra(scene, 38, ANCHOR_Y);
    this.sprite = scene.add.image(0, ANCHOR_Y, this._base).setOrigin(0.5, 1);
    this._baseScale = TARGET_H / (this.sprite.height || TARGET_H);
    this.sprite.setScale(this._baseScale);
    this.add([this.ombra, this.sprite]);
    this._texCorr = this._base;

    this.setSize(40, 52);

    scene.add.existing(this);
    if (scene.physics && scene.physics.add) {
      scene.physics.add.existing(this);
      // Corpo collisione: una capsula ai piedi, non tutta la figura.
      this.body.setSize(26, 18);
      this.body.setOffset(-13, 6);
      this.body.setCollideWorldBounds(true);
    }
  }

  setDirezione(d) {
    if (d === this.direzione) return;
    this.direzione = d;
    // Flip solo per sx/dx; su/giù restano frontali (niente sprite di spalle).
    this.sprite.flipX = (d === 'sx');
  }

  /** Compatibilità: un tempo ridisegnava le forme. Ora basta il flip. */
  disegna() { this.sprite.flipX = (this.direzione === 'sx'); }

  /** Sceglie il frame giusto per direzione + fase del passo. Camminata a 2 frame:
   *  idle/contatto ↔ passo. Se manca il frame di PASSO di una direzione, si resta
   *  sull'IDLE DELLA STESSA DIREZIONE (non si "salta" al fronte): così la femmina, che
   *  ha solo fronte/retro idle + laterale, cammina sempre rivolta nel verso giusto. */
  _aggiornaTextura() {
    const d = this.direzione;
    const ex = (key) => this.scene.textures.exists(key);
    const b = this._base;   // 'pietro' o 'pietra'
    const lato = (d === 'sx' || d === 'dx');
    const haLato = lato && ex(b + '-lato');
    // Idle della direzione corrente (con fallback alla base se assente).
    let idle = (d === 'su') ? b + '-retro' : (haLato ? b + '-lato' : b);
    if (!ex(idle)) idle = b;
    let k = idle;
    if (this.inMovimento && Math.sin(this.fasePasso) > 0) {
      const passoK = (d === 'su') ? b + '-retro-passo' : (haLato ? b + '-lato-passo' : b + '-fronte-passo');
      if (ex(passoK)) k = passoK;   // usa il passo solo se c'è; altrimenti resta sull'idle
    }
    if (!ex(k)) k = b;
    if (k !== this._texCorr) { this._texCorr = k; this.sprite.setTexture(k); }
  }

  /**
   * Aggiorna posa e direzione a partire dalla velocità corrente.
   * @param {number} vx velocità x (px/s)
   * @param {number} vy velocità y (px/s)
   * @param {number} dtMs delta time del frame in ms
   */
  aggiornaMovimento(vx, vy, dtMs) {
    const v = Math.hypot(vx, vy);
    this.inMovimento = v > 6;

    if (this.inMovimento) {
      // Isteresi: cambio direzione solo se un asse DOMINA chiaramente (margine 35%).
      // Così niente sfarfallio fronte/retro in diagonale: Pietro "resta girato"
      // nella direzione attuale finché non gira davvero o si ferma.
      const ax = Math.abs(vx), ay = Math.abs(vy);
      if (ax > ay * 1.35) this.setDirezione(vx < 0 ? 'sx' : 'dx');
      else if (ay > ax * 1.35) this.setDirezione(vy < 0 ? 'su' : 'giu');
      // La falcata avanza con la distanza percorsa → cadenza proporzionale alla velocità.
      const dist = v * (dtMs / 1000);
      this.fasePasso += dist / 9;   // cadenza dei passi (più piccolo = passi più frequenti)
    }
    this._applicaPosa(dtMs);
    // Davanti/dietro: chi è più in basso passa sopra. Aggiorno solo se la y cambia
    // davvero → meno ri-ordinamenti della display list (più fluido).
    if (this._lastDepthY === undefined || Math.abs(this._lastDepthY - this.y) > 1) {
      this._lastDepthY = this.y;
      this.setDepth(this.y);
    }
  }

  _applicaPosa(dtMs) {
    this._aggiornaTextura();
    if (this.inMovimento) {
      const s = Math.sin(this.fasePasso);
      // Camminata VISIBILE per tutti: rimbalzo del corpo + ondeggio "a papera" (rotazione
      // col perno ai piedi) + squash all'atterraggio. Chi NON ha i frame di passo (la
      // bimba) ha un boost così cammina lo stesso in modo vivace.
      const forte = this._haPasso ? 1 : 1.25;
      const bob = -Math.abs(s) * 3 * forte;
      this.sprite.y = ANCHOR_Y + bob;
      this.sprite.x = s * 0.8 * forte;                 // dondolio laterale appena accennato
      this.sprite.rotation = s * 0.035 * forte;        // leggero ondeggio
      this.sprite.scaleX = this._baseScale;
      this.sprite.scaleY = this._baseScale * (1 + Math.abs(s) * 0.03);
      deformaOmbra(this.ombra, -bob, 3);   // si schiaccia all'atterraggio del passo
    } else {
      // Idle: respiro lento (scala verticale), niente dondolio.
      const r = Math.sin(this.scene.time.now / 600);
      this.sprite.y = ANCHOR_Y + r * 0.4;
      this.sprite.x = 0;                 // azzera il dondolio della camminata
      this.sprite.rotation = 0;
      this.sprite.scaleX = this._baseScale;
      this.sprite.scaleY = this._baseScale * (1 + r * 0.012);
      deformaOmbra(this.ombra, Math.max(0, -r * 0.4), 3);
    }
  }
}
