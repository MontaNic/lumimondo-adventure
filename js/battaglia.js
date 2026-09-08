/* battaglia.js — motore di battaglia (logica pura, niente DOM).
 *
 * Sfide sportive, mai violente: i Lumini si "stancano", non si fanno male.
 * Struttura a turni, stelline d'energia (max 6), mosse con effetti distinti,
 * IA avversario con logica minima, "stanco" a 0 stelline (mai sconfitta),
 * ripresa automatica, stelline bonus di fair play.
 *
 * La UI (battaglia-ui.js) si abbona agli eventi e anima; questo modulo decide
 * solo cosa succede. Testabile in isolamento.
 *
 * Eventi emessi (on(evento, cb)):
 *   'saluto'        {alleato, avversario}            — rituale iniziale
 *   'turno'         {di:'alleato'|'avversario'}      — inizio turno
 *   'mossa'         {di, mossa, danno, tipoEff}      — mossa eseguita
 *   'effetto'       {di, effetto, valore}            — effetto applicato
 *   'energia'       {chi, energia, energiaMax, delta}— variazione stelline
 *   'stordito'      {chi}                            — salta il turno
 *   'confuso'       {chi, autocolpo}                 — colpisce sé stesso
 *   'stanco'        {chi}                            — 0 stelline
 *   'ripresa'       {}                               — Pietro riparte (no sconfitta)
 *   'vittoria'      {alleato, avversario}            — avversario stanco
 *   'bonus'         {chi, motivo}                    — stellina bonus fair play
 *   'stretta'       {}                               — stretta di zampa finale
 *   'fine'          {esito}                          — battaglia conclusa
 */

import { LUMINI, moltiplicatoreTipo, ENERGIA_MAX_DEFAULT } from './lumini-data.js';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Combattente runtime a partire da un'istanza (creaIstanza) o da uno specie-id.
function creaCombattente(istanzaOspecie) {
  const ist = typeof istanzaOspecie === 'string'
    ? { specie: istanzaOspecie } : { ...istanzaOspecie };
  const base = LUMINI[ist.specie];
  if (!base) throw new Error('Specie sconosciuta: ' + ist.specie);
  const energiaMax = ist.energiaMax || base.energiaMax || ENERGIA_MAX_DEFAULT;
  return {
    specie: ist.specie,
    nome: ist.nome || base.nome,
    elemento: base.elemento,
    mosse: base.mosse,
    energiaMax,
    energiaMaxIniziale: energiaMax,
    energia: clamp(ist.energia ?? energiaMax, 0, energiaMax),
    // stato transitorio
    stordito: 0,        // turni di stordimento residui
    doppio: false,      // prossimo attacco raddoppia
    scudo: false,       // prossimo colpo subìto dimezzato
    confuso: false,     // al prossimo attacco 30% si colpisce da solo
    prisma: false,      // Forma Prisma armata: il prossimo attacco è fortissimo
    usateSignature: false,
    turniSuoi: 0,            // turni che QUESTO combattente ha effettivamente giocato
    ultimoSpecialeTurno: -99, // in turni PROPRI (non globali) → ricarica prevedibile
    cureUsate: 0,       // quante volte ha usato una mossa curativa (cap 2 per sfida)
    usiMossa: {},       // usi consumati per mossa con tetto `usi` (chiave = nome mossa)
  };
}

/** Categoria mossa per la UI. Schema dei tasti (come Fiammino): a SINISTRA gli ATTACCHI
 *  (fanno danno), a DESTRA il SUPPORTO (cura/scudo/carica: non fanno danno).
 *   - rigenerazione: cura (♥)
 *   - supporto: mossa senza danno NON curativa (scudo "Ritirata", carica…) → sta a destra
 *   - speciale: attacco speciale/signature (fa danno)
 *   - normale: attacco base */
export function categoriaMossa(m) {
  if (m.effetto === 'cura1' || m.effetto === 'cura2') return 'rigenerazione';
  if (!(m.danno > 0)) return 'supporto';
  if (m.tipo === 'speciale' || m.tipo === 'signature') return 'speciale';
  return 'normale';
}

