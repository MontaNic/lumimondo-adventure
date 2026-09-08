/* AlbumScene — l'album dei Lumini in stile libro sfogliabile (P1-12).
 *
 * Una pagina per linea evolutiva (3 Lumini) + una pagina speciale (Pepole,
 * Buzzetto). Catturato → sprite a colori; visto ma non catturato → silhouette;
 * mai visto → "?". Pepole ha il cuoricino "Per sempre cucciola!".
 * Frecce per sfogliare con animazione di pagina.
 */

import { LUMINI, LINEE } from '../../lumini-data.js';
import { CITTA, ORDINE_CITTA, ZONE } from '../../citta-data.js';
import { Lumino } from '../lumino.js';
import { Pepole } from '../pepole-actor.js';
import { col, shade } from '../gfx.js';
import * as Juice from '../juice.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import { salvaGS } from '../../gs.js';

export class AlbumScene extends Phaser.Scene {
  constructor() { super('AlbumScene'); }

  init(data) { this.ritorno = (data && data.ritorno) || 'MenuScene'; this.dormiente = !!(data && data.dormiente); }

  /** #18 — torna alla scena chiamante: se "dorme" la RISVEGLIA (stato preservato),
   *  altrimenti la riavvia. */
  _torna() {
    voce.stop();
    if (this.dormiente && this.scene.isSleeping(this.ritorno)) { this.scene.stop(); this.scene.wake(this.ritorno); }
    else this.scene.start(this.ritorno);
  }

  /** Riparazione retroattiva (vecchi save): quando un Lumino si evolveva, la sua
   *  PRE-EVOLUZIONE veniva marcata catturato=false e spariva dal Lumidex. Qui, per ogni
   *  Lumino posseduto, risaliamo la catena `evolveDa` e rimettiamo nel Lumidex le forme
   *  precedenti che avevi GIÀ VISTO (così catturare un evoluto selvatico non regala
   *  forme mai incontrate). Il fix in avanti è in EvoluzioneScene. */
  _riparaLineeEvolutive() {
    const album = window.GS && window.GS.album;
    if (!album) return;
    let cambiato = false;
    for (const sp of Object.keys(album)) {
      if (!album[sp] || !album[sp].catturato) continue;
      let cur = LUMINI[sp];
      while (cur && cur.evolveDa) {
        const a = album[cur.evolveDa];
        if (a && a.visto && !a.catturato) { a.catturato = true; cambiato = true; }
        cur = LUMINI[cur.evolveDa];
      }
    }
    if (cambiato) { window.GS.luminiCatturati = Object.keys(album).filter((k) => album[k] && album[k].catturato); salvaGS(); }
  }

