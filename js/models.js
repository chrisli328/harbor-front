// Every 3D model in the harbor, built from code blocks (rounded boxes, cylinders, half cylinders, extruded hulls)
// with vertex colours, the same method as the Octo Arms prototype's city, cars and police. One merged geometry per
// model plus separate turret meshes that turn toward their target. Units: a gunboat is 8 long; y = 0 is the sea.
import * as THREE from 'three';
import { Builder, PAL, MAT, solidMesh, paint, seeded } from './look.js';
import { BASE, SHEDS3D, HQ_AT, REPAIR_AT, TURRET_AT, ZONES, JETTY, WHARF, PIER, SLIPS } from './world.js';
import { unit7 } from './units7.js';

const Y0 = BASE.y; // quay top
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- hulls
// Plan-view boat shape (flat transom, pointed bow toward +x), extruded up, narrowed toward the keel, bow raised,
// and coloured in bands per triangle: antifouling below the waterline, hull, a stripe under the gunwale, deck on top.
function hullGeo(L, B, H, draft, col, o = {}) {
  const s = new THREE.Shape(), hl = L / 2, hb = B / 2, sr = o.sternRound ?? 0.35;
  s.moveTo(-hl, -hb + sr);
  s.quadraticCurveTo(-hl, -hb, -hl + sr, -hb);
  s.lineTo(hl * (o.shoulder ?? 0.2), -hb);
  s.quadraticCurveTo(hl * 0.82, -hb, hl, 0);
  s.quadraticCurveTo(hl * 0.82, hb, hl * (o.shoulder ?? 0.2), hb);
  s.lineTo(-hl + sr, hb);
  s.quadraticCurveTo(-hl, hb, -hl, hb - sr);
  s.lineTo(-hl, -hb + sr);
  const bev = Math.min(0.18, B * 0.05);
  const steps = o.steps ?? 4;
  let g = new THREE.ExtrudeGeometry(s, { depth: H, steps, curveSegments: 7, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2); // extrusion now points up
  g.translate(0, -draft, 0);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, py = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    py[i] = y;
    const t = (y - y0) / (y1 - y0);
    z *= 0.38 + 0.62 * sstep(0, 0.62, t);
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
    else if (cy < 0.08) k = col.bottom;
    else if (cy > top - stripe - 0.05) k = col.stripe;
    // o.band = [row, colour]: one extrusion row of the side (counted from the keel, follows the sheer) painted as a stripe
    if (o.band && k === col.hull && Math.floor(((py[i] + py[i + 1] + py[i + 2]) / 3 + draft) / (H / steps)) === o.band[0]) k = o.band[1];
    cc.set(k);
    for (let j = 0; j < 3; j++) { c[(i + j) * 3] = cc.r; c[(i + j) * 3 + 1] = cc.g; c[(i + j) * 3 + 2] = cc.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.userData.deckY = y1 - draft * 0; // top of the hull
  return g;
}

function triGeo(a, b, c, thick, color) { // flat triangle (sails, flags, teeth) in the x-y plane, given thickness in z
  const s = new THREE.Shape(); s.moveTo(...a); s.lineTo(...b); s.lineTo(...c); s.lineTo(...a);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2);
  const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return paint(q, color);
}

// Round-4 unit sheet (gen-r3/units u1, u3, u4): our boats are blue hulls with a white gunwale stripe, a slate deck and a
// white cabin, in three tiers by shed level (1: Lv 1-19, 2: Lv 20-39, 3: Lv 40+). Tier 2 adds a light-blue stripe,
// a radar and a bigger weapon; tier 3 adds gold armour plates, a gold star, a gold radar and a star flag.
// Pirates are rust red over black with black sails and skull flags.
const OURS = { hull: 0x3157a8, bottom: 0xc8473c, stripe: PAL.white, deck: 0x46557f };
const LB = 0x7fcbff, GOLD = 0xffc23a, GOLDD = 0xd99a1e, CAB = 0xeef1f5, CABR = 0xd3d9e2;
const RUST = { hull: 0xb83f2a, bottom: 0x1d1a1c, stripe: 0x231d1f, deck: 0x8e3b2c }; // rust-red deck: seen from above the raider reads red and black first
// On-screen size only (hits and picking use the sim's own lengths). Boats sit on y = 0, so scaling keeps the waterline.
const UNIT_SCALE = { gunboat: 1.2, torpedo: 1.2, destroyer: 1.2, raider: 1.2, gunship: 1.2, boss: 1 };

function starGeo(r, thick, color) { // five-point star in the x-y plane
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2);
  const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return paint(q, color);
}

// Flag pole at (x, y) on the centreline; the flag streams aft (-x). Tier 2 adds a light-blue band, tier 3 a navy flag
// with a gold star and a gold ball on top.
function navyFlag(b, x, y, h, tier) {
  b.cylOn('cyl8', PAL.steelD, x, y, 0, 0.13, h);
  const fw = tier >= 3 ? 1.3 : 1.0, fh = tier >= 3 ? 0.85 : 0.65, fx = x - fw / 2 - 0.07, fy = y + h - fh / 2 - 0.06;
  b.add('box', tier >= 3 ? 0x1f3a7a : PAL.blue, [fx, fy, 0], [fw, fh, 0.05]);
  if (tier === 2) b.add('box', LB, [fx, fy, 0], [fw, fh * 0.24, 0.08]);
  if (tier >= 3) { b.addGeo(starGeo(fh * 0.36, 0.1, GOLD), [fx, fy, 0]); b.add('sphLo', GOLD, [x, y + h + 0.12, 0], [0.3, 0.3, 0.3]); }
  else b.add('sphLo', 0xf2f2f2, [x, y + h + 0.07, 0], [0.2, 0.2, 0.2]);
}

// Radar on a cabin roof at (x, y): a post and a crossbar, gold at tier 3.
function radar(b, x, y, tier, w = 1.4) {
  b.cylOn('cyl8', PAL.steelD, x, y, 0, 0.16, 0.55);
  b.add('rbox', tier >= 3 ? GOLD : PAL.steel, [x, y + 0.66, 0], [0.32, 0.26, w]);
  b.add('box', tier >= 3 ? GOLDD : PAL.steelD, [x + 0.17, y + 0.66, 0], [0.04, 0.16, w * 0.8]);
}

// Tier-3 armour: gold plates on both hull sides at height y, half-beam zs, and a gold bar across the transom.
function goldArmour(b, xs, y, zs, w, h, sternX, sternW) {
  for (const sd of [-1, 1]) for (const x of xs) b.add('rbox', GOLD, [x, y, sd * zs], [w, h, 0.14]);
  b.add('rbox', GOLD, [sternX, y, 0], [0.16, h, sternW]);
}

// Gold star on both sides of a cabin of half-width hz.
function cabinStars(b, x, y, hz, r = 0.36) { for (const sd of [-1, 1]) b.addGeo(starGeo(r, 0.07, GOLD), [x, y, sd * (hz + 0.035)]); }

// Black flag with a white skull and crossbones; pole top at (x, top), flag streams aft. Also used big on sails.
function skull(b, x, y, z, s, thick = 0.16) {
  for (const a of [-0.6, 0.6]) b.add('box', 0xf4f1ea, [x, y - s * 0.2, z], [s * 1.5, s * 0.17, thick * 0.75], [0, 0, a]);
  b.add('sphLo', 0xf4f1ea, [x, y + s * 0.08, z], [s, s * 0.9, thick]);
  b.add('box', 0xf4f1ea, [x, y - s * 0.38, z], [s * 0.55, s * 0.26, thick * 0.9]);
  for (const sd of [-1, 1]) for (const ex of [-0.22, 0.22]) b.add('sphLo', 0x141414, [x + ex * s, y + s * 0.1, z + sd * thick * 0.42], [s * 0.26, s * 0.26, thick * 0.3]);
}
function jollyRoger(b, x, top, w, h) {
  const fx = x - w / 2 - 0.06, fy = top - h / 2;
  b.add('box', 0x141418, [fx, fy, 0], [w, h, 0.06]);
  skull(b, fx, fy + h * 0.04, 0, h * 0.42, 0.12);
}

