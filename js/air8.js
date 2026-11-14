// Round 8 air units (owner 2026-11-14 03:27 "we need more variarty that is not just ordinary ships, can be helicoter,
// motherships, drones"): our navy helicopter from the Helipad (tiers 1 to 3), Ironjaw's pirate helicopters (a gunship at
// tier 2, a heavy tandem twin-rotor at tier 3) and the small pirate quadcopter drones the motherships launch.
// Same toy block method as units7.js: Builder primitives with vertex colours, one merged geometry per moving part.
// Every aircraft is built standing on y = 0 (skids, wheels or legs); units7.js assemble lifts it by spec.fly.
// Rotor geometries are centred on their own hub so they spin in place. Forward is +x.
import * as THREE from 'three';
import { Builder, PAL, paint } from './look.js';
import { OURS, NAVY, SLATE, LB, GOLD, GOLDD, IRON, IRONL, GUN, RUST, RUSTD, BLK, BLK2, BONE, GLOW, SKIN, TAU, HP, XAX, ZAX, starGeo, skull, skullGeo, jollyRoger, beam } from './kit8.js';

const BLADE = 0x2b2e35, CAB = 0xeef1f5, CAP = 0x2f5fb8, PGLASS = 0x34404f, PGLASSL = 0x8d9db3, FLAG = 0x141418;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- shape helpers
// A smooth ellipsoid (centre c, full size s) cut into horizontal colour bands: bands = [[yTop, colour], ...] from the
// bottom up, the last one runs to the top. Each band is its own sphere slice, so stripe edges are crisp and level.
function egg(b, [cx, cy, cz], [sx, sy, sz], bands, ws = 22) {
  const hy = sy / 2; let yLo = cy - hy;
  for (const [yt, col] of bands) {
    const yTop = Math.min(yt, cy + hy); if (yTop <= yLo + 1e-4) continue;
    const t0 = Math.acos(clamp((yTop - cy) / hy, -1, 1)), t1 = Math.acos(clamp((yLo - cy) / hy, -1, 1));
    const hs = Math.max(1, Math.round((t1 - t0) / (Math.PI / 14)));
    const g = new THREE.SphereGeometry(0.5, ws, hs, 0, TAU, t0, t1 - t0).toNonIndexed(); g.deleteAttribute('uv');
    g.scale(sx, sy, sz).translate(cx, cy, cz);
    b.addGeo(paint(g, col)); yLo = yTop;
  }
}
// A tapered round tube from p0 (radius r0) to p1 (radius r1): tail booms.
const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
function taper(b, col, p0, p1, r0, r1, seg = 12) {
  _d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); const L = _d.length(); _d.normalize();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg).toNonIndexed(); g.deleteAttribute('uv');
  g.applyQuaternion(_q.setFromUnitVectors(UPV, _d)); g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  b.addGeo(paint(g, col));
}
// White skull and crossbones facing +x, leaned back by tilt so it also faces up toward the camera (nose art).
function noseSkull(b, x, y, z, s, tilt, thick = 0.14) { b.addGeo(skullGeo(s, thick, 0x141414).clone().rotateY(HP).rotateZ(tilt).translate(x, y, z)); }
// Riveted patch plate on a side wall (z = side surface), slightly askew.
function patch(b, x, y, z, w, h, col, rivet, rz) {
  const sd = Math.sign(z), c = Math.cos(rz), s = Math.sin(rz);
  b.add('rbox', col, [x, y, z], [w, h, 0.08], [0, 0, rz]);
  for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = px * (w / 2 - 0.13), ly = py * (h / 2 - 0.12);
    b.add('ico0', rivet, [x + lx * c - ly * s, y + lx * s + ly * c, z + sd * 0.05], [0.13, 0.13, 0.08]);
  }
}

