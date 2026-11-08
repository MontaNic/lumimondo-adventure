/* battaglia/cattura.js — cattura con la Lumiball (P1-08).
 *
 * Estratto da BattagliaScene (F0.2): offerta di cattura post-sconfitta, modalità
 * cattura (Lumiball da toccare), lancio ad arco, sequenza (entra/rimbalzi/esito) e
 * registrazione nel team/album quando riesce. È l'unico cluster non "pura vista":
 * `catturaRiuscita` muta lo stato (GS→state via salvaGS) — logica cohesa con
 * l'animazione, quindi tenuta insieme qui. Le funzioni ricevono la `scene`; le
 * callback di flusso restano nella scena (scene._esciDaBattaglia, _eseguiAzione,
 * _attesa). L'esito usa `percentualeCattura` (motore) sull'energia residua reale.
 */
import { percentualeCattura, creaIstanza } from '../../../lumini-data.js';
import { bottone } from './widgets.js';
import { abilitaMosse, aggiornaPannello } from './pannello-mosse.js';
import * as FX from '../../effetti.js';
import * as Juice from '../../juice.js';
import { vibra } from '../../gfx.js';
import voce from '../../../voce.js';
import audio from '../../../audio.js';
import { salvaGS, aggiungiXP, incrStat } from '../../../gs.js';

/** #75 — Offerta di cattura dopo aver indebolito/sconfitto il selvatico ("è indebolito"). */
export function offriCatturaFinale(scene) {
  const lum = (window.GS?.inventario?.lumiball) || 0;
  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(9500);
  layer.add(scene.add.rectangle(scene.W / 2, scene.H / 2, scene.W, scene.H, 0x0a0814, 0.55));
  const nome = scene.avversario?.base?.nome || 'Lumino';
  layer.add(scene.add.text(scene.W / 2, scene.H * 0.30, `${nome} è indebolito!`, {
    fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 5, align: 'center',
  }).setOrigin(0.5));
  layer.add(scene.add.text(scene.W / 2, scene.H * 0.30 + 32, 'Vuoi farlo tuo amico?', {
    fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', align: 'center',
  }).setOrigin(0.5));
  let scelto = false;
  if (lum > 0) {
    const b = bottone(scene, scene.W / 2 - 96, scene.H * 0.58, 176, 54, `⚪ Lumiball (${lum})`, 0xff7a30, () => {
      if (scelto) return; scelto = true; layer.destroy();
      // la vittoria ha lasciato bloccato=true: lo libero, altrimenti modalitaCattura esce subito.
      scene.bloccato = false; scene._inCattura = false;
      scene._catturaGarantita = true; modalitaCattura(scene);
    });
    layer.add(b.cont);
  } else {
    layer.add(scene.add.text(scene.W / 2 - 96, scene.H * 0.58, 'Niente Lumiball 🛒', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffb38a', fontStyle: 'bold', backgroundColor: '#00000066', padding: { x: 8, y: 7 },
    }).setOrigin(0.5));
  }
  const bL = bottone(scene, scene.W / 2 + 96, scene.H * 0.58, 176, 54, '👋 Lascialo andare', 0x8a6f5a, () => {
    if (scelto) return; scelto = true; layer.destroy(); scene._esciDaBattaglia();
  });
  layer.add(bL.cont);
}

/** Modalità cattura: la Lumiball in basso al centro si TOCCA per lanciarla (niente
 *  trascina → più semplice per i bambini). Consuma una Lumiball al lancio. */
