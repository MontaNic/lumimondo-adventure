/* BattagliaScene — la scena più importante (P1-06 layout + P1-07 effetti).
 *
 * Deve sembrare un vero GDR a turni, non un form HTML: ogni mossa ha ≥3 elementi animati
 * simultanei (proiettile/effetto + reazione del bersaglio + numeri). Usa il
 * motore puro `battaglia.js` (turni, IA, cap cure 2/sfida) + pity invisibile.
 *
 * Demo: index.html?demo=battaglia
 */

import { creaBattaglia, SPECIE_PRISMA } from '../../battaglia.js';
import { LUMINI, possiediLinea } from '../../lumini-data.js';
import { Lumino } from '../lumino.js';
import { Pepole } from '../pepole-actor.js';
import { shade, vibra } from '../gfx.js';
import * as FX from '../effetti.js';
import * as Juice from '../juice.js';
import voce from '../../voce.js';
import audio from '../../audio.js';
import musica from '../../musica.js';
import { salvaGS, aggiungiXP, incrStat } from '../../gs.js';
import { paletteArena, disegnaSfondo, disegnaPedana } from './battaglia/arena.js';
import { COL_ELEM, EMO_ELEM } from './battaglia/elementi.js';
import { livello, barraEnergia, aggiornaBarra, badgeTipo, efficacia, aggiornaStatoIcone } from './battaglia/hud.js';
import { anteprimaSquadraCapo, introBattaglia, cartello, scegliSchieramento, introVS } from './battaglia/intro.js';
import { pannelloMosse, disegnaMosse, aggiornaPannello, abilitaMosse } from './battaglia/pannello-mosse.js';
import { bottone } from './battaglia/widgets.js';
import { offriCatturaFinale, modalitaCattura } from './battaglia/cattura.js';

export class BattagliaScene extends Phaser.Scene {
  constructor() { super('BattagliaScene'); }

  // #94 — sfondo arena caricato lazy (non al boot).
  preload() {
    if (!this.textures.exists('sfondo-arena')) this.load.image('sfondo-arena', 'assets/sfondi/arena-prato.webp');
    // ✨ FORMA PRISMA delle tre forme finali (PNG scontornato ~300px), caricata solo
    // entrando in battaglia. Se manca, la chicca fa fallback sulla forma normale (niente bug).
    this.load.on('loaderror', () => {});
    for (const sp of SPECIE_PRISMA) {
      if (!this.textures.exists('lum-' + sp + '-prisma')) this.load.image('lum-' + sp + '-prisma', 'assets/lumini/' + sp + '-prisma.png');
    }
  }

  init(data) {
    data = data || {};
    // Preset demo per vedere le diverse arene: ?demo=battaglia&sub=acqua|roccia
    const preset = {
      acqua: { alleato: 'guscetto', avversario: 'brizzo', zona: 'acquatica' },
      roccia: { alleato: 'roccolo', avversario: 'foglino', zona: 'rocciosa' },
      // ✨ Forma finale in campo → per provare la Forma Prisma (tasto 💎).
      fuoco: { alleato: 'pyronex', avversario: 'foglino', zona: 'erbosa' },
    }[data.sub] || {};
    this.cfgAlleato = data.alleato || preset.alleato || 'fiammino';
    // #31 — l'avversario può essere una SQUADRA (capipalestra con 2-3 Lumini):
    // best-of reale a sotto-battaglie in sequenza (si batte tutta la squadra).
    this.squadraAvv = (Array.isArray(data.avversari) && data.avversari.length)
      ? data.avversari : [data.avversario || preset.avversario || 'foglino'];
    this.avvIdx = data.avvIdx || 0;
    this.continua = !!data.continua;   // sotto-battaglia successiva: salta lo schieramento
    this.cfgAvversario = this.squadraAvv[this.avvIdx];
    this.selvatico = data.selvatico !== false;       // selvatico → si può lasciare (Scappa)
    this.catturabile = data.catturabile === true;    // SOLO selvatici dell'erba → Lumiball
    this.variante = data.variante === true;          // #59 — variante colore speciale
    this.duePlayer = data.duePlayer === true;        // #66 — 2 giocatori sullo stesso iPad
    this.idSfida = data.idSfida || 'demo';
    this.capo = data.capo || null;   // #74 — sfida capopalestra: texture/speaker del maestro
    this.sfidante = data.sfidante || null;       // sprite dell'allenatore avversario (schermata VS)
    this.sfidanteNome = data.sfidanteNome || null;
    // Schermata "VS" cinematografica solo per le sfide con ALLENATORI di città (hanno uno
    // sfidante con sprite, non sono selvatici né capipalestra né il tutorial di Pietropoli).
    this._mostraVS = !!this.sfidante && !this.capo && !this.continua && this.idSfida !== 'pietropoli-bimbo';
    this._vsMostrato = false;
    this.formato = data.formato || 1;   // #28 (predisposto): best-of-1 ora; 3/5 in futuro
    this.ritorno = data.ritorno || 'MenuScene';
    this.zonaColore = data.zonaColore || '#cfe9a8';
    this.zona = data.zona || preset.zona || 'erbosa';   // erbosa | acquatica | rocciosa
    this.coda = [];
    this.bloccato = false;
    // #5 — La scena è un SINGLETON riusato: azzero TUTTI i flag transitori, altrimenti
    // un valore stantio (es. _inHitStop con timeScale 0, o _jollyPanel su oggetti morti)
    // congela la nuova battaglia o causa destroy su riferimenti vecchi.
    this._inAzione = false; this._inCattura = false; this._inHitStop = false;
    this._jollyPanel = null; this._turnoTxt = null; this._bolla = null; this._catturaUI = null;
    this._borsaPanel = null; this._trifoglioAttivo = false;   // #39
    this._p2Panel = null;   // #66
    // BUG best-of: `_statoIcone`/`_badgeAvv` sono Text/Container CACHE riusati. La
    // scena è un singleton e `scene.restart` (sotto-battaglie #31) distrugge i game
    // object ma NON questi riferimenti → al primo `_dopoAzione` della sotto-battaglia
    // successiva `box.setText()` toccava un Text DISTRUTTO (frame null) e lanciava,
    // interrompendo `_dopoAzione` PRIMA di riabilitare le mosse → battaglia bloccata
    // ("vinco e non posso più fare nulla"). Azzerati qui → si ricreano puliti.
    this._statoIcone = null; this._badgeAvv = null;
    this._catturaInVolo = false;   // Lumiball lanciata, sequenza in corso (watchdog)
    this._catturaGarantita = false;   // #75 — cattura post-sconfitta: il selvatico indebolito si prende sempre
    this._offertaCatturaFatta = false;   // #75 — offerta di cattura a fine sfida già mostrata
    this._bloccoDa = 0; this._tsZeroDa = 0; this._catturaDa = 0; this._azioneDa = 0;   // timer del watchdog
    this._evoluzionePendente = null;   // #5 — evoluzione organica pendente a fine battaglia
    this._prismaFormaAttiva = false;   // ✨ Lumino in Forma Prisma (transitorio)
    this._pannelloPrisma = false;   // ✨ il pannello mosse mostra l'attacco supremo Prisma
    // #23 — azzero il motore della battaglia precedente: tra init e _iniziaBattaglia
    // (cutscene d'ingresso) un `this.eng` stantio non deve essere toccato da handler.
    this.eng = null;
    this._ripartendo = false;   // #31 — true durante un restart sotto-battaglia (anti-race)
    this.tweens.timeScale = 1; this.time.timeScale = 1;
    // #13 — L'allenamento non deve accumulare pity (idSfida fisso → battaglie sempre
    // più banali). Pity attivo solo per le sfide "vere" (allenatori/leader/selvatici).
    this._pityAttivo = this.idSfida !== 'allenamento';
    this._perse = this._pityAttivo ? ((window.GS?.pity?.[this.idSfida]) || 0) : 0;
    this.pity = { alleato: 1, avversario: 1 };
    this._applicaPity();
    // DEBUG freeze (?debug): registra eventi/stato/eccezioni così, se si blocca, lo
    // screenshot del pannello mostra la causa. Sempre persistito in localStorage.
    this._debug = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
    this._dbgLog = [];
  }

