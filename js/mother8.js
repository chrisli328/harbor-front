// Round 8 motherships and the airship (owner 2026-11-14 03:27 "can be helicoter, motherships, drones, or something else"):
// - seaMotherSpec: mission 20 boss, Ironjaw's drone carrier on the sea (replaces the crab mech). Flight deck with a
//   launch strip, a control island with a big white skull and two smokestacks, parked drones, four deck cannons.
// - airshipSpec: mission 39 leader, a pirate airship after Top Force's (fat cream envelope, rust straps, black skull,
//   four tail fins, a boat-shaped gondola with a bow cannon and two pusher propellers).
// - skyMotherSpec: mission 40 final boss, Ironjaw's flying mothership on four ducted rotors, with a drone bay and his
//   command tower (iron-jawed skull with glowing eyes, captain's hat, black flag).
// Same toy block method as units7.js: Builder primitives with vertex colours, one merged geometry per moving part.
// Forward is +x, up +y; every model is built standing on y = 0 (units7 assemble lifts fliers by spec.fly).
import * as THREE from 'three';
import { Builder, PAL, paint } from './look.js';
import { RUST, RUSTD, BLK, BLK2, BONE, GLOW, LAMP, GOLD, GOLDD, GUN, IRON, IRONL, HP, TAU, XAX, ZAX, sstep, hullGeo, flatGeo, skull, skullFront, jollyRoger, beam } from './kit8.js';

const DECK = 0x4a4e57, DECKL = 0x5c616b, WIN = 0xffb36b, HAZ = 0xffc23a, WHITE = PAL.white, HOLE = 0x101012;
const ENV = 0xe9dcc0, PROPC = 0x8a919e, BLADE = 0xa9afb8, FIRE = 0xff8a1f, WOOD = PAL.woodD;

// ---------------------------------------------------------------- helpers
// Ready geometry for Builder.addGeo: non-indexed, position / normal / colour only. col is one colour or
// fn(cx, cy, cz, nx, ny, nz) per triangle (centroid and mean normal).
function shade(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (typeof col !== 'function') return paint(g, col);
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), cc = new THREE.Color();
  const a = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    let cx = 0, cy = 0, cz = 0, mx = 0, my = 0, mz = 0;
    for (let j = i; j < i + 3; j++) { cx += p.getX(j); cy += p.getY(j); cz += p.getZ(j); mx += n.getX(j); my += n.getY(j); mz += n.getZ(j); }
    // classify by the flat face normal (smooth vertex normals blur corners and give saw-tooth colour edges),
    // oriented like the vertex normals
    a.fromBufferAttribute(p, i); e1.fromBufferAttribute(p, i + 1).sub(a); e2.fromBufferAttribute(p, i + 2).sub(a);
    e1.cross(e2).normalize();
    if (e1.x * mx + e1.y * my + e1.z * mz < 0) e1.negate();
    cc.set(col(cx / 3, cy / 3, cz / 3, e1.x, e1.y, e1.z));
    for (let j = i; j < i + 3; j++) { c[j * 3] = cc.r; c[j * 3 + 1] = cc.g; c[j * 3 + 2] = cc.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// body of revolution about the x axis; pts [[x, r], ...] from tail to nose
function latheX(pts, segs, col) {
  const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(r, x)), segs);
  g.rotateZ(-HP); // lathe height (y) -> +x
  return shade(g, col);
}
// body of revolution about the y axis; pts [[r, y], ...] (outer wall upward, top inward, inner wall downward)
function latheY(pts, segs, col) { return shade(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs), col); }
// a band round an x-axis body: a short closed cylinder of radius r, width w, centred at x
function bandX(x, r, w, segs, col) { const g = new THREE.CylinderGeometry(r, r, w, segs); g.translate(0, x, 0); g.rotateZ(-HP); return shade(g, col); }

