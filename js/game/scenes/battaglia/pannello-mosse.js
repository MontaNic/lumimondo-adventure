/* battaglia/pannello-mosse.js — pannello dei comandi della battaglia (VISTA pura).
 *
 * Estratto da BattagliaScene (F0.2): tasti-mossa (attacchi a sinistra, cura/supporto
 * staccati a destra), riga azioni (Pepole/Prisma/Lumiball/Borsa/Scappa), aggiornamento
 * stato tasti, bolla-descrizione (long-press). Nessuna regola: legge lo stato del
 * motore e disegna; i tap richiamano metodi che restano nella scena (scene._usaMossa,
 * _apriJolly, _formaPrisma, _modalitaCattura, _apriBorsa, _scappa). Funzioni con `scene`. */
import { possiediLinea } from '../../../lumini-data.js';
import { COL_ELEM } from './elementi.js';
import { efficacia } from './hud.js';
import { bottone } from './widgets.js';
import voce from '../../../voce.js';

// Categoria mossa → colore fondo (supporto) / bordo / etichetta / simbolo.
const CAT_COL = { normale: 0x9aa6b2, speciale: 0xb58cff, rigenerazione: 0x57c15a, supporto: 0x4bb3c4 };
const CAT_LAB = { normale: '● Normale', speciale: '◆ Speciale', rigenerazione: '♥ Cura', supporto: '🛡 Supporto' };
const CAT_SIM = { normale: '●', speciale: '◆', rigenerazione: '♥', supporto: '🛡' };
const FILL_SUP = { rigenerazione: 0x3f8047, supporto: 0x2f7a8a };

export function pannelloMosse(scene) {
  scene.add.rectangle(scene.W / 2, scene.H - 70, scene.W - 16, 132, 0x1a1226, 0.82)
    .setStrokeStyle(3, 0xffd23f).setScrollFactor(0).setDepth(7900);
  scene._pannelloPrisma = scene.eng.stato().prismaArmato;
  disegnaMosse(scene);

  // Riga inferiore (dinamica): soccorso Pepole (#27, NON se è lei in campo),
  // Lumiball SOLO coi selvatici dell'erba, Scappa/Smetti.
  const yb = scene.H - 28;
  // azzero gli handle (la scena è riusata: un riferimento stantio a un bottone di
  // una battaglia precedente non deve sopravvivere, es. Lumiball non più creata).
  scene.btnJolly = null; scene.btnLumiball = null; scene.btnScappa = null; scene.btnPrisma = null;
  const azioni = [];
  if (!scene.pepoleAttiva) azioni.push({ l: '🐶 Pepole', c: 0xf0a830, fn: () => scene._apriJolly() });
  // ✨ Chicca delle forme finali: il tasto col diamante per la Forma Prisma.
  if (scene.eng.stato().prismaDisponibile) azioni.push({ l: '💎 Prisma', c: 0x4ec3e8, fn: () => scene._formaPrisma() });
  // #1/#76 — niente Lumiball se possiedi GIÀ un Lumino della stessa LINEA evolutiva.
  const giaPreso = possiediLinea(scene.cfgAvversario);
  if (scene.catturabile && !giaPreso) azioni.push({ l: '⚪ Lumiball', c: 0xff7a30, fn: () => scene._modalitaCattura() });
  azioni.push({ l: '🎒 Borsa', c: 0x6a8f3a, fn: () => scene._apriBorsa() });   // #39
  if (scene.selvatico) azioni.push({ l: scene.catturabile ? '🐾 Scappa' : '🐾 Smetti', c: 0x8a6f5a, fn: () => scene._scappa() });
  else azioni.push({ l: '🐾 Scappa', c: 0x55555f, fn: () => voce.parla('scappa_allenatore') });

  const nA = azioni.length;
  const bw2 = Math.min(150, (scene.W - 40) / nA - 10);
  azioni.forEach((a, i) => {
    const x = scene.W * ((i + 0.5) / nA);
    const b = bottone(scene, x, yb, bw2, 40, a.l, a.c, a.fn);
    if (a.l.includes('Pepole')) scene.btnJolly = b;
    else if (a.l.includes('Prisma')) scene.btnPrisma = b;
    else if (a.l.includes('Lumiball')) scene.btnLumiball = b;
    else scene.btnScappa = b;
  });
}