  /** Riga di stato compatta per il debug. */
  _dbgStato() {
    const e = this.eng;
    return `turno=${e ? e.turno : '-'} bloc=${this.bloccato ? 1 : 0} az=${this._inAzione ? 1 : 0} cat=${this._inCattura ? 1 : 0} hs=${this._inHitStop ? 1 : 0} ts=${this.time ? this.time.timeScale : '?'} avv=${this.avvIdx}`;
  }

  /** Logga un evento di battaglia (ring buffer + localStorage + console se ?debug). */
  _dbg(msg) {
    try {
      const t = Math.round((this.time ? this.time.now : 0));
      const riga = `${t} | ${msg} | ${this._dbgStato()}`;
      this._dbgLog.push(riga);
      if (this._dbgLog.length > 18) this._dbgLog.shift();
      // persistente (anche senza ?debug): le ultime 60 righe, per recupero post-mortem.
      try {
        const buf = (JSON.parse(localStorage.getItem('lumiDbg') || '[]')).concat(riga).slice(-60);
        localStorage.setItem('lumiDbg', JSON.stringify(buf));
      } catch { /* niente */ }
      if (this._debug) {
        console.log('[BTL]', riga);
        if (this._dbgPanel) this._dbgPanel.setText('🐞 ' + this._dbgStato() + '\n' + this._dbgLog.slice(-12).join('\n'));
      }
    } catch { /* il debug non deve mai rompere il gioco */ }
  }

  create() {
    const { width, height } = this.scale.gameSize;
    this.W = width; this.H = height;
    this.cameras.main.fadeIn(280);   // ingresso morbido dall'uscita della città
    this.pal = paletteArena(this.zona);
    disegnaSfondo(this);
    musica.suona('battaglia');
    Juice.particelleAmbiente(this, { n: 8, colore: 0xffffff, depth: -980 });

    // Posizioni combattenti.
    this.posAvv = { x: width * 0.72, y: height * 0.30 };
    this.posAll = { x: width * 0.30, y: height * 0.54 };

    // Pedane ellittiche sotto i piedi (profondità come nei GDR classici).
    disegnaPedana(this, this.pal, this.posAvv.x, this.posAvv.y, 150);
    disegnaPedana(this, this.pal, this.posAll.x, this.posAll.y, 185);

    Juice.bottonePausa(this, this.W - 40, 38);
    // Pannello DEBUG (?debug): stato live + ultimi eventi. Se la battaglia si blocca,
    // lo screenshot di questo pannello mostra esattamente dove e perché.
    if (this._debug) {
      this._dbgPanel = this.add.text(8, 70, '🐞 debug…', {
        fontFamily: 'monospace', fontSize: '11px', color: '#9effa0', backgroundColor: '#000000cc',
        padding: { x: 6, y: 4 }, lineSpacing: 1, wordWrap: { width: this.W - 16 },
      }).setScrollFactor(0).setDepth(99999);
    }
    this._dbg('create idSfida=' + this.idSfida + ' avversari=' + JSON.stringify(this.squadraAvv));
    // Ripresa dalla pausa: se è il turno del giocatore (nessuna azione in corso),
    // riabilito le mosse — rete di sicurezza contro la "battaglia bloccata".
    // #6 — la scena è riusata: rimuovo l'handler precedente prima di riaggiungerlo,
    // altrimenti si moltiplica a ogni create().
    if (this._onResume) this.events.off('resume', this._onResume);
    this._onResume = () => {
      if (this.eng && !this.eng.conclusa && !this._inAzione) {
        this.bloccato = false; abilitaMosse(this, true); aggiornaPannello(this);
      }
    };
    this.events.on('resume', this._onResume);
    // Cutscene "inizio battaglia" stile GDR retrò: l'avversario scivola in campo.
    // #74/#79 — la SCELTA dello schieramento (quale Lumino mandare) è offerta in TUTTE
    // le sfide: senza poter scegliere il proprio Lumino si manderebbe sempre il primo
    // della squadra → gli altri non combattono mai → non accumulano vittorie → non
    // evolvono. `_scegliSchieramento` salta da solo quando c'è una sola opzione (riga
    // ~318), quindi a inizio gioco (squadra di 1) non aggiunge frizione. In 2 giocatori
    // ognuno usa il Lumino assegnato → si va dritti alla battaglia.
    const dopoIntro = () => this.duePlayer ? this._iniziaBattaglia(this.cfgAlleato) : scegliSchieramento(this);
    const conIntro = () => introBattaglia(this, dopoIntro);
    // #74 — anteprima della squadra del capopalestra: una volta sola, all'inizio.
    if (this.capo && this.squadraAvv.length > 1 && this.avvIdx === 0 && !this.continua) anteprimaSquadraCapo(this, conIntro);
    else conIntro();
  }

  // --- Cinematiche d'intro: estratte in scenes/battaglia/intro.js (F0.2) ---

  /** Costruisce e avvia la battaglia con lo schierato scelto. */
  _iniziaBattaglia(specie) {
    // Schermata "VS" (allenatori città): dopo la scelta del Lumino, prima del campo.
    if (this._mostraVS && !this._vsMostrato) {
      this._vsMostrato = true;
      introVS(this, specie, () => this._iniziaBattaglia(specie));
      return;
    }
    this.cfgAlleato = specie;
    this.pepoleAttiva = (specie === 'pepole');   // Pepole in campo → niente soccorso
    if (!this.continua) incrStat('battaglieGiocate');   // #70 — conta l'incontro (non le sotto-battaglie)

    // L'avversario è già in campo (entrata da _introBattaglia). Schiero il TUO
    // Lumino con uno slide da sinistra + "Vai!" (stile GDR retrò).
    this.alleato = new Lumino(this, -220, this.posAll.y, specie).setScale(1.45).setDepth(110);
    if (audio.suono) audio.suono('lancio');
    this.tweens.add({
      targets: this.alleato, x: this.posAll.x, duration: 500, ease: 'Cubic.out',
      onComplete: () => this.tweens.add({ targets: this.alleato, scaleX: 1.45 * 1.1, scaleY: 1.45 * 0.88, duration: 100, yoyo: true, ease: 'Quad.out' }),
    });
    cartello(this, `Vai, ${(LUMINI[specie] || {}).nome || 'Lumino'}!`, { dur: 1100 });

    // Pepole nell'angolo (nascosta se è lei in campo).
    this.pepole = new Pepole(this, this.W * 0.13, this.H * 0.62, { scala: 0.9 });
    if (this.pepoleAttiva) this.pepole.setVisible(false);

    this.barAvv = barraEnergia(this, 12, 14, this.cfgAvversario);
    this.barAll = barraEnergia(this, 12, this.H - 200, specie);
    badgeTipo(this, this.cfgAvversario);   // #33 — promemoria elemento sull'avversario

    this.eng = creaBattaglia({
      alleato: this._istanza(specie),
      avversario: this._istanza(this.cfgAvversario),
      pityDanno: this.pity,
      affezione: (window.GS?.album?.[specie]?.affezione) || 0,   // #40
    });
    this._collegaEventi();
    pannelloMosse(this);
    this._avvio();
  }

