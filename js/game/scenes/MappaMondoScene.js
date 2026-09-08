/* MappaMondoScene — mappa del mondo esplorabile (P1-03).
 *
 * Terreno + sentiero coi 6 nodi-città (citta-data.js), Pietro che cammina con
 * Pepole sulla spalla, lucchetti animati sulle città chiuse, transizione
 * (zoom + fade) verso la CittàScene quando Pietro entra in una città aperta.
 * Guida anti-smarrimento: Pepole-bussola se Pietro resta fermo, e tap su Pepole
 * per ricordare l'obiettivo. Onboarding controlli al primissimo avvio.
 */

import { Pietro } from '../pietro.js';
import { Pepole } from '../pepole-actor.js';
import { ControlloMovimento } from '../controllo.js';
import { CITTA, ORDINE_CITTA, completamentoCitta } from '../../citta-data.js';
import { col, shade, bordoSpecchiato } from '../gfx.js';
import { bordoCopertura, limitiCamera } from '../../motore/copertura.js';
import { creaOmbra } from '../ombra.js';
import * as Juice from '../juice.js';
import voce from '../../voce.js';
import musica from '../../musica.js';
import { salvaGS, incrStat } from '../../gs.js';

const SCALA = 1.8;
const MONDO_W = 1000 * SCALA;
const MONDO_H = 640 * SCALA;

// Città effettivamente giocabili (con regia/NPC). Le altre restano chiuse finché
// non vengono costruite, anche se la propedeutica le sbloccherebbe.
const CITTA_GIOCABILI = ['pietropoli', 'acquaverde', 'terraverde', 'voltopoli', 'pietrasanta', 'luminia'];

/** Sblocco PROPEDEUTICO: una città è aperta solo se la precedente è completata
 *  (flag `<prec>:fatta`). Pietropoli è sempre aperta. `cittaSbloccate` resta come
 *  override manuale/compat coi vecchi salvataggi. */
export function cittaSbloccata(id) {
  if (!CITTA_GIOCABILI.includes(id)) return false;
  const idx = ORDINE_CITTA.indexOf(id);
  if (idx <= 0) return true;                       // pietropoli (prima della lista)
  const flags = (window.GS && window.GS.progressiStoria) || {};
  const manuale = ((window.GS && window.GS.cittaSbloccate) || []).includes(id);
  const prec = ORDINE_CITTA[idx - 1];
  return manuale || !!flags[prec + ':fatta'];
}

export class MappaMondoScene extends Phaser.Scene {
  constructor() { super('MappaMondoScene'); }

  // #94 — sfondo mappa caricato lazy (non al boot).
  preload() {
    if (!this.textures.exists('sfondo-mappa')) this.load.image('sfondo-mappa', 'assets/sfondi/mappa-prato.webp');
  }