  create() {
    const { width, height } = this.scale.gameSize;
    this.W = width; this.H = height;
    this.cameras.main.setBackgroundColor('#e9d8b0');
    this._riparaLineeEvolutive();   // pre-evoluzioni di Lumini posseduti restano nel Lumidex

    // Pagine: 6 linee + 1 pagina speciale.
    this.pagine = Object.keys(LINEE).map((linea) => ({ titolo: this._titoloLinea(linea), specie: LINEE[linea] }));
    this.pagine.push({ titolo: 'Amici speciali', specie: ['pepole', 'buzzetto'] });
    this.indice = 0;

    // Cornice libro.
    const g = this.add.graphics();
    g.fillStyle(col('#a9824b'), 1); g.fillRoundedRect(10, 60, width - 20, height - 130, 18);
    g.fillStyle(col('#f3e6c4'), 1); g.fillRoundedRect(22, 72, width - 44, height - 154, 12);

    this.titolo = this.add.text(width / 2, 26, '📖 Album dei Lumini', {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#5a3b1a', fontStyle: 'bold',
    }).setOrigin(0.5);
    // Progresso: quanti Lumini hai catturato sul totale.
    const album = (window.GS && window.GS.album) || {};
    const catt = Object.values(album).filter((v) => v && v.catturato).length;
    const tot = Object.keys(LUMINI).length;
    this.add.text(width / 2, 48, `📚 Catturati: ${catt} / ${tot}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#6a4717', fontStyle: 'bold',
    }).setOrigin(0.5);
    // #60 — barra di completamento album.
    const barW = Math.min(260, width - 80), barX = width / 2 - barW / 2, barY = 62;
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.18); bar.fillRoundedRect(barX, barY, barW, 10, 5);
    bar.fillStyle(0x57c15a, 1); bar.fillRoundedRect(barX, barY, Math.max(6, barW * (catt / tot)), 10, 5);
    bar.lineStyle(2, 0x7a521f, 0.8); bar.strokeRoundedRect(barX, barY, barW, 10, 5);

    this.contenuto = this.add.container(0, 0);

    // Frecce + indietro.
    this.frecciaSx = this._freccia(40, height / 2, '‹', () => this._sfoglia(-1));
    this.frecciaDx = this._freccia(width - 40, height / 2, '›', () => this._sfoglia(1));
    const b = this.add.rectangle(64, height - 34, 110, 48, 0x5a3b1a).setStrokeStyle(3, 0x3a2410).setInteractive({ useHandCursor: true });
    this.add.text(64, height - 34, '‹ Esci', { fontFamily: 'system-ui', fontSize: '18px', color: '#fff' }).setOrigin(0.5);
    Juice.popBottone(this, b);
    b.on('pointerdown', () => this._torna());
    this.pagDot = this.add.text(width / 2, height - 30, '', { fontFamily: 'system-ui', fontSize: '14px', color: '#5a3b1a' }).setOrigin(0.5);

    // Atmosfera: pulviscolo dorato sulla pergamena.
    Juice.particelleAmbiente(this, { n: 8, colore: 0xd8b878, depth: 50 });
    this._render();
  }

  _titoloLinea(linea) {
    const nomi = { fuoco: 'Linea del Fuoco', acqua: 'Linea dell\'Acqua', natura: 'Linea dell\'Erba', elettricita: 'Linea dell\'Elettricità', roccia: 'Linea della Roccia', aria: 'Linea dell\'Aria' };
    return nomi[linea] || linea;
  }

  _freccia(x, y, ch, cb) {
    const c = this.add.circle(x, y, 26, 0x5a3b1a, 0.9).setInteractive({ useHandCursor: true });
    this.add.text(x, y - 2, ch, { fontFamily: 'system-ui', fontSize: '34px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    Juice.popBottone(this, c);
    c.on('pointerdown', cb);
    return c;
  }

  _sfoglia(dir) {
    const next = Phaser.Math.Clamp(this.indice + dir, 0, this.pagine.length - 1);
    if (next === this.indice) return;
    // Animazione "pagina che gira".
    this.tweens.add({
      targets: this.contenuto, scaleX: 0, duration: 160, ease: 'Quad.in',
      onComplete: () => { this.indice = next; this._render(); this.contenuto.scaleX = 0; this.tweens.add({ targets: this.contenuto, scaleX: 1, duration: 160, ease: 'Quad.out' }); },
    });
  }

  _render() {
    this.contenuto.removeAll(true);
    const pag = this.pagine[this.indice];
    const album = window.GS?.album || {};
    this.pagDot.setText(`${this.indice + 1} / ${this.pagine.length}`);

    const t = this.add.text(this.W / 2, 92, pag.titolo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#7a521f', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.contenuto.add(t);

    const n = pag.specie.length;
    pag.specie.forEach((specie, i) => {
      const x = this.W * ((i + 1) / (n + 1));
      const y = this.H * 0.46;
      const voceA = album[specie] || {};
      const cella = this.add.container(x, y);
      const base = LUMINI[specie] || {};

      if (voceA.catturato || specie === 'pepole') {
        // A colori.
        const sprite = specie === 'pepole' ? new Pepole(this, 0, 0, { scala: 1.2 }) : new Lumino(this, 0, 0, specie).setScale(0.8);
        cella.add(sprite);
        cella.add(this.add.text(0, 64, base.nome || specie, { fontFamily: 'system-ui', fontSize: '16px', color: '#5a3b1a', fontStyle: 'bold' }).setOrigin(0.5));
        if (specie === 'pepole') cella.add(this.add.text(0, 84, '❤ Per sempre cucciola!', { fontFamily: 'system-ui', fontSize: '13px', color: '#d3457a' }).setOrigin(0.5));
        if (specie !== 'pepole') this._stelleAffezione(cella, voceA.affezione || 0);
        // #59 — variante speciale: scintilla dorata d'angolo.
        if (voceA.variante) {
          const sp = this.add.text(34, -40, '✨', { fontSize: '20px' }).setOrigin(0.5);
          cella.add(sp);
          this.tweens.add({ targets: sp, scale: 1.3, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
        }
      } else if (voceA.visto) {
        // Silhouette.
        const s = this.add.graphics();
        s.fillStyle(0x4a3a28, 1); s.fillCircle(0, 6, 40);
        s.fillStyle(0x33271a, 1); s.fillCircle(0, -10, 16);
        cella.add(s);
        cella.add(this.add.text(0, 64, '???', { fontFamily: 'system-ui', fontSize: '16px', color: '#7a6a52', fontStyle: 'bold' }).setOrigin(0.5));
      } else {
        // Sconosciuto.
        const slot = this.add.graphics();
        slot.lineStyle(3, 0xb59a6a, 1); slot.strokeRoundedRect(-44, -42, 88, 96, 12);
        slot.fillStyle(0xc9b187, 0.4); slot.fillRoundedRect(-44, -42, 88, 96, 12);
        cella.add(slot);
        cella.add(this.add.text(0, 0, '?', { fontFamily: 'system-ui', fontSize: '40px', color: '#b59a6a', fontStyle: 'bold' }).setOrigin(0.5));
      }
      this.contenuto.add(cella);
      // #57 — tocco su un Lumino conosciuto → scheda (elemento, descrizione, dove
      // si trova) + verso/animazione. Niente per gli sconosciuti.
      if (voceA.catturato || voceA.visto || specie === 'pepole') {
        const hit = this.add.rectangle(x, y, 100, 150, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this._dettaglio(specie, !!(voceA.catturato || specie === 'pepole')));
        this.contenuto.add(hit);
      }
    });

    // #61 — famiglie evolutive: frecce tra una forma e la successiva (solo pagine-linea).
    if (this.indice < this.pagine.length - 1 && n > 1) {
      for (let i = 0; i < n - 1; i++) {
        const xa = this.W * ((i + 1) / (n + 1)), xb = this.W * ((i + 2) / (n + 1));
        this.contenuto.add(this.add.text((xa + xb) / 2, this.H * 0.46, '→', {
          fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#a9824b', fontStyle: 'bold',
        }).setOrigin(0.5));
      }
    }

    this.frecciaSx.setAlpha(this.indice > 0 ? 1 : 0.3);
    this.frecciaDx.setAlpha(this.indice < this.pagine.length - 1 ? 1 : 0.3);
  }

  /** #57 — Lumidex arricchito: scheda con elemento, descrizione e "dove si trova"
   *  (dalle zone selvatiche). Per i catturati gioca un verso + animazione. */
  _dettaglio(specie, catturato) {
    if (this._scheda) { this._scheda.destroy(); this._scheda = null; }
    const base = LUMINI[specie] || {};
    const EMO = { fuoco: '🔥', acqua: '💧', natura: '🌿', elettricita: '⚡', roccia: '🪨', aria: '🌬️', mistero: '❓' };
    const layer = this.add.container(0, 0).setDepth(200);
    layer.add(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x2a1d12, 0.62).setInteractive());
    const pw = Math.min(360, this.W - 40), ph = Math.min(380, this.H - 80), px = this.W / 2, py = this.H / 2;
    const g = this.add.graphics();
    g.fillStyle(0xf3e6c4, 1); g.fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 18);
    g.lineStyle(4, 0x8a5a2e, 1); g.strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 18);
    layer.add(g);
    // Sprite + verso.
    const sprite = specie === 'pepole' ? new Pepole(this, px, py - ph / 2 + 70, { scala: 1.1 }) : new Lumino(this, px, py - ph / 2 + 70, specie).setScale(0.8);
    layer.add(sprite);
    if (audio.motivo) audio.motivo(specie); else audio.suono('stellina');   // #74 — verso = leitmotiv
    if (sprite.reagisci) sprite.reagisci(); else if (sprite.lampeggia) sprite.lampeggia(0xffd23f, 300);
    layer.add(this.add.text(px, py - ph / 2 + 128, (base.nome || specie) + '   ' + (EMO[base.elemento] || ''), {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#5a3b1a', fontStyle: 'bold',
    }).setOrigin(0.5));
    const desc = base.personalita || (base.abilitaEsplorativa && base.abilitaEsplorativa.descrizione) || 'Un Lumino misterioso.';
    layer.add(this.add.text(px, py - ph / 2 + 156, desc, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#5a3b1a', align: 'center', wordWrap: { width: pw - 40 }, lineSpacing: 3,
    }).setOrigin(0.5, 0));
    const dove = this._doveSiTrova(specie);
    layer.add(this.add.text(px, py + ph / 2 - 70, '📍 Dove si trova:\n' + (dove.length ? dove.join(', ') : 'Ancora un mistero…'), {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#7a521f', fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 40 },
    }).setOrigin(0.5, 0));
    const chiudi = this.add.text(px + pw / 2 - 22, py - ph / 2 + 18, '✕', { fontFamily: 'system-ui', fontSize: '22px', color: '#8a5a2e', fontStyle: 'bold' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    layer.add(chiudi);
    const close = () => { layer.destroy(); this._scheda = null; };
    chiudi.on('pointerdown', close);
    layer.list[0].on('pointerdown', close);   // tap fuori
    this._scheda = layer;
  }

  _doveSiTrova(specie) {
    const luoghi = [];
    for (const id of ORDINE_CITTA) { const c = CITTA[id]; if (c.luminiSelvatici && c.luminiSelvatici.includes(specie)) luoghi.push(c.nome); }
    for (const z of ZONE) { if (z.luminiSelvatici && z.luminiSelvatici.includes(specie) && !luoghi.includes(z.nome)) luoghi.push(z.nome); }
    return luoghi;
  }

  _stelleAffezione(cella, liv) {
    for (let i = 0; i < 3; i++) {
      const piena = i < liv;
      cella.add(this.add.star(-18 + i * 18, 96, 5, 3, 7, piena ? 0xffd23f : 0xcbb78a).setStrokeStyle(1, 0x8a4b1e));
    }
  }

  update(time) {
    // Idle dei soli sprite a colori della pagina corrente.
    this.contenuto.list.forEach((cella) => {
      if (cella.list) cella.list.forEach((o) => { if (o.idle) o.idle(time); });
    });
  }
}
