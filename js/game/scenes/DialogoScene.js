/* DialogoScene — box dialogo RPG (P1-05) con la correzione di sync audio.
 *
 * Box scuro semitrasparente in basso, bordo dorato, avatar animato del parlante,
 * typewriter (40ms/char) e voce ElevenLabs che parte INSIEME al testo.
 *
 * FIX audio/testo (richiesta esplicita):
 *  - Toccare "Avanti" mentre il testo appare → completa subito il testo (NON
 *    avanza). Serve un secondo tap per passare alla battuta successiva.
 *  - Passando alla battuta successiva si chiama PRIMA voce.stop() (pause +
 *    currentTime=0 sull'audio in corso + svuota coda), POI parte l'audio nuovo.
 *    Così l'audio segue sempre la battuta visualizzata, anche avanzando veloci:
 *    niente accumulo, niente ritardo.
 *
 * Uso da un'altra Scene:
 *   this.scene.launch('DialogoScene', { battute, ritorno: 'MappaMondoScene' });
 *   // battute: [{ id, testo, speaker }]  (testo opzionale: se manca usa testi.json)
 * Demo: index.html?demo=dialogo
 */

import voce from '../../voce.js';
import audio from '../../audio.js';
import { texAvatar, BUST_FRAC } from '../sprites.js';
import { haRitratto, disegnaPersona } from '../ritratti.js';
import { fsBody, velocitaTW } from '../ui.js';

// Aspetto dei parlanti. pietro/pepole/lauri(Doda)/nico(Ale) usano lo sprite PNG
// (vedi texPer); gli altri restano cerchio colorato + emoji.
const PARLANTI = {
  pietro:     { nome: 'Pietro',      colore: 0xe23b2e, emoji: '🧢' },
  pepole:     { nome: 'Pepole',      colore: 0xf0a830, emoji: '🐶' },
  bambino:    { nome: 'Bimbo',       colore: 0x2f6fc4, emoji: '🧒' },
  lauri:      { nome: 'Doda',        colore: 0xffd23f, emoji: '👧' },
  nico:       { nome: 'Ale',         colore: 0x2f6fc4, emoji: '👦' },
  nonnatella: { nome: 'Nonna Tella', colore: 0x7a5b8c, emoji: '👵' },
  marina:     { nome: 'Marina',      colore: 0x34a0d8, emoji: '🧜' },
  silvio:     { nome: 'Silvio',      colore: 0x4caf50, emoji: '🧑‍🌾' },
  rik:        { nome: 'Rik',         colore: 0xffd23f, emoji: '⚡' },
  rocco:      { nome: 'Rocco',       colore: 0x9b8579, emoji: '🧗' },
  maestro:    { nome: 'Maestro',     colore: 0xffd23f, emoji: '👑' },
  narratore:  { nome: '',            colore: 0x3a2c22, emoji: '✨' },
};

// Conversazione di esempio per la demo (mix narratore/personaggi).
const DEMO_BATTUTE = [
  { id: 'acquaverde:arrivo', speaker: 'narratore' },
  { id: 'lauri:incontro', speaker: 'lauri' },
  { id: 'pietro:sogno', speaker: 'pietro' },
  { id: 'nico:battuta', speaker: 'nico' },
  { id: 'nonnatella:benedizione', speaker: 'nonnatella' },
  { id: 'pepole:saluto1', speaker: 'pepole' },
];

export class DialogoScene extends Phaser.Scene {
  constructor() { super('DialogoScene'); }

  init(data) {
    this.battute = (data && data.battute && data.battute.length) ? data.battute : DEMO_BATTUTE;
    this.ritorno = (data && data.ritorno) || 'MenuScene';
    // Uso "overlay": lanciata sopra una scena in pausa, che va ripresa a fine dialogo.
    this.parent = (data && data.parent) || null;
    this.indice = -1;
  }

  create() {
    const { width, height } = this.scale.gameSize;
    this._scena = { width, height };

    // Sfondo trasparente: la scena può essere lanciata sopra un'altra.
    this.cameras.main.setBackgroundColor('rgba(20,15,25,0.35)');

    // Pannello dialogo.
    const margine = 14;
    const boxH = Math.min(190, height * 0.34);
    const boxY = height - boxH - margine;
    this.box = this.add.graphics();
    this.box.fillStyle(0x1a1226, 0.92);
    this.box.fillRoundedRect(margine, boxY, width - margine * 2, boxH, 16);
    this.box.lineStyle(4, 0xffd23f, 1);
    this.box.strokeRoundedRect(margine, boxY, width - margine * 2, boxH, 16);

    // Avatar a sinistra (container con idle bob): cerchio colorato + sprite PNG
    // del busto (o emoji come fallback per i parlanti senza sprite).
    this.avatar = this.add.container(margine + 52, boxY + boxH / 2);
    this.avatarG = this.add.graphics();
    this.avatarImg = this.add.image(0, 0, 'pietro').setVisible(false);
    this.avatarEmoji = this.add.text(0, 0, '', { fontSize: '40px' }).setOrigin(0.5);
    this.avatar.add([this.avatarG, this.avatarImg, this.avatarEmoji]);
    this.tweens.add({ targets: this.avatar, y: this.avatar.y - 5, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });

    // Nome parlante.
    this.nomeTxt = this.add.text(margine + 100, boxY + 14, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#ffd23f', fontStyle: 'bold',
    });