// Turret meshes: built pointing +x, pivot at the base centre.
function turretGeo(kind) {
  const b = new Builder();
  if (kind === 'small') {
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.25, 0.35);
    b.add('rbox', PAL.steel, [0.05, 0.65, 0], [1.25, 0.6, 1.05]);
    b.add('cyl8', PAL.gun, [1.1, 0.68, 0], [0.24, 1.5, 0.24], [0, 0, -Math.PI / 2]);
  } else if (kind === 'gb1' || kind === 'gb2') { // gunboat: one barrel, then two
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.55, 0.38);
    b.add('rbox', PAL.steel, [0.05, 0.75, 0], [1.45, 0.78, kind === 'gb2' ? 1.5 : 1.3]);
    for (const z of kind === 'gb2' ? [-0.33, 0.33] : [0]) {
      b.add('cyl8', PAL.gun, [1.5, 0.78, z], [0.3, 1.75, 0.3], [0, 0, -Math.PI / 2]);
      b.add('cyl8', PAL.gun, [2.3, 0.78, z], [0.4, 0.22, 0.4], [0, 0, -Math.PI / 2]);
    }
  } else if (kind === 'gb3') { // gatling: six barrels, gold collar
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.65, 0.38);
    b.add('rbox', PAL.steel, [-0.05, 0.8, 0], [1.3, 0.9, 1.45]);
    b.add('cyl', GOLD, [0.82, 0.82, 0], [1.2, 0.32, 1.2], [0, 0, -Math.PI / 2]);
    b.add('cyl', PAL.steelD, [1.0, 0.82, 0], [0.8, 0.2, 0.8], [0, 0, -Math.PI / 2]);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; b.add('cyl8', PAL.gun, [1.75, 0.82 + Math.sin(a) * 0.27, Math.cos(a) * 0.27], [0.2, 1.5, 0.2], [0, 0, -Math.PI / 2]); }
    b.add('cyl', PAL.steel, [2.42, 0.82, 0], [0.86, 0.16, 0.86], [0, 0, -Math.PI / 2]);
    b.add('cyl', GOLD, [2.52, 0.82, 0], [0.34, 0.06, 0.34], [0, 0, -Math.PI / 2]);
  } else if (kind === 'twin' || kind === 'ddtwin') {
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.9, 0.4);
    b.add('rbox', PAL.steel, [0, 0.8, 0], [1.9, 0.8, 1.6]);
    if (kind === 'ddtwin') b.add('box', GOLD, [0, 0.62, 0], [1.96, 0.16, 1.66]);
    for (const z of [-0.36, 0.36]) b.add('cyl8', PAL.gun, [1.55, 0.85, z], [0.26, 2.1, 0.26], [0, 0, -Math.PI / 2]);
  } else if (kind === 'dd1') { // destroyer main gun, one long barrel
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.9, 0.4);
    b.add('rbox2', PAL.steel, [0, 0.85, 0], [1.9, 0.9, 1.6]);
    b.add('cyl8', PAL.gun, [1.75, 0.88, 0], [0.38, 2.3, 0.38], [0, 0, -Math.PI / 2]);
    b.add('cyl8', PAL.gun, [2.85, 0.88, 0], [0.5, 0.26, 0.5], [0, 0, -Math.PI / 2]);
  } else if (kind === 'torp' || kind === 'tp3') { // torpedo tubes: two, then three
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.15, 0.28);
    const zs = kind === 'tp3' ? [-0.5, 0, 0.5] : [-0.3, 0.3];
    b.add('rbox', PAL.steelD, [-0.45, 0.42, 0], [0.5, 0.36, zs.length * 0.5 + 0.3]);
    for (const z of zs) {
      b.add('cyl8', 0xb7bfcc, [0.35, 0.62, z], [0.46, 2.8, 0.46], [0, 0, -Math.PI / 2]);
      b.add('cyl8', PAL.gun, [1.77, 0.62, z], [0.36, 0.06, 0.36], [0, 0, -Math.PI / 2]);
    }
  } else if (kind === 'rocket') { // tier-3 torpedo boat: six-round rocket pod
    b.cylOn('cyl8', PAL.steelD, 0, 0, 0, 1.25, 0.3);
    b.add('rbox', PAL.steel, [0.0, 0.95, 0], [1.4, 1.15, 1.6]);
    b.add('box', GOLD, [0.0, 0.42, 0], [1.46, 0.14, 1.66]);
    b.add('box', 0x3a3f4a, [0.71, 0.95, 0], [0.06, 0.95, 1.4]);
    for (const y of [0.72, 1.18]) for (const z of [-0.46, 0, 0.46]) b.add('sphLo', PAL.red, [0.86, y, z], [0.44, 0.44, 0.44]);
  } else if (kind === 'cannon') { // pirate cannon on a wooden carriage
    b.add('rbox', PAL.woodD, [0, 0.25, 0], [1.2, 0.5, 1.0]);
    b.add('cyl8', PAL.black, [0.6, 0.7, 0], [0.42, 1.6, 0.42], [0, 0, -Math.PI / 2 - 0.12]);
    b.add('cyl8', PAL.black, [1.38, 0.8, 0], [0.55, 0.18, 0.55], [0, 0, -Math.PI / 2 - 0.12]);
  } else if (kind === 'pcannon') { // pirate tier 2: a grey deck cannon on a steel mount
    b.cylOn('cyl8', 0x3a3d45, 0, 0, 0, 1.4, 0.32);
    b.add('rbox', 0x6d727c, [-0.05, 0.62, 0], [1.1, 0.62, 1.15]);
    b.add('cyl8', 0x4a4f5a, [0.95, 0.82, 0], [0.62, 1.9, 0.62], [0, 0, -Math.PI / 2 - 0.08]);
    b.add('cyl8', 0x2e3138, [1.9, 0.9, 0], [0.78, 0.24, 0.78], [0, 0, -Math.PI / 2 - 0.08]);
  } else if (kind === 'pturret') { // pirate tier 3: a heavy rounded grey turret with a short thick barrel
    b.cylOn('cyl8', 0x2e3138, 0, 0, 0, 2.2, 0.4);
    b.add('rbox2', 0x6d727c, [0, 0.95, 0], [2.0, 1.15, 1.85]);
    b.add('box', 0xa3362b, [0, 0.62, 0], [2.06, 0.18, 1.9]);
    b.add('cyl8', 0x4a4f5a, [1.55, 1.0, 0], [0.8, 1.7, 0.8], [0, 0, -Math.PI / 2]);
    b.add('cyl8', 0x2e3138, [2.45, 1.0, 0], [0.98, 0.3, 0.98], [0, 0, -Math.PI / 2]);
  } else if (kind === 'redtwin') {
    b.cylOn('cyl8', 0x3a3d45, 0, 0, 0, 1.8, 0.4);
    b.add('rbox', 0x8f2b27, [0, 0.8, 0], [1.8, 0.8, 1.5]);
    for (const z of [-0.33, 0.33]) b.add('cyl8', PAL.black, [1.45, 0.85, z], [0.26, 1.9, 0.26], [0, 0, -Math.PI / 2]);
  } else if (kind === 'boss') {
    b.cylOn('cyl8', 0x2e3138, 0, 0, 0, 3.4, 0.6);
    b.add('rbox2', 0x4a4f5a, [0, 1.25, 0], [3.4, 1.4, 3.0]);
    b.add('box', PAL.red, [0, 1.25, 0], [3.46, 0.25, 3.06]);
    for (const z of [-0.65, 0.65]) b.add('cyl8', 0x24262d, [2.7, 1.35, z], [0.45, 3.6, 0.45], [0, 0, -Math.PI / 2]);
  } else if (kind === 'shore') {
    b.cylOn('cyl', PAL.steelD, 0, 0, 0, 3.0, 0.5);
    b.add('rbox2', PAL.steel, [-0.2, 1.3, 0], [3.0, 1.6, 2.6]);
    b.add('box', PAL.navy, [-0.2, 1.3, 0], [3.06, 0.3, 2.66]);
    for (const z of [-0.5, 0.5]) b.add('cyl8', PAL.gun, [1.9, 1.45, z], [0.36, 3.0, 0.36], [0, 0, -Math.PI / 2]);
  }
  return b.build();
}

// White cabin with a front window, side windows (aft part, so a tier-3 star fits forward) and a light roof.
function cabin(b, x, y, L, H, W, tier) {
  b.boxOn('rbox', CAB, x, y, 0, L, H, W);
  b.add('box', PAL.glassD, [x + L / 2 + 0.02, y + H * 0.68, 0], [0.06, H * 0.3, W * 0.76]);
  for (const sd of [-1, 1]) b.add('box', PAL.glassD, [x - L * 0.18, y + H * 0.68, sd * (W / 2 + 0.01)], [L * 0.5, H * 0.26, 0.05]);
  b.boxOn('rbox', tier === 2 ? LB : CABR, x, y + H, 0, L + 0.12, 0.16, W + 0.12);
  if (tier >= 2) b.add('box', tier >= 3 ? GOLD : LB, [x, y + H * 0.9, 0], [L + 0.05, 0.15, W + 0.05]);
  if (tier >= 3) b.addGeo(starGeo(Math.min(L, W) * 0.3, 0.08, GOLD), [x + L * 0.2, y + H + 0.18, 0], [-Math.PI / 2, 0, -Math.PI / 2]);
}

