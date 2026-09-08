/* lumini-data.js — i Lumini di Lumimondo Adventure.
 *
 * Struttura:
 *  - 3 LINEE STARTER epiche (Fuoco / Acqua / Erba), da 3 stadi ciascuna,
 *    forma finale "alla Charizard": maestosa, potente, ancora simpatica.
 *      Fuoco: Fiammino → Fiammantor → Pyronex
 *      Acqua: Guscetto → Idronix → Aquarex
 *      Erba:  Foglino  → Floranyx → Selvarex
 *  - 3 LINEE elementali aggiuntive (Elettricità / Roccia / Aria), da 3 stadi.
 *  - PEPOLE: compagna personale di Pietro, tipo speciale "✨ Mistero" (nessun
 *    elemento, nessun vantaggio/svantaggio). Non combatte come Lumino standard:
 *    interviene come "jolly" una volta per battaglia con mosse buffe. Non evolve.
 *  - BUZZETTO: Lumino acqua esclusivo di Nico.
 *
 * Niente import: dati puri, consumati da battaglia, cattura, album, storia.
 */

// --- Elementi e colori -----------------------------------------------------
export const ELEMENTI = {
  fuoco:        { nome: 'Fuoco',        colore: '#ff7a30', emoji: '🔥' },
  acqua:        { nome: 'Acqua',        colore: '#34a0d8', emoji: '💧' },
  natura:       { nome: 'Erba',         colore: '#4caf50', emoji: '🌿' },
  elettricita:  { nome: 'Elettricità',  colore: '#ffd23f', emoji: '⚡' },
  roccia:       { nome: 'Roccia',       colore: '#9b8579', emoji: '🪨' },
  aria:         { nome: 'Aria',         colore: '#d98fd0', emoji: '🌬️' },
  // Tipo unico di Pepole: neutro con tutti, fuori dal sistema dei vantaggi.
  mistero:      { nome: 'Mistero',      colore: '#a679e0', emoji: '✨' },
};

/* Triangolo dei vantaggi (introdotti gradualmente nel gioco, mai con tabelle):
 *   Fuoco  > Erba > Acqua > Fuoco
 *   Elettricità: neutro contro tutti, super efficace SOLO contro Acqua
 *   Roccia:      neutro contro tutti, super efficace SOLO contro Aria
 *   Mistero:     SEMPRE neutro (nessun vantaggio né svantaggio)
 * Mappa: SUPER_CONTRO[attaccante] = [elementi su cui è super efficace] */
const SUPER_CONTRO = {
  fuoco: ['natura'],
  natura: ['acqua'],
  acqua: ['fuoco'],
  elettricita: ['acqua'],
  roccia: ['aria'],
  aria: [],
  mistero: [],
};

export const MOLTIPLICATORE = { super: 1.5, normale: 1, scarso: 0.66 };

/** Ritorna 'super' | 'scarso' | 'normale' per attaccante vs difensore. */
export function vantaggioTipo(attaccante, difensore) {
  // Il tipo Mistero è sempre neutro, in attacco e in difesa.
  if (attaccante === 'mistero' || difensore === 'mistero') return 'normale';
  if (SUPER_CONTRO[attaccante]?.includes(difensore)) return 'super';
  // "scarso" = il difensore è super efficace contro l'attaccante (relazione inversa)
  if (SUPER_CONTRO[difensore]?.includes(attaccante)) return 'scarso';
  return 'normale';
}
export function moltiplicatoreTipo(attaccante, difensore) {
  return MOLTIPLICATORE[vantaggioTipo(attaccante, difensore)];
}

// --- Cattura ---------------------------------------------------------------
export const ENERGIA_MAX_DEFAULT = 6;

/* Percentuale di successo della Lumiball in base all'energia residua
 * (PROJECT_BRIEF.md sez. 4). I leggendari sono limitati al 40%. */
