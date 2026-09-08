/* PreloadScene — genera gli asset procedurali (texture tile) e mostra una
 * barra di caricamento. Poi avvia la scena target: in modalità demo legge
 * ?demo=... dalla URL; altrimenti MenuScene. */

import { generaTextureErba, generaTextureStrada } from '../gfx.js';
import * as Juice from '../juice.js';
import { inizializzaGS } from '../../gs.js';
import { avviaSyncAutomatica } from '../../sync.js';

// Tutti i 21 Lumini in PNG (starter ×3 + le 4 linee selvatiche ×3). Caricati come
// `lum-<specie>`; se manca il file resta il procedurale (lumino.js).
const LUM_PNG = [
  'fiammino', 'fiammantor', 'pyronex', 'guscetto', 'idronix', 'aquarex',
  'foglino', 'floranyx', 'selvarex', 'brizzo', 'ventrix', 'ciclonyx',
  'buzzino', 'buzzetto', 'buzzone', 'zappix', 'voltrik', 'fulminex',
  'roccolo', 'granitor', 'titanrock',
];

const DEMO_MAP = {
  playground: 'PlaygroundScene',
  movimento: 'PlaygroundScene',
  mappa: 'MappaMondoScene',
  citta: 'CittaScene',
  dialogo: 'DialogoScene',
  battaglia: 'BattagliaScene',
  apertura: 'AperturaScene',
  album: 'AlbumScene',
  evoluzione: 'EvoluzioneScene',
  coccole: 'CoccoleScene',
  gara: 'GaraScene',
};