// Plan-view hull extruded up and narrowed toward the keel (kit8 hullGeo method) but pointed at both ends with a
// narrow transom, so four corner rotor ducts clear it. Bottom at y = 0, deck flat on top.
function podHull(L, B, H, col, o = {}) {
  const hl = L / 2, hb = B / 2, tb = hb * (o.transom ?? 0.45), s = new THREE.Shape();
  s.moveTo(hl, 0);
  s.quadraticCurveTo(hl * 0.8, hb, hl * 0.3, hb);
  s.lineTo(-hl * 0.55, hb);
  s.quadraticCurveTo(-hl * 0.92, hb, -hl, tb);
  s.lineTo(-hl, -tb);
  s.quadraticCurveTo(-hl * 0.92, -hb, -hl * 0.55, -hb);
  s.lineTo(hl * 0.3, -hb);
  s.quadraticCurveTo(hl * 0.8, -hb, hl, 0);
  const bev = 0.18;
  let g = new THREE.ExtrudeGeometry(s, { depth: H, steps: 4, curveSegments: 8, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2 });
  g.rotateX(-HP); g.translate(0, bev, 0);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position, top = H + 2 * bev, keel = o.keel ?? 0.5;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / top;
    pos.setZ(i, pos.getZ(i) * (keel + (1 - keel) * sstep(0, 0.6, t)));
    pos.setX(i, pos.getX(i) * (0.92 + 0.08 * sstep(0, 0.5, t)));
  }
  g.computeVertexNormals();
  return shade(g, (cx, cy, cz, nx, ny) => ny > 0.55 && cy > top - 0.25 ? col.deck : cy < (o.bottomY ?? 1) ? col.bottom : cy > top - (o.stripeH ?? 0.3) - 0.05 ? col.stripe : col.hull);
}

// Skull and crossbones in the x-y plane in any colour (kit8 skull is bone white only), knobbed bone ends.
function skullC(b, x, y, z, s, t, col, eye) {
  for (const a of [-0.6, 0.6]) {
    b.add('box', col, [x, y - s * 0.2, z], [s * 1.5, s * 0.17, t * 0.75], [0, 0, a]);
    for (const e of [-1, 1]) b.add('sphLo', col, [x + e * Math.cos(a) * s * 0.75, y - s * 0.2 + e * Math.sin(a) * s * 0.75, z], [s * 0.3, s * 0.3, t * 0.75]);
  }
  b.add('sphLo', col, [x, y + s * 0.08, z], [s, s * 0.9, t]);
  b.add('box', col, [x, y - s * 0.38, z], [s * 0.55, s * 0.26, t * 0.9]);
  for (const sd of [-1, 1]) for (const ex of [-0.22, 0.22]) b.add('sphLo', eye, [x + ex * s, y + s * 0.1, z + sd * t * 0.42], [s * 0.26, s * 0.26, t * 0.3]);
}

// A parked pirate drone (static deck dressing): black body, red eye forward, X arms, four little prop discs.
function parkedDrone(b, x, y, z, s = 1) {
  b.add('rbox', BLK, [x, y + 0.26 * s, z], [0.95 * s, 0.44 * s, 0.95 * s]);
  b.add('sphLo', GLOW, [x + 0.47 * s, y + 0.3 * s, z], [0.2 * s, 0.24 * s, 0.34 * s]);
  for (const a of [Math.PI / 4, -Math.PI / 4]) b.add('box', BLK2, [x, y + 0.4 * s, z], [2.0 * s, 0.1 * s, 0.16 * s], [0, a, 0]);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.add('cyl', PROPC, [x + dx * 0.7 * s, y + 0.47 * s, z + dz * 0.7 * s], [0.82 * s, 0.04 * s, 0.82 * s]);
}

// Pirate deck cannon built around its own pivot, barrels along +x: black ring, rust housing with a gold band,
// black mantlet, grey barrel(s) with black muzzles.
function deckGun(s = 1, twin = false) {
  const b = new Builder();
  b.cylOn('cyl8', BLK2, 0, 0, 0, 1.9 * s, 0.38 * s);
  b.add('rbox2', RUST, [-0.1 * s, 0.82 * s, 0], [1.9 * s, 0.95 * s, 1.75 * s]);
  b.add('box', GOLD, [-0.1 * s, 0.5 * s, 0], [1.94 * s, 0.14 * s, 1.79 * s]);
  b.add('rbox', BLK, [0.86 * s, 0.85 * s, 0], [0.32 * s, 0.75 * s, (twin ? 1.45 : 0.9) * s]);
  for (const z of twin ? [-0.38, 0.38] : [0]) {
    b.add('cyl8', GUN, [2.0 * s, 0.86 * s, z * s], [0.36 * s, 2.3 * s, 0.36 * s], XAX);
    b.add('cyl8', BLK, [3.1 * s, 0.86 * s, z * s], [0.5 * s, 0.26 * s, 0.5 * s], XAX);
  }
  b.add('box', GOLD, [-1.06 * s, 0.85 * s, 0], [0.04 * s, 0.32 * s, 0.9 * s]); // gold plate on the back
  return b.build();
}