export function percentualeCattura(energiaResidua, energiaMax = ENERGIA_MAX_DEFAULT, rarita = 'comune') {
  const frazione = Math.max(0, Math.min(1, energiaResidua / energiaMax));
  let perc;
  if (frazione >= 0.99) perc = 20;
  else if (frazione <= 0.34) perc = 85;
  else perc = Math.round(85 - (frazione - 0.34) / (1 - 0.34) * (85 - 20));
  if (rarita === 'raro') perc = Math.round(perc * 0.7);
  // Starter e forme finali sono potenti: non devono essere catturabili "facili"
  // se compaiono selvatici (#14). Prima ricadevano nel ramo 'comune'.
  if (rarita === 'starter') perc = Math.round(perc * 0.5);
  if (rarita === 'finale') perc = Math.min(Math.round(perc * 0.45), 35);
  if (rarita === 'leggendario') perc = Math.min(perc, 40);
  if (rarita === 'unico') return 0;   // compagni unici (Pepole): mai in Lumiball
  return Math.max(5, Math.min(95, perc));
}

/* Effetti delle mosse riconosciuti dal motore di battaglia (A1-09):
 *   'danno'          → solo danno
 *   'cura1' / 'cura2'→ ripristina stelline a chi la usa (o al Lumino attivo)
 *   'saltaTurno'     → l'avversario salta il turno
 *   'stordito1'      → l'avversario è stordito (salta 1 turno)
 *   'doppioProssimo' → il prossimo colpo fa danno doppio
 *   'scudo'          → il prossimo colpo subìto fa meno danno
 *   'confusione'     → l'avversario al 30% colpisce sé stesso il turno dopo
 *   'riduciMax1'     → riduce di 1 le stelline MASSIME dell'avversario (resto sfida)
 * Campo opzionale `bonusProssimo: true` → aggiunge l'effetto doppioProssimo. */
function mossa(nome, tipo, elemento, danno, effetto, opt = {}) {
  return {
    nome, tipo, elemento, danno,
    effetto,
    cadenza: opt.cadenza || (tipo === 'speciale' ? 2 : tipo === 'signature' ? 'unaPerSfida' : 1),
    animazione: opt.animazione || elemento,
    esclamazione: opt.esclamazione || '',
    descrizione: opt.descrizione || '',
    potenziata: opt.potenziata || null,
    ...(opt.bonusProssimo ? { bonusProssimo: true } : {}),
    // Tetto d'uso per sfida (mostrato ×2/×1/×0). Tutte le mosse SPECIALI ne hanno
    // uno di default (2); le normali sono illimitate, la cura ha il suo cap (2).
    ...((opt.usi || tipo === 'speciale') ? { usi: opt.usi || 2 } : {}),
  };
}

// Set di 3 mosse per uno stadio elementale (base / speciale / signature).
function tris(elemento, n) {
  return [
    mossa(n.base, 'base', elemento, n.dannoBase ?? 1, 'danno', { esclamazione: n.base + '!' }),
    mossa(n.speciale, 'speciale', elemento, 0, n.effSpeciale || 'cura1',
      { esclamazione: 'Forza!', descrizione: n.descSpeciale || '' }),
    mossa(n.signature, 'signature', elemento, n.dannoSig ?? 2, 'danno',
      { esclamazione: 'WOW!', descrizione: n.descSignature || '' }),
  ];
}

