/* motore/luoghi.js — i LUOGHI SPECIALI delle città. Regole pure, zero Phaser.
 *
 * Perché (PIANO_V3 filone A2): dopo A1 le sei città hanno finalmente sei piante diverse,
 * ma propongono ancora le stesse identiche cose — sfide, ombre, palloncini, Gara, coccole.
 * Nessuna città ha qualcosa che le altre non hanno, e un bambino sente il ritmo ripetersi.
 *
 * Un LUOGO è un punto della città con una sua natura: il pontile dove si pesca, il focolare
 * dove la squadra riposa, il quadro delle luci da accendere in ordine. È un DATO nel JSON
 * della città (`luoghi`), come la Gara e gli ostacoli: aggiungerne uno non tocca il codice.
 *
 * Qui vivono le REGOLE (che cos'è, si può usare ancora, cosa dà); la scena disegna e tocca.
 */

/** Le nature disponibili. `unaVolta` = si esaurisce; gli altri si possono rifare sempre. */
export const TIPI = {
  pesca: {
    ico: '🎣', colore: '#34a0d8', titolo: 'Pesca un Lumino',
    invito: 'Getta la lenza e aspetta…', unaVolta: false,
  },
  riposo: {
    ico: '🔥', colore: '#c0603a', titolo: 'Riposa qui',
    invito: 'Un posto caldo dove riprendere fiato.', unaVolta: false,
  },
  regalo: {
    ico: '🎁', colore: '#6a8f3a', titolo: 'Un dono',
    invito: 'Qualcosa ti aspetta.', unaVolta: true,
  },
  memoria: {
    ico: '💡', colore: '#d4a017', titolo: 'Accendi le luci',
    invito: 'Ripeti la sequenza giusta!', unaVolta: false,
  },
  scavo: {
    ico: '⛏️', colore: '#8a7560', titolo: 'Scava',
    invito: 'Sotto i sassi si nasconde qualcosa.', unaVolta: false,
  },
  tabellone: {
    ico: '🏆', colore: '#c79a1e', titolo: 'Tabellone del Torneo',
    invito: 'Chi hai già battuto?', unaVolta: false,
  },
};

/** I dati di una natura, o null se sconosciuta (un JSON sbagliato non rompe la città). */
export function datiLuogo(tipo) { return TIPI[tipo] || null; }

/** Chiave di progresso di un luogo, per ricordarsi cosa è già stato fatto. */
export function chiaveLuogo(cittaId, luogo) { return 'luogo:' + cittaId + ':' + luogo.id; }

/** Un luogo "una volta sola" già consumato? Gli altri sono sempre disponibili. */
export function luogoEsaurito(cittaId, luogo, progressi) {
  const d = datiLuogo(luogo && luogo.tipo);
  if (!d || !d.unaVolta) return false;
  return !!(progressi && progressi[chiaveLuogo(cittaId, luogo)]);
}

/** I luoghi validi di una città (scarta quelli con natura sconosciuta o senza posizione). */
export function luoghiDi(contenuto) {
  const l = (contenuto && Array.isArray(contenuto.luoghi)) ? contenuto.luoghi : [];
  return l.filter((x) => x && x.id && datiLuogo(x.tipo) && Number.isFinite(x.x) && Number.isFinite(x.y));
}

/**
 * Il luogo è già apparso? Un luogo può dichiarare un `gate`: un flag che deve essere
 * acceso perché compaia. Serve a Pietropoli, dove il focolare non deve distrarre durante
 * l'intro guidata, e in generale a far crescere una città man mano che la si vive.
 */
export function luogoVisibile(luogo, progressi) {
  if (!luogo || !luogo.gate) return true;
  return !!(progressi && progressi[luogo.gate]);
}

/**
 * Premio di una scavata. Deterministico sul CONTEGGIO, non casuale: così "scava ancora"
 * è una promessa che il gioco mantiene sempre uguale, e il bambino impara il ritmo
 * (stelline, stelline, una Lumiball…). Dopo `scavateMax` la buca è vuota, ma con garbo.
 */
export function premioScavo(volta, scavateMax = 3) {
  if (volta >= scavateMax) return null;
  return volta === scavateMax - 1
    ? { tipo: 'oggetto', id: 'lumiball', n: 1, testo: '+1 Lumiball! ⚪' }
    : { tipo: 'stelline', n: 2 + volta, testo: '+' + (2 + volta) + ' ⭐' };
}

/** Quante volte si è già scavato qui. */
export function scavateFatte(cittaId, luogo, progressi) {
  const v = progressi && progressi[chiaveLuogo(cittaId, luogo) + ':scavate'];
  return Number.isFinite(v) ? v : 0;
}