// ---------------------------------------------------------------- mission 20 boss: pirate drone carrier
// A rust carrier with a black bottom and a gold line under a wide dark flight deck. Port side: the launch strip (pale
// lane, white centre dashes, yellow chevrons) with the drone pad at its aft end (spec.bay). Starboard: the control
// island (big white skull on a black plate on both faces, black bridge with lit windows, two smokestacks, a mast with
// the black flag) and three parked drones. Cannons: twin on the bow, two on side sponsons, one on a raised stern tub.
export function seaMotherSpec() {
  const b = new Builder();
  b.addGeo(hullGeo(22, 7.4, 3.3, 1.0, { hull: RUST, bottom: BLK, stripe: GOLD, deck: DECK }, { sheer: 0.25, shoulder: 0.35, sternRound: 1.0, steps: 5, keel: 0.55, stripeH: 0.26 }));
  // flight deck: a black slab with a dark top plate, overhanging the hull, square stern and a blunt bow
  const fd = new THREE.Shape();
  fd.moveTo(-11.4, -4.15); fd.lineTo(7.4, -4.15); fd.lineTo(11.6, -1.9); fd.quadraticCurveTo(12.3, 0, 11.6, 1.9); fd.lineTo(7.4, 4.15); fd.lineTo(-11.4, 4.15); fd.lineTo(-11.4, -4.15);
  const D = 2.97;
  b.addGeo(flatGeo(fd, 0.42, RUSTD), [0, 2.71, 0], [-HP, 0, 0]);
  b.addGeo(flatGeo(fd, 0.06, DECK), [0, 2.94, 0], [-HP, 0, 0], [0.985, 0.95, 1]);
  const m = D + 0.01; // deck markings
  for (const sd of [-1, 1]) b.add('box', HAZ, [-2.0, m, sd * 3.55], [18.2, 0.02, 0.14]);
  b.add('box', DECKL, [0.9, m - 0.004, 1.5], [18.2, 0.02, 2.5]);
  for (let x = -4.2; x <= 6.0; x += 2.04) b.add('box', WHITE, [x, m + 0.004, 1.5], [1.1, 0.02, 0.16]);
  for (const cx of [8.0, 9.2]) for (const sd of [-1, 1]) b.add('box', HAZ, [cx - 0.33, m + 0.004, 1.5 + sd * 0.38], [1.0, 0.02, 0.2], [0, sd * 0.85, 0]);
  const bay = [-6.6, D + 0.05, 1.5];
  b.add('cyl', HAZ, [bay[0], m, bay[2]], [2.7, 0.03, 2.7]);
  b.add('cyl', BLK2, [bay[0], m + 0.01, bay[2]], [2.2, 0.03, 2.2]);
  b.add('torus', WHITE, [bay[0], m + 0.025, bay[2]], [1.3, 1.3, 0.12], [HP, 0, 0]);
  // parked drones on the starboard side
  for (const x of [-5.8, -8.2, 3.9]) parkedDrone(b, x, D, -2.45);
  // control island on the starboard edge
  const IZ = -3.35;
  b.add('rbox', RUST, [-1.0, D + 1.4, IZ], [5.6, 2.8, 2.0]);
  b.add('box', GOLD, [-1.0, D + 2.72, IZ], [5.64, 0.14, 2.04]);
  for (const sd of [-1, 1]) {
    b.add('rbox', BLK, [-1.1, D + 1.4, IZ + sd * 1.0], [4.4, 2.55, 0.14]);
    skull(b, -1.1, D + 1.5, IZ + sd * 1.1, 2.0, 0.14);
  }
  b.add('rbox', BLK2, [0.25, D + 3.45, IZ], [3.0, 1.3, 2.4]);
  b.add('box', GOLD, [0.25, D + 2.88, IZ], [3.06, 0.14, 2.46]);
  b.add('box', WIN, [1.76, D + 3.55, IZ], [0.06, 0.38, 2.0]);
  for (const sd of [-1, 1]) b.add('box', WIN, [0.35, D + 3.55, IZ + sd * 1.21], [2.5, 0.38, 0.06]);
  b.add('rbox', RUST, [0.25, D + 4.2, IZ], [3.3, 0.24, 2.6]);
  const funnels = [];
  for (const x of [-2.15, -3.3]) {
    b.cylOn('cyl', BLK, x, D + 2.8, IZ, 1.0, 2.5);
    b.cylOn('cyl', RUST, x, D + 5.0, IZ, 1.12, 0.42);
    funnels.push([x, D + 5.7, IZ]);
  }
  b.cylOn('cyl8', IRON, 0.3, D + 4.3, IZ, 0.2, 3.3);
  b.add('box', IRONL, [0.3, D + 6.1, IZ], [0.2, 0.14, 1.8]);
  b.add('sphLo', GOLD, [0.3, D + 7.65, IZ], [0.34, 0.34, 0.34]);
  jollyRoger(b, 0.3, D + 7.5, 2.0, 1.3, IZ);
  // side hangar openings under the deck
  for (const sd of [-1, 1]) {
    b.add('box', HAZ, [-3.4, 1.45, sd * 3.9], [5.3, 1.2, 0.04]);
    b.add('box', HOLE, [-3.4, 1.45, sd * 3.92], [4.9, 0.9, 0.04]);
  }
  // gun sponsons (port aft-mid, starboard forward) and the raised stern tub
  const sp = [[3.0, 4.55], [6.6, -4.5]];
  for (const [x, z] of sp) {
    b.cylOn('cyl8', BLK2, x, D - 0.5, z, 2.1, 0.5);
    b.add('cone', BLK2, [x, D - 1.15, z - Math.sign(z) * 0.3], [1.5, 1.3, 1.5], [Math.PI, 0, 0]);
  }
  b.cylOn('cyl8', BLK2, -10.0, D, 0, 2.3, 1.0);
  b.add('box', GOLD, [-10.0, D + 0.82, 0], [2.0, 0.14, 2.0]);
  const gunS = deckGun(0.95), gunT = deckGun(1.1, true);
  const turrets = [{ geo: gunT, at: [9.2, D, -1.5] }, { geo: gunS, at: [3.0, D, 4.55] }, { geo: gunS, at: [6.6, D, -4.5] }, { geo: gunS, at: [-10.0, D + 1.0, 0] }];
  return { hull: b.build(), turrets, funnels, len: 24, beam: 8.4, legs: [], walker: false, rate: 0, rotors: [], fly: 0, bay };
}