  async _avvio() {
    this.bloccato = true; abilitaMosse(this, false);
    this.coda = [];
    this.eng.avvia();              // emette saluto/bonus/turno → riempie la coda
    await this._drena();
    this._dopoAzione();
  }

  _istanza(specie) {
    const b = LUMINI[specie] || {};
    return { specie, nome: b.nome || specie, energia: b.energiaMax || 6, energiaMax: b.energiaMax || 6 };
  }

  _applicaPity() {
    // #77 — la difficoltà del profilo (gestita dal superadmin) modula gli aiuti:
    // 'piccoli' = un piccolo vantaggio sempre + rampa più rapida dopo le sconfitte;
    // 'grandi' = neutro all'inizio e aiuti più gentili (più sfida per i più grandi).
    const piccoli = (window.GS?.impostazioni?.difficolta || 'piccoli') !== 'grandi';
    if (this._perse >= 3) { this.pity.alleato = piccoli ? 1.45 : 1.25; this.pity.avversario = piccoli ? 0.7 : 0.82; }
    else if (this._perse >= 2) { this.pity.alleato = piccoli ? 1.25 : 1.12; this.pity.avversario = piccoli ? 0.82 : 0.9; }
    else if (this._perse >= 1) { this.pity.alleato = piccoli ? 1.12 : 1; this.pity.avversario = piccoli ? 0.92 : 1; }
    else { this.pity.alleato = piccoli ? 1.05 : 1; this.pity.avversario = 1; }
  }

  // --- Scenografia: estratta in scenes/battaglia/arena.js (F0.2) ------------

  // --- HUD: estratto in scenes/battaglia/hud.js (F0.2) ---------------------

  // --- Eventi motore → passi di animazione --------------------------------
  _collegaEventi() {
    const E = this.eng;
    E.on('saluto', () => this.coda.push(async () => {
      FX.stellineFairPlay(this, 6);
      this.pepole.emote('sorpresa', 1400);   // Pepole eccitata all'inizio della sfida
    }));
    E.on('mossa', (d) => this.coda.push(() => this._animaMossa(d)));
    E.on('prisma', () => this.coda.push(() => this._animaPrisma()));
    E.on('energia', (d) => this.coda.push(async () => {
      const bar = d.chi === 'alleato' ? this.barAll : this.barAvv;
      const lum = d.chi === 'alleato' ? this.alleato : this.avversario;
      aggiornaBarra(this, bar, d.energia, d.energiaMax);
      if (d.delta < 0) {
        FX.numeroFluttuante(this, lum.x, lum.y - 60, `${d.delta}`, '#ff3b3b'); audio.suono('colpito'); vibra(30);
        this.tweens.add({ targets: bar, scaleX: 1.06, scaleY: 1.06, duration: 70, yoyo: true, ease: 'Quad.out' });
        // Pepole incoraggia quando il TUO Lumino è in difficoltà.
        if (d.chi === 'alleato' && d.energia > 0 && d.energia <= 2) this.pepole.emote('incoraggia', 1500);
      }
      else if (d.delta > 0) { FX.numeroFluttuante(this, lum.x, lum.y - 60, `+${d.delta} ⭐`, '#37c24a'); audio.suono('stellina'); }
      await this._attesa(180);
    }));
    E.on('effetto', (d) => this.coda.push(async () => {
      const lum = d.di === 'alleato' ? this.alleato : this.avversario;
      const etich = { scudo: 'Scudo!', doppioProssimo: 'Doppio!', stordito: 'Stordito!', confusione: 'Confuso!', riduciMax1: 'Meno forza!' }[d.effetto];
      if (etich) FX.esclamazione(this, lum.x, lum.y - 80, etich, '#ffd23f');
      if (d.effetto === 'scudo') lum.lampeggia(0x9ecbff, 300);
      if (d.effetto === 'doppioProssimo') lum.lampeggia(0xff8a3c, 300);
      await this._attesa(120);
    }));
    E.on('stordito', (d) => this.coda.push(async () => {
      const lum = d.chi === 'alleato' ? this.alleato : this.avversario;
      FX.esclamazione(this, lum.x, lum.y - 80, '★ Giramenti ★', '#ffd23f');
      await this._attesa(250);
    }));
    E.on('confuso', (d) => this.coda.push(async () => {
      const lum = d.chi === 'alleato' ? this.alleato : this.avversario;
      if (d.autocolpo) { lum.scuoti(8); FX.esclamazione(this, lum.x, lum.y - 80, 'Ahia!', '#ff7a7a'); }
      await this._attesa(150);
    }));
    E.on('bonus', () => this.coda.push(async () => {
      if (window.GS) { window.GS.stelline = (window.GS.stelline || 0) + 1; }
      FX.stellineFairPlay(this, 3);
    }));
    E.on('stanco', (d) => this.coda.push(async () => {
      const lum = d.chi === 'alleato' ? this.alleato : this.avversario;
      lum.faiStanco(); audio.suono('stanco');
      await this._attesa(700);
    }));
    E.on('ripresa', () => this.coda.push(async () => {
      this._perse++;
      this._applicaPity();
      if (window.GS && this._pityAttivo) { window.GS.pity = window.GS.pity || {}; window.GS.pity[this.idSfida] = this._perse; salvaGS(); }
      // #72 — sconfitta-dolce variata: mai punitiva, sempre incoraggiante.
      const dai = ['Riproviamo!', 'Ci siamo quasi!', 'Dai che ce la fai!', 'Niente paura, ancora!'];
      FX.testoGrande(this, Phaser.Utils.Array.GetRandom(dai), '#7ad0ff');
      await this._attesa(600);
      // Reset visivo barre + posa.
      this._resetVisivo();
    }));
    E.on('vittoria', () => this.coda.push(async () => {
      // #31 — best-of: se l'avversario ha ancora Lumini in squadra, NON è la vittoria
      // finale: il prossimo Lumino scende in campo (sotto-battaglia successiva).
      if (this.avvIdx < this.squadraAvv.length - 1) {
        this.alleato.setEspressione('innamorato');
        this.pepole.reagisci(); audio.suono('vittoria');
        FX.testoGrande(this, `Bravo! Ne arriva un altro! (${this.avvIdx + 2}/${this.squadraAvv.length})`, '#ffd23f');
        await this._attesa(1300);
        voce.stop();
        this._ripartendo = true;   // blocca _dopoAzione del vecchio drain
        this.scene.restart({
          alleato: this.cfgAlleato, avversari: this.squadraAvv, avvIdx: this.avvIdx + 1,
          continua: true, selvatico: this.selvatico, idSfida: this.idSfida, ritorno: this.ritorno,
          zonaColore: this.zonaColore, zona: this.zona,
          // Audit: questi campi andavano persi al restart → in best-of il 2-giocatori
          // tornava all'IA dal 2° Lumino e il contesto del capo/sfidante spariva.
          capo: this.capo, duePlayer: this.duePlayer, catturabile: this.catturabile,
          sfidante: this.sfidante, sfidanteNome: this.sfidanteNome, formato: this.formato,
        });
        return;
      }
      if (window.GS) {
        if (this._pityAttivo) { window.GS.pity = window.GS.pity || {}; window.GS.pity[this.idSfida] = 0; }
        // Solo le sfide con allenatori/leader segnano la vittoria (per medaglie/progressi
        // e % di completamento). I Lumini selvatici NON si "consumano" battendoli: lo scopo
        // è CATTURARLI — chi viene solo sconfitto resta in città, così puoi tornare a
        // prenderlo (il completamento conta i selvatici catturati, non sconfitti).
        if (!this.selvatico) { window.GS.progressiStoria = window.GS.progressiStoria || {}; window.GS.progressiStoria['sfida:' + this.idSfida + ':vinta'] = true; }
        // V2 — Affezione: il Lumino che combatte si affeziona vincendo (max 5 cuori).
        const sp = this.alleato && this.alleato.specie;
        if (sp && window.GS.album && window.GS.album[sp]) {
          window.GS.album[sp].affezione = Math.min(5, (window.GS.album[sp].affezione || 0) + 1);
        }
        salvaGS();
        // #5 — Evoluzione ORGANICA: non più "a ogni medaglia" ma dopo 3-4 vittorie
        // (soglia random per Lumino). Se scatta, dopo la festa si va all'EvoluzioneScene.
        this._evoluzionePendente = this._contaVittoriaEvolvi();
      }
      this.alleato.setEspressione('innamorato');
      this.tweens.add({ targets: this.alleato, y: this.alleato.y - 20, yoyo: true, repeat: 2, duration: 220 });
      this.pepole.reagisci();
      // XP al giocatore (cresce di livello man mano).
      const lv = aggiungiXP(this.selvatico ? 10 : 20);
      if (lv.salito) this.time.delayedCall(700, () => {
        // #38 — festa + premio tangibile (stelline) ad ogni livello.
        FX.testoGrande(this, 'Livello ' + lv.livello + '! +' + lv.premioStelline + ' ⭐', '#7ad0ff');
        Juice.coriandoli(this, this.W / 2, this.H * 0.4, 30);
      });
      audio.suono('vittoria');
      musica.fanfara();
      Juice.coriandoli(this, this.W / 2, this.H * 0.32, 40);
      this.time.delayedCall(350, () => Juice.coriandoli(this, this.W * 0.3, this.H * 0.4, 26));
      // #72 — celebrazione VARIATA: frase a sorpresa + balletto del Lumino.
      const evvai = ['Evviva!', 'Che squadra!', 'Bravissimi!', 'Fantastico!', 'Siamo i migliori!'];
      FX.testoGrande(this, Phaser.Utils.Array.GetRandom(evvai), '#ffd23f');
      if (Math.random() < 0.5) this.tweens.add({ targets: this.alleato, angle: { from: -10, to: 10 }, yoyo: true, repeat: 3, duration: 140 });
      else this.tweens.add({ targets: this.alleato, scaleX: this.alleato.scaleX * 1.1, scaleY: this.alleato.scaleY * 0.9, yoyo: true, repeat: 2, duration: 160 });
      FX.stellineFairPlay(this, 10);
      await this._attesa(900);
    }));
    E.on('stretta', () => this.coda.push(async () => { FX.stellineFairPlay(this, 6); }));
    // #40 — "resiste col cuore": Pepole/Lumino reagiscono, cuori + scossa dolce.
    E.on('cuore', () => this.coda.push(async () => {
      const lum = this.alleato;
      if (lum) { lum.lampeggia(0xff8ab0, 400); FX.cuori(this, lum.x, lum.y - 40, 8); }
      FX.testoGrande(this, 'Resiste col cuore! ❤', '#ff6f9c');
      this.pepole?.reagisci(); vibra([20, 40, 20]); audio.suono('stellina');
      await this._attesa(650);
    }));
  }