// ✨ Mossa esclusiva della FORMA PRISMA: una volta trasformato è l'UNICA mossa
// disponibile, ma è devastante (potenza enorme). Niente violenza: è uno "splendore"
// travolgente, non un colpo cattivo. Una per elemento, così ogni forma finale ha la sua.
// (Si chiamava "teracristallo": nome troppo vicino a un marchio esistente, rinominata.)
const MOSSE_PRISMA = {
  fuoco: { nome: 'Supernova di Cristallo', elemento: 'fuoco', animazione: 'fuoco', esclamazione: 'SUPERNOVA!' },
  acqua: { nome: 'Maremoto di Cristallo', elemento: 'acqua', animazione: 'acqua', esclamazione: 'MAREMOTO!' },
  natura: { nome: 'Fioritura di Cristallo', elemento: 'natura', animazione: 'natura', esclamazione: 'FIORITURA!' },
};
// Le tre forme finali che possono entrare in Forma Prisma.
export const SPECIE_PRISMA = new Set(['pyronex', 'aquarex', 'selvarex']);
const BASE_PRISMA = {
  tipo: 'signature', danno: 4, effetto: 'danno', cadenza: 'unaPerSfida',
  descrizione: 'L\'attacco supremo della Forma Prisma: uno splendore travolgente di potenza enorme.',
};
/** La mossa suprema del Lumino in Forma Prisma (secondo il suo elemento). */
function mossaPrisma(c) {
  return { ...BASE_PRISMA, ...(MOSSE_PRISMA[c && c.elemento] || MOSSE_PRISMA.fuoco) };
}