// Boat definitions: hull geometry, deck props, turrets (position and kind), funnels (for smoke), size.
function boatSpec(key, tier) {
  const b = new Builder();
  let hull, turrets = [], funnels = [], len, beam;
  const band = tier >= 2 ? { band: [5, LB] } : {}, hc = { ...OURS, stripe: [PAL.white, LB, GOLD][tier - 1] };
  if (key === 'gunboat') {
    len = 8; beam = 3.3;
    hull = hullGeo(8, 3.3, 1.9, 0.7, hc, { sheer: 0.45, steps: 8, ...band });
    const d = 1.2;
    cabin(b, -0.7, d, 2.4, 1.35, 2.2, tier);
    b.boxOn('rbox', PAL.steelD, -2.75, d, 0, 0.9, 0.3, 1.1);
    for (const z of [-1.05, 1.05]) b.cylOn('cyl8', PAL.steel, -3.55, d, z, 0.26, 0.42);
    navyFlag(b, -3.35, d, 2.7, tier);
    if (tier >= 2) radar(b, -1.0, d + 1.5, tier);
    if (tier >= 3) { cabinStars(b, 0.05, d + 0.8, 1.1); goldArmour(b, [-2.7, -1.25, 0.2], 0.85, 1.86, 1.15, 0.52, -4.2, 2.4); b.add('rbox', GOLD, [4.05, 1.15, 0], [0.45, 0.6, 0.6]); }
    turrets.push({ kind: ['gb1', 'gb2', 'gb3'][tier - 1], at: [2.05, d + 0.08, 0] });
  } else if (key === 'torpedo') {
    len = 7.5; beam = 2.8;
    hull = hullGeo(7.5, 2.8, 1.55, 0.55, hc, { sheer: 0.35, shoulder: 0.05, steps: 8, ...band });
    const d = 1.0;
    cabin(b, -1.55, d, 2.2, 1.15, 1.85, tier);
    navyFlag(b, -3.15, d, 2.5, tier);
    if (tier >= 2) radar(b, -1.85, d + 1.3, tier, 1.2);
    if (tier >= 3) { cabinStars(b, -0.85, d + 0.68, 0.925, 0.32); goldArmour(b, [-2.4, -1.0, 0.4], 0.62, 1.56, 1.05, 0.42, -3.92, 2.0); }
    turrets.push({ kind: ['torp', 'tp3', 'rocket'][tier - 1], at: [1.15, d + 0.05, 0] });
  } else if (key === 'destroyer') {
    len = 13; beam = 4.0;
    hull = hullGeo(13, 4.0, 2.3, 0.8, hc, { sheer: 0.7, steps: 8, ...band });
    const d = 1.5;
    b.boxOn('rbox', CAB, -1.4, d, 0, 4.6, 1.3, 2.7);
    cabin(b, -0.8, d + 1.3, 2.8, 1.15, 2.2, tier);
    b.cylOn('cyl8', PAL.steelD, -1.5, d + 2.6, 0, 0.18, 2.4);
    b.add('sphLo', PAL.steel, [-1.5, d + 5.05, 0], [0.32, 0.32, 0.32]);
    if (tier >= 2) b.add('box', PAL.steelD, [-1.5, d + 4.4, 0], [0.12, 0.12, 1.8]);
    radar(b, -1.5, d + 3.3, tier, tier >= 2 ? 1.6 : 1.1);
    // funnel: slim at tier 1, fat with a black cap from tier 2
    const fd = tier >= 2 ? 1.5 : 1.0, fh = tier >= 2 ? 2.9 : 2.2;
    b.cylOn('cyl', 0xbfc6d0, -3.7, d, 0, fd, fh, fd * 0.9);
    b.cylOn('cyl', PAL.black, -3.7, d + fh, 0, fd + 0.04, 0.32, fd * 0.9 + 0.04);
    funnels.push([-3.7, d + fh + 0.4, 0]);
    if (tier >= 2) for (const sd of [-1, 1]) b.add('box', PAL.steel, [-1.2, d + 0.45, sd * 1.82], [8.0, 0.08, 0.08]);
    navyFlag(b, -5.7, d, 2.4, tier);
    if (tier >= 3) {
      cabinStars(b, 0.1, d + 2.0, 1.1, 0.36);
      goldArmour(b, [-4.6, -2.6, -0.6, 1.4], 1.15, 2.2, 1.3, 0.6, -6.7, 3.0);
      b.add('rbox', GOLD, [6.6, 1.5, 0], [0.55, 0.7, 0.7]);
      for (const sd of [-1, 1]) { // rocket boxes beside the bridge, four red warheads each
        b.boxOn('rbox', PAL.steel, 1.45, d, sd * 1.25, 1.0, 1.0, 0.95);
        for (const y of [0.3, 0.7]) for (const z of [-0.2, 0.2]) b.add('sphLo', PAL.red, [2.05, d + y, sd * 1.25 + z], [0.4, 0.4, 0.4]);
      }
    }
    turrets.push({ kind: tier >= 3 ? 'ddtwin' : 'dd1', at: [3.75, d, 0] });
    if (tier >= 2) turrets.push({ kind: 'small', at: [-5.0, d, 0] });
  } else if (key === 'raider' && tier === 2) {
    // r5 pirate tier 2 (round-3 raider sheet, top middle): riveted grey armour on the red hull, a steel ram spike,
    // a small red wheelhouse with windows, an exhaust pipe, a black sail with the skull and a bigger grey deck cannon
    len = 8.2; beam = 3.2;
    hull = hullGeo(8.2, 3.2, 1.8, 0.65, RUST, { sheer: 0.6, sternRound: 0.55, steps: 6, band: [2, 0x2a2a30] });
    const d = 1.1, ARM = 0x6d727c, RIV = 0x3a3d45;
    b.add('cone', 0xa9afb8, [4.75, 0.85, 0], [0.8, 1.5, 0.8], [0, 0, -Math.PI / 2]);
    b.add('rbox', ARM, [3.75, 0.9, 0], [0.7, 1.0, 1.5]);
    for (const sd of [-1, 1]) for (const [x, z] of [[-2.7, 1.6], [-1.1, 1.62], [0.5, 1.6], [2.1, 1.38]]) {
      b.add('rbox', ARM, [x, 1.0, sd * z], [1.05, 0.72, 0.14]);
      for (const rx of [-0.32, 0.32]) b.add('sphLo', RIV, [x + rx, 1.18, sd * (z + 0.08)], [0.16, 0.16, 0.12]);
    }
    b.boxOn('rbox', 0xb83f2a, -2.3, d, 0, 1.6, 1.15, 1.9);
    for (const sd of [-1, 1]) b.add('box', 0x2a2f3a, [-2.15, d + 0.72, sd * 0.96], [1.0, 0.32, 0.05]);
    b.add('box', 0x2a2f3a, [-1.49, d + 0.72, 0], [0.05, 0.32, 1.3]);
    b.boxOn('rbox', RIV, -2.3, d + 1.15, 0, 1.75, 0.14, 2.05);
    b.cylOn('cyl', 0x5d6778, -3.35, d, 0.85, 0.5, 2.0); b.cylOn('cyl', 0x2e3138, -3.35, d + 2.0, 0.85, 0.56, 0.2);
    funnels.push([-3.35, d + 2.4, 0.85]);
    b.cylOn('cyl8', PAL.woodD, -0.3, d, 0, 0.26, 6.3);
    b.addGeo(triGeo([0, 0], [0, 3.9], [-2.7, 0.3], 0.08, 0x1c1c22), [-0.28, d + 1.5, 0]);
    skull(b, -1.15, d + 2.7, 0, 1.0);
    jollyRoger(b, -0.3, d + 6.25, 1.35, 0.9);
    turrets.push({ kind: 'pcannon', at: [2.15, d, 0] });
  } else if (key === 'raider' && tier >= 3) {
    // r5 pirate tier 3 (sheet, top right): bigger, two black-sailed masts, raised red bulwarks with grey corner blocks,
    // grey armour plates, a dark riveted lower hull and a heavy grey turret
    len = 10; beam = 3.8;
    hull = hullGeo(10, 3.8, 2.1, 0.7, RUST, { sheer: 0.55, sternRound: 0.6, steps: 6, band: [2, 0x2a2a30] });
    const d = 1.4, ARM = 0x6d727c, RIV = 0x3a3d45;
    for (const sd of [-1, 1]) {
      for (let x = -4.2; x <= 1.8; x += 1.0) b.add('sphLo', 0x8b96a8, [x, 0.42, sd * 1.72], [0.2, 0.2, 0.14]);
      for (const [x, z] of [[-3.6, 1.95], [-1.9, 1.97], [-0.2, 1.97], [1.5, 1.88]]) {
        b.add('rbox', ARM, [x, 1.15, sd * z], [1.15, 0.8, 0.14]);
        for (const rx of [-0.36, 0.36]) b.add('sphLo', RIV, [x + rx, 1.35, sd * (z + 0.08)], [0.17, 0.17, 0.12]);
      }
      b.add('rbox', 0xa3362b, [-1.4, d + 0.32, sd * 1.72], [6.4, 0.64, 0.2]);
      b.add('rbox', ARM, [-4.55, d + 0.42, sd * 1.5], [0.62, 0.84, 0.62]);
      b.add('rbox', ARM, [1.9, d + 0.42, sd * 1.62], [0.62, 0.84, 0.62]);
    }
    b.add('rbox', 0xa3362b, [-4.75, d + 0.32, 0], [0.2, 0.64, 2.6]);
    b.add('rbox', ARM, [4.55, 1.05, 0], [0.8, 1.1, 1.3]);
    b.cylOn('cyl', 0x5d6778, -4.1, d, 1.05, 0.5, 2.0); b.cylOn('cyl', 0x2e3138, -4.1, d + 2.0, 1.05, 0.56, 0.2);
    funnels.push([-4.1, d + 2.4, 1.05]);
    b.cylOn('cyl8', PAL.woodD, 0.6, d, 0, 0.26, 5.6);
    b.addGeo(triGeo([0, 0], [0, 3.3], [-2.3, 0.3], 0.08, 0x1c1c22), [0.62, d + 1.6, 0]);
    b.add('sphLo', PAL.woodD, [0.6, d + 5.7, 0], [0.4, 0.4, 0.4]);
    b.cylOn('cyl8', PAL.woodD, -2.2, d, 0, 0.3, 7.0);
    b.addGeo(triGeo([0, 0], [0, 4.3], [-3.0, 0.3], 0.08, 0x1c1c22), [-2.18, d + 1.9, 0]);
    skull(b, -3.15, d + 3.3, 0, 1.1);
    jollyRoger(b, -2.2, d + 6.95, 1.5, 1.0);
    turrets.push({ kind: 'pturret', at: [2.7, d, 0] });
  } else if (key === 'raider') {
    len = 7; beam = 2.8;
    hull = hullGeo(7, 2.8, 1.6, 0.6, RUST, { sheer: 0.6, sternRound: 0.6 });
    const d = 1.0;
    b.cylOn('cyl8', PAL.woodD, 0.0, d, 0, 0.24, 5.9);
    b.addGeo(triGeo([0, 0], [0, 3.6], [-2.6, 0.3], 0.08, 0x1c1c22), [0.02, d + 1.2, 0]);
    skull(b, -0.85, d + 2.3, 0, 0.95);
    jollyRoger(b, 0.0, d + 5.85, 1.3, 0.85);
    b.boxOn('rbox', 0x3a2a24, -2.3, d, 0, 1.4, 0.7, 1.7);
    for (const z of [-0.7, 0.7]) b.add('cyl8', 0x7d5030, [-1.0, d + 0.3, z], [0.6, 0.6, 0.6]);
    turrets.push({ kind: 'cannon', at: [2.0, d, 0] });
  } else if (key === 'gunship') {
    len = 9.5; beam = 3.5;
    hull = hullGeo(9.5, 3.5, 2.0, 0.7, { ...RUST, hull: 0xa3362b, deck: 0x4a3a35 }, { sheer: 0.5 });
    const d = 1.3;
    b.add('cone', 0xa9afb8, [5.15, 0.95, 0], [0.8, 1.5, 0.8], [0, 0, -Math.PI / 2]); // ram spike
    for (const sd of [-1, 1]) for (const x of [-3.0, -1.4, 0.2]) b.add('rbox', 0x6d727c, [x, 0.85, sd * 1.97], [1.35, 0.72, 0.12]);
    b.boxOn('rbox', 0x3a3d45, -1.3, d, 0, 2.8, 1.4, 2.3);
    b.boxOn('rbox', PAL.red, -1.3, d + 1.4, 0, 3.0, 0.2, 2.45);
    b.add('box', 0xffb36b, [0.12, d + 0.95, 0], [0.06, 0.32, 1.7]);
    b.cylOn('cyl', 0x2e3138, -3.4, d, 0, 0.95, 1.9);
    b.cylOn('cyl', PAL.red, -3.4, d + 1.4, 0, 1.0, 0.3);
    funnels.push([-3.4, d + 2.0, 0]);
    b.cylOn('cyl8', PAL.woodD, -1.0, d + 1.6, 0, 0.2, 4.6);
    b.addGeo(triGeo([0, 0], [0, 2.9], [-2.4, 0.3], 0.08, 0x1c1c22), [-0.98, d + 2.0, 0]);
    skull(b, -1.75, d + 2.95, 0, 0.8);
    jollyRoger(b, -1.0, d + 6.15, 1.2, 0.8);
    turrets.push({ kind: 'redtwin', at: [2.6, d, 0] });
  } else if (key === 'boss') {
    len = 22; beam = 7;
    hull = hullGeo(22, 7, 3.8, 1.2, { hull: 0x474c57, bottom: 0x23252b, stripe: 0xc23b30, deck: 0x5b606b }, { sheer: 1.1, shoulder: 0.1 });
    const d = 2.6;
    // shark mouth on both sides of the bow: red gum line and white teeth
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const x = 6.2 + i * 0.85, zz = sd * (3.0 - Math.pow((x - 5) / 6.3, 2) * 3.0 + 0.25);
        b.addGeo(triGeo([-0.32, 0], [0.32, 0], [0, -0.85], 0.12, 0xffffff), [x, 1.9, zz], [0, sd > 0 ? 0 : Math.PI, 0]);
      }
      b.add('sph', 0xff3b2e, [8.6, 2.6, sd * 2.25], [0.7, 0.7, 0.5]);
    }
    b.boxOn('rbox2', 0x3d414b, -2.5, d, 0, 8.5, 2.6, 4.6);
    b.boxOn('rbox2', 0x3d414b, -2.0, d + 2.6, 0, 5.0, 2.0, 3.6);
    b.add('box', 0xffb36b, [0.52, d + 3.7, 0], [0.08, 0.5, 3.0]);
    b.boxOn('rbox', PAL.red, -2.0, d + 4.6, 0, 5.2, 0.3, 3.8);
    for (const x of [-5.2, -7.0]) { b.cylOn('cyl', 0x24262d, x, d + 2.6, 0, 1.5, 3.0); b.cylOn('cyl', PAL.red, x, d + 4.2, 0, 1.55, 0.5); funnels.push([x, d + 5.8, 0]); }
    b.cylOn('cyl8', PAL.steelD, -1.4, d + 4.9, 0, 0.25, 4.6);
    jollyRoger(b, -1.4, d + 9.4, 3.0, 1.9);
    turrets.push({ kind: 'boss', at: [6.0, d, 0] }, { kind: 'boss', at: [-9.0, d, 0] });
  }
  b.addGeo(hull);
  return { geo: b.build(), turrets, funnels, len, beam };
}

