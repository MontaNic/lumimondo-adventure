/* main.js — configurazione del gioco Phaser e registrazione delle Scene.
 * Phaser è caricato come globale (window.Phaser) da vendor/phaser.min.js. */

import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PlaygroundScene } from './scenes/PlaygroundScene.js';
import { MappaMondoScene } from './scenes/MappaMondoScene.js';
import { DialogoScene } from './scenes/DialogoScene.js';
import { BattagliaScene } from './scenes/BattagliaScene.js';
import { CittaScene } from './scenes/CittaScene.js';
import { AlbumScene } from './scenes/AlbumScene.js';
import { EvoluzioneScene } from './scenes/EvoluzioneScene.js';
import { PausaScene } from './scenes/PausaScene.js';
import { RiposoScene } from './scenes/RiposoScene.js';
import { SquadraScene } from './scenes/SquadraScene.js';
import { CoccoleScene } from './scenes/CoccoleScene.js';
import { GaraScene } from './scenes/GaraScene.js';
import { QuizScene } from './scenes/QuizScene.js';
import { StarterScene } from './scenes/StarterScene.js';
import { ProfiloScene } from './scenes/ProfiloScene.js';
import { AperturaScene } from './scenes/AperturaScene.js';
import { DiarioScene } from './scenes/DiarioScene.js';
import { NegozioScene } from './scenes/NegozioScene.js';
import { TutorialScene } from './scenes/TutorialScene.js';
import { salvaGS } from '../gs.js';
import { pushBeacon } from '../sync.js';

const config = {
  type: Phaser.AUTO,
  parent: 'gioco',
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.RESIZE,        // responsive: portrait telefono / landscape iPad
    autoCenter: Phaser.Scale.NO_CENTER, // CENTER_BOTH con RESIZE sfasava la hit-area dei tocchi
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false, gravity: { x: 0, y: 0 } },
  },
  input: { activePointers: 3 },        // multitouch: joystick + tap insieme
  // PERF mobile: texture lisce (LINEAR, serve all'arte anime) MA niente MSAA del contesto
  // WebGL (antialiasGL:false) — su GPU mobili l'MSAA costa e non serve a un gioco di sprite
  // (nessun bordo geometrico da smussare). powerPreference chiede la GPU più veloce.
  // Stesso aspetto, meno carico per-frame.
  render: { antialias: true, antialiasGL: false, pixelArt: false, powerPreference: 'high-performance' },
  scene: [BootScene, PreloadScene, AperturaScene, ProfiloScene, MenuScene, PlaygroundScene, MappaMondoScene, CittaScene, DialogoScene, BattagliaScene, AlbumScene, EvoluzioneScene, PausaScene, RiposoScene, SquadraScene, CoccoleScene, GaraScene, QuizScene, StarterScene, DiarioScene, NegozioScene, TutorialScene],
};

// --- Reset di sviluppo/test ------------------------------------------------
// Apri il gioco con ?reset (es. http://localhost:3000/?reset) per azzerare il
// salvataggio LOCALE, le cache e il service worker, poi ricaricare pulito.
// (Il salvataggio sul SERVER va cancellato a parte: server/data/<profilo>.json.)
const _reset = /[?&]reset\b/.test(location.search);
if (_reset) {
  (async () => {
    try { localStorage.clear(); } catch {}
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } } catch {}
    try { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); } } catch {}
    location.replace(location.pathname);   // ricarica senza il parametro, da zero
  })();
}

// eslint-disable-next-line no-new
if (!_reset) window.gioco = new Phaser.Game(config);

