/* lumino.js — un Lumino come GameObject Phaser procedurale (battaglia/cattura).
 *
 * Disegno distinto per i primi stadi (fiammino/guscetto/foglino/zappix/roccolo/
 * brizzo/buzzetto) + fallback generico colorato per elemento. Sopra il corpo, un
 * layer "espressione" ridisegnabile per le reazioni di battaglia (normale, 🤢,
 * 😍 innamorato, 😵 stanco). Metodi: setEspressione, lampeggia(tint), stanco.
 *
 * Dimensione di riferimento ~140px: la BattagliaScene poi lo scala a piacere.
 */

import { LUMINI } from '../lumini-data.js';
import { col, shade } from './gfx.js';
import { creaOmbra, deformaOmbra } from './ombra.js';

export class Lumino extends Phaser.GameObjects.Container {
  constructor(scene, x, y, specie, opts = {}) {
    super(scene, x, y);
    this.specie = specie;
    this.base = LUMINI[specie] || { colore: '#a679e0', elemento: 'mistero', nome: specie };
    this.colore = col(opts.colore || this.base.colore);
    this.guardaSinistra = !!opts.specchia;   // l'avversario guarda verso Pietro

    this.ombra = creaOmbra(scene, 100, 56, { alpha: 0.5 });
    this.espressione = 'normale';
    // Se esiste l'asset PNG del Lumino (assets/lumini/<specie>.png), si usa quello;
    // altrimenti si disegna in modo procedurale (fallback completo, niente bug).
    this.usaPng = scene.textures.exists('lum-' + specie);
    if (this.usaPng) {
      const src = scene.textures.get('lum-' + specie).getSourceImage();
      this._pngScala = 150 / (src.height || 150);   // ~150px di riferimento, come il procedurale
      this.png = scene.add.image(0, 6, 'lum-' + specie).setOrigin(0.5, 0.62).setScale(this._pngScala).setFlipX(this.guardaSinistra);
      this.add([this.ombra, this.png]);
    } else {
      this.corpo = scene.add.graphics();
      this.espr = scene.add.graphics();
      this.add([this.ombra, this.corpo, this.espr]);
      this._disegnaCorpo();
      this.setEspressione('normale');
      if (this.guardaSinistra) this.corpo.scaleX = this.espr.scaleX = -1;
    }

    scene.add.existing(this);
    this._t0 = scene.time.now + Math.random() * 1000;
  }

  // --- Corpo per specie ----------------------------------------------------
  _disegnaCorpo() {
    const g = this.corpo;
    g.clear();
    const c = this.colore;
    const fn = this['_dis_' + (this.base.svg || this.specie)];
    if (fn) fn.call(this, g, c);
    else this._dis_generico(g, c);
  }

  _bordo(g) { g.lineStyle(4, 0x3a2c22, 1); }

  _dis_generico(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    g.fillCircle(0, 10, 46); g.strokeCircle(0, 10, 46);
    g.fillStyle(shade(c, 0.25), 1);
    g.fillEllipse(-14, -2, 22, 26); g.fillEllipse(14, -2, 22, 26); // guance chiare
  }

  _dis_fiammino(g, c) {
    // Coda con fiammella.
    g.fillStyle(0xff9a3c, 1); this._bordo(g);
    g.fillTriangle(40, 36, 60, 6, 46, 40);
    g.fillStyle(0xffd23f, 1); g.fillTriangle(44, 34, 56, 14, 48, 36);
    // Corpo bipede.
    g.fillStyle(c, 1); g.lineStyle(4, 0x7a2e0a, 1);
    g.fillRoundedRect(-30, -22, 60, 64, 24); g.strokeRoundedRect(-30, -22, 60, 64, 24);
    g.fillStyle(shade(c, 0.3), 1); g.fillEllipse(0, 18, 30, 26); // pancia
    // gambette
    g.fillStyle(shade(c, -0.1), 1);
    g.fillRoundedRect(-18, 38, 14, 14, 5); g.fillRoundedRect(4, 38, 14, 14, 5);
  }

  _dis_guscetto(g, c) {
    // Guscio.
    g.fillStyle(0x6cc36b, 1); this._bordo(g);
    g.fillEllipse(0, 16, 92, 64); g.strokeEllipse(0, 16, 92, 64);
    g.fillStyle(shade(0x6cc36b, -0.15), 1); g.fillEllipse(0, 16, 64, 44);
    // Stella sul guscio.
    g.fillStyle(0xffe98a, 1); this._stella(g, 0, 14, 13);
    // Testa azzurra.
    g.fillStyle(c, 1); g.lineStyle(4, 0x1d6f9c, 1);
    g.fillCircle(0, -26, 26); g.strokeCircle(0, -26, 26);
    // zampette
    g.fillStyle(c, 1); g.fillRoundedRect(-40, 24, 16, 14, 6); g.fillRoundedRect(24, 24, 16, 14, 6);
  }

