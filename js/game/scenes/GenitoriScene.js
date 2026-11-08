/* GenitoriScene — Area Genitori dentro il gioco (alternativa al pannello /admin,
 * che su GitHub Pages non esiste perché richiede un server).
 *
 * Si apre dal menu principale con il pulsante "👪 Genitori", protetto da password
 * (vedi apriAreaGenitori). Regola, per il profilo attivo:
 *  - pausa salute attiva/spenta e ogni quanti minuti;
 *  - difficoltà delle sfide (piccoli / grandi);
 * e permette di cambiare la password. Tutto resta su questo dispositivo.
 */

import audio from '../../audio.js';
import { salvaGS } from '../../gs.js';
import {
  haPassword, impostaPassword, verificaPassword, domandaAdulto,
  DURATE_PAUSA, DURATA_DEFAULT,
} from '../../genitori.js';

const FONT = 'system-ui, sans-serif';

function imp() {
  if (!window.GS) return {};
  window.GS.impostazioni = window.GS.impostazioni || {};
  return window.GS.impostazioni;
}

function chiedi(msg) { try { return window.prompt(msg); } catch { return null; } }
function avvisa(msg) { try { window.alert(msg); } catch { /* niente */ } }
function conferma(msg) { try { return window.confirm(msg); } catch { return false; } }

/** Chiede (o crea, al primo uso) la nuova password: due volte, almeno 4 caratteri. */
async function nuovaPassword(titolo) {
  const p1 = chiedi(`${titolo}\n\nScegli una password (almeno 4 caratteri).\nServe per entrare qui e per saltare la pausa salute.`);
  if (p1 == null) return false;
  if (p1.trim().length < 4) { avvisa('La password deve avere almeno 4 caratteri.'); return false; }
  const p2 = chiedi('Ripeti la password:');
  if (p2 == null) return false;
  if (p1 !== p2) { avvisa('Le due password non coincidono. Riprova.'); return false; }
  try { await impostaPassword(p1); } catch { avvisa('Impossibile salvare la password su questo browser.'); return false; }
  return true;
}

/** Porta all'Area Genitori dopo il controllo password. `scene` è la scena chiamante. */
export async function apriAreaGenitori(scene, ritorno = 'MenuScene') {
  const vai = () => scene.scene.start('GenitoriScene', { ritorno });
  if (!haPassword()) {
    if (await nuovaPassword('👪 Area Genitori — primo accesso')) vai();
    return;
  }
  const pw = chiedi('👪 Area Genitori\n\nPassword:');
  if (pw == null || pw === '') return;
  if (await verificaPassword(pw)) { vai(); return; }
  // Password errata: possibilità di reimpostarla rispondendo a una domanda "da grandi".
  if (!conferma('Password errata.\n\nL\'hai dimenticata? Premi OK per reimpostarla.')) return;
  const d = domandaAdulto();
  const r = chiedi(`Domanda per i grandi: quanto fa ${d.testo}?`);
  if (r == null) return;
  if (Number(String(r).trim()) !== d.risposta) { avvisa('Risposta sbagliata.'); return; }
  if (await nuovaPassword('🔑 Nuova password')) vai();
}

export class GenitoriScene extends Phaser.Scene {
  constructor() { super('GenitoriScene'); }

  init(data) { this.ritorno = (data && data.ritorno) || 'MenuScene'; }