// --- I Lumini --------------------------------------------------------------
export const LUMINI = {
  // ===== PEPOLE — compagna personale di Pietro (tipo ✨ Mistero) =====
  pepole: {
    id: 'pepole', nome: 'Pepole', elemento: 'mistero', colore: '#fbfbf7',
    stadio: 1, linea: null, evolve: false, rarita: 'unico',
    genere: 'femmina', compagno: true, jolly: true, jollyPerBattaglia: 1,
    catturabile: false,
    personalita: 'Birichina e affettuosa: sempre sulla spalla di Pietro, reagisce a ogni tocco, parla con frasi brevi e buffe.',
    ruolo: 'Non combatte come Lumino standard: interviene una volta per battaglia come "jolly" con una delle sue mosse buffe.',
    abilitaEsplorativa: { nome: 'Fiammella', descrizione: 'Illumina le zone buie con la sua codina di luce.' },
    energiaMax: 6, svg: 'pepole',
    // Moveset di Pepole quando la CHIAMI in aiuto (jolly, 1× per battaglia): TUTTE azioni
    // buffe da "cagnolino puzzolente" — niente cura (chiedere aiuto = fare qualcosa
    // all'avversario). 2 normali + 2 speciali (tetto d'uso ×2). (richiesta Nicolò)
    mosse: [
      mossa('Fiatella', 'base', 'mistero', 2, 'stordito1', {
        animazione: 'nuvoletta-verde', esclamazione: 'Puah!',
        descrizione: 'Un alito tremendo in faccia: stordisce l\'avversario per 1 turno.' }),
      mossa('Leccatina', 'base', 'mistero', 2, '', {
        animazione: 'cuoricini', esclamazione: 'Slurp!',
        descrizione: 'Una linguata appiccicosa e bavosa, come fanno i cagnolini.' }),
      mossa('Scorreggina', 'base', 'mistero', 2, 'stordito1', {
        animazione: 'nuvoletta-verde', esclamazione: 'Pfff!',
        descrizione: 'Una nuvoletta puzzolente a sorpresa: l\'avversario resta di stucco (stordito 1 turno).' }),
      mossa('Puzza Letale', 'speciale', 'mistero', 3, '', {
        usi: 2, animazione: 'nuvoletta-verde', esclamazione: 'Bleah!',
        descrizione: 'Una zaffata tremenda che travolge l\'avversario: danno forte. Si può usare 2 volte.' }),
      mossa('Morso', 'speciale', 'mistero', 3, 'stordito1', {
        usi: 2, animazione: 'morso', esclamazione: 'Gnam!',
        descrizione: 'Un morsetto deciso da cane: danno forte e stordisce. Si può usare 2 volte.' }),
    ],
  },

  // ===== STARTER — Linea Fuoco: Fiammino → Fiammantor → Pyronex =====
  fiammino: {
    id: 'fiammino', nome: 'Fiammino', elemento: 'fuoco', colore: '#ff6a2b',
    stadio: 1, linea: 'fuoco', evolveIn: 'fiammantor', rarita: 'starter',
    personalita: 'Rettilino bipede coraggioso e impulsivo, con la fiammella sempre accesa sulla coda.',
    abilitaEsplorativa: { nome: 'Fiammella', descrizione: 'Accende i fuochi e illumina le grotte buie.' },
    energiaMax: 6, svg: 'fiammino',
    mosse: tris('fuoco', { base: 'Fiammella', speciale: 'Riscaldo', effSpeciale: 'cura1',
      descSpeciale: 'Si scalda e recupera una stellina.', signature: 'Fiammata',
      descSignature: 'Una grande fiammata: gran danno.' }),
  },
  fiammantor: {
    id: 'fiammantor', nome: 'Fiammantor', elemento: 'fuoco', colore: '#f5511f',
    stadio: 2, linea: 'fuoco', evolveDa: 'fiammino', evolveIn: 'pyronex', rarita: 'starter',
    personalita: 'Più alto e determinato: piccole ali membranose che non volano ancora e una fiamma più grande.',
    abilitaEsplorativa: { nome: 'Vampata', descrizione: 'Sprigiona vampate per fondere il ghiaccio e gli ostacoli.' },
    energiaMax: 6, svg: 'fiammantor',
    mosse: tris('fuoco', { base: 'Zampata Ardente', speciale: 'Carica Furiosa', effSpeciale: 'doppioProssimo',
      descSpeciale: 'Accumula calore: il prossimo colpo fa danno doppio.', signature: 'Lanciafiamme',
      descSignature: 'Un getto di fuoco continuo: gran danno.' }),
  },
  pyronex: {
    id: 'pyronex', nome: 'Pyronex', elemento: 'fuoco', colore: '#e23c0c',
    stadio: 3, linea: 'fuoco', evolveDa: 'fiammantor', rarita: 'finale',
    personalita: 'Drago bipede maestoso dagli occhi dorati: ali enormi che sprigionano fuoco e coda con fiamma tripla. Potente ma ancora amico.',
    abilitaEsplorativa: { nome: 'Volo di Fuoco', descrizione: 'Vola sopra i dirupi portando gli amici sulla schiena.' },
    energiaMax: 6, svg: 'pyronex',
    cinematicaEvoluzione: 'Una luce arancio-oro invade lo schermo, un ruggito scuote l\'aria, Pietro e Pepole esultano.',
    mosse: [
      mossa('Artiglio Infuocato', 'base', 'fuoco', 2, 'danno', { esclamazione: 'Sgrunf!' }),
      mossa('Scudo di Magma', 'speciale', 'fuoco', 0, 'scudo', { descrizione: 'Si copre di magma: il prossimo colpo subìto fa meno male.' }),
      mossa('Inferno del Drago', 'signature', 'fuoco', 3, 'danno', { esclamazione: 'GROAAR!', descrizione: 'Il respiro infuocato del drago: danno enorme.' }),
    ],
  },

  // ===== STARTER — Linea Acqua: Guscetto → Idronix → Aquarex =====
  guscetto: {
    id: 'guscetto', nome: 'Guscetto', elemento: 'acqua', colore: '#3fb6e6',
    stadio: 1, linea: 'acqua', evolveIn: 'idronix', rarita: 'starter',
    personalita: 'Tartarughina calma e prudente, con un guscio rotondo luminoso e una stellina al centro.',
    abilitaEsplorativa: { nome: 'Bolla', descrizione: 'Crea bolle per attraversare l\'acqua profonda.' },
    energiaMax: 6, svg: 'guscetto',
    mosse: tris('acqua', { base: 'Spruzzo', speciale: 'Ritirata', effSpeciale: 'scudo',
      descSpeciale: 'Si chiude nel guscio: il prossimo colpo fa meno male.', signature: 'Cannoncino',
      descSignature: 'Uno spruzzo potente: gran danno.' }),
  },
  idronix: {
    id: 'idronix', nome: 'Idronix', elemento: 'acqua', colore: '#1f93cf',
    stadio: 2, linea: 'acqua', evolveDa: 'guscetto', evolveIn: 'aquarex', rarita: 'starter',
    personalita: 'Tartaruga eretta con due cannoncini d\'acqua sulle spalle e il guscio decorato a onde.',
    abilitaEsplorativa: { nome: 'Getto', descrizione: 'Spinge oggetti pesanti con un getto d\'acqua.' },
    energiaMax: 6, svg: 'idronix',
    mosse: tris('acqua', { base: 'Idrocolpo', speciale: 'Risacca', effSpeciale: 'cura1',
      signature: 'Doppio Cannone', descSignature: 'Due getti insieme: gran danno.' }),
  },
  aquarex: {
    id: 'aquarex', nome: 'Aquarex', elemento: 'acqua', colore: '#0f6fa8',
    stadio: 3, linea: 'acqua', evolveDa: 'idronix', rarita: 'finale',
    personalita: 'Tartaruga gigante e imponente: il guscio nasconde un vortice d\'acqua che ruota e potenti cannoni. Serena ma maestosa.',
    abilitaEsplorativa: { nome: 'Marea', descrizione: 'Alza e abbassa l\'acqua per aprire passaggi.' },
    energiaMax: 6, svg: 'aquarex',
    cinematicaEvoluzione: 'Una cascata d\'acqua blu scende sullo schermo, e alla fine spunta un arcobaleno.',
    mosse: [
      mossa('Morso d\'Onda', 'base', 'acqua', 2, 'danno', { esclamazione: 'Splash!' }),
      mossa('Vortice Difensivo', 'speciale', 'acqua', 0, 'scudo', { descrizione: 'Il vortice nel guscio fa da scudo.' }),
      mossa('Maremoto', 'signature', 'acqua', 3, 'danno', { esclamazione: 'WROOM!', descrizione: 'Un\'onda gigantesca: danno enorme.' }),
    ],
  },

  // ===== STARTER — Linea Erba: Foglino → Floranyx → Selvarex =====
  foglino: {
    id: 'foglino', nome: 'Bulbino', elemento: 'natura', colore: '#5cc24f',
    stadio: 1, linea: 'natura', evolveIn: 'floranyx', rarita: 'starter',
    personalita: 'Creaturina verde e tonda, pigra ma affettuosa, con un germoglio fiorito in testa e gli occhi assonnati.',
    abilitaEsplorativa: { nome: 'Germoglio', descrizione: 'Fa crescere piante e ponti di rampicanti.' },
    energiaMax: 6, svg: 'foglino',
    mosse: tris('natura', { base: 'Frustata', speciale: 'Fotosintesi', effSpeciale: 'cura1',
      descSpeciale: 'Prende il sole e recupera una stellina.', signature: 'Semitiro',
      descSignature: 'Una raffica di semi: gran danno.' }),
  },
  floranyx: {
    id: 'floranyx', nome: 'Floranyx', elemento: 'natura', colore: '#3a9b40',
    stadio: 2, linea: 'natura', evolveDa: 'foglino', evolveIn: 'selvarex', rarita: 'starter',
    personalita: 'Più grande e gentile: il germoglio è diventato un fiore aperto e colorato, con larghe foglie-braccia.',
    abilitaEsplorativa: { nome: 'Radici', descrizione: 'Stende radici per scalare le pareti.' },
    energiaMax: 6, svg: 'floranyx',
    mosse: tris('natura', { base: 'Foglia Tagliente', speciale: 'Rugiada', effSpeciale: 'cura1',
      signature: 'Boom Floreale', descSignature: 'Un\'esplosione di fiori: gran danno.' }),
  },
  selvarex: {
    id: 'selvarex', nome: 'Selvarex', elemento: 'natura', colore: '#2c7a33',
    stadio: 3, linea: 'natura', evolveDa: 'floranyx', rarita: 'finale',
    personalita: 'Creatura imponente avvolta da liane fiorite, con un grande fiore sul dorso che irradia luce verde. Saggia e potente.',
    abilitaEsplorativa: { nome: 'Foresta', descrizione: 'Fa spuntare una foresta per superare i burroni.' },
    energiaMax: 6, svg: 'selvarex',
    cinematicaEvoluzione: 'Esplosione di petali verdi e rosa, foglie che vorticano, il terreno che fiorisce tutt\'intorno.',
    mosse: [
      mossa('Zampata Spinosa', 'base', 'natura', 2, 'danno', { esclamazione: 'Svash!' }),
      mossa('Linfa Curativa', 'speciale', 'natura', 0, 'cura2', { descrizione: 'La linfa del grande fiore ripristina 2 stelline.' }),
      mossa('Risveglio della Foresta', 'signature', 'natura', 3, 'danno', { esclamazione: 'GROOOM!', descrizione: 'La forza della foresta intera: danno enorme.' }),
    ],
  },

  // ===== Linea Elettricità =====
  zappix: {
    id: 'zappix', nome: 'Zappix', elemento: 'elettricita', colore: '#ffd23f',
    stadio: 1, linea: 'elettricita', evolveIn: 'voltrik', rarita: 'comune',
    personalita: 'Curioso e svelto, fa mille domande (è il Lumino di Doda).',
    abilitaEsplorativa: { nome: 'Scintilla', descrizione: 'Dà corrente a macchine e luci spente.' },
    energiaMax: 6, svg: 'zappix',
    mosse: tris('elettricita', { base: 'Scossetta', speciale: 'Ricarica', effSpeciale: 'cura1',
      descSpeciale: 'Si ricarica e recupera una stellina.', signature: 'Fulmine',
      descSignature: 'Un lampo accecante: gran danno.' }),
  },
  voltrik: {
    id: 'voltrik', nome: 'Voltrik', elemento: 'elettricita', colore: '#f5b800',
    stadio: 2, linea: 'elettricita', evolveDa: 'zappix', evolveIn: 'fulminex', rarita: 'comune',
    personalita: 'Energico e competitivo, sempre carico.',
    abilitaEsplorativa: { nome: 'Magnete', descrizione: 'Attira oggetti di metallo da lontano.' },
    energiaMax: 6, svg: 'voltrik',
    mosse: tris('elettricita', { base: 'Saetta', speciale: 'Sovraccarico', effSpeciale: 'doppioProssimo',
      descSpeciale: 'Accumula energia: il prossimo colpo fa doppio danno.', signature: 'Tuono',
      descSignature: 'Un tuono fragoroso: gran danno.' }),
  },
  fulminex: {
    id: 'fulminex', nome: 'Fulminex', elemento: 'elettricita', colore: '#e0a200',
    stadio: 3, linea: 'elettricita', evolveDa: 'voltrik', rarita: 'raro',
    personalita: 'Veloce come un lampo, leale e generoso.',
    abilitaEsplorativa: { nome: 'Tempesta', descrizione: 'Alimenta interi quartieri al buio.' },
    energiaMax: 6, svg: 'fulminex',
    mosse: tris('elettricita', { base: 'Artiglio Elettrico', dannoBase: 2, speciale: 'Campo Magnetico', effSpeciale: 'scudo',
      signature: 'Tempesta di Fulmini', dannoSig: 3, descSignature: 'Mille fulmini insieme: danno enorme.' }),
  },

  // ===== Linea Roccia =====
  roccolo: {
    id: 'roccolo', nome: 'Roccolo', elemento: 'roccia', colore: '#9b8579',
    stadio: 1, linea: 'roccia', evolveIn: 'granitor', rarita: 'comune',
    personalita: 'Tranquillo e lento a parlare, ma fortissimo e fedele.',
    abilitaEsplorativa: { nome: 'Spintone', descrizione: 'Sposta i massi che bloccano la strada.' },
    energiaMax: 6, svg: 'roccolo',
    mosse: tris('roccia', { base: 'Sassata', speciale: 'Corazza', effSpeciale: 'scudo',
      descSpeciale: 'Si fa duro come pietra: il prossimo colpo fa meno male.', signature: 'Frana',
      descSignature: 'Una pioggia di sassi: gran danno.' }),
  },
  granitor: {
    id: 'granitor', nome: 'Granitor', elemento: 'roccia', colore: '#7d6a5e',
    stadio: 2, linea: 'roccia', evolveDa: 'roccolo', evolveIn: 'titanrock', rarita: 'comune',
    personalita: 'Solido e affidabile, non molla mai.',
    abilitaEsplorativa: { nome: 'Scavo', descrizione: 'Scava gallerie sotto gli ostacoli.' },
    energiaMax: 6, svg: 'granitor',
    mosse: tris('roccia', { base: 'Pugno di Roccia', speciale: 'Muro', effSpeciale: 'scudo',
      signature: 'Terremoto', descSignature: 'La terra trema: gran danno.' }),
  },
  titanrock: {
    id: 'titanrock', nome: 'Titanrock', elemento: 'roccia', colore: '#5f5046',
    stadio: 3, linea: 'roccia', evolveDa: 'granitor', rarita: 'raro',
    personalita: 'Gigante gentile, montagna che cammina.',
    abilitaEsplorativa: { nome: 'Montagna', descrizione: 'Solleva enormi rocce e crea ponti di pietra.' },
    energiaMax: 6, svg: 'titanrock',
    mosse: tris('roccia', { base: 'Martello di Pietra', dannoBase: 2, speciale: 'Bastione', effSpeciale: 'scudo',
      signature: 'Crollo Titanico', dannoSig: 3, descSignature: 'Una montagna che crolla: danno enorme.' }),
  },

  // ===== Linea Aria =====
  brizzo: {
    id: 'brizzo', nome: 'Brizzo', elemento: 'aria', colore: '#d98fd0',
    stadio: 1, linea: 'aria', evolveIn: 'ventrix', rarita: 'comune',
    personalita: 'Vivace e svolazzante, non sta fermo un secondo.',
    abilitaEsplorativa: { nome: 'Soffio', descrizione: 'Soffia via le foglie e le nuvole di polvere.' },
    energiaMax: 6, svg: 'brizzo',
    mosse: tris('aria', { base: 'Folata', speciale: 'Respiro', effSpeciale: 'cura1',
      descSpeciale: 'Prende fiato e recupera una stellina.', signature: 'Raffica',
      descSignature: 'Un vento fortissimo: gran danno.' }),
  },
  ventrix: {
    id: 'ventrix', nome: 'Ventrix', elemento: 'aria', colore: '#c473bd',
    stadio: 2, linea: 'aria', evolveDa: 'brizzo', evolveIn: 'ciclonyx', rarita: 'comune',
    personalita: 'Agile e furbo, plana sulle correnti.',
    abilitaEsplorativa: { nome: 'Planata', descrizione: 'Porta in volo gli amici da una collina all\'altra.' },
    energiaMax: 6, svg: 'ventrix',
    mosse: tris('aria', { base: 'Ala Tagliente', speciale: 'Vortice', effSpeciale: 'saltaTurno',
      descSpeciale: 'Avvolge l\'avversario in un vortice: salta il turno.', signature: 'Tornado',
      descSignature: 'Un vortice potente: gran danno.' }),
  },
  ciclonyx: {
    id: 'ciclonyx', nome: 'Ciclonyx', elemento: 'aria', colore: '#a85aa1',
    stadio: 3, linea: 'aria', evolveDa: 'ventrix', rarita: 'raro',
    personalita: 'Signore dei cieli, calmo nella tempesta.',
    abilitaEsplorativa: { nome: 'Ciclone', descrizione: 'Crea correnti ascensionali per volare in alto.' },
    energiaMax: 6, svg: 'ciclonyx',
    mosse: tris('aria', { base: 'Artiglio del Vento', dannoBase: 2, speciale: 'Occhio del Ciclone', effSpeciale: 'scudo',
      signature: 'Uragano', dannoSig: 3, descSignature: 'Un uragano intero: danno enorme.' }),
  },

  // ===== Linea Buzzetto (acqua): Buzzino → Buzzetto → Buzzone =====
  buzzino: {
    id: 'buzzino', nome: 'Buzzino', elemento: 'acqua', colore: '#74d0ec',
    stadio: 1, linea: 'buzz', evolveIn: 'buzzetto', rarita: 'comune',
    personalita: 'Una gocciolina vivace e curiosa, sempre in movimento.',
    abilitaEsplorativa: { nome: 'Gocciolio', descrizione: 'Si infila in ogni fessura.' },
    energiaMax: 5, svg: 'buzzetto',
    mosse: tris('acqua', { base: 'Spruzzetto', speciale: 'Tuffetto', effSpeciale: 'cura1',
      signature: 'Bollicina', descSignature: 'Una bollicina che sorprende.' }),
  },
  // Buzzetto resta l'amico di Ale, ora STADIO 2 della sua linea.
  buzzetto: {
    id: 'buzzetto', nome: 'Buzzetto', elemento: 'acqua', colore: '#4fc3e8',
    stadio: 2, linea: 'buzz', evolveDa: 'buzzino', evolveIn: 'buzzone', rarita: 'raro', esclusivoDi: 'nico',
    personalita: 'Tondo e vivacissimo, sempre in movimento — proprio come Ale.',
    abilitaEsplorativa: { nome: 'Rimbalzo', descrizione: 'Rimbalza ovunque e raggiunge posti scomodi.' },
    energiaMax: 6, svg: 'buzzetto',
    mosse: tris('acqua', { base: 'Spruzzetto', speciale: 'Tuffo', effSpeciale: 'cura1',
      signature: 'Bomba d\'Acqua', descSignature: 'Un tuffo a bomba: gran danno.' }),
  },
  buzzone: {
    id: 'buzzone', nome: 'Buzzone', elemento: 'acqua', colore: '#2f9fc4',
    stadio: 3, linea: 'buzz', evolveDa: 'buzzetto', rarita: 'raro',
    personalita: 'Grande e tranquillo, dorme felice ma in acqua è potentissimo.',
    abilitaEsplorativa: { nome: 'Onda', descrizione: 'Sposta l\'acqua come vuole.' },
    energiaMax: 8, svg: 'buzzetto',
    mosse: tris('acqua', { base: 'Spruzzo', speciale: 'Maremoto', effSpeciale: 'cura1',
      signature: 'Tsunami', descSignature: 'Un\'onda enorme: danno fortissimo.' }),
  },
};

