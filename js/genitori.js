/* genitori.js — Area Genitori LOCALE (senza server).
 *
 * Su GitHub Pages non c'è il pannello /admin (serve un server): qui vive l'alternativa
 * dentro il gioco. La password dei genitori è salvata SOLO come hash SHA-256 nel
 * localStorage di questo dispositivo (vale per tutti i profili del tablet).
 * Le impostazioni (pausa salute, durata, difficoltà) restano per-profilo in
 * window.GS.impostazioni, come quelle che arrivavano da /admin.
 *
 * Se un server /admin è presente e ha impostato la sua password (window.LUMI.pausaHash),
 * per saltare la pausa valgono entrambe.
 */

const CHIAVE = 'lumiGenitori';

/** SHA-256 esadecimale (crypto.subtle: richiede HTTPS o localhost). */
export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function leggi() {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}; } catch { return {}; }
}

/** Hash della password locale dei genitori, o null se non ancora impostata. */
export function hashLocale() {
  const h = leggi().hash;
  return (typeof h === 'string' && h.length === 64) ? h : null;
}

export function haPassword() { return !!hashLocale(); }

/** Salva una nuova password (ne memorizza solo l'hash). */
export async function impostaPassword(pw) {
  const hash = await sha256hex(pw);
  try { localStorage.setItem(CHIAVE, JSON.stringify({ ...leggi(), hash, t: Date.now() })); } catch { /* niente */ }
  return hash;
}

/** true se `pw` corrisponde alla password locale o a quella del server (/admin). */
export async function verificaPassword(pw) {
  if (!pw) return false;
  let h;
  try { h = await sha256hex(pw); } catch { return false; }
  const server = (typeof window !== 'undefined' && window.LUMI && window.LUMI.pausaHash) || null;
  return h === hashLocale() || (!!server && h === server);
}

/** C'è almeno una password (locale o server) con cui un genitore può saltare la pausa? */
export function bypassDisponibile() {
  return haPassword() || !!(typeof window !== 'undefined' && window.LUMI && window.LUMI.pausaHash);
}

/** Domanda "da grandi" per chi ha dimenticato la password: una moltiplicazione
 *  a due cifre × una cifra, fuori portata per un bimbo di 6-8 anni. */
export function domandaAdulto() {
  const a = 12 + Math.floor(Math.random() * 8);   // 12..19
  const b = 6 + Math.floor(Math.random() * 4);    // 6..9
  return { testo: `${a} × ${b}`, risposta: a * b };
}

// Valori ammessi nel pannello (minuti).
export const DURATE_PAUSA = [15, 20, 30, 45, 60, 90, 120];
export const DURATA_DEFAULT = 60;