// ---------------------------------------------------------------- mission 39 leader: pirate airship
// Top Force's airship re-themed: a fat cream envelope with a rust nose cap and three rust straps, a big black skull and
// crossbones on each flank (tilted up so the top-down camera reads it), four rust tail fins with grey caps; under it a
// black boat-hull gondola (gold gunwale, rust cabin, lit windows) hung from the middle strap, a bow cannon (turret 0)
// that swings over the cabin roof, and two engine pods with three-blade pusher props (rotors, axis x).
export function airshipSpec() {
  const b = new Builder(), CY = 7.4, R = 3.3, XC = 0.4, AF = 6.8, AB = 7.6;
  const rad = x => {
    if (x >= XC) { const u = Math.min(1, (x - XC) / AF); return R * Math.sqrt(Math.max(0, 1 - u * u)); }
    const u = Math.min(1, (XC - x) / AB); return R * Math.pow(Math.max(0, 1 - u * u), 0.62);
  };
  const pts = [], N = 24;
  for (let i = 0; i <= N; i++) { const th = -HP + Math.PI * i / N, x = XC + (th < 0 ? AB : AF) * Math.sin(th); pts.push([x, rad(x)]); }
  const NOSE = XC + AF - 1.0;
  b.addGeo(latheX(pts, 20, cx => cx > NOSE ? RUST : ENV), [0, CY, 0]);
  b.addGeo(bandX(NOSE, rad(NOSE) + 0.1, 0.24, 20, GOLD), [0, CY, 0]);
  // straps with grey buckles on top
  for (const x of [3.6, -1.3, -4.4]) {
    const w = 0.62, r = Math.max(rad(x - w / 2), rad(x + w / 2)) + 0.13;
    b.addGeo(bandX(x, r, w, 20, RUST), [0, CY, 0]);
    b.add('rbox', IRONL, [x, CY + r + 0.08, 0], [0.8, 0.26, 0.8]);
  }
  // black skull and crossbones on each flank, tilted up 24 degrees, cream eye and nose holes
  const sk = new Builder(); skullC(sk, 0, 0, 0, 2.05, 0.34, BLK, ENV);
  sk.add('cone4', ENV, [0, -2.05 * 0.1, 0.13], [0.22, 0.26, 0.12], [Math.PI, 0, 0]);
  sk.add('cone4', ENV, [0, -2.05 * 0.1, -0.13], [0.22, 0.26, 0.12], [Math.PI, 0, 0]);
  const skg = sk.build(), SX = 1.15, SA = 0.42, SR = rad(SX) - 0.06;
  for (const sd of [-1, 1]) b.addGeo(skg, [SX, CY + SR * Math.sin(SA), sd * SR * Math.cos(SA)], [-sd * SA, 0, 0]);
  // four tail fins (rust, grey tip caps), in a + round the tail
  const fs = new THREE.Shape(); fs.moveTo(-3.7, 1.8); fs.lineTo(-6.3, 4.3); fs.lineTo(-7.9, 4.3); fs.lineTo(-7.7, 0.2); fs.lineTo(-5.0, 0.2); fs.lineTo(-3.7, 1.8);
  const fb = new Builder(); fb.addGeo(flatGeo(fs, 0.34, RUST)); fb.add('rbox', IRONL, [-7.1, 4.32, 0], [1.75, 0.26, 0.46]);
  const fin = fb.build();
  for (let k = 0; k < 4; k++) b.addGeo(fin, [0, CY, 0], [k * HP, 0, 0]);
  // gondola: a black boat hull with a gold gunwale, a rust cabin with lit windows, a black roof
  const GX = 0.4;
  b.addGeo(hullGeo(6.4, 2.6, 1.05, 0, { hull: BLK, bottom: BLK2, stripe: GOLD, deck: RUSTD }, { sheer: 0.35, shoulder: 0.4, sternRound: 0.5, keel: 0.45, stripeH: 0.16, steps: 3 }), [GX, 0.13, 0]);
  const GD = 1.31;
  b.add('rbox', RUST, [-1.0, GD + 0.31, 0], [3.2, 0.62, 2.0]);
  b.add('box', GOLD, [-1.0, GD + 0.03, 0], [3.24, 0.08, 2.04]);
  for (const sd of [-1, 1]) b.add('box', WIN, [-0.95, GD + 0.36, sd * 1.01], [2.5, 0.22, 0.05]);
  b.add('box', WIN, [0.61, GD + 0.36, 0], [0.05, 0.22, 1.5]);
  b.add('rbox', BLK, [-1.0, GD + 0.69, 0], [3.4, 0.16, 2.2]);
  // hung from the middle strap by two plates, two aft cables to the envelope
  for (const sd of [-1, 1]) {
    b.add('rbox', RUST, [-1.3, (CY - R + 2.35) / 2, sd * 0.8], [0.5, CY - R - 1.65, 0.16]);
    beam(b, 'box', BLK, [-2.4, GD + 0.7, sd * 0.85], [-3.4, CY - 2.3, sd * 1.5], 0.1);
  }
  // engine pods on outrigger arms, pusher props behind
  const PZ = 2.9, PY = 1.25, rotors = [];
  const prop = new Builder();
  prop.add('cone', GOLD, [-0.18, 0, 0], [0.44, 0.42, 0.44], [0, 0, HP]);
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3;
    prop.add('box', BLK2, [0, 0.55 * Math.cos(a), 0.55 * Math.sin(a)], [0.1, 1.0, 0.34], [a, 0, 0]);
    prop.add('box', GOLD, [0, 1.0 * Math.cos(a), 1.0 * Math.sin(a)], [0.11, 0.16, 0.36], [a, 0, 0]);
  }
  const propG = prop.build();
  for (const sd of [-1, 1]) {
    beam(b, 'rbox', BLK, [-2.0, 1.0, sd * 1.1], [-2.4, PY, sd * (PZ - 0.3)], 0.3);
    b.add('cyl', RUST, [-2.5, PY, sd * PZ], [0.8, 1.7, 0.8], XAX);
    b.add('sph', RUST, [-1.65, PY, sd * PZ], [0.9, 0.8, 0.8]);
    b.add('cyl', GOLD, [-2.0, PY, sd * PZ], [0.86, 0.14, 0.86], XAX);
    b.add('cone', BLK2, [-3.45, PY, sd * PZ], [0.62, 0.36, 0.62], [0, 0, HP]);
    rotors.push({ geo: propG, at: [-3.65, PY, sd * PZ], axis: 'x', speed: 16 * sd });
  }
  // bow cannon on the gondola's fore deck; barrel rides at y 2.37, clear of the cabin roof, hangers and envelope
  const t = new Builder();
  t.cylOn('cyl8', BLK2, 0, 0, 0, 1.15, 0.3);
  t.cylOn('cyl8', IRON, 0, 0.3, 0, 0.42, 0.55);
  t.add('rbox', RUST, [-0.05, 1.06, 0], [0.9, 0.5, 0.82]);
  t.add('box', GOLD, [-0.05, 0.86, 0], [0.92, 0.1, 0.84]);
  t.add('cyl8', GUN, [1.25, 1.06, 0], [0.36, 2.0, 0.36], XAX);
  t.add('cyl8', BLK, [2.28, 1.06, 0], [0.5, 0.22, 0.5], XAX);
  return { hull: b.build(), turrets: [{ geo: t.build(), at: [2.0, GD, 0] }], funnels: [], len: 16, beam: 7, legs: [], walker: false, rate: 0, rotors, fly: 9, bay: [-1.0, 0, 0] };
}

