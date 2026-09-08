/* battaglia/elementi.js — colori ed emoji degli elementi per la VISTA della battaglia.
 *
 * Estratti da BattagliaScene (F0.2): usati sia dall'HUD (badge tipo) sia dalle
 * animazioni delle mosse. Valori numerici (0x…) perché servono a Phaser
 * (setFillStyle/tint), a differenza di ELEMENTI in lumini-data.js che ha stringhe. */
export const COL_ELEM = { fuoco: 0xff7a30, acqua: 0x34a0d8, natura: 0x4caf50, elettricita: 0xffd23f, roccia: 0x9b8579, aria: 0xd98fd0, mistero: 0xa679e0 };
export const EMO_ELEM = { fuoco: '🔥', acqua: '💧', natura: '🌿', elettricita: '⚡', roccia: '🪨', aria: '🌬️', mistero: '❓' };
