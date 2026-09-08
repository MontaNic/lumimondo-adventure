/* RiposoScene — #4 promemoria di PAUSA SALUTE (overlay).
 *
 * Ogni ~25 min di gioco attivo (vedi main.js) Pietro viene invitato a fare una
 * pausa: sgranchirsi, bere un po' d'acqua, guardare lontano. Niente di punitivo:
 * un micro-riposo guidato di pochi secondi con Pepole che sonnecchia, poi si
 * riprende. Si lancia SOPRA la scena di gioco messa in pausa (parent) e la
 * riprende dov'era alla chiusura.
 */

import { Pepole } from '../pepole-actor.js';
import audio from '../../audio.js';
import voce from '../../voce.js';

/** SHA-256 esadecimale (per verificare offline la password "bypass" dei genitori,
 *  il cui hash arriva da /api/config). Richiede contesto sicuro (HTTPS/localhost). */
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class RiposoScene extends Phaser.Scene {
  constructor() { super('RiposoScene'); }
  init(data) { this.parent = (data && data.parent) || 'MappaMondoScene'; }

  create() {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2, cy = height / 2;
    voce.stop();
    this.cameras.main.setBackgroundColor('rgba(8,16,12,0.82)');

    // Pannello morbido.
    const pw = Math.min(380, width * 0.9), ph = Math.min(440, height * 0.86), top = cy - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(cx - pw / 2 + 4, top + 8, pw, ph, 22);
    g.fillStyle(0x14241a, 0.98); g.fillRoundedRect(cx - pw / 2, top, pw, ph, 22);
    g.lineStyle(4, 0x9ed46a, 1); g.strokeRoundedRect(cx - pw / 2, top, pw, ph, 22);

    this.add.text(cx, top + 40, '🌿 Pausa Lumimondo!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#bdf0a0', fontStyle: 'bold',
      stroke: '#1c4a22', strokeThickness: 5, align: 'center', wordWrap: { width: pw - 30 },
    }).setOrigin(0.5);

    // Pepole che sonnecchia (dà l'esempio).
    const pep = new Pepole(this, cx, top + 130, { scala: 1.2 });
    if (pep.setEspressione) pep.setEspressione('dorme');
    this.tweens.add({ targets: pep, y: pep.y + 8, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
    const z = this.add.text(cx + 34, top + 96, '💤', { fontSize: '22px' }).setOrigin(0.5);
    this.tweens.add({ targets: z, y: z.y - 18, alpha: 0.3, yoyo: true, repeat: -1, duration: 1400 });

    this.add.text(cx, top + 214, 'Hai giocato un bel po\'!\nFacciamo riposare gli occhi 👀', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#ffffff', align: 'center',
      lineSpacing: 4, wordWrap: { width: pw - 40 },
    }).setOrigin(0.5);

    // Tre suggerimenti gentili.
    const tips = ['🤸  Sgranchisci le gambe', '💧  Bevi un po\' d\'acqua', '🌳  Guarda lontano dalla finestra'];
    tips.forEach((t, i) => this.add.text(cx, top + 252 + i * 26, t, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#cfeebb',
    }).setOrigin(0.5));

    // Micro-riposo guidato: conto alla rovescia dolce, poi il pulsante Riprendi.
    const SEC = Math.max(3, (window.LUMI_RIPOSO_SECONDI | 0) || 20);
    const conto = this.add.text(cx, top + ph - 64, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#9ed46a', fontStyle: 'bold',
    }).setOrigin(0.5);
    let rimasti = SEC;
    const tic = () => {
      rimasti--;
      if (rimasti > 0) { conto.setText(`Riposa ancora… ${rimasti}`); }
      else { conto.destroy(); this._mostraRiprendi(cx, top + ph - 56, pw); }
    };
    conto.setText(`Riposa ancora… ${rimasti}`);
    this.time.addEvent({ delay: 1000, repeat: SEC - 1, callback: tic });
    audio.suono('stellina');

    // Bypass GENITORI: piccolo link in basso. Con la password impostata in /admin un
    // adulto può saltare la pausa (e non riproporla per questa sessione).
    if (window.LUMI && window.LUMI.pausaHash) this._bottoneGenitori(cx, top + ph - 16);
  }

  _bottoneGenitori(x, y) {
    const t = this.add.text(x, y, '👪 Genitori: salta la pausa', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#9ed46a',
      backgroundColor: '#0d1d12aa', padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    t.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this._chiediBypass(); });
  }

  async _chiediBypass() {
    const hash = window.LUMI && window.LUMI.pausaHash;
    if (!hash) return this._toast('Nessuna password impostata (vedi /admin).');
    let pw = null;
    try { pw = window.prompt('Password genitori per saltare la pausa:'); } catch { pw = null; }
    if (!pw) return;
    let ok = false;
    try { ok = (await sha256hex(pw)) === hash; } catch { ok = false; }
    if (ok) { if (window.LUMI) window.LUMI.pausaBypass = true; this._riprendi(); }
    else this._toast('Password errata.');
  }

  _toast(testo) {
    const { width, height } = this.scale.gameSize;
    const t = this.add.text(width / 2, height * 0.9, testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#fff',
      backgroundColor: '#000000bb', padding: { x: 12, y: 6 }, align: 'center', wordWrap: { width: width * 0.8 },
    }).setOrigin(0.5).setDepth(99);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
  }

  _mostraRiprendi(x, y, pw) {
    const bw = pw - 60, bh = 54;
    const bg = this.add.rectangle(x, y, bw, bh, 0x2c7a33).setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true }).setScale(0.7);
    const t = this.add.text(x, y, '▶  Riprendi a giocare', {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5).setScale(0.7);
    this.tweens.add({ targets: [bg, t], scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: bg, alpha: 0.75, yoyo: true, repeat: -1, duration: 700 });
    bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); audio.suono('tocco'); this._riprendi(); });
  }

  _riprendi() {
    if (window.LUMI) window.LUMI.tempoGioco = 0;   // riparte il conteggio del gioco attivo
    this.scene.stop();
    this.scene.resume(this.parent);
  }
}