  create() {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor('#1d2a3a');

    const pw = Math.min(420, width * 0.92);
    const nome = (window.GS && window.GS.profilo && window.GS.profilo.nome) || 'profilo attivo';

    this.add.text(cx, 34, '👪 Area Genitori', {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 64, `Impostazioni di ${nome} · solo su questo dispositivo`, {
      fontFamily: FONT, fontSize: '14px', color: '#a9c1dc', align: 'center', wordWrap: { width: pw },
    }).setOrigin(0.5);

    // Spazio verticale adattivo (tablet orizzontale = poco spazio in altezza).
    const y0 = 110, passo = Math.max(58, Math.min(74, (height - y0 - 150) / 4));
    this._riga(cx, y0, pw, () => `🌿 Pausa salute: ${imp().pausaSalute === false ? 'SPENTA' : 'ATTIVA'}`, () => {
      imp().pausaSalute = imp().pausaSalute === false;
      if (window.LUMI) window.LUMI.tempoGioco = 0;
    });
    this._riga(cx, y0 + passo, pw, () => {
      const off = imp().pausaSalute === false;
      return `⏱️ Pausa ogni: ${this._durata()} min${off ? '  (pausa spenta)' : ''}`;
    }, () => {
      const i = DURATE_PAUSA.indexOf(this._durata());
      imp().pausaSaluteMin = DURATE_PAUSA[(i + 1) % DURATE_PAUSA.length];
    });
    this._riga(cx, y0 + passo * 2, pw, () => (
      (imp().difficolta || 'piccoli') === 'grandi' ? '🎯 Difficoltà: Grandi (più sfida)' : '🎯 Difficoltà: Piccoli (più aiuti)'
    ), () => {
      imp().difficolta = (imp().difficolta || 'piccoli') === 'grandi' ? 'piccoli' : 'grandi';
    });
    this._riga(cx, y0 + passo * 3, pw, () => '🔑 Cambia password', async () => {
      if (await nuovaPassword('🔑 Nuova password')) this._toast('Password aggiornata ✅');
    }, 0x3a3150, 0x7b68b0);

    // Stato del conteggio: quanto manca alla prossima pausa.
    this.info = this.add.text(cx, y0 + passo * 4 - 6, '', {
      fontFamily: FONT, fontSize: '14px', color: '#cfe0f2', align: 'center', wordWrap: { width: pw },
    }).setOrigin(0.5);
    this._aggiornaInfo();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this._aggiornaInfo() });

    // Torna al menu.
    const by = Math.min(height - 44, y0 + passo * 4 + 50);
    const bg = this.add.rectangle(cx, by, Math.min(260, pw), 56, 0x2c7a33)
      .setStrokeStyle(3, 0x16451c).setInteractive({ useHandCursor: true });
    this.add.text(cx, by, '◀  Torna al menu', {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      try { salvaGS({ immediato: true }); } catch { /* niente */ }
      this.scene.start(this.ritorno);
    });
  }

  _durata() {
    const m = imp().pausaSaluteMin;
    return (typeof m === 'number' && m >= 5) ? m : DURATA_DEFAULT;
  }

  _aggiornaInfo() {
    if (!this.info) return;
    if (imp().pausaSalute === false) { this.info.setText('La pausa salute è spenta.'); return; }
    const fatti = Math.floor(((window.LUMI && window.LUMI.tempoGioco) || 0) / 60000);
    const mancano = Math.max(0, this._durata() - fatti);
    this.info.setText(`Tempo di gioco contato finora: ${fatti} min · prossima pausa tra circa ${mancano} min`);
  }

  /** Riga-pulsante: tocca per cambiare valore. `testo` è una funzione (rilettura dopo il tocco). */
  _riga(x, y, w, testo, azione, colore = 0x24425f, bordo = 0x4f86bd) {
    const bg = this.add.rectangle(x, y, w, 50, colore).setStrokeStyle(2, bordo).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, testo(), {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 16 },
    }).setOrigin(0.5);
    this._righe = this._righe || [];
    this._righe.push({ t, testo });
    bg.on('pointerdown', async (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      await azione();
      try { salvaGS(); } catch { /* niente */ }
      this._righe.forEach((r) => r.t.setText(r.testo()));   // alcune righe dipendono da altre
      this._aggiornaInfo();
    });
  }

  _toast(testo) {
    const { width, height } = this.scale.gameSize;
    const t = this.add.text(width / 2, height - 14, testo, {
      fontFamily: FONT, fontSize: '15px', color: '#fff', backgroundColor: '#000000bb', padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 1).setDepth(99);
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 500, onComplete: () => t.destroy() });
  }
}