// Main rotor centred on its hub (y = 0 is the blade plane): n dark blades of radius R with coloured tips, blade grips,
// a hub and a thin hub cap. Spins about y.
function mainRotor(n, R, w, tip, cap, o = {}) {
  const b = new Builder(), r0 = 0.45, tl = o.tipL ?? 0.6, L = R - r0 - tl, a0 = o.a0 ?? 0;
  b.cylOn('cyl8', IRON, 0, -0.2, 0, o.hub ?? 0.95, 0.36);
  for (let i = 0; i < n; i++) {
    const a = a0 + i * TAU / n, c = Math.cos(a), s = -Math.sin(a);
    b.add('rbox', IRONL, [c * 0.62, 0.02, s * 0.62], [0.75, 0.22, 0.36], [0, a, 0]);
    b.add('rbox', o.blade ?? BLADE, [c * (r0 + L / 2), 0.04, s * (r0 + L / 2)], [L, 0.11, w], [0, a, 0]);
    b.add('rbox', tip, [c * (R - tl / 2), 0.04, s * (R - tl / 2)], [tl, 0.12, w + 0.02], [0, a, 0]);
  }
  b.add('cyl', cap, [0, 0.2, 0], [(o.hub ?? 0.95) * 0.82, 0.1, (o.hub ?? 0.95) * 0.82]);
  b.add('dome', cap, [0, 0.24, 0], [0.5, 0.32, 0.5]);
  return b.build();
}
// Tail rotor centred on its hub, blades in the x-y plane, spinning about z (it sits on the +z side of the fin).
function tailRotor(n, R, tip, hub) {
  const b = new Builder();
  b.add('cyl8', IRON, [0, 0, -0.05], [0.34, 0.3, 0.34], ZAX);
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n, c = Math.cos(a), s = Math.sin(a);
    b.add('rbox', BLADE, [-s * R * 0.42, c * R * 0.42, 0.06], [0.3, R * 0.7, 0.07], [0, 0, a]);
    b.add('rbox', tip, [-s * R * 0.86, c * R * 0.86, 0.06], [0.32, R * 0.26, 0.08], [0, 0, a]);
  }
  b.add('cyl', hub, [0, 0, 0.14], [0.3, 0.1, 0.3], ZAX);
  return b.build();
}
// Landing skid: a runner along x at side z with an upturned front, two struts up into the body.
function skidPair(b, col, strut, x0, x1, z, struts, topZ, topY) {
  for (const sd of [-1, 1]) {
    const zz = sd * z;
    b.add('cyl8', col, [(x0 + x1) / 2, 0.14, zz], [0.28, x1 - x0, 0.28], XAX);
    beam(b, 'cyl8', col, [x1 - 0.02, 0.14, zz], [x1 + 0.45, 0.5, zz], 0.28);
    b.add('sphLo', col, [x0, 0.14, zz], [0.28, 0.28, 0.28]);
    for (const sx of struts) beam(b, 'cyl8', strut, [sx, 0.14, zz], [sx - 0.12, topY, sd * topZ], 0.2);
  }
}