  _dis_foglino(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    g.fillCircle(0, 14, 44); g.strokeCircle(0, 14, 44);
    g.fillStyle(shade(c, 0.28), 1); g.fillEllipse(0, 22, 40, 30);
    // Germoglio.
    g.fillStyle(0x6a4a2a, 1); g.fillRect(-3, -34, 6, 18);
    g.fillStyle(0xff7aa8, 1); this._bordo(g);
    g.fillCircle(0, -38, 12); g.fillCircle(-12, -32, 9); g.fillCircle(12, -32, 9);
    g.fillStyle(0xffe98a, 1); g.fillCircle(0, -36, 5);
  }

  _dis_zappix(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    // corpo a stella tonda
    this._stella(g, 0, 12, 48, true);
    g.fillStyle(shade(c, 0.3), 1); g.fillCircle(0, 12, 26);
    g.fillStyle(0xf5b800, 1); g.fillTriangle(20, -28, 34, -54, 30, -24); // ciuffo saetta
  }

  _dis_roccolo(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    g.beginPath();
    g.moveTo(-44, 40); g.lineTo(-30, -20); g.lineTo(0, -38);
    g.lineTo(30, -20); g.lineTo(44, 40); g.closePath();
    g.fillPath(); g.strokePath();
    g.fillStyle(shade(c, -0.12), 1); g.fillRect(-20, 6, 40, 10);
  }

  _dis_brizzo(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    g.fillCircle(0, 10, 40); g.strokeCircle(0, 10, 40);
    // alette
    g.fillStyle(shade(c, 0.3), 1);
    g.fillEllipse(-44, 2, 26, 16); g.fillEllipse(44, 2, 26, 16);
  }

  _dis_buzzetto(g, c) {
    g.fillStyle(c, 1); this._bordo(g);
    g.fillCircle(0, 12, 42); g.strokeCircle(0, 12, 42);
    g.fillStyle(shade(c, 0.32), 1); g.fillEllipse(0, 20, 34, 26);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(-16, -6, 7); // bollicina
  }