export function modalitaCattura(scene) {
  scene._dbg('tap Lumiball' + (scene.bloccato || scene._inCattura ? ' (IGNORATO)' : ''));
  if (scene.bloccato || scene._inCattura) return;
  // #39 — la cattura consuma una Lumiball: se non ne hai, niente lancio.
  const inv = (window.GS && window.GS.inventario) || {};
  if (!(inv.lumiball > 0)) {
    FX.esclamazione(scene, scene.W / 2, scene.H * 0.4, 'Niente Lumiball! Compra al Mercatino 🛒', '#ff9a4d');
    audio.suono('colpito');
    return;
  }
  scene._inCattura = true;
  scene.bloccato = true;
  abilitaMosse(scene, false);

  const ball = scene.add.container(scene.W / 2, scene.H - 150).setScrollFactor(0).setDepth(8600);
  const srcBall = scene.textures.get('obj-lumiball').getSourceImage();
  ball.add(scene.add.image(0, 0, 'obj-lumiball').setScale(60 / srcBall.height));
  scene.tweens.add({ targets: ball, scale: 1.1, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
  const hint = scene.add.text(scene.W / 2, scene.H - 210, '👆 Tocca la Lumiball!', {
    fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold', backgroundColor: '#00000088', padding: { x: 10, y: 5 },
  }).setOrigin(0.5).setScrollFactor(0).setDepth(8601);
  // #35 — anteprima "facilità" cattura: 1-3 stelline (niente numeri/percentuali).
  const sA = scene.eng.stato().avversario;
  const rar = scene.avversario.base.rarita || 'comune';
  const perc = percentualeCattura(sA.energia, sA.energiaMax, rar);
  const stelle = perc >= 60 ? 3 : (perc >= 30 ? 2 : 1);
  const lblFac = scene.add.text(scene.W / 2 - 64, scene.H - 150, 'facilità', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', backgroundColor: '#00000066', padding: { x: 4, y: 1 } }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(8601);
  const facStar = [];
  for (let i = 0; i < 3; i++) {
    const s = scene.add.star(scene.W / 2 + 50 + i * 26, scene.H - 150, 5, 5, 11, i < stelle ? 0xffd23f : 0x55555f).setStrokeStyle(2, 0x8a4b1e).setScrollFactor(0).setDepth(8601);
    facStar.push(s);
  }
  voce.parla('cattura:istruzioni');
  const extra = [lblFac, ...facStar];
  const annulla = bottone(scene, scene.W - 70, scene.H - 210, 110, 38, '✕ Annulla', 0x8a6f5a, () => fineCattura(scene, ball, hint, annulla, extra));
  scene._catturaUI = { ball, hint, annulla, extra };

  // BERSAGLIO a rettangolo (tap esatto) sopra la Lumiball.
  let lanciata = false;
  const hit = scene.add.rectangle(scene.W / 2, scene.H - 150, 96, 96, 0xffffff, 0.001).setScrollFactor(0).setDepth(8602).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => {
    if (lanciata) return; lanciata = true;
    audio.suono('tocco');
    scene.tweens.killTweensOf(ball); ball.setScale(1);
    hit.destroy(); hint.setVisible(false); annulla.cont.setVisible(false);
    extra.forEach((o) => o.setVisible(false));
    // #39 — consuma una Lumiball al lancio.
    if (window.GS && window.GS.inventario) { window.GS.inventario.lumiball = Math.max(0, (window.GS.inventario.lumiball || 0) - 1); salvaGS(); }
    scene._catturaInVolo = true;   // da qui in poi il watchdog veglia sulla sequenza
    lanciaLumiball(scene, ball, { x: ball.x, y: ball.y });
  });
}

function fineCattura(scene, ball, hint, annulla, extra) {
  ball?.destroy(); hint?.destroy(); annulla?.cont.destroy();
  (extra || []).forEach((o) => o.destroy());
  scene._catturaUI = null;
  scene._inCattura = false;
  scene._catturaInVolo = false;
  scene.bloccato = false;
  abilitaMosse(scene, true);
  aggiornaPannello(scene);
}

function lanciaLumiball(scene, ball, from) {
  audio.suono('lancio');
  const to = { x: scene.avversario.x, y: scene.avversario.y - 6 };
  const altezzaArco = 130;
  scene.tweens.addCounter({
    from: 0, to: 1, duration: 500, ease: 'Quad.in',
    onUpdate: (tw) => {
      const k = tw.getValue();
      ball.x = from.x + (to.x - from.x) * k;
      ball.y = (from.y + (to.y - from.y) * k) - altezzaArco * (4 * (k - k * k));   // parabola
      ball.angle = k * 720;
    },
    onComplete: () => sequenzaCattura(scene, ball, to),
  });
}

async function sequenzaCattura(scene, ball, at) {
  ball.setAngle(0);
  // Lumino entra nella sfera: flash + scompare + sfera cade a terra.
  FX.flashSchermo(scene, 0xffffff, 0.6, 200);
  scene.tweens.add({ targets: scene.avversario, scale: 0.1, alpha: 0, duration: 250 });
  await scene._attesa(280);
  const terra = scene.posAvv.y + 56 * (scene.SC || 1);
  await new Promise((r) => scene.tweens.add({ targets: ball, y: terra, duration: 260, ease: 'Quad.in', onComplete: r }));

  // 3 rimbalzi decrescenti.
  for (let i = 0; i < 3; i++) {
    const h = 36 - i * 10;
    await new Promise((r) => scene.tweens.add({ targets: ball, y: terra - h, yoyo: true, duration: 180 - i * 20, ease: 'Quad.out', onComplete: r }));
    wobble(scene, ball);
  }

  // Esito in base all'energia residua + rarità REALE.
  const sA = scene.eng.stato().avversario;
  const rarita = scene.avversario.base.rarita || 'comune';
  let perc = percentualeCattura(sA.energia, sA.energiaMax, rarita);
  // #39 — Trifoglio: bonus alla cattura, consumato.
  if (scene._trifoglioAttivo) { perc = Math.min(95, perc + 25); scene._trifoglioAttivo = false; }
  // #75 — cattura post-sconfitta: garantita.
  const successo = scene._catturaGarantita || Math.random() * 100 < perc;
  if (successo) catturaRiuscita(scene, ball);
  else catturaFallita(scene, ball);
}

function wobble(scene, ball) {
  scene.tweens.add({ targets: ball, angle: -12, yoyo: true, duration: 90, repeat: 1, onComplete: () => ball.setAngle(0) });
}

function catturaRiuscita(scene, ball) {
  scene._catturaInVolo = false;
  audio.suono('cattura'); vibra([30, 50, 30]);
  FX.particelle(scene, ball.x, ball.y, 0xffd23f, 22);
  FX.stellineFairPlay(scene, 8);
  Juice.coriandoli(scene, ball.x, ball.y, 30);
  scene.cameras.main.flash(180, 255, 255, 220);
  const star = scene.add.star(ball.x, ball.y - 4, 5, 6, 16, 0xffd23f).setStrokeStyle(2, 0x8a4b1e).setScrollFactor(0).setDepth(9000);
  scene.tweens.add({ targets: star, scale: 1.5, yoyo: true, duration: 300, repeat: 1 });
  const vocePromise = voce.parla('cattura:successo');   // promise: si risolve a fine clip
  aggiungiXP(15);   // XP giocatore per la cattura
  incrStat('catture');   // #70
  scene.time.delayedCall(500, () => audio.motivo && audio.motivo(scene.avversario.specie));   // #74 leitmotiv

  // Registra nel team + album (GS → state via salvaGS).
  const specie = scene.avversario.specie;
  if (window.GS) {
    window.GS.album = window.GS.album || {};
    const v = window.GS.album[specie] || { visto: true, catturato: false, quantita: 0, affezione: 0 };
    v.visto = true; v.catturato = true; v.quantita = (v.quantita || 0) + 1;
    if (scene.variante) v.variante = true;   // #59 — segna la variante speciale in album
    window.GS.album[specie] = v;
    // Un selvatico catturato NON ricompare al rientro (CittaScene._spawnLuminiOmbra → possiediLinea).
    window.GS.luminiCatturati = Object.keys(window.GS.album).filter((k) => window.GS.album[k].catturato);
    window.GS.team = window.GS.team || [];
    window.GS.deposito = window.GS.deposito || [];
    if (!window.GS.team.some((l) => l.specie === specie)) {
      // #58 — se la squadra è piena (6) il nuovo amico va al Rifugio dei Lumini.
      if (window.GS.team.length < 6) window.GS.team.push(creaIstanza(specie));
      else { window.GS.deposito.push(creaIstanza(specie)); scene._depositato = true; }
    }
    salvaGS({ immediato: true });   // nuovo Lumino: salva SUBITO (non perderlo al riavvio)
  }
  Juice.iconaSalvata(scene);
  FX.testoGrande(scene, `${scene.avversario.base.nome} catturato!`, '#ffd23f');
  if (scene._depositato) scene.time.delayedCall(800, () => FX.esclamazione(scene, scene.W / 2, scene.H * 0.5, 'Squadra piena: va al Rifugio! 🏠', '#7ad0ff'));
  // Aspetta che la VOCE finisca (min 1700ms per la festa, tetto 4500ms se voce off/bloccata).
  let _uscito = false;
  // _esciDaBattaglia rispetta un'eventuale EVOLUZIONE pendente.
  const _esci = () => { if (_uscito) return; _uscito = true; scene._esciDaBattaglia(); };
  const _minFesta = new Promise((r) => scene.time.delayedCall(1700, r));
  Promise.all([_minFesta, vocePromise]).then(_esci);
  scene.time.delayedCall(4500, _esci);   // tetto di sicurezza
}

function catturaFallita(scene, ball) {
  // Sfera si apre, flash, Lumino riemerge + humor di Pepole.
  FX.flashSchermo(scene, 0xffffff, 0.5, 180);
  scene.tweens.add({ targets: ball, alpha: 0, scale: 0.3, duration: 250, onComplete: () => ball.destroy() });
  scene.avversario.setScale(scene.scAvv || 1.15).setAlpha(0);           // era rimpicciolito/invisibile: riemerge
  scene.tweens.add({ targets: scene.avversario, alpha: 1, duration: 200 });
  scene.avversario.scuoti(8);
  scene.pepole.reagisci();
  // #27 — feedback chiaro che la cattura è fallita.
  FX.esclamazione(scene, scene.avversario.x, scene.avversario.y - 90, 'Si è liberato!', '#ff9a4d');
  voce.parla('humor:' + Phaser.Math.Between(0, 4));
  // Torna alla battaglia: la cattura ha USATO il turno → l'avversario attacca.
  scene._catturaInVolo = false;
  scene.time.delayedCall(900, () => {
    scene._catturaUI = null; scene._inCattura = false;
    scene._eseguiAzione(() => scene.eng.consumaTurnoGiocatore());
  });
}