// ---------------------------------------------------------------- our navy helicopter (key 'destroyer', tiers 1..3)
// Top Force's Helipad helicopter, re-painted in our fleet colours: a fat navy egg with the white stripe and the
// red-orange belly, a big bubble canopy with a sailor pilot, a short tail boom with a fin and tail rotor, skids.
// Tier 2: 3 blades, light-blue accents and a rocket pod on each stub wing. Tier 3: 4 blades, gold trim, gold door
// stars and twin pods per side.
export function heliSpec(tier) {
  tier = clamp(Math.round(tier) || 1, 1, 3);
  const b = new Builder(), acc = [PAL.white, LB, GOLD][tier - 1], trim = [null, LB, GOLD][tier - 1];
  // fuselage: belly red-orange, navy, (accent line), white stripe, (gold line), navy top
  const bands = [[1.22, OURS.bottom]];
  if (trim) bands.push([1.62, NAVY], [1.76, trim]); else bands.push([1.76, NAVY]);
  bands.push([2.22, PAL.white]);
  if (tier >= 3) bands.push([2.36, GOLD]);
  bands.push([9, NAVY]);
  egg(b, [0.15, 2.0, 0], [5.6, 3.0, 3.0], bands);
  // bubble canopy over the nose: darker glass low, light glass high, two highlights, the pilot's head and white cap
  egg(b, [1.72, 2.42, 0], [2.85, 2.6, 2.62], [[2.15, PAL.glassD], [9, PAL.glass]]);
  for (const sd of [-1, 1]) b.add('sph', PAL.white, [2.3, 3.42, sd * 0.62], [0.5, 0.2, 0.26], [sd * 0.55, 0, -0.45]);
  b.add('sph', SKIN, [1.4, 3.42, 0], [0.82, 0.8, 0.8]);
  b.cylOn('cyl', PAL.white, 1.4, 3.66, 0, 0.8, 0.22);
  b.add('cyl', CAP, [1.4, 3.71, 0], [0.83, 0.07, 0.83]);
  // engine hump, intakes, twin exhausts, rotor mast
  b.add('rbox2', NAVY, [-0.75, 3.3, 0], [2.2, 0.85, 1.65]);
  b.add('rbox2', acc === PAL.white ? SLATE : acc, [-0.6, 3.74, 0], [1.3, 0.12, 1.05]);
  for (const sd of [-1, 1]) {
    b.add('box', 0x23262c, [-0.45, 3.32, sd * 0.83], [0.8, 0.34, 0.04]);
    b.add('cyl', IRONL, [-1.88, 3.32, sd * 0.42], [0.34, 0.5, 0.34], XAX);
    b.add('cyl', BLK, [-2.1, 3.32, sd * 0.42], [0.22, 0.08, 0.22], XAX);
  }
  b.cylOn('cyl8', IRON, -0.35, 3.6, 0, 0.42, 0.65);
  // doors: a porthole (tiers 1-2) or a gold star (tier 3) above the stripe on both sides
  for (const sd of [-1, 1]) {
    if (tier >= 3) b.addGeo(starGeo(0.46, 0.08, GOLD), [-0.6, 2.82, sd * 1.25], [-sd * 0.5, 0, 0]);
    else {
      b.add('cyl', PAL.white, [-0.6, 2.8, sd * 1.24], [0.74, 0.08, 0.74], [HP - sd * 0.5, 0, 0]);
      b.add('cyl', PAL.glassD, [-0.6, 2.81, sd * 1.27], [0.54, 0.06, 0.54], [HP - sd * 0.5, 0, 0]);
    }
  }
  // tail boom with an accent ring, swept fin, ventral fin, stabiliser with end plates
  taper(b, NAVY, [-2.2, 2.45, 0], [-5.35, 2.82, 0], 0.72, 0.3);
  taper(b, acc, [-4.15, 2.69, 0], [-4.5, 2.73, 0], 0.48, 0.45);
  b.add('rbox', NAVY, [-5.28, 3.62, 0], [0.82, 1.75, 0.24], [0, 0, 0.42]);
  b.add('rbox', acc, [-5.66, 4.42, 0], [0.62, 0.22, 0.28], [0, 0, 0.42]);
  b.add('rbox', NAVY, [-5.15, 2.4, 0], [0.45, 0.7, 0.2], [0, 0, -0.55]);
  b.add('rbox', NAVY, [-4.55, 2.76, 0], [0.75, 0.14, 2.3]);
  for (const sd of [-1, 1]) b.add('rbox', acc === PAL.white ? OURS.bottom : acc, [-4.55, 2.8, sd * 1.15], [0.62, 0.58, 0.1]);
  // skids
  skidPair(b, GUN, IRON, -1.9, 2.05, 1.32, [1.15, -1.0], 0.85, 0.98);
  // stub wings with white rocket pods (tier 2: one per side, tier 3: two per side)
  if (tier >= 2) {
    const pods = tier >= 3 ? [1.9, 2.66] : [2.0], pd = tier >= 3 ? 0.64 : 0.74, wz = tier >= 3 ? 2.0 : 1.72, ww = tier >= 3 ? 1.75 : 1.05;
    for (const sd of [-1, 1]) {
      b.add('rbox', NAVY, [-0.15, 1.5, sd * wz], [1.2, 0.2, ww]);
      if (tier >= 3) b.add('box', GOLD, [0.46, 1.5, sd * wz], [0.04, 0.16, ww]);
      for (const pz of pods) {
        const z = sd * pz, y = 1.5 - 0.12 - pd / 2;
        b.add('box', IRON, [-0.15, 1.36, z], [0.55, 0.22, 0.14]);
        b.add('cyl', CAB, [-0.15, y, z], [pd, 1.85, pd], XAX);
        b.add('cyl', acc, [-0.3, y, z], [pd + 0.04, 0.24, pd + 0.04], XAX);
        b.add('cyl', IRON, [0.79, y, z], [pd * 0.9, 0.06, pd * 0.9], XAX);
        for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + HP; b.add('cone', OURS.bottom, [0.9, y + Math.sin(a) * pd * 0.22, z + Math.cos(a) * pd * 0.22], [0.2, 0.24, 0.2], XAX); }
        b.add('cone', CAB, [-1.3, y, z], [pd, 0.45, pd], [0, 0, HP]);
      }
    }
  }
  if (tier >= 3) { // gold nose badge and gold skid caps
    b.add('sph', GOLD, [2.86, 1.55, 0], [0.24, 0.5, 0.5]);
    for (const sd of [-1, 1]) b.add('sphLo', GOLD, [-1.9, 0.14, sd * 1.32], [0.34, 0.34, 0.34]);
  }
  // chin gun under the nose (turrets[0])
  const t = new Builder();
  t.cylOn('cyl8', IRON, 0, 0, 0, 0.55, 0.32);
  t.add('sph', GUN, [0, -0.05, 0], [0.74, 0.7, 0.74]);
  if (tier >= 3) t.add('cyl', GOLD, [0, -0.05, 0], [0.78, 0.12, 0.78], ZAX);
  for (const z of tier >= 2 ? [-0.15, 0.15] : [0]) {
    t.add('cyl8', GUN, [0.85, -0.08, z], [0.18, 1.3, 0.18], XAX);
    t.add('cyl8', BLK, [1.5, -0.08, z], [0.25, 0.18, 0.25], XAX);
  }
  const blades = [2, 3, 4][tier - 1], F = [1, 1.1, 1.12], f = p => p.map((v, i) => v * F[i]); // chibi: fatter, not longer
  const hull = b.build(); hull.scale(...F); hull.computeBoundingBox(); hull.computeBoundingSphere();
  const tg = t.build(); tg.scale(...F);
  return {
    hull, turrets: [{ geo: tg, at: f([2.35, 0.9, 0]) }], funnels: [], len: 9, beam: 4, legs: [], walker: false, rate: 0,
    rotors: [
      { geo: mainRotor(blades, 5.0, blades === 2 ? 0.66 : 0.6, acc, tier >= 3 ? GOLD : tier === 2 ? LB : NAVY), at: f([-0.35, 4.35, 0]), axis: 'y', speed: 30 },
      { geo: tailRotor(tier >= 3 ? 3 : 2, 1.0, acc === PAL.white ? OURS.bottom : acc, acc), at: f([-5.5, 3.55, 0.36]), axis: 'z', speed: 42 },
    ],
    fly: 7,
  };
}

