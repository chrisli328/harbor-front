// Shared block-unit kit (split out of units7.js in round 8 so the round-8 air units, motherships and chibi people can
// reuse it): palette, the boat hull extruder, flat shapes, skulls, the jolly roger and the two-point beam.
// Forward is +x, the waterline / ground is y = 0. Imports three and look.js only.
import * as THREE from 'three';
import { Builder, PAL, paint } from './look.js';

// ---------------------------------------------------------------- palette
export const OURS = { hull: 0x3157a8, bottom: 0xc8473c, stripe: PAL.white, deck: 0x46557f };
export const NAVY = 0x3157a8, SLATE = 0x46557f, LB = 0x7fcbff, GOLD = 0xffc23a, GOLDD = 0xd99a1e;
export const TRACK = 0x2c2f36, TRACKL = 0x8a919e, WHEEL = 0x9aa4b4, GUN = 0x4a5160, IRON = 0x3a3d45, IRONL = 0x6d727c;
export const RUST = 0xb83f2a, RUSTD = 0x8e2f22, BLK = 0x1d1a1c, BLK2 = 0x231d1f, BONE = 0xf4f1ea, GLOW = 0xff3b2e, LAMP = 0xffe27a;
export const SKIN = 0xf2c29b, EYE = 0x2a2a30, SHOE = 0x2a2a30;
export const TAU = Math.PI * 2, HP = Math.PI / 2;
export const XAX = [0, 0, -HP]; // rotation that lays a y-axis primitive (cyl, cone tip) along +x
export const ZAX = [HP, 0, 0]; // rotation that lays a y-axis primitive along z

export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- shared shapes
// Plan-view boat shape extruded up and narrowed toward the keel (same method as models.js hullGeo), banded per
// triangle: bottom below the waterline, hull, a stripe under the gunwale, deck on top.
export function hullGeo(L, B, H, draft, col, o = {}) {
  const s = new THREE.Shape(), hl = L / 2, hb = B / 2, sr = o.sternRound ?? 0.35, sh = o.shoulder ?? 0.2;
  s.moveTo(-hl, -hb + sr);
  s.quadraticCurveTo(-hl, -hb, -hl + sr, -hb);
  s.lineTo(hl * sh, -hb);
  s.quadraticCurveTo(hl * 0.82, -hb, hl, 0);
  s.quadraticCurveTo(hl * 0.82, hb, hl * sh, hb);
  s.lineTo(-hl + sr, hb);
  s.quadraticCurveTo(-hl, hb, -hl, hb - sr);
  s.lineTo(-hl, -hb + sr);
  const bev = Math.min(0.18, B * 0.05), steps = o.steps ?? 4;
  let g = new THREE.ExtrudeGeometry(s, { depth: H, steps, curveSegments: 7, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2 });
  g.rotateX(-HP); g.translate(0, -draft, 0);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, py = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    py[i] = y;
    const t = (y - y0) / (y1 - y0);
    z *= (o.keel ?? 0.38) + (1 - (o.keel ?? 0.38)) * sstep(0, 0.62, t);
    x *= 0.9 + 0.1 * sstep(0, 0.5, t);
    if (x > 0) y += (o.sheer ?? 0.5) * Math.pow(x / hl, 2) * t;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const n = pos.count, c = new Float32Array(n * 3), cc = new THREE.Color(), nor = g.attributes.normal;
  const top = y1 - 0.02, stripe = o.stripeH ?? H * 0.16;
  for (let i = 0; i < n; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3;
    let k = col.hull;
    if (ny > 0.55 && cy > top - 0.2) k = col.deck;
    else if (cy < (o.bottomY ?? 0.08)) k = col.bottom;
    else if (cy > top - stripe - 0.05) k = col.stripe;
    if (o.band && k === col.hull && Math.floor(((py[i] + py[i + 1] + py[i + 2]) / 3 + draft) / (H / steps)) === o.band[0]) k = o.band[1];
    cc.set(k);
    for (let j = 0; j < 3; j++) { c[(i + j) * 3] = cc.r; c[(i + j) * 3 + 1] = cc.g; c[(i + j) * 3 + 2] = cc.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function flatGeo(shape, thick, color) { // a flat shape in the x-y plane, thickness along z
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2);
  const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return paint(q, color);
}
export function triGeo(a, b, c, thick, color) { const s = new THREE.Shape(); s.moveTo(...a); s.lineTo(...b); s.lineTo(...c); s.lineTo(...a); return flatGeo(s, thick, color); }
export function starGeo(r, thick, color) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = HP + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return flatGeo(s, thick, color);
}
export function arcGeo(r, tube, arc, color) { // part of a ring in the x-y plane (a hook)
  let g = new THREE.TorusGeometry(r, tube, 6, 14, arc); g = g.toNonIndexed(); g.deleteAttribute('uv'); return paint(g, color);
}

// Skull and crossbones in the x-y plane (seen from +z and -z); eye colour may glow red on the robots.
export function skull(b, x, y, z, s, thick = 0.16, eye = 0x141414) {
  for (const a of [-0.6, 0.6]) b.add('box', BONE, [x, y - s * 0.2, z], [s * 1.5, s * 0.17, thick * 0.75], [0, 0, a]);
  b.add('sphLo', BONE, [x, y + s * 0.08, z], [s, s * 0.9, thick]);
  b.add('box', BONE, [x, y - s * 0.38, z], [s * 0.55, s * 0.26, thick * 0.9]);
  for (const sd of [-1, 1]) for (const ex of [-0.22, 0.22]) b.add('sphLo', eye, [x + ex * s, y + s * 0.1, z + sd * thick * 0.42], [s * 0.26, s * 0.26, thick * 0.3]);
}
export const SKULLS = {};
export function skullGeo(s, thick, eye) { const k = s + ':' + thick + ':' + eye; if (!SKULLS[k]) { const t = new Builder(); skull(t, 0, 0, 0, s, thick, eye); SKULLS[k] = t.build(); } return SKULLS[k]; }
// skull facing +x (on a robot's front)
export const skullFront = (b, x, y, z, s, thick = 0.16, eye) => b.addGeo(skullGeo(s, thick, eye), [x, y, z], [0, HP, 0]);
export function jollyRoger(b, x, top, w, h, z = 0) { // black flag streaming aft (-x) from a pole at x
  const fx = x - w / 2 - 0.06, fy = top - h / 2;
  b.add('box', 0x141418, [fx, fy, z], [w, h, 0.06]);
  skull(b, fx, fy + h * 0.04, z, h * 0.42, 0.12);
}

// A box (or cylinder) between two points: long axis along p0 -> p1.
export const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
export function beam(b, kind, color, p0, p1, w, d = w, extra = 0) {
  _v.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); const L = _v.length(); _v.normalize();
  _q.setFromUnitVectors(UP, _v); _e.setFromQuaternion(_q);
  b.add(kind, color, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [w, L + extra, d], [_e.x, _e.y, _e.z]);
}