  async _animaMossa(d) {
    // #42 — ricorda se l'ultimo colpo del giocatore è stato super: abilita la combo
    // "Squadra!" se subito dopo chiama Pepole in soccorso.
    if (d.di === 'alleato') this._ultimoSuper = (d.tipoEff === 'super');
    else this._ultimoSuper = false;
    const attaccante = d.di === 'alleato' ? this.alleato : this.avversario;
    const bersaglio = d.di === 'alleato' ? this.avversario : this.alleato;
    const from = { x: attaccante.x, y: attaccante.y - 10 };
    const to = { x: bersaglio.x, y: bersaglio.y - 10 };
    const m = d.mossa;
    this.pepole.reagisci();
    audio.suono(m.tipo === 'base' ? 'mossa' : 'mossaSpeciale');

    // Anticipazione + affondo: l'attaccante "carica" (squash) poi scatta in avanti.
    const dx = (to.x - from.x) > 0 ? 14 : -14;
    const sx0 = attaccante.scaleX || 1, sy0 = attaccante.scaleY || 1;
    this.tweens.add({ targets: attaccante, scaleX: sx0 * 0.92, scaleY: sy0 * 1.12, yoyo: true, duration: 110, ease: 'Quad.out' });
    this.tweens.add({ targets: attaccante, x: attaccante.x - dx * 0.35, duration: 90, yoyo: true, hold: 30, ease: 'Quad.out',
      onComplete: () => this.tweens.add({ targets: attaccante, x: attaccante.x + dx, yoyo: true, duration: 120, ease: 'Back.in' }) });

    if (m.esclamazione) FX.esclamazione(this, attaccante.x, attaccante.y - 90, m.esclamazione, '#fff');

    // Mosse speciali "firmate" di Pepole.
    if (m.nome === 'Fiatella') {
      await FX.nuvolaVerde(this, from, to);
      await this._impatto('signature');
      bersaglio.lampeggia(0x7ab648); bersaglio.scuoti(); bersaglio.setEspressione('nausea');
      this.time.delayedCall(700, () => bersaglio.setEspressione('normale'));
      return;
    }
    if (m.nome === 'Leccatina') {
      await FX.linguaLeccatina(this, from, to);
      await this._impatto('signature');
      bersaglio.lampeggia(0x9ecbff); bersaglio.scuoti();
      return;
    }
    if (m.nome === 'Molto Carina') {
      // RIGENERAZIONE: occhioni dolci → cuori e scintille verdi su SÉ STESSA (cura).
      attaccante.setEspressione('innamorato');
      attaccante.lampeggia(0x57c15a, 400);
      FX.cuori(this, attaccante.x, attaccante.y - 50, 8);
      FX.particelle(this, attaccante.x, attaccante.y - 10, 0x57c15a, 14);
      FX.testoGrande(this, 'MOLTO CARINA!', '#57c15a');
      await this._attesa(700);
      this.time.delayedCall(500, () => attaccante.setEspressione('normale'));
      return;
    }

    // Mossa con danno → carica + proiettile + IMPATTO (hit-stop+shake) + reazione.
    if ((m.danno || 0) > 0) {
      attaccante.lampeggia(COL_ELEM[m.elemento] || 0xffffff, 200);   // "carica" prima di lanciare
      await this._attesa(120);
      await FX.proiettileElemento(this, from, to, m.elemento);
      await this._impatto(d.tipoEff === 'super' ? 'super' : 'base');   // il colpo si "sente"
      bersaglio.lampeggia(COL_ELEM[m.elemento] || 0xffffff);
      bersaglio.scuoti(d.tipoEff === 'super' ? 12 : 7);
      // #32 — vantaggio di tipo BEN visibile: SUPER (flash+scossa+"SUPER!") e
      // POCO EFFICACE (tonfo smorzato + testo azzurrino), così il bambino capisce.
      if (d.tipoEff === 'super') {
        FX.flashSchermo(this, COL_ELEM[m.elemento] || 0xffffff, 0.4, 200);
        FX.esclamazione(this, bersaglio.x, bersaglio.y - 100, '⚡ SUPER! ⚡', '#ff5d8f');
        audio.suono('mossaSpeciale'); vibra([20, 30, 20]);
      } else if (d.tipoEff === 'scarso') {
        FX.esclamazione(this, bersaglio.x, bersaglio.y - 100, 'Poco efficace…', '#9fb3c8');
        audio.suono('tocco');
      }
      // ✨ Colpo della Forma Prisma: spettacolo extra, poi il Lumino torna normale.
      if (d.prisma) {
        FX.flashSchermo(this, 0x9be7ff, 0.65, 300);
        FX.esclamazione(this, bersaglio.x, bersaglio.y - 130, '💎 COLPO DI CRISTALLO! 💎', '#7ad0ff');
        this.cameras.main.shake(300, 0.013);
        audio.suono('mossaSpeciale'); vibra([40, 60, 40]);
        bersaglio.scuoti(16);
        this.time.delayedCall(540, () => this._terminaPrisma());
      }
      return;
    }

    // Mossa di supporto (cura/scudo/...) → bagliore su sé stesso.
    attaccante.lampeggia(COL_ELEM[m.elemento] || 0xfff2a8, 360);
    FX.particelle(this, attaccante.x, attaccante.y - 10, COL_ELEM[m.elemento] || 0xffd23f, 12);
    await this._attesa(300);
  }