// ---------------------------------------------------------------- Ironjaw's pirate helicopters (key 'gunship', tiers 2..3)
export function pirateHeliSpec(tier) { return tier >= 3 ? tandemSpec() : gunshipSpec(); }

// Tier 2: a rust and black single-rotor gunship. Blunt black nose with a white skull, dark smoked canopy, black engine
// block with smoke stacks, a rust tail with a black jolly roger on the fin, riveted patch plates, missiles on stub
// wings and a chin gatling (turrets[0]).
function gunshipSpec() {
  const b = new Builder();
  // R-300 round 8 second review: a rust cabin read as one more rust pirate boat in game; the cabin is black, the belly rust
  b.add('rbox2', BLK2, [-0.1, 1.85, 0], [4.6, 2.2, 2.3]);
  b.add('rbox2', RUST, [-0.1, 1.0, 0], [4.5, 0.8, 2.38]);
  b.add('rbox2', BLK, [2.25, 1.55, 0], [2.1, 1.75, 2.12]);
  noseSkull(b, 3.36, 1.58, 0, 0.8, 0.12, 0.2);
  // canopy
  b.add('sph', PGLASS, [1.05, 2.78, 0], [2.7, 1.25, 1.62]);
  for (const sd of [-1, 1]) b.add('sph', PGLASSL, [1.35, 3.25, sd * 0.38], [1.1, 0.14, 0.32]);
  // engine block, exhaust stacks, intakes, mast
  b.add('rbox2', BLK, [-1.0, 3.05, 0], [2.6, 1.0, 1.8]);
  for (const sd of [-1, 1]) {
    beam(b, 'cyl8', BLK2, [-1.9, 3.2, sd * 0.55], [-2.55, 3.95, sd * 0.62], 0.42);
    b.add('cyl8', RUST, [-2.58, 3.98, sd * 0.62], [0.5, 0.16, 0.5], [0, 0, 0.72]);
    b.add('cyl', RUSTD, [-0.35, 3.1, sd * 0.9], [0.62, 0.1, 0.62], [HP, 0, 0]);
    b.add('cyl', BLK2, [-0.35, 3.1, sd * 0.94], [0.4, 0.06, 0.4], [HP, 0, 0]);
  }
  b.cylOn('cyl8', IRON, -0.6, 3.5, 0, 0.42, 0.5);
  // tail: boom with black rings, swept rust fin with a black flag painted on, black stabiliser
  taper(b, RUST, [-2.2, 2.1, 0], [-5.45, 2.6, 0], 0.64, 0.28);
  const by = x => 2.1 - 0.154 * (x + 2.2), br = x => 0.64 + 0.111 * (x + 2.2) + 0.03;
  for (const x of [-3.25, -4.35]) taper(b, BLK, [x, by(x), 0], [x - 0.25, by(x - 0.25), 0], br(x), br(x - 0.25));
  b.add('rbox', RUST, [-5.32, 3.4, 0], [1.15, 1.75, 0.22], [0, 0, 0.38]);
  b.add('rbox', BLK, [-5.72, 4.22, 0], [0.75, 0.2, 0.26], [0, 0, 0.38]);
  b.add('box', FLAG, [-5.35, 3.45, 0], [0.82, 0.6, 0.3]);
  skull(b, -5.35, 3.47, 0, 0.27, 0.34);
  b.add('rbox', BLK, [-4.6, 2.55, 0], [0.7, 0.14, 2.0]);
  // stub wings with a rust missile under each
  for (const sd of [-1, 1]) {
    b.add('rbox', BLK, [-0.3, 1.45, sd * 1.68], [1.3, 0.2, 1.3]);
    const z = sd * 2.0, y = 1.02;
    b.add('box', IRON, [-0.3, 1.27, z], [0.5, 0.2, 0.14]);
    b.add('cyl', RUST, [-0.3, y, z], [0.44, 1.5, 0.44], XAX);
    b.add('cone', BLK, [0.68, y, z], [0.44, 0.48, 0.44], XAX);
    b.add('box', BLK, [-0.95, y, z], [0.36, 0.68, 0.05]);
    b.add('box', BLK, [-0.95, y, z], [0.36, 0.05, 0.68]);
  }
  // riveted patch plates on both sides
  for (const sd of [-1, 1]) {
    patch(b, -1.25, 2.25, sd * 1.16, 0.95, 0.66, IRONL, BLK, sd * 0.12);
    patch(b, 0.55, 1.75, sd * 1.16, 0.72, 0.5, RUSTD, IRONL, -sd * 0.1);
  }
  skidPair(b, BLK, RUSTD, -1.8, 1.85, 1.28, [1.0, -1.0], 0.85, 0.85);
  // chin gatling (turrets[0])
  const t = new Builder();
  t.cylOn('cyl8', IRON, 0, 0, 0, 0.6, 0.3);
  t.add('rbox', RUSTD, [0.05, -0.08, 0], [0.85, 0.55, 0.78]);
  t.add('cyl8', BLK, [0.6, -0.12, 0], [0.42, 0.3, 0.42], XAX);
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3; t.add('cyl8', GUN, [1.25, -0.12 + Math.sin(a) * 0.11, Math.cos(a) * 0.11], [0.12, 1.25, 0.12], XAX); }
  t.add('cyl8', BLK, [1.75, -0.12, 0], [0.4, 0.12, 0.4], XAX);
  return {
    hull: b.build(), turrets: [{ geo: t.build(), at: [2.2, 0.62, 0] }], funnels: [], len: 9, beam: 4, legs: [], walker: false, rate: 0,
    rotors: [
      { geo: mainRotor(3, 4.8, 0.6, RUST, RUSTD, { blade: BLK2 }), at: [-0.6, 4.05, 0], axis: 'y', speed: 28, disc: 4.8 },
      { geo: tailRotor(2, 0.95, RUST, RUSTD), at: [-5.5, 3.3, 0.34], axis: 'z', speed: 42 },
    ],
    fly: 6.5,
  };
}

