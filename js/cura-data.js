/* cura-data.js — DATI della cura (F1 v2 "Capisci l'emozione"). Zero logica (quella è in
 * motore/cura.js). Il Lumino mostra un'EMOZIONE; il bimbo la legge e sceglie il GESTO che
 * risponde al suo bisogno. Momento dolce ed educativo (riconoscere le emozioni): nessun
 * fallimento punito, si può solo crescere. Editabile in futuro dal CMS. PIANO_V2 §5. */

// Le EMOZIONI che il Lumino può provare. `bisogno` = a quale gesto rispondono; `faccia` è
// il segnale grande e chiaro sopra il Lumino; `ok` è la frasetta di conferma quando indovini.
export const EMOZIONI = [
  { id: 'triste',  faccia: '😢', emote: '💧', testo: 'Sembra un po’ giù…',                bisogno: 'coccola', ok: 'Una bella coccola! Ecco cosa gli serviva 🫂' },
  { id: 'fame',    faccia: '😋', emote: '🍽️', testo: 'Gli brontola la pancia!',          bisogno: 'cibo',    ok: 'Aveva fame! Che buona la pappa 🍪' },
  { id: 'giocoso', faccia: '🤗', emote: '❗', testo: 'Non sta fermo un secondo!',         bisogno: 'gioco',   ok: 'Voleva giocare! Che saltelli 🎾' },
  { id: 'stanco',  faccia: '😴', emote: '💤', testo: 'Sbadiglia e si strofina gli occhi…', bisogno: 'ninna',   ok: 'Aveva sonno… ninna nanna 💤' },
];

// I GESTI tra cui scegliere (i bottoni). `bisogno` = l'emozione a cui rispondono. `energia`
// = qualche stellina di ricarica (il cibo di più). Il legame lo dà valutaLettura (motore).
export const AZIONI_CURA = [
  { id: 'coccola', emoji: '🫳', nome: 'Coccola', bisogno: 'coccola', energia: 0 },
  { id: 'cibo',    emoji: '🍪', nome: 'Pappa',   bisogno: 'cibo',    energia: 2 },
  { id: 'gioco',   emoji: '🎾', nome: 'Gioca',   bisogno: 'gioco',   energia: 1 },
  { id: 'ninna',   emoji: '💤', nome: 'Ninna',   bisogno: 'ninna',   energia: 0 },
];

// Frasi (voce NARRATORE, ElevenLabs) — id in testi.json, editabili dal CMS.
export const FRASI = {
  benvenuto: 'coccole:benvenuto',
  giusto: 'coccole:giusto',
  sbaglia: 'coccole:sbaglia',
  legameSu: 'coccole:legame-su',
  legameMax: 'coccole:legame-max',
  sazio: 'coccole:sazio',
};
