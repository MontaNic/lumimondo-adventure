/* motore/torneo.js — regole del TORNEO FINALE (F4, Luminia), PURE (zero Phaser, test).
 *
 * Il Grande Torneo è il climax del gioco: Pietro affronta 3 sfidanti, poi il Maestro.
 * Il torneo è DATI (`torneo` in luminia.json: lista sfide + finale); qui vivono le REGOLE
 * di avanzamento (quante vinte, qual è il prossimo, il Maestro è sbloccato, il torneo è
 * concluso). La vista disegna il tabellone e CHIEDE al motore. PIANO_V2 §8.
 *
 * Regola dolce (come tutto il gioco): "mai un muro". I 3 sfidanti si possono battere in
 * QUALSIASI ordine; il Maestro si sblocca quando tutti e 3 sono stati vinti. Il "prossimo"
 * è solo un suggerimento per il tabellone (chi manca), non un obbligo di sequenza.
 */

// Come la vista/gioco segna una sfida vinta: GS.progressiStoria['sfida:<id>:vinta'].
// Il motore riceve DIRETTAMENTE quell'oggetto (progressi) e non conosce lo storage.
export function chiaveVinta(idSfida) { return 'sfida:' + idSfida + ':vinta'; }

/** Una sfida risulta vinta nei progressi? */
export function sfidaVinta(idSfida, progressi) {
  return !!(progressi && progressi[chiaveVinta(idSfida)]);
}

/**
 * Stato del torneo dato il blocco dati `{ sfide:[id…], finale:id }` e i progressi.
 * Ritorna sempre un oggetto coerente anche con dati mancanti (nessun crash).
 *   - totale: quanti sfidanti preliminari
 *   - vinte: quanti già battuti
 *   - restanti: id dei preliminari ancora da battere (in ordine di elenco)
 *   - prossima: il primo preliminare da battere, o null se finiti
 *   - finaleSbloccato: true quando TUTTI i preliminari sono vinti
 *   - completo: true quando anche la finale è vinta
 */
export function statoTorneo(torneo, progressi) {
  const sfide = (torneo && Array.isArray(torneo.sfide)) ? torneo.sfide : [];
  const finale = torneo && torneo.finale;
  const restanti = sfide.filter((id) => !sfidaVinta(id, progressi));
  const vinte = sfide.length - restanti.length;
  const finaleSbloccato = sfide.length > 0 && restanti.length === 0;
  return {
    totale: sfide.length,
    vinte,
    restanti,
    prossima: restanti.length ? restanti[0] : null,
    finaleSbloccato,
    completo: !!(finale && finaleSbloccato && sfidaVinta(finale, progressi)),
  };
}

/** Il Maestro (finale) è affrontabile? = tutti i preliminari vinti. */
export function maestroSbloccato(torneo, progressi) {
  return statoTorneo(torneo, progressi).finaleSbloccato;
}

/** Etichetta breve per il tabellone, es. "Torneo 2/3". */
export function etichettaTorneo(torneo, progressi) {
  const s = statoTorneo(torneo, progressi);
  return 'Torneo ' + s.vinte + '/' + s.totale;
}