// Tier 3: the heavy tandem twin-rotor (Top Force's red twin-rotor aircraft). A long rust and black fuselage on four
// wheels, a low front rotor and a high rear rotor turning opposite ways, engines on the rear tower, fuel sponsons,
// gold trim, a white skull on the nose, portholes, a jolly roger at the tail and two door guns (turrets 0 and 1).
function tandemSpec() {
  const b = new Builder();
  // R-300 round 8 second review: black hull, rust belly (a rust hull read as one more pirate boat beside them in game)
  b.add('rbox', BLK2, [-0.3, 2.15, 0], [9.6, 2.7, 2.6]);
  b.add('rbox', RUST, [-0.3, 1.02, 0], [9.4, 0.8, 2.68]);
  b.add('box', GOLD, [-0.3, 2.38, 0], [6.6, 0.14, 2.66]);
  // nose: black, smoked windscreen, white skull below it
  b.add('rbox2', BLK, [4.55, 1.95, 0], [2.4, 2.45, 2.5]);
  b.add('sph', PGLASS, [4.95, 2.75, 0], [1.85, 1.05, 2.3]);
  for (const sd of [-1, 1]) b.add('sph', PGLASSL, [5.45, 3.0, sd * 0.55], [0.6, 0.14, 0.38], [0, 0, -0.5]);
  noseSkull(b, 5.78, 1.62, 0, 0.92, 0.32, 0.16);
  // front pylon (low rotor) and the tall rear tower (high rotor) with its two engines
  // R-300 round 8 fourth review (pair giant): from our camera the rust pylon, tower and sponsons were most of what showed, so
  // the tandems read as one more rust pirate boat; they are black with gold trim (rust stays on the belly)
  b.add('rbox2', BLK, [3.3, 3.62, 0], [1.9, 0.95, 1.55]);
  b.add('box', GOLD, [3.3, 3.62, 0], [1.94, 0.1, 1.59]);
  b.cylOn('cyl8', IRON, 3.3, 3.95, 0, 0.42, 0.55);
  b.add('rbox2', BLK, [-3.5, 4.05, 0], [2.8, 2.1, 1.9]);
  b.add('rbox2', BLK, [-3.5, 5.0, 0], [2.4, 0.35, 1.6]);
  b.cylOn('cyl8', IRON, -3.5, 5.05, 0, 0.42, 0.6);
  for (const sd of [-1, 1]) {
    b.add('cyl', BLK, [-3.35, 3.75, sd * 1.25], [0.85, 2.3, 0.85], XAX);
    b.add('cyl', GOLD, [-2.2, 3.75, sd * 1.25], [0.9, 0.12, 0.9], XAX);
    b.add('cyl', RUSTD, [-2.15, 3.75, sd * 1.25], [0.62, 0.06, 0.62], XAX);
    b.add('cyl', IRONL, [-4.6, 3.75, sd * 1.25], [0.6, 0.3, 0.6], XAX);
  }
  // fuel sponsons along the lower sides with a gold top line, rivets
  for (const sd of [-1, 1]) {
    b.add('rbox2', BLK, [-0.9, 1.25, sd * 1.5], [5.4, 0.95, 0.75]);
    b.add('box', GOLD, [-0.9, 1.7, sd * 1.5], [5.0, 0.06, 0.6]);
    for (let x = -3.0; x <= 1.3; x += 1.05) b.add('ico0', GOLD, [x, 1.25, sd * 1.88], [0.16, 0.16, 0.1]);
  }
  // side: an open door behind each door gun, three gold-rimmed portholes, a patch plate
  for (const sd of [-1, 1]) {
    b.add('rbox', BLK2, [2.35, 1.95, sd * 1.3], [1.35, 1.4, 0.1]);
    for (const x of [-0.2, -1.4, -2.6]) {
      b.add('cyl', GOLD, [x, 2.85, sd * 1.3], [0.62, 0.06, 0.62], [HP, 0, 0]);
      b.add('cyl', PGLASS, [x, 2.85, sd * 1.32], [0.46, 0.06, 0.46], [HP, 0, 0]);
    }
    patch(b, 0.9, 2.85, sd * 1.31, 0.8, 0.5, IRONL, BLK, sd * 0.12);
  }
  // rear: loading ramp, jolly roger on a short mast
  b.add('rbox', BLK2, [-5.12, 1.75, 0], [0.4, 1.7, 2.1], [0, 0, -0.25]);
  b.cylOn('cyl8', IRON, -5.0, 3.1, 0, 0.12, 1.7);
  b.add('sphLo', GOLD, [-5.0, 4.85, 0], [0.24, 0.24, 0.24]);
  jollyRoger(b, -5.0, 4.75, 1.3, 0.85);
  // four wheels on short legs
  for (const [x, z] of [[3.3, 1.0], [-2.9, 1.55]]) for (const sd of [-1, 1]) {
    beam(b, 'cyl8', IRON, [x, 0.42, sd * z], [x, 1.0, sd * (z - 0.25)], 0.2);
    b.add('cyl', BLK, [x, 0.4, sd * z], [0.8, 0.36, 0.8], ZAX);
    b.add('cyl', GOLD, [x, 0.4, sd * (z + 0.17)], [0.36, 0.05, 0.36], ZAX);
  }
  // door gun (turrets 0 and 1): pintle post, receiver, barrel with a gold muzzle, ammo box
  const t = new Builder();
  t.cylOn('cyl8', IRON, 0, -0.55, 0, 0.16, 0.55);
  t.add('rbox', BLK, [0.15, 0.12, 0], [0.8, 0.4, 0.34]);
  t.add('rbox', RUST, [0.05, 0.02, 0.3], [0.45, 0.4, 0.26]);
  t.add('cyl8', GUN, [1.05, 0.16, 0], [0.18, 1.25, 0.18], XAX);
  t.add('cyl8', GOLD, [1.68, 0.16, 0], [0.27, 0.16, 0.27], XAX);
  t.add('box', IRON, [-0.36, 0.0, 0], [0.12, 0.34, 0.12]);
  const dg = t.build();
  return {
    hull: b.build(), turrets: [{ geo: dg, at: [2.4, 2.05, 1.5] }, { geo: dg, at: [2.4, 2.05, -1.5] }], funnels: [], len: 12, beam: 4, legs: [], walker: false, rate: 0,
    rotors: [
      { geo: mainRotor(3, 4.0, 0.6, GOLD, GOLD, { blade: BLK2 }), at: [3.3, 4.6, 0], axis: 'y', speed: 26, disc: 4.0 },
      { geo: mainRotor(3, 4.0, 0.6, GOLD, GOLD, { blade: BLK2, a0: Math.PI / 3 }), at: [-3.5, 5.75, 0], axis: 'y', speed: -26, disc: 4.0 },
    ],
    fly: 6.5,
  };
}