  _stella(g, cx, cy, r, fillOnly) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillPath(); if (!fillOnly) g.strokePath();
  }

  // --- Espressione ---------------------------------------------------------
  setEspressione(stato) {
    this.espressione = stato;
    if (this.usaPng) {
      // Col PNG la faccia è fissa: rendo "stanco" con una piccola inclinazione.
      if (this.png) this.png.setAngle(stato === 'stanco' ? (this.guardaSinistra ? 10 : -10) : 0);
      return;
    }
    const g = this.espr;
    g.clear();
    const yo = -6; // occhi un po' sopra il centro corpo
    const occhio = (x, pupil = true) => {
      g.fillStyle(0xffffff, 1); g.fillCircle(x, yo, 8);
      g.lineStyle(2, 0x3a2c22, 1); g.strokeCircle(x, yo, 8);
      if (pupil) { g.fillStyle(0x2a1c12, 1); g.fillCircle(x, yo + 1, 4); }
    };
    if (stato === 'stanco') {
      // occhi a X + bocca ondulata
      g.lineStyle(3, 0x3a2c22, 1);
      for (const x of [-14, 14]) { g.lineBetween(x - 6, yo - 6, x + 6, yo + 6); g.lineBetween(x - 6, yo + 6, x + 6, yo - 6); }
      g.beginPath(); g.arc(0, yo + 18, 6, Math.PI, 0); g.strokePath();
      return;
    }
    if (stato === 'nausea') {
      occhio(-14); occhio(14);
      g.fillStyle(0x4caf50, 1); g.fillEllipse(0, yo + 16, 16, 10); // boccuccia verde
      return;
    }
    if (stato === 'innamorato') {
      g.fillStyle(0xff5d8f, 1);
      for (const x of [-14, 14]) { this._cuore(g, x, yo, 9); }
      g.lineStyle(3, 0x9a5a3a, 1); g.beginPath(); g.arc(0, yo + 12, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.strokePath();
      return;
    }
    // normale
    occhio(-14); occhio(14);
    g.lineStyle(3, 0x9a5a3a, 1);
    g.beginPath(); g.arc(0, yo + 12, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.strokePath();
  }

  _cuore(g, cx, cy, r) {
    g.fillCircle(cx - r * 0.5, cy - r * 0.2, r * 0.55);
    g.fillCircle(cx + r * 0.5, cy - r * 0.2, r * 0.55);
    g.fillTriangle(cx - r, cy, cx + r, cy, cx, cy + r);
  }

  // --- Animazioni di reazione ---------------------------------------------
  lampeggia(tintCol, durata = 260) {
    const orig = this.corpo;
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: durata, yoyo: true,
      onUpdate: () => {}, // il tint vero lo facciamo con un overlay colore
    });
    // Overlay colore semplice: un rettangolo tintato sopra il corpo che svanisce.
    const ov = this.scene.add.rectangle(this.x, this.y, 140, 150, tintCol, 0.45).setDepth(this.depth + 1);
    this.scene.tweens.add({ targets: ov, alpha: 0, duration: durata, onComplete: () => ov.destroy() });
  }

  scuoti(intensita = 6) {
    const sx = this.x;
    this.scene.tweens.add({ targets: this, x: sx - intensita, duration: 50, yoyo: true, repeat: 3,
      onComplete: () => { this.x = sx; } });
  }

  faiStanco() {
    this.setEspressione('stanco');
    this.scene.tweens.add({ targets: this, y: this.y + 18, angle: this.guardaSinistra ? 8 : -8, duration: 500, ease: 'Sine.in' });
    const z = this.scene.add.text(this.x + 30, this.y - 40, 'z', { fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setDepth(9999);
    this.scene.tweens.add({ targets: z, y: z.y - 30, x: z.x + 14, alpha: 0, duration: 1400, repeat: 1, onComplete: () => z.destroy() });
  }

  // ✨ Forma Prisma: scambia temporaneamente la texture PNG con la forma
  // cristallo (e viceversa). Aggiorna `_pngScala` perché idle() la riapplica a ogni
  // frame. Funziona solo sui Lumini con PNG (Pyronex ce l'ha); altrimenti no-op.
  trasformaIn(tex, fattore = 1) {
    if (!this.usaPng || !this.png || !this.scene.textures.exists(tex)) return false;
    if (this._texBase == null) { this._texBase = this.png.texture.key; this._pngScalaBase = this._pngScala; }
    this.png.setTexture(tex);
    const src = this.scene.textures.get(tex).getSourceImage();
    // `fattore` >1 rende la nuova forma più grande/alta dell'originale (es. Forma Prisma).
    this._pngScala = (150 * fattore) / (src.height || 150);
    this.png.setScale(this._pngScala).setFlipX(this.guardaSinistra);
    return true;
  }

  ripristinaForma() {
    if (this._texBase == null || !this.png) return;
    this.png.setTexture(this._texBase);
    this._pngScala = this._pngScalaBase;
    this.png.setScale(this._pngScala).setFlipX(this.guardaSinistra);
    this._texBase = null;
  }

  // Disegna gli occhi chiusi (battito di palpebre) mantenendo la bocca normale.
  _occhiChiusi() {
    const g = this.espr; g.clear(); const yo = -6;
    g.lineStyle(3, 0x3a2c22, 1);
    g.beginPath(); g.arc(-14, yo, 7, 0.12 * Math.PI, 0.88 * Math.PI); g.strokePath();
    g.beginPath(); g.arc(14, yo, 7, 0.12 * Math.PI, 0.88 * Math.PI); g.strokePath();
    g.lineStyle(3, 0x9a5a3a, 1);
    g.beginPath(); g.arc(0, yo + 12, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.strokePath();
  }

  // Idle permanente: respiro (bounce verticale lento + scala), oscillazione,
  // battito di palpebre ogni 2.5-4s. L'arena non deve mai sembrare congelata.
  idle(now) {
    if (this.espressione === 'stanco') return;     // da stanco resta accasciato
    const t = now - this._t0;
    const bob = Math.sin(t / 470) * 3;
    if (this.usaPng) {
      const br = Math.sin(t / 470) * 0.03;
      this.png.y = 6 + bob;
      this.png.setScale(this._pngScala, this._pngScala * (1 + br));
      this.png.angle = Math.sin(t / 1150) * 2;
      deformaOmbra(this.ombra, Math.max(0, -bob), 3);
      return;
    }
    this.corpo.y = bob; this.espr.y = bob;
    deformaOmbra(this.ombra, Math.max(0, -bob), 3);   // su = ombra più piccola; giù = schiacciata
    const br = Math.sin(t / 470) * 0.03;
    this.corpo.setScale(this.guardaSinistra ? -1 : 1, 1 + br);
    const sway = Math.sin(t / 1150) * 2;
    this.corpo.angle = sway; this.espr.angle = sway;

    // Battito di palpebre (solo da espressione "normale").
    if (this.espressione !== 'normale') { this._blinkFino = 0; return; }
    if (this._blinkFino) {
      if (now >= this._blinkFino) { this._blinkFino = 0; this.setEspressione('normale'); this._prossimoBlink = now + 2500 + Math.random() * 1800; }
    } else {
      if (!this._prossimoBlink) this._prossimoBlink = now + 2000 + Math.random() * 1800;
      if (now > this._prossimoBlink) { this._blinkFino = now + 120; this._occhiChiusi(); }
    }
  }
}
