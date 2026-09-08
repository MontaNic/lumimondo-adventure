/* battaglia/hud.js — HUD della battaglia (VISTA pura).
 *
 * Estratto da BattagliaScene (F0.2): barre d'energia a stelline, badge elemento
 * dell'avversario, efficacia di una mossa, icone di stato (scudo/doppio/giramenti).
 * Nessuna regola: legge lo stato del motore e disegna. Le funzioni ricevono la
 * `scene` (invece di vivere come this._*), e leggono/scrivono su di essa i campi
 * volatili già usati prima (scene._badgeAvv, scene._statoIcone, scene.barAll…).
 */
import { LUMINI, moltiplicatoreTipo } from '../../../lumini-data.js';
import { COL_ELEM, EMO_ELEM } from './elementi.js';

/** Livello fittizio dal grado evolutivo (solo estetico sull'etichetta). */
export function livello(b) {
  return b.stadio === 3 ? 22 : b.stadio === 2 ? 14 : 6;
}

/** Costruisce la barra d'energia a stelline di un Lumino. Ritorna {cont, stelle, max, mostrate, nome}. */
export function barraEnergia(scene, x, y, specie) {
  const b = LUMINI[specie] || {};
  const max = b.energiaMax || 6;
  const w = Math.max(168, 36 + max * 24);
  const cont = scene.add.container(x, y).setScrollFactor(0).setDepth(8000);
  // Pannello arrotondato semitrasparente con bordo dorato.
  const g = scene.add.graphics();
  g.fillStyle(0x1a1226, 0.82); g.fillRoundedRect(0, 0, w, 54, 12);
  g.lineStyle(3, 0xffd23f, 0.95); g.strokeRoundedRect(0, 0, w, 54, 12);
  cont.add(g);
  const nome = scene.add.text(12, 8, b.nome || specie, {
    fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
  });
  const liv = scene.add.text(w - 12, 8, 'Lv.' + livello(b), {
    fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffd23f', fontStyle: 'bold',
  }).setOrigin(1, 0);
  cont.add([nome, liv]);
  const stelle = [];
  for (let i = 0; i < max; i++) {
    const s = scene.add.star(20 + i * 24, 38, 5, 5, 10, 0xffd23f).setStrokeStyle(2, 0x8a4b1e);
    stelle.push(s); cont.add(s);
  }
  return { cont, stelle, max, mostrate: max, nome };
}

/** Accende/spegne le stelle a una a una in base all'energia (con lampeggio rosso all'ultima). */
export function aggiornaBarra(scene, bar, energia, energiaMax) {
  bar.stelle.forEach((s, i) => {
    const attiva = i < energia;
    const oltreMax = i >= energiaMax;
    if (oltreMax) { s.setVisible(false); return; }
    s.setVisible(true);
    if (attiva && s.alpha < 1) {
      scene.tweens.add({ targets: s, alpha: 1, scale: 1, duration: 200 });
    } else if (!attiva && s.alpha > 0.2) {
      // spegnimento con tremore
      scene.tweens.add({ targets: s, alpha: 0.18, duration: 250 });
      scene.tweens.add({ targets: s, angle: { from: -12, to: 12 }, yoyo: true, duration: 60, repeat: 2 });
    }
  });
  if (energia <= 1 && energia > 0) {
    // ultima stellina: lampeggio rosso (set color, non tween numerico) + shake
    bar.stelle.filter((s) => s.visible && s.alpha > 0.5).forEach((s) => {
      s.setFillStyle(0xff4d4d);
      scene.tweens.add({ targets: s, scale: 1.3, alpha: 0.5, yoyo: true, repeat: 3, duration: 170,
        onComplete: () => { s.setFillStyle(0xffd23f); s.setScale(1).setAlpha(1); } });
    });
    scene.cameras.main.shake(120, 0.004);
  } else {
    // ripristina il giallo se la stella è di nuovo "piena"
    bar.stelle.forEach((s, i) => { if (i < energia && i < energiaMax) s.setFillStyle(0xffd23f); });
  }
}

/** #33 — Badge elemento sopra l'avversario (cerchio colorato + emoji), con respiro lieve.
 *  Si ridisegna se l'avversario cambia (best-of). Salva il container in scene._badgeAvv. */
export function badgeTipo(scene, specie) {
  if (scene._badgeAvv) scene._badgeAvv.destroy();
  const el = (LUMINI[specie] || {}).elemento || 'mistero';
  const c = scene.add.container(scene.posAvv.x + 64, scene.posAvv.y - 64).setDepth(140);
  const cir = scene.add.circle(0, 0, 17, COL_ELEM[el] || 0x888888).setStrokeStyle(3, 0xfff6e3);
  const emo = scene.add.text(0, 0, EMO_ELEM[el] || '❓', { fontSize: '18px' }).setOrigin(0.5);
  c.add([cir, emo]);
  scene.tweens.add({ targets: c, y: c.y - 5, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
  scene._badgeAvv = c;
}

/** Efficacia di una mossa del giocatore contro l'elemento avversario attuale. */
export function efficacia(scene, m) {
  if (!m || !((m.danno || 0) > 0) || !scene.cfgAvversario) return 'normale';
  const el = (LUMINI[scene.cfgAvversario] || {}).elemento;
  const k = moltiplicatoreTipo(m.elemento, el);
  return k === 1.5 ? 'super' : (k < 1 ? 'scarso' : 'normale');
}

/** #34/#43 — Icone di stato persistenti sopra un Lumino (✨ doppio, 🛡️ scudo, 💫 giramenti,
 *  ❓ confuso). Lette dallo stato del motore dopo ogni azione. Salva in scene._statoIcone. */
export function aggiornaStatoIcone(scene) {
  if (!scene.eng) return;
  const s = scene.eng.stato();
  scene._statoIcone = scene._statoIcone || {};
  const dis = (chi, lum, st) => {
    if (!lum) return;
    let box = scene._statoIcone[chi];
    // `!box.scene` = game object distrutto (es. dopo scene.restart): ne ricreo uno
    // pulito invece di toccarne uno morto (che lancerebbe su setText → frame null).
    if (!box || !box.scene) { box = scene.add.text(lum.x, lum.y - 86, '', { fontSize: '22px' }).setOrigin(0.5).setDepth(160); scene._statoIcone[chi] = box; }
    const icone = [];
    if (st.doppio) icone.push('✨');     // colpo doppio pronto
    if (st.scudo) icone.push('🛡️');     // scudo attivo
    if (st.stordito > 0) icone.push('💫'); // giramenti
    if (st.confuso) icone.push('❓');
    box.setText(icone.join(' ')).setPosition(lum.x, lum.y - 86).setVisible(icone.length > 0);
  };
  dis('alleato', scene.alleato, s.alleato);
  dis('avversario', scene.avversario, s.avversario);
}
