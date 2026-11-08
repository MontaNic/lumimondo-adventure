/* AperturaScene — apertura del gioco in stile GDR retrò a colori (schermo-titolo anni '90).
 *
 * Logo che entra ruotando + face-off GIOCOSO (Pietro e Pepole vs un Lumino che
 * entrano dai due lati e si "sfidano per gioco" con un balzo e scintille — zero
 * violenza) + "TOCCA PER INIZIARE". Sempre skippabile con un tocco e auto-avanza
 * a ProfiloScene: mai bloccante per un bambino.
 *
 * Demo: index.html?demo=apertura
 */

import audio from '../../audio.js';
import * as Juice from '../juice.js';

export class AperturaScene extends Phaser.Scene {
  constructor() { super('AperturaScene'); }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this._uscito = false;
    this.cameras.main.setBackgroundColor('#1a1226');
    this.cameras.main.fadeIn(400);

    // Fondale: il prato dell'arena, scurito — dà "mondo" senza rubare la scena.
    if (this.textures.exists('sfondo-arena')) {
      const bg = this.add.image(W / 2, H / 2, 'sfondo-arena').setDepth(-100);
      const s = Math.max(W / bg.width, H / bg.height);
      bg.setScale(s);
      this.tweens.add({ targets: bg, scale: s * 1.05, yoyo: true, repeat: -1, duration: 9000, ease: 'Sine.inOut' });
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a1030, 0.45).setDepth(-90);
    Juice.particelleAmbiente(this, { n: 12, colore: 0xfff0b8, depth: -80 });

    // --- Logo: stella che entra ruotando + titolo (stile MenuScene) ---
    // Su schermo basso la stella toccava il titolo: più piccola e più in alto.
    const rStella = H < 520 ? 32 : 44;
    const logo = this.add.container(W / 2, Math.min(H * 0.22, H * 0.33 - 30 - rStella)).setDepth(10);
    const g = this.add.graphics();
    this._stella(g, 0, 0, rStella, 0xffd23f, 0x8a4b1e);
    logo.add(g);
    logo.setScale(0).setAngle(-180);
    this.tweens.add({ targets: logo, scale: 1, angle: 0, duration: 700, ease: 'Back.out' });
    this.tweens.add({ targets: logo, y: logo.y - 8, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.inOut', delay: 700 });

    const t1 = this.add.text(W / 2, H * 0.33, 'Lumimondo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '44px', color: '#ffffff', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(10);
    const t2 = this.add.text(W / 2, H * 0.40, 'Adventure', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
    Juice.entrata(this, t1, { da: 0.5, dur: 460, delay: 350 });
    Juice.entrata(this, t2, { da: 0.5, dur: 460, delay: 520 });

    // --- Face-off giocoso: Pietro (+ Pepole) vs un Lumino, entrano dai lati ---
    const fy = H * 0.63;
    const eroe = this._attore('pietro', -180, fy, H * 0.22, 0xff6b4a, 42).setDepth(8);
    const specie = ['fiammino', 'foglino', 'guscetto'].find((s) => this.textures.exists('lum-' + s));
    const nemico = this._attore(specie ? 'lum-' + specie : null, W + 180, fy + 6, H * 0.18, 0x6cb84f, 36).setDepth(8);
    if (nemico.setFlipX) nemico.setFlipX(true);   // rivolto verso Pietro

    this.tweens.add({ targets: eroe, x: W * 0.30, duration: 620, delay: 700, ease: 'Cubic.out' });
    this.tweens.add({
      targets: nemico, x: W * 0.70, duration: 620, delay: 760, ease: 'Cubic.out',
      onComplete: () => this._faceOff(eroe, nemico),
    });

    // (Niente Pepole qui: nella storia Pietro la INCONTRA a Pietropoli, non ce l'ha
    //  ancora all'avvio. Mostrarla nel face-off creava un'incoerenza con l'intro.)

    // --- "TOCCA PER INIZIARE" dopo il face-off ---
    this.time.delayedCall(1750, () => this._prompt());

    // Tocco ovunque = inizia/salta. Rete di sicurezza: auto-avanza dopo 9s.
    this.input.on('pointerdown', () => this._inizia());
    this.time.delayedCall(9000, () => this._inizia());
    this.events.once('shutdown', () => this.input.off('pointerdown'));
  }

  /** Il balzo amichevole: si "sfidano per gioco", scintille, nessun urto. */
  _faceOff(eroe, nemico) {
    if (audio.suono) audio.suono('lancio');
    this.tweens.add({ targets: eroe, x: eroe.x + 26, duration: 180, yoyo: true, ease: 'Quad.out' });
    this.tweens.add({
      targets: nemico, x: nemico.x - 26, duration: 180, yoyo: true, ease: 'Quad.out',
      onComplete: () => { Juice.coriandoli(this, this.W / 2, this.H * 0.6, 18); if (audio.suono) audio.suono('stellina'); },
    });
    // Idle dolce dopo il balzo.
    this.tweens.add({ targets: eroe, y: eroe.y - 6, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.inOut', delay: 420 });
    this.tweens.add({ targets: nemico, angle: 4, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.inOut', delay: 420 });
  }

  _prompt() {
    if (this._uscito) return;
    const t = this.add.text(this.W / 2, this.H * 0.87, '✨ TOCCA PER INIZIARE ✨', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff6e3', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0.25, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
  }

  _inizia() {
    if (this._uscito) return;
    this._uscito = true;
    if (audio.suono) audio.suono('sblocco');
    this.cameras.main.fadeOut(360);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ProfiloScene'));
  }

  /** Crea uno sprite immagine ridimensionato all'altezza voluta; se la texture
   *  non c'è, ripiega su un cerchio colorato (niente schermo vuoto). */
  _attore(key, x, y, target, colore, raggio) {
    if (key && this.textures.exists(key)) {
      const img = this.add.image(x, y, key);
      if (img.height) img.setScale(target / img.height);
      return img;
    }
    return this.add.circle(x, y, raggio, colore).setStrokeStyle(3, 0x3a2c22);
  }

  _stella(g, cx, cy, r, fill, stroke) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    g.fillStyle(fill, 1); g.lineStyle(4, stroke, 1);
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillPath(); g.strokePath();
  }
}