  // --- Esecuzione coda animazioni -----------------------------------------
  // NB: NON uscire su this.bloccato qui. La re-entry dell'utente è già bloccata
  // nei tap (_usaMossa/_apriJolly/_scappa); il turno dell'IA invece chiama
  // _eseguiAzione mentre bloccato è ancora true e DEVE poter girare, altrimenti
  // il giro non torna mai al giocatore e i pulsanti restano spenti (bug turni).
  async _eseguiAzione(fn) {
    if (this.eng.conclusa || this._inAzione) { this._dbg('eseguiAzione SKIP (conclusa/inAzione)'); return; }
    this._inAzione = true;
    this.bloccato = true;
    abilitaMosse(this, false);
    this.coda = [];
    try { fn(); } catch (e) { this._dbg('ERR fn(): ' + (e && e.message)); }   // il motore emette in modo sincrono → riempie this.coda
    await this._drena();
    this._inAzione = false;
    this._dbg('azione fine');
    this._dopoAzione();
  }

  async _drena() {
    const passi = this.coda; this.coda = [];
    for (const passo of passi) {
      try { await passo(); } catch (e) { console.warn('passo anim', e); this._dbg('ERR passo-anim: ' + (e && e.message)); }
      await this._attesa(60);
    }
  }

  /** #5 — Conta una vittoria per il Lumino che ha combattuto e decide se evolverlo:
   *  soglia random 3-4 per stadio (stabile finché non evolve). Ritorna {da,a} se è
   *  ora di evolversi (la mutazione la applica EvoluzioneScene, idempotente), altrimenti null.
   *  Pepole non evolve (#63: nessun evolveIn). */
  _contaVittoriaEvolvi() {
    const g = window.GS; if (!g) return null;
    const sp = this.alleato && this.alleato.specie;
    const base = sp && LUMINI[sp];
    if (!base || !base.evolveIn) return null;   // già al massimo stadio o non evolvibile
    // Contatori in progressiStoria → persistiti gratis (s.storia.flags) tra le sessioni.
    g.progressiStoria = g.progressiStoria || {};
    const kV = 'vinte:' + sp, kS = 'sogliaEvo:' + sp;
    g.progressiStoria[kV] = (g.progressiStoria[kV] || 0) + 1;
    if (g.progressiStoria[kS] == null) g.progressiStoria[kS] = 3 + Math.floor(Math.random() * 2);   // 3 o 4
    salvaGS();
    if (g.progressiStoria[kV] < g.progressiStoria[kS]) return null;
    return { da: sp, a: base.evolveIn };
  }

  _dopoAzione() {
    if (this._ripartendo || !this.eng) return;   // #31 — restart sotto-battaglia in corso
    // Le icone di stato (💫 giramenti, 🛡️ scudo…) NON devono poter abortire lo
    // scheduling del turno: un'eccezione qui lasciava la battaglia bloccata.
    try { aggiornaStatoIcone(this); } catch (e) { this._dbg('ERR statoIcone: ' + (e && e.message)); }   // #34
    this._dbg('dopoAzione turno=' + this.eng.turno + ' conclusa=' + this.eng.conclusa);
    if (this.eng.conclusa) {
      this.bloccato = true;
      // #75 — hai sconfitto un selvatico catturabile (e non ce l'hai già): è indebolito,
      // offri un'ultima cattura prima di uscire. La cattura qui è garantita (l'hai vinto).
      if (this._vintoSelvatico() && !this._offertaCatturaFatta) {
        this._offertaCatturaFatta = true;
        this.time.delayedCall(900, () => offriCatturaFinale(this));
        return;
      }
      this.time.delayedCall(1200, () => {
        voce.stop();
        // #5 — se è scattata l'evoluzione, passa dalla cinematica e poi torna a destinazione.
        if (this._evoluzionePendente) {
          const { da, a } = this._evoluzionePendente; this._evoluzionePendente = null;
          this.scene.start('EvoluzioneScene', { da, a, ritorno: this.ritorno });
        } else this.scene.start(this.ritorno);
      });
      return;
    }
    if (this.eng.turno === 'avversario') {
      // #66 — in 2 giocatori il turno avversario lo gioca il Giocatore 2 (manuale).
      if (this.duePlayer) this.time.delayedCall(300, () => this._turnoP2());
      else this.time.delayedCall(450, () => this._eseguiAzione(() => this.eng.turnoAvversario()));
    } else {
      this.bloccato = false;
      // ✨ Prisma: se il Lumino è appena entrato/uscito dalla Forma Prisma, il set di
      // mosse cambia (resta solo l'attacco supremo) → ricostruisco i tasti.
      const armato = this.eng.stato().prismaArmato;
      if (armato !== this._pannelloPrisma) { this._pannelloPrisma = armato; disegnaMosse(this); }
      aggiornaPannello(this);
      abilitaMosse(this, true);
      // #19 — se il TUO Lumino è ancora stordito, dillo PRIMA che il bambino
      // scelga (altrimenti scopre solo dopo che la mossa è "saltata").
      const sA = this.eng.stato().alleato;
      if (sA && sA.stordito > 0 && this.alleato) {
        FX.esclamazione(this, this.alleato.x, this.alleato.y - 90, '★ Ha i giramenti! ★', '#ffd23f');
      }
      this._promptTurno();   // "Tocca a te!" — chiaro per i bambini
    }
  }

