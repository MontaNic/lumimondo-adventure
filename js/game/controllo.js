/* controllo.js — ControlloMovimento: traduce input touch/mouse/tastiera in una
 * velocità per il corpo Arcade di Pietro. Riusato da mappa e città.
 *
 * Doppia modalità mobile (RIFACIMENTO_PHASER, "SISTEMA DI MOVIMENTO"):
 *   (a) tap-to-move — tocchi un punto e Pietro ci cammina (linea retta, scivola
 *       sui muri grazie alla separazione per-asse di Arcade). Modalità PRIMARIA.
 *   (b) joystick virtuale — se il dito resta premuto >200ms appare in basso a
 *       sinistra e comanda la direzione finché tieni premuto.
 * PC: WASD/frecce muovono, Shift corre. Doppio tap mobile = corsa.
 */

import * as Juice from './juice.js';

const VEL_CAMMINA = 165;   // alzata: camminava troppo lento
const VEL_CORSA = 270;
const SOGLIA_JOYSTICK_MS = 200;   // dopo questo tempo il "premuto" diventa joystick
const SOGLIA_DRAG_PX = 18;        // oltre questo spostamento → joystick subito
const RAGGIO_JOYSTICK = 60;
const ARRIVO_PX = 8;              // entro questa distanza dal target → fermati

export class ControlloMovimento {
  constructor(scene, attore) {
    this.scene = scene;
    this.attore = attore;
    this.target = null;          // {x,y} world per tap-to-move
    this.joyAttivo = false;
    this.joyDir = { x: 0, y: 0 };
    this.correndo = false;
    this.ultimoTap = 0;
    this.premutoDa = 0;
    this.puntatorePremuto = false;
    this.posDown = { x: 0, y: 0 };
    this.abilitato = true;

    // Grafica joystick in coordinate schermo (scrollFactor 0), nascosta all'inizio.
    this.joyBase = scene.add.circle(0, 0, RAGGIO_JOYSTICK, 0xffffff, 0.18)
      .setScrollFactor(0).setDepth(9000).setVisible(false);
    this.joyKnob = scene.add.circle(0, 0, 26, 0xffffff, 0.5)
      .setScrollFactor(0).setDepth(9001).setVisible(false);

    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT');

    scene.input.on('pointerdown', this._down, this);
    scene.input.on('pointermove', this._move, this);
    scene.input.on('pointerup', this._up, this);
    scene.events.once('shutdown', this.distruggi, this);
    scene.events.once('destroy', this.distruggi, this);
  }

  _down(p) {
    if (!this.abilitato) return;
    // Ignora i tocchi che colpiscono un elemento UI interattivo (pulsanti HUD,
    // menu): non devono far camminare Pietro verso il bottone.
    if (this._suUI(p)) { this.puntatorePremuto = false; return; }
    this.puntatorePremuto = true;
    this.premutoDa = this.scene.time.now;
    this.posDown = { x: p.x, y: p.y };
  }

  _suUI(p) {
    const sotto = this.scene.input.hitTestPointer(p) || [];
    return sotto.some((o) => o !== this.attore && o.input && o.input.enabled);
  }

  _move(p) {
    if (!this.abilitato || !this.puntatorePremuto) return;
    const dx = p.x - this.posDown.x;
    const dy = p.y - this.posDown.y;
    const dist = Math.hypot(dx, dy);
    const tenutoAlungo = this.scene.time.now - this.premutoDa > SOGLIA_JOYSTICK_MS;
    if (!this.joyAttivo && (dist > SOGLIA_DRAG_PX || tenutoAlungo)) {
      this.joyAttivo = true;
      this.target = null;
      this.joyBase.setPosition(this.posDown.x, this.posDown.y).setVisible(true);
      this.joyKnob.setPosition(this.posDown.x, this.posDown.y).setVisible(true);
    }
    if (this.joyAttivo) {
      const cl = Math.min(RAGGIO_JOYSTICK, dist) || 0;
      const ang = Math.atan2(dy, dx);
      const kx = this.posDown.x + Math.cos(ang) * cl;
      const ky = this.posDown.y + Math.sin(ang) * cl;
      this.joyKnob.setPosition(kx, ky);
      const norm = cl / RAGGIO_JOYSTICK;
      this.joyDir = norm < 0.15 ? { x: 0, y: 0 }
        : { x: Math.cos(ang) * norm, y: Math.sin(ang) * norm };
    }
  }

  _up(p) {
    if (!this.abilitato) { this._resetPuntatore(); return; }
    const tenuto = this.scene.time.now - this.premutoDa;
    if (!this.joyAttivo && tenuto < SOGLIA_JOYSTICK_MS) {
      // Tap secco → tap-to-move sul punto del mondo. Doppio tap ravvicinato = corsa.
      const ora = this.scene.time.now;
      this.correndo = (ora - this.ultimoTap) < 320;
      this.ultimoTap = ora;
      const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
      this.target = { x: wp.x, y: wp.y };
      // Feedback: anello-onda nel punto toccato.
      try { Juice.ripple(this.scene, wp.x, wp.y, { colore: this.correndo ? 0xffd23f : 0xffffff, depth: 8000 }); } catch {}
    }
    this._resetPuntatore();
  }

  _resetPuntatore() {
    this.puntatorePremuto = false;
    this.joyAttivo = false;
    this.joyDir = { x: 0, y: 0 };
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
  }

  /** Ferma ogni movimento in corso (es. all'apertura di un dialogo). */
  ferma() {
    this.target = null;
    this._resetPuntatore();
    if (this.attore.body) this.attore.body.setVelocity(0, 0);
  }

  /** Da chiamare nell'update della Scene. Calcola e applica la velocità. */
  aggiorna(dtMs) {
    const body = this.attore.body;
    if (!body) return;
    let vx = 0, vy = 0;

    // Tastiera (PC) — ha priorità se premuta.
    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.A.isDown || k.LEFT.isDown) kx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) kx += 1;
    if (k.W.isDown || k.UP.isDown) ky -= 1;
    if (k.S.isDown || k.DOWN.isDown) ky += 1;

    if (kx || ky) {
      this.target = null;
      const corsa = k.SHIFT.isDown;
      const m = Math.hypot(kx, ky) || 1;
      const vel = corsa ? VEL_CORSA : VEL_CAMMINA;
      vx = (kx / m) * vel; vy = (ky / m) * vel;
    } else if (this.joyAttivo && (this.joyDir.x || this.joyDir.y)) {
      const vel = VEL_CAMMINA + (VEL_CORSA - VEL_CAMMINA) * Math.min(1, Math.hypot(this.joyDir.x, this.joyDir.y));
      vx = this.joyDir.x * vel; vy = this.joyDir.y * vel;
    } else if (this.target) {
      const dx = this.target.x - this.attore.x;
      const dy = this.target.y - this.attore.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= ARRIVO_PX) {
        this.target = null;
      } else {
        const vel = this.correndo ? VEL_CORSA : VEL_CAMMINA;
        vx = (dx / dist) * vel; vy = (dy / dist) * vel;
      }
    }

    body.setVelocity(vx, vy);
    this.attore.aggiornaMovimento(vx, vy, dtMs);
  }

  distruggi() {
    this.scene.input.off('pointerdown', this._down, this);
    this.scene.input.off('pointermove', this._move, this);
    this.scene.input.off('pointerup', this._up, this);
    this.joyBase.destroy();
    this.joyKnob.destroy();
  }
}
