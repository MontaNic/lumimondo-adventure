/* motore/copertura.js — quanto "mondo in più" serve perché lo sfondo copra lo schermo. PURO.
 *
 * Il problema (segnalato da Nicolò, 2026-09): su PC la finestra è più larga del mondo di
 * gioco (città 1200×1400, mappa 1800×1152). La camera non può scorrere fuori dai suoi
 * limiti, quindi il mondo restava appiccicato a SINISTRA e nella striscia rimasta si vedeva
 * un fondale sfocato e di scala diversa — una cucitura evidente.
 *
 * La soluzione ha due parti, entrambe calcolate qui:
 *   1. un BORDO da riempire attorno al mondo (lo riempie la vista, specchiando l'immagine:
 *      un riflesso è continuo per costruzione, quindi la giunzione non si vede);
 *   2. limiti di camera ALLARGATI di quel bordo: quando i limiti sono larghi esattamente
 *      quanto lo schermo, la camera resta ferma al centro → il mondo è centrato, non a
 *      sinistra, e il bordo si divide equamente sui due lati.
 */

/** Bordo (in pixel di mondo) da aggiungere per lato perché il mondo copra la finestra. */
export function bordoCopertura(schermoW, schermoH, mondoW, mondoH) {
  return {
    x: Math.max(0, Math.ceil((schermoW - mondoW) / 2)),
    y: Math.max(0, Math.ceil((schermoH - mondoH) / 2)),
  };
}

/**
 * Limiti di camera che tengono il mondo CENTRATO quando lo schermo è più grande.
 * Ritorna [x, y, larghezza, altezza] da passare a `camera.setBounds`.
 * Se lo schermo ci sta dentro, sono i limiti normali del mondo (nessun cambiamento).
 */
export function limitiCamera(schermoW, schermoH, mondoW, mondoH) {
  const b = bordoCopertura(schermoW, schermoH, mondoW, mondoH);
  // `-0` esiste in JavaScript ed è diverso da `0` per i confronti stretti: lo normalizzo,
  // così i limiti sono numeri ordinari e i test non inciampano su una distinzione invisibile.
  const meno = (n) => (n === 0 ? 0 : -n);
  return [meno(b.x), meno(b.y), mondoW + b.x * 2, mondoH + b.y * 2];
}
