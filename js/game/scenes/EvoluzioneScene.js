/* EvoluzioneScene — la cinematica di evoluzione (P1-14), la più importante.
 *
 * Sequenza: musica → flash bianco → silhouette che cresce → raggi di luce
 * ruotanti → nuovo sprite con flash finale → Pietro e Pepole esultano →
 * testo "[Nome] si è evoluto in [Forma]!" lettera per lettera. Tap → continua.
 *
 * Uso: this.scene.start('EvoluzioneScene', { da:'fiammino', a:'fiammantor', ritorno:'CittaScene' });
 * Demo: index.html?demo=evoluzione
 */

import { LUMINI } from '../../lumini-data.js';
import { Lumino } from '../lumino.js';
import { Pepole } from '../pepole-actor.js';
import { Pietro } from '../pietro.js';
import audio from '../../audio.js';
import { vibra } from '../gfx.js';
import * as FX from '../effetti.js';
import * as Juice from '../juice.js';
import { salvaGS } from '../../gs.js';

export class EvoluzioneScene extends Phaser.Scene {
  constructor() { super('EvoluzioneScene'); }

  init(data) {
    data = data || {};
    this.da = data.da || 'fiammino';
    this.a = data.a || LUMINI[this.da]?.evolveIn || 'fiammantor';
    this.ritorno = data.ritorno || 'MenuScene';
  }

  /** #21 — Applica l'evoluzione allo stato (idempotente): se la squadra contiene
   *  ancora la forma `da`, la trasforma in `a` e aggiorna album/starter. Quando la
   *  scena è lanciata da _evolviUnLumino la mutazione è già fatta (team ha `a`) →
   *  qui è un no-op; lanciata da sola (demo/futuro) NON perde l'evoluzione. */
  _applicaEvoluzione() {
    const g = window.GS; if (!g) return;
    const lum = (g.team || []).find((l) => l && l.specie === this.da);
    if (!lum) return;   // già evoluta o non posseduta
    lum.specie = this.a; lum.nome = LUMINI[this.a]?.nome || this.a;
    if (g.starter === this.da) g.starter = this.a;
    g.album = g.album || {};
    g.album[this.a] = { visto: true, catturato: true, quantita: 1, affezione: (g.album[this.da]?.affezione || 0) };
    if (g.album[this.da]) {
      // La PRE-EVOLUZIONE non è più in squadra (quantità a 0) MA resta registrata nel
      // Lumidex: l'hai posseduta, fa parte della tua linea evolutiva (convenzione Pokédex).
      // Prima veniva marcata catturato=false → "sembrava non averla mai avuta". Ora resta.
      g.album[this.da].quantita = Math.max(0, (g.album[this.da].quantita || 1) - 1);
      g.album[this.da].catturato = true;
      g.album[this.da].visto = true;
    }
    g.luminiCatturati = Object.keys(g.album).filter((k) => g.album[k] && g.album[k].catturato);
    salvaGS({ immediato: true });   // evoluzione: salva SUBITO
  }

  create() {
    const { width, height } = this.scale.gameSize;
    this.W = width; this.H = height;
    this._applicaEvoluzione();
    this.cameras.main.setBackgroundColor('#0a0a18');
    Juice.particelleAmbiente(this, { n: 14, colore: 0xfff3c0, depth: 1 });
    const cx = width / 2, cy = height * 0.42;

    // Pietro e Pepole in basso (esultano alla fine).
    this.pietro = new Pietro(this, cx - 40, height * 0.82);
    this.pepole = new Pepole(this, cx + 30, height * 0.82, { scala: 0.8 });

    // Lumino di partenza.
    this.lumDa = new Lumino(this, cx, cy, this.da).setScale(1.1);
    // #95 — silhouette e raggi come TEXTURE generate UNA volta (niente più redraw
    // ogni frame per 2.6s): poi si animano scala/rotazione di Image (molto più leggero).
    this._creaTexEvo();
    this.silImg = this.add.image(cx, cy, 'evo-sil').setDepth(50).setVisible(false);
    this.raggiImg = this.add.image(cx, cy, 'evo-raggi').setDepth(40).setVisible(false);

    this.skip = this.add.text(width - 14, height - 14, 'tocca per continuare', {
      fontFamily: 'system-ui', fontSize: '13px', color: '#ffffff',
    }).setOrigin(1, 1).setAlpha(0);

    // RETE ANTI-FREEZE: la cinematica è async. Se un passo lancia (quirk audio/texture
    // su un device) o si incaglia PRIMA di `_testoFinale`, senza rete non c'è né skip né
    // timeout → freeze totale "all'evoluzione" che obbligava a riavviare. L'evoluzione è
    // GIÀ stata salvata (`_applicaEvoluzione` sopra), quindi qui si può sempre uscire.
    this._sequenza(cx, cy).catch((e) => { try { console.warn('Evoluzione: sequenza interrotta', e); } catch { /* */ } this._fine(); });
    // Skip armato presto (così puoi sempre toccare per proseguire) + backstop in tempo
    // REALE che forza comunque l'uscita anche se la sequenza non avanza.
    this.time.delayedCall(1300, () => { if (!this._uscito) { this.skip.setAlpha(0.8); this.input.once('pointerdown', () => this._fine()); } });
    this._backstop = setTimeout(() => this._fine(), 10000);
  }

