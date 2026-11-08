/* QuizScene — mini-gioco educativo a pop-up (overlay), bello e avvincente.
 *
 * Stile "libro illustrato" caldo (pergamena + legno) coerente col gioco, NON il
 * vecchio riquadro verde piatto. Pensato per bambini 6-8 che leggono poco:
 * domande VISIVE (conta / somma illustrata / quale gruppo è di più), Pepole che
 * fa il tifo, feedback gioioso, zero punizioni. Le risposte TESTUALI (es. dal
 * pool Groq) sono impaginate in pulsanti a tutta larghezza, in colonna, con testo
 * a capo → niente più scritte accavallate.
 *
 * Uso (overlay):
 *   const q = this.scene.get('QuizScene'); q._onFine = () => {...};
 *   this.scene.pause(); this.scene.launch('QuizScene', { parent: this.scene.key, forza, totale });
 *
 * data.forza = { tipo:'conta', n:5, tema:'lumini' }  → domanda imposta (coerente
 *   con la regia: Nonna "conta i Lumini" mostra N Lumini, la risposta è N).
 * data.totale = numero di domande (default 3; le forzate scriptate usano 1).
 */

import audio from '../../audio.js';
import * as Juice from '../juice.js';
import { salvaGS } from '../../gs.js';
import { testoGrande } from '../ui.js';

const COLORI = [0xff8a3c, 0x3aa6e0, 0x57c15a, 0xc18cff, 0xffd23f, 0xff6f9c];
const BORDO = 0x4a3322;          // marrone scuro per bordi/contorni
const CREMA = 0xfff6e3;          // pergamena
const LUMINI_TEX = ['lum-fiammino', 'lum-guscetto', 'lum-foglino'];

export class QuizScene extends Phaser.Scene {
  constructor() { super('QuizScene'); }
  init(data) {
    this.parent = (data && data.parent) || null;
    this._forza = (data && data.forza) || null;
    this._totale = (data && data.totale) || (this._forza ? 1 : 3);
    this._fatte = 0;
    this._tentativi = 0;
    this._chiuso = false;
  }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.px = W / 2; this.py = H / 2;
    this.cameras.main.setBackgroundColor('rgba(20,14,30,0.62)');

    // --- Pannello pergamena -------------------------------------------------
    // Schermo BASSO (telefono in orizzontale): il pannello si allarga invece di
    // restare stretto e schiacciato → icone in una riga e pulsanti che ci stanno.
    this._corto = H < 520;
    const pw = this._corto ? Math.min(640, W * 0.9) : Math.min(460, W * 0.94);
    const ph = this._corto ? H * 0.94 : Math.min(600, H * 0.9);
    this._pw = pw; this._ph = ph;
    this._top = this.py - ph / 2;
    const L = this.px - pw / 2, T = this._top;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(L + 6, T + 10, pw, ph, 26);   // ombra
    g.fillStyle(BORDO, 1); g.fillRoundedRect(L - 5, T - 5, pw + 10, ph + 10, 30); // cornice legno
    g.fillStyle(CREMA, 1); g.fillRoundedRect(L, T, pw, ph, 26);                   // carta
    g.lineStyle(3, 0xe8d3a8, 1); g.strokeRoundedRect(L + 6, T + 6, pw - 12, ph - 12, 20);

    // --- Festone intestazione ----------------------------------------------
    const bw = pw * 0.7, bh = this._corto ? 36 : 46, by = T + (this._corto ? 12 : 22);
    g.fillStyle(0xff8a3c, 1); g.fillRoundedRect(this.px - bw / 2, by, bw, bh, 14);
    g.lineStyle(3, BORDO, 1); g.strokeRoundedRect(this.px - bw / 2, by, bw, bh, 14);
    this.add.text(this.px, by + bh / 2, '🌟 Quiz dei Lumini 🌟', {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#fff', fontStyle: 'bold', stroke: '#7a3d12', strokeThickness: 3,
    }).setOrigin(0.5);

