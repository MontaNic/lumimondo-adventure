/* CittaScene — città esplorabile top-down (P1-04, generica, parametro `citta`).
 *
 * Strade, edifici (collisioni), NPC con "!" toccabili → DialogoScene in overlay,
 * zona di erba alta con incontri casuali anti-frustrazione → BattagliaScene,
 * palestra (se la città ha un leader), uscita in basso verso la mappa.
 * Pietro cammina con Pepole sulla spalla.
 */

import { Pietro } from '../pietro.js';
import { Pepole } from '../pepole-actor.js';
import { Lumino } from '../lumino.js';
import { ControlloMovimento } from '../controllo.js';
import { CITTA } from '../../citta-data.js';
import { LUMINI, creaIstanza, possiediLinea } from '../../lumini-data.js';
import { col, shade, bordoSpecchiato } from '../gfx.js';
import { texPer, texGiocatore } from '../sprites.js';
import { haRitratto, disegnaPersona } from '../ritratti.js';
import { creaOmbra } from '../ombra.js';
import * as Juice from '../juice.js';
import voce from '../../voce.js';
import audio from '../../audio.js';
import musica from '../../musica.js';
import { salvaGS, aggiungiXP, incrStat } from '../../gs.js';
import { eseguiRegia } from '../../motore/regia.js';
import { aiutantePerOstacolo, datiOstacolo, NOME_ELEMENTO } from '../../motore/mondo.js';
import { statoTorneo, maestroSbloccato, etichettaTorneo } from '../../motore/torneo.js';
import { EDIFICI } from '../../motore/layout-citta.js';
import { bordoCopertura, limitiCamera } from '../../motore/copertura.js';

const W = 1200, H = 1400;  // città in portrait, si esce dal bordo basso

// Tappe dell'intro guidata di Pietropoli (cammini fino a ciascun personaggio).
const INTRO_PIETROPOLI = {
  pepole: { x: 600, y: 1040 },   // Pepole ti aspetta poco più avanti
  nonna:  { x: 380, y: 360 },    // la Nonna (= NONNA_POS dell'NPC)
  bimbo:  { x: 820, y: 720 },    // il bimbo (prima sfida) = posizione NPC bimbo
};