// Costruisce (o RICOSTRUISCE) i tasti-mossa dal set del motore. In Forma Prisma resta
// SOLO l'attacco supremo, poi si torna alle mosse normali.
export function disegnaMosse(scene) {
  if (scene.btnMosse) scene.btnMosse.forEach((b) => b.cont && b.cont.destroy());
  scene.btnMosse = [];
  const y = scene.H - 96;
  const disp = scene.eng.mosseDisponibili('alleato');
  // #6 — attacchi a SINISTRA (normali → speciali), SUPPORTO (cura/scudo) staccato a DESTRA.
  const ordCat = { normale: 0, speciale: 1 };
  const eSupporto = (d) => d.categoria === 'rigenerazione' || d.categoria === 'supporto';
  const attacchi = disp.filter((d) => !eSupporto(d))
    .sort((a, b) => (ordCat[a.categoria] ?? 2) - (ordCat[b.categoria] ?? 2));
  const cure = disp.filter(eSupporto);
  const ordinate = [...attacchi, ...cure];
  const n = ordinate.length, GAP = 10, EXTRA = cure.length ? 28 : 0, bh = 64;
  const bw = Math.min(180, (scene.W - 56 - EXTRA) / n - GAP);
  const totale = n * bw + (n - 1) * GAP + EXTRA;
  let x = scene.W / 2 - totale / 2 + bw / 2;
  ordinate.forEach((d, k) => {
    if (k === attacchi.length && cure.length) x += EXTRA;   // stacco netto prima della cura
    const b = bottoneMossa(scene, x, y, bw, bh, d, d.indice);
    scene.btnMosse.push(b);
    x += bw + GAP;
  });
}