const BOATS = {};
const TURRETS = {};
export function boatModel(key, tier = 1) {
  const u7 = unit7(key, tier); if (u7) return u7;
  const ck = key + ':' + tier;
  if (!BOATS[ck]) BOATS[ck] = boatSpec(key, tier);
  const spec = BOATS[ck], sc = UNIT_SCALE[key] || 1;
  const g = new THREE.Group();
  const roll = new THREE.Group(); roll.scale.setScalar(sc); g.add(roll);
  const hull = solidMesh(spec.geo); roll.add(hull);
  const turrets = spec.turrets.map(t => {
    if (!TURRETS[t.kind]) TURRETS[t.kind] = turretGeo(t.kind);
    const m = solidMesh(TURRETS[t.kind]); m.position.set(...t.at); roll.add(m);
    if (t.at[0] < 0) m.rotation.y = Math.PI; // rear turret faces aft at rest
    m.userData.rest = m.rotation.y;
    return m;
  });
  g.userData = { roll, hull, turrets, funnels: spec.funnels, len: spec.len * sc, beam: spec.beam * sc, tier };
  return g;
}

// ---------------------------------------------------------------- buildings
// Quonset hangar along z, door at -z. Local origin at floor centre.
function hangar(b, w, d, h, roof, rib, accent) {
  b.boxOn('rbox', PAL.quayD, 0, 0, 0, w + 1.2, 0.35, d + 1.2);
  b.add('hcyl', roof, [0, 0.3, 0], [w, h * 2, d]);
  for (const z of [-d / 2 + 0.9, -d / 6, d / 6, d / 2 - 0.9]) b.add('hcyl', rib, [0, 0.3, z], [w + 0.3, h * 2 + 0.3, 0.5]);
  b.add('hcyl', PAL.wall, [0, 0.3, -d / 2 - 0.1], [w - 0.6, h * 2 - 0.6, 0.4]);
  b.add('hcyl', PAL.wall, [0, 0.3, d / 2 + 0.1], [w - 0.6, h * 2 - 0.6, 0.4]);
  b.boxOn('box', 0x3c4556, 0, 0.3, -d / 2 - 0.35, w * 0.52, h * 0.66, 0.3);
  for (let i = 1; i < 6; i++) b.add('box', 0x515c70, [0, 0.3 + h * 0.66 * i / 6, -d / 2 - 0.52], [w * 0.52, 0.08, 0.06]);
  b.boxOn('box', PAL.yellow, -w * 0.28, 0.3, -d / 2 - 0.4, 0.35, h * 0.68, 0.4);
  b.boxOn('box', PAL.yellow, w * 0.28, 0.3, -d / 2 - 0.4, 0.35, h * 0.68, 0.4);
  b.add('cyl', accent, [0, 0.3 + h * 0.82, -d / 2 - 0.35], [1.6, 0.25, 1.6], [Math.PI / 2, 0, 0]);
  b.add('cyl', PAL.white, [0, 0.3 + h * 0.82, -d / 2 - 0.5], [0.9, 0.12, 0.9], [Math.PI / 2, 0, 0]);
  // side annex with a flat roof
  b.boxOn('rbox', PAL.wall, w / 2 + 1.6, 0.3, d * 0.18, 3.2, 2.6, d * 0.42);
  b.boxOn('rbox', roof, w / 2 + 1.6, 2.9, d * 0.18, 3.5, 0.3, d * 0.46);
  b.add('box', PAL.glassD, [w / 2 + 3.22, 1.8, d * 0.18], [0.06, 0.7, d * 0.3]);
}
function slipway(b, len, wid) { // concrete ramp going down from the quay top into the sea along -z, local origin at the top end
  const drop = Y0 + 1.2, ang = Math.atan2(drop, len);
  const L = Math.hypot(drop, len);
  b.add('box', 0xb8b3a8, [0, Y0 - drop / 2 - 0.3, -len / 2], [wid, 0.6, L], [-ang, 0, 0]);
  for (const x of [-wid * 0.25, wid * 0.25]) b.add('box', 0x5d6470, [x, Y0 - drop / 2 + 0.05, -len / 2], [0.3, 0.2, L], [-ang, 0, 0]);
  for (const x of [-wid / 2, wid / 2]) b.add('box', PAL.yellow, [x, Y0 - drop / 2 - 0.05, -len / 2], [0.35, 0.5, L], [-ang, 0, 0]);
}
function gantry(b, x, z, span, h) { // yellow crane straddling a slip, legs at x +- span/2
  for (const sx of [-span / 2, span / 2]) for (const sz of [-1.6, 1.6]) b.boxOn('box', PAL.yellow, x + sx, Y0, z + sz, 0.6, h, 0.6);
  for (const sx of [-span / 2, span / 2]) b.add('box', PAL.yellow, [x + sx, Y0 + h - 0.3, z], [0.7, 0.6, 3.8]);
  b.add('box', PAL.yellow, [x, Y0 + h + 0.2, z - 1.6], [span + 0.8, 0.8, 0.7]);
  b.add('box', PAL.yellow, [x, Y0 + h + 0.2, z + 1.6], [span + 0.8, 0.8, 0.7]);
  b.boxOn('rbox', 0x3c4556, x + span * 0.15, Y0 + h - 0.6, z, 1.6, 1.4, 3.6);
  b.add('cyl8', 0x24262d, [x + span * 0.15, Y0 + h - 2.4, z], [0.08, 3.2, 0.08]);
  b.add('box', PAL.red, [x + span * 0.15, Y0 + h - 4.1, z], [0.6, 0.4, 0.6]);
}