export class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    // Un 404 su un asset OPZIONALE non deve bloccare il caricamento: si userà il
    // fallback procedurale. (Phaser continua comunque, qui silenziamo solo il log.)
    this.load.on('loaderror', () => {});

    // ===== ASSET OPZIONALI (caricati SE presenti; altrimenti fallback) =========
    // Lumini in PNG → assets/lumini/<specie>.png. Se manca, il Lumino resta
    // disegnato in modo procedurale (lumino.js). Copri starter + evoluzioni + altri.
    for (const s of LUM_PNG) {
      this.load.image('lum-' + s, 'assets/lumini/' + s + '.png');
    }
    // Tier 3 — arte custom dei Lumini AGGIUNTI dal pannello: provo a caricare il PNG
    // dal volume (servito override-first dal server). Se assente, 404 innocuo → procedurale.
    for (const s of (window.__luminiCustom || [])) {
      if (!LUM_PNG.includes(s) && /^[a-z0-9_-]+$/i.test(s)) this.load.image('lum-' + s, 'assets/lumini/' + s + '.png');
    }
    // #94 — gli SFONDI pesanti (~21MB: mappa, arena, 6 città) NON si caricano qui:
    // li carica lazy la scena che li usa (MappaMondoScene/BattagliaScene/CittaScene.preload),
    // così il boot fino al menu è quasi istantaneo. (Restano i Lumini/oggetti, leggeri.)
    // (Vista laterale di Pietro non prodotta: la camminata L/R usa il fronte specchiato.
    //  Asset rimossi dal preload per non generare 404 a ogni boot — audit.)

    // Sprite PNG anime dei personaggi (sfondo trasparente). Sostituiscono le
    // forme procedurali di Pietro, Pepole, Doda (ex Lauri) e Ale (ex Nico).
    // Caricati qui → texture globali disponibili in tutte le Scene.
    this.load.image('pietro', 'assets/personaggi/pietro.png');
    // Frame di camminata di Pietro (opzionali: se mancano, si usa solo 'pietro').
    this.load.image('pietro-fronte-passo', 'assets/personaggi/pietro-fronte-passo.png');
    this.load.image('pietro-retro', 'assets/personaggi/pietro-retro.png');
    this.load.image('pietro-retro-passo', 'assets/personaggi/pietro-retro-passo.png');
    // VISTA LATERALE di Pietro — come la femmina ('pietra-lato*'). Appena i 2 PNG
    // esistono in assets/personaggi/ (spec in ASSET_DA_PRODURRE.md §3), TOGLI il
    // commento qui sotto: pietro.js (_aggiornaTextura) userà da solo il profilo ai
    // lati (idle↔passo), identico a 'pietra'. NON caricarli finché i file non ci sono
    // (un file mancante genera un 404 a ogni boot).
    // this.load.image('pietro-lato', 'assets/personaggi/pietro-lato.png');
    // this.load.image('pietro-lato-passo', 'assets/personaggi/pietro-lato-passo.png');
    // Protagonista FEMMINA (profilo "bimba"): fronte, retro, laterale + busto dialoghi.
    this.load.image('pietra', 'assets/personaggi/pietra.png');
    this.load.image('pietra-retro', 'assets/personaggi/pietra-retro.png');
    this.load.image('pietra-lato', 'assets/personaggi/pietra-lato.png');
    this.load.image('pietra-lato-passo', 'assets/personaggi/pietra-lato-passo.png');
    this.load.image('pietra-busto', 'assets/personaggi/pietra_busto.png');
    this.load.image('ale', 'assets/personaggi/ale.png');
    this.load.image('doda', 'assets/personaggi/doda.png');
    this.load.image('pepole', 'assets/personaggi/pepole.png');
    // Nonna Tella (intera nel mondo, busto nei dialoghi) e bimbo (1ª sfida).
    this.load.image('nonnatella', 'assets/personaggi/nonnatella.png');
    this.load.image('nonnatella-busto', 'assets/personaggi/nonnatella_busto.png');
    this.load.image('bimbo', 'assets/personaggi/bimbo_inizio.png');
    // Allenatori vari (#7): 8 maschi + 3 femmine, sprite PNG anime al posto dei bambini
    // procedurali. Assegnati per-NPC (gender-matched) in CittaScene → niente più cloni.
    for (let i = 1; i <= 8; i++) this.load.image('bimbo' + i, 'assets/personaggi/bimbo' + i + '.png');
    for (let i = 1; i <= 3; i++) this.load.image('bimba' + i, 'assets/personaggi/bimba' + i + '.png');
    // Capipalestra (OPZIONALI, vedi ASSET_DA_PRODURRE §6): se il PNG c'è si attiva da
    // solo, altrimenti resta il ritratto procedurale (nessun errore bloccante).
    for (const ld of ['marina', 'silvio', 'rik', 'rocco', 'maestro']) {
      this.load.image(ld, 'assets/personaggi/' + ld + '.png');
    }
    // Pepole come Lumino schierabile in battaglia (#26): stesso sprite cane.
    this.load.image('lum-pepole', 'assets/personaggi/pepole.png');
    // Espressioni di Pepole (opzionali: se mancano si usa 'pepole').
    this.load.image('pepole-felice', 'assets/personaggi/pepole-felice.png');
    this.load.image('pepole-sorpresa', 'assets/personaggi/pepole-sorpresa.png');
    this.load.image('pepole-dorme', 'assets/personaggi/pepole-dorme.png');
    this.load.image('pepole-incoraggia', 'assets/personaggi/pepole-incoraggia.png');

    // Oggetti scontornati (leggeri, usati ovunque). Gli sfondi grandi sono lazy (#94).
    this.load.image('obj-casa', 'assets/oggetti/casa.png');
    this.load.image('obj-palestra', 'assets/oggetti/palestra.png');
    this.load.image('obj-scrigno', 'assets/oggetti/scrigno.png');
    this.load.image('obj-lumiball', 'assets/oggetti/lumiball.png');
    // Lumiball colorate per la scelta dello starter: solo la base ricolorata (rosso/
    // verde/blu), bianco e oro intatti. Niente più setTint che sbiadiva il bianco.
    this.load.image('obj-lumiball-rosso', 'assets/oggetti/lumiball-rosso.png');
    this.load.image('obj-lumiball-verde', 'assets/oggetti/lumiball-verde.png');
    this.load.image('obj-lumiball-blu', 'assets/oggetti/lumiball-blu.png');
    this.load.image('obj-erba-alta', 'assets/oggetti/erba-alta.png');
    this.load.image('obj-albero', 'assets/oggetti/albero.png');
    this.load.image('obj-casa-mappa', 'assets/oggetti/casa-mappa.png');   // casetta nodi-città (tinta per città)
  }

  create() {
    const { width, height } = this.scale.gameSize;

    // Barra di caricamento (gli asset sono procedurali → quasi istantaneo).
    const barW = Math.min(280, width * 0.7);
    this.add.rectangle(width / 2, height / 2, barW + 8, 22, 0x000000, 0.4);
    const barra = this.add.rectangle(width / 2 - barW / 2, height / 2, 2, 16, 0xffd23f)
      .setOrigin(0, 0.5);
    const titolo = this.add.text(width / 2, height / 2 - 34, 'Lumimondo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#ffd23f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    // Caricamento più vivo: scintille + stella che rimbalza sopra il titolo.
    Juice.particelleAmbiente(this, { n: 10, colore: 0xfff0b8, depth: 0 });
    const stella = this.add.star(width / 2, height / 2 - 78, 5, 8, 18, 0xffd23f).setStrokeStyle(3, 0x8a4b1e);
    this.tweens.add({ targets: stella, y: stella.y - 12, angle: 20, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
    this.tweens.add({ targets: titolo, scaleX: 1.06, scaleY: 1.06, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });

    // Texture procedurali condivise.
    generaTextureErba(this, 'erba');
    generaTextureErba(this, 'erba-alta', '#5fb049');
    generaTextureStrada(this, 'strada');

    // Filtro LINEAR su sprite, sfondi e oggetti (illustrazioni morbide, non pixel
    // art) → ridimensionamento smooth, niente bordi sgranati alla minificazione.
    const chiaviFisse = ['pietro', 'pietro-fronte-passo', 'pietro-retro', 'pietro-retro-passo',
      'pietra', 'pietra-retro', 'pietra-lato', 'pietra-lato-passo', 'pietra-busto',
      'ale', 'doda', 'pepole', 'pepole-felice', 'pepole-sorpresa',
      'pepole-dorme', 'pepole-incoraggia', 'lum-pepole', 'nonnatella', 'nonnatella-busto', 'bimbo',
      'bimbo1', 'bimbo2', 'bimbo3', 'bimbo4', 'bimbo5', 'bimbo6', 'bimbo7', 'bimbo8', 'bimba1', 'bimba2', 'bimba3',
      'marina', 'silvio', 'rik', 'rocco', 'maestro',
      'obj-casa', 'obj-palestra', 'obj-scrigno', 'obj-lumiball', 'obj-lumiball-rosso', 'obj-lumiball-verde', 'obj-lumiball-blu', 'obj-erba-alta', 'obj-albero', 'obj-casa-mappa'];
    const chiaviOpz = [];
    for (const s of LUM_PNG) chiaviOpz.push('lum-' + s);
    for (const k of [...chiaviFisse, ...chiaviOpz]) {
      if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    this.tweens.add({
      targets: barra, width: barW, duration: 350, ease: 'Sine.out',
      onComplete: () => this._avvia(),
    });
  }

  _avvia() {
    const params = new URLSearchParams(location.search);
    const demo = params.get('demo');
    if (demo && DEMO_MAP[demo]) {
      // Demo: serve GS subito (profilo placeholder) + sync, poi vai alla scena demo.
      inizializzaGS('pietro');
      if (window.__quizPool && window.GS) window.GS.quizPool = window.__quizPool;
      try { avviaSyncAutomatica(); } catch { /* offline */ }
      this.scene.start(DEMO_MAP[demo], { demo: true, sub: params.get('sub') });
      return;
    }
    // Gioco normale: prima l'apertura (cinematica), poi la scelta del profilo.
    this.scene.start('AperturaScene');
  }
}
