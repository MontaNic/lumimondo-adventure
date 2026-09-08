/* GaraScene — F3 "Gara di Stile" v2: "A TEMPO" (PIANO_V2 §7). Una competizione SENZA lotta,
 * ora a RITMO: scegli una mossa, poi un cursore scorre su una barra e devi toccare quando è
 * nella ZONA bersaglio — più sei al centro, più fai scena ("Perfetto!"), e azzeccare di fila
 * costruisce una COMBO. Il punteggio-stile decide, ma non c'è MAI un perdente: tutti un
 * applauso, il migliore una coccarda. Regole in motore/gare.js (puro). Layout ADATTIVO
 * all'altezza (telefono landscape ~390 ↔ iPad 820). Voce: NARRATORE. */

import { LUMINI } from '../../lumini-data.js';
import { Lumino } from '../lumino.js';
import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import { salvaGS } from '../../gs.js';
import { valutaMossa, qualitaTempo, puntiEsibizione, prossimaCombo, esitoRitmo } from '../../motore/gare.js';
import { getGara, getCriterio, GIUDICI } from '../../gare-data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const QUALITA = {
  perfetto: { testo: 'PERFETTO!', colore: '#ffd23f' },
  bene: { testo: 'Bene!', colore: '#8ee06a' },
  quasi: { testo: 'Quasi!', colore: '#ffb570' },
};

export class GaraScene extends Phaser.Scene {
  constructor() { super('GaraScene'); }
  init(data) {
    data = data || {};
    this.ritorno = data.ritorno || 'MappaMondoScene';
    this.dormiente = !!data.dormiente;
    this.gara = (typeof data.gara === 'string' ? getGara(data.gara) : data.gara) || getGara('gara-prati');
    this.criterio = getCriterio(this.gara.criterio) || { nome: 'Stile', emoji: '✨', favorisce: 'varieta', frase: 'Fai la tua esibizione!' };
    this._turno = 0; this._punteggio = 0; this._combo = 0; this._storia = []; this._occupato = false; this._finita = false; this._timing = false;
  }

