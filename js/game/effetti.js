/* effetti.js — effetti visivi riutilizzabili per la battaglia (P1-07).
 *
 * Ogni mossa deve avere ≥3 elementi animati simultanei (proiettile + reazione +
 * numeri). Qui stanno i mattoni: numeri fluttuanti, esclamazioni, proiettili
 * elementali, nuvola di Fiatella, lingua di Leccatina, cuori di Molto Carina,
 * flash schermo, testo grande, particelle, stelline fair-play.
 *
 * Le funzioni "di attacco" ritornano una Promise che si risolve all'IMPATTO
 * (così la reazione del bersaglio e i numeri di danno partono sincronizzati).
 */

import { col, shade, fattoreQualita } from './gfx.js';

const COL_ELEM = {
  fuoco: 0xff7a30, acqua: 0x34a0d8, natura: 0x4caf50,
  elettricita: 0xffd23f, roccia: 0x9b8579, aria: 0xd98fd0, mistero: 0xa679e0,
};

/** Numero/etichetta che vola su, rimpicciolisce e sparisce. */
export function numeroFluttuante(scene, x, y, testo, colore = '#ff3b3b') {
  const t = scene.add.text(x, y, testo, {
    fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: colore,
    fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(9000);
  scene.tweens.add({ targets: t, y: y - 60, scale: 0.6, alpha: 0, duration: 1100, ease: 'Quad.out', onComplete: () => t.destroy() });
  // piccolo bounce iniziale
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
}

/** Esclamazione breve (max 2 parole) che rimbalza sopra un personaggio. */
export function esclamazione(scene, x, y, testo, colore = '#fff') {
  const t = scene.add.text(x, y, testo, {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: colore,
    fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(9001).setScale(0.3);
  scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
  scene.tweens.add({ targets: t, y: y - 24, alpha: 0, delay: 600, duration: 500, onComplete: () => t.destroy() });
}

/** Flash a schermo intero (per colpi forti / Molto Carina). */
export function flashSchermo(scene, colore = 0xffffff, alpha = 0.85, durata = 220) {
  const { width, height } = scene.scale.gameSize;
  const r = scene.add.rectangle(width / 2, height / 2, width, height, colore, alpha)
    .setScrollFactor(0).setDepth(9500);
  scene.tweens.add({ targets: r, alpha: 0, duration: durata, onComplete: () => r.destroy() });
}

/** Testo gigante che rimbalza al centro (es. "MOLTO CARINA!"). */
export function testoGrande(scene, testo, colore = '#ffd23f') {
  const { width, height } = scene.scale.gameSize;
  const t = scene.add.text(width / 2, height * 0.4, testo, {
    fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: colore,
    fontStyle: 'bold', stroke: '#8a4b1e', strokeThickness: 8, align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(9600).setScale(0.2);
  scene.tweens.add({ targets: t, scale: 1, duration: 350, ease: 'Back.out' });
  scene.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 400, onComplete: () => t.destroy() });
}

/** Esplosione di particelle colorate da un punto. */
export function particelle(scene, x, y, colore = 0xffd23f, n = 14) {
  n = Math.max(4, Math.round(n * fattoreQualita()));
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random();
    const d = 30 + Math.random() * 50;
    const p = scene.add.circle(x, y, 3 + Math.random() * 3, colore).setDepth(9000);
    scene.tweens.add({
      targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2,
      duration: 500 + Math.random() * 300, ease: 'Quad.out', onComplete: () => p.destroy(),
    });
  }
}

/** Proiettile elementale con arco da → a. Risolve all'impatto. */
export function proiettileElemento(scene, from, to, elemento, opt = {}) {
  return new Promise((risolvi) => {
    const c = COL_ELEM[elemento] || 0xffffff;
    const g = scene.add.container(from.x, from.y).setDepth(9000);
    const corpo = scene.add.graphics();
    corpo.fillStyle(c, 0.28); corpo.fillCircle(0, 0, 30);   // alone esterno
    corpo.fillStyle(c, 1); corpo.fillCircle(0, 0, 20);       // nucleo più grande
    corpo.fillStyle(shade(c, 0.5), 1); corpo.fillCircle(-5, -5, 9);
    g.add(corpo);
    // Pulsazione del proiettile in volo → più "vivo".
    scene.tweens.add({ targets: corpo, scaleX: 1.18, scaleY: 1.18, yoyo: true, repeat: -1, duration: 160, ease: 'Sine.inOut' });
    // Arco parabolico da→a in un solo tween (counter): alza al centro + scia.
    const x0 = from.x, y0 = from.y, x1 = to.x, y1 = to.y;
    const altezzaArco = 90;
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 420, ease: 'Quad.in',
      onUpdate: (tw) => {
        const k = tw.getValue();
        g.x = x0 + (x1 - x0) * k;
        g.y = (y0 + (y1 - y0) * k) - altezzaArco * (4 * (k - k * k));
        const s = scene.add.circle(g.x, g.y, 8, c, 0.5).setDepth(8999);
        scene.tweens.add({ targets: s, alpha: 0, scale: 0.3, duration: 320, onComplete: () => s.destroy() });
      },
      onComplete: () => {
        ondaUrto(scene, to.x, to.y, c);
        particelle(scene, to.x, to.y, c, 18);
        g.destroy();
        risolvi();
      },
    });
  });
}

/** Onda d'urto: anello che si espande e svanisce nel punto d'impatto. */
export function ondaUrto(scene, x, y, colore = 0xffffff) {
  const r = scene.add.circle(x, y, 10, colore, 0).setStrokeStyle(5, colore, 0.9).setDepth(8998);
  scene.tweens.add({ targets: r, scale: 4, alpha: 0, duration: 360, ease: 'Cubic.out', onComplete: () => r.destroy() });
}

/** Nuvola verde tossica (Fiatella). Risolve quando avvolge il bersaglio. */
export function nuvolaVerde(scene, from, to) {
  return new Promise((risolvi) => {
    const g = scene.add.container(from.x, from.y).setDepth(9000);
    for (let i = 0; i < 5; i++) {
      const c = scene.add.circle((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 16, 12 + Math.random() * 8, 0x7ab648, 0.7);
      g.add(c);
    }
    scene.tweens.add({
      targets: g, x: to.x, y: to.y, scale: 1.6, duration: 480, ease: 'Sine.inOut',
      onComplete: () => {
        scene.tweens.add({ targets: g, alpha: 0, duration: 700, onComplete: () => g.destroy() });
        risolvi();
      },
    });
  });
}

/** Lingua gigante rosa (Leccatina) che si estende verso il bersaglio. */
export function linguaLeccatina(scene, from, to) {
  return new Promise((risolvi) => {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const lingua = scene.add.rectangle(from.x, from.y, 10, 26, 0xff8fb0).setOrigin(0, 0.5)
      .setRotation(ang).setDepth(9000);
    lingua.setStrokeStyle(3, 0xd35d86);
    scene.tweens.add({
      targets: lingua, width: len, duration: 320, ease: 'Quad.out', yoyo: true, hold: 200,
      onYoyo: () => risolvi(),
      onComplete: () => lingua.destroy(),
    });
  });
}

/** Cuoricini che salgono dalla testa del bersaglio (Molto Carina, fase 1). */
export function cuori(scene, x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const h = scene.add.text(x + (Math.random() - 0.5) * 40, y, '❤', {
      fontSize: (16 + Math.random() * 16) + 'px', color: '#ff5d8f',
    }).setOrigin(0.5).setDepth(9001);
    scene.tweens.add({
      targets: h, y: y - 70 - Math.random() * 40, alpha: 0, duration: 900 + Math.random() * 400,
      delay: i * 80, onComplete: () => h.destroy(),
    });
  }
}

/** Stelline dorate che cadono in diagonale (fair play: saluto, stretta). */
export function stellineFairPlay(scene, n = 8) {
  const { width } = scene.scale.gameSize;
  n = Math.max(3, Math.round(n * fattoreQualita()));
  for (let i = 0; i < n; i++) {
    const x = Math.random() * width;
    const s = scene.add.star(x, -20, 5, 5, 11, 0xffd23f).setStrokeStyle(2, 0x8a4b1e)
      .setScrollFactor(0).setDepth(9400).setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: s, y: scene.scale.gameSize.height + 30, x: x + 80, angle: s.angle + 180,
      duration: 1400 + Math.random() * 800, delay: i * 90, ease: 'Sine.in',
      onComplete: () => s.destroy(),
    });
  }
}