  async _sequenza(cx, cy) {
    audio.suono('evolveStart');
    await this._wait(500);

    // Flash + nasconde il vecchio, mostra la silhouette che cresce.
    FX.flashSchermo(this, 0xffffff, 0.8, 300);
    this.lumDa.setVisible(false);
    this.raggiImg.setVisible(true).setScale(1);
    this.silImg.setVisible(true).setScale(1);
    audio.suono('evoluzione');

    // Crescita silhouette (scala tween) + raggi che ruotano (angle tween): tween di
    // proprietà, niente redraw per-frame.
    const dur = 2600;
    this.tweens.add({ targets: this.silImg, scale: 1.8, duration: dur, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.silImg, angle: { from: -2, to: 2 }, yoyo: true, repeat: -1, duration: 130 });
    this._raggiTween = this.tweens.add({ targets: this.raggiImg, angle: 360, duration: 3000, repeat: -1 });
    this.tweens.add({ targets: this.raggiImg, scale: 1.6, duration: dur, ease: 'Sine.inOut' });
    await this._wait(dur);

    // Flash finale → nuovo sprite.
    FX.flashSchermo(this, 0xffffff, 1, 350);
    if (this._raggiTween) this._raggiTween.stop();
    this.silImg.setVisible(false);
    this.raggiImg.setVisible(false);
    vibra(100);
    this.lumA = new Lumino(this, cx, cy, this.a).setScale(0.2);
    this.tweens.add({ targets: this.lumA, scale: 1.25, duration: 500, ease: 'Back.out' });
    FX.particelle(this, cx, cy, 0xffd23f, 26);
    FX.stellineFairPlay(this, 10);
    Juice.coriandoli(this, cx, cy, 40);
    this.time.delayedCall(400, () => Juice.coriandoli(this, this.W * 0.3, this.H * 0.35, 24));

    // Pietro e Pepole esultano.
    this.tweens.add({ targets: [this.pietro, this.pepole], y: '-=24', yoyo: true, repeat: 3, duration: 240 });
    this.pepole.reagisci();

    await this._wait(700);
    this._testoFinale();
  }

  /** #95 — genera UNA volta le texture di silhouette e raggi (poi solo Image+tween). */
  _creaTexEvo() {
    if (!this.textures.exists('evo-sil')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 1);
      g.fillEllipse(100, 110, 90, 96);
      g.fillCircle(100, 76, 26);
      g.lineStyle(3, 0xfff2a8, 0.6); g.strokeEllipse(100, 110, 90, 96);
      g.generateTexture('evo-sil', 200, 210);
      g.destroy();
    }
    if (!this.textures.exists('evo-raggi')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(6, 0xffe9a8, 0.4);
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        g.lineBetween(160, 160, 160 + Math.cos(a) * 150, 160 + Math.sin(a) * 150);
      }
      g.generateTexture('evo-raggi', 320, 320);
      g.destroy();
    }
  }

  _testoFinale() {
    const nomeDa = LUMINI[this.da]?.nome || this.da;
    const nomeA = LUMINI[this.a]?.nome || this.a;
    const frase = `${nomeDa} si è evoluto in ${nomeA}!`;
    const txt = this.add.text(this.W / 2, this.H * 0.7, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold',
      stroke: '#8a4b1e', strokeThickness: 5, align: 'center', wordWrap: { width: this.W - 60 },
    }).setOrigin(0.5);
    let n = 0;
    this.time.addEvent({ delay: 45, repeat: frase.length - 1, callback: () => { n++; txt.setText(frase.slice(0, n)); } });

    this.skip.setAlpha(0.8);
    this.input.once('pointerdown', () => this._fine());
    this.time.delayedCall(4000, () => { if (this.scene.isActive()) this._fine(); });
  }

  _fine() {
    if (this._uscito) return;
    this._uscito = true;
    if (this._backstop) { clearTimeout(this._backstop); this._backstop = null; }
    let andato = false;
    const vai = () => { if (andato) return; andato = true; try { this.scene.start(this.ritorno); } catch { /* */ } };
    try {
      this.cameras.main.fadeOut(300);
      this.cameras.main.once('camerafadeoutcomplete', vai);
    } catch { /* */ }
    setTimeout(vai, 700);   // backstop reale se l'evento di fade non arriva
  }

  _wait(ms) { return new Promise((r) => this.time.delayedCall(ms, r)); }

  update(time) {
    this.lumDa?.visible && this.lumDa.idle(time);
    this.lumA?.idle(time);
    this.pepole?.idle(time);
  }
}