// --- Allineamento input (fix "devo cliccare in alto") --------------------
// Su mobile la barra del browser/indirizzo e i cambi di viewport spostano il
// canvas senza che Phaser ricalcoli i limiti per il rilevamento dei tocchi:
// il punto del dito finiva mappato più in basso. Forziamo un refresh dello
// ScaleManager dopo il boot e a ogni cambio reale di dimensioni del viewport.
(function allineaInput() {
  const refresh = () => { try { window.gioco.scale.refresh(); } catch {} };
  // ResizeObserver = ricalibrazione DETERMINISTICA: ogni volta che il box del
  // contenitore cambia (load, rotazione, barra indirizzi, split-view…) ricalcoliamo
  // i limiti del canvas che servono al mapping dei tocchi. Niente più "click in alto".
  const host = document.getElementById('gioco');
  if (host && 'ResizeObserver' in window) {
    new ResizeObserver(() => refresh()).observe(host);
  }
  // Reti di sicurezza per eventi che non sempre cambiano il box osservato.
  window.addEventListener('load', () => { refresh(); setTimeout(refresh, 300); setTimeout(refresh, 1200); });
  window.addEventListener('orientationchange', () => setTimeout(refresh, 200));
  window.addEventListener('resize', refresh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refresh);
    window.visualViewport.addEventListener('scroll', refresh);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(refresh, 100); });
})();

// --- Relayout su ROTAZIONE / cambio dimensioni importante (fix "elementi fuori posto") ---
// Le scene posizionano la UI a create() in base alla dimensione di ALLORA. Su iPhone,
// ruotando il telefono (portrait↔landscape) la UI restava ai vecchi posti → bottoni e
// testi "fuori posto/tagliati". A un cambio SIGNIFICATIVO (rotazione, non il jitter della
// barra di Safari) riavvio la scena di gioco ATTIVA: si ricostruisce dallo stato in GS e
// la UI si rifà alla nuova dimensione. Le scene transitorie (battaglia, dialogo, quiz…)
// NON vengono riavviate (perderebbero stato): si rifanno alla prossima apertura.
(function relayoutSuRotazione() {
  const REBUILD = new Set(['MappaMondoScene', 'CittaScene', 'MenuScene', 'ProfiloScene', 'AlbumScene', 'NegozioScene', 'DiarioScene', 'SquadraScene']);
  let ultimoW = 0, ultimoH = 0, t = 0;
  const check = () => {
    const g = window.gioco; if (!g || !g.scale) return;
    const w = g.scale.gameSize.width, h = g.scale.gameSize.height;
    if (!ultimoW) { ultimoW = w; ultimoH = h; return; }
    // SOLO un vero cambio di ORIENTAMENTO (portrait↔landscape) fa il relayout. Il jitter
    // della barra/altri resize NON riavviano nulla → niente rischio di freeze in gioco.
    const eraLandscape = ultimoW >= ultimoH, oraLandscape = w >= h;
    ultimoW = w; ultimoH = h;
    if (eraLandscape === oraLandscape) return;
    const attive = g.scene.getScenes(true).map((s) => s.scene.key);
    const top = attive[attive.length - 1];
    const key = attive.find((k) => REBUILD.has(k));
    if (!key || !REBUILD.has(top)) return;
    const sc = g.scene.getScene(key);
    // MAI riavviare se la scena è occupata (transizione/overlay/dialogo/intro): riavviarla
    // a metà di una transizione verso la battaglia lasciava il gioco BLOCCATO.
    if (sc && (sc._inTransizione || sc._inOverlay || sc._inDialogo || sc._introInCorso)) return;
    try { sc.scene.restart(); } catch { /* niente */ }
  };
  const deb = () => { clearTimeout(t); t = setTimeout(check, 300); };
  const aggancia = () => { if (window.gioco && window.gioco.scale) { window.gioco.scale.on('resize', deb); return true; } return false; };
  if (!aggancia()) window.addEventListener('load', aggancia);
  window.addEventListener('orientationchange', () => setTimeout(deb, 150));
})();