export function shedModel(slot) {
  const S3 = SHEDS3D[slot], b = new Builder();
  const big = slot === 'W2';
  const L = slot === 'S1' ? { w: S3.d, d: S3.w } : { w: S3.w, d: S3.d }; // local w across the door, d deep
  // P2E notes: the Destroyer Shed (W2) was a second blue next to the Gunboat Shed; it is battleship grey with a yellow trim now
  const roof = slot === 'W1' ? 0x3e86e6 : slot === 'S1' ? 0x2fa7a0 : 0x8e9aa6;
  const rib = slot === 'W1' ? 0x2c66b8 : slot === 'S1' ? 0x23827d : 0x6a7682;
  hangar(b, L.w - 2.4, L.d - 2.2, big ? 8.4 : 7.0, roof, rib, slot === 'W1' ? PAL.red : PAL.yellow);
  const g = new THREE.Group();
  const m = solidMesh(b.build()); g.add(m);
  g.position.set(S3.at[0], Y0, S3.at[1]);
  g.rotation.y = S3.face === 'e' ? -Math.PI / 2 : 0;
  return g;
}
// Slipway and launch apron from the shed door into the sea (drawn when the shed is built).
export function slipModel(slot) {
  const S3 = SHEDS3D[slot], b = new Builder(), sl = SLIPS[slot];
  const g = new THREE.Group();
  if (S3.face === 'n') {
    const doorZ = S3.at[1] - S3.d / 2, edge = BASE.z0;
    b.add('box', 0xc9c3b6, [0, Y0 + 0.03, (doorZ + edge) / 2 - S3.at[1]], [7, 0.1, doorZ - edge]);
    g.add(solidMesh(b.build(), MAT.solid, false)); g.position.set(S3.at[0], 0, S3.at[1]);
    const r = new Builder(); slipway(r, Math.abs(sl[1] - edge) - 1, 6.4);
    const rm = solidMesh(r.build(), MAT.solid, false); rm.position.set(0, 0, edge - S3.at[1]); g.add(rm);
    if (slot === 'W2') { const c = new Builder(); gantry(c, 0, edge - S3.at[1] + 1.8, 9.4, 9.5); g.add(solidMesh(c.build())); }
  } else {
    const doorX = S3.at[0] + S3.w / 2, edge = BASE.x1;
    b.add('box', 0xc9c3b6, [(doorX + edge) / 2 - S3.at[0], Y0 + 0.03, 0], [edge - doorX, 0.1, 7]);
    g.add(solidMesh(b.build(), MAT.solid, false)); g.position.set(S3.at[0], 0, S3.at[1]);
    const r = new Builder(); slipway(r, Math.abs(sl[0] - edge) - 1, 6.4);
    const rm = solidMesh(r.build(), MAT.solid, false); rm.rotation.y = -Math.PI / 2; rm.position.set(edge - S3.at[0], 0, 0); g.add(rm);
  }
  return g;
}

// Dashed yellow outline of an empty building plot (sits on the quay or floats on the water).
export function plotModel(w, d, y) {
  const b = new Builder(), dash = 2.2, gap = 1.3, t = 0.55;
  const edge = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor((L + gap) / (dash + gap)), ang = Math.atan2(z1 - z0, x1 - x0);
    const used = n * dash + (n - 1) * gap, off = (L - used) / 2;
    for (let i = 0; i < n; i++) {
      const s = off + i * (dash + gap) + dash / 2, x = x0 + Math.cos(ang) * s, z = z0 + Math.sin(ang) * s;
      b.add('box', PAL.yellow, [x, y, z], [dash, 0.12, t], [0, -ang, 0]);
    }
  };
  edge(-w / 2, -d / 2, w / 2, -d / 2); edge(w / 2, -d / 2, w / 2, d / 2); edge(w / 2, d / 2, -w / 2, d / 2); edge(-w / 2, d / 2, -w / 2, -d / 2);
  const g = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true, opacity: 0.16, depthWrite: false }));
  fill.position.y = y - 0.02; g.add(fill);
  g.add(solidMesh(b.build(), MAT.glow, false));
  return g;
}