// ---------------------------------------------------------------- mission 40 final boss: Ironjaw's flying mothership
// An armoured rust pod hull (black belly, gold line) on four big ducted rotors at the corners (rust ducts, gold lips,
// dark insides, grey four-blade fans as rotors), a dark deck with a drone bay (yellow frame, open hatch, red lamps;
// spec.bay), a twin bow cannon and two side cannons, a gold ram, broadside gun ports, twin stern exhausts and two
// smokestacks. Aft: Ironjaw's command tower, crowned by a big bone skull with glowing red eyes, an iron jaw and a
// captain's bicorne, with the black jolly roger flying above.
export function skyMotherSpec() {
  const b = new Builder(), HL = 11.0, D = 3.76;
  b.addGeo(podHull(HL * 2, 7.2, 3.4, { hull: RUST, bottom: BLK, stripe: GOLD, deck: DECK }, { bottomY: 1.25, stripeH: 0.26, keel: 0.5, transom: 0.5 }));
  // bow ram and figurehead skull
  b.add('cyl', BLK, [HL - 0.6, 1.9, 0], [1.5, 0.6, 1.5], XAX);
  b.add('cone', GOLD, [HL + 0.6, 1.9, 0], [1.1, 2.0, 1.1], XAX);
  skullFront(b, HL - 0.15, 2.95, 0, 1.0, 0.12);
  // deck: yellow edge lines, the drone bay (yellow frame, black hatch with the doors slid open, red corner lamps)
  const m = D + 0.01;
  for (const sd of [-1, 1]) b.add('box', HAZ, [-1.0, m, sd * 3.05], [11.5, 0.02, 0.14]);
  const BX = 2.4, bay = [BX, D + 0.05, 0];
  b.add('box', HAZ, [BX, m, 0], [4.4, 0.03, 3.3]);
  b.add('box', HOLE, [BX, m + 0.01, 0], [3.8, 0.03, 2.7]);
  for (const sd of [-1, 1]) b.add('box', IRONL, [BX + sd * 1.55, m + 0.03, 0], [0.7, 0.05, 2.7]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('sphLo', GLOW, [BX + sx * 2.05, m + 0.08, sz * 1.5], [0.26, 0.2, 0.26]);
  for (let x = 5.0; x <= 6.4; x += 1.4) b.add('box', WHITE, [x, m, 0], [0.8, 0.02, 0.16]);
  // armoured flanks: broadside gun ports with stub barrels, gold-riveted plates
  for (const sd of [-1, 1]) {
    for (const x of [-3.6, 0.2, 4.0]) {
      b.add('rbox', BLK2, [x, 2.25, sd * 3.72], [1.0, 0.75, 0.24]);
      b.add('cyl8', GUN, [x, 2.25, sd * 4.0], [0.34, 0.6, 0.34], ZAX);
    }
    for (const x of [-1.7, 2.1]) {
      b.add('rbox', IRON, [x, 2.3, sd * 3.7], [2.2, 1.0, 0.18]);
      for (const rx of [-0.75, 0.75]) b.add('sphLo', GOLD, [x + rx, 2.3, sd * 3.8], [0.2, 0.2, 0.14]);
    }
  }
  // stern: twin glowing exhausts and two smokestacks
  for (const sd of [-1, 1]) {
    b.add('cyl', IRON, [-HL - 0.1, 1.95, sd * 0.95], [1.3, 0.8, 1.3], XAX);
    b.add('cyl', FIRE, [-HL - 0.52, 1.95, sd * 0.95], [0.82, 0.06, 0.82], XAX);
  }
  const funnels = [];
  for (const sd of [-1, 1]) {
    b.cylOn('cyl', BLK, -9.05, D, sd * 1.15, 0.95, 2.4);
    b.cylOn('cyl', RUST, -9.05, D + 2.1, sd * 1.15, 1.06, 0.42);
    funnels.push([-9.05, D + 2.9, sd * 1.15]);
  }
  // four ducted rotors at the corners: rust duct, gold top lip, dark inside, a stator cross and hub; arms to the hull
  const RO = 2.25, RI = 1.68, DY = 3.45, DX = 9.0, DZ = 4.85;
  const duct = latheY([[RO - 0.12, -0.8], [RO, -0.6], [RO, 0.55], [RO - 0.14, 0.78], [RI + 0.14, 0.78], [RI, 0.6], [RI, -0.62], [RI + 0.12, -0.8], [RO - 0.12, -0.8]], 28,
    (cx, cy, cz, nx, ny, nz) => ny > 0.56 ? GOLD : ny < -0.45 ? BLK : (nx * cx + nz * cz) < 0 ? BLK2 : RUST);
  const rotors = [], fan = new Builder(), blade = new Builder();
  blade.add('box', BLADE, [0.98, 0, 0], [1.3, 0.08, 0.52], [0.38, 0, 0]);
  blade.add('box', BLK2, [1.55, 0, 0], [0.18, 0.09, 0.54], [0.38, 0, 0]);
  const bladeG = blade.build();
  for (let i = 0; i < 4; i++) fan.addGeo(bladeG, [0, 0, 0], [0, i * HP, 0]);
  fan.add('cyl', IRON, [0, 0, 0], [0.75, 0.34, 0.75]);
  fan.add('dome', GOLD, [0, 0.16, 0], [0.5, 0.36, 0.5]);
  const fanG = fan.build();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * DX, z = sz * DZ;
    b.addGeo(duct, [x, DY, z]);
    for (const a of [Math.PI / 4, -Math.PI / 4]) b.add('box', BLK, [x, DY - 0.35, z], [RI * 2, 0.16, 0.24], [0, a, 0]);
    b.cylOn('cyl8', BLK2, x, DY - 0.75, z, 0.7, 0.7);
    beam(b, 'rbox', BLK2, [x - sx * 2.4, DY - 0.35, sz * 2.4], [x - sx * 0.6, DY - 0.35, z - sz * (RO - 0.3)], 0.95, 0.8);
    b.add('cyl', GOLD, [x - sx * 0.9, DY - 0.35, z - sz * (RO - 0.05)], [0.9, 0.14, 0.9], [0, sx * sz * Math.PI / 4, HP]);
    rotors.push({ geo: fanG, at: [x, DY + 0.05, z], axis: 'y', speed: 9 * sx * sz });
  }
  // Ironjaw's command tower: rust base with a gold band, black bridge with lit windows, a rust roof
  const TX = -6.0;
  b.add('rbox', RUST, [TX, D + 1.3, 0], [4.2, 2.6, 3.6]);
  b.add('box', GOLD, [TX, D + 2.45, 0], [4.26, 0.16, 3.66]);
  b.add('rbox', BLK, [TX + 2.05, D + 1.2, 0], [0.24, 1.6, 2.4]);
  skullFront(b, TX + 2.22, D + 1.25, 0, 1.15, 0.1);
  b.add('rbox', BLK2, [TX + 0.1, D + 3.25, 0], [3.4, 1.3, 3.0]);
  b.add('box', WIN, [TX + 1.82, D + 3.35, 0], [0.06, 0.36, 2.4]);
  for (const sd of [-1, 1]) b.add('box', WIN, [TX + 0.2, D + 3.35, sd * 1.52], [2.6, 0.36, 0.06]);
  b.add('rbox', RUSTD, [TX + 0.1, D + 4.05, 0], [3.8, 0.3, 3.4]);
  // the skull: bone cranium, black sockets with glowing eyes, black nose, iron jaw with bone teeth and gold bolts
  const SY = D + 5.55, SX = TX + 0.2;
  b.add('sph', BONE, [SX, SY, 0], [2.6, 2.4, 2.5]);
  for (const sd of [-1, 1]) {
    b.add('sph', 0x141414, [SX + 1.12, SY + 0.12, sd * 0.56], [0.5, 0.78, 0.74]);
    b.add('sph', GLOW, [SX + 1.27, SY + 0.12, sd * 0.56], [0.3, 0.46, 0.44]);
  }
  b.add('cone4', 0x141414, [SX + 1.25, SY - 0.38, 0], [0.14, 0.36, 0.3], [0, 0, -HP]);
  b.add('rbox', IRONL, [SX + 0.55, SY - 1.0, 0], [1.75, 0.85, 2.05]);
  for (let i = -2; i <= 2; i++) b.add('box', BONE, [SX + 1.44, SY - 0.75, i * 0.36], [0.06, 0.3, 0.26]);
  for (const sd of [-1, 1]) b.add('sphLo', GOLD, [SX + 0.6, SY - 1.05, sd * 1.04], [0.26, 0.26, 0.2]);
  // captain's bicorne: black crown, gold-rimmed black half-moon, a small white skull
  b.add('rbox', BLK, [SX - 0.1, SY + 1.15, 0], [1.9, 0.6, 2.2]);
  b.add('hcyl', GOLD, [SX - 0.1, SY + 0.95, 0], [4.8, 3.3, 1.1], [0, HP, 0]);
  b.add('hcyl', BLK, [SX - 0.1, SY + 0.95, 0], [4.5, 3.0, 1.38], [0, HP, 0]);
  skullFront(b, SX + 0.62, SY + 1.62, 0, 0.82, 0.1);
  // flag pole behind the skull, the black flag on top
  const FX = TX - 1.55, FT = D + 11.0;
  b.cylOn('cyl8', WOOD, FX, D + 4.2, 0, 0.3, FT - D - 4.0);
  b.add('sphLo', GOLD, [FX, FT + 0.25, 0], [0.45, 0.45, 0.45]);
  jollyRoger(b, FX, FT, 3.3, 2.15);
  const gunS = deckGun(1.0), gunT = deckGun(1.25, true);
  // side guns sit far enough ahead of the tower that a full swing clears it
  const turrets = [{ geo: gunT, at: [6.4, D, 0] }, { geo: gunS, at: [-0.6, D, 2.55] }, { geo: gunS, at: [-0.6, D, -2.55] }];
  return { hull: b.build(), turrets, funnels, len: 26, beam: 12, legs: [], walker: false, rate: 0, rotors, fly: 10, bay, height: FT + 0.5 };
}
