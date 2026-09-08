/* juice.js — effetti "succosi" riutilizzabili per dare vita e dinamismo.
 *
 * Tutto additivo e non invasivo: nessun oggetto interattivo che rubi i tap, depth
 * scelta per non coprire la UI, rispetto del degrado qualità (fattoreQualita).
 * Pensato per essere chiamato dalle Scene senza accoppiare la logica di gioco.
 */

import { fattoreQualita } from './gfx.js';
import audio from '../audio.js';

/**
 * Particelle ambientali fluttuanti (pollini/scintille) ancorate alla camera:
 * danno "aria" e movimento di sottofondo. Salgono piano e pulsano.
 */
export function particelleAmbiente(scene, opts = {}) {
  const { width, height } = scene.scale.gameSize;
  const q = fattoreQualita();
  const n = Math.round((opts.n || 14) * q);
  const colore = opts.colore != null ? opts.colore : 0xffffff;
  const depth = opts.depth != null ? opts.depth : -50;
  const grp = [];
  for (let i = 0; i < n; i++) {
    const x = Math.random() * width, y = Math.random() * height;
    const r = 1.5 + Math.random() * 2.5;
    const p = scene.add.circle(x, y, r, colore, 0.5 + Math.random() * 0.4)
      .setScrollFactor(0).setDepth(depth);
    const dur = 5000 + Math.random() * 6000;
    scene.tweens.add({ targets: p, y: y - 40 - Math.random() * 60, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 2000 });
    scene.tweens.add({ targets: p, x: x + (Math.random() * 60 - 30), duration: dur * 1.3, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: p, alpha: 0.15, duration: 1500 + Math.random() * 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    grp.push(p);
  }
  return grp;
}

/** Pulsante che mette in pausa la scena e apre il MENU utente (PausaScene).
 *  `etichetta` opzionale (es. '☰\nMenu'); default icona ⏸. */
export function bottonePausa(scene, x, y, etichetta) {
  // #97 — area tocco ≥60px (regola touch-first).
  const b = scene.add.rectangle(x, y, 64, 60, 0x000000, 0.5).setScrollFactor(0).setDepth(9000).setInteractive({ useHandCursor: true });
  scene.add.text(x, y, etichetta || '☰', { fontFamily: 'system-ui, sans-serif', fontSize: etichetta ? '13px' : '24px', color: '#fff', fontStyle: 'bold', align: 'center', lineSpacing: 1 }).setOrigin(0.5).setScrollFactor(0).setDepth(9001);
  popBottone(scene, b);
  b.on('pointerdown', (p, lx, ly, ev) => {
    ev?.stopPropagation?.();
    scene.scene.launch('PausaScene', { parent: scene.scene.key });
    scene.scene.pause();
  });
  return b;
}

/** Pop tattile su un bottone: pulsazione breve + suono ad ogni pointerdown. */
export function popBottone(scene, target, opts = {}) {
  if (!target) return target;
  const suono = opts.suono === null ? null : (opts.suono || 'tocco');
  const k = opts.scala || 1.14;
  const sx = target.scaleX || 1, sy = target.scaleY || 1;
  target.on('pointerdown', () => {
    if (suono) audio.suono(suono);
    scene.tweens.add({ targets: target, scaleX: sx * k, scaleY: sy * k, duration: 90, yoyo: true, ease: 'Quad.out' });
  });
  return target;
}

/** Entrata "pop": l'elemento cresce dalla piccola taglia con un rimbalzo. */
export function entrata(scene, target, opts = {}) {
  if (!target) return target;
  const sx = target.scaleX || 1, sy = target.scaleY || 1;
  const da = opts.da != null ? opts.da : 0.4;
  target.setScale(sx * da, sy * da);
  scene.tweens.add({ targets: target, scaleX: sx, scaleY: sy, duration: opts.dur || 380, ease: 'Back.out', delay: opts.delay || 0 });
  return target;
}

/** Sbuffo di polvere a terra (passi/atterraggi): cerchietti che si espandono e svaniscono. */
export function polvere(scene, x, y, opts = {}) {
  if (fattoreQualita() < 1 && Math.random() < 0.5) return;   // dimezza in qualità bassa
  const colore = opts.colore != null ? opts.colore : 0xeaddc0;
  const depth = opts.depth != null ? opts.depth : (y - 2);
  const n = opts.n || 2;
  for (let i = 0; i < n; i++) {
    const dx = (Math.random() * 2 - 1) * 8;
    const p = scene.add.circle(x + dx, y, 2 + Math.random() * 2, colore, 0.5).setDepth(depth);
    scene.tweens.add({ targets: p, x: p.x + dx * 1.6, y: p.y - 2 - Math.random() * 4, scale: 2.2, alpha: 0, duration: 360 + Math.random() * 180, ease: 'Quad.out', onComplete: () => p.destroy() });
  }
}

/** Anello-onda nel punto toccato (feedback "tap-to-move"). */
export function ripple(scene, x, y, opts = {}) {
  const colore = opts.colore != null ? opts.colore : 0xffffff;
  const r = scene.add.circle(x, y, 6, colore, 0).setStrokeStyle(2.5, colore, 0.8).setDepth(opts.depth || 9000);
  scene.tweens.add({ targets: r, scale: 3.2, alpha: 0, duration: 420, ease: 'Cubic.out', onComplete: () => r.destroy() });
}

/** Scoppio di coriandoli colorati (vittorie/festeggiamenti).
 *  #96 — OBJECT POOLING: i rettangolini vengono RIUSATI tra una festa e l'altra
 *  (niente create/destroy continuo → meno GC-stutter su device deboli). */
export function coriandoli(scene, x, y, n = 26) {
  const q = fattoreQualita();
  const tot = Math.round(n * q);
  const COL = [0xff5d8f, 0xffd23f, 0x4fc3e8, 0x6cc36b, 0xb58cff, 0xff9a3c];
  const pool = scene._poolCoriandoli || (scene._poolCoriandoli = []);
  for (let i = 0; i < tot; i++) {
    const c = COL[i % COL.length];
    let pz = pool.find((p) => p._libero && p.active);
    if (!pz) {
      if (pool.length >= 140) break;   // tetto di sicurezza: niente crescita illimitata
      pz = scene.add.rectangle(x, y, 6, 9, c).setDepth(9500).setScrollFactor(0);
      pool.push(pz);
    }
    pz._libero = false;
    pz.setFillStyle(c).setPosition(x, y).setAlpha(1).setVisible(true).setAngle(Math.random() * 360);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = 120 + Math.random() * 220;
    scene.tweens.add({
      targets: pz, x: x + Math.cos(ang) * v, y: y + Math.sin(ang) * v + 180,
      angle: pz.angle + (Math.random() * 720 - 360), alpha: 0, duration: 900 + Math.random() * 700,
      ease: 'Quad.in', onComplete: () => { pz.setVisible(false); pz._libero = true; },
    });
  }
}

/**
 * Farfalle/creaturine che attraversano la scena con traiettoria ondulata e
 * alucce che battono. Vita ambientale leggera (ancorate alla camera).
 */
export function farfalle(scene, opts = {}) {
  const { width, height } = scene.scale.gameSize;
  const q = fattoreQualita();
  const n = Math.round((opts.n || 4) * q);
  const COL = [0xffd23f, 0xff9ec4, 0x9ad0ff, 0xb6f0a0];
  for (let i = 0; i < n; i++) {
    const c = COL[i % COL.length];
    const f = scene.add.container(-30, 60 + Math.random() * (height - 160)).setScrollFactor(0).setDepth(opts.depth != null ? opts.depth : 60);
    const aliSx = scene.add.triangle(-3, 0, 0, -5, 0, 5, -7, 0, c, 0.85);
    const aliDx = scene.add.triangle(3, 0, 0, -5, 0, 5, 7, 0, c, 0.85);
    f.add([aliSx, aliDx]);
    scene.tweens.add({ targets: [aliSx], scaleX: 0.3, yoyo: true, repeat: -1, duration: 110 + Math.random() * 60, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: [aliDx], scaleX: 0.3, yoyo: true, repeat: -1, duration: 110 + Math.random() * 60, ease: 'Sine.inOut' });
    const dur = 9000 + Math.random() * 7000;
    scene.tweens.add({ targets: f, x: width + 30, duration: dur, repeat: -1, delay: i * 1500, ease: 'Linear', onRepeat: () => { f.x = -30; f.y = 60 + Math.random() * (height - 160); } });
    scene.tweens.add({ targets: f, y: f.y - 30, yoyo: true, repeat: -1, duration: 1200 + Math.random() * 800, ease: 'Sine.inOut' });
  }
}

/** Popup "+1 ⭐" che sale e svanisce: ricompensa visiva quando guadagni stelline. */
export function premioStella(scene, x, y, testo = '+1 ⭐') {
  const t = scene.add.text(x, y, testo, {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(9600).setScrollFactor(0).setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.out' });
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1100, delay: 250, ease: 'Quad.in', onComplete: () => t.destroy() });
}

/** Icona di conferma salvataggio (in alto a destra): appare, ruota e svanisce. */
export function iconaSalvata(scene) {
  const { width } = scene.scale.gameSize;
  const t = scene.add.text(width - 18, 16, '💾', { fontSize: '22px' }).setOrigin(1, 0).setDepth(9700).setScrollFactor(0).setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, angle: 360, duration: 500, ease: 'Sine.out' });
  scene.tweens.add({ targets: t, alpha: 0, duration: 400, delay: 1100, onComplete: () => t.destroy() });
}

/** Pulsazione di "richiamo" (glow) su un oggetto/posizione: alone che batte. */
export function alonePulsante(scene, x, y, opts = {}) {
  const colore = opts.colore != null ? opts.colore : 0xffe98a;
  const raggio = opts.raggio || 40;
  const depth = opts.depth != null ? opts.depth : (y - 1);
  const alone = scene.add.circle(x, y, raggio, colore, 0.22).setDepth(depth);
  scene.tweens.add({ targets: alone, scale: 1.35, alpha: 0.06, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  return alone;
}
