/* motore/regia.js — INTERPRETE della regia narrativa, data-driven (F0.4).
 *
 * Regola d'oro (PIANO_V2 §3): "il MOTORE non conosce Phaser". Questo modulo è JS PURO:
 * non importa nulla, non tocca il DOM né Phaser. Esegue in sequenza una lista di BEAT
 * (dati) chiamando gli handler forniti dalla VISTA (la scena). Ogni handler ritorna una
 * Promise che si risolve quando quel beat è concluso (dialogo chiuso, quiz risolto,
 * prossimità raggiunta…). Così la stessa regia è: (a) editabile come dati dal CMS,
 * (b) testabile con `node --test` iniettando handler finti.
 *
 * Un BEAT è `{ tipo, ...campi }`. Campi comuni a QUALSIASI beat:
 *   - gate:  '<flag>'  → salta il beat se il flag di storia è già fatto (RIPRESA: rientrando
 *                        in città l'intro non riparte da capo, riprende dalla tappa mancante).
 *   - segna: '<flag>'  → segna il flag DOPO che il beat è concluso.
 *
 * Tipi STRUTTURALI (l'interprete li conosce):
 *   - gruppo    { beats:[...] }              → esegue i beat annidati (con gate/segna sul gruppo = tappa)
 *   - guida     { pos, colore, tex?, poi:[]} → ctx.guida(pos,colore,tex) e POI i beat annidati
 *   - prossimita{ pos, r, poi:[...] }        → ctx.attendiProssimita(pos,r) e POI i beat annidati
 *   - dialogoUnaVolta { battute, once }      → ctx.dialogo(beat) solo se !fatta(once) (poi segna once)
 *
 * Ogni ALTRO `tipo` è delegato all'handler-vista omonimo `ctx[tipo](beat, ctx)`: così i
 * MOMENTI SU MISURA (presentazione eroe, scrigno starter, demo stelline, lancio battaglia…)
 * restano hook nominati dai dati (come i contenuti bespoke di F0.3), senza che l'interprete
 * li conosca. Esempi di handler-dati: dialogo, conta, unisci, alone, segna, fatta,
 * attendiProssimita, guida, presentazione, scrignoStarter, demoStelline, avviaBattaglia…
 */

/** Esegue una regia (gate di testa incluso): non parte se `script.gate` è già fatto. */
export async function eseguiRegia(script, ctx) {
  if (!script || !Array.isArray(script.beats)) return;
  if (script.gate && ctx.fatta(script.gate)) return;
  await eseguiBeat(script.beats, ctx);
}

/** Esegue una lista di beat in sequenza (await uno alla volta), rispettando gate/segna. */
export async function eseguiBeat(beats, ctx) {
  for (const b of beats) {
    if (b.gate && ctx.fatta(b.gate)) continue;   // ripresa: salta le tappe già fatte
    await unBeat(b, ctx);
    if (b.segna) await ctx.segna(b.segna);
  }
}

async function unBeat(b, ctx) {
  switch (b.tipo) {
    case 'gruppo':
      return eseguiBeat(b.beats || [], ctx);
    case 'guida':
      await ctx.guida(b.pos, b.colore, b.tex);
      return eseguiBeat(b.poi || [], ctx);
    case 'prossimita':
      await ctx.attendiProssimita(b.pos, b.r || 160);
      return eseguiBeat(b.poi || [], ctx);
    case 'dialogoUnaVolta':
      if (b.once && ctx.fatta(b.once)) return undefined;
      if (b.once) await ctx.segna(b.once);
      return ctx.dialogo(b);
    default: {
      const h = ctx[b.tipo];
      if (typeof h !== 'function') throw new Error('regia: beat sconosciuto "' + (b && b.tipo) + '"');
      return h(b, ctx);
    }
  }
}
