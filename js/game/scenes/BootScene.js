/* BootScene — primissima scena: inizializza stato, voce e i gestori globali,
 * poi passa a PreloadScene. Niente asset pesanti qui. */

import voce from '../../voce.js';
import audio from '../../audio.js';
import musica from '../../musica.js';
import { GAME_VERSION } from '../../version.js';
import { fondiLuminiOverride } from '../../lumini-data.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  async create() {
    // NB: il salvataggio (inizializzaGS) e il sync NON partono qui: prima si sceglie
    // il PROFILO (ProfiloScene). Qui solo init audio/voce e cose globali.
    voce.init();
    audio.init();
    musica.init();   // sblocco audio iOS al primo tocco

    // Quiz freschi da Groq (best-effort): li parcheggio su window.__quizPool, li
    // applica ProfiloScene appena scelto il profilo (e GS esiste).
    fetch('api/quiz').then((r) => (r.ok ? r.json() : [])).then((q) => {
      if (Array.isArray(q) && q.length) { window.__quizPool = q; if (window.GS) window.GS.quizPool = q; }
    }).catch(() => { /* offline / Groq assente: pool locale */ });
    await voce.caricaTesti('testi.json');

    // Fase S / CMS Tier 2: fonde i Lumini aggiunti dal genitore (override JSON) DENTRO
    // LUMINI, prima che PreloadScene/le scene lo usino. Best-effort: offline/assente = solo
    // i Lumini di base (nessuna regressione). L'arte dei nuovi è procedurale (per elemento).
    try {
      const r = await fetch('api/contenuti/lumini');   // relativo: su hosting statico è un 404 benigno
      if (r.ok) {
        const over = await r.json();
        fondiLuminiOverride(over);
        // Tier 3: gli ID dei Lumini CUSTOM, così PreloadScene può provare a caricarne
        // l'arte PNG (se il genitore l'ha caricata dal pannello; altrimenti resta procedurale).
        window.__luminiCustom = Object.keys(over || {});
      }
    } catch { /* offline: solo base */ }

    // "Mai schermo nero davanti a un bambino": l'errore diventa una gag.
    this.game.events.on('uncaughterror', () => {});
    window.addEventListener('error', (e) => {
      try { localStorage.setItem('ultimoErrore', JSON.stringify({ m: e.message, t: Date.now(), v: GAME_VERSION })); } catch {}
    });

    this.scene.start('PreloadScene');
  }
}
