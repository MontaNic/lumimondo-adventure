/* CoccoleScene — F1 "Cura & Legame" v2: "CAPISCI L'EMOZIONE" (PIANO_V2 §5). Il Lumino
 * PROVA qualcosa (è triste, ha fame, è giocoso, ha sonno) e lo mostra con una faccia
 * grande: il bimbo deve LEGGERE lo stato d'animo e rispondere col gesto giusto (coccola/
 * pappa/gioca/ninna). Azzeccare fa crescere il LEGAME (affezione 0-5, la stessa della
 * battaglia); sbagliare non punisce mai — solo un indizio e si riprova. È educazione
 * emotiva, non un tocca-e-sale. Regole in motore/cura.js (puro); qui solo la vista.
 * Layout ADATTIVO all'altezza (telefono landscape ~390 ↔ iPad 820). Voce: NARRATORE. */

import { LUMINI } from '../../lumini-data.js';
import { Lumino } from '../lumino.js';
import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import { salvaGS } from '../../gs.js';
import { applicaCura, valutaLettura, progressoLegame, livelloLegame, sazietaOra, eSazio, MAX_AFFEZIONE, SAZIETA_MAX } from '../../motore/cura.js';
import { EMOZIONI, AZIONI_CURA, FRASI } from '../../cura-data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CoccoleScene extends Phaser.Scene {
  constructor() { super('CoccoleScene'); }
  init(data) {
    this.ritorno = (data && data.ritorno) || 'MappaMondoScene';
    this.dormiente = !!(data && data.dormiente);
    this.sel = 0;
    this._occupato = false;
    this._tentativi = 0;
  }

  _torna() {
    voce.stop();
    this.cameras.main.fadeOut(220);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
      else this.scene.start(this.ritorno);
    });
  }

  // Layout calcolato dall'altezza: controlli in alto, bottoni ancorati in basso, Lumino
  // e legame nel mezzo con scala adattiva → niente sovrapposizioni né su 390 né su 820.
  // Blocco emozione+Lumino+legame CENTRATO come gruppo tra selettore e bottoni: resta unito
  // e adatta la scala del Lumino → su iPad è grande, su telefono si rimpicciolisce senza rompere.
  _calcolaLayout() {
    const H = this.H, short = H < 520;
    const btnH = clamp(Math.round(H * 0.15), 44, 58);
    const exitY = H - 22;
    const btnY = (exitY - 17) - 8 - btnH / 2;
    const selY = short ? 64 : 74;
    const top = selY + 21, bot = (btnY - btnH / 2) - 8;
    // Ingombro REALE del Lumino PNG (origine 0.62 su ~150px): ~96px sopra il centro e
    // ~60px sotto, per scala 1. Prima il calcolo usava ±52 (misura del vecchio disegno
    // procedurale) → il Lumino copriva il fumetto "come si sente" e il nome i suoi piedi.
    const SOPRA = 96, SOTTO = 60, TESTA = short ? 60 : 88, CODA = 62;   // TESTA = faccia+fumetto, CODA = nome..legame
    const avail = bot - top;
    const ls = clamp((avail - TESTA - CODA - 12) / (SOPRA + SOTTO), 0.45, 1.45);
    const totale = TESTA + (SOPRA + SOTTO) * ls + CODA;
    const y0 = top + Math.max(0, (avail - totale) / 2);
    const lumCy = y0 + TESTA + SOPRA * ls;
    const sotto = lumCy + SOTTO * ls;
    const W = this.W;
    this.LY = {
      short, btnH, exitY, btnY, selY, lumCy, lumScale: ls,
      facciaY: y0 + (short ? 20 : 26), hintY: y0 + (short ? 48 : 70),
      nameY: sotto + 10, heartsY: sotto + 30,
      barY: sotto + 47, sazY: sotto + 60,
      xFaccia: W / 2, xInfo: W / 2, hintW: W - 60,
    };
    // Telefono in ORIZZONTALE: in colonna non ci sta (la riga "Legame" finiva sotto
    // i pulsanti). Disposizione a 3 colonne: fumetto a sinistra, Lumino al centro,
    // nome/cuori/legame a destra → il Lumino può anche essere più grande.
    if (short && W >= 560) {
      const lsL = clamp((avail - 8) / (SOPRA + SOTTO), 0.45, 1.1);
      const cy = top + (avail - (SOPRA + SOTTO) * lsL) / 2 + SOPRA * lsL;
      const mid = top + avail / 2;
      Object.assign(this.LY, {
        lumCy: cy, lumScale: lsL,
        xFaccia: W * 0.2, facciaY: mid - 22, hintY: mid + 26, hintW: W * 0.3,
        xInfo: W * 0.8, nameY: mid - 34, heartsY: mid - 10, barY: mid + 12, sazY: mid + 30,
      });
    }
  }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#2a1f3a');
    this.cameras.main.fadeIn(240);
    Juice.particelleAmbiente(this, { n: 10, colore: 0xffd7ec, depth: 1 });
    this._calcolaLayout();

    this.add.text(W / 2, 20, '💗 Coccole', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(W / 2, 42, 'Come si sente? Dagli quello che gli serve 💭', {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd7ec', fontStyle: 'bold',
    }).setOrigin(0.5);

    const team = [...((window.GS && window.GS.team) || [])];
    if (window.GS && (window.GS.amiciNelGruppo || []).includes('pepole') && !team.some((l) => l.specie === 'pepole')) {
      team.unshift({ specie: 'pepole', nome: 'Pepole' });
    }
    if (!team.length) {
      this.add.text(W / 2, H / 2, 'Ancora nessun amico!\nCattura un Lumino e torna a coccolarlo 🐾', {
        fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5);
      this._bottoneEsci();
      return;
    }
    this.team = team;
    this._selettore();
    this._emozioneWidget();
    this._legamePersistente();
    this._pannello();
    this._azioni();
    this._bottoneEsci();
    this._nuovaEmozione();
    voce.parla(FRASI.benvenuto);
  }

  // Faccia grande dell'emozione + bolla del "come si sente" (segnale chiaro per il bimbo).
  _emozioneWidget() {
    const W = this.W, LY = this.LY;
    this._faccia = this.add.text(LY.xFaccia, LY.facciaY, '', { fontSize: LY.short ? '40px' : '50px' }).setOrigin(0.5);
    this._emote = this.add.text(LY.xFaccia + 36, LY.facciaY - 18, '', { fontSize: '24px' }).setOrigin(0.5);
    this._comeSi = this.add.text(LY.xFaccia, LY.hintY, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#3a2c22', fontStyle: 'bold',
      backgroundColor: '#ffffffee', padding: { x: 10, y: 3 }, align: 'center', wordWrap: { width: LY.hintW },
    }).setOrigin(0.5).setDepth(20);
    this._faccia.setDepth(20); this._emote.setDepth(20);
  }

  _legamePersistente() {
    const W = this.W, LY = this.LY;
    this._cuoriTxt = this.add.text(LY.xInfo, LY.heartsY, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#ff7da6', fontStyle: 'bold' }).setOrigin(0.5);
    const bw = 180;
    this._barW = bw; this._barX = LY.xInfo - bw / 2;
    this.add.rectangle(LY.xInfo, LY.barY, bw, 9, 0x000000, 0.4).setStrokeStyle(1, 0x7a6a9a);
    this._barraFill = this.add.rectangle(this._barX, LY.barY, 2, 7, 0x57c15a).setOrigin(0, 0.5).setVisible(false);
    this._sazTxt = this.add.text(LY.xInfo, LY.sazY, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd7ec', fontStyle: 'bold' }).setOrigin(0.5);
  }

  _nuovaEmozione() {
    this._tentativi = 0;
    const i = ((this._emoN = (this._emoN || 0) + 1) * 3 + this.sel) % EMOZIONI.length;
    this._emozione = EMOZIONI[i];
    if (this._faccia) {
      this._faccia.setText(this._emozione.faccia);
      this._emote.setText(this._emozione.emote);
      this._comeSi.setText(this._emozione.testo);
      this.tweens.add({ targets: this._faccia, scale: 1.15, yoyo: true, duration: 260, ease: 'Sine.inOut' });
    }
    try { this.lum && this.lum.setEspressione(this._emozione.id === 'triste' ? 'triste' : 'felice'); } catch { /* */ }
    this._refreshAzioni(false);
  }

  _aggiornaSazieta() {
    if (!this._sazTxt) return;
    const aff = livelloLegame(this._statoBond().affezione);
    const saz = sazietaOra(this._statoBond(), Date.now());
    const coda = saz >= SAZIETA_MAX ? '😊 appagato' : `😋 voglia ${Math.round(100 - saz)}%`;
    this._sazTxt.setText(`Legame: ${aff.nome}  ·  ${coda}`);
  }

  _msgFluttua(testo, colore) {
    const t = this.add.text(this.W / 2, this.LY.lumCy + 24, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: colore || '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 3, align: 'center', wordWrap: { width: this.W - 60 } }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, delay: 800, duration: 900, onComplete: () => t.destroy() });
  }

  // --- Selettore del Lumino attivo (riga di anelli toccabili) ---
  _selettore() {
    const W = this.W, LY = this.LY;
    const n = this.team.length;
    const sp = Math.min(58, (W - 40) / n);
    const x0 = W / 2 - (n - 1) * sp / 2;
    this._selBtn = [];
    this.team.forEach((l, i) => {
      const x = x0 + i * sp, y = LY.selY;
      const anello = this.add.circle(x, y, 21, 0xffffff, i === this.sel ? 0.22 : 0.06).setStrokeStyle(3, i === this.sel ? 0xffd23f : 0x7a6a9a).setInteractive({ useHandCursor: true });
      const base = LUMINI[l.specie] || {};
      this.add.text(x, y, (l.nome || base.nome || l.specie).slice(0, 1).toUpperCase(), { fontFamily: 'system-ui', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      anello.on('pointerdown', () => { if (this._occupato || i === this.sel) return; this.sel = i; this._refreshSelettore(); this._pannello(); this._nuovaEmozione(); });
      this._selBtn.push(anello);
    });
  }
  _refreshSelettore() {
    this._selBtn.forEach((a, i) => { a.setFillStyle(0xffffff, i === this.sel ? 0.22 : 0.06); a.setStrokeStyle(3, i === this.sel ? 0xffd23f : 0x7a6a9a); });
  }

  // --- Pannello centrale: SOLO il Lumino + nome (ricreato al cambio Lumino) ---
  _pannello() {
    if (this._pan) this._pan.destroy(true);
    const W = this.W, LY = this.LY, cx = W / 2, cy = LY.lumCy;
    this._pan = this.add.container(0, 0);
    const l = this.team[this.sel];
    const base = LUMINI[l.specie] || {};
    this.lum = new Lumino(this, cx, cy, l.specie).setScale(LY.lumScale);
    try { this.lum.setEspressione('felice'); } catch { /* */ }
    this._pan.add(this.lum);
    this.tweens.add({ targets: this.lum, y: cy - 6, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.inOut' });
    this._pan.add(this.add.text(LY.xInfo, LY.nameY, l.nome || base.nome || l.specie, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 4,
    }).setOrigin(0.5));
    this._aggiornaLegame();
  }

  _statoBond() {
    const l = this.team[this.sel];
    const a = (window.GS && window.GS.album && window.GS.album[l.specie]) || {};
    return { affezione: a.affezione || 0, curaPunti: a.curaPunti || 0, sazieta: a.sazieta || 0, sazietaTs: a.sazietaTs || 0 };
  }

  _aggiornaLegame() {
    const st = this._statoBond();
    const aff = livelloLegame(st.affezione);
    this._cuoriTxt.setText('❤'.repeat(aff.n) + '♡'.repeat(MAX_AFFEZIONE - aff.n));
    const p = progressoLegame(st);
    if (p > 0) this._barraFill.setVisible(true).setSize(Math.max(2, this._barW * p), 7);
    else this._barraFill.setVisible(false);
    this._aggiornaSazieta();
  }

  // --- Gesti di cura (4 bottoni). Rispondono a un'emozione: azzeccare = legame pieno. ---
  _azioni() {
    const W = this.W, LY = this.LY;
    const colori = { coccola: 0xc06090, cibo: 0x8a5a2e, gioco: 0x2c7a33, ninna: 0x4457a8 };
    const n = AZIONI_CURA.length;
    const bw = Math.min(94, (W - 24) / n - 8), bh = LY.btnH, gap = 8;
    const x0 = W / 2 - (n * (bw + gap) - gap) / 2 + bw / 2;
    this._azBtn = {};
    AZIONI_CURA.forEach((a, i) => {
      const x = x0 + i * (bw + gap);
      const bg = this.add.rectangle(x, LY.btnY, bw, bh, colori[a.id] || 0x6a4cc4).setStrokeStyle(3, 0x00000055).setInteractive({ useHandCursor: true });
      this.add.text(x, LY.btnY, a.emoji + '\n' + a.nome, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold', align: 'center', lineSpacing: 1 }).setOrigin(0.5);
      Juice.popBottone(this, bg);
      bg.on('pointerdown', () => this._rispondi(a));
      this._azBtn[a.bisogno] = bg;
    });
  }

  _refreshAzioni(mostraIndizio) {
    if (!this._azBtn) return;
    if (this._indizio) { this._indizio.destroy(); this._indizio = null; }
    if (mostraIndizio && this._emozione) {
      const bg = this._azBtn[this._emozione.bisogno];
      if (bg) this._indizio = Juice.alonePulsante(this, bg.x, bg.y, { colore: 0xffd23f, raggio: 42, depth: bg.depth - 1 });
    }
  }

  _rispondi(azione) {
    if (this._occupato) return;
    const st = this._statoBond();
    const ora = Date.now();
    if (eSazio(st, ora)) {
      audio.suono('tocco');
      Juice.coriandoli(this, this.lum.x, this.lum.y - 20, 4);
      this._msgFluttua('È felice così! 😊 Torna più tardi', '#ffd7ec');
      voce.parla(FRASI.sazio);
      return;
    }
    this._occupato = true;
    this.time.delayedCall(600, () => { this._occupato = false; });

    const { giusto, guadagno } = valutaLettura(this._emozione.bisogno, azione.bisogno);

    if (!giusto) {
      this._tentativi++;
      audio.suono('tocco');
      this.tweens.add({ targets: this.lum, x: this.lum.x + 6, yoyo: true, repeat: 3, duration: 60 });
      const r = applicaCura(st, guadagno, ora);
      this._salvaBond(azione, r);
      this._aggiornaLegame();
      this._msgFluttua('Uhm… non era quello. Guarda meglio 👀', '#ffd7ec');
      voce.parla(FRASI.sbaglia);
      if (this._tentativi >= 2) this._refreshAzioni(true);
      return;
    }

    const r = applicaCura(st, guadagno, ora);
    this._salvaBond(azione, r);
    audio.suono('stellina');
    try { this.lum.setEspressione('innamorato'); this.lum.reagisci && this.lum.reagisci(); } catch { /* */ }
    Juice.coriandoli(this, this.lum.x, this.lum.y - 20, 16);
    this.tweens.add({ targets: this.lum, scaleX: this.LY.lumScale * 1.15, scaleY: this.LY.lumScale * 1.15, yoyo: true, duration: 240, ease: 'Back.out' });
    this._aggiornaLegame();
    this._msgFluttua(this._emozione.ok, '#ff7da6');
    if (r.salito) {
      Juice.coriandoli(this, this.W / 2, this.LY.lumCy - 20, 22);
      voce.parla(r.affezione >= MAX_AFFEZIONE ? FRASI.legameMax : FRASI.legameSu);
    } else {
      voce.parla(FRASI.giusto);
    }
    this.time.delayedCall(1100, () => {
      if (eSazio(this._statoBond(), Date.now())) { this._faccia.setText('😌'); this._emote.setText('💗'); this._comeSi.setText('È appagato e felice! Torna più tardi 💗'); this._refreshAzioni(false); }
      else this._nuovaEmozione();
    });
  }

  _salvaBond(azione, r) {
    if (!window.GS) return;
    const l = this.team[this.sel];
    window.GS.album = window.GS.album || {};
    const voceA = window.GS.album[l.specie] || { visto: true, catturato: true, quantita: 1 };
    voceA.affezione = r.affezione; voceA.curaPunti = r.curaPunti;
    voceA.sazieta = r.sazieta; voceA.sazietaTs = r.sazietaTs;
    window.GS.album[l.specie] = voceA;
    if (azione.energia) l.energia = Math.min(l.energiaMax || 6, (l.energia || 0) + azione.energia);
    salvaGS();
  }

  _bottoneEsci() {
    const W = this.W, LY = this.LY;
    const bg = this.add.rectangle(W / 2, LY.exitY, 148, 34, 0x6a4cc4).setStrokeStyle(3, 0x3a2764).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, LY.exitY, '‹ Indietro', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, bg);
    bg.on('pointerdown', () => this._torna());
  }
}
