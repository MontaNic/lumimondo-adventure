/* DiarioScene — Diario delle Medaglie (#41).
 *
 * Una pagina che ricorda, per ogni capopalestra superato, la MEDAGLIA vinta e la
 * sua MORALE (la lezione del livello). Le medaglie non ancora vinte appaiono
 * "da conquistare". Pensata per rivivere il senso del viaggio, non solo i numeri.
 */

import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';

// Medaglie in ordine di viaggio: icona, nome, e la MORALE del capopalestra.
const MEDAGLIE = [
  { id: 'onda',      nome: 'Medaglia Onda',      icona: '🌊', colore: 0x34a0d8, morale: 'Chiedere aiuto non è una debolezza.' },
  { id: 'radice',    nome: 'Medaglia Radice',    icona: '🌱', colore: 0x4caf50, morale: 'Prendersi cura degli altri rende forti.' },
  { id: 'scintilla', nome: 'Medaglia Scintilla', icona: '⚡', colore: 0xffd23f, morale: 'Collaborare porta più lontano.' },
  { id: 'granito',   nome: 'Medaglia Granito',   icona: '🪨', colore: 0x9b8579, morale: 'Il valore non dipende dalle vittorie.' },
  { id: 'maestro',   nome: 'Sei un Maestro',     icona: '🏆', colore: 0xffd23f, morale: 'Gentile e coraggioso: un vero Maestro.' },
];

export class DiarioScene extends Phaser.Scene {
  constructor() { super('DiarioScene'); }
  init(data) { this.ritorno = (data && data.ritorno) || 'MappaMondoScene'; this.dormiente = !!(data && data.dormiente); }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#2a1d3a');
    this.cameras.main.fadeIn(220);
    Juice.particelleAmbiente(this, { n: 8, colore: 0xffe98a, depth: 1 });

    this.add.text(W / 2, 34, '🏅 Diario delle Medaglie', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5);

    const mie = (window.GS && window.GS.medaglie) || [];
    const vinte = MEDAGLIE.filter((m) => mie.includes(m.id)).length;
    this.add.text(W / 2, 64, `${vinte} / ${MEDAGLIE.length} conquistate`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#bfa9e0', fontStyle: 'bold',
    }).setOrigin(0.5);

    const top = 92, rowH = Math.min(86, (H - top - 90) / MEDAGLIE.length);
    MEDAGLIE.forEach((m, i) => this._riga(m, mie.includes(m.id), W / 2, top + i * rowH + rowH / 2, W - 40, rowH - 10));

    // Pulsante Esci.
    const bw = 150, bh = 54;
    const bg = this.add.rectangle(W / 2, H - 40, bw, bh, 0x8a5a2e).setStrokeStyle(3, 0x4a2c14).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 40, '‹ Indietro', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._torna());
  }

  _riga(m, vinta, cx, cy, w, h) {
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(vinta ? 0x3a2c52 : 0x241a32, 0.95); g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(3, vinta ? m.colore : 0x4a3a5c, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add(g);
    // Disco medaglia con icona (grigio se non vinta).
    const disco = this.add.circle(-w / 2 + 34, 0, 22, vinta ? m.colore : 0x55505f).setStrokeStyle(3, 0xfff6e3);
    const ico = this.add.text(-w / 2 + 34, 0, vinta ? m.icona : '🔒', { fontSize: '20px' }).setOrigin(0.5);
    c.add([disco, ico]);
    // Offset relativi all'altezza riga: con righe BASSE (telefono orizzontale, 5
    // medaglie in poco spazio) nome e morale restano separati, senza sovrapporsi.
    c.add(this.add.text(-w / 2 + 66, -h / 2 + 9, vinta ? m.nome : '???', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: vinta ? '#ffd23f' : '#9a90ad', fontStyle: 'bold',
    }).setOrigin(0, 0));
    c.add(this.add.text(-w / 2 + 66, -h / 2 + 30, vinta ? m.morale : 'Una lezione tutta da scoprire…', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: vinta ? '#e8def7' : '#7a708d', fontStyle: vinta ? 'italic' : 'normal',
      wordWrap: { width: w - 80 },
    }).setOrigin(0, 0));
    if (vinta) this.tweens.add({ targets: disco, scale: 1.08, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.inOut' });
  }

  _torna() {
    audio.suono && audio.suono('tocco'); voce.stop();
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
      else this.scene.start(this.ritorno);
    });
  }
}
