/* SquadraScene — "La tua squadra": i Lumini catturati, ciascuno nella sua
 * Lumiball. Toccando una sfera, il Lumino esce in un lampo (come una mini
 * evocazione) e mostra nome + stelline. Accessibile dall'HUD della mappa. */

import { LUMINI } from '../../lumini-data.js';
import { Lumino } from '../lumino.js';
import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import { salvaGS } from '../../gs.js';

export class SquadraScene extends Phaser.Scene {
  constructor() { super('SquadraScene'); }
  init(data) { this.ritorno = (data && data.ritorno) || 'MappaMondoScene'; this.dormiente = !!(data && data.dormiente); }

  /** #18 — torna alla scena chiamante risvegliandola se dorme (stato preservato). */
  _torna() {
    voce.stop();
    this.cameras.main.fadeOut(220);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
      else this.scene.start(this.ritorno);
    });
  }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor('#16243f');
    this.cameras.main.fadeIn(240);
    Juice.particelleAmbiente(this, { n: 8, colore: 0xbfe3ff, depth: 1 });

    this.add.text(W / 2, 34, '⚽ La tua squadra', {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5);

    const team = (window.GS && window.GS.team) || [];
    if (!team.length) {
      this.add.text(W / 2, H / 2, 'Ancora nessun amico!\nVai a catturare un Lumino 🐾', {
        fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5);
    } else {
      const cols = Math.min(3, team.length);
      const cellW = Math.min(150, (W - 40) / cols);
      const startX = W / 2 - (cols - 1) * cellW / 2;
      team.forEach((l, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = startX + col * cellW;
        const y = H * 0.32 + row * Math.min(190, H * 0.26);
        this._slot(l, x, y);
      });
      this.add.text(W / 2, H - 132, 'Tocca la Lumiball per salutare · ✏️ per il soprannome', {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#bfe3ff',
      }).setOrigin(0.5);
    }

    // #58 — Rifugio dei Lumini (deposito): pulsante con conteggio.
    const dep = (window.GS && window.GS.deposito) || [];
    const br = this.add.rectangle(W / 2, H - 92, 220, 40, 0x3a6ea5).setStrokeStyle(3, 0x1c3a5c).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 92, `🏠 Rifugio (${dep.length})`, { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, br);
    br.on('pointerdown', () => this._apriRifugio());

    // Pulsante Esci.
    const bw = 150, bh = 50;
    const bg = this.add.rectangle(W / 2, H - 40, bw, bh, 0x2c7a33).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 40, '‹ Indietro', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._torna());
  }

  _slot(l, x, y) {
    const cont = this.add.container(x, y);
    const src = this.textures.get('obj-lumiball').getSourceImage();
    const ball = this.add.image(0, 0, 'obj-lumiball').setScale(74 / (src.height || 74)).setInteractive({ useHandCursor: true });
    // #69 — mostra il SOPRANNOME se presente, altrimenti il nome di specie.
    const nome = this.add.text(0, 62, l.nome || (LUMINI[l.specie] ? LUMINI[l.specie].nome : l.specie), {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 4,
    }).setOrigin(0.5);
    // #69 — matita per rinominare (soprannome affettivo).
    const pen = this.add.text(nome.x + nome.width / 2 + 14, 62, '✏️', { fontSize: '16px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    pen.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this._rinomina(l); });
    cont.add(pen);
    // #58 — manda al Rifugio (se la squadra ha più di 1 Lumino).
    const team = (window.GS && window.GS.team) || [];
    if (team.length > 1) {
      const dep = this.add.text(0, -54, '🏠', { fontSize: '18px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      dep.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this._versoRifugio(l); });
      cont.add(dep);
    }
    // V2 — Affezione (cuori): cresce vincendo le battaglie.
    const aff = (window.GS && window.GS.album && window.GS.album[l.specie] && window.GS.album[l.specie].affezione) || 0;
    const cuori = this.add.text(0, 84, '❤'.repeat(aff) + '♡'.repeat(Math.max(0, 5 - aff)), {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#ff7da6',
    }).setOrigin(0.5);
    cont.add([ball, nome, cuori]);
    this.tweens.add({ targets: ball, y: -6, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });

    let aperto = false;
    ball.on('pointerdown', () => {
      if (aperto) return;
      aperto = true;
      audio.suono('cattura');
      this.cameras.main.flash(160, 255, 255, 255);
      this.tweens.killTweensOf(ball);
      this.tweens.add({ targets: ball, alpha: 0.25, scale: ball.scaleX * 0.8, duration: 200 });
      const lum = new Lumino(this, 0, -8, l.specie).setScale(0.1);
      cont.add(lum);
      this.tweens.add({ targets: lum, scale: 0.62, duration: 420, ease: 'Back.out' });
      Juice.coriandoli(this, x, y - 8, 16);
      lum._t0 = this.time.now;
      this._lumini = this._lumini || [];
      this._lumini.push(lum);
    });
  }

  /** #69 — Soprannome via input DOM sovrapposto (touch-first). Vuoto = nome di specie. */
  _rinomina(l) {
    const vecchio = l.nome || (LUMINI[l.specie] ? LUMINI[l.specie].nome : l.specie);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 12; inp.value = vecchio;
    inp.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:99999;font:20px system-ui;padding:10px 14px;border-radius:12px;border:3px solid #ffd23f;text-align:center;width:60%;max-width:300px';
    document.body.appendChild(inp);
    inp.focus(); inp.select();
    const chiudi = (salva) => {
      if (!inp.parentNode) return;
      if (salva) { const v = inp.value.trim().slice(0, 12); l.nome = v || null; try { salvaGS(); } catch { /* niente */ } }
      inp.remove();
      this.scene.restart({ ritorno: this.ritorno, dormiente: this.dormiente });
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') chiudi(true); if (e.key === 'Escape') chiudi(false); });
    inp.addEventListener('blur', () => chiudi(true));
  }

  /** #58 — Manda un Lumino dalla squadra al Rifugio. */
  _versoRifugio(l) {
    const g = window.GS; if (!g) return;
    g.team = g.team || []; g.deposito = g.deposito || [];
    if (g.team.length <= 1) return;
    const i = g.team.indexOf(l);
    if (i < 0) return;
    g.deposito.push(g.team.splice(i, 1)[0]);
    salvaGS(); audio.suono('tocco');
    this.scene.restart({ ritorno: this.ritorno, dormiente: this.dormiente });
  }

  /** #58 — Rifugio dei Lumini: overlay per richiamare un Lumino in squadra. */
  _apriRifugio() {
    const g = window.GS; if (!g) return;
    const dep = g.deposito || [];
    const { width: W, height: H } = this.scale.gameSize;
    const layer = this.add.container(0, 0).setDepth(300);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0a1424, 0.86).setInteractive());
    layer.add(this.add.text(W / 2, H * 0.16, '🏠 Rifugio dei Lumini', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
    if (!dep.length) {
      layer.add(this.add.text(W / 2, H / 2, 'Il Rifugio è vuoto.\nQui riposano i Lumini oltre i 6 in squadra.', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    } else {
      layer.add(this.add.text(W / 2, H * 0.24, (g.team || []).length >= 6 ? 'Squadra piena: tocca per scambiare con un amico.' : 'Tocca per portarlo in squadra.', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#bfe3ff' }).setOrigin(0.5));
      dep.forEach((l, i) => {
        const cols = 3, cw = Math.min(120, (W - 40) / cols);
        const x = W / 2 + ((i % cols) - 1) * cw, y = H * 0.36 + Math.floor(i / cols) * 120;
        const lum = new Lumino(this, x, y, l.specie).setScale(0.5);
        layer.add(lum);
        layer.add(this.add.text(x, y + 44, l.nome || (LUMINI[l.specie] ? LUMINI[l.specie].nome : l.specie), { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
        const hit = this.add.rectangle(x, y, cw - 8, 110, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this._richiama(i));
        layer.add(hit);
      });
    }
    const chiudi = this.add.text(W - 30, 30, '✕', { fontFamily: 'system-ui', fontSize: '26px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    chiudi.on('pointerdown', () => layer.destroy());
    layer.add(chiudi);
    this._rifugio = layer;
  }

  _richiama(idx) {
    const g = window.GS; if (!g) return;
    g.team = g.team || []; g.deposito = g.deposito || [];
    const l = g.deposito[idx]; if (!l) return;
    if (g.team.length < 6) { g.team.push(l); g.deposito.splice(idx, 1); }
    else { const out = g.team.pop(); g.team.push(l); g.deposito.splice(idx, 1); g.deposito.push(out); }  // scambio con l'ultimo
    salvaGS(); audio.suono('stellina');
    this.scene.restart({ ritorno: this.ritorno, dormiente: this.dormiente });
  }

  update(time) {
    if (this._lumini) for (const l of this._lumini) l.idle(time);
  }
}