  create() {
    this.physics.world.setBounds(0, 0, MONDO_W, MONDO_H);
    if (this.textures.exists('sfondo-mappa')) this.textures.get('sfondo-mappa').setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Su schermi più larghi/alti del mondo, invece di una banda verde piatta ai bordi
    // riempio con la STESSA illustrazione della mappa, cover-scalata e smorzata (sfondo
    // lontano). Ancorata alla camera (scrollFactor 0), dietro al mondo.
    this.cameras.main.setBackgroundColor('#86c25a');
    const W0 = this.scale.gameSize.width, H0 = this.scale.gameSize.height;
    if (this.textures.exists('sfondo-mappa')) {
      const src = this.textures.get('sfondo-mappa').getSourceImage();
      const bd = this.add.image(W0 / 2, H0 / 2, 'sfondo-mappa').setScrollFactor(0).setDepth(-1100);
      bd.setScale(Math.max(W0 / src.width, H0 / src.height) * 1.06).setTint(0x8fb068);
    }

    // Sfondo: illustrazione intera del prato (sentieri dipinti che guidano il
    // percorso) stesa su tutto il mondo. Niente più tilemap a quadretti.
    this.add.image(0, 0, 'sfondo-mappa').setOrigin(0).setDisplaySize(MONDO_W, MONDO_H).setDepth(-1000);
    // Come in città: su schermi più grandi del mondo prolungo il prato specchiandolo,
    // così non resta una striscia scoperta ai bordi (motore/copertura.js).
    this._bordo = this.textures.exists('sfondo-mappa')
      ? bordoSpecchiato(this, 'sfondo-mappa', MONDO_W, MONDO_H, bordoCopertura(W0, H0, MONDO_W, MONDO_H)) : [];
    // Se la finestra cambia (PC), rifaccio bordo e limiti: la scena non si ricostruisce.
    if (this._onResizeMappa) this.scale.off('resize', this._onResizeMappa);
    this._onResizeMappa = (gs) => {
      if (this._bordo) this._bordo.forEach((o) => o.destroy());
      this._bordo = this.textures.exists('sfondo-mappa')
        ? bordoSpecchiato(this, 'sfondo-mappa', MONDO_W, MONDO_H, bordoCopertura(gs.width, gs.height, MONDO_W, MONDO_H)) : [];
      this.cameras.main.setBounds(...limitiCamera(gs.width, gs.height, MONDO_W, MONDO_H));
    };
    this.scale.on('resize', this._onResizeMappa);

    // Ostacoli (collisioni invisibili sopra l'immagine): i grossi sassi/cespugli
    // dipinti. Posizioni in frazioni del mondo (≈ dove sono nell'illustrazione);
    // conservative per non bloccare aree che sembrano calpestabili. Tarabili.
    this.ostacoli = this.physics.add.staticGroup();
    const OST = [
      [0.84, 0.16, 150, 90],   // gruppo sassi in alto a destra
      [0.17, 0.27, 90, 70],    // cespuglio a sinistra (chiaramente fuori dal sentiero)
    ];
    for (const [fx, fy, w, h] of OST) {
      const r = this.add.rectangle(fx * MONDO_W, fy * MONDO_H, w, h).setVisible(false);
      this.physics.add.existing(r, true); this.ostacoli.add(r);
    }

    // NPC decorativi che camminano avanti e indietro.
    this._npcSfondo();

    // Nodi città (apertura propedeutica: la precedente dev'essere completata).
    this.cittaNodi = [];
    for (const id of ORDINE_CITTA) {
      const c = CITTA[id];
      const x = c.pos.x * SCALA, y = c.pos.y * SCALA;
      const aperta = cittaSbloccata(id);
      this._disegnaCitta(c, x, y, aperta);
      this.cittaNodi.push({ id, x, y, aperta, lucch: null });
    }

    // Pietro + Pepole sulla spalla. All'INIZIO DI TUTTO (nessuno starter ancora)
    // Pietro parte in basso al centro della mappa e cammina verso Pietropoli;
    // dopo, riparte dalla città corrente (rientro da una città).
    let sx, sy;
    if (!window.GS?.starter) {
      sx = MONDO_W / 2; sy = MONDO_H - 90;
    } else {
      // #9 — fallback se cittaCorrente non è una città nota (save corrotto): niente
      // schermo nero, si riparte da Pietropoli.
      const cc = (CITTA[window.GS?.cittaCorrente] ? window.GS.cittaCorrente : 'pietropoli');
      const partenza = CITTA[cc].pos;
      sx = partenza.x * SCALA; sy = partenza.y * SCALA + 70;
    }
    this.pietro = new Pietro(this, sx, sy, window.GS?.profilo);
    this.pepole = new Pepole(this, this.pietro.x - 26, this.pietro.y - 48, { scala: 0.5 });
    this.pepole.spallaY = -48;
    this.physics.add.collider(this.pietro, this.ostacoli);

    musica.suona('mappa');

    const cam = this.cameras.main;
    cam.setBounds(...limitiCamera(this.scale.gameSize.width, this.scale.gameSize.height, MONDO_W, MONDO_H));
    cam.startFollow(this.pietro, false, 0.12, 0.12);   // roundPixels off → scroll fluido (niente "scatti")
    cam.fadeIn(300);
    cam.setZoom(1.06); this.tweens.add({ targets: cam, zoom: 1, duration: 480, ease: 'Sine.out' });

    this.controllo = new ControlloMovimento(this, this.pietro);
    this._hud();

    // Obiettivo corrente per la guida (prima città aperta non ancora "fatta").
    this.obiettivo = this._calcolaObiettivo();
    this._ultimoMovimento = this.time.now;
    this._inTransizione = false;
    // NB: niente più tap su Pepole per la bussola. Pepole cavalca sulla spalla di Pietro,
    // proprio dove si tocca per il tap-to-move → un tocco per muoversi finiva sul suo hit-
    // circle e faceva partire "Andiamo da questa parte!" fuori contesto (bug segnalato).
    // La guida resta: bussola automatica a riposo (update) + alone pulsante sulla città-
    // obiettivo + freccia quando è fuori schermo.
    this._maybeOnboarding();

    // #71 — punti d'interesse lungo le route (sorprese tra le città).
    this._puntiInteresse();

    // Atmosfera: pollini chiari + farfalle che attraversano il prato.
    Juice.particelleAmbiente(this, { n: 10, colore: 0xfdffe0, depth: 5 });
    Juice.farfalle(this, { n: 3, depth: 6 });
    // Alone pulsante di "richiamo" sulla città-obiettivo (guida non verbale).
    const obb = this.cittaNodi.find((nd) => nd.id === (this.obiettivo && this.obiettivo.id || this.obiettivo) && nd.aperta);
    if (obb) Juice.alonePulsante(this, obb.x, obb.y, { colore: 0xffe98a, raggio: 52, depth: obb.y - 2 });
    // Freccia-guida verso l'obiettivo quando è fuori schermo (anti-smarrimento).
    this._obbPos = obb ? { x: obb.x, y: obb.y } : null;
    if (this._obbPos) {
      this._frecciaObb = this.add.triangle(0, 0, 0, -11, 0, 11, 20, 0, 0xffd23f).setStrokeStyle(2, 0x8a4b1e)
        .setScrollFactor(0).setDepth(8800).setVisible(false);
      this.tweens.add({ targets: this._frecciaObb, alpha: 0.5, yoyo: true, repeat: -1, duration: 600 });
    }
  }

