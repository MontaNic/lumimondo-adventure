/* backup.js — Backup e Ripristino del salvataggio in un file. (PIANO_PAGES.md passo 3)
 *
 * Perché esiste: chiuso il save-server, il localStorage del browser diventa l'UNICA copia
 * dell'avventura. Svuotare i dati del sito, cambiare telefono o passare a un nuovo indirizzo
 * (da adventure.studiodesk.cloud a GitHub Pages) vorrebbe dire ricominciare da capo. Questo
 * modulo sostituisce il server come rete di sicurezza: un file JSON che si scarica e si ricarica.
 *
 * Le regole (parte pura, testata in `test/backup.test.mjs`) stanno qui; le due funzioni che
 * toccano il browser (scarica / scegli file) sono in fondo e non servono ai test.
 *
 * Il ripristino accetta DUE forme, di proposito:
 *   - la "busta" prodotta da qui  { tipo, formato, creato, gioco, salvataggio }
 *   - un salvataggio NUDO, cioè esattamente i file `server/data/<profilo>.json` del vecchio
 *     save-server → i backup del cloud restano ripristinabili anche dopo averlo spento.
 */

import { GAME_VERSION } from './version.js';

export const TIPO = 'lumimondo-adventure/backup';
export const FORMATO = 1;

/** Incarta un salvataggio nella busta di backup (con data e versione del gioco). */
export function costruisciBackup(salvataggio, { versione = GAME_VERSION, adesso = Date.now() } = {}) {
  if (!salvataggio || typeof salvataggio !== 'object') throw new Error('Nessun salvataggio da salvare.');
  return { tipo: TIPO, formato: FORMATO, creato: new Date(adesso).toISOString(), gioco: versione, salvataggio };
}

/** Nome file leggibile: `lumimondo-pietro-2026-09-08.json`. */
export function nomeFileBackup(salvataggio, adesso = Date.now()) {
  const nome = (salvataggio?.giocatore?.nome || salvataggio?.profilo || 'avventura')
    .toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'avventura';
  const d = new Date(adesso);
  const p = (n) => String(n).padStart(2, '0');
  return `lumimondo-${nome}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Il testo di un file è un salvataggio? Ritorna il salvataggio, o lancia un errore in italiano. */
export function leggiBackup(testo) {
  let dati;
  try { dati = JSON.parse(testo); }
  catch { throw new Error('Questo file non si legge: non sembra un backup di Lumimondo.'); }
  if (!dati || typeof dati !== 'object') throw new Error('Questo file non contiene un salvataggio.');
  const save = (dati.tipo === TIPO && dati.salvataggio) ? dati.salvataggio : dati;
  if (!save || typeof save !== 'object' || !save.giocatore || typeof save.giocatore !== 'object') {
    throw new Error('Questo file non contiene un salvataggio di Lumimondo.');
  }
  return save;
}

/** Due righe da mostrare prima di ripristinare: chi è e a che punto era. */
export function riassuntoBackup(save) {
  const g = save?.giocatore || {};
  const medaglie = Array.isArray(g.medaglie) ? g.medaglie.length : 0;
  const squadra = Array.isArray(save?.squadra) ? save.squadra.length : 0;
  const quando = save?.aggiornato ? new Date(save.aggiornato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : 'data sconosciuta';
  return { nome: g.nome || 'Senza nome', medaglie, squadra, citta: g.cittaCorrente || '—', quando, aggiornato: save?.aggiornato || 0 };
}

/**
 * Il backup è PIÙ VECCHIO del salvataggio già presente sul dispositivo?
 * Serve a non far cancellare per sbaglio i progressi con un file di due mesi fa:
 * in quel caso l'interfaccia chiede una seconda conferma invece di procedere.
 */
export function backupPiuVecchio(save, localeGrezzo) {
  if (!localeGrezzo || typeof localeGrezzo !== 'object') return false;
  const a = Number(save?.aggiornato) || 0;
  const b = Number(localeGrezzo?.aggiornato) || 0;
  return b > a;
}

// --- Parte che tocca il browser (non usata dai test) ------------------------

/** Scarica il backup come file. Ritorna il nome del file creato. */
export function scaricaBackup(salvataggio, adesso = Date.now()) {
  const busta = costruisciBackup(salvataggio, { adesso });
  const nome = nomeFileBackup(salvataggio, adesso);
  const url = URL.createObjectURL(new Blob([JSON.stringify(busta, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  return nome;
}

/** Apre il selettore file e risolve col TESTO del file scelto (null se annullato). */
export function scegliFileBackup() {
  return new Promise((risolvi) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(inp);
    let chiuso = false;
    const fine = (v) => { if (chiuso) return; chiuso = true; inp.remove(); risolvi(v); };
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return fine(null);
      const fr = new FileReader();
      fr.onload = () => fine(String(fr.result || ''));
      fr.onerror = () => fine(null);
      fr.readAsText(f);
    });
    // Se l'utente annulla, `change` non arriva mai: sblocco al ritorno sulla finestra.
    window.addEventListener('focus', () => setTimeout(() => { if (!inp.files || !inp.files.length) fine(null); }, 800), { once: true });
    inp.click();
  });
}