// --- Linee evolutive (per album e schermate) -------------------------------
export const LINEE = {
  fuoco: ['fiammino', 'fiammantor', 'pyronex'],
  acqua: ['guscetto', 'idronix', 'aquarex'],
  natura: ['foglino', 'floranyx', 'selvarex'],
  elettricita: ['zappix', 'voltrik', 'fulminex'],
  roccia: ['roccolo', 'granitor', 'titanrock'],
  aria: ['brizzo', 'ventrix', 'ciclonyx'],
  buzz: ['buzzino', 'buzzetto', 'buzzone'],
};

// I 3 starter scelti/ottenuti da Pietro durante il viaggio (primo stadio).
export const STARTER = ['fiammino', 'guscetto', 'foglino'];

/** Tutte le specie della STESSA linea evolutiva di `specie` (es. fiammino →
 *  [fiammino, fiammantor, pyronex]). Usata per impedire a Pietro di avere due
 *  Lumini uguali o della stessa linea. Specie senza linea nota → solo sé stessa. */
export function lineaEvolutiva(specie) {
  const linea = LUMINI[specie] && LUMINI[specie].linea;
  return (linea && LINEE[linea]) ? LINEE[linea].slice() : [specie];
}

/** True se Pietro POSSIEDE già (album: catturato) un Lumino della stessa linea
 *  evolutiva di `specie`. Niente doppioni della stessa famiglia. */
