/* NegozioScene — il Mercatino di Lumimondo (#36).
 *
 * Si spendono le STELLINE (fin qui solo accumulate) per oggetti utili in battaglia
 * (#39): Lumiball per catturare, Caramella-stella che ridà energia, Trifoglio
 * portafortuna per la cattura. Niente prezzi "cattivi": numeri piccoli, tutto
 * chiaro e illustrato. Anti-frustrazione: se mancano stelline, lo dice gentile.
 */

import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import { salvaGS } from '../../gs.js';

export const CATALOGO = [
  { id: 'lumiball',  nome: 'Lumiball',         icona: '⚪', costo: 5,  desc: 'Per catturare i Lumini selvatici.' },
  { id: 'caramella', nome: 'Caramella-stella', icona: '🍬', costo: 8,  desc: 'Ridà 2 stelline d’energia in battaglia.' },
  { id: 'trifoglio', nome: 'Trifoglio',        icona: '🍀', costo: 12, desc: 'Più fortuna nella prossima cattura!' },
];

export class NegozioScene extends Phaser.Scene {
  constructor() { super('NegozioScene'); }
  init(data) { this.ritorno = (data && data.ritorno) || 'MappaMondoScene'; this.dormiente = !!(data && data.dormiente); }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#3a2b1a');
    this.cameras.main.fadeIn(220);
    Juice.particelleAmbiente(this, { n: 7, colore: 0xffe98a, depth: 1 });

    // Schermo basso (telefono in orizzontale): intestazione e righe più compatte,
    // altrimenti la descrizione usciva dal riquadro e il prezzo ne copriva il bordo.
    const corto = H < 520;
    this._corto = corto;
    this.add.text(W / 2, corto ? 22 : 32, '🛒 Mercatino', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5);
    this.txtSaldo = this.add.text(W / 2, corto ? 48 : 64, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffd23f', fontStyle: 'bold',
    }).setOrigin(0.5);
    this._aggiornaSaldo();

    const top = corto ? 70 : 100, basso = corto ? 62 : 90;
    const rowH = Math.min(118, (H - top - basso) / CATALOGO.length);
    CATALOGO.forEach((it, i) => this._riga(it, W / 2, top + i * rowH + rowH / 2, W - 40, rowH - 12));

    const bw = 150, bh = corto ? 44 : 54, by = corto ? H - 30 : H - 40;
    const bg = this.add.rectangle(W / 2, by, bw, bh, 0x8a5a2e).setStrokeStyle(3, 0x4a2c14).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, by, '‹ Esci', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._torna());
  }

  _saldo() { return (window.GS && window.GS.stelline) || 0; }
  _scorta(id) { return (window.GS && window.GS.inventario && window.GS.inventario[id]) || 0; }
  _aggiornaSaldo() { this.txtSaldo.setText('⭐ ' + this._saldo() + ' stelline'); }

  _riga(it, cx, cy, w, h) {
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(0x4a3826, 0.96); g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(3, 0xc79a4e, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    c.add(g);
    const basso = h < 80;   // riga bassa: testi più vicini, icona e pulsante più piccoli
    c.add(this.add.text(-w / 2 + 36, 0, it.icona, { fontSize: Math.round(Math.min(40, h * 0.62)) + 'px' }).setOrigin(0.5));
    c.add(this.add.text(-w / 2 + 70, -h / 2 + (basso ? 6 : 12), it.nome, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0, 0));
    c.add(this.add.text(-w / 2 + 70, -h / 2 + (basso ? 30 : 38), it.desc, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#f0e6d2', wordWrap: { width: w - 200 } }).setOrigin(0, 0));
    // "Ne hai" sulla RIGA DEL NOME, allineato a destra (prima del prezzo): così la
    // riga resta a 2 righe (nome+descrizione) e nelle righe basse (telefono in
    // orizzontale) non c'è sovrapposizione verticale.
    const scortaTxt = this.add.text(w / 2 - 120, -h / 2 + (basso ? 7 : 13), 'Ne hai: ' + this._scorta(it.id), { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#bfe3ff', fontStyle: 'bold' }).setOrigin(1, 0);
    c.add(scortaTxt);
    // Pulsante compra (prezzo).
    const bw = 96, bh = Math.min(50, h - 12), bx = w / 2 - bw / 2 - 10;
    const bg = this.add.rectangle(bx, 0, bw, bh, 0x2c7a33).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true });
    const bt = this.add.text(bx, 0, '⭐' + it.costo, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    c.add([bg, bt]);
    bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this._compra(it, scortaTxt, c); });
  }

  _compra(it, scortaTxt, riga) {
    if (this._saldo() < it.costo) {
      audio.suono('colpito');
      this.cameras.main.shake(160, 0.004);
      this._toast('Ti servono più stelline! ⭐');
      return;
    }
    window.GS.stelline -= it.costo;
    window.GS.inventario = window.GS.inventario || {};
    window.GS.inventario[it.id] = (window.GS.inventario[it.id] || 0) + 1;
    salvaGS();
    audio.suono('stellina'); audio.suono('vittoria');
    this._aggiornaSaldo();
    scortaTxt.setText('Ne hai: ' + this._scorta(it.id));
    this.tweens.add({ targets: riga, scaleX: 1.03, scaleY: 1.03, duration: 90, yoyo: true });
    Juice.premioStella(this, this.W / 2, 64);
    this._toast(it.nome + ' comprato! ' + it.icona);
  }

  _toast(msg) {
    const t = this.add.text(this.W / 2, this.H - 100, msg, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(99).setScale(0.7);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 16, delay: 900, duration: 400, onComplete: () => t.destroy() });
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
