/* battaglia/arena.js — scenografia dell'arena di battaglia (VISTA pura).
 *
 * Estratto da BattagliaScene (F0.2): disegno del fondale, palette per zona e
 * pedane. Nessuna regola di gioco qui — solo rendering Phaser. Le funzioni
 * ricevono la `scene` e disegnano su di essa (invece di vivere come metodi
 * `this._*`), così la scena resta più piccola e la scenografia è riusabile/isolata.
 */
import { shade } from '../../gfx.js';

/** Palette colori del fondale in base alla zona (acquatica/rocciosa/prato). */
export function paletteArena(zona) {
  if (zona === 'acquatica') return { skyTop: 0x9fd8f5, skyBot: 0xdff3ff, horizon: 0x7fc8e8, g1: 0x6fc0e0, g2: 0x4f9fc4, g3: 0x3a86ad, cesp: 0x2f8fb0 };
  if (zona === 'rocciosa') return { skyTop: 0xd8c7a8, skyBot: 0xefe6d2, horizon: 0xc2ad88, g1: 0xb6a488, g2: 0x97836a, g3: 0x7a684f, cesp: 0x8a7a60 };
  return { skyTop: 0x8fc9f0, skyBot: 0xe8f6cf, horizon: 0xbfe089, g1: 0x8fd06a, g2: 0x6cb84f, g3: 0x4f9a3a, cesp: 0x3f8a2e };
}

/** Fondale fisso "cover" (riempie lo schermo senza distorcere) + micro-vita e velo. */
export function disegnaSfondo(scene) {
  if (scene.textures.exists('sfondo-arena')) scene.textures.get('sfondo-arena').setFilter(Phaser.Textures.FilterMode.LINEAR);
  const img = scene.add.image(scene.W / 2, scene.H / 2, 'sfondo-arena').setDepth(-1000);
  const sCov = Math.max(scene.W / img.width, scene.H / img.height);
  img.setScale(sCov);
  // Vita sul fondale fisso: respiro lentissimo + deriva impercettibile.
  scene.tweens.add({ targets: img, scaleX: sCov * 1.03, scaleY: sCov * 1.03, yoyo: true, repeat: -1, duration: 14000, ease: 'Sine.inOut' });
  scene.tweens.add({ targets: img, x: img.x + 14, yoyo: true, repeat: -1, duration: 19000, ease: 'Sine.inOut' });
  // Velo leggerissimo per far staccare i Lumini dal fondale.
  scene.add.rectangle(scene.W / 2, scene.H / 2, scene.W, scene.H, 0x000000, 0.04).setDepth(-990);
}

/** Pedana ellittica sotto un Lumino (con ombra e riflesso). */
export function disegnaPedana(scene, pal, x, y, w) {
  const g = scene.add.graphics().setDepth(-500);
  g.fillStyle(0x000000, 0.12); g.fillEllipse(x, y + 60, w * 1.05, w * 0.36);   // ombra
  g.fillStyle(shade(pal.g1, 0.1), 1); g.fillEllipse(x, y + 56, w, w * 0.30);
  g.lineStyle(4, shade(pal.g3, -0.1), 0.7); g.strokeEllipse(x, y + 56, w, w * 0.30);
  g.fillStyle(shade(pal.g1, 0.22), 0.5); g.fillEllipse(x - w * 0.12, y + 50, w * 0.5, w * 0.14);
}
