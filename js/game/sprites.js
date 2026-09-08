/* sprites.js — mappatura condivisa "personaggio → texture PNG" e utilità.
 *
 * Gli asset PNG anime (public/assets/personaggi/, caricati in PreloadScene)
 * sostituiscono le forme procedurali per Pietro, Pepole, Doda (ex Lauri) e
 * Ale (ex Nico). Gli ID interni dei personaggi (lauri/nico) restano invariati
 * per non rompere testi.json, gli MP3 ElevenLabs e i salvataggi: qui mappiamo
 * solo lo speaker/ID alla texture grafica.
 */

// speaker/ID personaggio → chiave texture caricata in PreloadScene (sprite "mondo").
export const TEX_PERSONAGGIO = {
  pietro: 'pietro',
  pepole: 'pepole',
  lauri: 'doda',          // Doda (ex Lauri): id storico 'lauri', sprite 'doda'
  nico: 'ale',            // Ale (ex Nico):  id storico 'nico',  sprite 'ale'
  nonnatella: 'nonnatella',
  bambino: 'bimbo',       // allenatori/bimbo generici (#4): sprite 'bimbo'
  // Capipalestra (PNG da produrre, vedi ASSET_DA_PRODURRE §6). Se il file manca la
  // texture non esiste → resta il ritratto procedurale (haRitratto). Plug-and-play.
  marina: 'marina', silvio: 'silvio', rik: 'rik', rocco: 'rocco', maestro: 'maestro',
};

// Override per l'AVATAR dei dialoghi (busto dedicato dove esiste).
export const TEX_AVATAR = {
  nonnatella: 'nonnatella-busto',   // busto ritagliato per il cerchio del dialogo
};

/** Texture grafica per uno speaker/ID (sprite mondo), o null (fallback emoji). */
export function texPer(speaker) {
  return TEX_PERSONAGGIO[speaker] || null;
}

/** Genere del profilo corrente ('femmina' | 'maschio'). */
export function genereGiocatore() {
  try { return (typeof window !== 'undefined' && window.GS && window.GS.profilo && window.GS.profilo.genere === 'femmina') ? 'femmina' : 'maschio'; } catch { return 'maschio'; }
}
/** Texture MONDO del protagonista per genere: la bimba usa 'pietra' (se c'è), altrimenti
 *  'pietro'. Usare ovunque si mostri il protagonista a sprite (presentazione, VS…). */
export function texGiocatore(scene) {
  if (genereGiocatore() === 'femmina' && scene && scene.textures && scene.textures.exists('pietra')) return 'pietra';
  return 'pietro';
}

/** Texture per l'avatar del dialogo: busto dedicato se c'è, altrimenti sprite mondo.
 *  Protagonista FEMMINA (profilo "bimba"): avatar col busto femminile dedicato. */
export function texAvatar(speaker) {
  if (speaker === 'pietro' && typeof window !== 'undefined' && window.GS && window.GS.profilo && window.GS.profilo.genere === 'femmina') return 'pietra-busto';
  return TEX_AVATAR[speaker] || TEX_PERSONAGGIO[speaker] || null;
}

// Frazione verticale (dall'alto) da mostrare come "busto" negli avatar dialogo.
// Pepole è quadrata → intera; le figure intere mostrano testa+spalle; i busti
// dedicati sono già inquadrati → quasi interi.
export const BUST_FRAC = {
  pietro: 0.46,
  pietra: 0.46,
  'pietra-busto': 0.82,   // busto femminile già inquadrato (testa+spalle)
  ale: 0.44,
  doda: 0.46,
  pepole: 1.0,
  nonnatella: 0.40,
  'nonnatella-busto': 0.82,
  bimbo: 0.5,
  // capipalestra a figura intera → busto = ~42% dall'alto (testa+spalle), come ale/doda.
  marina: 0.42, silvio: 0.42, rik: 0.42, rocco: 0.42, maestro: 0.42,
};
// Allenatori (bimbo1-8 / bimba1-3): figure intere → busto ~40% dall'alto (testa+spalle).
for (let i = 1; i <= 8; i++) BUST_FRAC['bimbo' + i] = 0.40;
for (let i = 1; i <= 3; i++) BUST_FRAC['bimba' + i] = 0.40;
