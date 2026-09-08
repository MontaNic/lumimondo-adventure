/* TutorialScene — "Come si gioca" richiamabile (#75).
 *
 * Poche pagine illustrate (movimento, cattura, battaglia, amici) per ricordare le
 * basi. Niente testi lunghi: icona grande + una frase. Richiamabile dal Menu.
 */

import * as Juice from '../juice.js';
import audio from '../../audio.js';

const PAGINE = [
  { ico: '🕹️', titolo: 'Muoviti', testo: 'Tocca dove vuoi andare, oppure usa il joystick. Pietro cammina lì!' },
  { ico: '🌿', titolo: 'Erba alta', testo: 'Nell\'erba alta puoi incontrare i Lumini selvatici. Sorpresa!' },
  { ico: '⚪', titolo: 'Cattura', testo: 'In battaglia tocca la Lumiball: più l\'amico è stanco, più è facile!' },
  { ico: '⚔️', titolo: 'Battaglia', testo: 'Scegli una mossa. Le mosse SUPER (verdi) fanno più effetto!' },
  { ico: '🐶', titolo: 'Pepole', testo: 'Chiama Pepole in soccorso: aiuta senza usare il tuo turno!' },
  { ico: '🛒', titolo: 'Stelline', testo: 'Le stelline si spendono al Mercatino per Lumiball e oggetti.' },
];

export class TutorialScene extends Phaser.Scene {
  constructor() { super('TutorialScene'); }
  init(data) { this.ritorno = (data && data.ritorno) || 'MenuScene'; this.dormiente = !!(data && data.dormiente); this.i = 0; }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#1d2b4a');
    this.cameras.main.fadeIn(200);
    Juice.particelleAmbiente(this, { n: 7, colore: 0xbfe3ff, depth: 1 });

    this.add.text(W / 2, 40, '❓ Come si gioca', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5);
    this.cont = this.add.container(0, 0);

    this._freccia(40, H / 2, '‹', () => this._vai(-1));
    this._freccia(W - 40, H / 2, '›', () => this._vai(1));
    this.dots = this.add.text(W / 2, H - 96, '', { fontFamily: 'system-ui', fontSize: '15px', color: '#bfe3ff' }).setOrigin(0.5);

    const bg = this.add.rectangle(W / 2, H - 48, 160, 52, 0x2c7a33).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 48, '‹ Chiudi', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._chiudi());

    this._render();
  }

  _freccia(x, y, ch, cb) {
    const c = this.add.circle(x, y, 26, 0x3a6ea5, 0.9).setInteractive({ useHandCursor: true });
    this.add.text(x, y - 2, ch, { fontFamily: 'system-ui', fontSize: '34px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, c);
    c.on('pointerdown', cb);
  }

  _vai(d) { const n = Phaser.Math.Clamp(this.i + d, 0, PAGINE.length - 1); if (n !== this.i) { this.i = n; audio.suono && audio.suono('tocco'); this._render(); } }

  _render() {
    this.cont.removeAll(true);
    const p = PAGINE[this.i];
    this.cont.add(this.add.text(this.W / 2, this.H * 0.34, p.ico, { fontSize: '92px' }).setOrigin(0.5));
    this.cont.add(this.add.text(this.W / 2, this.H * 0.52, p.titolo, { fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
    this.cont.add(this.add.text(this.W / 2, this.H * 0.62, p.testo, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', align: 'center', wordWrap: { width: this.W - 80 }, lineSpacing: 5 }).setOrigin(0.5, 0));
    this.dots.setText(`${this.i + 1} / ${PAGINE.length}`);
  }

  _chiudi() {
    audio.suono && audio.suono('tocco');
    this.cameras.main.fadeOut(180);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
      else this.scene.start(this.ritorno);
    });
  }
}