// Harbor HQ, three levels (Top Force Military Base grows wings, then a tower). Returns a group with a spinning radar.
export function hqModel(lv) {
  const b = new Builder(), g = new THREE.Group();
  b.boxOn('rbox', PAL.quayD, 0, 0, 0, 17, 0.4, 14);
  b.boxOn('rbox', PAL.wall, 0, 0.3, 0, 14, 5.2, 11);
  b.boxOn('rbox', PAL.navy, 0, 5.4, 0, 14.6, 0.5, 11.6);
  b.boxOn('box', PAL.blue, 0, 5.9, 0, 13.2, 0.35, 10.2);
  for (const y of [1.4, 3.6]) {
    b.add('box', PAL.glassD, [-7.02, y + 0.3, 0], [0.06, 1.0, 9.0]);
    b.add('box', PAL.glassD, [0, y + 0.3, 5.52], [12, 1.0, 0.06]);
  }
  b.boxOn('box', 0x3c4556, 2.5, 0.3, 5.56, 3.0, 2.6, 0.12);
  b.boxOn('rbox', PAL.navy, 2.5, 3.0, 6.3, 4.2, 0.3, 1.8);
  b.boxOn('box', PAL.steelD, 2.5, 3.3, 5.6, 4.0, 0.9, 0.12);
  b.add('box', PAL.yellow, [2.5, 3.75, 5.7], [3.2, 0.5, 0.06]);
  // flagpole
  b.cylOn('cyl8', 0xdfe3ea, -5.5, 6.25, 3.5, 0.2, 6.5);
  b.add('sph', PAL.gold, [-5.5, 12.85, 3.5], [0.45, 0.45, 0.45]);
  if (lv >= 2) {
    b.boxOn('rbox', PAL.wall, 7.4, 0.3, -1.0, 5.2, 4.0, 9);
    b.boxOn('rbox', PAL.navy, 7.4, 4.2, -1.0, 5.8, 0.45, 9.6);
    b.add('box', PAL.glassD, [7.4, 2.6, 3.52], [4.4, 0.9, 0.06]);
    b.boxOn('rbox', PAL.steel, 3, 6.25, -2, 2.6, 1.2, 2.6);
    for (let i = 0; i < 3; i++) b.boxOn('box', PAL.steelD, 6.2 + i * 1.3, 4.65, -3.5, 0.5, 1.2, 0.5);
  }
  if (lv >= 3) {
    b.boxOn('rbox', PAL.quayD, -4.5, 0, -8.6, 7, 0.4, 5);
    b.cylOn('cyl', PAL.wall, -4.5, 0.3, -8.6, 4.2, 13.5);
    b.cylOn('cyl', PAL.glassD, -4.5, 13.8, -8.6, 5.0, 1.8);
    b.cylOn('cyl', PAL.navy, -4.5, 15.6, -8.6, 5.6, 0.6);
    for (let i = 0; i < 4; i++) b.add('box', PAL.glassD, [-4.5 - 2.12, 3 + i * 2.8, -8.6], [0.06, 1.1, 1.4]);
    // helipad on the west lawn
    b.cylOn('cyl', 0x5d6470, -13, 0, 2, 8, 0.4);
    b.cylOn('cyl', PAL.yellow, -13, 0.2, 2, 7.2, 0.25);
    b.cylOn('cyl', 0x5d6470, -13, 0.25, 2, 6.6, 0.25);
    b.boxOn('box', PAL.white, -13, 0.32, 0.8, 3.2, 0.1, 0.5); b.boxOn('box', PAL.white, -13, 0.32, 3.2, 3.2, 0.1, 0.5); b.boxOn('box', PAL.white, -13, 0.32, 2, 0.5, 0.1, 2.4);
  }
  g.add(solidMesh(b.build()));
  // flag and radar animate
  const flag = solidMesh(paint(new THREE.PlaneGeometry(2.8, 1.7, 6, 1).toNonIndexed(), PAL.blue), MAT.solid, false);
  flag.material = new THREE.MeshLambertMaterial({ color: 0x3e86e6, side: THREE.DoubleSide });
  flag.geometry.translate(1.4, 0, 0); flag.position.set(-5.5, 11.9, 3.5); g.add(flag);
  g.userData.flag = flag;
  if (lv >= 2) {
    const r = new Builder();
    r.cylOn('cyl8', PAL.steelD, 0, 0, 0, 0.4, 1.4);
    r.add('dome', 0xf2f4f8, [0, 1.8, 0], [3.2, 1.2, 3.2], [Math.PI / 2 + 0.5, 0, 0]);
    r.add('sph', PAL.red, [0, 1.9, -0.5], [0.4, 0.4, 0.4]);
    const radar = solidMesh(r.build()); radar.position.set(lv >= 3 ? -4.5 : 3, lv >= 3 ? 16.2 : 7.45, lv >= 3 ? -8.6 : -2); g.add(radar);
    g.userData.radar = radar;
  }
  g.position.set(HQ_AT[0], Y0, HQ_AT[1]);
  return g;
}

export function shoreGunModel() {
  const g = new THREE.Group(), b = new Builder();
  b.cylOn('cyl', 0xbfb8aa, 0, 0, 0, 7, 1.2);
  b.cylOn('cyl', PAL.yellow, 0, 1.2, 0, 6.6, 0.15);
  g.add(solidMesh(b.build()));
  const t = solidMesh(turretGeo('shore')); t.position.y = 1.3; g.add(t);
  g.userData.turret = t;
  g.position.set(TURRET_AT[0], Y0, TURRET_AT[1]);
  return g;
}

export function repairDockModel() {
  const g = new THREE.Group(), b = new Builder();
  b.add('rbox', 0x8f99a8, [0, 0.25, 0], [11, 1.4, 11]);
  b.add('box', PAL.yellow, [0, 0.98, 0], [11.2, 0.12, 11.2]);
  b.add('box', 0xbfc6d0, [0, 1.0, 0], [10.2, 0.14, 10.2]);
  b.add('box', PAL.green, [0, 1.12, 0], [6, 0.1, 1.9]); b.add('box', PAL.green, [0, 1.12, 0], [1.9, 0.1, 6]);
  b.add('box', 0xffffff, [0, 1.15, 0], [4.6, 0.1, 1.0]); b.add('box', 0xffffff, [0, 1.15, 0], [1.0, 0.1, 4.6]);
  // small crane in a corner
  b.cylOn('cyl', PAL.yellow, 3.8, 1.0, 3.8, 1.2, 1.0);
  b.boxOn('box', PAL.yellow, 3.8, 2.0, 3.8, 0.6, 5.0, 0.6);
  b.add('box', PAL.yellow, [1.8, 6.9, 3.8], [4.6, 0.5, 0.5], [0, 0, -0.18]);
  b.add('cyl8', PAL.black, [-0.2, 5.3, 3.8], [0.06, 2.6, 0.06]);
  b.add('box', PAL.red, [-0.2, 3.9, 3.8], [0.5, 0.4, 0.5]);
  for (const [x, z] of [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6]]) b.add('cyl', PAL.orange, [x, 0.6, z], [0.9, 1.0, 0.9]);
  // walkway back to the quay
  b.add('box', 0x8f99a8, [-9.5, 0.7, -0.5], [8, 0.3, 2.4]);
  g.add(solidMesh(b.build()));
  g.position.set(REPAIR_AT[0], 0, REPAIR_AT[1]);
  return g;
}