function bottoneMossa(scene, x, y, w, h, d, i) {
  const m = d.mossa;
  // #6 — le mosse di SUPPORTO hanno un colore di fondo PROPRIO (non elementale).
  const elc = FILL_SUP[d.categoria] || (COL_ELEM[m.elemento] || 0x888888);
  const catCol = CAT_COL[d.categoria] || 0x9aa0a6;
  const cont = scene.add.container(x, y).setScrollFactor(0).setDepth(8000);
  const bg = scene.add.rectangle(0, 0, w, h, elc).setStrokeStyle(4, catCol).setInteractive({ useHandCursor: true });
  const nome = scene.add.text(0, -12, m.nome, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 3, align: 'center', wordWrap: { width: w - 10 } }).setOrigin(0.5);
  const tipo = scene.add.text(0, 15, CAT_LAB[d.categoria] || '● Normale', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fff', fontStyle: 'bold', backgroundColor: '#00000044', padding: { x: 4, y: 1 } }).setOrigin(0.5);
  // #79 — simbolo categoria GRANDE in alto a destra (leggibile senza distinguere i colori).
  const sim = scene.add.text(w / 2 - 6, h / 2 - 6, CAT_SIM[d.categoria] || '●', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 3 }).setOrigin(1, 1);
  cont.add([bg, nome, tipo, sim]);
  // #33 — badge "SUPER" (verde) in alto a sinistra quando super-efficace. Aggiornato in aggiornaPannello.
  const superBadge = scene.add.text(-w / 2 + 4, -h / 2 + 4, '⬆', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#0a3a14', fontStyle: 'bold', backgroundColor: '#57c15a', padding: { x: 4, y: 1 } }).setOrigin(0, 0).setVisible(false);
  cont.add(superBadge);
  // Contatore usi (×2/×1/×0) per le mosse con tetto.
  let usiTxt = null;
  if (d.usiRimasti != null) {
    usiTxt = scene.add.text(w / 2 - 5, -h / 2 + 4, '×' + d.usiRimasti, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold', backgroundColor: d.usiRimasti > 0 ? '#2c7a33dd' : '#a33333dd', padding: { x: 4, y: 1 } }).setOrigin(1, 0);
    cont.add(usiTxt);
  }

  // Tap → usa mossa. Long press → legge la descrizione (Web Speech, no MP3 dedicato).
  let premutoT = 0, longTimer = null;
  bg.on('pointerdown', () => {
    premutoT = scene.time.now;
    longTimer = scene.time.delayedCall(500, () => {
      longTimer = null;
      if (m.descrizione) { bollaDescrizione(scene, m.nome, m.descrizione); voce.parlaDinamico(m.nome + '. ' + m.descrizione); }
    });
  });
  bg.on('pointerup', () => {
    if (longTimer) { longTimer.remove(); longTimer = null; }
    if (scene.time.now - premutoT < 480) scene._usaMossa(i);
  });
  bg.on('pointerout', () => { if (longTimer) { longTimer.remove(); longTimer = null; } });

  return { cont, bg, nome, tipo, usiTxt, superBadge, indice: i, elc };
}

export function aggiornaPannello(scene) {
  const disp = scene.eng.mosseDisponibili('alleato');
  scene.btnMosse.forEach((b) => {
    const d = disp[b.indice];
    const ok = d && d.usabile;
    b.bg.setFillStyle(ok ? b.elc : 0x55555f);
    b.cont.setAlpha(ok ? 1 : 0.6);
    if (d && !ok && d.motivo === 'in ricarica') b.tipo.setText('○ ricarica');
    else if (d) b.tipo.setText(CAT_LAB[d.categoria] || '● Normale');
    // contatore usi ×N.
    if (b.usiTxt && d && d.usiRimasti != null) {
      b.usiTxt.setText('×' + d.usiRimasti).setBackgroundColor(d.usiRimasti > 0 ? '#2c7a33dd' : '#a33333dd');
    }
    // #33 — badge SUPER visibile solo se super-efficace ed usabile.
    if (b.superBadge) b.superBadge.setVisible(ok && efficacia(scene, d && d.mossa) === 'super');
  });
  if (scene.btnJolly) {
    const usato = scene.eng.stato().jollyUsato;
    scene.btnJolly.bg.setFillStyle(usato ? 0x55555f : 0xf0a830);
    scene.btnJolly.cont.setAlpha(usato ? 0.6 : 1);
  }
  if (scene.btnPrisma) {
    const usato = scene.eng.stato().prismaUsato;
    scene.btnPrisma.bg.setFillStyle(usato ? 0x55555f : 0x4ec3e8);
    scene.btnPrisma.cont.setAlpha(usato ? 0.6 : 1);
  }
}

export function abilitaMosse(scene, on) {
  scene.btnMosse.forEach((b) => { if (on) b.bg.setInteractive(); else b.bg.disableInteractive(); });
}

// Bolla visiva con la descrizione della mossa (long-press). Niente voce di sistema:
// le descrizioni non sono in testi.json.
function bollaDescrizione(scene, nome, desc) {
  if (scene._bolla) scene._bolla.destroy();
  const w = Math.min(scene.W - 40, 360);
  const c = scene.add.container(scene.W / 2, scene.H - 230).setScrollFactor(0).setDepth(8700);
  const t = scene.add.text(0, 0, `${nome}\n${desc}`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#fff', align: 'center',
    wordWrap: { width: w - 24 }, lineSpacing: 3,
  }).setOrigin(0.5);
  const g = scene.add.graphics();
  const bw = Math.min(w, t.width + 24), bh = t.height + 18;
  g.fillStyle(0x1a1226, 0.92); g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
  g.lineStyle(2, 0xffd23f, 0.9); g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
  c.add([g, t]);
  scene._bolla = c;
  scene.time.delayedCall(2600, () => { if (scene._bolla === c) scene._bolla = null; c.destroy(); });
}