  _torna() {
    voce.stop();
    this.cameras.main.fadeOut(220);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
      else this.scene.start(this.ritorno);
    });
  }

  // Blocco Lumino+score+combo CENTRATO come gruppo tra la giuria e la barra del tempo:
  // resta unito e adatta la scala del Lumino (grande su iPad, piccolo su telefono landscape).
  _calcolaLayout() {
    const H = this.H, short = H < 520;
    const btnH = clamp(Math.round(H * 0.14), 44, 54);
    const exitY = H - 22;
    const btnY = (exitY - 17) - 8 - btnH / 2;
    const barY = (btnY - btnH / 2) - 30;                 // barra del tempo / riga istruzioni
    const juryY = short ? 76 : 88;
    const top = juryY + 22, bot = barY - 24;
    const groupCy = (top + bot) / 2;
    const ls = clamp(((bot - top) - 90) / 150, 0.58, 1.35);
    const lumCy = groupCy - ls * 26;                     // Lumino un po' più su → sotto ci stanno score+combo
    this.LY = { short, btnH, exitY, btnY, barY, juryY, lumCy, lumScale: ls, scoreY: lumCy + ls * 50 + 10, comboY: lumCy + ls * 50 + 28 };
  }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#3a2350');
    this.cameras.main.fadeIn(240);
    Juice.particelleAmbiente(this, { n: 12, colore: 0xffe98a, depth: 1 });
    this._calcolaLayout();

    this.add.text(W / 2, 22, '🎪 ' + this.gara.nome, {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(W / 2, 46, `${this.criterio.emoji} ${this.criterio.frase}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd7ec', fontStyle: 'bold', align: 'center', wordWrap: { width: W - 40 },
    }).setOrigin(0.5);

    // Giuria (3 giudici buffi in alto).
    this._giudici = [];
    const gx0 = W / 2 - 70;
    GIUDICI.slice(0, 3).forEach((g, i) => this._giudici.push(this.add.text(gx0 + i * 70, this.LY.juryY, g.emoji, { fontSize: this.LY.short ? '28px' : '32px' }).setOrigin(0.5)));

    const team = (window.GS && window.GS.team) || [];
    if (!team.length) {
      this.add.text(W / 2, H / 2, 'Serve un Lumino in squadra per gareggiare! 🐾', {
        fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', align: 'center',
      }).setOrigin(0.5);
      this._bottoneEsci(); return;
    }
    this._specie = team[0].specie;
    this._base = LUMINI[this._specie] || {};
    this.lum = new Lumino(this, W / 2, this.LY.lumCy, this._specie).setScale(this.LY.lumScale);
    this.tweens.add({ targets: this.lum, y: this.LY.lumCy - 6, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' });

    this._scoreTxt = this.add.text(W / 2, this.LY.scoreY, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5);
    this._comboTxt = this.add.text(W / 2, this.LY.comboY, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ff9ed8', fontStyle: 'bold' }).setOrigin(0.5);
    this._aggiornaScore();

    this._istruzioni = this.add.text(W / 2, this.LY.barY, 'Scegli una mossa 👇', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ffd7ec', fontStyle: 'bold' }).setOrigin(0.5);
    this._costruisciBarra();
    this._mosseBtn();
    this._bottoneEsci();
    voce.parla('gara:via');
  }

  _aggiornaScore() {
    this._scoreTxt.setText(`Turno ${Math.min(this._turno + 1, this.gara.turni)}/${this.gara.turni}   ·   Stile: ${this._punteggio} ✨`);
    this._comboTxt.setText(this._combo >= 2 ? `🔥 Combo ×${this._combo}` : '');
  }

  // --- Barra del tempo: traccia + zona bersaglio (bene/perfetto) + cursore che scorre ---
  _costruisciBarra() {
    const W = this.W, y = this.LY.barY;
    const tw = Math.min(360, W - 60);
    this._barX = W / 2 - tw / 2; this._barW = tw; this._barCx = W / 2;
    this._barra = this.add.container(0, 0).setVisible(false);
    const half = tw / 2;
    this._barra.add(this.add.rectangle(W / 2, y, tw, 20, 0x000000, 0.5).setStrokeStyle(2, 0x7a6a9a));
    this._barra.add(this.add.rectangle(W / 2, y, half * 0.5 * 2, 18, 0x8ee06a, 0.5));
    this._barra.add(this.add.rectangle(W / 2, y, half * 0.18 * 2, 18, 0xffd23f, 0.85));
    this._cursore = this.add.triangle(this._barX, y - 18, 0, -9, -7, 5, 7, 5, 0xffffff).setStrokeStyle(1, 0x3a2c22);
    this._barra.add(this._cursore);
    this._barra.add(this.add.text(W / 2, y - 30, 'TOCCA quando è al centro! 🎯', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
  }

  _mosseBtn() {
    const W = this.W, LY = this.LY;
    const mosse = (this._base.mosse || []).slice(0, 5);
    if (!mosse.length) { this._bottoneEsci(); return; }
    const n = mosse.length;
    const bw = Math.min(120, (W - 24) / n - 8), bh = LY.btnH, gap = 8;
    const x0 = W / 2 - (n * (bw + gap) - gap) / 2 + bw / 2;
    this._btnBox = this.add.container(0, 0);
    mosse.forEach((m, i) => {
      const x = x0 + i * (bw + gap);
      const c = m.tipo === 'signature' ? 0xb8860b : m.tipo === 'speciale' ? 0x6a4cc4 : 0x3a6ea5;
      const bg = this.add.rectangle(x, LY.btnY, bw, bh, c).setStrokeStyle(3, 0x00000055).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, LY.btnY, m.nome, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold', align: 'center', wordWrap: { width: bw - 8 } }).setOrigin(0.5);
      Juice.popBottone(this, bg);
      bg.on('pointerdown', () => this._scegliMossa(m));
      this._btnBox.add([bg, t]);
    });
  }

  // 1) Scegli la mossa → parte la fase a tempo (cursore che scorre).
  _scegliMossa(mossa) {
    if (this._occupato || this._finita || this._timing) return;
    this._occupato = true;
    this._mossaCorrente = mossa;
    if (this._btnBox) this._btnBox.setVisible(false);
    this._istruzioni.setVisible(false);
    this._avviaTempo();
  }

  _avviaTempo() {
    this._timing = true;
    this._barra.setVisible(true);
    this._cursore.x = this._barX;
    const dur = Math.max(560, 900 - this._turno * 90);
    this._twCursore = this.tweens.add({ targets: this._cursore, x: this._barX + this._barW, duration: dur, yoyo: true, repeat: -1, ease: 'Linear' });
    this._tapCatcher = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.001).setInteractive().setDepth(9000);
    this._tapCatcher.once('pointerdown', () => this._fermaTempo());
  }

  // 2) Tocco → misura lo scostamento dal centro, calcola i punti (motore) e mostra l'esito.
  _fermaTempo() {
    if (!this._timing) return;
    this._timing = false;
    if (this._twCursore) this._twCursore.stop();
    if (this._tapCatcher) { this._tapCatcher.destroy(); this._tapCatcher = null; }
    this._barra.setVisible(false);

    const scost = Math.abs(this._cursore.x - this._barCx) / (this._barW / 2);
    const qual = qualitaTempo(scost);
    const base = valutaMossa(this._mossaCorrente, this._storia, this.criterio.favorisce);
    const punti = puntiEsibizione(base, qual, this._combo);
    this._combo = prossimaCombo(this._combo, qual);
    this._storia.push(this._mossaCorrente.nome);
    this._punteggio += punti;
    this._turno++;

    audio.suono(qual === 'perfetto' ? 'mossaSpeciale' : 'stellina');
    try { this.lum.reagisci && this.lum.reagisci(); } catch { /* */ }
    const sc = this.LY.lumScale * (qual === 'perfetto' ? 1.22 : 1.12);
    this.tweens.add({ targets: this.lum, scaleX: sc, scaleY: sc, yoyo: true, duration: 260, ease: 'Back.out' });
    Juice.coriandoli(this, this.lum.x, this.lum.y - 20, 6 + punti);
    const salto = qual === 'perfetto' ? 16 : 8;
    this._giudici.forEach((g, i) => this.tweens.add({ targets: g, y: this.LY.juryY - salto, yoyo: true, delay: i * 80, duration: 220, ease: 'Sine.inOut' }));
    if (this._mossaCorrente.esclamazione) this._bolla(this._mossaCorrente.esclamazione);

    const q = QUALITA[qual];
    const combotxt = this._combo >= 2 ? `  ×${this._combo}🔥` : '';
    const fly = this.add.text(this.W / 2, this.LY.lumCy - 24, `${q.testo} +${punti}✨${combotxt}`, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: q.colore, fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 4 }).setOrigin(0.5).setDepth(9999);
    if (qual === 'perfetto') this.cameras.main.flash(120, 255, 240, 180);
    this.tweens.add({ targets: fly, y: fly.y - 40, alpha: 0, delay: 500, duration: 800, onComplete: () => fly.destroy() });
    this._aggiornaScore();

    this.time.delayedCall(950, () => {
      this._occupato = false;
      if (this._turno >= this.gara.turni) this._finale();
      else { if (this._btnBox) this._btnBox.setVisible(true); this._istruzioni.setText('Scegli la prossima mossa 👇').setVisible(true); }
    });
  }

  _bolla(testo) {
    const b = this.add.text(this.lum.x, this.lum.y - 54, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#3a2c22', fontStyle: 'bold', backgroundColor: '#ffffffdd', padding: { x: 8, y: 4 } }).setOrigin(0.5).setDepth(9998);
    this.tweens.add({ targets: b, y: b.y - 12, alpha: 0, delay: 700, duration: 500, onComplete: () => b.destroy() });
  }

  _finale() {
    this._finita = true;
    if (this._btnBox) this._btnBox.destroy(true);
    if (this._istruzioni) this._istruzioni.setVisible(false);
    const W = this.W, LY = this.LY;
    const e = esitoRitmo(this._punteggio, this.gara.turni);
    audio.suono('vittoria'); audio.suono('stellina');
    Juice.coriandoli(this, W / 2, LY.lumCy, 40);
    this.cameras.main.flash(200, 255, 245, 200);
    this._giudici.forEach((g, i) => this.tweens.add({ targets: g, y: LY.juryY - 14, yoyo: true, repeat: 3, delay: i * 120, duration: 260 }));
    this.add.text(W / 2, LY.barY - 4, e.titolo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5, align: 'center', wordWrap: { width: W - 60 },
    }).setOrigin(0.5);
    if (e.coccarda) this._premio();
    voce.parla(e.coccarda ? 'gara:coccarda' : 'gara:bravo');
    this._bottoneEsci(true);
  }

  /** Premio della gara (cosmetico/collezione, mai punizione): stelline o oggetto. */
  _premio() {
    const p = this.gara.premio; if (!p || !window.GS) return;
    let testo = '';
    if (p.tipo === 'stelline') { window.GS.stelline = (window.GS.stelline || 0) + (p.n || 5); testo = `+${p.n || 5} ⭐`; }
    else if (p.tipo === 'oggetto') { window.GS.inventario = window.GS.inventario || {}; window.GS.inventario[p.id] = (window.GS.inventario[p.id] || 0) + (p.n || 1); testo = `+${p.n || 1} ${p.id}`; }
    salvaGS();
    if (testo) this.add.text(this.W / 2, this.LY.scoreY, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#57c15a', fontStyle: 'bold' }).setOrigin(0.5);
  }

  _bottoneEsci(finale) {
    const W = this.W, LY = this.LY;
    const bg = this.add.rectangle(W / 2, LY.exitY, 168, 40, 0x2c7a33).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, LY.exitY, finale ? 'Fine ✓' : '‹ Esci', { fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._torna());
  }
}
