/* StarterScene — scelta dello starter come SCENA propria (overlay), non più overlay
 * in-scene dentro CittaScene.
 *
 * Perché una scena a parte: nella città la camera SCROLLA/zooma e gli overlay erano
 * fatti con container + hit-area personalizzata → l'area cliccabile risultava sfasata
 * dal disegno ("devi cliccare in alto a sinistra"), pur essendo il puntatore corretto.
 * Qui la camera è pulita (zoom 1, scroll 0) e i bersagli sono RETTANGOLI semplici
 * interattivi (area = disegno): tap esatto, carte grandi e facili.
 *
 * Uso (come QuizScene):
 *   const s = this.scene.get('StarterScene'); s._onFine = (specie) => {...};
 *   this.scene.pause(); this.scene.launch('StarterScene', { parent: this.scene.key });
 */

import audio from '../../audio.js';
import * as Juice from '../juice.js';
import { LUMINI, creaIstanza } from '../../lumini-data.js';
import { salvaGS } from '../../gs.js';

const SCELTE = [
  { specie: 'fiammino', elem: 'Fuoco',   c: 0xff7a30, scuro: 0xb8430f, tex: 'obj-lumiball-rosso' },  // Lumiball ROSSA
  { specie: 'guscetto', elem: 'Acqua',   c: 0x34a0d8, scuro: 0x176f9c, tex: 'obj-lumiball-blu' },    // Lumiball BLU
  { specie: 'foglino',  elem: 'Natura',  c: 0x57c15a, scuro: 0x2f7e33, tex: 'obj-lumiball-verde' },  // Lumiball VERDE
];

export class StarterScene extends Phaser.Scene {
  constructor() { super('StarterScene'); }
  init(data) { this.parent = (data && data.parent) || null; this._scelto = false; }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor('rgba(18,12,28,0.72)');

    // Scrigno decorativo in alto.
    if (this.textures.exists('obj-scrigno')) {
      const chest = this.add.image(W / 2, H * 0.20, 'obj-scrigno');
      // Limite anche in ALTEZZA: sugli schermi bassi lo scrigno copriva il titolo.
      chest.setScale(Math.min(Math.min(W * 0.5, 240) / chest.width, (H * 0.26) / chest.height));
      chest.y = Math.max(H * 0.20, H * 0.06 + 22 + chest.displayHeight / 2);
      this.tweens.add({ targets: chest, y: chest.y - 6, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
    }
    this.add.text(W / 2, H * 0.06, 'Scegli il tuo primo amico!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
      align: 'center', wordWrap: { width: W - 40 },
    }).setOrigin(0.5);

    // Tre CARTE grandi, in riga, centrate.
    const cardW = Math.min(150, (W - 60) / 3 - 12);
    const cardH = Math.min(210, H * 0.42);
    const gap = Math.min(22, (W - cardW * 3 - 20) / 2);
    const cy = H * 0.62;
    SCELTE.forEach((s, i) => {
      const cx = W / 2 + (i - 1) * (cardW + gap);
      const trig = this._carta(cx, cy, cardW, cardH, s);
      if (i === 0) this._scegliPredefinito = trig;   // failsafe sotto
    });

    audio.suono && audio.suono('stellina');

    // FAILSAFE ANTI-BLOCCO: questa scena è un OVERLAY (CittaScene è in pausa sotto) e
    // il watchdog globale di main.js NON la sorveglia → se il tap su una carta non
    // venisse mai registrato (hit-area sfasata su qualche device, il difetto storico
    // che ha fatto nascere questa scena), l'intro di Pietropoli resterebbe bloccata per
    // SEMPRE. Dopo un tempo generoso (tutto lo spazio per decidere) scegliamo noi il
    // primo amico, così non si resta mai incagliati.
    this.time.delayedCall(30000, () => { if (!this._scelto && this._scegliPredefinito) this._scegliPredefinito(); });
  }