// --- Diagnostico tocchi (apri con ?debug) ---------------------------------
// Mostra a video: posizione del DITO sul canvas vs punto REGISTRATO da Phaser e
// il fattore di scala. Se c'è uno scarto → so subito se è scala o offset costante.
if (/[?&]debug\b/.test(location.search)) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;background:rgba(0,0,0,.8);color:#0f0;font:12px monospace;padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
  box.textContent = 'debug tocchi: tocca lo schermo';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
  if (document.body) document.body.appendChild(box);
  const onTap = (e) => {
    const t = (e.touches && e.touches[0]) || e;
    const cv = document.querySelector('#gioco canvas');
    const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const fx = Math.round(t.clientX - r.left), fy = Math.round(t.clientY - r.top);
    const p = window.gioco && window.gioco.input ? window.gioco.input.activePointer : null;
    const gx = p ? Math.round(p.x) : '?', gy = p ? Math.round(p.y) : '?';
    const sm = window.gioco && window.gioco.scale;
    box.textContent = `dito canvas: ${fx},${fy}\npunto gioco: ${gx},${gy}\nscarto: ${gx - fx},${gy - fy}\ncanvas CSS: ${Math.round(r.width)}x${Math.round(r.height)} | game: ${sm ? sm.width : '?'}x${sm ? sm.height : '?'}`;
  };
  window.addEventListener('pointerdown', onTap, true);
  window.addEventListener('touchstart', onTap, true);

  // Readout PERFORMANCE continuo (in alto a sinistra): FPS reali, scena attiva,
  // risoluzione canvas e devicePixelRatio. Serve per diagnosticare "lento/a scatti"
  // sul telefono di Pietro: aprire con ?debug, giocare, e mandarmi lo screenshot.
  const fbox = document.createElement('div');
  fbox.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;background:rgba(0,0,0,.82);color:#9effa0;font:12px monospace;padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
  fbox.textContent = 'perf: …';
  const addF = () => { if (document.body && !fbox.parentNode) document.body.appendChild(fbox); };
  document.addEventListener('DOMContentLoaded', addF); addF();
  let fmin = 99, fcount = 0, fsum = 0;
  setInterval(() => {
    const g = window.gioco; if (!g || !g.loop) return;
    const fps = Math.round(g.loop.actualFps || 0);
    if (fps > 0) { fmin = Math.min(fmin, fps); fsum += fps; fcount++; }
    const scena = g.scene ? g.scene.getScenes(true).map((s) => s.scene.key).filter((k) => k !== 'DialogoScene').pop() : '?';
    const cv = document.querySelector('#gioco canvas');
    const cw = cv ? cv.width : '?', ch = cv ? cv.height : '?';
    const media = fcount ? Math.round(fsum / fcount) : fps;
    fbox.textContent = `FPS ${fps}  (min ${fmin === 99 ? '-' : fmin}, media ${media})\nscena: ${scena}\ncanvas ${cw}x${ch}  dpr ${window.devicePixelRatio || 1}\nqualità: ${(window.LUMI && window.LUMI.qualita) || '?'}`;
  }, 500);
}

// --- Degrado automatico performance (P1-16) -------------------------------
// Misura gli FPS: se sotto 40 → qualità "bassa" (effetti.js dimezza le particelle).
window.LUMI = { qualita: 'alta' };

// --- SALVATAGGIO a prova di "restart" -------------------------------------
// Le scritture su localStorage sono in debounce (400ms) e il push cloud pure
// (1500ms): se l'app va in BACKGROUND o viene UCCISA da iOS entro quella finestra,
// le ultime modifiche si perdevano ("al riavvio non tiene il punto"). Qui forzo un
// flush SINCRONO su localStorage appena l'app si nasconde/chiude → al riavvio i
// progressi ci sono sempre (e il cloud si riallinea al primo sync utile).
function _flushSalvataggio() {
  try { salvaGS({ immediato: true }); } catch { /* niente */ }
  // ...e tenta il push cloud "di chiusura" (sendBeacon): così l'ultimo progresso
  // arriva al cloud anche su un altro dispositivo, non solo in locale.
  try { pushBeacon(); } catch { /* niente */ }
}
window.addEventListener('pagehide', _flushSalvataggio);
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushSalvataggio(); });
setInterval(() => {
  const fps = window.gioco && window.gioco.loop ? window.gioco.loop.actualFps : 60;
  window.LUMI.qualita = fps && fps < 40 ? 'bassa' : 'alta';
}, 5000);