    // --- Pepole mascotte (tifo) in basso a sinistra del pannello ------------
    // (Su schermo basso sta in ALTO a sinistra, accanto al festone: in basso copriva
    // il bordo dei pulsanti-risposta.)
    const mx = L + 30, myy = this._corto ? T + 58 : T + ph - 30;
    if (this.textures.exists('pepole-incoraggia') || this.textures.exists('pepole')) {
      const key = this.textures.exists('pepole-incoraggia') ? 'pepole-incoraggia' : 'pepole';
      this.pepole = this.add.image(mx, myy, key).setOrigin(0.5, 1);
      this.pepole.setScale((this._corto ? 50 : 64) / this.pepole.height);
      this.tweens.add({ targets: this.pepole, y: myy - 5, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    } else {
      this.pepole = this.add.text(mx, myy, '🐶', { fontSize: '40px' }).setOrigin(0.5, 1);
    }

    this._contentTop = by + bh + 14;        // sotto il festone
    this.domanda = this._genera();
    this._mostra();
    this._failsafeSalta();
  }

  /** #3 — via d'uscita di sicurezza: un piccolo "salta ▸" appare dopo qualche
   *  secondo, così il quiz non può MAI bloccare il gioco (pool malformato, ecc.).
   *  Discreto, in alto a destra del pannello: i bambini lo ignorano, è una rete. */
  _failsafeSalta() {
    this.time.delayedCall(8000, () => {
      if (this._chiuso || !this.scene || !this.scene.isActive()) return;
      const x = this.px + this._pw / 2 - 8, y = this._top + 6;
      const t = this.add.text(x, y, 'salta ▸', {
        fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#b89a6a', fontStyle: 'bold',
      }).setOrigin(1, 0).setDepth(50);
      const hit = this.add.rectangle(x - 22, y + 10, 80, 32, 0xffffff, 0.001).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { audio.suono('tocco'); this._fine(); });
    });
  }

  // --- Generazione domanda -------------------------------------------------
  _genera() {
    if (this._forza) return this._domForzata(this._forza);
    // Pool dinamico (Groq) se ben formato. #3 — validazione robusta: testo non
    // vuoto, ≥2 opzioni con label non vuote, ESATTAMENTE/ALMENO una corretta.
    // Se malformato, si scende al quiz locale (mai un quiz senza via d'uscita).
    const pool = (window.GS && Array.isArray(window.GS.quizPool)) ? window.GS.quizPool : null;
    if (pool && pool.length) {
      const d = pool[Math.floor(Math.random() * pool.length)];
      if (d && typeof d.testo === 'string' && d.testo.trim() && Array.isArray(d.opzioni)) {
        const opz = d.opzioni
          .filter((o) => o && o.label != null && String(o.label).trim())
          .map((o) => ({ label: String(o.label).trim(), corretta: !!o.corretta }));
        if (opz.length >= 2 && opz.some((o) => o.corretta)) {
          return { testo: d.testo.trim(), opzioni: opz, testuale: true };
        }
      }
    }
    // Quiz DIDATTICO graduato per ETÀ (no "asilo": aritmetica + vocabolario/lessico).
    //  6 anni: addizioni/sottrazioni entro 10, leggere parole, lettera mancante.
    //  7 anni: + addizioni a due cifre, sinonimi, intruso (categorie), completa.
    //  8 anni: + sottrazioni a due cifre, moltiplicazioni, sinonimi/contrari, lessico.
    const eta = this._eta();
    let tipi;
    if (eta <= 6) tipi = ['somma', 'sottrazione', 'conta', 'parola', 'completa'];
    else if (eta === 7) tipi = ['somma', 'sottrazione', 'sommaGrande', 'parola', 'completa', 'sinonimo', 'intruso'];
    else tipi = ['sommaGrande', 'sottrazioneGrande', 'moltiplica', 'completa', 'sinonimo', 'contrario', 'intruso'];
    const tipo = tipi[Math.floor(Math.random() * tipi.length)];
    switch (tipo) {
      case 'conta': return this._domConta();
      case 'somma': return this._domSomma();
      case 'sottrazione': return this._domSottrazione();
      case 'sommaGrande': return this._domSommaGrande();
      case 'sottrazioneGrande': return this._domSottrazioneGrande();
      case 'moltiplica': return this._domMoltiplica();
      case 'piugrande': return this._domPiuGrande();
      case 'sequenza': return this._domSequenza();
      case 'parola': return this._domParola();
      case 'completa': return this._domCompleta();
      case 'sinonimo': return this._domSinonimo();
      case 'contrario': return this._domContrario();
      case 'intruso': return this._domIntruso();
      default: return this._domSomma();
    }
  }

  /** Età del bambino dal profilo (per la graduazione, #52). Default 7. */
  _eta() { const e = window.GS && window.GS.profilo && window.GS.profilo.eta; return Math.max(6, Math.min(8, Number(e) || 7)); }

