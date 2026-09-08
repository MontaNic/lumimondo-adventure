/* ritratti.js — ritratti PROCEDURALI dei personaggi senza PNG (#76/#77).
 *
 * I capipalestra e gli allenatori erano resi con un'emoji dentro un box: stonava
 * accanto alle illustrazioni. Qui disegniamo, con Phaser Graphics, un personaggio
 * "flat" riconoscibile (testa, capelli, viso, spalle vestite + accessorio a tema),
 * distinto per ciascun leader. Usato sia come NPC in città sia come avatar nei dialoghi.
 * Niente asset esterni: è tutto codice (coerente con lo stile vettoriale del gioco).
 */

// Palette per personaggio: pelle, capelli, vestito, accento, accessorio (emoji).
const P = {
  marina:     { pelle: 0xf3c79b, capelli: 0x2e6f9c, vestito: 0x34a0d8, accento: 0x9fe0ff, emoji: '🌊' },
  silvio:     { pelle: 0xe8b890, capelli: 0x6b4a2a, vestito: 0x4caf50, accento: 0xa5d6a7, emoji: '🌱' },
  rik:        { pelle: 0xf3c79b, capelli: 0xffd23f, vestito: 0xf0a830, accento: 0xfff0a0, emoji: '⚡' },
  rocco:      { pelle: 0xd9a877, capelli: 0x3a2c22, vestito: 0x9b8579, accento: 0xcaa46a, emoji: '🧗' },
  maestro:    { pelle: 0xf3c79b, capelli: 0xdedede, vestito: 0x6a4cc4, accento: 0xffd23f, emoji: '👑' },
  bambino:    { pelle: 0xf3c79b, capelli: 0x6b4a2a, vestito: 0x2f6fc4, accento: 0x9ecbff, emoji: '🧢' },
  nonnatella: { pelle: 0xf0d2b0, capelli: 0xe4d8bf, vestito: 0x9a6fb0, accento: 0xd0b0e0, emoji: '👓' },
};

/** C'è un ritratto procedurale per questo personaggio? */
export function haRitratto(id) { return !!P[id]; }

/** Disegna un personaggio (busto: testa + spalle) centrato in (0,0) dentro un
 *  container. `scala` 1 ≈ 80px d'altezza. Ritorna il container. */
export function disegnaPersona(scene, id, scala = 1) {
  const c = scene.add.container(0, 0);
  const pal = P[id] || P.bambino;
  const g = scene.add.graphics();
  const s = scala;
  // Spalle / vestito (busto arrotondato in basso).
  g.fillStyle(pal.vestito, 1);
  g.fillRoundedRect(-26 * s, 12 * s, 52 * s, 34 * s, 12 * s);
  g.fillStyle(pal.accento, 1);
  g.fillRoundedRect(-6 * s, 12 * s, 12 * s, 30 * s, 4 * s);   // colletto/zip
  // Collo.
  g.fillStyle(pal.pelle, 1); g.fillRect(-6 * s, 4 * s, 12 * s, 12 * s);
  // Testa.
  g.fillStyle(pal.pelle, 1); g.fillCircle(0, -12 * s, 20 * s);
  // Capelli (calotta sopra la testa).
  g.fillStyle(pal.capelli, 1);
  g.beginPath();
  g.arc(0, -12 * s, 21 * s, Math.PI, 0, false);
  g.fillPath();
  g.fillRect(-21 * s, -13 * s, 42 * s, 4 * s);
  // Occhi + sorriso.
  g.fillStyle(0x3a2c22, 1);
  g.fillCircle(-7 * s, -12 * s, 2.4 * s); g.fillCircle(7 * s, -12 * s, 2.4 * s);
  g.lineStyle(2.4 * s, 0x8a4b1e, 1);
  g.beginPath(); g.arc(0, -8 * s, 7 * s, 0.15 * Math.PI, 0.85 * Math.PI, false); g.strokePath();
  c.add(g);
  // Accessorio a tema (piccolo, in alto a destra della testa).
  const emo = scene.add.text(15 * s, -26 * s, pal.emoji, { fontSize: Math.round(18 * s) + 'px' }).setOrigin(0.5);
  c.add(emo);
  c._altezza = 80 * s;
  return c;
}