// --- #4 Promemoria di PAUSA SALUTE ---------------------------------------
// Ogni 60 min (default, regolabile dal genitore) di gioco ATTIVO (solo scene di gioco visibili, niente overlay/
// cinematiche, finestra in primo piano) un invito gentile a fare una pausa.
// Override per test/genitori: window.LUMI_PAUSA_MS (durata) e LUMI_RIPOSO_SECONDI.
window.LUMI.tempoGioco = 0;
const _SCENE_GIOCO = ['MappaMondoScene', 'CittaScene', 'BattagliaScene'];
// "Fuori dal gioco" = schermate dove NON si gioca davvero (boot/menu/profilo/intro) e
// la pausa salute stessa: qui il tempo NON si accumula. Tutto il resto è "tempo davanti
// allo schermo" e va contato.
// FIX (P1.15.51): prima si contavano SOLO i minuti passati su mappa/città/battaglia in
// primo piano; dialoghi, quiz, Album/Negozio/Squadra/Diario e il menu NON contavano →
// in un gioco pieno di dialoghi 45 min d'orologio valevano molto meno di 45 min "contati"
// e la pausa non scattava quasi mai ("ho giocato 45 min e niente pausa"). Ora conta tutto
// il tempo a schermo; il promemoria però compare solo in un momento SICURO (mappa/città).
const _FUORI_GIOCO = ['BootScene', 'PreloadScene', 'MenuScene', 'ProfiloScene', 'AperturaScene', 'RiposoScene'];
setInterval(() => {
  if (!window.gioco || document.hidden) return;
  const sm = window.gioco.scene; if (!sm) return;
  const attive = sm.getScenes(true).map((s) => s.scene.key);
  if (!attive.length || attive.some((k) => _FUORI_GIOCO.includes(k))) return;   // fuori dal gioco / in pausa → non contare
  // Pausa salute ATTIVABILE PER PROFILO (impostazioni.pausaSalute, default ON) e
  // BYPASS genitori (window.LUMI.pausaBypass, sbloccato in RiposoScene con password).
  const imp = (window.GS && window.GS.impostazioni) || {};
  if (imp.pausaSalute === false || window.LUMI.pausaBypass) { window.LUMI.tempoGioco = 0; return; }
  window.LUMI.tempoGioco += 1000;
  const minuti = (typeof imp.pausaSaluteMin === 'number' && imp.pausaSaluteMin >= 5) ? imp.pausaSaluteMin : 60;   // default 1 ora (prima 45 min)
  const soglia = (window.LUMI_PAUSA_MS | 0) || (minuti * 60 * 1000);
  // Scatta SOLO su mappa o città (mai a metà battaglia/dialogo/quiz, che non sono in
  // _SCENE_GIOCO "in cima" o sono battaglia): il tempo conta lo stesso, ma il promemoria
  // aspetta il primo momento tranquillo.
  const gioco = attive.find((k) => _SCENE_GIOCO.includes(k));
  if (window.LUMI.tempoGioco >= soglia && (gioco === 'MappaMondoScene' || gioco === 'CittaScene')) {
    window.LUMI.tempoGioco = 0;
    // Uso la ScenePlugin della scena attiva (come DialogoScene/PausaScene): mettere
    // in pausa e lanciare l'overlay dalla SceneManager da un setInterval lasciava la
    // scena a INIT senza partire. Da qui invece l'overlay si avvia regolarmente.
    try { const gs = sm.getScene(gioco); gs.scene.pause(); gs.scene.launch('RiposoScene', { parent: gioco }); } catch { /* niente */ }
  }
}, 1000);