// ---------------------------------------------------------------- the quay (base), fences, roads, props
export function quayModel(stage) {
  const b = new Builder(), r = seeded(7);
  const { x0, x1, z0, z1 } = BASE;
  b.add('box', 0x9b968c, [0, Y0 - 3.1, 0], [x1 - x0, 6.2, z1 - z0]);
  b.add('box', PAL.quay, [0, Y0 - 0.12, 0], [x1 - x0 - 0.6, 0.3, z1 - z0 - 0.6]);
  // waterfront edge: dark lip, yellow safety line, bollards, tyres
  b.add('box', 0x7f7a71, [0, Y0 - 0.05, z0 + 0.5], [x1 - x0, 0.3, 1.0]);
  b.add('box', 0x7f7a71, [x1 - 0.5, Y0 - 0.05, 0], [1.0, 0.3, z1 - z0]);
  b.add('box', PAL.yellow, [0, Y0 + 0.04, z0 + 1.6], [x1 - x0 - 3, 0.04, 0.35]);
  b.add('box', PAL.yellow, [x1 - 1.6, Y0 + 0.04, 0], [0.35, 0.04, z1 - z0 - 3]);
  for (let x = x0 + 3; x < x1 - 2; x += 5.5) { b.cylOn('cyl8', 0x30343c, x, Y0, z0 + 0.9, 0.6, 0.6); b.add('torus', 0x24262d, [x + 2.6, Y0 - 1.4, z0 - 0.15], [1.4, 1.4, 1.6]); }
  for (let z = z0 + 3; z < z1 - 2; z += 5.5) { b.cylOn('cyl8', 0x30343c, x1 - 0.9, Y0, z, 0.6, 0.6); b.add('torus', 0x24262d, [x1 + 0.15, Y0 - 1.4, z + 2.6], [1.6, 1.4, 1.4], [0, Math.PI / 2, 0]); }
  // roads: north-south at x 0 and east-west at z 0, with a gate on the land side
  b.add('box', PAL.asphalt, [0, Y0 + 0.05, 0], [6, 0.06, z1 - z0 - 0.6]);
  b.add('box', PAL.asphalt, [-16, Y0 + 0.05, 0], [x1 - x0 - 32, 0.06, 6]);
  for (let z = z0 + 3; z < z1 - 2; z += 4) b.add('box', PAL.line, [0, Y0 + 0.09, z], [0.25, 0.04, 2]);
  for (let x = x0 + 3; x < -3; x += 4) b.add('box', PAL.line, [x, Y0 + 0.09, 0], [2, 0.04, 0.25]);
  // paving joints
  for (let i = -24; i <= 24; i += 12) { b.add('box', PAL.quayD, [i, Y0 + 0.035, 0], [0.12, 0.03, z1 - z0 - 1]); b.add('box', PAL.quayD, [0, Y0 + 0.035, i], [x1 - x0 - 1, 0.03, 0.12]); }
  // land-side fence (west and south), green panels on posts like Top Force's base fence, gaps for the roads
  const fence = (ax, az, bx, bz, skip) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 3.2), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (skip(x, z)) continue;
      b.boxOn('rbox', 0x4b7f52, x, Y0, z, 0.5, 2.0, 0.5);
      if (i < n && !skip(ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n)) {
        const mx = x + Math.cos(ang) * L / n / 2, mz = z + Math.sin(ang) * L / n / 2;
        b.add('box', 0x6aa572, [mx, Y0 + 1.15, mz], [L / n, 1.1, 0.18], [0, -ang, 0]);
        b.add('box', 0x4b7f52, [mx, Y0 + 1.8, mz], [L / n, 0.18, 0.3], [0, -ang, 0]);
      }
    }
  };
  fence(x0 + 0.4, z0 + 4, x0 + 0.4, z1 - 0.4, (x, z) => Math.abs(z) < 4);
  fence(x0 + 0.4, z1 - 0.4, x1 - 4, z1 - 0.4, (x, z) => Math.abs(x) < 4);
  // gate booths
  b.boxOn('rbox', PAL.wall, 5.2, Y0, z1 - 2, 2.2, 2.6, 2.2); b.boxOn('rbox', PAL.navy, 5.2, Y0 + 2.6, z1 - 2, 2.6, 0.3, 2.6);
  b.boxOn('box', PAL.red, -2.5, Y0 + 1.0, z1 - 1.2, 5.5, 0.25, 0.25);
  // containers (south-east corner) and crates (north-west corner)
  const cont = (x, z, y, ry, c) => { b.boxOn('rbox', c, x, Y0 + y, z, 6, 2.5, 2.5, ry); };
  cont(25.5, 26.5, 0, 0, PAL.container[0]); cont(25.5, 29.2, 0, 0, PAL.container[1]); cont(25.5, 27.8, 2.5, 0, PAL.container[2]);
  cont(-25, 29, 0, 0, PAL.container[3]); cont(-25, 29, 2.5, 0.04, PAL.container[4]);
  for (let i = 0; i < 6; i++) b.boxOn('rbox', PAL.wood, -27 + (i % 3) * 1.9, Y0 + Math.floor(i / 3) * 1.6, -2 - 5 + (i % 2) * 0.2, 1.6, 1.6, 1.6, r() * 0.3);
  for (let i = 0; i < 5; i++) b.cylOn('cyl', [PAL.red, PAL.blue, PAL.orange][i % 3], 27 - (i % 3) * 1.4, Y0, 4 + Math.floor(i / 3) * 1.4, 1.2, 1.6);
  // street lamps at the road crossings
  for (const [x, z] of [[4.5, -4.5], [-4.5, 4.5], [4.5, 25], [-4.5, -25], [-25, -4.5]]) {
    b.cylOn('cyl8', 0x30343c, x, Y0, z, 0.25, 5.5); b.add('box', 0x30343c, [x, Y0 + 5.5, z + 0.6], [0.3, 0.25, 1.4]); b.add('box', 0xfff2b0, [x, Y0 + 5.3, z + 1.1], [0.5, 0.2, 0.6]);
  }
  // a dockside crane on the east edge
  b.boxOn('box', PAL.red, 28, Y0, -8, 0.9, 10, 0.9); b.boxOn('box', PAL.red, 28, Y0, -3, 0.9, 10, 0.9);
  b.add('box', PAL.red, [28, Y0 + 10.3, -5.5], [1.2, 0.8, 7]);
  b.add('box', PAL.red, [33, Y0 + 11, -5.5], [14, 0.9, 1.2]);
  b.boxOn('rbox', PAL.wall, 27, Y0 + 10.7, -5.5, 3, 2, 2.4);
  b.add('cyl8', 0x24262d, [37, Y0 + 7.8, -5.5], [0.08, 5.5, 0.08]);
  if (stage >= 3) {
    b.add('box', 0x9b968c, [(WHARF[0] + WHARF[1]) / 2, Y0 - 3.1, (WHARF[2] + WHARF[3]) / 2], [WHARF[1] - WHARF[0], 6.2, WHARF[3] - WHARF[2]]);
    b.add('box', PAL.quay, [(WHARF[0] + WHARF[1]) / 2, Y0 - 0.12, (WHARF[2] + WHARF[3]) / 2], [WHARF[1] - WHARF[0] - 0.6, 0.3, WHARF[3] - WHARF[2] - 0.6]);
    b.add('box', PAL.yellow, [WHARF[1] - 1.6, Y0 + 0.04, (WHARF[2] + WHARF[3]) / 2], [0.35, 0.04, WHARF[3] - WHARF[2] - 3]);
    cont(46, 33, 0, 0, PAL.container[1]); cont(46, 36, 0, 0, PAL.container[2]); cont(46, 34.5, 2.5, 0, PAL.container[0]);
    b.add('box', 0x9b968c, [(PIER[0] + PIER[1]) / 2, Y0 - 3.1, (PIER[2] + PIER[3]) / 2], [PIER[1] - PIER[0], 6.2, PIER[3] - PIER[2]]);
    b.add('box', PAL.quay, [(PIER[0] + PIER[1]) / 2, Y0 - 0.12, (PIER[2] + PIER[3]) / 2], [PIER[1] - PIER[0] - 0.6, 0.3, PIER[3] - PIER[2] - 0.6]);
    for (let z = PIER[2] + 3; z < PIER[3]; z += 6) b.cylOn('cyl8', 0x30343c, PIER[1] - 0.8, Y0, z, 0.6, 0.6);
  }
  return solidMesh(b.build());
}

// ---------------------------------------------------------------- enemy zones (active, wreck, ours)
// mode: 'active' red pirate camp, 'wreck' burnt and broken (smoke comes from the view), 'ours' cleaned up under our flag.
function zoneColors(mode) {
  const w = mode === 'wreck', o = mode === 'ours';
  const dk = c => { if (!w) return c; const k = new THREE.Color(c); k.multiplyScalar(0.42); k.lerp(new THREE.Color(0x2a2522), 0.25); return k.getHex(); };
  return { dk, roof: o ? 0x3e86e6 : PAL.roofRed, roofD: o ? 0x2c66b8 : 0xa8352b, flag: o ? 0x3e86e6 : PAL.red, wreck: w, ours: o };
}
function flagOn(b, x, y, z, h, col) {
  b.cylOn('cyl8', 0x6e4a2c, x, y, z, 0.25, h);
  b.addGeo(paint(new THREE.BoxGeometry(2.6, 1.5, 0.08).toNonIndexed(), col), [x + 1.3, y + h - 0.9, z]);
}
function quonset(b, K, x, y, z, w, d, h, ry) { // Top Force's red arched shed
  const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  if (K.wreck) {
    // half the arch is gone: a low broken shell and rubble
    b.add('hcyl', K.dk(K.roof), [x, y, z], [w, h * 1.1, d * 0.55], [0, ry, 0.2]);
    for (let i = 0; i < 5; i++) { const p = at((i - 2) * w * 0.18, d * 0.25); b.add('rbox', K.dk(PAL.wood), [p[0], y + 0.3, p[1]], [1.6, 0.6, 1.0], [0, ry + i, 0]); }
    return;
  }
  b.add('hcyl', K.roof, [x, y, z], [w, h * 2, d], [0, ry, 0]);
  for (const t of [-0.42, 0, 0.42]) { const p = at(0, t * d); b.add('hcyl', K.roofD, [p[0], y, p[1]], [w + 0.25, h * 2 + 0.25, 0.4], [0, ry, 0]); }
  const f = at(0, -d / 2 - 0.1); b.add('hcyl', 0xefe6d2, [f[0], y, f[1]], [w - 0.5, h * 2 - 0.5, 0.3], [0, ry, 0]);
  const dr = at(0, -d / 2 - 0.3); b.add('box', 0x4a3a30, [dr[0], y + h * 0.33, dr[1]], [w * 0.45, h * 0.66, 0.3], [0, ry, 0]);
}
function palisade(b, K, cx, cz, R, y, gaps, a0 = 0, a1 = TAU) {
  const n = Math.round(R * (a1 - a0) / 1.1);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n; if (gaps.some(g => Math.abs(((a - g + Math.PI * 3) % TAU) - Math.PI) < 0.22)) continue;
    if (K.wreck && (i * 7) % 5 < 2) continue;
    const h = 2.4 + ((i * 13) % 5) * 0.15;
    b.add('cyl6', K.dk(PAL.wood), [cx + Math.cos(a) * R, y + h / 2, cz + Math.sin(a) * R], [0.75, h, 0.75], K.wreck ? [0.3 * Math.sin(i), 0, 0.3 * Math.cos(i)] : [0, 0, 0]);
    if (!K.wreck) b.add('cone6', K.dk(PAL.woodD), [cx + Math.cos(a) * R, y + h + 0.3, cz + Math.sin(a) * R], [0.75, 0.6, 0.75]);
  }
}
function watchTower(b, K, x, y, z, h) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('cyl6', K.dk(PAL.woodD), [x + dx * 1.1, y + h / 2, z + dz * 1.1], [0.4, h, 0.4], K.wreck ? [dx * 0.25, 0, dz * 0.1] : [0, 0, 0]);
  if (K.wreck) { b.add('rbox', K.dk(PAL.wood), [x + 2, y + 0.4, z + 1], [3.4, 0.4, 3.4], [0.4, 0.3, 0.2]); return; }
  b.boxOn('rbox', PAL.wood, x, y + h, z, 3.4, 0.4, 3.4);
  b.boxOn('box', PAL.woodD, x, y + h + 0.4, z, 3.4, 1.0, 3.4);
  b.add('cone4', K.roof, [x, y + h + 2.6, z], [4.2, 1.8, 4.2]);
}
function rubble(b, K, x, y, z, n, r, seed) {
  const rr = seeded(seed);
  for (let i = 0; i < n; i++) { const a = rr() * TAU, d = rr() * r; b.add('rbox', K.dk(rr() < 0.5 ? PAL.wood : PAL.rockD), [x + Math.cos(a) * d, y + 0.25, z + Math.sin(a) * d], [0.8 + rr() * 1.4, 0.5, 0.6 + rr()], [0, rr() * 3, rr() * 0.4]); }
}

