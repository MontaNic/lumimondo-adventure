/* MenuScene — schermata iniziale con il pulsante Gioca. Da qui alla mappa. */

import { GAME_VERSION } from '../../version.js';
import musica from '../../musica.js';
import audio from '../../audio.js';
import { salvaGS } from '../../gs.js';
import * as Juice from '../juice.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor('#ff8c28');

    // Atmosfera: scintille dorate che fluttuano sullo sfondo caldo + respiro camera.
    Juice.particelleAmbiente(this, { n: 12, colore: 0xfff0b8, depth: 0 });
    this.cameras.main.setZoom(1.04);
    this.tweens.add({ targets: this.cameras.main, zoom: 1, yoyo: true, repeat: -1, duration: 4200, ease: 'Sine.inOut' });

    // Stella logo (in un container così la posso animare: rotazione lenta + bob).
    const logo = this.add.container(width / 2, height * 0.32);
    const g = this.add.graphics();
    this._stella(g, 0, 0, 46, 0xffd23f, 0x8a4b1e);
    logo.add(g);
    this.tweens.add({ targets: logo, angle: 8, yoyo: true, repeat: -1, duration: 2600, ease: 'Sine.inOut' });
    this.tweens.add({ targets: logo, y: logo.y - 10, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.inOut' });
    Juice.entrata(this, logo, { da: 0.2, dur: 600 });

    const t1 = this.add.text(width / 2, height * 0.46, 'Lumimondo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '46px', color: '#ffffff',
      fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 7,
    }).setOrigin(0.5);
    const t2 = this.add.text(width / 2, height * 0.53, 'Adventure', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff3d6',
      fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 4,
    }).setOrigin(0.5);
    Juice.entrata(this, t1, { da: 0.6, dur: 420, delay: 150 });
    Juice.entrata(this, t2, { da: 0.6, dur: 420, delay: 260 });

    // Pulsante Gioca (≥60px alto, touch-friendly).
    const bw = Math.min(260, width * 0.7), bh = 70;
    const bg = this.add.rectangle(width / 2, height * 0.68, bw, bh, 0x2c7a33)
      .setStrokeStyle(4, 0x16451c).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height * 0.68, 'Gioca!  ▶', {
      fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({ targets: bg, scaleX: 1.04, scaleY: 1.04, yoyo: true, repeat: -1, duration: 700 });
    Juice.entrata(this, bg, { da: 0.5, dur: 480, delay: 360 });
    bg.on('pointerdown', () => {
      bg.disableInteractive();
      this.tweens.killTweensOf(bg);
      audio.suono('sblocco');
      this.tweens.add({ targets: bg, scaleX: 1.18, scaleY: 1.18, duration: 140, yoyo: true, ease: 'Quad.out' });
      Juice.coriandoli(this, bg.x, bg.y, 22);
      this.cameras.main.fadeOut(320);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MappaMondoScene'));
    });

    this.add.text(width - 8, height - 6, 'v' + GAME_VERSION, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
    }).setOrigin(1, 1).setAlpha(0.7);

    // #65 — Badge "Campione" + entrata 2 giocatori, sbloccati a gioco finito.
    const fatto = !!(window.GS && window.GS.progressiStoria && window.GS.progressiStoria['luminia:fatta']) || !!(window.GS && window.GS.campione);
    if (fatto) {
      this.add.text(width / 2, height * 0.60, '🌟 Modalità Campione attiva! 🌟', {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#fff3d6', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 3,
      }).setOrigin(0.5);
    }
    // #66 — 2 Giocatori (stesso iPad): sempre disponibile per i fratelli.
    const due = this.add.text(width / 2, height * 0.86, '👥 2 Giocatori', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#3a6ea5cc', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    due.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      this.cameras.main.fadeOut(220);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BattagliaScene', {
        alleato: 'fiammino', avversario: 'guscetto', duePlayer: true, selvatico: false,
        idSfida: 'due-giocatori', ritorno: 'MenuScene',
      }));
    });

    // #75 — Tutorial richiamabile: "Come si gioca".
    const help = this.add.text(width / 2, height * 0.79, '❓ Come si gioca', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#00000044', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    help.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      this.cameras.main.fadeOut(200);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TutorialScene', { ritorno: 'MenuScene' }));
    });

    // Toggle musica (separato dalla voce), persistito in GameState.
    const musOn = () => (window.GS?.impostazioni?.musica !== false);
    const tBtn = this.add.text(14, height - 16, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#00000044', padding: { x: 10, y: 6 },
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true });
    const refresh = () => tBtn.setText(musOn() ? '🎵 Musica' : '🔇 Musica');
    refresh();
    tBtn.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      if (window.GS) {
        window.GS.impostazioni = window.GS.impostazioni || {};
        window.GS.impostazioni.musica = !musOn();
        try { salvaGS(); } catch {}
      }
      musica.aggiorna();
      refresh();
    });
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