  _linea(g, pts, w, c) {
    g.lineStyle(w, c, 1);
    g.beginPath(); g.moveTo(pts[0].x * SCALA, pts[0].y * SCALA);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x * SCALA, pts[i].y * SCALA);
    g.strokePath();
  }

  _disegnaCitta(c, x, y, aperta) {
    // Casetta PNG (se presente) tinta col colore della città (grigia se chiusa);
    // così le 6 città hanno tutte un colore diverso. Fallback: casa procedurale.
    const tint = aperta ? shade(col(c.palette.primario), 0.22) : 0xaeb2b8;
    if (this.textures.exists('obj-casa-mappa')) {
      const h = this.add.image(x, y + 36, 'obj-casa-mappa').setOrigin(0.5, 1).setDepth(y);
      h.setScale(88 / h.height);
      h.setTint(tint);
      this.tweens.add({ targets: h, y: y + 32, yoyo: true, repeat: -1, duration: 1600 + Math.random() * 400, ease: 'Sine.inOut' });
    } else {
      const colore = aperta ? col(c.palette.primario) : 0x9aa0a6;
      const g = this.add.graphics().setDepth(y);
      g.fillStyle(shade(colore, -0.2), 1);
      g.fillTriangle(x - 38, y - 22, x + 38, y - 22, x, y - 52);
      g.fillStyle(aperta ? colore : 0x9aa0a6, 1);
      g.lineStyle(4, shade(colore, -0.3), 1);
      g.fillRoundedRect(x - 32, y - 22, 64, 56, 10); g.strokeRoundedRect(x - 32, y - 22, 64, 56, 10);
      g.fillStyle(shade(colore, -0.25), 1); g.fillRoundedRect(x - 10, y - 2, 20, 36, 5);
    }
    this.add.text(x, y + 44, c.nome, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#3a2c22', fontStyle: 'bold',
      backgroundColor: '#ffffffaa', padding: { x: 6, y: 2 },
    }).setOrigin(0.5).setDepth(y);
    if (!aperta) {
      const l = this.add.text(x, y + 2, '🔒', { fontSize: '24px' }).setOrigin(0.5).setDepth(y + 1);
      this._luccChild = l;
    } else {
      // Badge % di completamento del livello (palloncini + selvatici catturati +
      // allenatori battuti + tappa principale): verde al 100% (✓), ambra mentre è in
      // corso. Aiuta a vedere cosa resta da fare.
      const pct = completamentoCitta(c.id);
      const pieno = pct >= 100;
      const badge = this.add.text(x, y - 60, pieno ? '✓ 100%' : pct + '%', {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#fff', fontStyle: 'bold',
        backgroundColor: pieno ? '#2c7a33dd' : '#c77f1edd', padding: { x: 7, y: 2 },
      }).setOrigin(0.5).setDepth(y + 2);
      if (pieno) this.tweens.add({ targets: badge, scaleX: 1.12, scaleY: 1.12, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    }
  }

  _npcSfondo() {
    for (let i = 0; i < 4; i++) {
      const x = 200 + Math.random() * (MONDO_W - 400);
      const y = 150 + Math.random() * (MONDO_H - 300);
      const npc = this.add.container(x, y).setDepth(y);
      const g = this.add.graphics();
      const c = [0x6a4cc4, 0x2c7a33, 0xc06030, 0x2f6fc4][i % 4];
      g.fillStyle(c, 1); g.fillRoundedRect(-8, -6, 16, 22, 6);
      g.fillStyle(0xf3c79b, 1); g.fillCircle(0, -12, 8);
      npc.add([creaOmbra(this, 24, 18), g]);
      this.tweens.add({ targets: npc, x: x + (Math.random() > 0.5 ? 90 : -90), yoyo: true, repeat: -1, duration: 2600 + Math.random() * 1500, ease: 'Sine.inOut' });
    }
  }

  _hud() {
    const { width } = this.scale.gameSize;
    this.add.text(width / 2, 14, '🗺️ Lumimondo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },   // #82 — più contrasto
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9000);
    // contatore stelline (HUD permanente minimale)
    this.txtStelline = this.add.text(14, 12, '⭐ ' + (window.GS?.stelline || 0), {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffd23f', fontStyle: 'bold',
      stroke: '#3a2c22', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(9000);
    // La stellina HUD respira piano (vita anche nella UI).
    this.tweens.add({ targets: this.txtStelline, scaleX: 1.12, scaleY: 1.12, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.inOut' });
    // UN SOLO tasto MENU (Squadra/Lumidex/Negozio/Medaglie/Salva sono dentro il menu).
    Juice.bottonePausa(this, width - 46, 46, '☰\nMenu');
  }

  _calcolaObiettivo() {
    const corrente = CITTA[window.GS?.cittaCorrente] ? window.GS.cittaCorrente : 'pietropoli';
    let id;
    const flags = window.GS?.progressiStoria || {};
    if (!flags['pietropoli:fatta']) {
      // Nuova partita: prima entra a Pietropoli (intro + starter).
      id = 'pietropoli';
    } else {
      // Poi punta alla prima città aperta ANCORA DA COMPLETARE (in ordine di viaggio):
      // è il vero "prossimo obiettivo". (Bug: prima puntava alla prima città aperta
      // diversa dalla corrente → di solito una città GIÀ FATTA all'indietro, es. Pietropoli,
      // così Pepole indicava all'indietro / nel posto sbagliato.) Se è tutto fatto, resta la corrente.
      id = ORDINE_CITTA.find((c) => cittaSbloccata(c) && !flags[c + ':fatta']) || corrente;
    }
    const c = CITTA[id];
    return { id, x: c.pos.x * SCALA, y: c.pos.y * SCALA };
  }

  _maybeOnboarding() {
    if (window.GS?.onboardingFatto) return;
    const { width, height } = this.scale.gameSize;
    const mano = this.add.text(width / 2 - 60, height * 0.7, '👆', { fontSize: '46px' })
      .setScrollFactor(0).setDepth(9500);
    this.tweens.add({ targets: mano, x: width / 2 + 60, yoyo: true, repeat: 1, duration: 900, ease: 'Sine.inOut',
      onComplete: () => this.tweens.add({ targets: mano, alpha: 0, duration: 400, onComplete: () => mano.destroy() }) });
    voce.parla('onboarding:movimento');
    this._passi = 0; this._ultimaPos = { x: this.pietro.x, y: this.pietro.y };
  }

  _tapPepole() {
    // Zona tap su Pepole: ricorda l'obiettivo + lampeggio dorato sul target.
    this.pepole.setInteractive(new Phaser.Geom.Circle(0, 0, 28), Phaser.Geom.Circle.Contains);
    this.pepole.on('pointerdown', () => {
      voce.parla('pepole:guida');          // "Di qua, di qua! Andiamo da questa parte!"
      this._lampeggiaObiettivo();
    });
  }

  _lampeggiaObiettivo() {
    const o = this.obiettivo;
    const alone = this.add.circle(o.x, o.y, 50, 0xffd23f, 0.5).setDepth(o.y + 2);
    this.tweens.add({ targets: alone, scale: 1.6, alpha: 0, duration: 800, repeat: 1, onComplete: () => alone.destroy() });
  }

  _bussola() {
    // Pepole salta giù e fa qualche passo NELLA DIREZIONE REALE (2D) della città-obiettivo,
    // poi torna sulla spalla. Prima usava solo la direzione ORIZZONTALE (sign di x): se la
    // città era sopra/sotto, sembrava indicare a caso. Ora segue il vettore verso il target
    // (lo stesso della freccia-guida). Senza obiettivo chiaro fa solo la vocina.
    if (this._pepoleAterra) return;
    const o = this._obbPos || this.obiettivo;
    if (!o || typeof o.x !== 'number' || typeof o.y !== 'number') { voce.parla('pepole:guida'); return; }
    this._pepoleAterra = true;
    const startX = this.pietro.x, startY = this.pietro.y + 6;
    const ang = Math.atan2(o.y - startY, o.x - startX);
    const passo = 64;
    this.pepole.setPosition(startX, startY);
    this.tweens.add({
      targets: this.pepole,
      x: startX + Math.cos(ang) * passo,
      y: startY + Math.sin(ang) * passo,
      duration: 700, ease: 'Sine.inOut', yoyo: true, hold: 500,
      onComplete: () => { this._pepoleAterra = false; this._ultimoMovimento = this.time.now; },
    });
    voce.parla('pepole:guida');
  }

  _entraCitta(nodo) {
    if (this._inTransizione) return;
    this._inTransizione = true;
    this.controllo.ferma();
    if (window.GS) { window.GS.cittaCorrente = nodo.id; window.GS.posizioneMap = { x: this.pietro.x, y: this.pietro.y, scena: 'MappaMondoScene' }; salvaGS({ immediato: true }); }   // visito una città: salva SUBITO
    // zoom sulla porta + fade.
    this.cameras.main.zoomTo(1.6, 500);
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      voce.stop();
      this.scene.start('CittaScene', { citta: nodo.id });
    });
  }

  update(time, delta) {
    if (!this.controllo || this._inTransizione) return;
    this.controllo.aggiorna(delta);

    // Pepole sulla spalla (quando non è "a terra" per la bussola).
    if (!this._pepoleAterra) {
      const sign = this.pietro.direzione === 'sx' ? 1 : -1;
      this.pepole.setPosition(this.pietro.x + 26 * sign, this.pietro.y + this.pepole.spallaY);
      this.pepole.setDepth(this.pietro.depth + 1);
    }
    this.pepole.idle(time);

    // Sbuffi di polvere sotto i piedi mentre Pietro cammina.
    if (this.pietro.inMovimento && time - (this._ultPolvere || 0) > 360) {
      this._ultPolvere = time;
      Juice.polvere(this, this.pietro.x, this.pietro.y + 20, { depth: this.pietro.depth - 1 });
      incrStat('passi');   // #70
    }
    // Pepole ogni tanto fa un saltello quando si è fermi (personalità).
    if (!this.pietro.inMovimento && time > (this._prossimoEmote || 4000)) {
      this._prossimoEmote = time + 9000 + Math.random() * 5000;
      this.pepole.reagisci();
    }

    // Freccia-guida verso l'obiettivo quando è fuori dallo schermo.
    if (this._obbPos && this._frecciaObb) {
      const view = this.cameras.main.worldView;
      if (view.contains(this._obbPos.x, this._obbPos.y)) {
        this._frecciaObb.setVisible(false);
      } else {
        const ang = Math.atan2(this._obbPos.y - this.pietro.y, this._obbPos.x - this.pietro.x);
        const W = this.scale.gameSize.width, H = this.scale.gameSize.height;
        const mx = W / 2 - 40, my = H / 2 - 90;
        const t = Math.min(Math.abs(mx / (Math.cos(ang) || 1e-3)), Math.abs(my / (Math.sin(ang) || 1e-3)));
        this._frecciaObb.setVisible(true).setPosition(W / 2 + Math.cos(ang) * t, H / 2 + Math.sin(ang) * t).setRotation(ang);
      }
    }

    // Movimento → resetta il timer anti-smarrimento + onboarding.
    if (this.pietro.inMovimento) {
      this._ultimoMovimento = time;
      // #25 — guard: nei percorsi demo window.GS può non esistere → niente crash.
      if (window.GS && !window.GS.onboardingFatto && this._ultimaPos) {
        this._passi += Math.hypot(this.pietro.x - this._ultimaPos.x, this.pietro.y - this._ultimaPos.y);
        this._ultimaPos = { x: this.pietro.x, y: this.pietro.y };
        if (this._passi > 100) { window.GS.onboardingFatto = true; salvaGS(); voce.parla('pepole:bravissimo'); }
      }
    } else if (time - this._ultimoMovimento > (this._primaGuidaFatta ? 20000 : 9000)) {
      // #90 — primo richiamo presto (~9s) per chi resta fermo all'inizio, poi più rado.
      this._primaGuidaFatta = true;
      this._bussola();
      this._ultimoMovimento = time;
    }

    this._aggiornaPOI();   // #71 — raccolta punti d'interesse

    // Ingresso/feedback città.
    for (const n of this.cittaNodi) {
      const d = Math.hypot(this.pietro.x - n.x, this.pietro.y - n.y);
      if (d < 40) {
        if (n.aperta) this._entraCitta(n);
        else if (!n._avvisato) { n._avvisato = true; voce.parla('mappa:citta-bloccata'); this._scintillaLucchetto(n); }
      } else if (d >= 70) {
        n._avvisato = false;
      }
    }
  }

  /** #71 — Punti d'interesse sulla mappa: piccole soprese (stelline/oggetti) lungo
   *  le route. Raccolti una volta (flag), con brillio al passaggio. */
  _puntiInteresse() {
    const flags = (window.GS && window.GS.progressiStoria) || {};
    const POI = [
      { fx: 0.30, fy: 0.62, ico: '🧺', premio: 'stelline', n: 4 },   // picnic
      { fx: 0.58, fy: 0.40, ico: '⭐', premio: 'stelline', n: 3 },
      { fx: 0.74, fy: 0.66, ico: '⚪', premio: 'lumiball', n: 1 },
    ];
    this._poi = [];
    POI.forEach((p, i) => {
      const flag = 'poi:' + i;
      if (flags[flag]) return;
      const x = p.fx * MONDO_W, y = p.fy * MONDO_H;
      const c = this.add.container(x, y).setDepth(y);
      const brillo = this.add.star(0, 0, 4, 5, 13, 0xffe98a).setAlpha(0.85);
      c.add([brillo, this.add.text(0, 0, p.ico, { fontSize: '22px' }).setOrigin(0.5)]);
      this.tweens.add({ targets: brillo, angle: 360, duration: 3200, repeat: -1 });
      this.tweens.add({ targets: c, scale: 1.12, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.inOut' });
      this._poi.push({ ...p, flag, obj: c, preso: false, x, y });
    });
  }

  _aggiornaPOI() {
    if (!this._poi) return;
    for (const p of this._poi) {
      if (p.preso) continue;
      if (Math.hypot(this.pietro.x - p.x, this.pietro.y - p.y) < 56) {
        p.preso = true;
        if (window.GS) {
          window.GS.progressiStoria = window.GS.progressiStoria || {}; window.GS.progressiStoria[p.flag] = true;
          if (p.premio === 'lumiball') { window.GS.inventario = window.GS.inventario || {}; window.GS.inventario.lumiball = (window.GS.inventario.lumiball || 0) + p.n; }
          else { window.GS.stelline = (window.GS.stelline || 0) + p.n; if (this.txtStelline) this.txtStelline.setText('⭐ ' + window.GS.stelline); }
          salvaGS();
        }
        Juice.coriandoli(this, p.x, p.y, 16);
        const msg = this.add.text(p.x, p.y - 28, p.premio === 'lumiball' ? '+1 Lumiball! ⚪' : '+' + p.n + ' ⭐', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold', backgroundColor: '#2c7a33cc', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets: msg, y: msg.y - 22, alpha: 0, duration: 1000, onComplete: () => msg.destroy() });
        p.obj.destroy();
      }
    }
  }

  _scintillaLucchetto(n) {
    for (let i = 0; i < 6; i++) {
      const s = this.add.star(n.x, n.y + 2, 4, 2, 6, 0xffffff).setDepth(n.y + 3);
      const a = Math.random() * Math.PI * 2;
      this.tweens.add({ targets: s, x: n.x + Math.cos(a) * 30, y: n.y + Math.sin(a) * 30, alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
  }
}