// Zone 2: reef island outpost (palisade, two red arched sheds, watch tower, cannons, jetty toward the harbor).
function zone2(b, K) {
  const [cx, cz] = ZONES[2].at, y = 1.6;
  palisade(b, K, cx, cz, 11, y, [Math.PI / 2 - 0.35]);
  quonset(b, K, cx - 3.5, y, cz - 3, 8, 9, 4.2, 0.5);
  quonset(b, K, cx + 4.5, y, cz + 1, 6, 7, 3.4, -0.6);
  watchTower(b, K, cx - 6, y, cz + 4.5, 6);
  if (!K.wreck) flagOn(b, cx + 1, y, cz - 7, 8, K.flag);
  for (const [x, z] of [[cx + 7.5, cz + 7], [cx - 1, cz + 8.5]]) b.boxOn('rbox', K.dk(0x8c8c80), x, y, z, 2.6, 0.8, 2.6);
  for (let i = 0; i < 4; i++) b.cylOn('cyl', K.dk(i % 2 ? PAL.woodD : 0x5d6470), cx + 2 + i * 1.3, y, cz + 5.2, 1.1, 1.4);
  // jetty
  const [jx0, jx1, jz0, jz1] = JETTY;
  b.add('box', K.dk(PAL.wood), [(jx0 + jx1) / 2, 1.0, (jz0 + jz1) / 2], [jx1 - jx0, 0.3, jz1 - jz0]);
  for (let z = jz0 + 1; z <= jz1; z += 3) for (const x of [jx0 + 0.3, jx1 - 0.3]) b.add('cyl6', K.dk(PAL.woodD), [x, 0.2, z], [0.45, 2.6, 0.45]);
  if (K.wreck) rubble(b, K, cx, y, cz, 22, 9, 21);
  if (K.ours) { b.boxOn('rbox', PAL.wall, cx + 1, y, cz + 2, 3.5, 2.4, 3.0); b.boxOn('rbox', PAL.navy, cx + 1, y + 2.4, cz + 2, 3.8, 0.3, 3.3); }
}
// Zone 3: raft camp on the water (rafts tied together, tents, a fort tower, cannons) around a sandbar.
function zone3(b, K) {
  const [cx, cz] = ZONES[3].at, rafts = [[0, 0, 9, 8], [-9, 4, 7, 6], [7, -8, 7, 6], [-4, -10, 6, 5], [10, 6, 6, 6], [-11, -6, 5, 5]];
  rafts.forEach(([dx, dz, w, d], i) => {
    const x = cx + dx, z = cz + dz, tilt = K.wreck ? [0.08 * Math.sin(i * 3), 0, 0.1 * Math.cos(i * 2)] : [0, 0, 0];
    b.add('box', K.dk(i % 2 ? PAL.wood : 0xb98a52), [x, 0.45, z], [w, 0.5, d], tilt);
    for (let k = 0; k < Math.floor(w / 1.3); k++) b.add('box', K.dk(PAL.woodD), [x - w / 2 + 0.65 + k * 1.3, 0.72, z], [0.12, 0.06, d], tilt);
    for (const sx of [-1, 1]) b.add('cyl8', K.dk(0x5d4a3a), [x + sx * w * 0.42, 0.25, z], [0.9, d * 0.95, 0.9], [Math.PI / 2, 0, 0]);
  });
  // central fort tower and tents
  if (!K.wreck) {
    b.boxOn('rbox', PAL.woodD, cx, 0.7, cz, 5, 3.6, 5);
    b.boxOn('box', PAL.wood, cx, 4.3, cz, 6, 0.4, 6);
    b.add('cone4', K.roof, [cx, 5.8, cz], [6.6, 2.6, 6.6]);
    flagOn(b, cx + 2.2, 7, cz + 2.2, 4, K.flag);
  } else { b.boxOn('rbox', K.dk(PAL.woodD), cx, 0.7, cz, 5, 1.6, 5); rubble(b, K, cx, 0.7, cz, 18, 9, 33); }
  for (const [dx, dz] of [[-9, 4], [7, -8], [10, 6]]) {
    if (K.wreck) { b.add('cone4', K.dk(K.roof), [cx + dx, 1.3, cz + dz], [3.6, 1.2, 3.0], [0.3, 0.4, 0.2]); continue; }
    b.add('cone4', K.roof, [cx + dx, 2.2, cz + dz], [3.6, 3.0, 3.0]);
  }
  for (let i = 0; i < 5; i++) b.cylOn('cyl', K.dk(i % 2 ? 0x5d6470 : PAL.woodD), cx - 3 + i * 1.3, 0.7, cz + 5.5, 1.1, 1.3);
  if (K.ours) { b.boxOn('rbox', PAL.wall, cx - 4, 0.7, cz - 10, 3, 2, 3); b.boxOn('rbox', PAL.navy, cx - 4, 2.7, cz - 10, 3.3, 0.3, 3.3); }
}
// Zone 4: steel pontoon anchorage with containers, fuel tanks and a crane.
function zone4(b, K) {
  const [cx, cz] = ZONES[4].at;
  b.add('rbox', K.dk(0x7d8796), [cx, 0.4, cz], [26, 1.2, 18]);
  b.add('box', K.dk(PAL.yellow), [cx, 1.02, cz], [26.2, 0.1, 18.2]);
  b.add('box', K.dk(0x9aa3b0), [cx, 1.06, cz], [25, 0.1, 17]);
  for (let i = 0; i < 6; i++) b.boxOn('rbox', K.dk(PAL.container[i % 5]), cx - 8 + (i % 3) * 2.8, 1.1 + Math.floor(i / 3) * 2.5, cz - 4, 2.5, 2.5, 6);
  for (const [dx, dz] of [[6, -3], [9.5, -3], [6, 3.5]]) { b.cylOn('cyl', K.dk(0xe8e8e0), cx + dx, 1.1, cz + dz, 3, 3.2); b.cylOn('cyl', K.dk(K.roof), cx + dx, 4.3, cz + dz, 3.1, 0.3); }
  b.boxOn('box', K.dk(K.roof), cx - 2, 1.1, cz + 5, 0.8, 9, 0.8);
  b.add('box', K.dk(K.roof), [cx + 1.5, 10.4, cz + 5], [8, 0.7, 0.8], [0, 0, K.wreck ? -0.5 : 0]);
  if (!K.wreck) flagOn(b, cx - 11, 1.1, cz + 7, 7, K.flag); else rubble(b, K, cx, 1.1, cz, 16, 10, 44);
}

export function zoneModel(n, mode) {
  const K = zoneColors(mode), b = new Builder();
  if (n === 2) zone2(b, K); else if (n === 3) zone3(b, K); else zone4(b, K);
  const m = solidMesh(b.build());
  // where the view adds fires and smoke when wrecked, and where cannons stand when active
  const [cx, cz] = ZONES[n].at;
  m.userData.smoke = n === 2 ? [[cx - 3.5, 3, cz - 3], [cx + 4.5, 2.5, cz + 1], [cx - 6, 2, cz + 4.5]]
    : n === 3 ? [[cx, 2, cz], [cx - 9, 1.5, cz + 4], [cx + 7, 1.5, cz - 8]] : [[cx - 5, 3, cz - 4], [cx + 6, 3, cz - 3]];
  m.userData.guns = mode !== 'active' ? [] : n === 2 ? [[cx + 7.5, 2.4, cz + 7], [cx - 1, 2.4, cz + 8.5]] : n === 3 ? [[cx - 9, 0.95, cz + 4], [cx + 10, 0.95, cz + 6]] : [[cx + 9, 1.1, cz + 6], [cx - 9, 1.1, cz + 5]];
  return m;
}
export function cannonMesh() { if (!TURRETS.cannon) TURRETS.cannon = turretGeo('cannon'); return solidMesh(TURRETS.cannon); }