// ---------------------------------------------------------------- pirate attack drone (key 'drone')
// A small black quadcopter: a round black body with one big glowing red eye on the front and a white skull on top,
// four arms with rust prop guards and spinning props, two little legs. Launched by the motherships.
export function droneSpec() {
  const b = new Builder();
  b.add('sph', BLK, [0, 1.1, 0], [1.6, 1.2, 1.6]);
  b.add('cyl', RUSTD, [0, 0.92, 0], [1.66, 0.18, 1.66]);
  // one big eye on the upper front, tilted up so it shows from above: iron socket, glowing red ball, a white glint
  const EA = 0.6, ex = 0.5, ey = 1.38;
  b.add('cyl', IRON, [ex, ey, 0], [1.0, 0.24, 1.0], [0, 0, -HP + EA]);
  b.add('sph', GLOW, [ex + Math.cos(EA) * 0.1, ey + Math.sin(EA) * 0.1, 0], [0.84, 0.84, 0.84]);
  b.add('sph', BONE, [ex + 0.2, ey + 0.4, 0.17], [0.16, 0.12, 0.16]);
  // white skull lying on top behind the eye, its crown toward the tail so it reads upright when the drone flies at the camera
  b.addGeo(skullGeo(0.44, 0.1, 0x141414).clone().rotateX(-HP).rotateY(HP).translate(-0.38, 1.66, 0));
  // arms, motors, prop guards (the props spin as rotors)
  const P = 0.95, PY = 1.45, at = [];
  // R-300 round 8 fourth review (pair mother20): black drones with rust guards sank into the black deck and the red rings; gold guards
  const RING = paint((() => { const g = new THREE.TorusGeometry(0.6, 0.085, 6, 18).rotateX(HP).toNonIndexed(); g.deleteAttribute('uv'); return g; })(), GOLD);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    beam(b, 'rbox', BLK2, [sx * 0.45, 1.15, sz * 0.45], [sx * P, PY - 0.12, sz * P], 0.22);
    b.cylOn('cyl8', IRON, sx * P, PY - 0.32, sz * P, 0.3, 0.32);
    b.addGeo(RING, [sx * P, PY + 0.02, sz * P]);
    at.push([sx * P, PY + 0.04, sz * P]);
  }
  // two little legs
  for (const sd of [-1, 1]) { beam(b, 'cyl8', BLK2, [0, 0.7, sd * 0.4], [0, 0.08, sd * 0.62], 0.12); b.add('rbox', BLK2, [0, 0.06, sd * 0.62], [0.7, 0.1, 0.16]); }
  const pr = new Builder();
  for (const a of [0, Math.PI]) {
    pr.add('rbox', BLADE, [Math.cos(a) * 0.24, 0, -Math.sin(a) * 0.24], [0.46, 0.06, 0.2], [0, a, 0]);
    pr.add('rbox', BONE, [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], [0.12, 0.07, 0.21], [0, a, 0]);
  }
  pr.add('cyl8', RUST, [0, 0.02, 0], [0.18, 0.1, 0.18]);
  const prop = pr.build();
  return {
    hull: b.build(), turrets: [], funnels: [], len: 3, beam: 3, legs: [], walker: false, rate: 0,
    rotors: at.map((p, i) => ({ geo: prop, at: p, axis: 'y', speed: i % 2 ? -44 : 44, disc: 0.62 })),
    fly: 4.5,
  };
}