  /** Opzioni TESTUALI mischiate da una lista [{label,corretta}]. */
  _mescola(arr) { return arr.slice().sort(() => Math.random() - 0.5); }
  _opzDa(giusto, distrattori) {
    const opz = [{ label: String(giusto), corretta: true }, ...distrattori.map((d) => ({ label: String(d), corretta: false }))];
    return this._mescola(opz);
  }

  _domForzata(f) {
    const n = f.n || (2 + Math.floor(Math.random() * 7));
    if (f.tipo === 'sequenza') return this._domSequenza();   // #51 — Rik: le luci in sequenza
    if (f.tipo === 'conta') {
      const tema = ['lumini', 'gocce', 'fiori', 'stelle'].includes(f.tema) ? f.tema : 'stelle';
      const testo = tema === 'lumini' ? 'Quanti Lumini vedi nel giardino?'
        : tema === 'gocce' ? 'Quante bracciate servono? Conta!'
          : tema === 'fiori' ? 'Conta i fiori: quanti aprono il ponte?'
            : 'Quante stelline vedi?';
      return { testo, icone: n, tema, opzioni: this._opzNum(n, n + 3) };
    }
    return this._domConta();
  }

  _opzNum(giusto, max) {
    // Distrattori vicini al valore giusto e dentro [1, giusto+3] (niente numeri
    // assurdi). `max` indicativo; garantiamo sempre 3 opzioni distinte.
    const hi = Math.max(max || 0, giusto + 3);
    const set = new Set([giusto]);
    let guard = 0;
    while (set.size < 3 && guard++ < 60) {
      const v = giusto + (Math.floor(Math.random() * 7) - 3);   // ±3
      if (v >= 1 && v <= hi && v !== giusto) set.add(v);
    }
    let extra = 1;
    while (set.size < 3) { const v = giusto + extra <= hi ? giusto + extra : Math.max(1, giusto - extra); set.add(v); extra++; }
    return [...set].sort(() => Math.random() - 0.5).map((v) => ({ label: String(v), corretta: v === giusto }));
  }

