/* battaglia/widgets.js — widget UI condivisi della battaglia (VISTA pura).
 *
 * `bottone`: pulsante generico (rettangolo colorato + etichetta + feedback tap),
 * usato dal pannello mosse e dalla cattura. Estratto da BattagliaScene (F0.2) in un
 * modulo a parte perché condiviso da più cluster della scena. Riceve la `scene`. */
import { shade } from '../../gfx.js';
import audio from '../../../audio.js';

/** Pulsante generico. Ritorna {cont, bg, t}. `onTap` viene invocata al tocco. */
export function bottone(scene, x, y, w, h, label, colore, onTap) {
  const cont = scene.add.container(x, y).setScrollFactor(0).setDepth(8000);
  const bg = scene.add.rectangle(0, 0, w, h, colore).setStrokeStyle(3, shade(colore, -0.3)).setInteractive({ useHandCursor: true });
  const t = scene.add.text(0, 0, label, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 3 }).setOrigin(0.5);
  cont.add([bg, t]);
  bg.on('pointerdown', (p, lx, ly, ev) => {
    ev?.stopPropagation?.();
    audio.suono('tocco');
    scene.tweens.add({ targets: cont, scaleX: 1.12, scaleY: 1.12, duration: 90, yoyo: true, ease: 'Quad.out' });
    onTap();
  });
  return { cont, bg, t };
}
