/* hidpi.js — disegno NITIDO sugli schermi ad alta densità (iPhone/iPad "Retina").
 *
 * PROBLEMA: Phaser 3.60 crea il canvas a 1 pixel per punto CSS. Su un telefono con
 * devicePixelRatio 3 (iPad: 2) il browser ingrandisce tutto 2-3 volte → scritte,
 * pulsanti e disegni sgranati/sfocati.
 *
 * SOLUZIONE (senza toccare le scene): il gioco continua a "pensare" in punti CSS
 * (gameSize, posizioni, tocchi, layout responsive: tutto invariato), ma:
 *  1. il canvas ha un buffer di R× pixel (R = densità, max 2) e resta grande quanto
 *     prima a schermo (style in px CSS);
 *  2. le sole chiamate WebGL che decidono DOVE disegnare sullo schermo (viewport e
 *     scissor) vengono moltiplicate per R quando si disegna sul canvas (non nei
 *     framebuffer intermedi). La proiezione resta in punti CSS → stessa immagine,
 *     R× più definita;
 *  3. i testi vengono generati a risoluzione R (altrimenti resterebbero sfocati).
 *
 * Solo con WebGL; col renderer Canvas (raro) resta tutto com'era.
 * Disattivabile per test con ?hd=1 (forza R=1) o ?hd=2/3.
 */

function calcolaR() {
  const m = /[?&]hd=(\d(?:\.\d+)?)/.exec(location.search);
  if (m) return Math.max(1, Math.min(3, Number(m[1])));
  const dpr = window.devicePixelRatio || 1;
  // Massimo 2: oltre, su telefono il guadagno visivo è minimo e il costo (memoria
  // e GPU) cresce col quadrato.
  return Math.max(1, Math.min(2, dpr));
}

export const R = calcolaR();

/** Avvolge le chiamate GL di posizionamento: ×R solo sul canvas (framebuffer null). */
function avvolgiGL(gl) {
  if (!gl || gl.__lumiHiDPI) return;
  gl.__lumiHiDPI = true;
  const viewport = gl.viewport.bind(gl);
  const scissor = gl.scissor.bind(gl);
  const bindFramebuffer = gl.bindFramebuffer.bind(gl);
  let suCanvas = true;
  gl.bindFramebuffer = (target, fb) => { suCanvas = !fb; return bindFramebuffer(target, fb); };
  gl.viewport = (x, y, w, h) => (suCanvas ? viewport(x * R, y * R, w * R, h * R) : viewport(x, y, w, h));
  gl.scissor = (x, y, w, h) => (suCanvas ? scissor(x * R, y * R, w * R, h * R) : scissor(x, y, w, h));
  // Phaser calcola la "y" dello scissor come drawingBufferHeight - y - h: la vuole in
  // punti CSS, come tutto il resto.
  const proto = Object.getPrototypeOf(gl);
  const desc = Object.getOwnPropertyDescriptor(proto, 'drawingBufferHeight');
  if (desc && desc.get) {
    Object.defineProperty(gl, 'drawingBufferHeight', { get() { return desc.get.call(gl) / R; }, configurable: true });
  }
}

export function installaHiDPI() {
  if (R === 1 || !window.Phaser) return;
  const P = window.Phaser;

  // 1) Canvas a R× pixel, stessa misura a schermo.
  const SM = P.Scale && P.Scale.ScaleManager;
  if (SM && SM.prototype.updateScale) {
    const orig = SM.prototype.updateScale;
    SM.prototype.updateScale = function () {
      orig.call(this);
      if (this.scaleMode !== P.Scale.RESIZE || !this.game.renderer || this.game.renderer.type !== P.WEBGL) return;
      const w = this.gameSize.width, h = this.gameSize.height, c = this.canvas;
      c.width = Math.round(w * R); c.height = Math.round(h * R);
      c.style.width = w + 'px'; c.style.height = h + 'px';
    };
  }

  // 2) Viewport/scissor ×R sul canvas.
  const WR = P.Renderer && P.Renderer.WebGL && P.Renderer.WebGL.WebGLRenderer;
  if (WR && WR.prototype.init) {
    const init = WR.prototype.init;
    WR.prototype.init = function (...a) {
      const r = init.apply(this, a);
      avvolgiGL(this.gl);
      // Le chiamate fatte DURANTE init erano ancora a 1×: le rifaccio.
      try { this.resize(this.width, this.height); } catch { /* niente */ }
      return r;
    };
  }

  // 3) Testi generati a risoluzione R (se la scena non ne chiede una sua).
  const F = P.GameObjects && P.GameObjects.GameObjectFactory;
  if (F && F.prototype.text) {
    const text = F.prototype.text;
    F.prototype.text = function (x, y, t, style) {
      const s = style ? { ...style } : {};
      if (s.resolution == null) s.resolution = R;
      return text.call(this, x, y, t, s);
    };
  }
}
