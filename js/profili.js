/* profili.js — elenco profili giocatore (solo nome + età, nessun dato sensibile).
 *
 * I profili vivono in localStorage sotto una chiave GLOBALE (non per-salvataggio),
 * così persistono tra un profilo e l'altro. Ogni profilo ha un `id` che fa da chiave
 * del salvataggio (state.js: PREFISSO + id). "Nuovo profilo" = partita da capo.
 */

const PROFILI_KEY = 'lumimondo-adventure:profili';

export function listaProfili() {
  try {
    const l = JSON.parse(localStorage.getItem(PROFILI_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}

function salvaLista(l) {
  try { localStorage.setItem(PROFILI_KEY, JSON.stringify(l)); } catch { /* niente */ }
}

/** Crea un nuovo profilo (nome, età, genere) e ritorna l'oggetto profilo. */
export function creaProfilo(nome, eta, genere) {
  const l = listaProfili();
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  const prof = { id, nome: String(nome || 'Campione').trim().slice(0, 16) || 'Campione', eta: Number(eta) || 7, genere: genere === 'femmina' ? 'femmina' : 'maschio', creato: Date.now() };
  l.push(prof);
  salvaLista(l);
  return prof;
}

/** Aggiorna "ultimo uso" (per ordinare i profili). */
export function segnaUso(id) {
  const l = listaProfili();
  const p = l.find((x) => x.id === id);
  if (p) { p.usato = Date.now(); salvaLista(l); }
}

/** Registra nel registro LOCALE un profilo che esiste già sul server (con id dato),
 *  così appare nella schermata "Chi sta giocando?" anche su un altro dispositivo.
 *  Ritorna true se aggiunto (era nuovo). */
export function registraProfilo(prof) {
  if (!prof || !prof.id) return false;
  const l = listaProfili();
  if (l.some((x) => x.id === prof.id)) return false;
  // `sincronizzato:true` → questo profilo viene DAL server: se un domani il server non
  // lo elenca più, è stato cancellato dal pannello admin (vedi riconcilia in ProfiloScene).
  l.push({ id: prof.id, nome: String(prof.nome || 'Campione').trim().slice(0, 16) || 'Campione', eta: Number(prof.eta) || 7, creato: prof.creato || Date.now(), sincronizzato: true });
  salvaLista(l);
  return true;
}

/** Registra (o aggiorna) un profilo che nasce QUI, non dal server — oggi: un profilo
 *  RIPRISTINATO da un file di backup. A differenza di `registraProfilo` NON lo marca
 *  `sincronizzato`: non viene dal cloud, quindi non deve sparire se un domani un server
 *  rispondesse con un elenco che non lo contiene. Ritorna true se la lista è cambiata. */
export function registraProfiloLocale(prof) {
  if (!prof || !prof.id) return false;
  const l = listaProfili();
  const nome = String(prof.nome || 'Campione').trim().slice(0, 16) || 'Campione';
  const eta = Number(prof.eta) || 7;
  const esistente = l.find((x) => x.id === prof.id);
  if (esistente) {
    if (esistente.nome === nome && esistente.eta === eta) return false;
    esistente.nome = nome; esistente.eta = eta;
    salvaLista(l);
    return true;
  }
  l.push({ id: prof.id, nome, eta, creato: prof.creato || Date.now(), usato: Date.now() });
  salvaLista(l);
  return true;
}

/** Marca un profilo locale come "presente sul server" (confermato da /api/profili o da
 *  un push andato a buon fine): serve a distinguere una cancellazione dell'admin da un
 *  profilo creato qui e mai sincronizzato. */
export function marcaSincronizzato(id) {
  const l = listaProfili();
  const p = l.find((x) => x.id === id);
  if (p && !p.sincronizzato) { p.sincronizzato = true; salvaLista(l); }
}

/** Allinea nome/età della voce di menu a quelli del server (es. dopo una rinomina
 *  fatta dal genitore in /admin): così il menu "Chi sta giocando?" non resta indietro. */
export function aggiornaMetaProfilo(id, meta = {}) {
  const l = listaProfili();
  const p = l.find((x) => x.id === id);
  if (!p) return false;
  let cambiato = false;
  if (meta.nome && meta.nome !== p.nome) { p.nome = String(meta.nome).trim().slice(0, 16) || p.nome; cambiato = true; }
  if (meta.eta && Number(meta.eta) !== p.eta) { p.eta = Number(meta.eta); cambiato = true; }
  if (cambiato) salvaLista(l);
  return cambiato;
}

/** Toglie un profilo dall'elenco LOCALE (menu "Chi sta giocando?"). Il salvataggio in
 *  localStorage lo gestisce il chiamante (mantenuto o rimosso a seconda del caso). */
export function rimuoviProfilo(id) {
  const l = listaProfili();
  const n = l.filter((x) => x.id !== id);
  if (n.length === l.length) return false;
  salvaLista(n);
  return true;
}