// --- Rete di sicurezza GLOBALE anti-freeze in ESPLORAZIONE ----------------
// Segnalati 2 freeze in città ("non potevo fare nulla se non uscire"). update() di
// CittaScene/MappaMondoScene fa `return` se _inTransizione/_inDialogo restano true: se
// uno di quei flag si incaglia (es. una transizione interrotta), tutto si blocca e NON
// c'è watchdog (quello esiste solo in battaglia). Qui sorveglio: se una scena di gioco
// resta in PAUSA o con i flag bloccanti per ~4s SENZA un overlay reale (dialogo/quiz/
// menu/battaglia…) che lo giustifichi, recupero. Le condizioni restano severe → niente
// falsi positivi; 4s invece di 7s perché 7 secondi fermi sono un'eternità per un bimbo.
(function antiFreezeEsplorazione() {
  const OVERLAY = ['DialogoScene', 'QuizScene', 'StarterScene', 'EvoluzioneScene', 'RiposoScene', 'PausaScene', 'BattagliaScene', 'TutorialScene', 'AlbumScene', 'NegozioScene', 'DiarioScene', 'SquadraScene', 'CoccoleScene', 'GaraScene'];
  const GIOCO = ['CittaScene', 'MappaMondoScene'];
  const conta = {};
  setInterval(() => {
    const g = window.gioco; if (!g || !g.scene || document.hidden) return;
    const sm = g.scene;
    const overlay = OVERLAY.some((k) => { try { return sm.isActive(k); } catch { return false; } });
    for (const k of GIOCO) {
      const sc = sm.getScene(k); let attiva = false, inPausa = false;
      try { attiva = sm.isActive(k); inPausa = sm.isPaused(k); } catch { /* niente */ }
      if ((!attiva && !inPausa) || overlay) { conta[k] = 0; continue; }   // dormiente o overlay legittimo
      const occupato = !!(sc && (sc._inTransizione || sc._inOverlay || sc._inDialogo));
      // Caso di freeze visto dal vivo: i COMANDI restano disabilitati (controllo.abilitato
      // = false) SENZA flag né overlay attivi → "non mi muovo ma la musica va". Il watchdog
      // non lo vedeva. Lo includo (escluso durante l'intro guidata di Pietropoli, che li
      // gestisce da sé). Il recupero qui sotto riabilita controllo.abilitato.
      const ctrlBloccato = !!(sc && sc.controllo && sc.controllo.abilitato === false && !sc._introInCorso && !occupato);
      if (!(inPausa || occupato || ctrlBloccato)) { conta[k] = 0; continue; }   // attiva e libera = ok
      conta[k] = (conta[k] || 0) + 1;
      if (conta[k] >= 4) {                                                  // ~4s bloccato (era 7s: troppo lungo per un bimbo)
        conta[k] = 0;
        try {
          if (sc) { sc._inTransizione = false; sc._inOverlay = false; sc._inDialogo = false; if (sc.controllo) sc.controllo.abilitato = true; }
          if (inPausa) sm.resume(k);
        } catch { /* niente */ }
      }
    }
  }, 1000);
})();

// --- Mai schermo nero davanti a un bambino (P1-16) ------------------------
// Se una scena crasha: recupero d'emergenza alla mappa (gag invece di trauma).
let ultimoRecupero = 0;
window.addEventListener('error', (e) => {
  try { localStorage.setItem('ultimoErrore', JSON.stringify({ m: String(e.message || e), t: Date.now() })); } catch {}
  const now = Date.now();
  if (!window.gioco || now - ultimoRecupero < 8000) return;
  const sm = window.gioco.scene;
  if (!sm) return;
  const attive = sm.getScenes(true).map((s) => s.scene.key);
  if (attive.includes('MappaMondoScene') || attive.includes('MenuScene') || attive.includes('BootScene')) return;
  ultimoRecupero = now;
  try { attive.forEach((k) => sm.stop(k)); sm.start('MappaMondoScene'); } catch {}
});

// Registrazione service worker (network-first in sviluppo: vedi sw.js).
// #100 — quando un nuovo SW prende il controllo, ricarica UNA volta così
// l'aggiornamento si applica al riavvio (niente versioni stantie).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
  let _ricaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_ricaricato) return; _ricaricato = true;
    location.reload();
  });
}
