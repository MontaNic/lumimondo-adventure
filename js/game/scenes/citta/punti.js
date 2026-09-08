/* scenes/citta/punti.js — i PUNTI D'INTERESSE di una città, staccati da CittaScene.
 *
 * Perché (PIANO_V3 filone C1): CittaScene era arrivata a 2185 righe, il doppio del secondo
 * file del progetto — lo stesso problema che aveva BattagliaScene prima di F0.2. Qui vivono
 * le cose che si TOCCANO girando per la città: forzieri, palloncini della missione, Nonna
 * Pina, Vido, il luogo speciale (A2), il palco della Gara, gli ostacoli e gli incontri gentili.
 *
 * COME: i metodi sono spostati IDENTICI e rimontati sul prototipo con Object.assign.
 * Volutamente NON convertiti in `funzione(scene, …)` come in `battaglia/`: quelli erano
 * aiutanti di disegno quasi puri, questi condividono stato con la scena e si chiamano a
 * vicenda. Riscriverli avrebbe voluto dire toccare centinaia di `this` per un guadagno
 * estetico; così il file si divide davvero senza cambiare una virgola di comportamento.
 */

import { Pietro } from '../../pietro.js';
import { Pepole } from '../../pepole-actor.js';
import { Lumino } from '../../lumino.js';
import { ControlloMovimento } from '../../controllo.js';
import { CITTA } from '../../../citta-data.js';
import { LUMINI, creaIstanza, possiediLinea } from '../../../lumini-data.js';
import { col, shade, bordoSpecchiato } from '../../gfx.js';
import { texPer, texGiocatore } from '../../sprites.js';
import { haRitratto, disegnaPersona } from '../../ritratti.js';
import { creaOmbra } from '../../ombra.js';
import * as Juice from '../../juice.js';
import voce from '../../../voce.js';
import audio from '../../../audio.js';
import musica from '../../../musica.js';
import { salvaGS, aggiungiXP, incrStat } from '../../../gs.js';
import { eseguiRegia } from '../../../motore/regia.js';
import { aiutantePerOstacolo, datiOstacolo, NOME_ELEMENTO } from '../../../motore/mondo.js';
import { statoTorneo, maestroSbloccato, etichettaTorneo } from '../../../motore/torneo.js';
import { layoutCitta, MONDO } from '../../../motore/layout-citta.js';
import { datiLuogo, chiaveLuogo, luogoEsaurito, luogoVisibile, luoghiDi, premioScavo, scavateFatte } from '../../../motore/luoghi.js';
import { bordoCopertura, limitiCamera } from '../../../motore/copertura.js';

// Dimensioni del mondo-città: erano costanti di modulo dentro CittaScene, qui arrivano dai
// dati del layout (stesso valore, una sola fonte).
const W = MONDO.larghezza, H = MONDO.altezza;