export function possiediLinea(specie) {
  const album = (typeof window !== 'undefined' && window.GS && window.GS.album) || {};
  return lineaEvolutiva(specie).some((sp) => album[sp] && album[sp].catturato);
}

// --- Helper ----------------------------------------------------------------
export function getLumino(id) { return LUMINI[id] || null; }
export function tuttiGliId() { return Object.keys(LUMINI); }

/** Id della forma evoluta successiva (null se non evolve o non previsto). */
export function evoluzioneDi(id) {
  const l = LUMINI[id];
  if (!l) return null;
  if (l.evolve === false) return null; // Pepole: non evolve mai
  return l.evolveIn || null;
}

/**
 * Crea un'istanza giocabile di un Lumino (per team/battaglia/cattura).
 * Energia piena di default.
 */
export function creaIstanza(id, opzioni = {}) {
  const base = LUMINI[id];
  if (!base) throw new Error('Lumino sconosciuto: ' + id);
  return {
    specie: id,
    nome: opzioni.soprannome || base.nome,
    elemento: base.elemento,
    energiaMax: base.energiaMax || ENERGIA_MAX_DEFAULT,
    energia: opzioni.energia ?? (base.energiaMax || ENERGIA_MAX_DEFAULT),
    affezione: opzioni.affezione ?? 0,
    selvatico: !!opzioni.selvatico,
  };
}