  _carta(cx, cy, w, h, s) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.22); g.fillRoundedRect(cx - w / 2, cy - h / 2 + 5, w, h, 18);
    g.fillStyle(0xfff6e3, 1); g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 18);
    g.fillStyle(s.c, 1); g.fillRoundedRect(cx - w / 2, cy - h / 2, w, 38, { tl: 18, tr: 18, bl: 0, br: 0 });
    g.lineStyle(4, s.scuro, 1); g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 18);

    this.add.text(cx, cy - h / 2 + 19, s.elem, { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', stroke: s.scuro, strokeThickness: 3 }).setOrigin(0.5);

    const lumY = cy - 8;
    // SORPRESA: si vede la LUMIBALL colorata (sfera lucida come nello scrigno); il
    // Lumino è nascosto e ESCE solo quando scegli.
    const r = Math.min(w * 0.32, 40);
    // La Lumiball è il PNG vero (obj-lumiball) TINTO del colore dell'elemento:
    // rossa (fuoco), blu (acqua), verde (natura) — come chiesto. Fallback: cerchio.
    let orb;
    const texBall = (s.tex && this.textures.exists(s.tex)) ? s.tex : 'obj-lumiball';
    if (this.textures.exists(texBall)) {
      // Niente più setTint (colorava anche il bianco): si usa la PNG già ricolorata
      // nella sola base (rossa/verde/blu) — vedi tools/colora-lumiball.js.
      orb = this.add.image(cx, lumY, texBall);
      const srcH = this.textures.get(texBall).getSourceImage().height || (r * 2);
      orb._base = (r * 2) / srcH;
      orb.setScale(orb._base);
    } else {
      orb = this.add.graphics();
      orb.fillStyle(s.scuro, 1); orb.fillCircle(cx, lumY + 3, r);
      orb.fillStyle(s.tinta || s.c, 1); orb.fillCircle(cx, lumY, r);
      orb.fillStyle(0xffffff, 0.5); orb.fillEllipse(cx - r * 0.3, lumY - r * 0.35, r * 0.7, r * 0.55);
      orb.lineStyle(3, s.scuro, 1); orb.strokeCircle(cx, lumY, r);
      orb._base = 1;
    }
    this.tweens.add({ targets: orb, y: orb.y - 6, yoyo: true, repeat: -1, duration: 1000 + Math.random() * 300, ease: 'Sine.inOut' });

    // Lumino nascosto (PNG), pronto a uscire dalla Lumiball.
    let lum = null;
    if (this.textures.exists('lum-' + s.specie)) {
      lum = this.add.image(cx, lumY, 'lum-' + s.specie).setVisible(false);
      lum._scalaPiena = Math.min((w - 28) / lum.width, (h - 96) / lum.height);
    }
    const nome = (LUMINI[s.specie] && LUMINI[s.specie].nome) || s.specie;
    const nomeTxt = this.add.text(cx, cy + h / 2 - 22, '???', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#9a8a72', fontStyle: 'bold' }).setOrigin(0.5);

    // BERSAGLIO: rettangolo semplice interattivo (area = carta), tap esatto.
    const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { if (!this._scelto) orb.setScale((orb._base || 1) * 1.06); });
    hit.on('pointerout', () => orb.setScale(orb._base || 1));
    const trig = () => this._scegli(s, cx, lumY, orb, lum, nomeTxt, nome);
    hit.on('pointerdown', trig);
    return trig;   // usato dal failsafe anti-blocco in create()
  }

  _scegli(s, cx, lumY, orb, lum, nomeTxt, nome) {
    if (this._scelto) return;
    this._scelto = true;
    audio.suono && audio.suono('lancio');
    this.cameras.main.flash(240, 255, 255, 255);
    Juice.coriandoli(this, cx, lumY, 36);
    // La Lumiball si apre (si gonfia e svanisce)…
    this.tweens.add({ targets: orb, scale: (orb._base || 1) * 1.6, alpha: 0, duration: 320, ease: 'Quad.out' });
    // …e il Lumino ESCE (cresce dal nulla con un balzo).
    if (lum) {
      this.time.delayedCall(180, () => {
        lum.setVisible(true).setScale(0);
        this.tweens.add({ targets: lum, scale: lum._scalaPiena * 1.15, duration: 420, ease: 'Back.out' });
        this.tweens.add({ targets: lum, y: lumY - 6, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.inOut', delay: 420 });
        audio.suono && audio.suono('vittoria');
      });
    }
    nomeTxt.setText(nome).setColor('#4a3322');

    // Registra lo starter (team + album), come faceva il vecchio scrigno.
    if (window.GS) {
      window.GS.team = window.GS.team || [];
      if (!window.GS.team.some((l) => l.specie === s.specie)) window.GS.team.push(creaIstanza(s.specie));
      window.GS.album = window.GS.album || {};
      window.GS.album[s.specie] = { visto: true, catturato: true, quantita: 1, affezione: 0 };
      window.GS.luminiCatturati = Object.keys(window.GS.album).filter((k) => window.GS.album[k].catturato);
      window.GS.starter = s.specie;
      salvaGS({ immediato: true });   // primo Lumino scelto: salva SUBITO
    }
    this.time.delayedCall(1600, () => this._fine(s.specie));
  }

  _fine(specie) {
    const cb = this._onFine;
    this.scene.stop();
    if (this.parent) this.scene.resume(this.parent);
    if (typeof cb === 'function') cb(specie);
  }
}