export function creaBattaglia(config = {}) {
  const alleato = creaCombattente(config.alleato);
  const avversario = creaCombattente(config.avversario);
  const pepole = config.pepole ? LUMINI[config.pepole.specie || 'pepole'] : LUMINI.pepole;
  const fairPlay = config.fairPlay !== false;
  const ripartiSeStanco = config.ripartiSeStanco !== false;
  // Pity system invisibile (RIFACIMENTO_PHASER): se il bambino perde più volte,
  // i suoi danni salgono e quelli avversari calano. Moltiplicatori per chi attacca.
  // Mai comunicato a schermo. Default: nessun aiuto. Si passa un oggetto vivo
  // (per riferimento) così la scena può alzare il pity dopo ogni 'ripresa'.
  const pityDanno = config.pityDanno || { alleato: 1, avversario: 1 };
  // #40 — Affezione (0-5) del Lumino alleato: a affezione alta "resiste col cuore"
  // (sopravvive a 1 stellina invece di stancarsi) una volta per sfida. Premia la cura.
  const affezione = Math.max(0, Math.min(5, config.affezione || 0));
  let cuoreUsato = false;

  let turnoNum = 0;
  let attivo = 'alleato';        // di chi è il turno
  let jollyUsato = false;        // Pepole interviene 1× per battaglia
  // ✨ FORMA PRISMA: chicca delle tre forme FINALI (una per elemento, così la chicca
  // c'è qualunque starter si sia scelto). Una volta per battaglia "carica" il prossimo
  // attacco rendendolo fortissimo; poi si torna normali.
  const PRISMA_MULT = 3;
  const prismaDisponibile = SPECIE_PRISMA.has(alleato.specie);
  let prismaUsato = false;
  let usaCarinaAttiva = false;   // per la logica IA
  let conclusa = false;

  const ascolt = new Map();
  function on(ev, cb) { (ascolt.get(ev) || ascolt.set(ev, new Set()).get(ev)).add(cb); return () => ascolt.get(ev)?.delete(cb); }
  function emit(ev, dato) { ascolt.get(ev)?.forEach((cb) => { try { cb(dato); } catch (e) { console.error(ev, e); } }); }

  function rif(chi) { return chi === 'alleato' ? alleato : avversario; }
  function altro(chi) { return chi === 'alleato' ? 'avversario' : 'alleato'; }

  function cambiaEnergia(c, delta, motivo) {
    const prima = c.energia;
    c.energia = clamp(c.energia + delta, 0, c.energiaMax);
    if (c.energia !== prima) {
      emit('energia', { chi: c === alleato ? 'alleato' : 'avversario', energia: c.energia, energiaMax: c.energiaMax, delta: c.energia - prima, motivo });
    }
  }

  // Mosse utilizzabili dal combattente attivo (con motivo se bloccate).
  function mosseDisponibili(chi = attivo) {
    const c = rif(chi);
    // In Forma Prisma (solo l'alleato) l'unica mossa è l'attacco supremo.
    if (c.prisma && chi === 'alleato') {
      const m = mossaPrisma(c);
      return [{ indice: 0, mossa: m, usabile: true, motivo: '', usiRimasti: null, categoria: categoriaMossa(m) }];
    }
    return c.mosse.map((m, indice) => {
      let usabile = true; let motivo = ''; let usiRimasti = null;
      if (m.tipo === 'signature' && c.usateSignature) { usabile = false; motivo = 'già usata in questa sfida'; }
      // Ricarica speciali contata in turni PROPRI del combattente (non globali):
      // così "torna pronta tra 2 turni tuoi" è coerente, non sembra casuale (#12).
      if (m.tipo === 'speciale' && (c.turniSuoi - c.ultimoSpecialeTurno) < 2) { usabile = false; motivo = 'in ricarica'; }
      // Cap cure: una mossa curativa al massimo 2 volte per sfida (anti-stallo).
      if (m.effetto === 'cura1' || m.effetto === 'cura2') {
        usiRimasti = Math.max(0, 2 - c.cureUsate);
        if (usiRimasti <= 0) { usabile = false; motivo = 'ha già recuperato abbastanza'; }
        // A stelle PIENE la cura è disabilitata: così un tocco per sbaglio nella foga
        // NON la spreca (niente uso consumato, niente turno bruciato). Si riaccende
        // appena il Lumino prende un colpo.
        else if (c.energia >= c.energiaMax) { usabile = false; motivo = 'energia già piena'; }
      }
      // Tetto d'uso esplicito (`usi`): mostrato come x2/x1/x0.
      if (m.usi) {
        usiRimasti = Math.max(0, m.usi - (c.usiMossa[m.nome] || 0));
        if (usiRimasti <= 0) { usabile = false; motivo = 'esaurita'; }
      }
      return { indice, mossa: m, usabile, motivo, usiRimasti, categoria: categoriaMossa(m) };
    });
  }

  // Applica una mossa di `chi` verso l'altro. Ritorna il danno inflitto.
  function applicaMossa(chi, mossa, { jolly = false } = {}) {
    const attaccante = rif(chi);
    const bersaglio = rif(altro(chi));

    // Confusione: 30% si colpisce da solo e salta.
    if (attaccante.confuso) {
      attaccante.confuso = false;
      if (Math.random() < 0.30) {
        emit('confuso', { chi, autocolpo: true });
        cambiaEnergia(attaccante, -1, 'autocolpo');
        return 0;
      }
      emit('confuso', { chi, autocolpo: false });
    }

    // Danno con vantaggio di tipo (solo se la mossa fa danno).
    let danno = mossa.danno || 0;
    let tipoEff = 'normale';
    let prismaColpo = false;
    if (danno > 0) {
      tipoEff = moltiplicatoreTipo(mossa.elemento, bersaglio.elemento) === 1.5 ? 'super'
        : moltiplicatoreTipo(mossa.elemento, bersaglio.elemento) < 1 ? 'scarso' : 'normale';
      let mult = moltiplicatoreTipo(mossa.elemento, bersaglio.elemento);
      if (attaccante.doppio) { mult *= 2; attaccante.doppio = false; }
      // Forma Prisma armata: questo singolo colpo del Lumino diventa fortissimo,
      // poi si scarica. Il soccorso di Pepole (jolly) NON consuma il boost di Pyronex.
      if (attaccante.prisma && !jolly) { mult *= PRISMA_MULT; attaccante.prisma = false; prismaColpo = true; }
      mult *= (pityDanno[chi] || 1);   // pity invisibile
      danno = Math.max(1, Math.round(danno * mult));
      if (bersaglio.scudo) { danno = Math.max(0, Math.round(danno / 2)); bersaglio.scudo = false; }
    }

    emit('mossa', { di: chi, mossa, danno, tipoEff, jolly, prisma: prismaColpo });
    if (danno > 0) cambiaEnergia(bersaglio, -danno, 'mossa');

    // Effetti non-danno.
    applicaEffetto(chi, mossa);
    if (mossa.bonusProssimo) { attaccante.doppio = true; emit('effetto', { di: chi, effetto: 'doppioProssimo', valore: true }); }

    // Segnatura/ricarica (in turni propri del combattente, vedi mosseDisponibili).
    if (mossa.tipo === 'signature') attaccante.usateSignature = true;
    if (mossa.tipo === 'speciale') attaccante.ultimoSpecialeTurno = attaccante.turniSuoi;
    if (mossa.usi) attaccante.usiMossa[mossa.nome] = (attaccante.usiMossa[mossa.nome] || 0) + 1;

    // Fair play: la stellina bonus è legata ai RITUALI (saluto/stretta), non a
    // ogni mossa gentile — altrimenti il contatore si gonfia battaglia dopo
    // battaglia (#15). La gentilezza resta premiata dall'effetto stesso (cura).
    return danno;
  }

  function applicaEffetto(chi, mossa) {
    const attaccante = rif(chi);
    const bersaglio = rif(altro(chi));
    switch (mossa.effetto) {
      case 'cura1': attaccante.cureUsate++; cambiaEnergia(attaccante, +1, 'cura'); emit('effetto', { di: chi, effetto: 'cura1', valore: 1 }); break;
      case 'cura2': attaccante.cureUsate++; cambiaEnergia(attaccante, +2, 'cura'); emit('effetto', { di: chi, effetto: 'cura2', valore: 2 }); break;
      case 'saltaTurno':
      case 'stordito1':
        bersaglio.stordito = Math.max(bersaglio.stordito, 1);
        emit('effetto', { di: chi, effetto: 'stordito', valore: 1 }); break;
      case 'doppioProssimo':
        attaccante.doppio = true; emit('effetto', { di: chi, effetto: 'doppioProssimo', valore: true }); break;
      case 'scudo':
        attaccante.scudo = true; emit('effetto', { di: chi, effetto: 'scudo', valore: true }); break;
      case 'confusione':
        bersaglio.confuso = true; emit('effetto', { di: chi, effetto: 'confusione', valore: true }); break;
      case 'riduciMax1':
        bersaglio.energiaMax = Math.max(1, bersaglio.energiaMax - 1);
        bersaglio.energia = clamp(bersaglio.energia, 0, bersaglio.energiaMax);
        emit('effetto', { di: chi, effetto: 'riduciMax1', valore: -1 });
        emit('energia', { chi: altro(chi), energia: bersaglio.energia, energiaMax: bersaglio.energiaMax, delta: 0, motivo: 'maxRidotto' });
        break;
      default: break; // 'danno' → nessun effetto extra
    }
  }

  // Controlla gli svenimenti e gestisce vittoria / ripresa non punitiva.
  function controllaStanchezza() {
    if (avversario.energia <= 0) {
      emit('stanco', { chi: 'avversario' });
      finisci('vittoria');
      return true;
    }
    if (alleato.energia <= 0) {
      // #40 — "resiste col cuore": con affezione alta, una volta per sfida il Lumino
      // sopravvive a 1 stellina invece di stancarsi (prob. cresce con l'affezione).
      const probCuore = affezione >= 4 ? 0.6 : affezione >= 2 ? 0.3 : 0;
      if (!cuoreUsato && probCuore > 0 && Math.random() < probCuore) {
        cuoreUsato = true;
        alleato.energia = 1;
        emit('cuore', { chi: 'alleato' });
        emit('energia', { chi: 'alleato', energia: alleato.energia, energiaMax: alleato.energiaMax, delta: 1, motivo: 'cuore' });
        return false;
      }
      emit('stanco', { chi: 'alleato' });
      if (ripartiSeStanco) {
        // Mai "hai perso": si riparte dall'inizio con energia piena.
        ripristina();
        emit('ripresa', {});
      } else {
        finisci('ripresa');
      }
      return true;
    }
    return false;
  }

  function ripristina() {
    // Il GIOCATORE riparte sempre FRESCO (mai "hai perso"): energia piena e cooldown
    // azzerati. L'AVVERSARIO invece RESTA affaticato quanto l'hai ridotto: l'energia
    // che gli hai tolto NON torna su. Così l'impegno del bambino non si azzera e anche
    // un matchup sfavorevole si chiude in pochi round, senza battaglie interminabili
    // (prima entrambi tornavano pieni → in svantaggio di tipo si poteva andare avanti
    // all'infinito finché il pity non ribaltava). I flag transitori si azzerano per
    // entrambi; l'energia dell'avversario resta dov'era.
    alleato.energiaMax = alleato.energiaMaxIniziale;
    alleato.energia = alleato.energiaMax;
    avversario.energia = clamp(avversario.energia, 0, avversario.energiaMax);
    [alleato, avversario].forEach((c) => {
      c.stordito = 0; c.doppio = false; c.scudo = false; c.confuso = false; c.prisma = false;
      c.usateSignature = false; c.turniSuoi = 0; c.ultimoSpecialeTurno = -99; c.cureUsate = 0; c.usiMossa = {};
    });
    turnoNum = 0; attivo = 'alleato'; jollyUsato = false; usaCarinaAttiva = false; cuoreUsato = false; prismaUsato = false;
  }

  function passaTurno() {
    attivo = altro(attivo);
    turnoNum++;
    emit('turno', { di: attivo });
  }

  // --- Azioni del giocatore ------------------------------------------------
  function usaMossa(indice) {
    if (conclusa || attivo !== 'alleato') return false;
    // In Forma Prisma la mossa è sempre l'attacco supremo, qualunque tasto si prema.
    const inPrisma = alleato.prisma;
    const m = inPrisma ? mossaPrisma(alleato) : alleato.mosse[indice];
    const disp = mosseDisponibili('alleato')[indice];
    if (!m || (!inPrisma && !disp.usabile)) return false;

    // Stordito: salta il turno (la Forma Prisma NON si spreca: resta armata).
    if (alleato.stordito > 0) { alleato.stordito--; emit('stordito', { chi: 'alleato' }); passaTurno(); return true; }

    alleato.turniSuoi++;
    usaCarinaAttiva = (m.nome === 'Molto Carina');
    applicaMossa('alleato', m);
    if (controllaStanchezza()) return true;
    passaTurno();
    return true;
  }

  // Pepole interviene come jolly (1× per battaglia), SENZA occupare il turno del
  // Lumino (#1): agisce e poi tocca ANCORA al giocatore (il Lumino può attaccare).
  function usaJolly(indice) {
    if (conclusa || jollyUsato || attivo !== 'alleato') return false;
    const m = pepole.mosse[indice];
    if (!m) return false;
    // Molto Carina di Pepole è 1× per sfida (coincide col jolly): ok.
    jollyUsato = true;
    usaCarinaAttiva = (m.nome === 'Molto Carina');
    // Le cure di Pepole vanno al Lumino attivo di Pietro: trattiamo Pepole come
    // "alleato" ai fini dell'effetto, ma il danno colpisce l'avversario.
    applicaMossa('alleato', { ...m, elemento: 'mistero' }, { jolly: true });
    if (controllaStanchezza()) return true;
    // NON passaTurno: il soccorso non brucia il turno del Lumino. Ribadiamo che
    // tocca ancora al giocatore (la UI riabilita le mosse su 'turno').
    emit('turno', { di: 'alleato' });
    return true;
  }

  // ✨ Forma Prisma (forme finali, 1× per battaglia): NON consuma il turno, arma il
  // prossimo attacco del Lumino. Tocca ancora al giocatore (sceglie la mossa).
  function usaPrisma() {
    if (conclusa || prismaUsato || !prismaDisponibile || attivo !== 'alleato') return false;
    prismaUsato = true;
    alleato.prisma = true;
    emit('prisma', { chi: 'alleato' });
    // Niente passaTurno: l'attivazione è un potenziamento, non una mossa.
    emit('turno', { di: 'alleato' });
    return true;
  }

  // --- IA avversario -------------------------------------------------------
  function scegliMossaIA() {
    const tutte = mosseDisponibili('avversario');
    let disp = tutte.filter((d) => d.usabile);
    // Anti-stallo (#2): se TUTTE le mosse sono bloccate (ricarica/esaurite),
    // l'IA usa comunque una mossa di ripiego (preferendo una base con danno) così
    // non resta mai senza azione e il turno non gira a vuoto all'infinito.
    if (!disp.length) {
      const ripiego = tutte.find((d) => d.mossa.tipo === 'base' && (d.mossa.danno || 0) > 0)
        || tutte.find((d) => (d.mossa.danno || 0) > 0) || tutte[0];
      return ripiego || null;
    }
    const speciali = disp.filter((d) => d.mossa.tipo === 'speciale' || d.mossa.tipo === 'signature');
    const base = disp.filter((d) => d.mossa.tipo === 'base');
    // Energia bassa + speciale disponibile → usa speciale (spesso difensivo/cura).
    if (avversario.energia <= 2 && speciali.length) return speciali[0];
    // Se Pietro ha appena fatto Molto Carina, non sprecare una difensiva.
    if (usaCarinaAttiva) return (base[0] || disp[0]);
    // Altrimenti 70% base, 30% speciale.
    if (Math.random() < 0.7 && base.length) return base[0];
    return (speciali[0] || base[0] || disp[0]);
  }

  // #66 — 2 giocatori locali: il secondo giocatore sceglie la mossa dell'avversario
  // (stessa logica di usaMossa ma per il lato avversario). Consuma il turno.
  function usaMossaAvversario(indice) {
    if (conclusa || attivo !== 'avversario') return false;
    const m = avversario.mosse[indice];
    const disp = mosseDisponibili('avversario')[indice];
    if (!m || !disp.usabile) return false;
    if (avversario.stordito > 0) { avversario.stordito--; emit('stordito', { chi: 'avversario' }); passaTurno(); return true; }
    avversario.turniSuoi++;
    applicaMossa('avversario', m);
    if (controllaStanchezza()) return true;
    passaTurno();
    return true;
  }

  function turnoAvversario() {
    if (conclusa || attivo !== 'avversario') return false;
    emit('turno', { di: 'avversario' });
    if (avversario.stordito > 0) { avversario.stordito--; emit('stordito', { chi: 'avversario' }); passaTurno(); return true; }
    avversario.turniSuoi++;
    const scelta = scegliMossaIA();
    usaCarinaAttiva = false;
    if (scelta) applicaMossa('avversario', scelta.mossa);
    if (controllaStanchezza()) return true;
    passaTurno();
    return true;
  }

  // #39 — Caramella-stella (oggetto): ridà energia al Lumino attivo e CONSUMA il
  // turno (poi tocca all'avversario). Ritorna false se non è il turno del giocatore.
  function usaCaramella(n = 2) {
    if (conclusa || attivo !== 'alleato') return false;
    cambiaEnergia(alleato, +n, 'oggetto');
    emit('oggetto', { tipo: 'caramella', valore: n });
    passaTurno();
    return true;
  }

  // Il giocatore ha speso il turno con un'azione NON-mossa (es. cattura fallita):
  // passa all'avversario e lo fa agire una volta.
  function consumaTurnoGiocatore() {
    if (conclusa || attivo !== 'alleato') return false;
    passaTurno();
    return turnoAvversario();
  }

  function finisci(esito) {
    if (conclusa) return;
    conclusa = true;
    if (esito === 'vittoria') { emit('vittoria', { alleato, avversario }); emit('stretta', {}); }
    emit('fine', { esito });
  }

  function avvia() {
    emit('saluto', { alleato, avversario });
    if (fairPlay) emit('bonus', { chi: 'alleato', motivo: 'saluto' });
    emit('turno', { di: 'alleato' });
  }

  function stato() {
    return {
      turno: attivo, turnoNum, conclusa, jollyUsato,
      prismaDisponibile, prismaUsato, prismaArmato: alleato.prisma,
      alleato: { ...alleato }, avversario: { ...avversario },
    };
  }

  return {
    on, avvia, stato,
    mosseDisponibili,
    usaMossa, usaJolly, usaPrisma, usaCaramella, turnoAvversario, usaMossaAvversario, consumaTurnoGiocatore,
    mossePepole: () => pepole.mosse,
    get conclusa() { return conclusa; },
    get turno() { return attivo; },
  };
}

export default { creaBattaglia };