// Moveset di default per un Lumino aggiunto dal CMS senza mosse esplicite: un tris
// elementale coerente (base/speciale/signature), così combatte subito senza definire
// ogni mossa a mano. Nomi neutri, sostituibili in futuro (Tier 3).
function movesetDefault(elemento) {
  return tris(elemento, { base: 'Zampata', speciale: 'Caricati', signature: 'Gran Colpo', effSpeciale: 'cura1' });
}

/** Fase S / CMS Tier 2 — FONDE i Lumini aggiunti/modificati dal genitore (override JSON,
 *  servito da /api/contenuti/lumini) DENTRO l'oggetto LUMINI, PRIMA che il gioco lo usi
 *  (chiamata al boot). Riempie i default mancanti (mosse elementali, energia, rarità) e
 *  segna `_custom` per riconoscerli. L'arte è PROCEDURALE (lumino.js disegna per elemento
 *  se non c'è il PNG). Ritorna quanti Lumini ha fuso. Non tocca la base se l'override è vuoto. */
export function fondiLuminiOverride(over) {
  if (!over || typeof over !== 'object') return 0;
  let n = 0;
  for (const id of Object.keys(over)) {
    if (!/^[a-z0-9_-]+$/i.test(id)) continue;   // id sicuro
    const s = over[id] || {};
    const el = ELEMENTI[s.elemento] ? s.elemento : 'mistero';
    const base = LUMINI[id] || {};
    LUMINI[id] = {
      ...base,
      id,
      nome: s.nome || base.nome || id,
      elemento: el,
      colore: (typeof s.colore === 'string' && s.colore) || base.colore || (ELEMENTI[el] && ELEMENTI[el].colore) || '#a679e0',
      stadio: s.stadio || base.stadio || 1,
      linea: s.linea != null ? s.linea : (base.linea != null ? base.linea : null),
      evolve: false,
      rarita: s.rarita || base.rarita || 'comune',
      energiaMax: Number(s.energiaMax) || base.energiaMax || ENERGIA_MAX_DEFAULT,
      catturabile: s.catturabile !== false,
      personalita: s.personalita || base.personalita || '',
      svg: base.svg || id,
      mosse: (Array.isArray(s.mosse) && s.mosse.length) ? s.mosse : (base.mosse || movesetDefault(el)),
      _custom: true,
    };
    n++;
  }
  return n;
}
