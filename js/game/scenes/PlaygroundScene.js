/* PlaygroundScene — banco di prova del MOVIMENTO (checkpoint P1-02).
 *
 * Mondo erboso ampio con qualche ostacolo solido per provare collisioni e
 * scivolamento, Pietro al centro, camera che segue con lerp morbido,
 * tap-to-move + joystick + WASD, e onboarding controlli al primo avvio.
 *
 * Aprire da demo.html ("Movimento") o direttamente: index.html?demo=playground
 */

import { Pietro } from '../pietro.js';
import { ControlloMovimento } from '../controllo.js';
import voce from '../../voce.js';

const MONDO_W = 1600;
const MONDO_H = 1600;

export class PlaygroundScene extends Phaser.Scene {
  constructor() { super('PlaygroundScene'); }

  create() {
    this.physics.world.setBounds(0, 0, MONDO_W, MONDO_H);

    // Terreno erboso tileato.
    this.add.tileSprite(0, 0, MONDO_W, MONDO_H, 'erba').setOrigin(0).setDepth(-1000);

    // Un sentiero beige che attraversa, per dare riferimento al movimento.
    this.add.tileSprite(MONDO_W / 2, 0, 96, MONDO_H, 'strada').setOrigin(0.5, 0).setDepth(-999);

    // Ostacoli solidi (statici): casse/rocce per testare collisione e slide.
    this.solidi = this.physics.add.staticGroup();
    const blocchi = [
      [500, 500, 90, 90, 0x9b8579], [900, 700, 120, 70, 0x8a6f5a],
      [700, 1000, 70, 140, 0x7d6a5e], [1100, 420, 80, 80, 0x9b8579],
      [400, 900, 110, 60, 0x8a6f5a], [1000, 1150, 100, 100, 0x7d6a5e],
    ];
    for (const [x, y, w, h, c] of blocchi) {
      const r = this.add.rectangle(x, y, w, h, c).setStrokeStyle(4, 0x3a2c22).setDepth(y);
      this.physics.add.existing(r, true);
      this.solidi.add(r);
    }
    // "Erba alta" decorativa che ondeggia (anticipa le zone selvatiche).
    for (const [x, y] of [[300, 300], [340, 320], [1250, 1250], [1290, 1230]]) {
      const e = this.add.rectangle(x, y, 26, 30, 0x4f9a3a, 1).setDepth(y);
      this.tweens.add({ targets: e, angle: 6, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    }

    // Pietro.
    this.pietro = new Pietro(this, MONDO_W / 2, MONDO_H / 2, window.GS?.profilo);
    this.physics.add.collider(this.pietro, this.solidi);

    // Camera: segue con lerp morbido, bounds del mondo.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MONDO_W, MONDO_H);
    cam.startFollow(this.pietro, true, 0.1, 0.1);
    cam.fadeIn(250);

    // Controllo movimento.
    this.controllo = new ControlloMovimento(this, this.pietro);

    this._hud();
    this._maybeOnboarding();
    this._passiFatti = 0;
    this._ultimaPos = { x: this.pietro.x, y: this.pietro.y };
  }

  _hud() {
    const { width } = this.scale.gameSize;
    this.add.text(width / 2, 16, 'Trascina o tocca un punto: Pietro ci cammina', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffffff',
      backgroundColor: '#00000066', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9000);

    // Pulsante Indietro (torna al menu) — mai bloccare il bambino in una scena.
    const b = this.add.rectangle(54, 40, 92, 48, 0x000000, 0.45)
      .setScrollFactor(0).setDepth(9000).setInteractive({ useHandCursor: true });
    this.add.text(54, 40, '‹ Menu', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9001);
    b.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      voce.stop();
      this.scene.start('MenuScene');
    });
  }

  _maybeOnboarding() {
    if (window.GS?.onboardingFatto) return;
    const { width, height } = this.scale.gameSize;

    // Mano fantasma che fa il gesto swipe, ripetuto 2 volte.
    const mano = this.add.text(width / 2 - 60, height * 0.7, '👆', { fontSize: '46px' })
      .setScrollFactor(0).setDepth(9500).setAlpha(0.9);
    this.tweens.add({
      targets: mano, x: width / 2 + 60, yoyo: true, repeat: 1, duration: 900,
      ease: 'Sine.inOut',
      onComplete: () => this.tweens.add({ targets: mano, alpha: 0, duration: 400, onComplete: () => mano.destroy() }),
    });
    voce.parla('onboarding:movimento');
  }

  update(time, delta) {
    if (!this.controllo) return;
    this.controllo.aggiorna(delta);

    // Festeggia i primi passi durante l'onboarding.
    if (!window.GS?.onboardingFatto) {
      const d = Math.hypot(this.pietro.x - this._ultimaPos.x, this.pietro.y - this._ultimaPos.y);
      this._passiFatti += d;
      this._ultimaPos = { x: this.pietro.x, y: this.pietro.y };
      if (this._passiFatti > 90) {
        window.GS.onboardingFatto = true;
        this._festeggia();
      }
    }
  }

  _festeggia() {
    voce.parla('pepole:bravissimo');
    const s = this.add.text(this.pietro.x, this.pietro.y - 56, '⭐ Bravo!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#ffd23f',
      fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({ targets: s, y: s.y - 40, alpha: 0, duration: 1200, onComplete: () => s.destroy() });
  }
}