// #7 — Ogni bambino-allenatore ha un NOME proprio e un ASPETTO con colori MIXATI
// (carnagione, capelli, maglia, pantaloni). Niente più "Bimbo" tutti uguali. Le
// scelte sono deterministiche per ordine di creazione (stabili tra una visita e
// l'altra) ma incrociate con passi diversi così le combinazioni non si ripetono.
// Nomi propri per genere: si abbinano allo sprite (bimboN = maschio, bimbaN = femmina)
// così nome e immagine sono sempre coerenti.
const NOMI_M = ['Leo', 'Gio', 'Bruno', 'Vito', 'Enea', 'Remo', 'Tobia', 'Pino'];
const NOMI_F = ['Mia', 'Nina', 'Cleo', 'Sara', 'Ada', 'Lia', 'Bea', 'Gaia'];
const PELLE_BIMBI = [0xffd9b3, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const CAPELLI_BIMBI = [0x2a1d12, 0x16110c, 0xc99a3a, 0x8a3b1e, 0x5a4631, 0xd9b38c];
const MAGLIA_BIMBI = [0xe23b2e, 0x2f8fd8, 0x49b265, 0xf0a830, 0x9b59b6, 0xff7aa2, 0x20b6b6];
const PANT_BIMBI = [0x3a5a8a, 0x5a4631, 0x444b54, 0x2c7a55, 0x8a4b1e, 0x6a4cc4];
let _seqM = 0, _seqF = 0;
function coloriBimbo(k) {
  return {
    pelle: PELLE_BIMBI[k % PELLE_BIMBI.length],
    capelli: CAPELLI_BIMBI[(k * 3 + 1) % CAPELLI_BIMBI.length],
    maglia: MAGLIA_BIMBI[(k * 5 + 2) % MAGLIA_BIMBI.length],
    pantaloni: PANT_BIMBI[(k * 7 + 3) % PANT_BIMBI.length],
  };
}

// Sprite che raffigurano una BAMBINA anche se il file si chiama 'bimbo*' (ljtc3a/tikjpr
// erano stati etichettati male alla produzione). Determina nome E voce femminili.
const SPRITE_FEMMINA = new Set(['bimba1', 'bimba2', 'bimba3', 'bimbo4', 'bimbo8']);

// Allenatore/allenatrice generico (riduce ripetizione): NPC con sprite PNG + battuta +
// battaglia. Nome e VOCE seguono il genere dello sprite: le femmine parlano con la voce
// carlotta (id 'allenatore:N' → 'allenatrice:N'), non più con la voce maschile.
function allen(id, x, y, avversario, idSfida, tex, testo = 'allenatore:1', colore = 0x6a4cc4) {
  const femmina = SPRITE_FEMMINA.has(tex);
  const nome = femmina ? NOMI_F[_seqF++ % NOMI_F.length] : NOMI_M[_seqM++ % NOMI_M.length];
  const colori = coloriBimbo(femmina ? _seqF * 3 + 1 : _seqM * 5 + 2);
  colori.femmina = femmina;
  const idVoce = femmina ? testo.replace('allenatore', 'allenatrice') : testo;
  return { id, x, y, speaker: 'bambino', tex, emoji: '🧒', colore, nome, colori,
    battute: [{ id: idVoce, speaker: 'bambino', nome, tex }], battaglia: { avversario, selvatico: false, idSfida } };
}

// NPC e battaglie per città. I leader sono DATA-DRIVEN (campo `leader:true` + dati):
// li gestisce _parlaLeader. Difficoltà progressiva: più allenatori e avversari più
// evoluti man mano che si avanza.
const NPC_CITTA = {
  pietropoli: [
    { id: 'nonnatella', x: 380, y: 360, speaker: 'nonnatella', emoji: '👵', colore: 0x7a5b8c,
      battute: [{ id: 'nonnatella:benedizione', speaker: 'nonnatella' }] },
    { id: 'bimbo', x: 820, y: 720, speaker: 'bambino', tex: 'bimbo', emoji: '🧒', colore: 0x2f6fc4, nome: 'Giorgio',
      battute: [
        { id: 'bimbo:sfida', speaker: 'bambino', nome: 'Giorgio' },
        { id: 'lauri:tipi', speaker: 'pepole' },
        { id: 'lauri:incoraggia', speaker: 'pepole' },
      ], battaglia: { avversario: 'foglino', selvatico: false, idSfida: 'pietropoli-bimbo' } },
  ],
  acquaverde: [
    { id: 'nico', x: 300, y: 540, speaker: 'nico', emoji: '🧒', colore: 0x2f6fc4,
      battute: [{ id: 'nico:battuta', speaker: 'nico' }, { id: 'nico:entusiasmo', speaker: 'nico' }] },
    allen('a-all1', 860, 700, 'brizzo', 'acquaverde-all1', 'bimbo1', 'allenatore:1', 0x6a4cc4),
    allen('a-all2', 620, 700, 'guscetto', 'acquaverde-all2', 'bimba1', 'allenatore:2', 0xc06030),
    { id: 'marina', x: 600, y: 330, speaker: 'marina', emoji: '🧜', colore: 0x34a0d8, leader: true, gateFiori: 1,
      medaglia: 'onda', festaTesto: '🏅 Medaglia Onda!', festaColore: 0x1f6f9c, cittaFatta: 'acquaverde:fatta', evolviFlag: 'starter:evoluto',
      battaglia: { avversario: 'guscetto', squadra: ['guscetto', 'idronix', 'aquarex'], selvatico: false, idSfida: 'acquaverde-marina' },
      battuteIntro: [{ id: 'marina:intro', speaker: 'marina' }],
      battuteMedaglia: [{ id: 'marina:medaglia', speaker: 'marina' }, { id: 'pietro:medaglia', speaker: 'pietro' }] },
  ],
  terraverde: [
    // Doda si unisce qui (3ª città): NPC visibile col suo sprite, mostrato dopo la regia
    // d'arrivo (gate su 'terraverde:intro' nello spawn). Speaker 'lauri' → sprite 'doda'.
    { id: 'doda', x: 400, y: 600, speaker: 'lauri', emoji: '🧒', colore: 0x8bc34a, nome: 'Doda',
      battute: [{ id: 'doda:cura', speaker: 'lauri' }] },
    allen('t-all1', 860, 700, 'foglino', 'terraverde-all1', 'bimbo2', 'allenatore:1', 0x6a8f3a),
    allen('t-all2', 620, 700, 'floranyx', 'terraverde-all2', 'bimba2', 'allenatore:2', 0x3a7a4a),
    { id: 'silvio', x: 600, y: 330, speaker: 'silvio', emoji: '🧑‍🌾', colore: 0x4caf50, leader: true, gateFiori: 2,
      medaglia: 'radice', festaTesto: '🏅 Medaglia Radice!', festaColore: 0x2c7a33, cittaFatta: 'terraverde:fatta', evolviFlag: 'terraverde:evoluto',
      battaglia: { avversario: 'foglino', squadra: ['foglino', 'floranyx', 'selvarex'], selvatico: false, idSfida: 'terraverde-silvio' },
      battuteIntro: [{ id: 'silvio:intro', speaker: 'silvio' }],
      battuteMedaglia: [{ id: 'silvio:medaglia', speaker: 'silvio' }] },
  ],
  voltopoli: [
    allen('v-all1', 860, 700, 'zappix', 'voltopoli-all1', 'bimbo3', 'allenatore:1', 0xd4a017),
    allen('v-all2', 620, 700, 'voltrik', 'voltopoli-all2', 'bimba3', 'allenatore:2', 0xc06030),
    allen('v-all3', 980, 520, 'brizzo', 'voltopoli-all3', 'bimbo4', 'allenatore:3', 0x6a4cc4),
    { id: 'rik', x: 600, y: 330, speaker: 'rik', emoji: '⚡', colore: 0xffd23f, leader: true, gateFiori: 3,
      medaglia: 'scintilla', festaTesto: '🏅 Medaglia Scintilla!', festaColore: 0xb8860b, cittaFatta: 'voltopoli:fatta', evolviFlag: 'voltopoli:evoluto',
      battaglia: { avversario: 'zappix', squadra: ['zappix', 'voltrik', 'fulminex'], selvatico: false, idSfida: 'voltopoli-rik' },
      battuteIntro: [{ id: 'rik:intro', speaker: 'rik' }],
      battuteMedaglia: [{ id: 'rik:medaglia', speaker: 'rik' }] },
  ],
  pietrasanta: [
    allen('p-all1', 860, 700, 'roccolo', 'pietrasanta-all1', 'bimbo5', 'allenatore:1', 0x8a7560),
    allen('p-all2', 620, 700, 'granitor', 'pietrasanta-all2', 'bimbo6', 'allenatore:2', 0x6f5a4a),
    allen('p-all3', 980, 520, 'ventrix', 'pietrasanta-all3', 'bimba1', 'allenatore:3', 0x4a6f8a),
    { id: 'rocco', x: 600, y: 330, speaker: 'rocco', emoji: '🧗', colore: 0x9b8579, leader: true, gateFiori: 3,
      medaglia: 'granito', festaTesto: '🏅 Medaglia Granito!', festaColore: 0x5f5046, cittaFatta: 'pietrasanta:fatta', evolviFlag: 'pietrasanta:evoluto',
      battaglia: { avversario: 'roccolo', squadra: ['roccolo', 'granitor', 'titanrock'], selvatico: false, idSfida: 'pietrasanta-rocco' },
      battuteIntro: [{ id: 'rocco:intro', speaker: 'rocco' }],
      battuteMedaglia: [{ id: 'rocco:medaglia', speaker: 'rocco' }] },
  ],
  luminia: [
    allen('l-all1', 860, 700, 'fulminex', 'luminia-all1', 'bimbo7', 'allenatore:3', 0xb58cff),
    allen('l-all2', 620, 700, 'titanrock', 'luminia-all2', 'bimbo8', 'allenatore:3', 0x6f5a4a),
    allen('l-all3', 980, 520, 'aquarex', 'luminia-all3', 'bimba2', 'allenatore:3', 0x34a0d8),
    { id: 'maestro', x: 600, y: 510, speaker: 'maestro', emoji: '👑', colore: 0xffd23f, leader: true, gateFiori: 4,
      medaglia: 'maestro', festaTesto: '🏆 Sei un Maestro!', festaColore: 0xc79a1e, cittaFatta: 'luminia:fatta',
      battaglia: { avversario: 'pyronex', squadra: ['aquarex', 'selvarex', 'pyronex'], selvatico: false, idSfida: 'luminia-maestro' },
      battuteIntro: [{ id: 'maestro:intro', speaker: 'maestro' }],
      battuteMedaglia: [{ id: 'maestro:medaglia', speaker: 'maestro' }] },
  ],
};

export class CittaScene extends Phaser.Scene {
  constructor() { super('CittaScene'); }

  init(data) {
    data = data || {};
    const sub = CITTA[data.sub] ? data.sub : null;   // demo: ?demo=citta&sub=acquaverde
    this.cittaId = data.citta || sub || window.GS?.cittaCorrente || 'pietropoli';
    this.citta = CITTA[this.cittaId] || CITTA.pietropoli;
  }

  // #94 — sfondo città caricato lazy (non al boot): solo quello della città corrente.
  preload() {
    const k = 'citta-' + this.cittaId;
    if (this.cittaId && !this.textures.exists(k)) this.load.image(k, 'assets/sfondi/citta-' + this.cittaId + '.webp');
    // F0.3 — contenuto città data-driven: prova a caricare il JSON editabile (base + eventuale
    // override admin, servito da /api/contenuti). Se assente (204) il loader "fallisce" in modo
    // benigno e si usa il contenuto interno NPC_CITTA (fallback). Chiave per città.
    // Due sorgenti, stessa forma: l'API (base + override dell'admin, quando c'è un server)
    // e il FILE STATICO del repo. Su un hosting statico (GitHub Pages) l'API non esiste:
    // senza la seconda, città/torneo/ostacoli/regia ricadevano tutti sul fallback scritto
    // a mano e il Grande Torneo spariva in silenzio. Vince l'API se risponde. PIANO_PAGES.md.
    if (this.cittaId) {
      const ck = 'cont-' + this.cittaId;
      const cs = 'cont-statico-' + this.cittaId;
      if (!this.cache.json.exists(ck)) this.load.json(ck, 'api/contenuti/citta/' + this.cittaId);
      if (!this.cache.json.exists(cs)) this.load.json(cs, 'contenuti/citta/' + this.cittaId + '.json');
    }
  }

  /** Contenuto della città: l'API se il server risponde, altrimenti il JSON statico del
   *  repo (hosting statico/offline). Stessa forma, così il resto della scena non cambia. */
  _contenuto() {
    return this.cache.json.get('cont-' + this.cittaId) || this.cache.json.get('cont-statico-' + this.cittaId) || null;
  }

  // Lista NPC della città: dal contenuto JSON (adattato alla forma interna) se presente,
  // altrimenti dal contenuto interno NPC_CITTA. Calcolata una volta in create (this._npcData).
  _npcCitta() {
    const cont = this._contenuto();
    let lista = (cont && Array.isArray(cont.npc)) ? cont.npc.map((n) => this._adattaNpc(n)) : (NPC_CITTA[this.cittaId] || []).slice();
    // Fase S / CMS Tier 2b: personaggi AGGIUNTI dal genitore (override `npcExtra`), in coda.
    if (cont && Array.isArray(cont.npcExtra)) lista = lista.concat(cont.npcExtra.map((n) => this._adattaNpc(n)));
    return lista;
  }

  // Adatta un NPC del JSON alla forma interna attesa dal resto della scena (colori come
  // numeri; allenatore/leader ricostruiti come li produceva allen()/il literal NPC_CITTA).
  _adattaNpc(n) {
    const c = (h, def) => (typeof h === 'string' && h[0] === '#') ? parseInt(h.slice(1), 16) : (h != null ? h : def);
    if (n.tipo === 'allenatore') {
      const co = n.colori || {};
      return { id: n.id, x: n.x, y: n.y, speaker: 'bambino', tex: n.tex, emoji: n.emoji || '🧒',
        colore: c(n.colore, 0x6a4cc4), nome: n.nome,
        colori: { pelle: c(co.pelle), capelli: c(co.capelli), maglia: c(co.maglia), pantaloni: c(co.pantaloni), femmina: !!co.femmina },
        battute: [{ id: n.voce, speaker: 'bambino', nome: n.nome, tex: n.tex }],
        battaglia: { avversario: n.battaglia.avversario, selvatico: false, idSfida: n.battaglia.idSfida } };
    }
    if (n.tipo === 'leader') {
      return { id: n.id, x: n.x, y: n.y, speaker: n.speaker, emoji: n.emoji, colore: c(n.colore),
        leader: true, gateFiori: n.gateFiori, gateRivale: n.gateRivale, medaglia: n.medaglia,
        festaTesto: n.festaTesto, festaColore: c(n.festaColore), cittaFatta: n.cittaFatta, evolviFlag: n.evolviFlag,
        battaglia: { avversario: n.battaglia.avversario, squadra: n.battaglia.squadra, selvatico: false, idSfida: n.battaglia.idSfida },
        battuteIntro: n.battuteIntro, battuteMedaglia: n.battuteMedaglia, battuteCerimonia: n.battuteCerimonia };
    }
    // amico (default)
    return { id: n.id, x: n.x, y: n.y, speaker: n.speaker, emoji: n.emoji, colore: c(n.colore), nome: n.nome, battute: n.battute };
  }

  // Metadati città (nome, palette, elemento, luminiSelvatici, pos, medaglia…): dal
  // contenuto JSON se presente — così anche nome/palette/roster diventano editabili dal
  // CMS — MERGIATI sopra la base CITTA (fallback sicuro). I campi STRUTTURALI non nel
  // JSON (leader/torneo/allenatori/tutorial) restano dalla base. Chiamato in create(),
  // dopo che preload() ha caricato /api/contenuti (o fallito in modo benigno → base).
  _metaCitta() {
    const base = CITTA[this.cittaId] || CITTA.pietropoli;
    const cont = this._contenuto();
    if (!cont) return base;
    const meta = { ...base };
    for (const k of ['nome', 'ordine', 'elemento', 'descrizione', 'medaglia', 'pos']) {
      if (cont[k] != null) meta[k] = cont[k];
    }
    if (cont.palette) meta.palette = cont.palette;
    if (Array.isArray(cont.luminiSelvatici)) meta.luminiSelvatici = cont.luminiSelvatici;
    return meta;
  }

  // F0.4 — script di regia d'arrivo dal contenuto JSON (o null → si usa il ramo bespoke
  // in _direttore). Interpretato da motore/regia.js con gli handler-vista di _eseguiRegiaCitta.
  _regiaCitta() {
    const cont = this._contenuto();
    return (cont && cont.regia && Array.isArray(cont.regia.beats)) ? cont.regia : null;
  }

  // F4 — dati del TORNEO finale (Luminia): { sfide:[id…], finale:id } o null. Le REGOLE di
  // avanzamento stanno in motore/torneo.js; qui si legge solo il contenuto.
  _torneoCitta() {
    const cont = this._contenuto();
    return (cont && cont.torneo && Array.isArray(cont.torneo.sfide)) ? cont.torneo : null;
  }

  // F4 — evidenzia con un alone i sfidanti del torneo ancora da battere (guida gentile,
  // "mai un muro": il messaggio dice quanti mancano e questo mostra DOVE sono).
  _segnalaSfidantiTorneo(torneo) {
    const restanti = statoTorneo(torneo, window.GS?.progressiStoria).restanti;
    const npcs = this._npcData || [];
    for (const id of restanti) {
      const n = npcs.find((x) => x.battaglia && x.battaglia.idSfida === id);
      if (n && n._cont) Juice.alonePulsante(this, n._cont.x, n._cont.y - 30, { colore: 0xffd23f, raggio: 66, depth: n._cont.y + 2 });
    }
  }

  // Esegue una regia data-driven costruendo gli handler-VISTA (Phaser) che i beat astratti
  // richiamano. Gli handler ricevono il BEAT e ritornano una Promise (risolta a beat concluso):
  // dialoghi/quiz in overlay, marcatore luminoso, ingresso compagni, e i MOMENTI SU MISURA come
  // hook nominati (presentazione eroe, scrigno starter, demo stelline, lancio battaglia, fine
  // livello). guida/prossimità riusano il canale `_prox` di update() (l'intro resta guidabile
  // dalla rete-vista senza modifiche). Il motore (regia.js) resta puro.
  _eseguiRegiaCitta(script) {
    // Le intro-tutorial (script.intro) bloccano l'uscita-mappa e gestiscono lo spawn del bimbo:
    // marco _introInCorso solo se la regia partirà davvero (gate di testa non ancora fatto).
    if (script.intro && !(script.gate && this._fatta(script.gate))) this._introInCorso = true;
    const unisci = (amico) => { if (window.GS) { window.GS.amiciNelGruppo = Array.from(new Set([...(window.GS.amiciNelGruppo || []), amico])); salvaGS(); } };
    const ctx = {
      fatta: (f) => this._fatta(f),
      segna: (f) => this._segna(f),
      // primitivi
      dialogo: (b) => new Promise((res) => this._dialogo(b.battute, res)),
      conta: (b) => new Promise((res) => this._quizEducativo(res, { forza: { tipo: 'conta', n: b.n, tema: b.tema }, totale: 1 })),
      // quiz generico (usa `forza` così com'è): copre la sequenza-luci di Voltopoli e ogni
      // altro mini-quiz educativo dentro un'intro data-driven, senza hook dedicati.
      quiz: (b) => new Promise((res) => this._quizEducativo(res, { forza: b.forza || { tipo: 'sequenza' }, totale: b.totale || 1 })),
      unisci: (b) => unisci(b.amico),
      alone: (b) => {
        if (this._regiaAlone) this._regiaAlone.destroy();
        this._regiaAlone = Juice.alonePulsante(this, b.pos.x, b.pos.y, { colore: col(b.colore), raggio: 60, depth: b.pos.y - 2 });
      },
      attendiProssimita: (pos, r) => new Promise((res) => {
        this.controllo.abilitato = true;   // libero di camminare fino al punto
        this._prox = { x: pos.x, y: pos.y, r: r || 160, alone: this._regiaAlone,
          fn: () => { this.controllo.ferma(); this.controllo.abilitato = false; this._regiaAlone = null; res(); } };
      }),
      // guida verso un personaggio (alone + eventuale sprite alla destinazione), poi i beat annidati
      guida: (pos, colore, tex) => new Promise((res) => this._guidaVerso(pos, col(colore), res, tex ? { tex } : {})),
      // --- HOOK BESPOKE (momenti su misura di Pietropoli, nominati dai dati) ---
      presentazione: () => new Promise((res) => this._presentazioneEroe(res)),
      pepoleSalta: () => { this._pepoleSalta(); unisci('pepole'); },
      scrignoStarter: () => new Promise((res) => this._scrignoStarter((specie) => { this._regiaStarter = specie; res(); })),
      dialogoStarter: () => new Promise((res) => this._dialogo([
        { id: 'pietropoli:starter-' + (this._regiaStarter || window.GS?.starter || 'fiammino'), speaker: 'narratore' },
        { id: 'nonnatella:conta', speaker: 'nonnatella' },
      ], res)),
      demoStelline: () => new Promise((res) => this._demoStelline(res)),
      avviaBattaglia: (b) => { this._avviaBattaglia(b.cfg); return new Promise(() => {}); },   // la scena cambia → non risolve
      fineLivello: (b) => {
        if (window.GS) { window.GS.cittaCorrente = this.cittaId; salvaGS(); }
        if (b.segnaFatta) this._segna(b.segnaFatta);
        this._introInCorso = false;
        this._fineLivello(b.nome);
        return new Promise(() => {});   // la scena passa alla mappa → non risolve
      },
    };
    // fire-and-forget come i rami bespoke (callback-driven); gli errori non devono
    // rompere la scena → li logghiamo soltanto.
    eseguiRegia(script, ctx).catch((e) => console.warn('regia:', e && e.message));
  }

  create() {
    // F0.3 — i metadati città ora vengono dal JSON (con fallback a CITTA): dopo il
    // preload il contenuto è in cache, quindi rifinisco `this.citta` (init l'aveva
    // impostata alla sola base per sicurezza, prima che il JSON fosse disponibile).
    this.citta = this._metaCitta();
    this.physics.world.setBounds(0, 0, W, H);
    // Le scene Phaser sono RIUSATE (singleton): rientrando in città i flag transitori
    // di una visita precedente restavano stantii → `update()` usciva subito e Pietro
    // "non si muoveva più" (bug Acquaverde). Li azzero a ogni create().
    this._inDialogo = false; this._inOverlay = false; this._inTransizione = false;
    this._introInCorso = false; this._introLagoPending = false; this._prox = null; this._guidaAttore = null;
    this._medagliaOfferta = false;
    if (this.controllo) this.controllo.abilitato = true;
    // Dimensioni SCHERMO (viewport) per gli overlay screen-fixed: scrigno, conta,
    // festa medaglia, flash incontri. Senza questo erano undefined → NaN → invisibili
    // e non toccabili ("scelta starter bloccata"). [W/H modulo = dimensioni MONDO]
    this.W = this.scale.gameSize.width;
    this.H = this.scale.gameSize.height;
    // #6 — la scena è riusata (singleton): rimuovo l'handler prima di riaggiungerlo,
    // altrimenti i listener di resize/resume si moltiplicano a ogni create().
    if (this._onResize) this.scale.off('resize', this._onResize);
    this._onResize = (gs) => {
      this.W = gs.width; this.H = gs.height;
      // Trascinare la finestra sul PC non ricostruisce la scena (solo la rotazione lo fa):
      // rifaccio qui bordo e limiti, o allargando comparirebbe di nuovo la striscia.
      const bordo = bordoCopertura(this.W, this.H, W, H);
      if (this._bordo) this._bordo.forEach((o) => o.destroy());
      this._bordo = this.textures.exists('citta-' + this.cittaId)
        ? bordoSpecchiato(this, 'citta-' + this.cittaId, W, H, bordo) : [];
      this.cameras.main.setBounds(...limitiCamera(this.W, this.H, W, H));
    };
    this.scale.on('resize', this._onResize);
    const pal = this.citta.palette || { primario: '#ff8c28', scuro: '#a85614' };

    // Backdrop a TUTTO SCHERMO: su PC con viewport più largo del mondo città (1200×1400)
    // restava un'antiestetica banda di verde piatto ai lati. Ora la riempio con la STESSA
    // illustrazione della città, cover-scalata e leggermente smorzata (legge come sfondo
    // lontano). Ancorata alla camera (scrollFactor 0), dietro al terreno di gioco.
    this.cameras.main.setBackgroundColor('#5aa840');
    const texBackdrop = 'citta-' + this.cittaId;
    if (this.textures.exists(texBackdrop)) {
      this.textures.get(texBackdrop).setFilter(Phaser.Textures.FilterMode.LINEAR);
      const src = this.textures.get(texBackdrop).getSourceImage();
      const bd = this.add.image(this.W / 2, this.H / 2, texBackdrop).setScrollFactor(0).setDepth(-1100);
      bd.setScale(Math.max(this.W / src.width, this.H / src.height) * 1.06).setTint(0x8fa673);
    } else {
      this.add.tileSprite(0, 0, 4000, 3000, 'erba').setOrigin(0).setScrollFactor(0).setDepth(-1100);
    }

    // Terreno: sfondo città dedicato (assets/sfondi/citta-<id>.webp) se presente,
    // altrimenti terreno procedurale (erba + strade).
    if (this.textures.exists('citta-' + this.cittaId)) {
      this.textures.get('citta-' + this.cittaId).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.add.image(0, 0, 'citta-' + this.cittaId).setOrigin(0).setDisplaySize(W, H).setDepth(-1000);
      // Su schermi più grandi del mondo (PC) il terreno non arriverebbe ai bordi: lo
      // prolungo specchiandolo. Vedi motore/copertura.js.
      this._bordo = bordoSpecchiato(this, 'citta-' + this.cittaId, W, H, bordoCopertura(this.W, this.H, W, H));
    } else {
      // #88 — tutte e 6 le città hanno il PNG: se mancasse, lo segnalo (stile incoerente).
      console.warn('Sfondo città mancante, ramo procedurale:', this.cittaId);
      this.add.tileSprite(0, 0, W, H, 'erba').setOrigin(0).setDepth(-1000);
      this.add.tileSprite(W / 2, 0, 110, H, 'strada').setOrigin(0.5, 0).setDepth(-980);
      this.add.tileSprite(0, H * 0.45, W, 110, 'strada').setOrigin(0, 0.5).setDepth(-980);
    }

    // Edifici (collisioni statiche).
    this.solidi = this.physics.add.staticGroup();
    // Geometria in `motore/layout-citta.js` (dati puri): è la stessa che il test di layout
    // usa per garantire che nessun NPC finisca dentro/dietro una casa (bug del torneo).
    for (const e of EDIFICI) this._edificio(e.x, e.y, e.w, e.h);

    // Palestra (se c'è un leader): edificio speciale con insegna luminosa.
    if (this.citta.leader) {
      this._palestra(W * 0.5, 240);
    } else if (this.citta.torneo) {
      // Luminia è il CLIMAX-torneo (niente palestra): invito luminoso sopra il Maestro.
      this._invitoTorneo();
    }

    // Niente più "erba alta" con incontri casuali: ora ci sono LUMINI-OMBRA sparsi
    // per la città (silhouette della specie reale). Tocchi quello che vuoi e parte la
    // sfida CON QUEL Lumino (se vedi Guscetto, combatti Guscetto). NON a Pietropoli:
    // lì la prima battaglia è il bimbo (tutorial), niente selvatici nel villaggio iniziale.
    this.erba = null;
    this._luminiOmbra = [];
    if (this.cittaId !== 'pietropoli') this._spawnLuminiOmbra();

    // Pietro + Pepole. Al RITORNO da una battaglia ricompare dove si trovava (non più
    // all'ingresso): la posizione è salvata prima di ogni sfida e ripristinata qui.
    this.pietro = new Pietro(this, W / 2, H - 120, window.GS?.profilo);
    const pc = window.GS?.posCitta;
    if (pc && pc.citta === this.cittaId && !this._introInCorso) {
      // clamp lontano dal bordo basso, altrimenti l'uscita-verso-mappa scatta subito.
      this.pietro.setPosition(Phaser.Math.Clamp(pc.x, 60, W - 60), Phaser.Math.Clamp(pc.y, 120, H - 90));
    }
    this.physics.add.collider(this.pietro, this.solidi);
    this.pepole = new Pepole(this, this.pietro.x - 26, this.pietro.y - 48, { scala: 0.5 });
    // A Pietropoli, alla PRIMA visita, Pepole non è ancora con Pietro: lo aspetta
    // in piazza e si unisce quando lui la raggiunge (intro guidata). Altrove/dopo
    // è sempre sulla spalla.
    this._pepoleConPietro = (this.cittaId !== 'pietropoli') || this._fatta('pietropoli:pepole');
    if (!this._pepoleConPietro) {
      this.pepole.setPosition(INTRO_PIETROPOLI.pepole.x, INTRO_PIETROPOLI.pepole.y);
      this.pepole.setDepth(INTRO_PIETROPOLI.pepole.y);
    } else if (window.GS && !(window.GS.amiciNelGruppo || []).includes('pepole')) {
      // #22 — coerenza: se entriamo in una città con Pepole sulla spalla (save
      // importato/sblocco manuale che salta Pietropoli), allineo lo stato del gruppo
      // così Squadra/schieramento/album restano coerenti col visivo.
      window.GS.amiciNelGruppo = Array.from(new Set([...(window.GS.amiciNelGruppo || []), 'pepole']));
      salvaGS();
    }

    const cam = this.cameras.main;
    // Limiti allargati del bordo: quando lo schermo è più grande del mondo, i limiti
    // diventano larghi quanto lo schermo → la camera resta ferma e il mondo è CENTRATO
    // (prima si incollava a sinistra, con tutta la striscia scoperta a destra).
    cam.setBounds(...limitiCamera(this.W, this.H, W, H));
    cam.startFollow(this.pietro, false, 0.12, 0.12);   // roundPixels off → scroll fluido (niente "scatti")
    cam.fadeIn(300);
    cam.setZoom(1.06); this.tweens.add({ targets: cam, zoom: 1, duration: 480, ease: 'Sine.out' });

    this.controllo = new ControlloMovimento(this, this.pietro);
    musica.suonaCitta(this.cittaId);   // #73 — tema con variazione per città
    Juice.particelleAmbiente(this, { n: 9, colore: 0xfdffe0, depth: 5 });

    // Alberi decorativi (PNG), agli angoli, niente collisione.
    for (const [ax, ay] of [[120, 250], [W - 130, 300], [W - 200, H - 260]]) {
      this.add.image(ax, ay, 'obj-albero').setOrigin(0.5, 0.92)
        .setScale(150 / this.textures.get('obj-albero').getSourceImage().height).setDepth(ay);
    }

    // NPC.
    this.npc = [];
    this._npcData = this._npcCitta();   // F0.3 — da contenuto JSON o fallback NPC_CITTA
    this._regiaScript = this._regiaCitta();   // F0.4 — regia d'arrivo data-driven (o null → ramo bespoke)
    for (const n of this._npcData) {
      // Il bimbo (1ª sfida) compare SOLO dopo essere andati dalla Nonna (starter scelto).
      // #11 — durante l'intro guidata di Pietropoli il bimbo è gestito da _guidaVerso:
      // NON crearlo qui come NPC indipendente, o avremmo DUE hit-area sullo stesso
      // punto. Riappare (rigiocabile) solo a Pietropoli completata.
      if (n.id === 'bimbo' && (!this._fatta('starter:scelto') || !this._fatta('pietropoli:fatta'))) continue;
      // Doda è SEMPRE visibile a Terraverde (come Ale ad Acquaverde): prima era gated su
      // 'terraverde:intro', ma quel flag si setta DOPO lo spawn degli NPC → compariva solo
      // rientrando. La regia d'arrivo la presenta comunque (dialogo), poi resta lì.
      this._npc(n);
    }

    this._cartelli();   // #49 — cartelli leggibili (pratica di lettura)
    if (this.cittaId !== 'pietropoli') {
      this._tesori();          // #46 — tesori nascosti (brillio)
      this._eventoCasuale();   // #64 — eventi gentili (Lumino smarrito, ecc.)
      this._ostacoli();        // F2 — abilità esplorative data-driven (fallback: _ostacoloHM)
      this._gara();            // F3 — palco della Gara di Stile (se la città ne ospita una)
      this._civile();          // #44 — NPC ricorrente (Nonna Pina) con regalo
      this._missione();        // #47 — missione secondaria (porta 3 fiori)
      this._rivale();          // #45 — rivale amichevole ricorrente
    }

    this._hud();
    // Voce d'arrivo SOLO alle visite successive: alla 1a visita la regia (sotto)
    // la include come prima battuta del dialogo, così non viene tagliata né
    // sovrapposta dalla battuta di Ale. (Pietropoli: nessuna linea d'arrivo dedicata.)
    // (Niente voce d'arrivo sulle ri-visite: si ripeteva a ogni rientro dalle
    //  battaglie/palestra e confondeva. L'arrivo si sente solo alla 1ª visita.)
    if (this._onResume) { this.events.off('resume', this._onResume); this.events.off('wake', this._onResume); }
    this._onResume = () => { if (!this._inOverlay && this.controllo) this.controllo.abilitato = true; };
    this.events.on('resume', this._onResume);
    this.events.on('wake', this._onResume);   // #18 — risveglio da sleep (ritorno da Squadra/Lumidex)

    // Regia narrativa (sequenza guidata alla prima visita).
    this.time.delayedCall(450, () => this._direttore());
  }

  _edificio(x, y, w, h) {
    // Casa PNG: base a terra (origine in basso), un po' più grande dell'impronta.
    const src = this.textures.get('obj-casa').getSourceImage();
    const img = this.add.image(x, y + h / 2, 'obj-casa').setOrigin(0.5, 1);
    img.setScale((w * 1.5) / src.width).setDepth(y + h / 2);
    // Collisione = impronta a terra (più piccola del disegno), così Pietro ci gira attorno.
    const r = this.add.rectangle(x, y, w, h).setVisible(false);
    this.physics.add.existing(r, true); this.solidi.add(r);
  }

  _palestra(x, y) {
    // Palestra PNG (l'insegna del PNG ha solo icone) + etichetta "Palestra" a schermo.
    const src = this.textures.get('obj-palestra').getSourceImage();
    const img = this.add.image(x, y + 75, 'obj-palestra').setOrigin(0.5, 1);
    img.setScale(260 / src.width).setDepth(y + 80);
    const insegna = this.add.text(x, y - 92, 'Palestra', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(y + 81);
    this.tweens.add({ targets: insegna, alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });
    const r = this.add.rectangle(x, y, 220, 150).setVisible(false);
    this.physics.add.existing(r, true); this.solidi.add(r);
    // La PALESTRA è la sfida al CAPO (medaglia). Dopo aver vinto la medaglia,
    // diventa il posto per ALLENARSI (rivincite, niente posta in gioco).
    this._palestraPos = { x, y };
    const haMed = window.GS?.medaglie?.includes(this.citta.medaglia);
    this._palestraInvito = this.add.text(x, y + 96, haMed ? '🥊 Allenati!' : '🏅 Sfida il Capo!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold', backgroundColor: haMed ? '#2c7a33cc' : '#c0392bdd', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(y + 200).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: this._palestraInvito, y: y + 90, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
    this._palestraInvito.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      if (window.GS?.medaglie?.includes(this.citta.medaglia)) this._allenamento();
      else this._sfidaCapo();
    });
  }

  /** Affordance del climax a Luminia (niente edificio palestra): un invito luminoso
   *  sopra il Maestro. Il tap instrada al normale `_parla` del Maestro → stessa prossimità
   *  e stesso gate (palloncini) del tocco diretto: nessun nuovo percorso, nessun rischio. */
  _invitoTorneo() {
    const lead = (this._npcData || NPC_CITTA[this.cittaId] || []).find((n) => n.leader);
    if (!lead) return;
    const giaFatto = this._fatta(this.cittaId + ':fatta');
    // F4 — banner LIVE del torneo: finché i 3 sfidanti non sono battuti mostra "Torneo X/3"
    // (invito a giocare i round), poi diventa "Sfida il Maestro!" (finale sbloccata).
    const torneo = this._torneoCitta();
    const sbloccato = !torneo || maestroSbloccato(torneo, window.GS?.progressiStoria);
    const testo = giaFatto ? '🏆 Il Maestro'
      : sbloccato ? '🏆 Sfida il Maestro!'
        : '🏆 ' + etichettaTorneo(torneo, window.GS?.progressiStoria) + ' — batti gli sfidanti';
    const sfondo = giaFatto ? '#2c7a33cc' : sbloccato ? '#c0392bdd' : '#c79a1edd';
    const t = this.add.text(lead.x, lead.y - 150, testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold',
      backgroundColor: sfondo, padding: { x: 10, y: 5 }, align: 'center',
    }).setOrigin(0.5).setDepth(lead.y + 200).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: t, y: t.y - 8, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
    t.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this._parla(lead); });
  }

  /** Sfida al Capo Palestra (per la medaglia): trova l'NPC leader e avvia il dialogo. */
  _sfidaCapo() {
    if (this._inDialogo || this._inOverlay || this._inTransizione) return;
    const pp = this._palestraPos;
    if (pp && Math.hypot(this.pietro.x - pp.x, this.pietro.y - pp.y) > 240) { voce.parla('pepole:vicino'); return; }
    const lead = (this._npcData || NPC_CITTA[this.cittaId] || []).find((n) => n.leader);
    if (lead) this._parlaLeader(lead); else this._allenamento();
  }

  /** Allenamento alla palestra: battaglia ripetibile contro uno sparring partner
   *  casuale (stile selvatico: si può scappare e catturare, nessuna posta in gioco). */
  _allenamento() {
    if (this._inDialogo || this._inOverlay || this._inTransizione) return;
    const pp = this._palestraPos;
    if (pp && Math.hypot(this.pietro.x - pp.x, this.pietro.y - pp.y) > 230) {
      // Troppo lontano: guida verso la palestra.
      voce.parla('pepole:vicino');
      return;
    }
    const sparring = ['foglino', 'brizzo', 'guscetto', 'buzzetto', 'roccolo', 'fiammino'];
    this._avviaBattaglia({ avversario: Phaser.Utils.Array.GetRandom(sparring), selvatico: true, idSfida: 'allenamento' });
  }

  /** #3 — Sparge qualche LUMINO-OMBRA per la città: silhouette scure della specie
   *  reale (luminiSelvatici della città), distinte tra loro. Toccandone uno parte la
   *  sfida con QUELLA specie. Posizioni sparse, lontane da edifici e bordi. */
  _spawnLuminiOmbra() {
    // 2-3 specie base distinte, fisse per città. Ora dal roster DATA-DRIVEN (this.citta,
    // = JSON o fallback CITTA) invece che da wildRoster(CITTA) → editabile dal CMS. Stessa
    // logica di wildRoster: primi 3, fallback ['brizzo']. (Mai chiamato a Pietropoli.)
    const roster = (this.citta.luminiSelvatici || []).slice(0, 3);
    const specie = roster.length ? roster : ['brizzo'];
    // Roster FISSO e DETERMINISTICO (niente shuffle, niente popolazione infinita): ogni
    // Lumino selvatico ha posizione e specie stabili, con indice persistente. Lo scopo è
    // CATTURARLI TUTTI: una volta catturato (se ne possiede la linea evolutiva) NON
    // ricompare al rientro → la città si avvicina al 100%. Sconfiggerlo SENZA catturarlo
    // lo lascia lì, così puoi tornare a prenderlo.
    const spot = [
      { x: 250, y: 650 }, { x: 470, y: 800 }, { x: 780, y: 560 }, { x: 920, y: 860 }, { x: 360, y: 470 }, { x: 700, y: 980 },
    ];
    const quanti = Math.min(spot.length, specie.length);
    this._wildTotale = quanti;   // per la % di completamento del livello
    for (let i = 0; i < quanti; i++) {
      if (possiediLinea(specie[i])) continue;   // già catturato (questa linea): non ricompare
      this._unLuminoOmbra(spot[i].x, spot[i].y, specie[i], i);
    }
  }

  _unLuminoOmbra(x, y, sp, idx) {
    const cont = this.add.container(x, y).setDepth(y);
    cont.add(creaOmbra(this, 48, 22));
    // Silhouette: lo sprite reale della specie tinto scuro (forma riconoscibile), o
    // un blob scuro se il PNG non c'è. Così "se è Guscetto, sembra Guscetto".
    const tex = 'lum-' + sp;
    let body;
    if (this.textures.exists(tex)) {
      const src = this.textures.get(tex).getSourceImage();
      body = this.add.image(0, -8, tex).setOrigin(0.5, 0.85).setScale(66 / (src.height || 66)).setTint(0x12202b);
    } else {
      body = this.add.circle(0, -10, 24, 0x12202b).setStrokeStyle(3, 0x0a1016);
    }
    body.setAlpha(0.82);
    cont.add(body);
    // "?" che invita al tocco quando Pietro è vicino + lieve brillio misterioso.
    const q = this.add.text(0, -54, '?', { fontFamily: 'system-ui', fontSize: '24px', color: '#bfe3ff', fontStyle: 'bold', stroke: '#1a2230', strokeThickness: 4 }).setOrigin(0.5).setVisible(false);
    cont.add(q);
    this.tweens.add({ targets: cont, y: y - 6, yoyo: true, repeat: -1, duration: 1400 + Math.random() * 500, ease: 'Sine.inOut' });
    this.tweens.add({ targets: body, alpha: 0.6, yoyo: true, repeat: -1, duration: 1100 + Math.random() * 400, ease: 'Sine.inOut' });
    const hit = this.add.rectangle(x, y - 12, 76, 80, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
    const obj = { x, y, sp, cont, q, hit, idx };
    hit.on('pointerdown', () => this._sfidaOmbra(obj));
    this._luminiOmbra.push(obj);
  }

  /** Tocco su un Lumino-ombra → sfida con quella specie (catturabile). Se Pietro è
   *  lontano, Pepole lo invita ad avvicinarsi (come per gli NPC). */
  _sfidaOmbra(obj) {
    if (this._inDialogo || this._inOverlay || this._inTransizione || this._introInCorso) return;
    if (Math.hypot(this.pietro.x - obj.x, this.pietro.y - obj.y) > 175) { voce.parla('pepole:vicino'); return; }
    const variante = Math.random() < (window.GS?.campione ? 0.20 : 0.08);   // #59 variante rara
    const alleato = (window.GS?.team && window.GS.team[0]?.specie) || window.GS?.starter || 'fiammino';
    this.cameras.main.flash(160, 255, 255, 255);
    this._transizioneBattaglia(() => this.scene.start('BattagliaScene', {
      // idSfida per-spawn (citta+indice): identifica QUESTO Lumino, così una volta
      // sconfitto/catturato non si rigenera (vedi _spawnLuminiOmbra).
      alleato, avversario: obj.sp, selvatico: true, catturabile: true, variante,
      idSfida: 'selvatico-' + this.cittaId + '-' + (obj.idx ?? 0),
      ritorno: 'CittaScene', zonaColore: this.citta.palette?.primario || '#cfe9a8', zona: this._zonaArena(),
    }));
  }

  /** #7 — Disegna un bambino flat con colori configurabili (carnagione, capelli,
   *  maglia, pantaloni). Ritorna un Container locale (piedi a y≈+34, testa a y≈-34),
   *  coerente con la hit-area di default degli NPC. */
  _disegnaBambino(colori) {
    const c = colori || {};
    const pelle = c.pelle ?? 0xffd9b3, capelli = c.capelli ?? 0x2a1d12, maglia = c.maglia ?? 0xe23b2e, pantaloni = c.pantaloni ?? 0x3a5a8a;
    const femmina = !!c.femmina;
    const cont = this.add.container(0, 0);
    const g = this.add.graphics();
    if (femmina) {
      // Gambe corte (pelle) + scarpette, poi GONNA a trapezio (colore "pantaloni").
      g.fillStyle(pelle, 1); g.fillRoundedRect(-8, 22, 6, 12, 3); g.fillRoundedRect(2, 22, 6, 12, 3);
      g.fillStyle(0x7a3f8f, 1); g.fillRoundedRect(-9, 32, 8, 6, 3); g.fillRoundedRect(1, 32, 8, 6, 3);
      g.fillStyle(pantaloni, 1); g.beginPath(); g.moveTo(-13, 10); g.lineTo(13, 10); g.lineTo(20, 28); g.lineTo(-20, 28); g.closePath(); g.fillPath();
      g.lineStyle(2, shade(pantaloni, -0.3), 1); g.strokePath();
    } else {
      // Gambe / pantaloni + scarpe.
      g.fillStyle(pantaloni, 1);
      g.fillRoundedRect(-11, 12, 9, 20, 3); g.fillRoundedRect(2, 12, 9, 20, 3);
      g.fillStyle(0x2a2118, 1); g.fillRoundedRect(-12, 30, 12, 7, 3); g.fillRoundedRect(0, 30, 12, 7, 3);
    }
    // Braccia (manica = maglia) + mani (pelle).
    g.fillStyle(maglia, 1); g.fillRoundedRect(-21, -6, 8, 20, 4); g.fillRoundedRect(13, -6, 8, 20, 4);
    g.fillStyle(pelle, 1); g.fillCircle(-17, 15, 4); g.fillCircle(17, 15, 4);
    // Corpo / maglia.
    g.fillStyle(maglia, 1); g.fillRoundedRect(-15, -8, 30, 26, 9);
    g.lineStyle(2, shade(maglia, -0.3), 1); g.strokeRoundedRect(-15, -8, 30, 26, 9);
    // Testa (pelle).
    g.fillStyle(pelle, 1); g.fillCircle(0, -22, 14);
    g.lineStyle(2, shade(pelle, -0.25), 1); g.strokeCircle(0, -22, 14);
    // Capelli: calotta sulla metà superiore della testa + frangetta.
    g.fillStyle(capelli, 1);
    g.slice(0, -22, 15, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), true); g.fillPath();
    g.fillRoundedRect(-15, -28, 30, 7, 3);
    if (femmina) {
      // Capelli lunghi ai lati (incorniciano il viso) — segnale di "bambina".
      g.fillStyle(capelli, 1);
      g.fillRoundedRect(-16, -26, 6, 22, 3); g.fillRoundedRect(10, -26, 6, 22, 3);
    }
    cont.add(g);
    // Occhi + sorriso (Text per semplicità, sempre leggibili).
    cont.add(this.add.text(0, -20, '• •', { fontFamily: 'system-ui', fontSize: '11px', color: '#2a2118', fontStyle: 'bold' }).setOrigin(0.5));
    cont.add(this.add.text(0, -13, '‿', { fontFamily: 'system-ui', fontSize: '12px', color: '#7a4030' }).setOrigin(0.5));
    return cont;
  }

  _npc(n) {
    const cont = this.add.container(n.x, n.y).setDepth(n.y);
    // Sprite PNG se il personaggio ne ha uno (es. Ale = nico), altrimenti box+emoji.
    // hitTop/hitH definiscono la hit-area: DEVE coprire tutto il personaggio
    // visibile, testa/faccia incluse (è lì che un bambino tocca per primo).
    const DISP_H = 92;
    let hitTop = -45, hitH = 90, hitW = 60;
    const tex = n.tex || texPer(n.speaker);   // n.tex = override (es. bimbo)
    if (tex && this.textures.exists(tex)) {
      const img = this.add.image(0, 16, tex).setOrigin(0.5, 1);  // piedi a y≈+16
      img.setScale(DISP_H / (img.height || DISP_H));
      cont.add([creaOmbra(this, Math.max(34, img.displayWidth * 0.85), 16), img]);
      // Lo sprite va da y≈+16 (piedi) a y≈+16-DISP_H (testa). Hit-area su tutta la figura.
      hitTop = 16 - DISP_H - 8; hitH = DISP_H + 24; hitW = Math.max(60, img.displayWidth + 24);
    } else if (haRitratto(n.speaker)) {
      // #76 — ritratto PROCEDURALE (capipalestra senza PNG): personaggio disegnato,
      // non più emoji-in-box. Busto ~80px centrato, piedi a y≈+30.
      const pers = disegnaPersona(this, n.speaker, 1.05).setPosition(0, -14);
      cont.add([creaOmbra(this, 50, 34), pers]);
      hitTop = -64; hitH = 110; hitW = 72;
    } else if (n.speaker === 'bambino' && n.colori) {
      // #7 — bambino-allenatore DISEGNATO con colori mixati (carnagione/capelli/
      // maglia/pantaloni), ognuno diverso. Niente più emoji uguale per tutti.
      cont.add([creaOmbra(this, 40, 34), this._disegnaBambino(n.colori)]);
    } else {
      const g = this.add.graphics();
      g.fillStyle(n.colore, 1); g.lineStyle(3, shade(n.colore, -0.4), 1);
      g.fillRoundedRect(-16, -10, 32, 40, 10); g.strokeRoundedRect(-16, -10, 32, 40, 10);
      const faccia = this.add.text(0, -22, n.emoji, { fontSize: '30px' }).setOrigin(0.5);
      cont.add([creaOmbra(this, 32, 30), g, faccia]);
    }
    // #7 — etichetta col NOME proprio sopra il personaggio (sempre visibile). Se è un
    // allenatore GIÀ battuto (sfida vinta, non un leader) → spunta verde ✓: ricorda che
    // l'hai già affrontato, pur restando risfidabile per allenarsi.
    if (n.nome) {
      const vinto = !!(n.battaglia && n.battaglia.idSfida && !n.leader && this._fatta('sfida:' + n.battaglia.idSfida + ':vinta'));
      const tag = this.add.text(0, hitTop - 2, (vinto ? '✓ ' : '') + n.nome, {
        fontFamily: 'system-ui', fontSize: '13px', color: vinto ? '#bdf0a0' : '#fff', fontStyle: 'bold',
        backgroundColor: vinto ? '#1c4a22dd' : '#00000099', padding: { x: 5, y: 1 },
      }).setOrigin(0.5);
      cont.add(tag);
    }
    // Indicatore "!" pulsante quando Pietro è vicino.
    const excl = this.add.text(0, hitTop - 22, '!', { fontFamily: 'system-ui', fontSize: '30px', color: '#ffd23f', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 4 }).setOrigin(0.5).setVisible(false);
    cont.add(excl);
    this.tweens.add({ targets: excl, y: hitTop - 30, yoyo: true, repeat: -1, duration: 500 });
    // BERSAGLIO: rettangolo semplice (area = figura) al posto del container+hit-area
    // personalizzata, che aveva l'area cliccabile sfasata ("il click non fa nulla").
    const hit = this.add.rectangle(n.x, n.y + hitTop + hitH / 2, hitW, hitH, 0xffffff, 0.001)
      .setDepth(n.y + 1).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this._parla(n));
    Juice.entrata(this, cont, { da: 0.3, dur: 420, delay: 200 + Math.random() * 350 });
    n._cont = cont; n._excl = excl; n._hit = hit;
    this.npc.push(n);
  }

  _parla(n) {
    if (this._inDialogo || this._inOverlay || this._introInCorso) return;
    // Prima che parta la scenetta del lago, Ale non chiacchiera (eviti battute fuori posto).
    if (this._introLagoPending && n.id === 'nico') return;
    const d = Math.hypot(this.pietro.x - n.x, this.pietro.y - n.y);
    if (d > 170) { voce.parla('pepole:vicino'); return; } // troppo lontano: "avvicìnati"
    if (n.leader) { this._parlaLeader(n); return; }
    this._inDialogo = true;
    this.controllo.ferma(); this.controllo.abilitato = false;
    this.scene.pause();
    const dlg = this.scene.get('DialogoScene');
    dlg._onFine = () => {
      this._inDialogo = false;
      // Passo sprite + nome dell'allenatore alla battaglia → schermata VS (allenatori città).
      if (n.battaglia) this._avviaBattaglia({ ...n.battaglia, sfidante: n.tex, sfidanteNome: n.nome });
    };
    this.scene.launch('DialogoScene', { battute: n.battute, parent: this.scene.key });
  }

  _avviaBattaglia(cfg) {
    const alleato = (window.GS?.team && window.GS.team[0]?.specie) || window.GS?.starter || 'fiammino';
    // SFIDA TUTORIAL (Giorgio): il suo Lumino CONTRA lo starter scelto → insegna il
    // triangolo dei tipi e a chiamare Pepole in aiuto (morale "chiedere aiuto"). La
    // battaglia resta comunque impossibile da perdere (guidata + pity).
    let avversario = cfg.avversario;
    if (cfg.idSfida === 'pietropoli-bimbo') avversario = this._avversarioBimbo();
    // #31 — i capipalestra hanno una SQUADRA (best-of); gli altri un solo avversario.
    const avversari = (Array.isArray(cfg.squadra) && cfg.squadra.length) ? cfg.squadra : [avversario];
    this._transizioneBattaglia(() => this.scene.start('BattagliaScene', {
      alleato, avversario, avversari, selvatico: cfg.selvatico, capo: cfg.capo || null,
      sfidante: cfg.sfidante || null, sfidanteNome: cfg.sfidanteNome || null,
      idSfida: cfg.idSfida, ritorno: 'CittaScene',
      zonaColore: this.citta.palette?.primario || '#cfe9a8', zona: this._zonaArena(),
    }));
  }

  /** Lumino di Giorgio (1ª sfida): CONTRA l'elemento dello starter di Pietro.
   *  fuoco→acqua · acqua→elettricità · natura→fuoco (triangolo + elettr.>acqua). */
  _avversarioBimbo() {
    const sp = window.GS?.starter || (window.GS?.team && window.GS.team[0]?.specie) || 'fiammino';
    const el = (LUMINI[sp] && LUMINI[sp].elemento) || 'fuoco';
    return ({ fuoco: 'guscetto', acqua: 'zappix', natura: 'fiammino' })[el] || 'guscetto';
  }

  /** Transizione "a tende" stile GDR classico: flash + barre che entrano alternate,
   *  poi avvia la battaglia. Usata da tutte le entrate in battaglia. */
  _transizioneBattaglia(startFn) {
    // LOCK anti doppia-battaglia/race: senza, durante i ~620ms di transizione un secondo
    // tap (stesso NPC/ombra) o l'uscita-mappa facevano partire una SECONDA battaglia (o
    // due scene.start in corsa). Riuso `_inTransizione` (già controllato da update() e da
    // _versoMappa, azzerato in create()) + disabilito i comandi (ferma() non tocca abilitato).
    if (this._inTransizione) return;
    this._inTransizione = true;
    this.controllo.ferma();
    if (this.controllo) this.controllo.abilitato = false;
    // Salva DOVE si trova Pietro: al ritorno dalla battaglia riapparirà qui (non
    // all'ingresso). Pulito quando si torna alla mappa (vedi _versoMappa/_fineLivello).
    if (window.GS && this.pietro) window.GS.posCitta = { citta: this.cittaId, x: Math.round(this.pietro.x), y: Math.round(this.pietro.y) };
    this.cameras.main.flash(160, 255, 255, 255);
    if (audio.suono) audio.suono('lancio');
    const n = 8, hh = Math.ceil(this.H / n);
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      this.tweens.add({
        targets: this.add.rectangle(fromLeft ? -this.W : this.W, i * hh, this.W, hh, 0x0e0b16).setOrigin(0, 0).setScrollFactor(0).setDepth(99998),
        x: 0, duration: 340, delay: i * 24, ease: 'Quad.in',
      });
    }
    this.time.delayedCall(340 + n * 24 + 90, () => { voce.stop(); startFn(); });
  }

  // --- Regia narrativa (P1-09 Pietropoli) ---------------------------------
  _fatta(flag) { return !!(window.GS?.progressiStoria?.[flag]); }
  _segna(flag) { if (window.GS) { window.GS.progressiStoria = window.GS.progressiStoria || {}; window.GS.progressiStoria[flag] = true; salvaGS(); } }

  _direttore() {
    // F0.4 — se la città ha una regia data-driven, la interpreta (sostituisce il ramo
    // bespoke d'arrivo corrispondente). Il gate `acquaverde:intro` è dentro lo script.
    if (this._regiaScript) this._eseguiRegiaCitta(this._regiaScript);

    if (this.cittaId === 'pietropoli' && !this._regiaScript && !this._fatta('pietropoli:fatta')) this._introPietropoli();
    if (this.cittaId === 'acquaverde' && !this._regiaScript && !this._fatta('acquaverde:intro')) {
      // Non parte subito: voce d'arrivo + Pietro libero di camminare; la scenetta
      // del lago (Ale che cade) scatta quando Pietro RAGGIUNGE il lago (vedi update()).
      this._introLagoPending = true;
      this._lagoPos = { x: 300, y: 540 };   // posizione dell'NPC Ale / riva del lago
      this._lagoAlone = Juice.alonePulsante(this, this._lagoPos.x, this._lagoPos.y, { colore: 0x7ad0ff, raggio: 60, depth: this._lagoPos.y - 2 });
      // Messaggio d'arrivo SCRITTO (come le altre città) + voce, UNA SOLA volta (flag
      // dedicato): la scena del lago può restare in sospeso a lungo, ma il narratore NON
      // deve ripetersi a ogni rientro né sovrapporsi alla consegna della medaglia di Marina.
      if (!this._fatta('acquaverde:arrivo-detto')) {
        this._segna('acquaverde:arrivo-detto');
        this._dialogo([{ id: 'acquaverde:arrivo', speaker: 'narratore' }], () => {});
      }
    }
    if (this.cittaId === 'terraverde' && !this._regiaScript && !this._fatta('terraverde:intro')) {
      // Arrivo a Terraverde: qui DODA si unisce al viaggio (come Ale ad Acquaverde),
      // con la morale del "prendersi cura". Poi sfida il leader Silvio per la Radice.
      this.controllo.ferma(); this.controllo.abilitato = false;
      this._dialogo([
        { id: 'terraverde:arrivo', speaker: 'narratore' },
        { id: 'lauri:incontro', speaker: 'lauri' },   // Doda: "Posso venire anch'io?"
        { id: 'doda:cura', speaker: 'lauri' },          // morale: prendersi cura
      ], () => {
        if (window.GS) { window.GS.amiciNelGruppo = Array.from(new Set([...(window.GS.amiciNelGruppo || []), 'lauri'])); salvaGS(); }
        // #51 — quiz DENTRO la storia: il ponte dei fiori si apre contandoli.
        this._contaFiori(5, () => {
          this._segna('terraverde:intro');
          this.controllo.abilitato = true;
        });
      });
    }
    if (this.cittaId === 'voltopoli' && !this._regiaScript && !this._fatta('voltopoli:intro')) {
      // #51 — Rik accende le luci con una SEQUENZA (educazione come gameplay).
      this.controllo.ferma(); this.controllo.abilitato = false;
      // (Niente voce.parla qui: la riproduce già il dialogo sotto — altrimenti la frase
      //  d'arrivo partiva DUE volte. Come Acquaverde/Terraverde.)
      this._dialogo([{ id: 'voltopoli:arrivo', speaker: 'narratore' }], () => {
        this._quizSequenzaLuci(() => { this._segna('voltopoli:intro'); this.controllo.abilitato = true; });
      });
    }
    // Città avanzate (niente compagni nuovi): arrivo COERENTE con le altre città →
    // dialogo del narratore (testo a video + voce), una sola volta. Prima Pietrasanta e
    // Luminia avevano la VOCE senza la scritta (incoerenti con Acquaverde/Terraverde/Voltopoli).
    const arrivi = { pietrasanta: 'pietrasanta:arrivo', luminia: 'luminia:arrivo' };
    if (arrivi[this.cittaId] && !this._regiaScript && !this._fatta(this.cittaId + ':intro')) {
      this._segna(this.cittaId + ':intro');
      this._dialogo([{ id: arrivi[this.cittaId], speaker: 'narratore' }], () => {});
    }
    // AUTO-MEDAGLIA: se hai già battuto il Capo ma non hai la medaglia, te la
    // consegna da solo al rientro (niente "devi riparlare col leader" → niente loop).
    // #7 — auto-consegna medaglia: una sola volta per create (_medagliaOfferta),
    // e solo se la sfida è vinta ma la medaglia non è ancora persistita. Dopo la
    // cerimonia la medaglia è in GS.medaglie → la condizione non rientra più.
    const lead = (this._npcData || NPC_CITTA[this.cittaId] || []).find((n) => n.leader);
    if (lead && !this._medagliaOfferta && this._fatta('sfida:' + lead.battaglia.idSfida + ':vinta') && !(window.GS?.medaglie || []).includes(lead.medaglia)) {
      this._medagliaOfferta = true;
      this.time.delayedCall(700, () => { if (!this._inDialogo && !this._inOverlay) this._parlaLeader(lead); });
    }
    // #63 — Scena "Pepole rifiuta di evolvere" (cuore morale del gioco): a
    // Pietrasanta, ottenuta la Medaglia Granito ("il valore non dipende dalle
    // vittorie"), una luce propone a Pepole di evolversi… e lei sceglie di restare sé stessa.
    if (this.cittaId === 'pietrasanta' && (window.GS?.medaglie || []).includes('granito') && !this._fatta('pepole:non-evolve')) {
      this.time.delayedCall(1200, () => { if (!this._inDialogo && !this._inOverlay) this._pepoleRifiutaEvoluzione(); });
    }
  }

  /** #63 — La scena del rifiuto: niente voce nuova (bolle visive), Pepole brilla
   *  come per evolversi, poi la luce si spegne con dolcezza. Morale mostrata, non spiegata. */
  _pepoleRifiutaEvoluzione() {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    const W = this.W, H = this.H, cx = W / 2, cy = H * 0.45;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(9700);
    layer.add(this.add.rectangle(cx, H / 2, W, H, 0x0a0814, 0.9).setInteractive());   // blocca il tasto Menu sotto
    const pep = new Pepole(this, cx, cy, { scala: 1.4 });
    pep.setScrollFactor(0);
    layer.add(pep);
    const alone = this.add.circle(cx, cy, 90, 0xfff2a8, 0.0).setScrollFactor(0);
    layer.add(alone);
    audio.suono('evolveStart');
    // Sale la luce (come un'evoluzione che sta per partire)…
    this.tweens.add({ targets: alone, fillAlpha: 0.7, scale: 1.4, duration: 1400, ease: 'Sine.in' });
    this.tweens.add({ targets: pep, scaleX: 1.6, scaleY: 1.6, duration: 1400, ease: 'Sine.in' });
    const bolle = [
      { t: 'Una luce avvolge Pepole… vuole evolversi?', d: 1600 },
      { t: 'Pepole scuote la testa: sta bene così com\'è. 🐶', d: 4200 },
      { t: '«Il valore non dipende dalle vittorie.»', d: 6600 },
    ];
    bolle.forEach((b) => this.time.delayedCall(b.d, () => this._bollaSchermo(cx, H * 0.7, b.t, { attendi: false })));
    // …e la luce si spegne con dolcezza: Pepole resta Pepole.
    this.time.delayedCall(3600, () => {
      audio.suono('stellina');
      this.tweens.add({ targets: alone, fillAlpha: 0, scale: 0.8, duration: 1200, ease: 'Sine.out' });
      this.tweens.add({ targets: pep, scaleX: 1.4, scaleY: 1.4, duration: 800, ease: 'Back.out' });
      pep.reagisci && pep.reagisci();
      Juice.coriandoli(this, cx, cy - 30, 16);
    });
    this.time.delayedCall(8200, () => {
      this._segna('pepole:non-evolve');
      layer.destroy(); this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true;
    });
  }

  /** Bolla a SCHERMO (scrollFactor 0) per le scene di regia. */
  /** Bolla a schermo. Di DEFAULT resta finché non si tocca ("tocca per continuare"): un
   *  bambino di 7 anni legge con calma e il messaggio non sparisce prima. Solo le sequenze
   *  temporizzate passano `{ attendi: false }` (auto-svaniscono per non accavallarsi). */
  _bollaSchermo(x, y, testo, opts = {}) {
    const attendi = opts.attendi !== false;
    const c = this.add.container(x, y).setScrollFactor(0).setDepth(9800);
    const t = this.add.text(0, 0, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff6e3', align: 'center', wordWrap: { width: this.W - 80 }, fontStyle: 'bold' }).setOrigin(0.5);
    const g = this.add.graphics();
    const bw = Math.min(this.W - 40, t.width + 28), bh = t.height + 18 + (attendi ? 22 : 0);
    g.fillStyle(0x1a1226, 0.92); g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    g.lineStyle(3, 0xffd23f, 0.9); g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    t.setY(attendi ? -11 : 0);
    c.add([g, t]); c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
    if (!attendi) {
      this.time.delayedCall(2600, () => this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() }));
      return;
    }
    // Tap-per-chiudere: hint pulsante + catcher full-screen (intercetta il tocco così non
    // muove Pietro e chiude la bolla). Armato dopo 350ms (il tap che ha aperto non chiude
    // subito). Fallback 15s: non resta MAI bloccata.
    const hint = this.add.text(0, bh / 2 - 13, '👆 tocca per continuare', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5);
    c.add(hint);
    this.tweens.add({ targets: hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
    const catcher = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.01).setScrollFactor(0).setDepth(9799).setInteractive();
    let chiuso = false;
    const chiudi = () => { if (chiuso) return; chiuso = true; if (catcher.scene) catcher.destroy(); if (c.scene) this.tweens.add({ targets: c, alpha: 0, duration: 220, onComplete: () => c.destroy() }); };
    this.time.delayedCall(350, () => { if (!chiuso && catcher.scene) catcher.once('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); chiudi(); }); });
    this.time.delayedCall(15000, chiudi);
  }

  /** Scenetta del lago: si attiva alla prossimità. Ale cade → si unisce → bracciate → morale. */
  _scenaLago() {
    if (this._lagoAlone) { this._lagoAlone.destroy(); this._lagoAlone = null; }
    this.controllo.ferma(); this.controllo.abilitato = false;
    this._dialogo([{ id: 'acquaverde:splash', speaker: 'narratore' }, { id: 'nico:salvataggio', speaker: 'nico' }], () => {
      if (window.GS) { window.GS.amiciNelGruppo = Array.from(new Set([...(window.GS.amiciNelGruppo || []), 'nico'])); salvaGS(); }
      this._dialogo([{ id: 'lauri:bracciate', speaker: 'pepole' }], () => {
        this._contaBracciate(4, () => {
          this._dialogo([{ id: 'lauri:morale-aiuto', speaker: 'pepole' }, { id: 'nico:scusa', speaker: 'nico' }], () => {
            this._segna('acquaverde:intro');
            this.controllo.abilitato = true;
          });
        });
      });
    });
  }

  /** Marina (leader): sfida → poi consegna la Medaglia Onda. */
  /** Leader della palestra (GENERICO, data-driven): sfida → medaglia → evoluzione.
   *  L'NPC leader porta i campi: medaglia, battaglia{avversario,idSfida}, battuteIntro,
   *  battuteMedaglia, festaTesto, festaColore, cittaFatta, evolviFlag (facoltativo). */
  _parlaLeader(n) {
    if (this._inDialogo || this._inOverlay) return;   // niente doppio dialogo/medaglia
    const vinta = this._fatta('sfida:' + n.battaglia.idSfida + ':vinta');
    const ha = window.GS?.medaglie?.includes(n.medaglia);
    if (!vinta) {
      // PALETTO MORBIDO — TORNEO (F4): la finale col Maestro si sfida SOLO dopo aver battuto
      // i 3 sfidanti (in qualsiasi ordine). Mai un muro: dico quanti mancano e li illumino.
      const torneo = this._torneoCitta();
      if (torneo && n.battaglia.idSfida === torneo.finale && !maestroSbloccato(torneo, window.GS?.progressiStoria)) {
        const st = statoTorneo(torneo, window.GS?.progressiStoria);
        this._bollaSchermo(this.W / 2, this.H * 0.2, `È la finale del Torneo! 🏆\nPrima batti gli altri sfidanti: te ne mancano ${st.totale - st.vinte}.`);
        this._segnalaSfidantiTorneo(torneo);
        return;
      }
      // PALETTO MORBIDO — RIVALE: per sfidare il Maestro (finale di Luminia) bisogna prima
      // aver battuto il proprio rivale (Vido). Mai un muro: messaggio gentile + Vido resta lì
      // da affrontare. Dà senso all'arco del rivale, che culmina qui. (Data-driven: gateRivale
      // = idSfida del rivale, oggi solo su luminia.json.)
      if (n.gateRivale && !this._fatta('sfida:' + n.gateRivale + ':vinta')) {
        this._bollaSchermo(this.W / 2, this.H * 0.2, 'Prima affronta il tuo rivale Vido!\nÈ qui vicino, in attesa. ⚔️');
        if (this._rivaleObj) Juice.alonePulsante(this, this._rivaleObj.x, this._rivaleObj.y - 30, { colore: 0x7ad0ff, raggio: 66, depth: this._rivaleObj.y + 2 });
        return;
      }
      // PALETTO MORBIDO: per sfidare il Capo servono N fiori-indovinello (cresce per
      // città). Mai un muro: il quiz dei fiori è a prova di blocco (rivela la risposta),
      // e il messaggio dice esattamente quanti ne mancano. Una volta vinta/medaglia: niente paletto.
      const richiesti = n.gateFiori || 0;
      if (richiesti > 0) {
        const presi = this._fioriRaccolti();
        if (presi < richiesti) { this._messaggioGate(richiesti - presi); return; }
      }
      this._dialogo(n.battuteIntro, () => this._avviaBattaglia({ ...n.battaglia, capo: n.speaker }));
    } else if (!ha) {
      this._dialogo(n.battuteMedaglia, () => {
        if (window.GS) {
          window.GS.medaglie = Array.from(new Set([...(window.GS.medaglie || []), n.medaglia]));
          if (n.cittaFatta) this._segna(n.cittaFatta);
          salvaGS({ immediato: true }); Juice.iconaSalvata(this);   // medaglia: salva SUBITO
        }
        aggiungiXP(50);   // grande crescita del giocatore con la medaglia
        this._festaMedaglia(n.festaTesto, n.festaColore);
        // #5 — l'evoluzione NON è più legata alla medaglia: avviene in modo organico
        // dopo 3-4 vittorie del Lumino (vedi BattagliaScene._contaVittoriaEvolvi).
        // #62 — Torneo finale di Luminia come CLIMAX: foto di squadra + sticker celebrativo.
        // #65 — sblocca la Modalità Campione (varianti più frequenti, rivincite).
        if (n.medaglia === 'maestro') {
          // CERIMONIA FINALE (F4, S5.2): dopo la medaglia, Nonna Tella arriva col suo "Lo
          // sapevo fin dall'inizio" + la morale finale (dati editabili: battuteCerimonia),
          // POI la foto di squadra. Se mancano le battute, si va dritti alla foto (nessuna regressione).
          if (window.GS) { window.GS.campione = true; salvaGS(); }
          const cerimonia = (n.battuteCerimonia && n.battuteCerimonia.length) ? n.battuteCerimonia : null;
          this.time.delayedCall(2400, () => { if (cerimonia) this._dialogo(cerimonia, () => this._fotoSquadra()); else this._fotoSquadra(); });
        }
        else {
          // Città standard: presa la medaglia il livello è COMPLETO (cittaFatta segnata
          // sopra → la mappa sblocca la successiva). Ma NON si esce in automatico: Pietro
          // resta libero di esplorare e catturare Lumini. Si esce dal cartello ↓ (o
          // camminando verso il bordo basso) quando vuole.
          this.time.delayedCall(2400, () => { if (!this._inDialogo && !this._inOverlay) this._invitoUscita(); });
        }
      });
    } else {
      this._dialogo([n.battuteMedaglia[0]], () => {});
    }
  }

  /** #62 — Climax del torneo: "foto di squadra" con flash, Lumini + Pepole in posa,
   *  fanfara e sticker celebrativo "Campione di Luminia". */
  _fotoSquadra() {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    const W = this.W, H = this.H, cx = W / 2, cy = H * 0.5;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(9750);
    layer.add(this.add.rectangle(cx, cy, W, H, 0x12040a, 0.92).setInteractive());   // blocca il tasto Menu sotto
    layer.add(this.add.text(cx, H * 0.16, '🏆 Campione di Luminia! 🏆', { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffd23f', fontStyle: 'bold', stroke: '#5a3b1a', strokeThickness: 5, align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5));
    // Cornice "foto".
    const fw = Math.min(W - 50, 420), fh = Math.min(H * 0.5, 300);
    const g = this.add.graphics();
    g.fillStyle(0xfff6e3, 1); g.fillRoundedRect(cx - fw / 2, cy - fh / 2, fw, fh, 16);
    g.lineStyle(8, 0xc79a1e, 1); g.strokeRoundedRect(cx - fw / 2, cy - fh / 2, fw, fh, 16);
    layer.add(g);
    // Squadra in posa + Pepole.
    const team = ((window.GS && window.GS.team) || []).slice(0, 4);
    const sp = Math.min(90, (fw - 60) / Math.max(1, team.length + 1));
    const x0 = cx - (team.length * sp) / 2;
    team.forEach((l, i) => {
      const lum = new Lumino(this, x0 + i * sp, cy + 10, l.specie).setScrollFactor(0).setScale(0.55).setDepth(9760);
      layer.add(lum);
      this.tweens.add({ targets: lum, y: cy, yoyo: true, repeat: -1, duration: 800 + i * 90, ease: 'Sine.inOut' });
    });
    const pep = new Pepole(this, x0 + team.length * sp, cy + 10, { scala: 1.0 }).setScrollFactor(0).setDepth(9760);
    layer.add(pep);
    // Flash della "macchina fotografica".
    this.time.delayedCall(600, () => { this.cameras.main.flash(220, 255, 255, 255); audio.suono('vittoria'); musica.fanfara(); Juice.coriandoli(this, cx, cy - 40, 50); });
    // Sticker celebrativo nel profilo.
    if (window.GS) {
      window.GS.progressoEducativo = window.GS.progressoEducativo || { numeri: 0, parole: 0, logica: 0, stickers: [] };
      const sk = window.GS.progressoEducativo.stickers = window.GS.progressoEducativo.stickers || [];
      if (!sk.includes('campione-luminia')) sk.push('campione-luminia');
      salvaGS();
    }
    this.time.delayedCall(1200, () => layer.add(this.add.text(cx, cy + fh / 2 + 30, '🌟 Nuovo sticker: Campione di Luminia!', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5)));
    // Pulsante chiudi.
    this.time.delayedCall(1600, () => {
      const by = H * 0.84;
      const bg = this.add.rectangle(cx, by, 200, 52, 0x2c7a33).setScrollFactor(0).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true }).setDepth(9770);
      const bt = this.add.text(cx, by, '▶ Continua', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(9771);
      let chiuso = false;
      const chiudi = () => {
        if (chiuso) return; chiuso = true;
        audio.suono('tocco'); layer.destroy(); bg.destroy(); bt.destroy();
        this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true;
      };
      bg.on('pointerdown', chiudi);
      // FAILSAFE ANTI-BLOCCO: se il tap su "Continua" non viene registrato, il rettangolo
      // a tutto schermo (interattivo) resterebbe a mangiare ogni tocco e il watchdog, pur
      // sbloccando i flag, NON distrugge questo layer → schermo bloccato. Mi chiudo da solo.
      this.time.delayedCall(15000, chiudi);
    });
  }

  _evolviStarter() { this._evolviUnLumino('starter:evoluto'); }
  /** Evolve il primo Lumino del team che può evolversi (gate per flag unico). */
  _evolviUnLumino(flagGate) {
    const g = window.GS; if (!g || this._fatta(flagGate)) return;
    // Privilegia lo STARTER (se può ancora evolversi), altrimenti il primo evolvibile.
    const evolvibile = (l) => l && LUMINI[l.specie] && LUMINI[l.specie].evolveIn;
    const lum = (g.team || []).find((l) => l.specie === g.starter && evolvibile(l))
      || (g.team || []).find(evolvibile);
    if (!lum) { this._segna(flagGate); return; }
    const da = lum.specie, a = LUMINI[da].evolveIn;
    lum.specie = a; lum.nome = LUMINI[a].nome;
    if (g.starter === da) g.starter = a;   // segue lo starter lungo la linea evolutiva
    g.album = g.album || {};
    g.album[a] = { visto: true, catturato: true, quantita: 1, affezione: (g.album[da]?.affezione || 0) };
    // #17 — la forma precedente è EVOLUTA: non è più "posseduta" (resta vista nel
    // Lumidex). Senza questo, l'album contava sia la vecchia che la nuova forma → X/Y gonfiato.
    if (g.album[da]) {
      g.album[da].quantita = Math.max(0, (g.album[da].quantita || 1) - 1);
      if (g.album[da].quantita === 0) g.album[da].catturato = false;
      g.album[da].visto = true;
    }
    g.luminiCatturati = Object.keys(g.album).filter((k) => g.album[k] && g.album[k].catturato);
    this._segna(flagGate); salvaGS();
    voce.stop();
    this.scene.start('EvoluzioneScene', { da, a, ritorno: 'CittaScene' });
  }

  _festaMedaglia(testo = '🏅 Medaglia!', colore = 0x1f6f9c) {
    const m = this.add.text(this.W / 2, this.H * 0.4, testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#ffd23f', fontStyle: 'bold', stroke: colore, strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9700).setScale(0.2);
    this.tweens.add({ targets: m, scale: 1, duration: 500, ease: 'Back.out' });
    this.tweens.add({ targets: m, alpha: 0, delay: 2200, duration: 500, onComplete: () => m.destroy() });
    Juice.coriandoli(this, this.W / 2, this.H * 0.35, 36);
    this.cameras.main.flash(220, 255, 240, 180);
  }

  /** Demo VISIVA delle stelline (energia dei Lumini): Pepole spiega e si vedono
   *  le stelline entrare, svuotarsi (→ "stanco") e ricaricarsi. Poi "Ho capito!". */
  _demoStelline(cb) {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    const W = this.W, H = this.H, cx = W / 2, cy = H * 0.5;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(9400);
    layer.add(this.add.rectangle(cx, cy, W, H, 0x0a0814, 0.8).setInteractive());   // blocca il tasto Menu sotto
    layer.add(this.add.text(cx, H * 0.24, '⭐ Le stelline ⭐', { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5 }).setOrigin(0.5));
    layer.add(this.add.text(cx, H * 0.32, "Sono l'energia dei Lumini!", { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' }).setOrigin(0.5));
    const stelle = [];
    const sp = Math.min(64, W * 0.16), n = 5, x0 = cx - (n - 1) * sp / 2;
    for (let i = 0; i < n; i++) {
      const s = this.add.star(x0 + i * sp, cy, 5, 11, 22, 0xffd23f).setStrokeStyle(3, 0x8a4b1e).setScale(0);
      layer.add(s); stelle.push(s);
      this.tweens.add({ targets: s, scale: 1, duration: 300, delay: i * 120, ease: 'Back.out' });
    }
    voce.parla('lauri:stelline');
    audio.suono('stellina');
    // Si svuotano una a una (grigie; l'ultima rossa) → "stanco" → si ricaricano.
    this.time.delayedCall(1100, () => {
      let k = n - 1;
      const svuota = () => {
        if (k < 0) {
          const z = this.add.text(cx, cy - 56, '😴 ...solo un po\' stanco, niente paura!', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#7ad0ff', fontStyle: 'bold' }).setOrigin(0.5);
          layer.add(z);
          this.time.delayedCall(800, () => {
            stelle.forEach((s, i) => this.tweens.add({ targets: s, delay: i * 90, duration: 280, yoyo: true, scale: 1.25, onStart: () => s.setFillStyle(0x57c15a), onComplete: () => s.setFillStyle(0xffd23f) }));
            audio.suono('stellina');
          });
          return;
        }
        stelle[k].setFillStyle(k === 0 ? 0xff5d5d : 0x9aa0a6);
        this.tweens.add({ targets: stelle[k], scale: 0.8, duration: 200 });
        k--; this.time.delayedCall(340, svuota);
      };
      svuota();
    });
    // Pulsante "Ho capito!" (bersaglio a rettangolo → tap esatto).
    this.time.delayedCall(3200, () => {
      const bw = 210, bh = 54, by = H * 0.72;
      const g = this.add.graphics();
      g.fillStyle(0x2c7a33, 1); g.fillRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 14);
      g.lineStyle(3, 0x1c4a22, 1); g.strokeRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 14);
      layer.add(g);
      layer.add(this.add.text(cx, by, 'Ho capito! ▶', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
      const hit = this.add.rectangle(cx, by, bw, bh, 0xffffff, 0.001).setScrollFactor(0).setDepth(9500).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: g, alpha: 0.7, yoyo: true, repeat: -1, duration: 600 });
      hit.on('pointerdown', () => { audio.suono('tocco'); voce.stop(); layer.destroy(); hit.destroy(); this._inOverlay = false; if (cb) cb(); });
    });
  }

  /** Livello Pietropoli come SEQUENZA A STEP con ripresa: ogni tappa ha un flag,
   *  così uscendo e rientrando NON riparte da capo (riprende dalla tappa mancante).
   *  Tappe: incontro Pepole → Nonna dà la Lumiball (starter+conta) → fine livello.
   *  (Doda NON si incontra qui: la conosceremo più avanti, in un'altra città.) */
  _introPietropoli() {
    this._introInCorso = true;
    this._introStep();
  }

  /** Presentazione scenografica dell'eroe a inizio gioco (stile capo palestra): velo,
   *  Pietro entra dal basso con un balzo, nome del profilo + sottotitolo, scintille.
   *  Poi `cb` (il dialogo). Auto-avanza ~2.4s; tap per saltare (armato dopo 700ms). */
  _presentazioneEroe(cb) {
    const W = this.W, H = this.H;
    const nome = (window.GS && window.GS.profilo && window.GS.profilo.nome) || 'Pietro';
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(9500);
    const veil = this.add.rectangle(W / 2, H / 2, W, H, 0x0a0814, 0.8).setScrollFactor(0).setInteractive();
    layer.add(veil);
    const alone = this.add.graphics().setScrollFactor(0);
    alone.fillStyle(0xffd23f, 0.12); alone.fillCircle(W / 2, H * 0.55, Math.min(W, H) * 0.42);
    layer.add(alone);
    // Sprite del protagonista (per genere) che entra dal basso con un balzo.
    const texEroe = texGiocatore(this);
    let eroe;
    if (this.textures.exists(texEroe)) {
      eroe = this.add.image(W / 2, H * 0.62 + 90, texEroe).setScrollFactor(0).setAlpha(0);
      eroe.setScale(Math.min((H * 0.52) / (eroe.height || 200), (W * 0.5) / (eroe.width || 120)));
    } else {
      eroe = this.add.circle(W / 2, H * 0.58, 50, 0xff6b4a).setScrollFactor(0);
    }
    layer.add(eroe);
    this.tweens.add({ targets: eroe, y: H * 0.56, alpha: 1, duration: 480, ease: 'Back.out' });
    this.tweens.add({ targets: eroe, y: '-=10', yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut', delay: 520 });
    if (audio.suono) audio.suono('lancio');
    this.time.delayedCall(500, () => { if (layer.scene) { Juice.coriandoli(this, W / 2, H * 0.4, 26); if (audio.suono) audio.suono('stellina'); } });
    // Nome (grande, dorato) + sottotitolo "stile capo palestra".
    const nomeTxt = this.add.text(W / 2, H * 0.18, nome, {
      fontFamily: 'system-ui, sans-serif', fontSize: '40px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setScale(0.4).setAlpha(0);
    const sub = this.add.text(W / 2, H * 0.18 + 36, 'Aspirante Maestro del Lumimondo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#7ad0ff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setAlpha(0);
    layer.add([nomeTxt, sub]);
    this.tweens.add({ targets: nomeTxt, scale: 1, alpha: 1, duration: 420, ease: 'Back.out', delay: 240 });
    this.tweens.add({ targets: sub, alpha: 1, duration: 420, delay: 540 });

    let chiuso = false;
    const fine = () => {
      if (chiuso) return; chiuso = true;
      this.tweens.add({ targets: layer, alpha: 0, duration: 280, onComplete: () => { layer.destroy(); cb(); } });
    };
    this.time.delayedCall(2400, fine);
    this.time.delayedCall(700, () => { if (!chiuso) veil.once('pointerdown', fine); });
  }

  /** Sposta Pietro nella tappa successiva: mette un ALONE sul personaggio e lascia
   *  camminare; quando Pietro lo RAGGIUNGE (prossimità in update) parte la scenetta. */
  _guidaVerso(pos, colore, fn, opts = {}) {
    this.controllo.abilitato = true;     // libero di camminare verso l'alone
    const alone = Juice.alonePulsante(this, pos.x, pos.y, { colore, raggio: 56, depth: pos.y - 2 });
    // Sprite del personaggio alla destinazione. Serve quando NON è un NPC reale
    // durante l'intro (il bimbo della 1ª sfida è saltato nel loop NPC): senza,
    // Pietro camminerebbe verso un alone su terreno vuoto e parlerebbe col nulla.
    if (this._guidaAttore) { this._guidaAttore.destroy(); this._guidaAttore = null; }
    if (opts.tex && this.textures.exists(opts.tex)) {
      const cont = this.add.container(pos.x, pos.y).setDepth(pos.y);
      const img = this.add.image(0, 16, opts.tex).setOrigin(0.5, 1);   // piedi a y≈+16, come gli NPC
      const DISP_H = 92;
      img.setScale(DISP_H / (img.height || DISP_H));
      cont.add([creaOmbra(this, Math.max(34, img.displayWidth * 0.85), 16), img]);
      Juice.entrata(this, cont, { da: 0.3, dur: 420 });
      this._guidaAttore = cont;   // resta visibile durante il dialogo; la scena lo distrugge all'uscita
    }
    this._prox = { x: pos.x, y: pos.y, r: 150, alone, fn: () => { this.controllo.ferma(); this.controllo.abilitato = false; fn(); } };
  }

  _introStep() {
    // TAPPA 0 — INTRO DEL GIOCO (una sola volta): Pietro si presenta (col suo ritratto,
    // il nome del profilo compare come etichetta) e il narratore descrive brevemente il
    // gioco. Il "diventerò Maestro" sta QUI ora (prima era alla TAPPA 1, ridondante).
    if (!this._fatta('intro:gioco')) {
      this.controllo.ferma(); this.controllo.abilitato = false;
      // Presentazione scenografica (stile capo palestra): Pietro entra, nome + sottotitolo,
      // POI parla. Il nome è quello del profilo.
      this._presentazioneEroe(() => {
        this._dialogo([
          { id: 'pietro:presentazione', speaker: 'pietro' },
          { id: 'pietro:sogno', speaker: 'pietro' },
          { id: 'narratore:benvenuto', speaker: 'narratore' },
        ], () => { this._segna('intro:gioco'); this._introStep(); });
      });
      return;
    }
    // TAPPA 1 — cammina fino a Pepole; solo allora la saluta e lei si unisce.
    if (!this._fatta('pietropoli:pepole')) {
      this._guidaVerso(INTRO_PIETROPOLI.pepole, 0xffe08a, () => {
        this._dialogo([
          { id: 'pepole:saluto1', speaker: 'pepole' },
          { id: 'pietro:partenza', speaker: 'pietro' },
        ], () => {
          this._pepoleSalta();   // salta sulla spalla
          if (window.GS) { window.GS.amiciNelGruppo = Array.from(new Set([...(window.GS.amiciNelGruppo || []), 'pepole'])); salvaGS(); }
          this._segna('pietropoli:pepole'); this._introStep();
        });
      });
      return;
    }
    // TAPPA 2 — cammina dalla Nonna: ti dà la Lumiball (scelta starter + conta).
    if (!window.GS?.starter && !this._fatta('starter:scelto')) {
      this._guidaVerso(INTRO_PIETROPOLI.nonna, 0xffd23f, () => {
        this._dialogo([{ id: 'nonnatella:scrigno', speaker: 'nonnatella' }], () => {
          this._scrignoStarter((specie) => {
            this._segna('starter:scelto');   // punto di non ritorno: lo scrigno non si ripete
            this._dialogo([{ id: 'pietropoli:starter-' + specie, speaker: 'narratore' }, { id: 'nonnatella:conta', speaker: 'nonnatella' }], () => {
              this._contaLumini(5, () => {
                // La spiegazione delle stelline è stata spostata all'inizio del 1° combattimento
                // con Giorgio (vedi TAPPA 3): qui si chiude solo la conta.
                this._dialogo([{ id: 'nonnatella:conta-ok', speaker: 'nonnatella' }], () => this._introStep());
              });
            });
          });
        });
      });
      return;
    }
    // TAPPA 3 — PRIMA SFIDA REALE: raggiungi Giorgio, poi (prima che la battaglia cominci)
    // la spiegazione delle STELLINE (visivo + voce) e di COME SI GIOCA, poi la battaglia.
    if (!this._fatta('sfida:pietropoli-bimbo:vinta')) {
      this._guidaVerso(INTRO_PIETROPOLI.bimbo, 0x9ecbff, () => {
        this._demoStelline(() => {
          this._dialogo([
            { id: 'bimbo:sfida', speaker: 'bambino', nome: 'Giorgio' },
            { id: 'pepole:come-giocare', speaker: 'pepole' },   // come si gioca
            { id: 'lauri:tipi', speaker: 'pepole' },
            { id: 'lauri:incoraggia', speaker: 'pepole' },
          ], () => this._avviaBattaglia({ avversario: 'foglino', selvatico: false, idSfida: 'pietropoli-bimbo' }));
        });
      }, { tex: 'bimbo' });
      return;
    }
    // TAPPA 3.5 — vinta la 1ª sfida: Pepole spiega come funziona (allenatori risfidabili,
    // ✓ sul nome) PRIMA che finisca il livello.
    if (!this._fatta('pietropoli:spiegafine')) {
      this._segna('pietropoli:spiegafine');
      this._dialogo([{ id: 'pepole:come-funziona', speaker: 'pepole' }], () => this._introStep());
      return;
    }
    // TAPPA 4 — fine livello (torna alla mappa, Acquaverde sbloccata).
    if (window.GS) { window.GS.cittaCorrente = 'pietropoli'; salvaGS(); }
    this._segna('pietropoli:fatta');
    this._introInCorso = false;
    this._fineLivello('Pietropoli');
  }

  /** Pepole salta dalla piazza alla spalla di Pietro. */
  _pepoleSalta() {
    audio.suono('stellina');
    this.tweens.add({ targets: this.pepole, y: this.pietro.y - 70, duration: 220, yoyo: true, ease: 'Quad.out',
      onComplete: () => { this._pepoleConPietro = true; this.pepole.reagisci && this.pepole.reagisci(); } });
  }

  /** Fine livello: festicciola, Acquaverde si sblocca (via pietropoli:fatta) e si
   *  torna alla mappa, dove la bussola di Pepole punta alla città nuova. */
  _fineLivello(nome) {
    if (window.GS) window.GS.posCitta = null;   // livello finito: rientro dall'inizio
    Juice.coriandoli(this, this.W / 2, this.H * 0.4, 40);
    this.cameras.main.flash(200, 255, 245, 200);
    const m = this.add.text(this.W / 2, this.H * 0.42, `${nome} completata! 🎉`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9999);
    this.time.delayedCall(1600, () => {
      voce.stop();
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => this.scene.start('MappaMondoScene'));
    });
  }

  /** Vinta la medaglia: il livello è completo ma si resta a esplorare/catturare.
   *  Messaggio gentile + il cartello d'uscita lampeggia per ricordare come uscire. */
  _invitoUscita() {
    if (this.controllo) this.controllo.abilitato = true;
    this._bollaSchermo(this.W / 2, this.H * 0.2, 'Hai vinto la medaglia! 🎉\nEsplora e cattura ancora.\nQuando vuoi, esci dal cartello ↓');
    const c = this._cartelloUscita;
    if (c && c.scene) {
      // alone d'invito sul cartello + ingrandimento pulsante (si nota da lontano).
      Juice.alonePulsante(this, c.x, c.y - 19, { colore: 0x7ed957, raggio: 70, depth: c.depth + 2 });
      this.tweens.add({ targets: c, scaleX: 1.18, scaleY: 1.18, yoyo: true, repeat: 5, duration: 320, ease: 'Sine.inOut' });
    }
  }

  /** Dialogo in overlay con callback a fine. */
  _dialogo(battute, cb) {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    this.scene.pause();
    const dlg = this.scene.get('DialogoScene');
    // RIABILITA SEMPRE i comandi alla chiusura del dialogo (non delegarlo alla cb): se la
    // cb è vuota o non lo fa, prima Pietro restava fermo (freeze finché non interveniva il
    // watchdog a 7s). Le cb che rilanciano un altro overlay rimetteranno abilitato=false.
    dlg._onFine = () => { this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true; if (cb) cb(); };
    this.scene.launch('DialogoScene', { battute, parent: this.scene.key });
  }

  /** Scrigno con 3 Lumiballe colorate: il bambino sceglie lo starter. */
  /** Scelta starter: ora è una SCENA propria (StarterScene), camera pulita e
   *  bersagli a rettangolo → tap esatto (niente più aree cliccabili sfasate). */
  _scrignoStarter(cb) {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    voce.parla('pietropoli:scrigno-apre');
    this.scene.pause();
    const s = this.scene.get('StarterScene');
    s._onFine = (specie) => { this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true; salvaGS(); cb(specie); };
    this.scene.launch('StarterScene', { parent: this.scene.key });
  }

  // Momenti educativi SCRIPTATI: una sola conta, FORZATA al numero che il dialogo
  // nomina (Nonna "Cinque!" → 5 Lumini; bracciate → 4 gocce) così resta coerente.
  _contaLumini(quanti, cb) { this._quizEducativo(cb, { forza: { tipo: 'conta', n: quanti, tema: 'lumini' }, totale: 1 }); }
  _contaBracciate(quanti, cb) { this._quizEducativo(cb, { forza: { tipo: 'conta', n: quanti, tema: 'gocce' }, totale: 1 }); }
  // #51 — quiz dentro la storia: ponte dei fiori (Terraverde) e sequenza luci (Voltopoli).
  _contaFiori(quanti, cb) { this._quizEducativo(cb, { forza: { tipo: 'conta', n: quanti, tema: 'fiori' }, totale: 1 }); }
  _quizSequenzaLuci(cb) { this._quizEducativo(cb, { forza: { tipo: 'sequenza' }, totale: 1 }); }

  /** Lancia il mini-gioco educativo (QuizScene) come overlay e riprende al termine.
   *  `opts` (facoltativo): { forza, totale } per le conte scriptate; senza opts è
   *  il quiz vario (3 domande) usato da palestra/erba. */
  _quizEducativo(cb, opts) {
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    this.scene.pause();
    const q = this.scene.get('QuizScene');
    q._onFine = () => { this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true; if (cb) cb(); };
    this.scene.launch('QuizScene', { parent: this.scene.key, forza: opts?.forza || null, totale: opts?.totale || null });
  }

  /** Mini-gioco di conteggio interattivo (Lumini/bracciate che saltellano). */
  _conta(quanti, opts, cb) {
    this._inOverlay = true; this.controllo.abilitato = false;
    const layer = this.add.container(0, 0).setDepth(9500).setScrollFactor(0);
    const vel = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x0f2a12, 0.45).setScrollFactor(0).setInteractive();
    const titolo = this.add.text(this.W / 2, this.H * 0.14, opts.titolo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0);
    const contatore = this.add.text(this.W / 2, this.H * 0.22, '0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '40px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0);
    layer.add([vel, titolo, contatore]);
    voce.parla(opts.voceStart);

    let contati = 0;
    const specieGiardino = opts.specie;
    for (let i = 0; i < quanti; i++) {
      const x = this.W * (0.2 + 0.6 * Math.random());
      const y = this.H * (0.4 + 0.4 * Math.random());
      const lum = new Lumino(this, x, y, specieGiardino[i % specieGiardino.length]).setScrollFactor(0).setScale(0.6).setDepth(9510);
      lum.setSize(120, 120).setInteractive({ hitArea: new Phaser.Geom.Circle(0, 6, 64), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
      // Oscillazione lieve: bersaglio quasi fermo, facile da cliccare anche col mouse.
      this.tweens.add({ targets: lum, y: y - 6, yoyo: true, repeat: -1, duration: 650 + Math.random() * 300, ease: 'Sine.inOut' });
      layer.add(lum);
      lum._contato = false;
      lum.on('pointerdown', () => {
        if (lum._contato) return;
        lum._contato = true;
        contati++;
        contatore.setText(String(contati));
        audio.suono('stellina');                    // niente Web Speech: solo un suono allegro
        lum.lampeggia(0xffd23f, 250);
        const segno = this.add.text(lum.x, lum.y - 40, '✓', { fontSize: '26px', color: '#37c24a', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(9520);
        layer.add(segno);
        if (contati >= quanti) {
          this.time.delayedCall(700, () => { voce.parla(opts.voceFine); });
          this.time.delayedCall(1900, () => { layer.destroy(); this._inOverlay = false; cb(); });
        }
      });
    }
  }

  _zonaArena() {
    const e = this.citta.elemento;
    if (e === 'acqua') return 'acquatica';
    if (e === 'roccia') return 'rocciosa';
    return 'erbosa';
  }

  _hud() {
    const { width } = this.scale.gameSize;
    this.add.text(width / 2, 12, this.citta.nome, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },   // #82 — più contrasto
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9000);
    // UN SOLO tasto MENU (Mappa, Riposa, Squadra, Lumidex, Negozio, Medaglie, Salva
    // sono tutti dentro il menu → HUD pulita, niente bottoni sparsi).
    Juice.bottonePausa(this, width - 46, 46, '☰\nMenu');
  }

  /** #37 — Centro Lumini: overlay "sonnellino" che ricarica i Lumini a energia
   *  piena e SALVA i progressi (come un centro di cura). Dolce, niente posta in gioco. */
  _centroLumini() {
    if (this._inOverlay || this._inDialogo || this._inTransizione) return;
    this._inOverlay = true;
    this.controllo?.ferma(); if (this.controllo) this.controllo.abilitato = false;
    const W = this.W, H = this.H, cx = W / 2, cy = H * 0.5;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(9600);
    layer.add(this.add.rectangle(cx, cy, W, H, 0x0a1418, 0.86).setInteractive());   // blocca il tasto Menu sotto
    layer.add(this.add.text(cx, H * 0.22, '🏥 Centro Lumini', { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#9ed46a', fontStyle: 'bold', stroke: '#1c4a22', strokeThickness: 5 }).setOrigin(0.5));
    const sotto = this.add.text(cx, H * 0.30, 'I tuoi Lumini fanno un sonnellino… 💤', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5);
    layer.add(sotto);
    // Lumini della squadra che dormono (zzz).
    const team = ((window.GS && window.GS.team) || []).slice(0, 4);
    const sp = Math.min(96, W * 0.2);
    team.forEach((l, i) => {
      const x = cx + (i - (team.length - 1) / 2) * sp, y = cy;
      const lum = new Lumino(this, x, y, l.specie).setScrollFactor(0).setScale(0.7).setDepth(9610);
      layer.add(lum);
      const z = this.add.text(x + 20, y - 34, '💤', { fontSize: '18px' }).setScrollFactor(0).setDepth(9611);
      layer.add(z);
      this.tweens.add({ targets: lum, y: y + 6, yoyo: true, repeat: -1, duration: 1100 + i * 120, ease: 'Sine.inOut' });
      this.tweens.add({ targets: z, y: y - 50, alpha: 0.3, yoyo: true, repeat: -1, duration: 1300 });
    });
    if (!team.length) layer.add(this.add.text(cx, cy, 'Cattura un Lumino e torna a riposare! 🐾', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', align: 'center', wordWrap: { width: W - 80 } }).setOrigin(0.5));
    audio.suono('stellina');
    // Dopo il riposo: "carichi a mille!" + salvataggio.
    this.time.delayedCall(1600, () => {
      sotto.setText('Carichi a mille! ⭐ Progressi salvati 💾');
      if (window.GS) { window.GS.album = window.GS.album || {}; salvaGS(); }
      Juice.iconaSalvata(this);
      audio.suono('vittoria');
      const bw = 200, bh = 54, by = H * 0.74;
      const g = this.add.graphics();
      g.fillStyle(0x2c7a33, 1); g.fillRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 14);
      g.lineStyle(3, 0x16451c, 1); g.strokeRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 14);
      layer.add(g);
      layer.add(this.add.text(cx, by, '▶ Riprendi', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
      const hit = this.add.rectangle(cx, by, bw, bh, 0xffffff, 0.001).setScrollFactor(0).setDepth(9650).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { audio.suono('tocco'); layer.destroy(); hit.destroy(); this._inOverlay = false; if (this.controllo) this.controllo.abilitato = true; });
    });
  }

  _versoMappa() {
    if (this._inTransizione) return;
    this._inTransizione = true;
    this.controllo.ferma();
    if (window.GS) { window.GS.posCitta = null; salvaGS(); }   // ingresso successivo: dall'inizio
    voce.stop();
    this.cameras.main.fadeOut(350);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MappaMondoScene'));
  }

  update(time, delta) {
    if (!this.controllo || this._inTransizione || this._inDialogo) return;
    this.controllo.aggiorna(delta);

    // Acquaverde: la scenetta del lago scatta quando Pietro RAGGIUNGE il lago.
    if (this._introLagoPending && !this._inOverlay && this._lagoPos
        && Math.hypot(this.pietro.x - this._lagoPos.x, this.pietro.y - this._lagoPos.y) < 160) {
      this._introLagoPending = false;
      this._scenaLago();
    }

    // Prossimità generica (intro guidata: cammina fino al personaggio evidenziato).
    if (this._prox && !this._inOverlay && !this._inDialogo
        && Math.hypot(this.pietro.x - this._prox.x, this.pietro.y - this._prox.y) < this._prox.r) {
      const fn = this._prox.fn;
      if (this._prox.alone && this._prox.alone.destroy) this._prox.alone.destroy();
      this._prox = null;
      fn();
    }

    // Pepole: sulla spalla SOLO dopo averla incontrata; prima aspetta in piazza.
    if (this._pepoleConPietro) {
      const sign = this.pietro.direzione === 'sx' ? 1 : -1;
      this.pepole.setPosition(this.pietro.x + 26 * sign, this.pietro.y - 48);
      this.pepole.setDepth(this.pietro.depth + 1);
    }
    this.pepole.idle(time);

    if (this.pietro.inMovimento && time - (this._ultPolvere || 0) > 360) {
      this._ultPolvere = time;
      Juice.polvere(this, this.pietro.x, this.pietro.y + 18, { depth: this.pietro.depth - 1 });
      incrStat('passi');   // #70
    }
    // Pepole: si addormenta se Pietro resta fermo a lungo, altrimenti ogni tanto
    // saltella felice; si sveglia appena ci si muove.
    if (this.pietro.inMovimento) {
      this._idleDa = time;
      if (this.pepole._esprTex === 'pepole-dorme') this.pepole.setEspressione('normale');
    } else if (time - (this._idleDa || time) > 14000) {
      this.pepole.setEspressione('dorme');
    } else if (time > (this._prossimoEmote || 5000)) {
      this._prossimoEmote = time + 10000 + Math.random() * 6000;
      this.pepole.reagisci();
    }

    // "!" sugli NPC vicini.
    for (const n of this.npc) {
      const vicino = Math.hypot(this.pietro.x - n.x, this.pietro.y - n.y) < 130;
      n._excl.setVisible(vicino);
    }

    // #46/#64 — raccolta tesori e incontro col Lumino smarrito (prossimità).
    if (!this._inOverlay && !this._inDialogo) { this._aggiornaTesori(); this._aggiornaEvento(); this._aggiornaHM(); this._aggiornaMissione(); }
    if (this._civileObj) this._civileObj.excl.setVisible(Math.hypot(this.pietro.x - this._civileObj.x, this.pietro.y - this._civileObj.y) < 150);
    if (this._rivaleObj) this._rivaleObj.excl.setVisible(Math.hypot(this.pietro.x - this._rivaleObj.x, this.pietro.y - this._rivaleObj.y) < 160);

    // Uscita dal bordo basso → mappa (bloccata durante l'intro guidata).
    if (!this._introInCorso && this.pietro.y > H - 30) this._versoMappa();

    // #3 — "?" sui Lumini-ombra vicini (invito al tocco).
    if (this._luminiOmbra) {
      for (const o of this._luminiOmbra) {
        if (o.q) o.q.setVisible(Math.hypot(this.pietro.x - o.x, this.pietro.y - o.y) < 150);
      }
    }
  }

  /** #49 — Cartelli leggibili: il nome del luogo e un piccolo indizio (lettura). */
  _cartelli() {
    const segni = [
      // cartello uscita: ora è CLICCABILE (la freccia funziona → torna alla mappa).
      { x: W / 2 + 200, y: H - 170, righe: [this.citta.nome.toUpperCase(), '↓ alla Mappa'], onTap: () => this._versoMappa() },
    ];
    if (this.citta.leader) segni.push({ x: W * 0.5 + 170, y: 330, righe: ['PALESTRA', 'Sfida il Capo!'] });
    if (this.cittaId !== 'pietropoli') segni.push({ x: 150, y: 560, righe: ['LUMINI SELVATICI', 'Tocca le ombre!'] });
    for (const s of segni) { const c = this._unCartello(s.x, s.y, s.righe, s.onTap); if (s.onTap) this._cartelloUscita = c; }
  }

  _unCartello(x, y, righe, onTap) {
    const c = this.add.container(x, y).setDepth(y);
    const g = this.add.graphics();
    g.fillStyle(0x6b4a2a, 1); g.fillRect(-4, 0, 8, 46);                       // palo
    g.fillStyle(onTap ? 0x2c7a33 : 0xcaa46a, 1); g.fillRoundedRect(-58, -42, 116, 46, 8);   // asse (verde se cliccabile)
    g.lineStyle(3, 0x6b4a2a, 1); g.strokeRoundedRect(-58, -42, 116, 46, 8);
    c.add(g);
    c.add(this.add.text(0, -30, righe[0], { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: onTap ? '#ffffff' : '#3a2410', fontStyle: 'bold' }).setOrigin(0.5));
    if (righe[1]) c.add(this.add.text(0, -12, righe[1], { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: onTap ? '#dff5e3' : '#5a3b1a', fontStyle: 'bold' }).setOrigin(0.5));
    if (onTap) {
      // bersaglio a rettangolo (≥60px) + freccia pulsante per invitare al tocco.
      const hit = this.add.rectangle(x, y - 19, 120, 56, 0xffffff, 0.001).setDepth(y + 1).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); onTap(); });
      this.tweens.add({ targets: c, y: y - 4, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.inOut' });
    }
    return c;
  }

  /** #46 — Tesori nascosti: stelline/Lumiball dietro la vegetazione, con brillio al
   *  passaggio. Raccolti una volta sola (flag). */
  _tesori() {
    const spot = [
      { x: 160, y: 280, premio: 'stelline', n: 3 },
      { x: W - 180, y: H - 320, premio: 'lumiball', n: 1 },
    ];
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
  }

  _aggiornaTesori() {
    if (!this._tesoriAttivi) return;
    for (const t of this._tesoriAttivi) {
      if (t.preso) continue;
      if (Math.hypot(this.pietro.x - t.x, this.pietro.y - t.y) < 60) {
        t.preso = true;
        this._segna(t.flag);
        if (window.GS) {
          if (t.premio === 'lumiball') { window.GS.inventario = window.GS.inventario || {}; window.GS.inventario.lumiball = (window.GS.inventario.lumiball || 0) + t.n; }
          else window.GS.stelline = (window.GS.stelline || 0) + t.n;
          salvaGS();
        }
        audio.suono('stellina'); audio.suono('vittoria');
        Juice.coriandoli(this, t.x, t.y, 18);
        const msg = this.add.text(t.x, t.y - 30, t.premio === 'lumiball' ? '+1 Lumiball! ⚪' : '+' + t.n + ' ⭐', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', backgroundColor: '#2c7a33cc', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets: msg, y: msg.y - 24, alpha: 0, duration: 1000, onComplete: () => msg.destroy() });
        t.obj.destroy();
      }
    }
  }

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
    const x = 220, y = 480;
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
  }

  /** #44 — NPC ricorrente e ricco: "Nonna Pina" appare in ogni città con una
   *  battuta gentile (bolla visiva, niente voce di sistema) e un regalo una-tantum. */
  _civile() {
    const x = 980, y = 480;
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
  }

  /** Bolla di dialogo VISIVA in città (niente voce di sistema su testi non doppiati). */
  _bollaCitta(x, y, testo) {
    if (this._bolla) this._bolla.destroy();
    const c = this.add.container(x, y).setDepth(99990).setScrollFactor(this.cameras.main ? 1 : 1);
    const t = this.add.text(0, 0, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#3a2c22', align: 'center', wordWrap: { width: 220 } }).setOrigin(0.5);
    const g = this.add.graphics();
    const bw = Math.min(240, t.width + 24), bh = t.height + 16;
    g.fillStyle(0xfff6e3, 0.98); g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    g.lineStyle(3, 0x8a5a2e, 1); g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    c.add([g, t]);
    this._bolla = c;
    this.time.delayedCall(2600, () => { if (this._bolla === c) this._bolla = null; c.destroy(); });
  }

  /** PALLONCINI-INDOVINELLO: palloncini colorati che ondeggiano e che, TOCCATI,
   *  lanciano una domanda del trivia didattico (aritmetica/vocabolario per età) e poi
   *  SCOPPIANO con coriandoli. OPZIONALI ma piacevoli: niente punizioni (il quiz è
   *  gentile). Persistiti per-palloncino (flag storico `fiore:<id>:<i>`, conservato per
   *  i salvataggi), così non riappaiono una volta scoppiati. */
  _missione() {
    if (this._fatta('fioritrivia:' + this.cittaId)) return;   // tutti già scoppiati
    // Cartello-invito (non un obbligo).
    const seg = this.add.container(900, 600).setDepth(600);
    seg.add(this.add.text(0, 0, '🎈', { fontSize: '26px' }).setOrigin(0.5));
    seg.add(this.add.text(0, 24, 'Fai scoppiare i palloncini!', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fff', fontStyle: 'bold', backgroundColor: '#00000088', padding: { x: 4, y: 1 } }).setOrigin(0.5));
    this._fiori = [];
    const COLORI = [0xff5d73, 0x4db6ff, 0xffd23f, 0x7ed957, 0xb98cff, 0xff9e3d];
    const spot = [[260, 360], [700, 1050], [1040, 820], [480, 720]];
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
  }

  /** Tocco su un palloncino → indovinello didattico (1 domanda) → POP! Lontano: Pepole
   *  invita (gestito altrove). Tappabile da ovunque (niente gate di prossimità). */
  _toccaFiore(obj) {
    if (this._inDialogo || this._inOverlay || this._inTransizione || this._introInCorso || obj.fatto) return;
    obj.fatto = true; if (obj.q) obj.q.setVisible(false);
    this._quizEducativo(() => {
      this._segna(obj.flag);
      audio.suono('stellina');
      // POP! il palloncino si gonfia un istante e scoppia in coriandoli + anello-onda.
      if (obj.hit) obj.hit.destroy();
      this.tweens.add({
        targets: obj.cont, scaleX: 1.28, scaleY: 1.32, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          Juice.coriandoli(this, obj.x, obj.y, 14);
          const ring = this.add.circle(obj.x, obj.y, 24, obj.colore, 0).setStrokeStyle(4, obj.colore).setDepth(obj.y + 2).setScale(0.3);
          this.tweens.add({ targets: ring, scale: 1.9, alpha: 0, duration: 320, ease: 'Quad.out', onComplete: () => ring.destroy() });
          obj.cont.destroy();
        },
      });
      // Tutti i palloncini scoppiati → piccolo bonus dolce (mai obbligatorio).
      if (this._fiori && this._fiori.every((f) => f.fatto)) {
        this._segna('fioritrivia:' + this.cittaId);
        if (window.GS) { window.GS.stelline = (window.GS.stelline || 0) + 3; salvaGS(); }
        if (this._fioriSeg) { this._fioriSeg.destroy(); this._fioriSeg = null; }
      }
    }, { totale: 1 });
  }

  _aggiornaMissione() {
    if (!this._fiori) return;
    for (const f of this._fiori) {
      if (f.fatto || !f.q) continue;
      f.q.setVisible(Math.hypot(this.pietro.x - f.x, this.pietro.y - f.y) < 150);
    }
  }

  /** Quanti fiori-indovinello sono stati risolti in questa città (flag persistiti). */
  _fioriRaccolti() {
    let n = 0;
    for (let i = 0; i < 6; i++) if (this._fatta('fiore:' + this.cittaId + ':' + i)) n++;
    return n;
  }

  /** Messaggio GENTILE quando mancano palloncini per la palestra: dice esattamente
   *  quanti e indica i palloncini 🎈 (indovinelli) — mai un muro muto. */
  _messaggioGate(mancano) {
    audio.suono('tocco');
    voce.parla('pepole:vicino');
    // Tap-per-chiudere (default di _bollaSchermo): il bambino legge con calma.
    this._bollaSchermo(this.W / 2, this.H * 0.42,
      `🎈 Fai scoppiare ancora ${mancano} ${mancano === 1 ? 'palloncino' : 'palloncini'}\nper sfidare il Capo!`);
    // i palloncini brillano un attimo per farsi notare.
    for (const f of (this._fiori || [])) if (!f.fatto && f.cont) this.tweens.add({ targets: f.cont, scale: 1.35, yoyo: true, duration: 260, repeat: 2 });
  }

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
  }

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
  }

  /** Premio nascosto dietro l'ostacolo: stelline / oggetto (borsa) / un Lumino nuovo. */
  _premioOstacolo(premio, x, y) {
    if (!premio || !window.GS) return;
    let testo = '';
    if (premio.tipo === 'stelline') {
      const n = premio.n || 3; window.GS.stelline = (window.GS.stelline || 0) + n; testo = `+${n} ⭐`;
    } else if (premio.tipo === 'oggetto') {
      window.GS.inventario = window.GS.inventario || {};
      const n = premio.n || 1; window.GS.inventario[premio.id] = (window.GS.inventario[premio.id] || 0) + n; testo = `+${n} ${premio.id}`;
    } else if (premio.tipo === 'lumino') {
      window.GS.album = window.GS.album || {};
      const v = window.GS.album[premio.specie] || { visto: true, catturato: false, quantita: 0, affezione: 0 };
      v.visto = true; v.catturato = true; v.quantita = (v.quantita || 0) + 1; window.GS.album[premio.specie] = v;
      testo = `Nuovo amico: ${(LUMINI[premio.specie] || {}).nome || premio.specie}!`;
    }
    salvaGS();
    if (testo) {
      const t = this.add.text(x, y - 22, testo, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 4 }).setOrigin(0.5).setDepth(9999);
      this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 1000, duration: 900, onComplete: () => t.destroy() });
    }
  }

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
  }

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
  }

  _aggiornaHM() {
    const h = this._hm;
    if (!h || h.fatto) return;
    if (Math.hypot(this.pietro.x - h.x, this.pietro.y - h.y) > 90) return;
    h.fatto = true;
    const team = (window.GS && window.GS.team) || [];
    const aiutante = team.map((l) => LUMINI[l.specie]).find((b) => b && b.elemento === h.el);
    if (aiutante) {
      const ab = (aiutante.abilitaEsplorativa && aiutante.abilitaEsplorativa.nome) || 'la sua abilità';
      this._segna('hm:' + this.cittaId);
      if (window.GS) { window.GS.stelline = (window.GS.stelline || 0) + 4; salvaGS(); }
      audio.suono('mossaSpeciale'); audio.suono('vittoria');
      Juice.coriandoli(this, h.x, h.y, 22);
      const msg = this.add.text(h.x, h.y - 50, `${aiutante.nome} usa ${ab}! ${h.conf.azione}. +4 ⭐`, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', backgroundColor: '#2c7a33dd', padding: { x: 8, y: 4 }, align: 'center', wordWrap: { width: 240 } }).setOrigin(0.5).setDepth(9999);
      this.tweens.add({ targets: h.obj, alpha: 0, scale: 0.4, duration: 600, onComplete: () => h.obj.destroy() });
      this.tweens.add({ targets: msg, y: msg.y - 24, alpha: 0, delay: 1100, duration: 800, onComplete: () => msg.destroy() });
    } else {
      h.fatto = false;   // riprovabile: torna quando hai il Lumino giusto
      if (this.time.now - (this._hmHint || 0) > 4000) {
        this._hmHint = this.time.now;
        const nomi = { roccia: 'Roccia', acqua: 'Acqua', natura: 'Erba', elettricita: 'Elettricità' }[h.el] || h.el;
        const msg = this.add.text(h.x, h.y - 50, `Serve un amico di ${nomi}!`, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', backgroundColor: '#00000099', padding: { x: 8, y: 4 } }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets: msg, y: msg.y - 18, alpha: 0, delay: 800, duration: 800, onComplete: () => msg.destroy() });
      }
    }
  }

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
  }

  _aggiornaEvento() {
    const e = this._eventoLumino;
    if (!e || e.preso) return;
    if (Math.hypot(this.pietro.x - e.lum.x, this.pietro.y - e.lum.y) < 70) {
      e.preso = true;
      if (window.GS) { window.GS.stelline = (window.GS.stelline || 0) + 3; salvaGS(); }
      audio.suono('stellina');
      e.ex.setText('❤'); this.pepole?.reagisci();
      const msg = this.add.text(e.lum.x, e.lum.y - 40, 'Grazie! +3 ⭐', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', backgroundColor: '#c0392bcc', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(9999);
      Juice.coriandoli(this, e.lum.x, e.lum.y, 16);
      this.tweens.add({ targets: [e.lum, e.ex], alpha: 0, y: '-=30', delay: 700, duration: 700, onComplete: () => { e.lum.destroy(); e.ex.destroy(); } });
      this.tweens.add({ targets: msg, y: msg.y - 24, alpha: 0, delay: 400, duration: 900, onComplete: () => msg.destroy() });
    }
  }
}
