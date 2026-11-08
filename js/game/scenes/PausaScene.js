/* PausaScene — menu utente di pausa (overlay).
 *
 * Si lancia SOPRA una scena di gioco messa in pausa (mappa/città/battaglia).
 * Permette di regolare il volume degli effetti e dei dialoghi, attivare/disattivare
 * la musica, riprendere o tornare al menu principale. Le modifiche si applicano dal
 * vivo (salvaGS() riversa in `stato()`, letto da audio/voce/musica) e sono persistite.
 */

import { salvaGS } from '../../gs.js';
import audio from '../../audio.js';
import voce from '../../voce.js';
import musica from '../../musica.js';
import { scaricaBackup } from '../../backup.js';
import * as Stato from '../../state.js';

function imp() {
  if (!window.GS) return {};
  window.GS.impostazioni = window.GS.impostazioni || {};
  return window.GS.impostazioni;
}
function getNum(k, def) { const v = imp()[k]; return typeof v === 'number' ? v : def; }
function setVal(k, v) { imp()[k] = v; try { salvaGS(); } catch { /* niente */ } }

export class PausaScene extends Phaser.Scene {
  constructor() { super('PausaScene'); }
  init(data) { this.parent = (data && data.parent) || 'MappaMondoScene'; }

  create() {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor('rgba(10,8,18,0.62)');
    const inBattaglia = this.parent === 'BattagliaScene';
    const inCitta = this.parent === 'CittaScene';
    // In ORIZZONTALE (telefono ruotato) lo spazio in altezza è poco → menu a 2 COLONNE,
    // così slider e accessibilità non finiscono fuori dal pannello.
    // (calcolato più sotto, quando si sa quante voci ci sono.)
    let wide = width > height && height < 620;

    // Voci del menu (secondo contesto): in battaglia solo Salva (le altre farebbero
    // ripartire lo scontro al ritorno).
    const voci = [];
    if (!inBattaglia) {
      voci.push({ l: '⚽\nSquadra', c: 0x3a6ea5, fn: () => this._vaiA('SquadraScene') });
      voci.push({ l: '💗\nCoccole', c: 0xc06090, fn: () => this._vaiA('CoccoleScene') });
      voci.push({ l: '📖\nLumidex', c: 0x6a4cc4, fn: () => this._vaiA('AlbumScene') });
      voci.push({ l: '🛒\nNegozio', c: 0x8a5a2e, fn: () => this._vaiA('NegozioScene') });
      voci.push({ l: '🏅\nMedaglie', c: 0xb8860b, fn: () => this._vaiA('DiarioScene') });
    }
    if (inCitta) {
      voci.push({ l: '🗺️\nMappa', c: 0x2f7d4f, fn: () => this._vaiMappa() });
      voci.push({ l: '💚\nRiposa', c: 0x2c7a33, fn: () => this._riposa() });
    }
    voci.push({ l: '💾\nSalva', c: 0x2c7a33, fn: () => this._salva() });
    // Senza save-server, il file di backup è l'UNICA copia dell'avventura fuori dal browser.
    voci.push({ l: '📤\nBackup', c: 0x3a6ea5, fn: () => this._backup() });

    // Altezza che serve DAVVERO al layout verticale (prima era fissa a 640px e il
    // contenuto traboccava: "Suoni" coperto da "Effetti", "Testo grande" sotto a
    // "Riprendi"). Se lo schermo è orizzontale e non basta, si passa a 2 colonne.
    const altezzaTall = 98 + Math.ceil(voci.length / 4) * 70 + 539;
    if (width > height && height * 0.95 < altezzaTall) wide = true;
    const pw = wide ? Math.min(770, width * 0.95) : Math.min(420, width * 0.95);
    const ph = wide ? Math.min(404, height * 0.96) : Math.min(altezzaTall, height * 0.95);
    const px = width / 2, py = height / 2, top = py - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(px - pw / 2 + 4, top + 8, pw, ph, 22);
    g.fillStyle(0x1a1226, 0.98); g.fillRoundedRect(px - pw / 2, top, pw, ph, 22);
    g.lineStyle(4, 0xffd23f, 1); g.strokeRoundedRect(px - pw / 2, top, pw, ph, 22);

    // Header: titolo + info squadra/stelle.
    this.add.text(px, top + 24, '☰  Menu', {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#ffd23f', fontStyle: 'bold',
    }).setOrigin(0.5);
    const nTeam = ((window.GS && window.GS.team) || []).length;
    const stelle = (window.GS && window.GS.stelline) || 0;
    const nome = (window.GS && window.GS.profilo && window.GS.profilo.nome) || 'Pietro';
    const liv = (window.GS && window.GS.livello) || 1;
    const st = (window.GS && window.GS.statistiche) || {};
    this.add.text(px, top + 48, `👤 ${nome}  ·  🎖️ Liv ${liv}  ·  ⚽ ${nTeam}  ·  ⭐ ${stelle}  ·  ⚔️ ${st.battaglieGiocate || 0}  ·  🎯 ${st.catture || 0}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#bfe3ff',
    }).setOrigin(0.5);

    if (wide) this._contenutoWide(px, top, pw, ph, voci);
    else this._contenutoTall(g, px, top, pw, ph, voci);

    this.input.keyboard?.on('keydown-ESC', () => this._chiudi());
  }

  /** Layout VERTICALE (portrait/tablet): sezioni ariose — "Vai a" (griglia grande),
   *  "Suoni" (slider), "Lettura" (accessibilità) — e i due pulsanti grandi in fondo. */
  _contenutoTall(g, px, top, pw, ph, voci) {
    const L = px - pw / 2 + 28, R = px + pw / 2 - 28;
    const sezione = (y, txt) => this.add.text(L, y, txt, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0, 0.5);
    // SEZIONE "Vai a" — destinazioni (tasti grandi, ≥60px).
    sezione(top + 84, '🎮  VAI A');
    const perRiga = Math.min(4, voci.length);
    const gap = 12, gbw = (pw - 56 - (perRiga - 1) * gap) / perRiga, gbh = 58;
    const gx0 = px - (perRiga * gbw + (perRiga - 1) * gap) / 2 + gbw / 2;
    const gy0 = top + 98 + gbh / 2;
    voci.forEach((v, i) => {
      const r = Math.floor(i / perRiga), col = i % perRiga;
      this._mini(gx0 + col * (gbw + gap), gy0 + r * (gbh + gap), gbw, gbh, v.l, v.c, v.fn);
    });
    let y = gy0 - gbh / 2 + Math.ceil(voci.length / perRiga) * (gbh + gap) + 14;
    g.lineStyle(2, 0xffffff, 0.1); g.lineBetween(L, y, R, y);
    // SEZIONE "Suoni" — slider ben spaziati.
    y += 22; sezione(y, '🔊  SUONI'); y += 50;   // l'etichetta dello slider sta 22px SOPRA la barra
    const sw = pw - 68, GAP = 60;
    this._slider(px, y, sw, '🔊  Effetti', () => getNum('volumeEffetti', 0.5),
      (v) => { setVal('volumeEffetti', v); audio.applicaVolume(); }, () => audio.suono('tocco'));
    this._slider(px, y + GAP, sw, '💬  Dialoghi', () => getNum('volume', 1), (v) => { setVal('volume', v); });
    this._slider(px, y + GAP * 2, sw, '🎵  Musica', () => getNum('volumeMusica', 0),
      (v) => { setVal('volumeMusica', v); musica.aggiorna(); });
    y += GAP * 3 - 6;
    g.lineBetween(L, y, R, y);
    // SEZIONE "Lettura" — accessibilità.
    y += 20; sezione(y, '👁  LETTURA'); y += 28;
    const half = (pw - 68) / 2;
    this._toggleTestoGrande(px - half / 2 - 6, y, half);
    this._toggleVelocita(px + half / 2 + 6, y, half);
    // Azioni principali (grandi).
    this._btn(px, top + ph - 86, pw - 56, 54, '▶  Riprendi a giocare', 0x2c7a33, () => this._chiudi());
    this._btn(px, top + ph - 28, pw - 56, 42, '🏠  Menu principale', 0x8a5a2e, () => this._alMenu());
  }

  /** Layout ORIZZONTALE (telefono ruotato): 2 colonne — sinistra funzioni, destra
   *  audio+accessibilità — e i due pulsanti grandi in basso che spannano la larghezza. */
  _contenutoWide(px, top, pw, ph, voci) {
    const colL = px - pw * 0.25, colR = px + pw * 0.25;
    // SINISTRA: funzioni a 2 colonne.
    const lbw = (pw / 2 - 50) / 2 - 6, lbh = 44;
    const ly0 = top + 80;
    voci.forEach((v, i) => {
      const r = Math.floor(i / 2), cc = i % 2;
      this._mini(colL + (cc === 0 ? -(lbw / 2 + 5) : (lbw / 2 + 5)), ly0 + r * (lbh + 8), lbw, lbh, v.l, v.c, v.fn);
    });
    // DESTRA: slider + accessibilità.
    const sw = pw / 2 - 64, GAP = 50, sy = top + 92;
    this._slider(colR, sy, sw, '🔊  Effetti', () => getNum('volumeEffetti', 0.5),
      (v) => { setVal('volumeEffetti', v); audio.applicaVolume(); }, () => audio.suono('tocco'));
    this._slider(colR, sy + GAP, sw, '💬  Dialoghi', () => getNum('volume', 1), (v) => { setVal('volume', v); });
    this._slider(colR, sy + GAP * 2, sw, '🎵  Musica', () => getNum('volumeMusica', 0),
      (v) => { setVal('volumeMusica', v); musica.aggiorna(); });
    const ay = sy + GAP * 3 - 2, half = (pw / 2 - 56) / 2;
    this._toggleTestoGrande(colR - half / 2 - 5, ay, half);
    this._toggleVelocita(colR + half / 2 + 5, ay, half);
    // BASSO: Riprendi + Menu principale affiancati.
    const by = top + ph - 30;
    this._btn(colL, by, pw * 0.46, 44, '▶  Riprendi', 0x2c7a33, () => this._chiudi());
    this._btn(colR, by, pw * 0.46, 44, '🏠  Menu', 0x8a5a2e, () => this._alMenu());
  }

  /** 🗺️ Esci alla mappa del mondo (dalla città). Chiude il menu e la città. */
  _vaiMappa() {
    if (window.GS) window.GS.posCitta = null;   // dal menu → mappa: rientro dall'inizio
    try { salvaGS(); } catch { /* niente */ }
    voce.stop();
    this.scene.stop(this.parent);
    this.scene.start('MappaMondoScene');
  }

  /** 💚 Riposa i Lumini: ricarica l'energia della squadra a pieno + salva (come un
   *  Centro Lumini, ma dal menu). Dolce, niente posta in gioco. */
  _riposa() {
    const g2 = window.GS;
    if (g2 && Array.isArray(g2.team)) {
      g2.team.forEach((l) => { if (l && l.energiaMax) l.energia = l.energiaMax; });
      try { salvaGS(); } catch { /* niente */ }
    }
    audio.suono('stellina'); audio.suono('vittoria');
    const { width, height } = this.scale.gameSize;
    const t = this.add.text(width / 2, height / 2, '💚  Lumini riposati!\nCarichi a mille ⭐', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold', align: 'center',
      backgroundColor: '#2c7a33ee', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(99).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 18, delay: 1100, duration: 450, onComplete: () => t.destroy() });
  }

  _slider(cx, y, w, label, get, onChange, onTapSuono) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    // Etichetta a sinistra e % a destra, SOPRA la barra (riga pulita).
    this.add.text(x0, y - 22, label, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const pct = this.add.text(x1, y - 22, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(1, 0.5);
    // Barra (track scuro arrotondato + riempimento dorato).
    const trackY = y + 8;
    const track = this.add.graphics();
    track.fillStyle(0x000000, 0.45); track.fillRoundedRect(x0, trackY - 5, w, 10, 5);
    const fill = this.add.graphics();
    const knob = this.add.circle(x0, trackY, 15, 0xffd23f).setStrokeStyle(3, 0x8a4b1e).setInteractive({ useHandCursor: true, draggable: true });
    const applica = (v) => {
      v = Math.max(0, Math.min(1, v));
      knob.x = x0 + v * w;
      fill.clear(); fill.fillStyle(0xffd23f, 1); fill.fillRoundedRect(x0, trackY - 5, Math.max(10, v * w), 10, 5);
      pct.setText(Math.round(v * 100) + '%');
    };
    applica(get());
    let ultimoSuono = 0;
    const muovi = (sx) => {
      const v = (Math.max(x0, Math.min(x1, sx)) - x0) / w;
      applica(v); onChange(v);
      const now = this.time.now;
      if (onTapSuono && now - ultimoSuono > 140) { ultimoSuono = now; onTapSuono(); }
    };
    knob.on('drag', (p, dx) => muovi(dx));
    // Tocco/click sulla barra: salta al valore.
    const hit = this.add.rectangle(cx, trackY, w + 40, 38, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p) => muovi(p.x));
  }

  _btn(x, y, w, h, label, colore, cb) {
    const bg = this.add.rectangle(x, y, w, h, colore).setStrokeStyle(3, 0x2c1f14).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      this.tweens.add({ targets: [bg, t], scaleX: 1.06, scaleY: 1.06, duration: 80, yoyo: true });
      cb();
    });
    return { bg, t };
  }

  _mini(x, y, w, h, label, colore, cb) {
    const bg = this.add.rectangle(x, y, w, h, colore).setStrokeStyle(3, 0x2c1f14).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', align: 'center', lineSpacing: 1 }).setOrigin(0.5);
    bg.on('pointerdown', (p, lx, ly, ev) => {
      ev?.stopPropagation?.();
      audio.suono('tocco');
      this.tweens.add({ targets: [bg, t], scaleX: 1.08, scaleY: 1.08, duration: 80, yoyo: true });
      cb();
    });
    return { bg, t };
  }

  /** #5/#18 — Vai a una schermata (Squadra/Lumidex). La scena di gioco va a DORMIRE
   *  (sleep), non stop: così al ritorno si RISVEGLIA dov'era (posizione di Pietro,
   *  regia in corso) invece di ricrearsi da capo. `this.scene.start` chiude PausaScene. */
  _vaiA(scene) {
    try { salvaGS(); } catch { /* niente */ }
    voce.stop();
    const parent = this.parent;
    this.scene.sleep(parent);
    this.scene.start(scene, { ritorno: parent, dormiente: true });
  }

  /** #24 — Salva con conferma visiva. */
  _salva() {
    try { salvaGS(); } catch { /* niente */ }
    audio.suono('stellina');
    const { width, height } = this.scale.gameSize;
    const t = this.add.text(width / 2, height / 2, '💾  Progressi salvati!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#2c7a33ee', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(99).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 18, delay: 1000, duration: 450, onComplete: () => t.destroy() });
  }

  /** Scarica l'avventura in un file JSON. È la rete di sicurezza che sostituisce il
   *  save-server: si ripristina dalla schermata dei profili, anche su un altro dispositivo
   *  o a un altro indirizzo. Vedi `backup.js` e PIANO_PAGES.md. */
  _backup() {
    let messaggio, colore;
    try {
      salvaGS({ immediato: true });                 // il file deve contenere anche l'ultimo passo
      const nome = scaricaBackup(Stato.stato());
      messaggio = '📤  Backup salvato!\n' + nome;
      colore = '#2c7a33ee';
      audio.suono('stellina');
    } catch (e) {
      messaggio = '😅  Backup non riuscito.\nRiprova tra poco.';
      colore = '#8a4b1eee';
      console.error('Backup fallito:', e.message);
    }
    const { width, height } = this.scale.gameSize;
    const t = this.add.text(width / 2, height / 2, messaggio, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#fff', fontStyle: 'bold',
      align: 'center', backgroundColor: colore, padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(99).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 18, delay: 2200, duration: 450, onComplete: () => t.destroy() });
  }

  /** #78 — Toggle "Testo grande". */
  _toggleTestoGrande(x, y, w) {
    const bg = this.add.rectangle(x, y, w, 44, 0x3a2c52).setStrokeStyle(2, 0x6a4cc4).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 8 } }).setOrigin(0.5);
    const set = () => t.setText('🔠 Testo grande\n' + (imp().testoGrande ? 'ON' : 'OFF'));
    set();
    bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); imp().testoGrande = !imp().testoGrande; try { salvaGS(); } catch {} audio.suono('tocco'); set(); });
  }

  /** #80 — Velocità testo (lento → normale → veloce, ciclica). */
  _toggleVelocita(x, y, w) {
    const giri = ['lento', 'normale', 'veloce'];
    const lab = { lento: '🐢 Lento', normale: '▶ Normale', veloce: '⏩ Veloce' };
    const bg = this.add.rectangle(x, y, w, 44, 0x3a2c52).setStrokeStyle(2, 0x6a4cc4).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#fff', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 8 } }).setOrigin(0.5);
    const set = () => { const v = imp().velocitaTesto || 'normale'; t.setText('💬 Testo\n' + (lab[v] || lab.normale)); };
    set();
    bg.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); const cur = giri.indexOf(imp().velocitaTesto || 'normale'); imp().velocitaTesto = giri[(cur + 1) % giri.length]; try { salvaGS(); } catch {} audio.suono('tocco'); set(); });
  }

  _chiudi() {
    try { salvaGS(); } catch { /* niente */ }
    this.scene.stop();
    this.scene.resume(this.parent);
  }

  _alMenu() {
    try { salvaGS(); } catch { /* niente */ }
    voce.stop();
    try { musica.ferma(); } catch { /* niente */ }
    this.scene.stop(this.parent);
    this.scene.start('MenuScene');
  }
}