    // Testo dialogo (#78 — rispetta il toggle "Testo grande"). Il wrap RISERVA la
    // colonna del tasto "Avanti" (in basso a destra), così su smartphone (box basso
    // in orizzontale) le righe lunghe non finiscono PIÙ nascoste dietro il bottone.
    this.testoTxt = this.add.text(margine + 100, boxY + 38, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: fsBody() + 'px', color: '#ffffff',
      wordWrap: { width: width - margine * 2 - 100 - 150 }, lineSpacing: 4,
    });

    // Pulsante Avanti (grande, ≥80px, in basso a destra).
    const bw = 120, bh = 60;
    this.btnAvantiBg = this.add.rectangle(width - margine - bw / 2 - 6, boxY + boxH - bh / 2 - 10, bw, bh, 0xffd23f)
      .setStrokeStyle(3, 0x8a4b1e).setInteractive({ useHandCursor: true });
    this.btnAvantiTxt = this.add.text(this.btnAvantiBg.x, this.btnAvantiBg.y, 'Avanti ▸', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#3a2c22', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.btnAvantiBg.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      this.tweens.add({ targets: [this.btnAvantiBg, this.btnAvantiTxt], scaleX: 1.12, scaleY: 1.12, duration: 80, yoyo: true, ease: 'Quad.out' });
      this._onAvanti();
    });

    // Freccia ▼ lampeggiante: appare quando il testo è finito (cue "tocca per
    // continuare", come negli RPG). Sta a sinistra del pulsante Avanti.
    this.freccia = this.add.text(this.btnAvantiBg.x - bw / 2 - 18, this.btnAvantiBg.y, '▼', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false);
    this.tweens.add({ targets: this.freccia, y: this.freccia.y + 6, yoyo: true, repeat: -1, duration: 440, ease: 'Sine.inOut' });

    // Si può anche toccare il box per avanzare (più facile per un bambino).
    const zonaTap = this.add.rectangle(width / 2, boxY + boxH / 2, width - margine * 2, boxH, 0xffffff, 0)
      .setInteractive();
    zonaTap.on('pointerdown', () => this._onAvanti());

    // Da COMPUTER: "Avanti" anche con tastiera (Invio o Spazio), oltre a mouse/tocco.
    this._onTasto = (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (e.preventDefault) e.preventDefault();   // niente scroll pagina con lo Spazio
        this.tweens.add({ targets: [this.btnAvantiBg, this.btnAvantiTxt], scaleX: 1.12, scaleY: 1.12, duration: 80, yoyo: true, ease: 'Quad.out' });
        this._onAvanti();
      }
    };
    if (this.input.keyboard) this.input.keyboard.on('keydown', this._onTasto);
    this.events.once('shutdown', () => { if (this.input.keyboard && this._onTasto) this.input.keyboard.off('keydown', this._onTasto); });

    this._mostra(0);
  }

  /** Mostra la battuta i: avatar, nome, avvia typewriter e (sincronizzato) la voce. */
  _mostra(i) {
    if (i >= this.battute.length) { this._fine(); return; }
    this.indice = i;
    const b = this.battute[i];
    const p = PARLANTI[b.speaker] || PARLANTI.narratore;
    const testo = b.testo || voce.testoDi(b.id) || '';

    // Avatar + nome. Cerchio colorato di sfondo sempre presente.
    this.avatarG.clear();
    this.avatarG.fillStyle(p.colore, 1);
    this.avatarG.fillCircle(0, 0, 34);
    this.avatarG.lineStyle(3, 0xffffff, 0.6);
    this.avatarG.strokeCircle(0, 0, 34);
    // #7 — nome proprio per i bambini-allenatori. Per il PROTAGONISTA (speaker 'pietro')
    // mostro il NOME DEL PROFILO (non l'hardcoded "Pietro"): es. una bimba vede il suo nome.
    let nomeMostrato = b.nome || p.nome;
    if (b.speaker === 'pietro') nomeMostrato = (window.GS && window.GS.profilo && window.GS.profilo.nome) || nomeMostrato;
    this.nomeTxt.setText(nomeMostrato);

    // #77 — pulisco un eventuale ritratto procedurale precedente.
    if (this.avatarRit) { this.avatarRit.destroy(); this.avatarRit = null; }
    // Sprite PNG del busto se disponibile, poi ritratto procedurale, infine emoji.
    // `b.tex` = override per-battuta (es. allenatori: ognuno il suo sprite/avatar).
    const tex = (b.tex && this.textures.exists(b.tex)) ? b.tex : texAvatar(b.speaker);
    if (tex && this.textures.exists(tex)) {
      const src = this.textures.get(tex).getSourceImage();
      const tw = src.width, th = src.height;
      const cropH = Math.round(th * (BUST_FRAC[tex] || 0.45));
      this.avatarImg.setTexture(tex).setOrigin(0.5, 0);
      this.avatarImg.setCrop(0, 0, tw, cropH);
      const box = 58;                                  // entro il cerchio (d=68)
      const s = Math.min(box / tw, box / cropH);
      this.avatarImg.setScale(s);
      this.avatarImg.x = 0;
      this.avatarImg.y = -(cropH * s) / 2;             // centra il busto nel cerchio
      this.avatarImg.setVisible(true);
      this.avatarEmoji.setVisible(false);
    } else if (haRitratto(b.speaker)) {
      // #77 — ritratto procedurale del leader dentro il cerchio (no PNG, no emoji).
      this.avatarImg.setVisible(false);
      this.avatarEmoji.setVisible(false);
      this.avatarRit = disegnaPersona(this, b.speaker, 0.62).setPosition(0, 6);
      this.avatar.add(this.avatarRit);
    } else {
      this.avatarImg.setVisible(false);
      this.avatarEmoji.setText(p.emoji).setVisible(true);
    }

    // Pop dell'avatar a ogni nuova battuta: dà il senso del "parlato".
    this.tweens.add({ targets: this.avatar, scaleX: 1.16, scaleY: 1.16, duration: 130, yoyo: true, ease: 'Quad.out' });

    // FIX: ferma DAVVERO l'audio precedente prima di partire col nuovo, così
    // audio e testo restano sempre sulla stessa battuta.
    voce.stop();

    // Typewriter.
    this._testoCompleto = testo;
    this._completato = false;
    this.testoTxt.setText('');
    if (this.freccia) this.freccia.setVisible(false);
    if (this._timerTW) { this._timerTW.remove(); this._timerTW = null; }
    let n = 0;
    const vel = velocitaTW();   // #80 — velocità testo (0 = istantaneo)
    if (testo.length === 0 || vel <= 0) {
      this.testoTxt.setText(testo);
      this._completato = true;
      if (this.freccia) this.freccia.setVisible(true);
    } else {
      this._timerTW = this.time.addEvent({
        delay: vel, repeat: testo.length - 1,
        callback: () => {
          n++;
          this.testoTxt.setText(testo.slice(0, n));
          if (n >= testo.length) { this._completato = true; if (this.freccia) this.freccia.setVisible(true); }
        },
      });
    }

    // Voce sincronizzata col typewriter (parte adesso).
    if (b.id) voce.parla(b.id, { testo });
    else if (testo) voce.parlaDinamico(testo);
  }

  _onAvanti() {
    if (!this._completato) {
      // 1° tap durante il typewriter: completa subito il testo, NON avanza.
      if (this._timerTW) { this._timerTW.remove(); this._timerTW = null; }
      this.testoTxt.setText(this._testoCompleto);
      this._completato = true;
      if (this.freccia) this.freccia.setVisible(true);
      return;
    }
    // 2° tap (testo già completo): avanza. _mostra() farà voce.stop() + nuovo audio.
    this._mostra(this.indice + 1);
  }

  _fine() {
    voce.stop();
    if (this._timerTW) { this._timerTW.remove(); this._timerTW = null; }
    if (this.parent) {
      // overlay: chiudi e riprendi la scena chiamante dov'era.
      // #20 — azzero _onFine PRIMA di richiamarlo: la scena è riusata e un callback
      // stantio potrebbe rifirare se il dialogo successivo finisse per altra via.
      const cb = this._onFine;
      this._onFine = null;
      this.scene.stop();
      this.scene.resume(this.parent);
      if (typeof cb === 'function') cb();
      return;
    }
    if (typeof this.ritorno === 'function') {
      this.scene.stop();
      this.ritorno();
    } else {
      // #26 — se la scena di ritorno non esiste, non restare bloccati: MenuScene.
      const dest = (this.ritorno && this.scene.manager.getScene(this.ritorno)) ? this.ritorno : 'MenuScene';
      this.scene.start(dest);
    }
  }
}