  _domConta() {
    const n = 2 + Math.floor(Math.random() * 7);
    return { testo: 'Quante stelline vedi?', icone: n, tema: 'stelle', opzioni: this._opzNum(n, 9) };
  }
  _domSomma() {
    const a = 1 + Math.floor(Math.random() * 4), b = 1 + Math.floor(Math.random() * 4);
    return { testo: `Quanto fa ${a} + ${b}?`, iconeDue: [a, b], opzioni: this._opzNum(a + b, 9) };
  }
  _domPiuGrande() {
    let a = 2 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 6);
    if (a === b) b += 1;
    return { testo: 'Quale gruppo ha PIÙ stelline?', gruppi: [a, b], scegliGruppo: a > b ? 0 : 1 };
  }

  // --- Matematica graduata (#52) — materia: numeri -------------------------
  _domSottrazione() {
    const a = 3 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * a);
    return { testo: `Quanto fa ${a} - ${b}?`, opzioni: this._opzNum(a - b, a), materia: 'numeri' };
  }
  _domSommaGrande() {
    const a = 10 + Math.floor(Math.random() * 20), b = 2 + Math.floor(Math.random() * 14);
    return { testo: `Quanto fa ${a} + ${b}?`, opzioni: this._opzNum(a + b, a + b + 5), materia: 'numeri' };
  }
  _domSottrazioneGrande() {
    const a = 15 + Math.floor(Math.random() * 20), b = 2 + Math.floor(Math.random() * 12);
    return { testo: `Quanto fa ${a} - ${b}?`, opzioni: this._opzNum(a - b, a), materia: 'numeri' };
  }
  _domMoltiplica() {
    const a = 2 + Math.floor(Math.random() * 4), b = 2 + Math.floor(Math.random() * 4);
    return { testo: `Quanto fa ${a} × ${b}?`, opzioni: this._opzNum(a * b, a * b + 6), materia: 'numeri' };
  }

  // --- Materia: colori e forme (#54) --------------------------------------
  _domColore() {
    const cose = [
      { q: '🍓', col: 'rosso', altri: ['🫐', '🥬'] },
      { q: '🍋', col: 'giallo', altri: ['🍆', '🍊'] },
      { q: '🫐', col: 'blu', altri: ['🍓', '🌽'] },
      { q: '🥬', col: 'verde', altri: ['🍅', '🍇'] },
      { q: '🍊', col: 'arancione', altri: ['🍏', '🍇'] },
    ];
    const c = cose[Math.floor(Math.random() * cose.length)];
    return { testo: `Di che colore è ${c.q}?`, materia: 'logica',
      opzioni: this._mescola([{ label: c.col, corretta: true }, ...c.altri.map((x, i) => ({ label: ['rosso', 'blu', 'verde', 'giallo', 'viola', 'rosa'].filter((k) => k !== c.col)[i], corretta: false }))]).slice(0, 3) };
  }
  _domForma() {
    const forme = [['⚪', 'cerchio'], ['🔺', 'triangolo'], ['🟦', 'quadrato'], ['⭐', 'stella']];
    const i = Math.floor(Math.random() * forme.length);
    const giusto = forme[i];
    const altri = forme.filter((_, k) => k !== i).slice(0, 2);
    return { testo: `Tocca il ${giusto[1].toUpperCase()}`, materia: 'logica',
      opzioni: this._mescola([{ label: giusto[0], corretta: true }, ...altri.map((f) => ({ label: f[0], corretta: false }))]) };
  }

  // --- Materia: logica (sequenze, associazioni, #54) ----------------------
  _domSequenza() {
    const coppie = [['🔴', '🔵'], ['🟢', '🟡'], ['⭐', '🌙'], ['🍎', '🍐']];
    const [x, y] = coppie[Math.floor(Math.random() * coppie.length)];
    const next = Math.random() < 0.5 ? x : y;
    const seq = next === x ? `${x}${y}${x}${y} ❓` : `${y}${x}${y}${x} ❓`;
    const altro = next === x ? y : x;
    return { testo: `Cosa viene dopo?  ${seq}`, materia: 'logica',
      opzioni: this._mescola([{ label: next, corretta: true }, { label: altro, corretta: false }, { label: '🟣', corretta: false }]) };
  }
  _domAssociazione() {
    const ass = [
      { q: '🐶', giusto: '🦴', altri: ['🌧️', '🚗'] },
      { q: '🐝', giusto: '🌸', altri: ['📚', '🥾'] },
      { q: '🐟', giusto: '💧', altri: ['🔥', '🪨'] },
      { q: '☀️', giusto: '😎', altri: ['☂️', '🧣'] },
      { q: '🐰', giusto: '🥕', altri: ['🍖', '🍫'] },
    ];
    const a = ass[Math.floor(Math.random() * ass.length)];
    return { testo: `Cosa va insieme a ${a.q}?`, materia: 'logica',
      opzioni: this._mescola([{ label: a.giusto, corretta: true }, ...a.altri.map((x) => ({ label: x, corretta: false }))]) };
  }

  // --- Materia: parole / lettura (#53) ------------------------------------
  _domParola() {
    const parole = [['CASA', '🏠'], ['CANE', '🐶'], ['SOLE', '☀️'], ['MARE', '🌊'], ['FIORE', '🌸'], ['GATTO', '🐱'], ['ALBERO', '🌳']];
    const i = Math.floor(Math.random() * parole.length);
    const [parola, emo] = parole[i];
    const altre = this._mescola(parole.filter((_, k) => k !== i)).slice(0, 2).map((p) => p[0]);
    return { testo: `Tocca la parola giusta:  ${emo}`, materia: 'parole',
      opzioni: this._mescola([{ label: parola, corretta: true }, ...altre.map((p) => ({ label: p, corretta: false }))]) };
  }
  _domCompleta() {
    const parole = [['CASA', 'CA_A', 'S'], ['SOLE', 'SO_E', 'L'], ['MARE', 'MA_E', 'R'], ['LUNA', 'LU_A', 'N'], ['FIORE', 'FIO_E', 'R'], ['SCUOLA', 'SCUO_A', 'L'], ['LIBRO', 'LI_RO', 'B']];
    const p = parole[Math.floor(Math.random() * parole.length)];
    const lettere = ['S', 'L', 'R', 'N', 'M', 'T', 'B', 'P'].filter((x) => x !== p[2]);
    return { testo: `Completa la parola:  ${p[1]}`, materia: 'parole',
      opzioni: this._mescola([{ label: p[2], corretta: true }, { label: lettere[0], corretta: false }, { label: lettere[1], corretta: false }]) };
  }

  // --- Vocabolario / lessico (didattico, non "asilo") ----------------------
  _domSinonimo() {
    const set = [
      { p: 'felice', giusto: 'contento', altri: ['stanco', 'lento'] },
      { p: 'veloce', giusto: 'rapido', altri: ['piccolo', 'triste'] },
      { p: 'grande', giusto: 'enorme', altri: ['corto', 'magro'] },
      { p: 'bello', giusto: 'carino', altri: ['duro', 'vuoto'] },
      { p: 'iniziare', giusto: 'cominciare', altri: ['finire', 'dormire'] },
      { p: 'parlare', giusto: 'dire', altri: ['correre', 'mangiare'] },
      { p: 'casa', giusto: 'abitazione', altri: ['strada', 'giardino'] },
    ];
    const s = set[Math.floor(Math.random() * set.length)];
    return { testo: `Quale vuol dire come «${s.p}»?`, materia: 'parole',
      opzioni: this._mescola([{ label: s.giusto, corretta: true }, ...s.altri.map((x) => ({ label: x, corretta: false }))]) };
  }
  _domContrario() {
    const set = [
      { p: 'grande', giusto: 'piccolo', altri: ['alto', 'largo'] },
      { p: 'caldo', giusto: 'freddo', altri: ['molle', 'pieno'] },
      { p: 'giorno', giusto: 'notte', altri: ['sera', 'ora'] },
      { p: 'aperto', giusto: 'chiuso', altri: ['rotto', 'nuovo'] },
      { p: 'felice', giusto: 'triste', altri: ['stanco', 'sazio'] },
      { p: 'veloce', giusto: 'lento', altri: ['forte', 'leggero'] },
      { p: 'pieno', giusto: 'vuoto', altri: ['pesante', 'liscio'] },
    ];
    const s = set[Math.floor(Math.random() * set.length)];
    return { testo: `Il contrario di «${s.p}» è…`, materia: 'parole',
      opzioni: this._mescola([{ label: s.giusto, corretta: true }, ...s.altri.map((x) => ({ label: x, corretta: false }))]) };
  }
  _domIntruso() {
    const set = [
      { cat: 'un animale', dentro: ['cane', 'gatto', 'cavallo'], fuori: 'tavolo' },
      { cat: 'un frutto', dentro: ['mela', 'pera', 'banana'], fuori: 'sedia' },
      { cat: 'un colore', dentro: ['rosso', 'verde', 'blu'], fuori: 'otto' },
      { cat: 'un numero', dentro: ['tre', 'sette', 'dieci'], fuori: 'cane' },
      { cat: 'una parte del corpo', dentro: ['mano', 'piede', 'naso'], fuori: 'pane' },
    ];
    const s = set[Math.floor(Math.random() * set.length)];
    const dueDentro = this._mescola(s.dentro).slice(0, 2);
    return { testo: `Quale NON è ${s.cat}?`, materia: 'logica',
      opzioni: this._mescola([{ label: s.fuori, corretta: true }, ...dueDentro.map((x) => ({ label: x, corretta: false }))]) };
  }

  // --- Render --------------------------------------------------------------
  _mostra() {
    if (this._zona) this._zona.forEach((o) => o.destroy());
    this._zona = [];
    this._pulsanti = [];
    this._btnCorretto = null;   // #55 — riferimento alla risposta giusta (per rivelarla)
    this._rivelato = false;
    const d = this.domanda;
    const add = (o) => { this._zona.push(o); return o; };

    // Pallini di progresso (stelle piene = già fatte).
    for (let i = 0; i < this._totale; i++) {
      const px = this.px + (i - (this._totale - 1) / 2) * 24;
      const fatta = i < this._fatte;
      add(this.add.star(px, this._contentTop + 6, 5, 5, 10, fatta ? 0xffd23f : 0xd8c6a2).setStrokeStyle(2, BORDO));
    }

    // Testo domanda (#78 — Testo grande).
    add(this.add.text(this.px, this._contentTop + 34, d.testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: (testoGrande() ? 27 : 22) + 'px', color: '#4a3322', fontStyle: 'bold',
      align: 'center', wordWrap: { width: this._pw - 56 },
    }).setOrigin(0.5, 0));

    const qBottom = this._contentTop + 34 + this._stimaAltezzaTesto(d.testo);
    const areaBottom = this._top + this._ph - 28;

    // conta/somma hanno icone → render numerico con disegni; le altre (matematica
    // a cifre, colori/forme/sequenze/parole) vanno a pulsanti pieni in colonna.
    if (d.gruppi) { this._renderGruppi(d, add, qBottom, areaBottom); }
    else if (d.testuale || (!d.icone && !d.iconeDue)) { this._renderTestuale(d, add, qBottom, areaBottom); }
    else { this._renderNumerica(d, add, qBottom, areaBottom); }

    this._feedback = add(this.add.text(this.px, areaBottom - 2, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#e0742a', fontStyle: 'bold',
    }).setOrigin(0.5, 1));
  }

  _stimaAltezzaTesto(t) {
    const perRiga = Math.floor((this._pw - 56) / 12);
    const righe = Math.max(1, Math.ceil(t.length / Math.max(8, perRiga)));
    return righe * 28;
  }

  // Domanda con icone (conta/somma) + pulsanti numerici in riga.
  _renderNumerica(d, add, qBottom, areaBottom) {
    const opt = d.opzioni;
    const bhN = this._corto ? 54 : 66;
    const byBtn = areaBottom - 4 - bhN / 2;     // riga pulsanti in basso
    // Le icone DEVONO restare contabili anche col pannello basso (telefono in
    // orizzontale): stanno nella banda tra domanda e pulsanti, con una scala che
    // tiene conto sia dell'altezza sia della larghezza (prima la 2ª riga di fiori
    // finiva sopra i pulsanti).
    const bTop = qBottom + 4, bBot = byBtn - bhN / 2 - 8;
    const banda = Math.max(30, bBot - bTop);
    const iconCY = (bTop + bBot) / 2;
    const larg = (n, quote) => (this._pw - 60) * quote;
    const perRigaDi = (n) => (this._corto && n <= 6 ? n : Math.min(n, 4));
    const scalaPer = (n, quote = 1) => {
      const pr = perRigaDi(n), righe = Math.ceil(n / pr);
      return Math.max(0.4, Math.min(1, banda / (righe * 70), larg(n, quote) / (pr * 70)));
    };

    if (d.icone) this._icone(d.icone, this.px, iconCY, d.tema, add, scalaPer(d.icone), perRigaDi(d.icone));
    else if (d.iconeDue) {
      const nMax = Math.max(d.iconeDue[0], d.iconeDue[1]);
      const sc = Math.min(0.9, scalaPer(nMax, 0.42));
      this._icone(d.iconeDue[0], this.px - this._pw * 0.24, iconCY, 'arancio', add, sc, perRigaDi(nMax));
      add(this.add.text(this.px, iconCY, '+', { fontFamily: 'system-ui, sans-serif', fontSize: '38px', color: '#4a3322', fontStyle: 'bold' }).setOrigin(0.5));
      this._icone(d.iconeDue[1], this.px + this._pw * 0.24, iconCY, 'azzurro', add, sc, perRigaDi(nMax));
    }

    const bw = Math.min(108, (this._pw - 44) / opt.length - 10);
    opt.forEach((o, i) => {
      const ox = this.px + (i - (opt.length - 1) / 2) * (bw + 14);
      const b = this._pulsante(ox, byBtn, bw, bhN, COLORI[i % COLORI.length], o.label, 30, add);
      if (o.corretta) this._btnCorretto = b;
      b.on('pointerdown', () => this._rispondi(!!o.corretta, b));
    });
  }

  // Risposte TESTUALI (Groq): pulsanti a tutta larghezza, in colonna.
  _renderTestuale(d, add, qBottom, areaBottom) {
    const opt = d.opzioni;
    // In fondo restano ~30px per il messaggio ("Bravissimo!", "Evviva! Finito!"):
    // prima l'altezza minima di 54px faceva traboccare i pulsanti sul messaggio.
    const gap = this._corto ? 8 : 12;
    const spazio = areaBottom - 30 - (qBottom + 10);
    const bh = Math.max(34, Math.min(74, spazio / opt.length - gap));
    const totH = opt.length * bh + (opt.length - 1) * gap;
    let y = (qBottom + 10) + Math.max(0, (spazio - totH) / 2) + bh / 2;
    const bw = this._pw - 64;
    opt.forEach((o, i) => {
      const b = this._pulsante(this.px, y, bw, bh, COLORI[i % COLORI.length], o.label, 21, add);
      if (o.corretta) this._btnCorretto = b;
      b.on('pointerdown', () => this._rispondi(!!o.corretta, b));
      y += bh + gap;
    });
  }

  // "Quale gruppo è di più": due riquadri toccabili.
  _renderGruppi(d, add, qBottom, areaBottom) {
    const cy = (qBottom + areaBottom) / 2 - 10;
    const boxW = this._pw * 0.4, boxH = Math.min(this._ph * 0.32, areaBottom - qBottom - 30);
    [0, 1].forEach((gi) => {
      const gx = this.px + (gi === 0 ? -1 : 1) * this._pw * 0.22;
      const b = this._pulsante(gx, cy, boxW, boxH, gi === 0 ? 0xff8a3c : 0x3aa6e0, '', 0, add);
      this._icone(d.gruppi[gi], gx, cy, gi === 0 ? 'arancio' : 'azzurro', add, 0.7);
      if (gi === d.scegliGruppo) this._btnCorretto = b;
      b.on('pointerdown', () => this._rispondi(gi === d.scegliGruppo, b));
    });
  }

  // --- Pulsante riutilizzabile (visuale in container + BERSAGLIO a rettangolo) -
  // Il bersaglio interattivo è un rettangolo semplice (area = disegno): tap esatto,
  // niente più aree cliccabili sfasate dei container con hit-area personalizzata.
  _pulsante(x, y, w, h, colore, testo, fs, add) {
    const vis = this.add.container(x, y);
    const g = this.add.graphics();
    this._disegna(g, w, h, colore);
    vis.add(g);
    if (testo) {
      vis.add(this.add.text(0, 0, testo, {
        fontFamily: 'system-ui, sans-serif', fontSize: fs + 'px', color: '#fff', fontStyle: 'bold',
        stroke: '#3a2c22', strokeThickness: 4, align: 'center', wordWrap: { width: w - 22 },
      }).setOrigin(0.5));
    }
    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit._g = g; hit._w = w; hit._h = h; hit._vis = vis;
    hit.on('pointerover', () => { if (!this._chiuso) vis.setScale(1.04); });
    hit.on('pointerout', () => vis.setScale(1));
    add(vis); add(hit);
    this._pulsanti.push(hit);
    return hit;
  }

  _disegna(g, w, h, colore) {
    g.clear();
    g.fillStyle(0x000000, 0.16); g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 16);
    g.fillStyle(colore, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(3, BORDO, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.fillStyle(0xffffff, 0.22); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h * 0.38, 12);
  }

  _coloraPulsante(c, colore) { this._disegna(c._g, c._w, c._h, colore); }

  // Disegna N icone (stelle, Lumini, gocce) con pop animato, su griglia.
  _icone(n, cx, cy, tema, add, scala = 1, perRigaMax = 4) {
    const perRiga = Math.min(n, perRigaMax);
    const sp = 70 * scala;
    const righe = Math.ceil(n / perRiga);
    let k = 0;
    for (let r = 0; r < righe; r++) {
      const inRiga = Math.min(perRiga, n - r * perRiga);
      for (let c2 = 0; c2 < inRiga; c2++) {
        const x = cx + (c2 - (inRiga - 1) / 2) * sp;
        const y = cy + (r - (righe - 1) / 2) * sp;
        const o = this._unaIcona(x, y, tema, scala, k);
        add(o);
        o.setScale(0); this.tweens.add({ targets: o, scale: (o._scalaBase || 1), duration: 260, delay: k * 55, ease: 'Back.out' });
        k++;
      }
    }
  }

  _unaIcona(x, y, tema, scala, k) {
    if (tema === 'lumini') {
      const tex = LUMINI_TEX.filter((t) => this.textures.exists(t));
      if (tex.length) {
        const img = this.add.image(x, y, tex[k % tex.length]);
        img._scalaBase = 64 / (img.height || 64) * scala;   // ~64px alti, ben visibili
        return img;
      }
      return this.add.star(x, y, 5, 12 * scala, 24 * scala, 0x57c15a).setStrokeStyle(3, BORDO);
    }
    if (tema === 'gocce') {
      return this.add.circle(x, y, 17 * scala, 0x3aa6e0).setStrokeStyle(3, 0x1c6f9c);
    }
    if (tema === 'fiori') {
      const t = this.add.text(x, y, '🌸', { fontSize: Math.round(34 * scala) + 'px' }).setOrigin(0.5);
      t._scalaBase = 1; return t;
    }
    const colore = tema === 'arancio' ? 0xff8a3c : tema === 'azzurro' ? 0x3aa6e0 : 0xffd23f;
    return this.add.star(x, y, 5, 11 * scala, 22 * scala, colore).setStrokeStyle(3, 0x8a4b1e);
  }

  // --- Risposta ------------------------------------------------------------
  _rispondi(corretta, btn) {
    if (this._chiuso) return;
    this.tweens.add({ targets: btn._vis || btn, scaleX: 1.12, scaleY: 1.12, duration: 90, yoyo: true });
    if (corretta) {
      this._chiuso = true;
      this._fatte++;
      this._coloraPulsante(btn, 0x37c24a);
      this._pulsanti.forEach((b) => b !== btn && b.disableInteractive && b.disableInteractive());
      audio.suono('stellina'); audio.suono('vittoria');
      const ultima = this._fatte >= this._totale;
      this._feedback.setText(ultima ? 'Evviva! Finito! 🌟' : 'Bravissimo! 🌟').setColor('#2e9e46');
      Juice.coriandoli(this, this.px, this.py - 30, ultima ? 40 : 24);
      Juice.premioStella(this, btn.x, btn.y - 30);
      if (this.pepole && this.pepole.setTexture && this.textures.exists('pepole-felice')) this.pepole.setTexture('pepole-felice');
      if (this.pepole) this.tweens.add({ targets: this.pepole, y: this.pepole.y - 16, yoyo: true, duration: 220, ease: 'Quad.out' });
      if (window.GS) window.GS.stelline = (window.GS.stelline || 0) + 1;
      this._premiaMateria(this.domanda && this.domanda.materia);   // #56 — sticker-traguardi
      this.time.delayedCall(1150, () => {
        if (ultima) { this._fine(); return; }
        this._chiuso = false; this._tentativi = 0;
        this.domanda = this._genera();
        this._mostra();
      });
    } else {
      this._tentativi++;
      this._coloraPulsante(btn, 0xe0563f);
      this.time.delayedCall(450, () => { if (!this._chiuso) this._coloraPulsante(btn, COLORI[0]); });
      this.cameras.main.shake(150, 0.004);
      audio.suono('colpito');
      // #55 — feedback gentile: MAI "sbagliato". Dal 2° tentativo Pepole MOSTRA la
      // risposta giusta (pulsa in verde) e si riprova con calma — niente punizione.
      if (this._tentativi >= 2 && this._btnCorretto && !this._rivelato) {
        this._rivelato = true;
        this._feedback.setText('Guarda, è questa! 🌟 Riprova 😊').setColor('#2e9e46');
        const bc = this._btnCorretto;
        this._coloraPulsante(bc, 0x37c24a);
        this.tweens.add({ targets: bc._vis || bc, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: 3, duration: 280 });
      } else {
        this._feedback.setText('Ops! Riprova 🙂').setColor('#e0742a');
      }
    }
  }

  /** #56 — Mini-traguardi: conta le risposte giuste per materia e sblocca sticker
   *  ("Mago dei Numeri", "Esploratore di Parole", "Detective della Logica"). */
  _premiaMateria(materia) {
    const m = materia || 'numeri';
    const g = window.GS; if (!g) return;
    g.progressoEducativo = g.progressoEducativo || { numeri: 0, parole: 0, logica: 0, stickers: [] };
    const pe = g.progressoEducativo;
    pe[m] = (pe[m] || 0) + 1;
    pe.stickers = pe.stickers || [];
    const traguardi = {
      numeri: { soglia: 10, id: 'mago-numeri', nome: '🔢 Mago dei Numeri' },
      parole: { soglia: 10, id: 'esploratore-parole', nome: '📖 Esploratore di Parole' },
      logica: { soglia: 8, id: 'detective-logica', nome: '🧩 Detective della Logica' },
    };
    const t = traguardi[m];
    if (t && pe[m] >= t.soglia && !pe.stickers.includes(t.id)) {
      pe.stickers.push(t.id);
      try { salvaGS(); } catch { /* niente */ }
      this._stickerToast(t.nome);
    } else {
      try { salvaGS(); } catch { /* niente */ }
    }
  }

  _stickerToast(nome) {
    const t = this.add.text(this.px, this._top + this._ph - 70, 'NUOVO STICKER!\n' + nome, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold', align: 'center',
      backgroundColor: '#c79a1eee', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(80).setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 24, delay: 1600, duration: 500, onComplete: () => t.destroy() });
    Juice.coriandoli(this, this.px, this._top + this._ph - 90, 26);
  }

  _fine() {
    const cb = this._onFine;
    this.scene.stop();
    if (this.parent) this.scene.resume(this.parent);
    if (typeof cb === 'function') cb();
  }
}
