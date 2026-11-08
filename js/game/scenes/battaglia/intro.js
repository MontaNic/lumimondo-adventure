/* battaglia/intro.js — cinematiche d'ingresso della battaglia (VISTA pura).
 *
 * Estratto da BattagliaScene (F0.2): anteprima della squadra del capo, cutscene
 * d'ingresso dell'avversario + cartello, scelta dello schieramento, schermata "VS".
 * Nessuna regola di gioco: sono overlay visivi. Le funzioni ricevono la `scene`;
 * le callback verso il motore restano nella scena (scene._iniziaBattaglia,
 * scene._scuotiCamera). `cartello` è usata anche da _iniziaBattaglia (nella scena).
 */
import { LUMINI, moltiplicatoreTipo, ELEMENTI } from '../../../lumini-data.js';

/** Nome leggibile dell'elemento (con accenti: 'elettricita' → 'Elettricità'). */
const nomeEl = (el) => (ELEMENTI[el] && ELEMENTI[el].nome) || el || '';
import { Lumino } from '../../lumino.js';
import { texGiocatore } from '../../sprites.js';
import * as FX from '../../effetti.js';
import audio from '../../../audio.js';

function nomeCapo(scene) {
  if (scene.capo === 'maestro') return 'il Maestro';
  return scene.capo ? scene.capo.charAt(0).toUpperCase() + scene.capo.slice(1) : 'il Capo';
}

/** #74 — Anteprima cinematografica della squadra del capopalestra: sagome scure che
 *  si illuminano una a una (nome+elemento), così il bambino pensa la strategia prima
 *  dello schieramento. Tap per saltare. Al termine chiama `cb`. */