  /** Promemoria visivo che è il turno del giocatore (breve, non invasivo). */
  _promptTurno() {
    if (this._turnoTxt) this._turnoTxt.destroy();
    const t = this.add.text(this.W / 2, this.H * 0.40, '👉 Tocca a te!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(8700).setScale(0.6);
    this._turnoTxt = t;
    this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, duration: 400, delay: 1100, onComplete: () => { t.destroy(); if (this._turnoTxt === t) this._turnoTxt = null; } });
  }

  _attesa(ms) { return new Promise((r) => this.time.delayedCall(ms, r)); }

  _resetVisivo() {
    this.tweens.killTweensOf([this.alleato, this.avversario, this.pepole]);
    if (this._prismaFormaAttiva) { this.alleato.ripristinaForma(); this._prismaFormaAttiva = false; }
    this.alleato.setEspressione('normale'); this.avversario.setEspressione('normale');
    this.alleato.setAngle(0); this.avversario.setAngle(0);
    this.alleato.setAlpha(1); this.avversario.setAlpha(1);
    this.alleato.setScale(this.alleato._scalaBase || 1.45); this.avversario.setScale(1.15);
    this.alleato.setPosition(this.posAll.x, this.posAll.y);
    this.avversario.setPosition(this.posAvv.x, this.posAvv.y);
    const sA = this.eng.stato();
    aggiornaBarra(this, this.barAll, sA.alleato.energia, sA.alleato.energiaMax);
    aggiornaBarra(this, this.barAvv, sA.avversario.energia, sA.avversario.energiaMax);
  }

  // Pannello mosse + bottone → battaglia/pannello-mosse.js + widgets.js (F0.2)

  _usaMossa(i) {
    this._dbg('tap mossa ' + i + (this.bloccato ? ' (IGNORATO bloccato)' : ''));
    if (this.bloccato) return;
    const disp = this.eng.mosseDisponibili('alleato')[i];
    if (!disp || !disp.usabile) {
      // #6 — a stelle piene la cura non parte e NON si spreca: bolla visiva gentile.
      if (disp?.motivo === 'energia già piena' && this.alleato) {
        FX.esclamazione(this, this.alleato.x, this.alleato.y - 90, 'Stelle già piene! 💛', '#57c15a');
        audio.suono('tocco');
        return;
      }
      const idM = { 'in ricarica': 'mossa:ricarica', 'già usata in questa sfida': 'mossa:gia-usata', 'ha già recuperato abbastanza': 'mossa:basta-cure' }[disp?.motivo];
      if (idM) voce.parla(idM);
      return;
    }
    this._eseguiAzione(() => this.eng.usaMossa(i));
  }

  // aggiornaPannello / abilitaMosse / bollaDescrizione → battaglia/pannello-mosse.js (F0.2)

  _apriJolly() {
    if (this.bloccato || this._inAzione || this.eng.conclusa || this.eng.stato().jollyUsato) return;
    // Pepole interviene una volta: scelta tra 3 mosse rappresentative.
    const mosse = this.eng.mossePepole();
    const scelte = mosse.map((_, i) => i);   // tutte le mosse di Pepole
    if (this._jollyPanel) this._jollyPanel.destroy();
    const panel = this.add.container(this.W / 2, this.H * 0.5).setScrollFactor(0).setDepth(9000);
    panel.add(this.add.rectangle(0, 0, 300, 70 * scelte.length + 20, 0x1a1226, 0.95).setStrokeStyle(3, 0xffd23f));
    panel.add(this.add.text(0, -70 * scelte.length / 2 - 4, 'Pepole fa…', { fontFamily: 'system-ui', fontSize: '16px', color: '#ffd23f' }).setOrigin(0.5));
    scelte.forEach((idx, k) => {
      const yy = -70 * scelte.length / 2 + 30 + k * 70;
      const bg = this.add.rectangle(0, yy, 270, 56, 0xf0a830).setStrokeStyle(2, 0xb87d1e).setInteractive({ useHandCursor: true });
      const t = this.add.text(0, yy, mosse[idx].nome, { fontFamily: 'system-ui', fontSize: '17px', color: '#3a2c22', fontStyle: 'bold' }).setOrigin(0.5);
      panel.add([bg, t]);
      bg.on('pointerdown', () => { panel.destroy(); this._jollyPanel = null; this._soccorsoPepole(idx); });
    });
    // tap fuori → chiudi
    const sfondo = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.001).setScrollFactor(0).setDepth(8999).setInteractive();
    sfondo.on('pointerdown', () => { panel.destroy(); sfondo.destroy(); this._jollyPanel = null; });
    this._jollyPanel = panel;
    panel.once('destroy', () => sfondo.destroy());
  }

  /** ✨ Forma Prisma (forme finali, 1× per battaglia): NON consuma il turno —
   *  arma il prossimo attacco (fortissimo) e mostra la cinematica di trasformazione.
   *  Dopo il colpo cristallo Pyronex torna alla forma normale. */
  _formaPrisma() {
    if (this.bloccato || this._inAzione || this.eng.conclusa) return;
    const s = this.eng.stato();
    if (s.prismaUsato || !s.prismaDisponibile || this.eng.turno !== 'alleato') return;
    this._eseguiAzione(() => this.eng.usaPrisma());
  }

  async _animaPrisma() {
    const lum = this.alleato;
    if (!lum) return;
    audio.suono('mossaSpeciale'); vibra([30, 50, 30]);
    // Crescendo: lo schermo "respira", Pyronex si carica di energia cristallina.
    FX.flashSchermo(this, 0xffffff, 0.6, 280);
    FX.testoGrande(this, '💎 FORMA PRISMA! 💎', '#7ad0ff');
    lum.lampeggia(0x9be7ff, 520);
    FX.particelle(this, lum.x, lum.y - 10, 0x9be7ff, 24);
    this.tweens.add({ targets: lum, scaleX: lum.scaleX * 1.16, scaleY: lum.scaleY * 1.16, duration: 280, yoyo: true, ease: 'Quad.out' });
    this.cameras.main.shake(260, 0.006);
    await this._attesa(460);
    // Trasformazione vera e propria → forma cristallo, un po' più alta dell'originale.
    const ok = lum.trasformaIn('lum-' + lum.specie + '-prisma', 1.2);
    this._prismaFormaAttiva = ok;
    FX.flashSchermo(this, 0x7ad0ff, 0.55, 260);
    FX.particelle(this, lum.x, lum.y - 10, 0xffffff, 22);
    Juice.coriandoli(this, lum.x, lum.y - 20, 22);
    this.pepole?.reagisci();
    FX.esclamazione(this, lum.x, lum.y - 110, 'Pyronex Cristallo!', '#7ad0ff');
    await this._attesa(680);
  }

  // Fine della Forma Prisma: dopo il colpo potentissimo, il Lumino ritorna
  // alla forma normale con un piccolo bagliore.
  _terminaPrisma() {
    if (!this._prismaFormaAttiva || !this.alleato) return;
    this._prismaFormaAttiva = false;
    this.alleato.ripristinaForma();
    this.alleato.lampeggia(0xcfe9ff, 320);
    FX.particelle(this, this.alleato.x, this.alleato.y - 10, 0xffffff, 12);
    FX.esclamazione(this, this.alleato.x, this.alleato.y - 90, 'Torna normale!', '#cfe9ff');
  }

  /** #66 — Turno del Giocatore 2 (2 giocatori locali): sceglie la mossa dell'avversario
   *  da un pannello dedicato (le mosse non usabili sono disabilitate). */
  _turnoP2() {
    if (this.eng.conclusa || this._inAzione) return;
    if (this._p2Panel) { this._p2Panel.destroy(); this._p2Panel = null; }
    const disp = this.eng.mosseDisponibili('avversario');
    const panel = this.add.container(this.W / 2, this.H * 0.5).setScrollFactor(0).setDepth(9100);
    panel.add(this.add.rectangle(0, 0, 300, 64 * disp.length + 40, 0x101826, 0.97).setStrokeStyle(3, 0x7ad0ff));
    panel.add(this.add.text(0, -64 * disp.length / 2 - 6, '👤 Giocatore 2 — scegli!', { fontFamily: 'system-ui', fontSize: '16px', color: '#7ad0ff', fontStyle: 'bold' }).setOrigin(0.5));
    disp.forEach((d, i) => {
      const yy = -64 * disp.length / 2 + 28 + i * 64;
      const ok = d.usabile;
      const bg = this.add.rectangle(0, yy, 270, 52, ok ? 0x3a6ea5 : 0x55555f).setStrokeStyle(2, 0x1c3a5c).setInteractive({ useHandCursor: true });
      const t = this.add.text(0, yy, d.mossa.nome + (ok ? '' : ' (no)'), { fontFamily: 'system-ui', fontSize: '17px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      panel.add([bg, t]);
      bg.on('pointerdown', () => {
        if (!ok) { this.cameras.main.shake(100, 0.003); return; }
        panel.destroy(); this._p2Panel = null;
        this._eseguiAzione(() => this.eng.usaMossaAvversario(i));
      });
    });
    this._p2Panel = panel;
  }

  /** #39 — Borsa in battaglia: Caramella-stella (+2 energia, consuma il turno) e
   *  Trifoglio (più fortuna alla prossima cattura). Conteggi dall'inventario. */
  _apriBorsa() {
    if (this.bloccato || this._inAzione || this.eng.conclusa) return;
    if (this._borsaPanel) { this._borsaPanel.destroy(); this._borsaPanel = null; }
    const inv = (window.GS && window.GS.inventario) || {};
    const voci = [
      { id: 'caramella', l: '🍬 Caramella', n: inv.caramella || 0, fn: () => this._usaCaramella() },
      { id: 'trifoglio', l: '🍀 Trifoglio', n: inv.trifoglio || 0, fn: () => this._usaTrifoglio() },
    ];
    const panel = this.add.container(this.W / 2, this.H * 0.5).setScrollFactor(0).setDepth(9000);
    panel.add(this.add.rectangle(0, 0, 300, 70 * voci.length + 30, 0x1a1226, 0.96).setStrokeStyle(3, 0x6a8f3a));
    panel.add(this.add.text(0, -70 * voci.length / 2 - 8, '🎒 Borsa', { fontFamily: 'system-ui', fontSize: '17px', color: '#9ed46a', fontStyle: 'bold' }).setOrigin(0.5));
    const sfondo = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.001).setScrollFactor(0).setDepth(8999).setInteractive();
    sfondo.on('pointerdown', () => { panel.destroy(); sfondo.destroy(); this._borsaPanel = null; });
    voci.forEach((v, k) => {
      const yy = -70 * voci.length / 2 + 34 + k * 70;
      const ok = v.n > 0;
      const bg = this.add.rectangle(0, yy, 270, 56, ok ? 0x6a8f3a : 0x55555f).setStrokeStyle(2, 0x3a5a1e).setInteractive({ useHandCursor: true });
      const t = this.add.text(0, yy, `${v.l}   ×${v.n}`, { fontFamily: 'system-ui', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      panel.add([bg, t]);
      bg.on('pointerdown', () => {
        if (!ok) { this.cameras.main.shake(120, 0.003); return; }
        panel.destroy(); sfondo.destroy(); this._borsaPanel = null; v.fn();
      });
    });
    this._borsaPanel = panel;
    panel.once('destroy', () => sfondo.destroy());
  }

  _usaCaramella() {
    if (this.bloccato || this._inAzione || this.eng.conclusa) return;
    const inv = (window.GS && window.GS.inventario) || {};
    if (!(inv.caramella > 0)) return;
    inv.caramella--; salvaGS();
    audio.suono('stellina');
    FX.esclamazione(this, this.alleato.x, this.alleato.y - 90, '🍬 Gnam!', '#ffd23f');
    this._eseguiAzione(() => this.eng.usaCaramella(2));
  }

  _usaTrifoglio() {
    const inv = (window.GS && window.GS.inventario) || {};
    if (!(inv.trifoglio > 0)) return;
    if (!this.catturabile) { FX.esclamazione(this, this.W / 2, this.H * 0.4, 'Serve un Lumino selvatico!', '#9fb3c8'); return; }
    inv.trifoglio--; salvaGS();
    this._trifoglioAttivo = true;
    audio.suono('stellina');
    FX.esclamazione(this, this.alleato.x, this.alleato.y - 90, '🍀 Fortuna!', '#57c15a');
  }

  /** #27 — Soccorso Pepole come SOSTITUZIONE: il Lumino fa un passo indietro,
   *  Pepole entra in campo, fa un attacco, poi rientra il Lumino di prima. */
  async _soccorsoPepole(idx) {
    this._dbg('soccorso Pepole ' + idx + (this._inAzione || this.bloccato ? ' (IGNORATO)' : ''));
    if (this._inAzione || this.bloccato || this.eng.conclusa || this.eng.stato().jollyUsato) return;
    audio.suono('mossaSpeciale');
    // #42 — combo dolce: soccorso subito dopo un super → "Squadra!" + coriandoli.
    if (this._ultimoSuper) {
      FX.testoGrande(this, 'Squadra! 🤝', '#57c15a');
      Juice.coriandoli(this, this.W / 2, this.H * 0.35, 22);
      if (window.GS) window.GS.stelline = (window.GS.stelline || 0) + 1;
    }
    FX.esclamazione(this, this.posAll.x, this.posAll.y - 110, 'Pepole, aiuto!', '#ffd23f');
    this.pepole.setVisible(true);
    this.tweens.add({ targets: this.pepole, x: this.posAll.x + 28, y: this.posAll.y + 8, duration: 360, ease: 'Back.out' });
    this.alleato.setAlpha(0.5);                 // il Lumino arretra (in panchina)
    try {
      await this._attesa(440);
      await this._eseguiAzione(() => this.eng.usaJolly(idx));   // un attacco di Pepole
    } finally {
      // Ripristino SEMPRE lo stato visivo (anche se l'azione non è partita).
      if (this.alleato) this.alleato.setAlpha(1);
      FX.esclamazione(this, this.posAll.x, this.posAll.y - 110, 'Tocca a te!', '#7ad0ff');
      this.tweens.add({ targets: this.pepole, x: this.W * 0.13, y: this.H * 0.62, duration: 360, ease: 'Quad.in' });
    }
  }

  _scappa() {
    if (this.bloccato) return;
    this.bloccato = true;
    voce.parla('pepole:scappa');
    this.tweens.add({ targets: [this.alleato, this.pepole], x: -200, duration: 600, ease: 'Quad.in' });
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => { voce.stop(); this.scene.start(this.ritorno); });
  }

  /** #75 — True se hai appena SCONFITTO un selvatico catturabile non ancora posseduto. */
  _vintoSelvatico() {
    if (!this.selvatico || !this.catturabile) return false;
    if (possiediLinea(this.cfgAvversario)) return false;   // #76 — già un Lumino di questa linea
    const a = this.eng && this.eng.stato().avversario;
    return !!a && a.energia <= 0;
  }

  /** Esce dalla battaglia rispettando l'eventuale evoluzione pendente. */
  _esciDaBattaglia() {
    voce.stop();
    if (this._evoluzionePendente) {
      const { da, a } = this._evoluzionePendente; this._evoluzionePendente = null;
      this.scene.start('EvoluzioneScene', { da, a, ritorno: this.ritorno });
    } else this.scene.start(this.ritorno);
  }

  // --- Cattura: estratta in scenes/battaglia/cattura.js (F0.2). Delegato sottile:
  //     pannello-mosse chiama scene._modalitaCattura per aprire la Lumiball.
  _modalitaCattura() { modalitaCattura(this); }

  update(time) {
    this._watchdogAntiFreeze(time);   // rete di sicurezza: la battaglia non resta MAI bloccata
    if (this._dbgPanel) this._dbgPanel.setText('🐞 ' + this._dbgStato() + '\n' + this._dbgLog.slice(-12).join('\n'));
    if (this._inHitStop) return;   // hit-stop: congela anche gli idle
    this.alleato?.idle(time);
    this.avversario?.idle(time);
    this.pepole?.idle(time);
  }

  /** WATCHDOG ANTI-FREEZE. La battaglia "si bloccava" (specie in palestra/best-of):
   *  un'eccezione o un timer perso lasciava `bloccato=true` (o l'hit-stop incagliato
   *  con timeScale=0) e l'unico rimedio era mettere in PAUSA e RIPRENDERE (che fa
   *  proprio questo sblocco). Qui lo facciamo AUTOMATICAMENTE, senza che il bambino
   *  debba accorgersene: se è il TUO turno e nulla è davvero in corso ma le mosse
   *  restano spente troppo a lungo, le riattiviamo da soli. Idem per l'hit-stop. */
  _watchdogAntiFreeze(time) {
    // `time` è il tempo del GAME LOOP: avanza anche con this.time.timeScale=0, quindi
    // possiamo misurare un timeScale "incagliato" anche se i timer di scena sono fermi.
    // (1) timeScale a 0 da troppo (hit-stop con setTimeout perso, restart, ecc.):
    //     CONGELA tutti i tween/timer della scena → anche la SEQUENZA DI CATTURA
    //     (Lumiball a mezz'aria) E il delayedCall che, a battaglia conclusa, lancia
    //     l'EVOLUZIONE o l'uscita (freeze "dopo la vittoria"). Va recuperato SEMPRE,
    //     anche dopo `eng.conclusa`, perciò questo controllo viene PRIMA del return.
    if (this.time.timeScale === 0 || this.tweens.timeScale === 0) {
      this._tsZeroDa = this._tsZeroDa || time;
      if (time - this._tsZeroDa > 1100) {
        this._dbg('WATCHDOG: timeScale=0 incagliato → reset');
        this.tweens.timeScale = 1; this.time.timeScale = 1; this._inHitStop = false; this._tsZeroDa = 0;
      }
      return;   // finché è fermo non valutare il resto
    }
    this._tsZeroDa = 0;
    // Il resto del watchdog richiede un motore attivo: a battaglia conclusa o assente, stop.
    if (!this.eng || this.eng.conclusa) { this._bloccoDa = 0; this._catturaDa = 0; this._azioneDa = 0; return; }
    if (this._inHitStop) this._inHitStop = false;   // coerenza: timeScale è 1 ma il flag era rimasto su
    // (2) Cattura "in volo" che non si risolve (la sequenza Lumiball si è incagliata):
    //     dopo qualche secondo recupera, pulendo la cattura e ridando il turno.
    if (this._catturaInVolo) {
      this._catturaDa = this._catturaDa || time;
      if (time - this._catturaDa > 6000) { this._dbg('WATCHDOG: cattura in volo incagliata → recupero'); this._catturaDa = 0; this._recuperaCattura(); }
    } else {
      this._catturaDa = 0;
    }
    // (2.5) AZIONE/turno-avversario INCAGLIATO: se un'eccezione sincrona ha lasciato
    //     `_inAzione=true` (es. dentro `_dopoAzione`), oppure il turno dell'IA non è
    //     mai stato schedulato, NESSUNO sblocca (il watchdog (3) richiede `!_inAzione`
    //     e turno alleato). Qui: se niente progredisce da troppo, resetto `_inAzione`
    //     e ri-sincronizzo il turno (schedula l'IA o ridà la mano al giocatore).
    const inCorso = (this._inAzione || (this.bloccato && this.eng.turno === 'avversario')) && !this._inCattura && !this._catturaInVolo;
    if (inCorso) {
      this._azioneDa = this._azioneDa || time;
      if (time - this._azioneDa > 5000) {
        this._dbg('WATCHDOG: AZIONE INCAGLIATA → reset+risync (CAUSA FREEZE)');
        this._azioneDa = 0; this._inAzione = false;
        try { this.coda = []; this._dopoAzione(); } catch (e) { this._dbg('ERR risync: ' + (e && e.message)); }
      }
    } else {
      this._azioneDa = 0;
    }
    // (3) Turno del giocatore ma "bloccato" appiccicato (niente azione/cattura in corso):
    //     è lo stato anomalo che pausa→riprendi sanava. Sblocca dopo una breve attesa.
    const fermoAnomalo = this.eng.turno === 'alleato' && this.bloccato && !this._inAzione && !this._inCattura;
    if (fermoAnomalo) {
      this._bloccoDa = this._bloccoDa || time;
      if (time - this._bloccoDa > 1800) {
        this._dbg('WATCHDOG: bloccato appiccicato (turno tuo) → sblocco');
        this._bloccoDa = 0;
        this.bloccato = false;
        try { abilitaMosse(this, true); aggiornaPannello(this); aggiornaStatoIcone(this); } catch (e) { this._dbg('ERR sblocco: ' + (e && e.message)); }
      }
    } else {
      this._bloccoDa = 0;
    }
  }

  /** Recupero d'emergenza di una cattura incagliata: pulisce la UI, azzera i flag e
   *  ridà il controllo al giocatore (non perde il turno, può ritentare). */
  _recuperaCattura() {
    try {
      const ui = this._catturaUI;
      if (ui) { ui.ball?.destroy(); ui.hint?.destroy(); ui.annulla?.cont?.destroy(); (ui.extra || []).forEach((o) => o?.destroy && o.destroy()); }
    } catch { /* niente */ }
    this._catturaUI = null; this._inCattura = false; this._catturaInVolo = false; this.bloccato = false;
    try { abilitaMosse(this, true); aggiornaPannello(this); } catch { /* niente */ }
  }

  // --- M-15: hit-stop + screen shake (il "peso" degli impatti) -------------
  /**
   * Hit-stop: micro "fermo immagine" all'impatto (`ms`), poi riprende.
   *
   * RIFATTO (P1.13): NON azzera più `this.tweens.timeScale` / `this.time.timeScale`.
   * Azzerarli congelava OGNI tween e timer della scena — inclusa la sequenza di
   * cattura (Lumiball a mezz'aria) e i turni — e se il `setTimeout` di ripristino si
   * perdeva (tab in background, restart, ecc.) la battaglia restava BLOCCATA. Era la
   * causa-radice dei freeze (palestre + click Lumiball). Ora il fermo è solo VISIVO:
   * `update()` salta gli idle mentre `_inHitStop` è true, per `ms` di tempo reale.
   * Niente più clock globale fermo → niente più quella classe di blocchi.
   */
  _hitStop(ms = 60) {
    if (this._inHitStop) return Promise.resolve();
    this._inHitStop = true;
    return new Promise((risolvi) => {
      setTimeout(() => { this._inHitStop = false; risolvi(); }, ms);
    });
  }

  /** Screen shake calibrato e con tetto anti-nausea (mai oltre 0.011). */
  _scuotiCamera(intensita = 0.004, durata = 110) {
    this.cameras.main.shake(durata, Math.min(intensita, 0.011));
  }

  /** Impatto combinato: hit-stop + shake proporzionati alla potenza. */
  async _impatto(forza = 'base') {
    const P = {
      base:      { stop: 55, int: 0.0035, dur: 100 },
      super:     { stop: 75, int: 0.0080, dur: 170 },
      signature: { stop: 100, int: 0.0095, dur: 210 },
    }[forza] || { stop: 55, int: 0.0035, dur: 100 };
    await this._hitStop(P.stop);
    this._scuotiCamera(P.int, P.dur);
  }
}