export const PUNTI = {
  /** #46 — Tesori nascosti: stelline/Lumiball dietro la vegetazione, con brillio al
   *  passaggio. Raccolti una volta sola (flag). */
  _tesori() {
    // I premi restano legati alla POSIZIONE nell'elenco (il 1° stelline, il 2° una Lumiball):
    // così una città può spostare i forzieri senza dover ridichiarare anche i premi.
    const premi = [{ premio: 'stelline', n: 3 }, { premio: 'lumiball', n: 1 }];
    const spot = this.layout.tesori.map((t, i) => ({ ...t, ...(premi[i] || premi[0]) }));
    this._tesoriAttivi = [];
    spot.forEach((t, i) => {
      const flag = 'tesoro:' + this.cittaId + ':' + i;
      if (this._fatta(flag)) return;
      const c = this.add.container(t.x, t.y).setDepth(t.y);
      const brillo = this.add.star(0, 0, 4, 4, 12, 0xffe98a).setAlpha(0.9);
      const ico = this.add.text(0, 0, t.premio === 'lumiball' ? '⚪' : '⭐', { fontSize: '20px' }).setOrigin(0.5);
      c.add([brillo, ico]);
      this.tweens.add({ targets: brillo, angle: 360, duration: 3000, repeat: -1 });
      this.tweens.add({ targets: c, scale: 1.15, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
      this._tesoriAttivi.push({ ...t, flag, obj: c, preso: false });
    });
  },

  /** PALLONCINI-INDOVINELLO: palloncini colorati che ondeggiano e che, TOCCATI,
   *  lanciano una domanda del trivia didattico (aritmetica/vocabolario per età) e poi
   *  SCOPPIANO con coriandoli. OPZIONALI ma piacevoli: niente punizioni (il quiz è
   *  gentile). Persistiti per-palloncino (flag storico `fiore:<id>:<i>`, conservato per
   *  i salvataggi), così non riappaiono una volta scoppiati. */
  _missione() {
    if (this._fatta('fioritrivia:' + this.cittaId)) return;   // tutti già scoppiati
    // Cartello-invito (non un obbligo).
    const cp = this.layout.cartelloPalloncini;
    const seg = this.add.container(cp.x, cp.y).setDepth(600);
    seg.add(this.add.text(0, 0, '🎈', { fontSize: '26px' }).setOrigin(0.5));
    seg.add(this.add.text(0, 24, 'Fai scoppiare i palloncini!', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fff', fontStyle: 'bold', backgroundColor: '#00000088', padding: { x: 4, y: 1 } }).setOrigin(0.5));
    this._fiori = [];
    const COLORI = [0xff5d73, 0x4db6ff, 0xffd23f, 0x7ed957, 0xb98cff, 0xff9e3d];
    const spot = this.layout.palloncini.map((p) => [p.x, p.y]);
    spot.forEach(([x, y], i) => {
      const flag = 'fiore:' + this.cittaId + ':' + i;
      if (this._fatta(flag)) return;   // già scoppiato
      const colore = COLORI[i % COLORI.length];
      const cont = this.add.container(x, y).setDepth(y);
      const filo = this.add.rectangle(0, 30, 2, 30, 0xffffff, 0.45).setOrigin(0.5, 0);
      const nodo = this.add.triangle(0, 30, 0, 0, 9, 0, 4.5, 8, colore);
      const corpo = this.add.ellipse(0, 0, 46, 56, colore).setStrokeStyle(3, shade(colore, -0.28));
      const luce = this.add.ellipse(-9, -13, 13, 19, 0xffffff, 0.5);
      const q = this.add.text(0, -46, '?', { fontFamily: 'system-ui', fontSize: '22px', color: '#fff', fontStyle: 'bold', stroke: '#444', strokeThickness: 4 }).setOrigin(0.5).setVisible(false);
      cont.add([filo, nodo, corpo, luce, q]);
      // ondeggio dolce: salita/discesa + leggero dondolio (durate sfasate per varietà).
      this.tweens.add({ targets: cont, y: y - 12, yoyo: true, repeat: -1, duration: 1500 + i * 130, ease: 'Sine.inOut' });
      this.tweens.add({ targets: cont, angle: 4, yoyo: true, repeat: -1, duration: 1100 + i * 90, ease: 'Sine.inOut' });
      const hit = this.add.rectangle(x, y, 72, 96, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
      const obj = { x, y, flag, cont, q, hit, fatto: false, colore };
      hit.on('pointerdown', () => this._toccaFiore(obj));
      this._fiori.push(obj);
    });
    this._fioriSeg = seg;
  },

  /** #44 — NPC ricorrente e ricco: "Nonna Pina" appare in ogni città con una
   *  battuta gentile (bolla visiva, niente voce di sistema) e un regalo una-tantum. */
  _civile() {
    const { x, y } = this.layout.civile;
    const c = this.add.container(x, y).setDepth(y);
    // Nonna Pina: sprite vero (riuso la nonnina PNG) invece dell'antiestetico rettangolo viola.
    if (this.textures.exists('nonnatella')) {
      const img = this.add.image(0, 16, 'nonnatella').setOrigin(0.5, 1);
      img.setScale(96 / (img.height || 96));
      c.add([creaOmbra(this, Math.max(34, img.displayWidth * 0.85), 16), img]);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x9a6fb0, 1); g.lineStyle(3, 0x5a3b6a, 1);
      g.fillRoundedRect(-16, -10, 32, 40, 10); g.strokeRoundedRect(-16, -10, 32, 40, 10);
      c.add([creaOmbra(this, 32, 30), g, this.add.text(0, -22, '👵', { fontSize: '28px' }).setOrigin(0.5)]);
    }
    const excl = this.add.text(0, -52, '💬', { fontSize: '20px' }).setOrigin(0.5).setVisible(false);
    c.add(excl);
    this.tweens.add({ targets: excl, y: -58, yoyo: true, repeat: -1, duration: 500 });
    const hit = this.add.rectangle(x, y, 70, 90, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
    const battute = {
      acquaverde: 'Che bei Lumini! Tieni, un regalino. ⭐', terraverde: 'I fiori qui sono magici, lo sai?',
      voltopoli: 'Attento alle scintille, piccolo! ⚡', pietrasanta: 'Le pietre raccontano storie antiche.',
      luminia: 'Sei arrivato fin qui? Che campione! 🏆',
    };
    hit.on('pointerdown', () => {
      if (Math.hypot(this.pietro.x - x, this.pietro.y - y) > 150) { voce.parla('pepole:vicino'); return; }
      const flag = 'regalo:' + this.cittaId;
      const primo = !this._fatta(flag);
      this._bollaCitta(x, y - 70, battute[this.cittaId] || 'Buona avventura, piccolo!');
      if (primo) {
        this._segna(flag);
        if (window.GS) { window.GS.stelline = (window.GS.stelline || 0) + 3; salvaGS(); }
        audio.suono('stellina'); Juice.coriandoli(this, x, y - 30, 12);
      }
    });
    this._civileObj = { x, y, excl };
  },

  /** #45 — Rivale amichevole ricorrente: "Vido" appare in 3 città (Acquaverde,
   *  Voltopoli, Luminia) e la sua squadra CRESCE con te. Sfida una volta per città.
   *  Bolle visive (niente voce di sistema). Vincere dà stelline. */
  _rivale() {
    const sfide = {
      acquaverde: { avversario: 'brizzo', linea: 'Ehi! Sono Vido. Facciamo una sfida amichevole?' },
      terraverde: { avversario: 'floranyx', linea: 'Ti ho seguito fin qui! Sono cresciuto anch\'io. 🌿' },
      voltopoli: { avversario: 'voltrik', linea: 'Di nuovo tu! Sono più forte adesso. ⚡' },
      pietrasanta: { avversario: 'granitor', linea: 'Manca poco al torneo: alleniamoci insieme! 🪨' },
      luminia: { avversario: 'aquarex', linea: 'L\'ultima sfida, amico! Diamo il meglio! 🏆' },
    };
    const s = sfide[this.cittaId];
    if (!s) return;
    const { x, y } = this.layout.rivale;
    const c = this.add.container(x, y).setDepth(y);
    // Vido (rivale ricorrente): sprite PNG anime, non più rettangolo+emoji. Uso 'bimbo6',
    // non assegnato agli allenatori delle sue città (Acquaverde/Voltopoli/Luminia).
    const tex = 'bimbo6';
    if (this.textures.exists(tex)) {
      const img = this.add.image(0, 16, tex).setOrigin(0.5, 1);
      img.setScale(92 / (img.height || 92));
      c.add([creaOmbra(this, Math.max(34, img.displayWidth * 0.85), 16), img]);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x3a6ea5, 1); g.lineStyle(3, 0x1c3a5c, 1);
      g.fillRoundedRect(-16, -10, 32, 40, 10); g.strokeRoundedRect(-16, -10, 32, 40, 10);
      c.add([creaOmbra(this, 32, 30), g, this.add.text(0, -22, '🧒', { fontSize: '28px' }).setOrigin(0.5)]);
    }
    // ✓ verde quando il rivale è stato BATTUTO (come gli allenatori del roster): prima
    // Vido non mostrava nulla anche dopo averlo sconfitto (era un NPC bespoke fuori da _npc).
    const vintoRiv = this._fatta('sfida:rivale-' + this.cittaId + ':vinta');
    c.add(this.add.text(0, -94, (vintoRiv ? '✓ ' : '') + 'Vido', {
      fontFamily: 'system-ui', fontSize: '13px', color: vintoRiv ? '#bdf0a0' : '#fff', fontStyle: 'bold',
      backgroundColor: vintoRiv ? '#1c4a22dd' : '#00000099', padding: { x: 5, y: 1 },
    }).setOrigin(0.5));
    // "Già sfidato" = ho parlato con lui E l'ho davvero battuto. Il solo flag di dialogo
    // non basta: se la sfida si interrompe (app chiusa a metà battaglia) Vido tornerebbe a
    // salutare e basta — e a Luminia il Maestro resterebbe bloccato dal gate del rivale.
    const giaSfidato = this._fatta('rivale:' + this.cittaId) && vintoRiv;
    const excl = this.add.text(0, -110, giaSfidato ? '💬' : '⚔️', { fontSize: '22px' }).setOrigin(0.5).setVisible(false);
    c.add(excl);
    this.tweens.add({ targets: excl, y: -116, yoyo: true, repeat: -1, duration: 500 });
    const hit = this.add.rectangle(x, y - 30, 76, 104, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (Math.hypot(this.pietro.x - x, this.pietro.y - y) > 160) { voce.parla('pepole:vicino'); return; }
      if (this._inDialogo || this._inOverlay || this._introInCorso || this._inTransizione) return;
      if (giaSfidato) { this._bollaCitta(x, y - 70, 'Bella sfida! Alla prossima, amico! 👋'); return; }
      this._bollaCitta(x, y - 70, s.linea);
      this._segna('rivale:' + this.cittaId);
      this.time.delayedCall(1400, () => this._avviaBattaglia({ avversario: s.avversario, selvatico: false, idSfida: 'rivale-' + this.cittaId }));
    });
    this._rivaleObj = { x, y, excl };
  },

  // --- A2: il LUOGO SPECIALE della città -----------------------------------
  /** Ogni città ha una cosa che le altre non hanno: il pontile dove si pesca, il focolare
   *  dove la squadra riposa, il quadro delle luci, la cava, l'albero dei doni, il tabellone
   *  del torneo. È un dato nel JSON (`luoghi`); le regole stanno in motore/luoghi.js. */
  _luoghi() {
    this._luoghiObj = [];
    for (const l of luoghiDi(this._contenuto())) {
      if (!luogoVisibile(l, window.GS?.progressiStoria)) continue;
      if (luogoEsaurito(this.cittaId, l, window.GS?.progressiStoria)) continue;
      const d = datiLuogo(l.tipo);
      const c = this.add.container(l.x, l.y).setDepth(l.y);
      c.add(this.add.text(0, 0, d.ico, { fontSize: '44px' }).setOrigin(0.5));
      c.add(this.add.text(0, -42, l.titolo || d.titolo, {
        fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fff', fontStyle: 'bold',
        backgroundColor: d.colore + 'dd', padding: { x: 6, y: 2 },
      }).setOrigin(0.5));
      this.tweens.add({ targets: c, y: l.y - 6, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' });
      const hit = this.add.rectangle(l.x, l.y, 88, 92, 0xffffff, 0.001).setDepth(l.y + 1).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this._usaLuogo(l, c));
      this._luoghiObj.push({ l, cont: c, hit });
    }
  },

  /** Tocco su un luogo: le guardie sono le stesse di ogni altra cosa toccabile in città. */
  _usaLuogo(l, cont) {
    if (this._inDialogo || this._inOverlay || this._inTransizione || this._introInCorso) return;
    if (Math.hypot(this.pietro.x - l.x, this.pietro.y - l.y) > 170) { voce.parla('pepole:vicino'); return; }
    const azione = {
      riposo: () => this._luogoRiposo(l),
      pesca: () => this._luogoPesca(l, cont),
      regalo: () => this._luogoRegalo(l, cont),
      memoria: () => this._luogoMemoria(l),
      scavo: () => this._luogoScavo(l, cont),
      tabellone: () => this._luogoTabellone(l),
    }[l.tipo];
    if (azione) azione();
  },

  /** Premio comune a più luoghi: stelline o un oggetto, con la festicciola. */
  _premioLuogo(premio, x, y) {
    if (!premio || !window.GS) return;
    if (premio.tipo === 'oggetto') {
      window.GS.inventario = window.GS.inventario || {};
      window.GS.inventario[premio.id] = (window.GS.inventario[premio.id] || 0) + (premio.n || 1);
    } else {
      window.GS.stelline = (window.GS.stelline || 0) + (premio.n || 1);
    }
    salvaGS();
    audio.suono('stellina'); audio.suono('vittoria');
    Juice.coriandoli(this, x, y, 18);
    const testo = premio.testo || (premio.tipo === 'oggetto' ? `+${premio.n || 1} ${premio.id}! ⚪` : `+${premio.n} ⭐`);
    this._bollaCitta(x, y - 60, testo);
  },

  /** FOCOLARE — la squadra recupera tutte le energie. Gesto gentile, sempre disponibile. */
  _luogoRiposo(l) {
    this._bollaCitta(l.x, l.y - 60, l.battuta || 'Riposate pure.');
    this.time.delayedCall(600, () => {
      if (window.GS) {
        for (const m of (window.GS.team || [])) m.energia = m.energiaMax;
        salvaGS();
      }
      audio.suono('cura');
      Juice.coriandoli(this, l.x, l.y, 14);
      this._bollaCitta(l.x, l.y - 60, '💚 Squadra riposata!');
    });
  },

  /** PONTILE — getti la lenza, aspetti, e abbocca un Lumino da catturare. */
  _luogoPesca(l, cont) {
    if (this._pescaInCorso) return;
    this._pescaInCorso = true;
    this._bollaCitta(l.x, l.y - 60, l.battuta || 'Getta la lenza…');
    const attesa = 1200 + Math.floor(Math.random() * 1500);   // l'attesa fa parte del gioco
    this.time.delayedCall(attesa, () => {
      this._pescaInCorso = false;
      if (!this.scene.isActive()) return;
      const roster = (Array.isArray(l.specie) && l.specie.length) ? l.specie : (this.citta.luminiSelvatici || ['brizzo']);
      const specie = Phaser.Utils.Array.GetRandom(roster);
      audio.suono('lancio');
      Juice.coriandoli(this, l.x, l.y, 10);
      this._bollaCitta(l.x, l.y - 60, 'Abbocca qualcosa! 🎣');
      this.time.delayedCall(700, () => this._avviaBattaglia({
        avversario: specie, selvatico: true, catturabile: true,
        idSfida: 'pesca-' + this.cittaId, ritorno: 'CittaScene',
      }));
    });
  },

  /** ALBERO DEI DONI — un regalo una volta sola, poi l'albero resta lì a far ombra. */
  _luogoRegalo(l, cont) {
    this._segna(chiaveLuogo(this.cittaId, l));
    this._bollaCitta(l.x, l.y - 60, l.battuta || 'Un dono per te!');
    this._premioLuogo(l.premio || { tipo: 'stelline', n: 5 }, l.x, l.y);
    this.tweens.add({ targets: cont, alpha: 0, y: cont.y - 20, delay: 900, duration: 600, onComplete: () => cont.destroy() });
  },

  /** QUADRO DELLE LUCI — la sequenza da ripetere (riusa il quiz educativo già in casa). */
  _luogoMemoria(l) {
    this._bollaCitta(l.x, l.y - 60, l.battuta || 'Ripeti la sequenza!');
    this.time.delayedCall(700, () => this._quizSequenzaLuci(() => {
      this.controllo.abilitato = true;
      this._premioLuogo(l.premio || { tipo: 'stelline', n: 5 }, l.x, l.y);
    }));
  },

  /** CAVA — si scava qualche volta, con premi prevedibili; poi la buca finisce. */
  _luogoScavo(l, cont) {
    const chiave = chiaveLuogo(this.cittaId, l) + ':scavate';
    const volta = scavateFatte(this.cittaId, l, window.GS?.progressiStoria);
    const premio = premioScavo(volta);
    if (!premio) { this._bollaCitta(l.x, l.y - 60, 'Qui non c\'è più niente… ma è stato bello!'); return; }
    if (window.GS) {
      window.GS.progressiStoria = window.GS.progressiStoria || {};
      window.GS.progressiStoria[chiave] = volta + 1;
      salvaGS();
    }
    this.tweens.add({ targets: cont, angle: -8, yoyo: true, duration: 120, repeat: 2 });
    audio.suono('tocco');
    this.time.delayedCall(500, () => this._premioLuogo(premio, l.x, l.y));
  },

  /** TABELLONE — a che punto è il torneo: chi è già stato battuto e chi manca. */
  _luogoTabellone(l) {
    const torneo = this._torneoCitta();
    if (!torneo) { this._bollaCitta(l.x, l.y - 60, 'Il torneo non è ancora cominciato.'); return; }
    const st = statoTorneo(torneo, window.GS?.progressiStoria);
    const npcs = this._npcData || [];
    const nome = (id) => (npcs.find((n) => n.battaglia && n.battaglia.idSfida === id) || {}).nome || 'Sfidante';
    const righe = torneo.sfide.map((id) => (st.restanti.includes(id) ? '· ' : '✓ ') + nome(id));
    const coda = st.finaleSbloccato ? '\nIl Maestro ti aspetta! 🏆' : `\nTe ne mancano ${st.totale - st.vinte}.`;
    this._bollaSchermo(this.W / 2, this.H * 0.28, `🏆 Torneo ${st.vinte}/${st.totale}\n` + righe.join('\n') + coda);
    this._segnalaSfidantiTorneo(torneo);
  },

  /** F3 — Palco della Gara di Stile (se la città ospita una `gara` nel JSON). Toccandolo,
   *  se sei vicino, parte la GaraScene (competizione non-combattiva). */
  _gara() {
    const cont = this._contenuto();
    const g = cont && cont.gara;
    if (!g || !g.id) return;
    const x = g.x || 600, y = g.y || 1100;
    const c = this.add.container(x, y).setDepth(y);
    c.add(this.add.text(0, 0, '🎪', { fontSize: '46px' }).setOrigin(0.5));
    c.add(this.add.text(0, -44, '🌟 Gara di Stile!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold', backgroundColor: '#6a4cc4dd', padding: { x: 6, y: 2 },
    }).setOrigin(0.5));
    this.tweens.add({ targets: c, y: y - 6, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.inOut' });
    const hit = this.add.rectangle(x, y, 84, 88, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this._inDialogo || this._inOverlay || this._inTransizione || this._introInCorso) return;
      if (Math.hypot(this.pietro.x - x, this.pietro.y - y) > 160) { voce.parla('pepole:vicino'); return; }
      voce.stop();
      if (window.GS) { window.GS.cittaCorrente = this.cittaId; salvaGS(); }
      this.scene.start('GaraScene', { gara: g.id, ritorno: 'CittaScene' });
    });
  },

  /** #48 — Abilità esplorative attive (HM dolci): un ostacolo (masso/acqua) si
   *  supera SOLO se in squadra c'è un Lumino dell'elemento giusto, che usa la sua
   *  abilità esplorativa. Dietro c'è un piccolo tesoro. Persistito (flag). */
  /** F2 — Abilità esplorative DATA-DRIVEN: ostacoli-enigma dal JSON della città (campo
   *  `ostacoli`). Ognuno si apre col Lumino dell'ELEMENTO giusto in squadra (regole in
   *  motore/mondo.js). Toccandolo: se hai l'amico adatto si apre (animazione + premio,
   *  salvato); altrimenti indizio gentile, MAI un blocco. Se la città non ha dati ostacoli
   *  si usa il vecchio HM per-elemento (fallback bespoke). */
  _ostacoli() {
    const cont = this._contenuto();
    const lista = (cont && Array.isArray(cont.ostacoli)) ? cont.ostacoli : null;
    if (!lista || !lista.length) { this._ostacoloHM(); return; }
    this._ostacoliObj = [];
    for (const o of lista) {
      if (!o || !datiOstacolo(o.tipo)) continue;
      if (this._fatta('ostacolo:' + this.cittaId + ':' + o.id)) continue;   // già aperto
      const d = datiOstacolo(o.tipo);
      const c = this.add.container(o.x, o.y).setDepth(o.y);
      c.add(this.add.text(0, 0, d.ico, { fontSize: '44px' }).setOrigin(0.5));
      const q = this.add.text(0, -42, '?', { fontFamily: 'system-ui', fontSize: '22px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 3 }).setOrigin(0.5);
      c.add(q);
      this.tweens.add({ targets: q, y: -48, yoyo: true, repeat: -1, duration: 500 });
      const hit = this.add.rectangle(o.x, o.y, 74, 74, 0xffffff, 0.001).setDepth(o.y + 1).setInteractive({ useHandCursor: true });
      const obj = { id: o.id, tipo: o.tipo, premio: o.premio, x: o.x, y: o.y, d, cont: c, q, hit };
      hit.on('pointerdown', () => this._provaOstacolo(obj));
      this._ostacoliObj.push(obj);
    }
  },

  _ostacoloHM() {
    const el = this.citta.elemento;
    const conf = {
      roccia: { ico: '🪨', testo: 'Un masso blocca il passaggio…', azione: 'sposta il masso' },
      acqua: { ico: '🌊', testo: 'Acqua profonda da attraversare…', azione: 'attraversa l\'acqua' },
      natura: { ico: '🌿', testo: 'Rovi fitti sbarrano la via…', azione: 'apre un varco' },
      elettricita: { ico: '🔌', testo: 'Un cancello spento e bloccato…', azione: 'dà corrente' },
    }[el];
    if (!conf) return;
    if (this._fatta('hm:' + this.cittaId)) return;
    const x = W - 150, y = 360;
    const c = this.add.container(x, y).setDepth(y);
    c.add(this.add.text(0, 0, conf.ico, { fontSize: '46px' }).setOrigin(0.5));
    c.add(this.add.text(0, 34, '?', { fontFamily: 'system-ui', fontSize: '22px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
    this._hm = { x, y, el, conf, obj: c, fatto: false };
  },

  _provaOstacolo(obj) {
    if (this._inDialogo || this._inOverlay || this._inTransizione || this._introInCorso) return;
    if (Math.hypot(this.pietro.x - obj.x, this.pietro.y - obj.y) > 150) { voce.parla('pepole:vicino'); return; }
    const squadra = ((window.GS && window.GS.team) || []).map((l) => ({ specie: l.specie, elemento: LUMINI[l.specie] && LUMINI[l.specie].elemento }));
    const aiut = aiutantePerOstacolo(obj.tipo, squadra);
    if (!aiut) {
      this._bollaSchermo(this.W / 2, this.H * 0.2, 'Serve un amico di ' + (NOME_ELEMENTO[obj.tipo] || obj.tipo) + '!\n' + obj.d.testo);
      return;
    }
    // Si apre: l'amico usa la sua abilità esplorativa.
    this._segna('ostacolo:' + this.cittaId + ':' + obj.id);
    const base = LUMINI[aiut.specie] || {};
    const ab = (base.abilitaEsplorativa && base.abilitaEsplorativa.nome) || 'la sua abilità';
    audio.suono('mossaSpeciale'); audio.suono('vittoria');
    Juice.coriandoli(this, obj.x, obj.y, 22);
    obj.hit.destroy();
    this.tweens.add({ targets: obj.cont, alpha: 0, scale: 0.4, duration: 600, onComplete: () => obj.cont.destroy() });
    const msg = this.add.text(obj.x, obj.y - 56, `${base.nome} usa ${ab}!\n${obj.d.azione}.`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', backgroundColor: '#2c7a33dd', padding: { x: 8, y: 4 }, align: 'center', wordWrap: { width: 240 },
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({ targets: msg, y: msg.y - 24, alpha: 0, delay: 1200, duration: 800, onComplete: () => msg.destroy() });
    this._premioOstacolo(obj.premio, obj.x, obj.y);
  },

  /** #64 — Evento gentile casuale: un Lumino smarrito da riportare a casa (grazie + stelline). */
  _eventoCasuale() {
    if (Math.random() > 0.35) return;   // non sempre: è una sorpresa
    const specie = (this.citta.luminiSelvatici && Phaser.Utils.Array.GetRandom(this.citta.luminiSelvatici)) || 'brizzo';
    const x = W * (0.3 + Math.random() * 0.4), y = H * (0.5 + Math.random() * 0.2);
    const lum = new Lumino(this, x, y, specie).setScale(0.55).setDepth(y);
    const ex = this.add.text(x, y - 50, '❓', { fontSize: '24px' }).setOrigin(0.5).setDepth(y + 1);
    this.tweens.add({ targets: ex, y: y - 58, yoyo: true, repeat: -1, duration: 500 });
    this.tweens.add({ targets: lum, x: x + (Math.random() > 0.5 ? 40 : -40), yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.inOut' });
    this._eventoLumino = { x, y, lum, ex, preso: false };
  },
};