export function anteprimaSquadraCapo(scene, cb) {
  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(9400);
  layer.add(scene.add.rectangle(scene.W / 2, scene.H / 2, scene.W, scene.H, 0x0a0814, 0.72));
  // Busto del maestro (se la texture esiste), a sinistra.
  if (scene.capo && scene.textures.exists(scene.capo)) {
    const m = scene.add.image(scene.W * 0.16, scene.H * 0.58, scene.capo);
    m.setScale(Math.min((scene.W * 0.3) / m.width, (scene.H * 0.7) / m.height));
    m.setAlpha(0).setX(scene.W * 0.16 - 40);
    scene.tweens.add({ targets: m, alpha: 1, x: scene.W * 0.16, duration: 360, ease: 'Cubic.out' });
    layer.add(m);
  }
  layer.add(scene.add.text(scene.W / 2, scene.H * 0.13, `La squadra di ${nomeCapo(scene)}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5, align: 'center',
  }).setOrigin(0.5));

  const lista = scene.squadraAvv;
  const n = lista.length;
  const cw = Math.min(130, (scene.W * 0.62) / n - 10);
  const x0 = scene.W * 0.62, cy = scene.H * 0.54;
  const cards = [];
  lista.forEach((sp, i) => {
    const cx = x0 + (i - (n - 1) / 2) * (cw + 12);
    const c = scene.add.container(cx, cy).setAlpha(0);
    if (scene.textures.exists('lum-' + sp)) {
      const img = scene.add.image(0, 0, 'lum-' + sp);
      img.setScale(Math.min(cw / img.width, (scene.H * 0.34) / img.height));
      img.setTint(0x14101e);   // sagoma scura finché non "si rivela"
      c.add(img); c._img = img;
    } else {
      const cir = scene.add.circle(0, 0, 34, 0x14101e); c.add(cir); c._img = cir;
    }
    const nm = scene.add.text(0, scene.H * 0.2, '???', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    const el = scene.add.text(0, scene.H * 0.2 + 20, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#ffd23f' }).setOrigin(0.5);
    c.add([nm, el]); c._nm = nm; c._el = el; c._sp = sp;
    layer.add(c); cards.push(c);
  });

  let chiuso = false;
  const fine = () => {
    if (chiuso) return; chiuso = true;
    scene.tweens.add({ targets: layer, alpha: 0, duration: 260, onComplete: () => { layer.destroy(); cb(); } });
  };
  // Rivela una card alla volta: comparsa + "accensione" della sagoma.
  cards.forEach((c, i) => {
    scene.time.delayedCall(360 + i * 620, () => {
      if (chiuso || !c.scene) return;
      const base = LUMINI[c._sp] || {};
      c._nm.setText(base.nome || c._sp);
      c._el.setText(nomeEl(base.elemento));
      if (c._img.clearTint) c._img.clearTint();
      scene.tweens.add({ targets: c, alpha: 1, duration: 280, ease: 'Back.out' });
      scene.tweens.add({ targets: c, y: cy - 10, yoyo: true, duration: 180 });
      if (audio.suono) audio.suono('stellina');
    });
  });
  // Auto-chiusura dopo l'ultima rivelazione (+ respiro); tap per saltare.
  scene.time.delayedCall(360 + n * 620 + 900, fine);
  // "Salta col tap": armato SOLO dopo il primo rilascio del dito (il tocco d'avvio arriva
  // ancora premuto al cambio scena → aspettando il pointerup non chiude subito l'anteprima).
  scene.input.once('pointerup', () => { if (!chiuso) scene.input.once('pointerdown', fine); });
}

/** Cutscene d'ingresso: l'avversario scivola sulla pedana con squash d'atterraggio e
 *  un cartello annuncia l'incontro. Al termine chiama `cb`. NON tocca il motore. */
export function introBattaglia(scene, cb) {
  scene.avversario = new Lumino(scene, scene.W + 220, scene.posAvv.y, scene.cfgAvversario, { specchia: true })
    .setScale(scene.scAvv || 1.15).setDepth(100);
  if (audio.suono) audio.suono('lancio');
  scene.tweens.add({
    targets: scene.avversario, x: scene.posAvv.x, duration: 540, ease: 'Cubic.out',
    onComplete: () => scene.tweens.add({ targets: scene.avversario, scaleX: (scene.scAvv || 1.15) * 1.08, scaleY: (scene.scAvv || 1.15) * 0.9, duration: 100, yoyo: true, ease: 'Quad.out' }),
  });
  const nome = (LUMINI[scene.cfgAvversario] || {}).nome || 'Lumino';
  // #59 — variante speciale: brillio dorato + suono + scintille sullo sprite.
  if (scene.variante && scene.avvIdx === 0) {
    scene.time.delayedCall(560, () => {
      if (!scene.avversario) return;
      if (scene.avversario.setTint) try { scene.avversario.setTint(0xfff0a0); } catch { /* container */ }
      FX.particelle(scene, scene.avversario.x, scene.avversario.y, 0xffd23f, 18);
      audio.suono('stellina');
    });
  }
  const testo = scene.variante ? `Un ${nome} SPECIALE! ✨`
    : (scene.selvatico ? `Appare un ${nome} selvatico!` : `${nome} scende in campo!`);
  cartello(scene, testo).then(cb);
}

/** Cartello d'annuncio RPG con testo a comparsa e auto-chiusura. Ritorna una Promise
 *  che si risolve quando sparisce. Usata dalle cutscene e da _iniziaBattaglia ("Vai!"). */
export function cartello(scene, testo, opts = {}) {
  return new Promise((resolve) => {
    const y = opts.y != null ? opts.y : scene.H * 0.44;
    const w = Math.min(scene.W - 36, 460);
    const box = scene.add.container(scene.W / 2, y).setScrollFactor(0).setDepth(9000);
    const g = scene.add.graphics();
    g.fillStyle(0x1a1226, 0.9); g.fillRoundedRect(-w / 2, -34, w, 68, 14);
    g.lineStyle(3, 0xffd23f, 1); g.strokeRoundedRect(-w / 2, -34, w, 68, 14);
    const txt = scene.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff6e3',
      fontStyle: 'bold', align: 'center', wordWrap: { width: w - 30 },
    }).setOrigin(0.5);
    box.add([g, txt]);
    box.setScale(0.7).setAlpha(0);
    scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
    // Testo a comparsa (typewriter dolce, beep leggero ogni 3 lettere).
    let i = 0;
    scene.time.addEvent({ delay: 36, repeat: testo.length - 1, callback: () => {
      txt.setText(testo.slice(0, ++i));
      if (i % 3 === 0 && audio.suono) audio.suono('tocco');
    } });
    const dur = opts.dur || (testo.length * 36 + 700);
    scene.time.delayedCall(dur, () => {
      scene.tweens.add({ targets: box, alpha: 0, scale: 0.85, duration: 220, onComplete: () => box.destroy() });
      resolve();
    });
  });
}

/** #26 — Scelta dello schieramento: quale Lumino (o Pepole) mandare in campo. Con una
 *  sola opzione si salta e si avvia direttamente la battaglia (scene._iniziaBattaglia). */
export function scegliSchieramento(scene) {
  const team = (window.GS && Array.isArray(window.GS.team) ? window.GS.team : []).map((l) => l && l.specie).filter(Boolean);
  if (team.length === 0) { scene._iniziaBattaglia(scene.cfgAlleato); return; }  // demo/senza squadra
  const opzioni = [...new Set([...team, 'pepole'])];
  if (opzioni.length <= 1) { scene._iniziaBattaglia(opzioni[0]); return; }

  const avvBase = LUMINI[scene.cfgAvversario] || {};
  const avvEl = avvBase.elemento || '';
  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(9200);
  layer.add(scene.add.rectangle(scene.W / 2, scene.H / 2, scene.W, scene.H, 0x0a0814, 0.5));
  // #74 — nomina l'avversario (best-of: cambia a ogni Lumino) per dare il contesto.
  const titolo = scene.squadraAvv.length > 1
    ? `Tocca a ${avvBase.nome || 'lui'}! Chi mandi?` : 'Chi mandi in campo?';
  layer.add(scene.add.text(scene.W / 2, scene.H * 0.15, titolo, {
    fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5, align: 'center',
  }).setOrigin(0.5));
  if (avvEl) layer.add(scene.add.text(scene.W / 2, scene.H * 0.15 + 24, `avversario di tipo ${nomeEl(avvEl).toLowerCase()}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', backgroundColor: '#00000055', padding: { x: 6, y: 2 },
  }).setOrigin(0.5));

  const n = opzioni.length;
  const cw = Math.min(150, (scene.W - 40) / n - 12), ch = Math.min(196, scene.H * 0.46);
  const cy = scene.H * 0.54, gap = 14;
  let scelto = false;
  opzioni.forEach((sp, i) => {
    const cx = scene.W / 2 + (i - (n - 1) / 2) * (cw + gap);
    const isPep = sp === 'pepole';
    const base = LUMINI[sp] || {};
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(cx - cw / 2, cy - ch / 2 + 5, cw, ch, 16);
    g.fillStyle(0xfff6e3, 1); g.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    g.fillStyle(isPep ? 0xf0a830 : 0x6cb84f, 1); g.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, 34, { tl: 16, tr: 16, bl: 0, br: 0 });
    g.lineStyle(4, 0x4a3322, 1); g.strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    layer.add(g);
    layer.add(scene.add.text(cx, cy - ch / 2 + 17, isPep ? 'Soccorso' : (nomeEl(base.elemento) || 'Lumino'), { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    if (scene.textures.exists('lum-' + sp)) {
      const img = scene.add.image(cx, cy - 4, 'lum-' + sp);
      img.setScale(Math.min((cw - 26) / img.width, (ch - 80) / img.height));
      layer.add(img);
    } else {
      layer.add(scene.add.circle(cx, cy - 4, 30, 0x9ecb6a).setStrokeStyle(3, 0x4a3322));
    }
    layer.add(scene.add.text(cx, cy + ch / 2 - 20, base.nome || sp, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#4a3322', fontStyle: 'bold' }).setOrigin(0.5));
    // #74 — indizio sui tipi: stellina "consigliato" sul Lumino forte contro l'avversario.
    if (!isPep && avvEl && base.elemento && moltiplicatoreTipo(base.elemento, avvEl) === 1.5) {
      const badge = scene.add.text(cx, cy - ch / 2 - 15, '⭐ forte!', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#1a3a0a', fontStyle: 'bold', backgroundColor: '#7ed957', padding: { x: 6, y: 2 } }).setOrigin(0.5);
      layer.add(badge);
      scene.tweens.add({ targets: badge, scale: 1.12, yoyo: true, repeat: -1, duration: 620, ease: 'Sine.inOut' });
    }
    const hit = scene.add.rectangle(cx, cy, cw, ch, 0xffffff, 0.001).setScrollFactor(0).setDepth(9300).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { if (!scelto) g.setScale(1.04); });
    hit.on('pointerout', () => g.setScale(1));
    hit.on('pointerdown', () => {
      if (scelto) return; scelto = true;
      audio.suono('tocco'); layer.destroy(); hit.destroy();
      scene._iniziaBattaglia(sp);
    });
    layer.add(hit);
  });
}

/** Schermata "VS" stile GDR (allenatori di città): entrano i due allenatori + "VS",
 *  poi i Lumini, poi un cartello d'incitamento; fade e `cb`. Overlay, non tocca il motore. */
export function introVS(scene, specie, cb) {
  const W = scene.W, H = scene.H;
  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(9500);
  layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0814, 0.9));
  // due bande diagonali (blu = Pietro, rosso = sfidante) per dare dinamismo.
  const g = scene.add.graphics();
  g.fillStyle(0x1f6f9c, 0.4); g.fillTriangle(0, 0, W * 0.6, 0, 0, H);
  g.fillStyle(0xb83b2e, 0.4); g.fillTriangle(W, 0, W, H, W * 0.4, H);
  layer.add(g);

  const yT = H * 0.42;
  const figura = (tex, x, fromX, colore) => {
    let o;
    if (tex && scene.textures.exists(tex)) {
      o = scene.add.image(0, yT, tex).setOrigin(0.5, 0.5);
      o.setScale(Math.min((W * 0.34) / o.width, (H * 0.36) / o.height));
    } else {
      o = scene.add.circle(0, yT, 46, colore).setStrokeStyle(4, 0xffffff);
    }
    o.setX(fromX).setAlpha(0);
    layer.add(o);
    scene.tweens.add({ targets: o, x, alpha: 1, duration: 420, ease: 'Cubic.out' });
    return o;
  };
  figura(texGiocatore(scene), W * 0.27, -W * 0.3, 0x2f6fc4);   // protagonista per genere
  figura(scene.sfidante, W * 0.73, W * 1.3, 0xb83b2e);

  const tag = (testo, x, col) => {
    const t = scene.add.text(x, H * 0.6, testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold',
      backgroundColor: col, padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setAlpha(0);
    layer.add(t);
    scene.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 360 });
  };
  tag((window.GS && window.GS.profilo && window.GS.profilo.nome) || 'Pietro', W * 0.27, '#1f6f9ccc');
  tag(scene.sfidanteNome || 'Sfidante', W * 0.73, '#b83b2ecc');

  let finito = false;
  const fine = () => {
    if (finito) return; finito = true;
    scene.tweens.add({ targets: layer, alpha: 0, duration: 260, onComplete: () => { layer.destroy(); cb(); } });
  };

  // VS che entra di scatto + micro-scossa.
  scene.time.delayedCall(440, () => {
    if (finito || !layer.scene) return;
    if (audio.suono) audio.suono('mossaSpeciale');
    const vs = scene.add.text(W / 2, yT, 'VS', {
      fontFamily: 'system-ui, sans-serif', fontSize: '64px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 8,
    }).setOrigin(0.5).setScale(0);
    layer.add(vs);
    scene.tweens.add({ targets: vs, scale: 1, duration: 320, ease: 'Back.out' });
    scene._scuotiCamera(0.006, 200);
  });

  // I Lumini entrano uno dopo l'altro (tuo, poi avversario).
  const lumino = (sp, x, delay) => scene.time.delayedCall(delay, () => {
    if (finito || !layer.scene) return;
    const tex = 'lum-' + sp;
    let o, target;
    if (scene.textures.exists(tex)) {
      o = scene.add.image(x, H * 0.73, tex);
      target = Math.min((W * 0.22) / o.width, (H * 0.22) / o.height);
    } else {
      o = scene.add.circle(x, H * 0.73, 30, 0x9ecb6a).setStrokeStyle(3, 0x4a3322);
      target = 1;
    }
    o.setScale(target * 0.2).setAlpha(0);
    layer.add(o);
    if (audio.suono) audio.suono('lancio');
    scene.tweens.add({ targets: o, scale: target, alpha: 1, duration: 280, ease: 'Back.out' });
  });
  lumino(specie, W * 0.27, 900);
  lumino(scene.cfgAvversario, W * 0.73, 1180);

  // Cartello d'incitamento.
  scene.time.delayedCall(1620, () => {
    if (finito || !layer.scene) return;
    const frasi = ['Che la sfida cominci!', 'In campo!', 'Pronti alla lotta!', 'Diamoci dentro!'];
    const msg = scene.add.text(W / 2, H * 0.9, Phaser.Utils.Array.GetRandom(frasi), {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 14, y: 6 }, stroke: '#3a2c22', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5).setScale(0.6).setAlpha(0);
    layer.add(msg);
    scene.tweens.add({ targets: msg, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
  });

  scene.time.delayedCall(2550, fine);
  // "Salta col tap": armato solo dopo il primo rilascio (il tap della scelta non salta subito).
  scene.input.once('pointerup', () => { if (!finito) scene.input.once('pointerdown', fine); });
}
