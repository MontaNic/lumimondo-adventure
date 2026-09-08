/* ProfiloScene — schermata d'avvio: crea o scegli un PROFILO (solo nome + età,
 * nessun dato sensibile). Sostituisce il vecchio "Gioca!". "Nuovo profilo" = partita
 * da capo (ogni profilo ha il suo salvataggio). Da qui si entra direttamente nel gioco.
 */

import { inizializzaGS, salvaGS } from '../../gs.js';
import { avviaSyncAutomatica, pushProfilo } from '../../sync.js';
import * as Stato from '../../state.js';
import { listaProfili, creaProfilo, segnaUso, registraProfilo, registraProfiloLocale, marcaSincronizzato, rimuoviProfilo, aggiornaMetaProfilo } from '../../profili.js';
import { scegliFileBackup, leggiBackup, riassuntoBackup, backupPiuVecchio } from '../../backup.js';
import audio from '../../audio.js';

const ETA_MIN = 5, ETA_MAX = 9, ETA_DEF = 7;

export class ProfiloScene extends Phaser.Scene {
  constructor() { super('ProfiloScene'); }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.W = W; this.H = H;
    this.cameras.main.setBackgroundColor('#1a2236');
    // Sfondo morbido + titolo.
    this.add.rectangle(W / 2, H / 2, W, H, 0x223052).setAlpha(0.0);
    this.add.text(W / 2, H * 0.12, 'Lumimondo', { fontFamily: 'system-ui, sans-serif', fontSize: '40px', color: '#ffd23f', fontStyle: 'bold', stroke: '#3a2c22', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.18, 'Adventure', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#7ad0ff', fontStyle: 'bold' }).setOrigin(0.5);

    this._eta = ETA_DEF;
    this._defaults = {};   // default per i nuovi profili (dal superadmin)
    this._layer = this.add.container(0, 0);
    const profili = listaProfili();
    if (profili.length) this._mostraSelezione(profili); else this._mostraCreazione();

    // Profili VERI lato server: li unisco al registro locale (best-effort, offline-safe)
    // così appaiono anche su un altro dispositivo. Carico anche i default del superadmin.
    this._sincronizzaServer();

    // Pulizia input DOM all'uscita dalla scena.
    this.events.once('shutdown', () => this._rimuoviInput());
    this.events.once('destroy', () => this._rimuoviInput());
  }

  async _sincronizzaServer() {
    try {
      const [rp, rc] = await Promise.all([fetch('/api/profili'), fetch('/api/config')]);
      let profiliRevServer = 0;
      if (rc && rc.ok) {
        const c = await rc.json();
        this._defaults = (c && c.defaults) || {};
        // Hash della password "bypass pausa salute" → disponibile a RiposoScene (verifica offline).
        if (typeof window !== 'undefined') { window.LUMI = window.LUMI || {}; window.LUMI.pausaHash = (c && c.pausaHash) || null; }
        profiliRevServer = Number(c && c.profiliRev) || 0;
      }
      if (rp && rp.ok) {
        const serverProfili = await rp.json();
        let aggiunti = false;
        for (const sp of (Array.isArray(serverProfili) ? serverProfili : [])) {
          if (registraProfilo(sp)) aggiunti = true;
        }
        // Se sono comparsi profili, aggiorno la selezione — MA non strappo l'utente
        // via se sta scrivendo un nome nuovo (niente perdita di input).
        if (aggiunti && !(this._modo === 'creazione' && this._inputEl && this._inputEl.value.trim())) {
          this._mostraSelezione(listaProfili());
        }
        // Riconciliazione elenco profili ↔ server (il server è la fonte di verità):
        const serverArr = Array.isArray(serverProfili) ? serverProfili : [];
        const metaServer = new Map(serverArr.map((p) => [p.id, p]));
        // Server raggiungibile e con ALMENO un profilo: mi fido a rimuovere le voci cancellate.
        // Se il server è vuoto NON tolgo nulla (possibile glitch/volume non montato)… TRANNE
        // quando il genitore ha appena cancellato/applicato dal pannello: `profiliRev` sale e
        // rende l'elenco (anche vuoto) AUTOREVOLE, così "cancella tutti" attecchisce davvero.
        const REV_KEY = 'lumimondo-adventure:profiliRev';
        let revLocale = 0; try { revLocale = Number(localStorage.getItem(REV_KEY)) || 0; } catch { /* */ }
        const adminHaApplicato = profiliRevServer > revLocale;
        const serverAffidabile = serverArr.length > 0 || adminHaApplicato;
        let cambiato = false;
        for (const lp of listaProfili()) {
          const m = metaServer.get(lp.id);
          if (m) {
            // Presente sul server: allineo la voce (nome/età dal server) e la marco.
            marcaSincronizzato(lp.id);
            if (aggiornaMetaProfilo(lp.id, { nome: m.nome, eta: m.eta })) cambiato = true;
            continue;
          }
          const grezzo = Stato.leggiGrezzo(lp.id);
          const haSalvataggio = !!(grezzo && (Number(grezzo.aggiornato) || 0) > 0);
          if (lp.sincronizzato && serverAffidabile) {
            // Era sul server e ora non c'è più → ELIMINATO dal genitore via /admin: tolgo la
            // voce dal menu E il salvataggio locale, così la cancellazione "attecchisce" e i
            // vecchi progressi non riappaiono. (Il bambino ne ricrea uno nuovo da zero.)
            rimuoviProfilo(lp.id); Stato.rimuoviSalvataggio(lp.id); cambiato = true;
          } else if (haSalvataggio) {
            // Creato qui e mai arrivato al cloud (es. offline) → lo invio, così compare in
            // /admin (non perdo un profilo con progressi). Se il push riesce lo marco.
            const ok = await pushProfilo(lp.id, grezzo);
            if (ok) marcaSincronizzato(lp.id);
          } else if (serverAffidabile) {
            // Voce ORFANA: niente salvataggio locale e non è sul server → la tolgo dal menu.
            rimuoviProfilo(lp.id); cambiato = true;
          }
        }
        // Ricordo la rev vista: la modalità "autorevole" scatta una sola volta per cambio admin.
        try { if (profiliRevServer) localStorage.setItem(REV_KEY, String(profiliRevServer)); } catch { /* */ }
        if (cambiato && !(this._modo === 'creazione' && this._inputEl && this._inputEl.value.trim())) {
          this._mostraSelezione(listaProfili());
        }
      }
    } catch { /* offline: si gioca lo stesso coi profili locali */ }
  }

  _clear() { if (this._layer) { this._layer.removeAll(true); } this._rimuoviInput(); }

  // --- Selezione tra profili esistenti -------------------------------------
  _mostraSelezione(profili) {
    this._clear();
    this._modo = 'selezione';
    const W = this.W, H = this.H;
    this._layer.add(this.add.text(W / 2, H * 0.28, 'Chi sta giocando?', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    const ord = [...profili].sort((a, b) => (b.usato || b.creato || 0) - (a.usato || a.creato || 0));
    const cw = Math.min(360, W * 0.8), ch = 56, gap = 12;
    let y = H * 0.36;
    ord.slice(0, 4).forEach((p) => {
      // Data (creazione) sotto il nome: distingue gli OMONIMI a colpo d'occhio.
      const data = p.creato ? 'creato ' + new Date(p.creato).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
      this._cardProfilo(W / 2, y, cw, ch, `${p.nome}  ·  ${p.eta} anni`, 0x2c7a33, () => this._entra(p, false), data);
      y += ch + gap;
    });
    this._bottone(W / 2, y + 8, cw, 50, '➕  Nuovo profilo', 0x3a6ea5, () => this._mostraCreazione());
    this._bottone(W / 2, y + 66, cw, 44, '📥  Ripristina da backup', 0x55555f, () => this._ripristina());
  }

  _cardProfilo(cx, cy, w, h, testo, colore, cb, sub) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(cx - w / 2, cy - h / 2 + 4, w, h, 14);
    g.fillStyle(colore, 1); g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    g.lineStyle(3, 0x1c4a22, 1); g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    const t = this.add.text(cx, cy + (sub ? -9 : 0), testo, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    this._layer.add([g, t]);
    const els = [g, t];
    if (sub) {
      const s = this.add.text(cx, cy + 14, sub, { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#dfeee0' }).setOrigin(0.5);
      this._layer.add(s); els.push(s);
    }
    this._hit(cx, cy, w, h, cb, els);
  }

  // --- Creazione nuovo profilo ---------------------------------------------
  _mostraCreazione() {
    this._clear();
    this._modo = 'creazione';
    const W = this.W, H = this.H;
    this._layer.add(this.add.text(W / 2, H * 0.21, 'Come ti chiami?', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    this._creaInput(H * 0.29);

    this._layer.add(this.add.text(W / 2, H * 0.40, 'Quanti anni hai?', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    // Pulsanti età.
    this._etaBtn = {};
    const n = ETA_MAX - ETA_MIN + 1;
    const bw = Math.min(56, (W - 60) / n - 8), by = H * 0.47;
    for (let i = 0; i < n; i++) {
      const eta = ETA_MIN + i;
      const x = W / 2 + (i - (n - 1) / 2) * (bw + 8);
      const sel = eta === this._eta;
      const g = this.add.graphics();
      this._disegnaEta(g, x, by, bw, sel);
      const t = this.add.text(x, by, String(eta), { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      this._layer.add([g, t]);
      this._etaBtn[eta] = g;
      this._hit(x, by, bw, bw, () => this._scegliEta(eta), []);
    }

    // Genere (sprite del personaggio). Default maschio.
    this._genere = this._genere || 'maschio';
    this._layer.add(this.add.text(W / 2, H * 0.575, 'Sei un bimbo o una bimba?', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    this._genBtn = {};
    const gw = Math.min(150, W * 0.4), gy = H * 0.65;
    [['maschio', '👦 Bimbo', -1], ['femmina', '👧 Bimba', 1]].forEach(([g, lab, dir]) => {
      const x = W / 2 + dir * (gw / 2 + 8);
      const gfx = this.add.graphics();
      this._disegnaGenere(gfx, x, gy, gw, this._genere === g);
      const t = this.add.text(x, gy, lab, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      this._layer.add([gfx, t]);
      this._genBtn[g] = gfx;
      this._hit(x, gy, gw, 48, () => this._scegliGenere(g), []);
    });

    this._bottone(W / 2, H * 0.79, Math.min(280, W * 0.7), 56, 'Inizia!  ▶', 0x2c7a33, () => this._confermaCreazione());
    // Dispositivo nuovo (nessun profilo): questa è l'UNICA schermata visibile, quindi il
    // ripristino da backup deve stare anche qui, o l'avventura di Pietro non si trasloca.
    if (!listaProfili().length) this._bottone(W / 2, H * 0.88, Math.min(300, W * 0.75), 44, '📥  Ripristina da backup', 0x55555f, () => this._ripristina());
    if (listaProfili().length) {
      this._bottone(W / 2, H * 0.88, Math.min(200, W * 0.5), 42, '‹ Indietro', 0x55555f, () => this._mostraSelezione(listaProfili()));
    }
  }

  _disegnaGenere(g, x, y, w, sel) {
    g.clear();
    g.fillStyle(sel ? 0xffd23f : 0x3a4a66, 1); g.fillRoundedRect(x - w / 2, y - 24, w, 48, 12);
    g.lineStyle(3, sel ? 0x8a6a1e : 0x223052, 1); g.strokeRoundedRect(x - w / 2, y - 24, w, 48, 12);
  }

  _scegliGenere(g) {
    this._genere = g; audio.suono && audio.suono('tocco');
    const gw = Math.min(150, this.W * 0.4), gy = this.H * 0.65;
    [['maschio', -1], ['femmina', 1]].forEach(([k, dir]) => {
      const x = this.W / 2 + dir * (gw / 2 + 8);
      if (this._genBtn[k]) this._disegnaGenere(this._genBtn[k], x, gy, gw, k === this._genere);
    });
  }

  _disegnaEta(g, x, y, s, sel) {
    g.clear();
    g.fillStyle(sel ? 0xffd23f : 0x3a4a66, 1); g.fillRoundedRect(x - s / 2, y - s / 2, s, s, 12);
    g.lineStyle(3, sel ? 0x8a6a1e : 0x223052, 1); g.strokeRoundedRect(x - s / 2, y - s / 2, s, s, 12);
  }

  _scegliEta(eta) {
    this._eta = eta; audio.suono && audio.suono('tocco');
    const n = ETA_MAX - ETA_MIN + 1, bw = Math.min(56, (this.W - 60) / n - 8), by = this.H * 0.47;
    for (let i = 0; i < n; i++) {
      const e = ETA_MIN + i, x = this.W / 2 + (i - (n - 1) / 2) * (bw + 8);
      if (this._etaBtn[e]) this._disegnaEta(this._etaBtn[e], x, by, bw, e === this._eta);
    }
  }

  _confermaCreazione() {
    const nome = (this._inputEl && this._inputEl.value || '').trim();
    if (!nome) { this._scuotiInput(); return; }
    const prof = creaProfilo(nome, this._eta, this._genere || 'maschio');
    this._entra(prof, true);
  }

  // --- Input DOM (nome) ----------------------------------------------------
  _creaInput(localY) {
    this._rimuoviInput();
    const inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 16; inp.placeholder = 'Il tuo nome';
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'words'); inp.spellcheck = false;
    inp.style.cssText = 'position:fixed;transform:translate(-50%,-50%);width:min(70vw,300px);font-size:22px;text-align:center;padding:12px 14px;border:3px solid #ffd23f;border-radius:14px;background:#fff;color:#3a2c22;font-family:system-ui,sans-serif;z-index:99999;outline:none;box-shadow:0 4px 12px rgba(0,0,0,.3)';
    document.body.appendChild(inp);
    this._inputEl = inp; this._inputY = localY;
    this._posizionaInput();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._confermaCreazione(); });
    setTimeout(() => { try { inp.focus(); } catch { /* niente */ } }, 120);
  }

  _posizionaInput() {
    if (!this._inputEl) return;
    const r = (this.game.canvas && this.game.canvas.getBoundingClientRect) ? this.game.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.W };
    this._inputEl.style.left = (r.left + r.width / 2) + 'px';
    this._inputEl.style.top = (r.top + this._inputY) + 'px';
  }

  _scuotiInput() {
    if (!this._inputEl) return;
    this._inputEl.style.borderColor = '#e0563f';
    this._inputEl.focus();
    setTimeout(() => { if (this._inputEl) this._inputEl.style.borderColor = '#ffd23f'; }, 600);
  }

  _rimuoviInput() { if (this._inputEl) { try { this._inputEl.remove(); } catch { /* niente */ } this._inputEl = null; } }

  // --- Ripristino da file di backup ----------------------------------------
  /** Rimette in gioco un'avventura salvata su file (menu → 📤 Backup), anche su un
   *  dispositivo nuovo o a un indirizzo nuovo. Accetta anche i vecchi salvataggi del
   *  save-server. Senza cloud, questa è la strada per non perdere i progressi. */
  async _ripristina() {
    let testo = null;
    try { testo = await scegliFileBackup(); } catch { testo = null; }
    if (!testo) return;                                    // annullato: nessun rumore
    let save;
    try { save = leggiBackup(testo); }
    catch (e) { this._avviso(e.message, false); return; }

    const r = riassuntoBackup(save);
    // Tengo l'id del salvataggio, così ripristinare due volte non moltiplica i profili.
    const id = (typeof save.profilo === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(save.profilo))
      ? save.profilo : ('rip' + Date.now().toString(36));
    // Salvaguardia: se qui c'è già un salvataggio PIÙ RECENTE, non lo cancello al primo
    // tocco — lo dico e chiedo di ripetere. (Un file vecchio può costare settimane di gioco.)
    if (backupPiuVecchio(save, Stato.leggiGrezzo(id)) && this._confermaRip !== id) {
      this._confermaRip = id;
      this._avviso(`Attenzione: su questo dispositivo c'è un'avventura di ${r.nome} PIÙ RECENTE.\nIl backup è del ${r.quando}.\nTocca di nuovo "Ripristina" per sovrascriverla.`, false);
      return;
    }
    this._confermaRip = null;
    try {
      Stato.carica(id);                 // rende `id` il profilo attivo…
      Stato.applicaSalvataggio(save);   // …poi migra allo schema corrente e scrive su disco
      registraProfiloLocale({ id, nome: r.nome, eta: save.giocatore?.eta, creato: save.giocatore?.creato });
    } catch (e) {
      this._avviso('Ripristino non riuscito. Il file sembra rovinato.', false);
      console.error('Ripristino fallito:', e.message);
      return;
    }
    audio.suono && audio.suono('vittoria');
    this._avviso(`✅ Ripristinato: ${r.nome}\n${r.medaglie} medaglie · squadra di ${r.squadra}`, true);
    this.time.delayedCall(1600, () => this._mostraSelezione(listaProfili()));
  }

  /** Messaggio a schermo (verde = fatto, ambra = attenzione). Fuori dal `_layer`, che
   *  viene svuotato al cambio schermata. */
  _avviso(testo, ok) {
    const t = this.add.text(this.W / 2, this.H * 0.5, testo, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold',
      align: 'center', backgroundColor: ok ? '#2c7a33f0' : '#8a4b1ef0', padding: { x: 16, y: 12 },
      wordWrap: { width: Math.min(360, this.W * 0.86) },
    }).setOrigin(0.5).setDepth(999).setScale(0.7);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: ok ? 1500 : 4200, duration: 500, onComplete: () => t.destroy() });
  }

  // --- Ingresso nel gioco --------------------------------------------------
  async _entra(prof, nuovo) {
    this._rimuoviInput();
    audio.suono && audio.suono('vittoria');
    // 1) Carica il profilo (imposta il profilo attivo) e SINCRONIZZA col cloud PRIMA di
    //    entrare: così adotto progressi/azioni admin più recenti (incluso un azzeramento)
    //    senza sovrascriverli con lo stato locale vecchio. Poi RICOSTRUISCO window.GS dallo
    //    stato riconciliato → il gioco parte dai dati giusti e i salvataggi restano coerenti.
    inizializzaGS(prof.id);
    try { await avviaSyncAutomatica(); } catch { /* offline: si prosegue col locale */ }
    inizializzaGS(prof.id);   // ricostruzione da STATO riconciliato (localStorage aggiornato dal sync)
    if (window.GS) {
      window.GS.profilo = window.GS.profilo || {};
      window.GS.profilo.nome = prof.nome;
      window.GS.profilo.eta = prof.eta;
      // Genere: dal profilo nuovo; per un profilo esistente tieni quello del salvataggio.
      if (prof.genere) window.GS.profilo.genere = prof.genere;
      // #77 — un profilo NUOVO eredita i default del superadmin (difficoltà, velocità testo).
      if (nuovo && this._defaults && window.GS.impostazioni) {
        if (this._defaults.difficolta) window.GS.impostazioni.difficolta = this._defaults.difficolta;
        if (this._defaults.velocitaTesto) window.GS.impostazioni.velocitaTesto = this._defaults.velocitaTesto;
        if (typeof this._defaults.pausaSalute === 'boolean') window.GS.impostazioni.pausaSalute = this._defaults.pausaSalute;
        if (typeof this._defaults.pausaSaluteMin === 'number') window.GS.impostazioni.pausaSaluteMin = this._defaults.pausaSaluteMin;
      }
      if (window.__quizPool) window.GS.quizPool = window.__quizPool;   // pool Groq caricato al boot
      // #29 — salva SEMPRE (anche per profilo esistente) così nome/età del profilo
      // restano allineati nel save (prima un profilo esistente non li riscriveva).
      salvaGS({ immediato: true });
    }
    segnaUso(prof.id);
    this.cameras.main.fadeOut(320);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MappaMondoScene'));
  }

  // --- UI helper -----------------------------------------------------------
  _bottone(cx, cy, w, h, label, colore, cb) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(cx - w / 2, cy - h / 2 + 4, w, h, 14);
    g.fillStyle(colore, 1); g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    g.lineStyle(3, 0x222a3a, 1); g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    const t = this.add.text(cx, cy, label, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    this._layer.add([g, t]);
    this._hit(cx, cy, w, h, cb, [g, t]);
  }

  _hit(cx, cy, w, h, cb, vis) {
    const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => vis.forEach((o) => o.setScale && o.setScale(1.03)));
    hit.on('pointerout', () => vis.forEach((o) => o.setScale && o.setScale(1)));
    hit.on('pointerdown', () => { audio.suono && audio.suono('tocco'); cb(); });
    this._layer.add(hit);
    return hit;
  }
}
