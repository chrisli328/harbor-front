// Story props in the same block style as the boats (owner 2026-11-12: the flat painted Bram on a rock and the big
// flat gift "looks very confusing" / "i think bugged"). Top Force shows its captive, the soldier calling HELP and
// the gift as small 3D figures standing on the ground at unit scale (emulator shots 006, 025, 059), so these are too.
// Units: a gunboat is 8 long; a person is about 3.6 tall before the prop scale.
import * as THREE from 'three';
import { Builder, PAL, solidMesh, paint } from './look.js';
import { boatModel } from './models.js';
import { chibiModel } from './people8.js';

// Round 8 (owner 2026-11-14 03:27 "the help charcter looks terrible"): the people are now Top Force style chibi toys,
// built in people8.js (same contract: facing +z, feet at y = 0, about 3.7 tall, userData.arm = the right shoulder pivot).
export function personModel(kind) { return chibiModel(kind); }

// Grey rock islet the captive stands on: a low rounded top with clear space round him (round 8: the washed-up plank
// read as a second post beside him at game zoom, so it is gone).
const ROCK_TOP = 0.96; // where feet go on the middle of the rock
const ROPE = paint(new THREE.TorusGeometry(0.5, 0.045, 6, 22).toNonIndexed().deleteAttribute('uv'), PAL.rope); // thin rope ring (the look.js torus is too fat)
export function rockModel() {
  const b = new Builder();
  b.add('ico', PAL.rock, [0, -0.25, 0], [5.6, 2.5, 5.0]);
  b.add('ico', PAL.rockD, [1.9, -0.45, -1.5], [2.8, 1.7, 2.6]);
  b.add('ico', 0xb3b9c0, [-2.1, -0.5, 1.2], [2.4, 1.4, 2.2]);
  b.add('ico', PAL.rockD, [-1.4, -0.5, -1.9], [1.8, 1.1, 1.7]);
  return solidMesh(b.build());
}

// Log raft with a stub mast and a torn white cloth.
export function raftModel() {
  const b = new Builder();
  for (let i = 0; i < 4; i++) b.add('cyl8', i % 2 ? PAL.woodD : PAL.wood, [0, 0.2, -1.5 + i * 1.0], [0.95, 5.2, 0.95], [0, 0, Math.PI / 2]);
  for (const x of [-1.7, 1.7]) b.add('box', PAL.rope, [x, 0.25, 0], [0.22, 1.05, 4.1]);
  b.add('cyl8', PAL.woodD, [-1.6, 1.9, -1.0], [0.22, 3.4, 0.22]);
  b.add('box', 0xf4f1ea, [-1.0, 2.8, -1.0], [1.2, 1.1, 0.06], [0, 0, 0.08]);
  return solidMesh(b.build());
}

// Small jet ski (Skye arrives on one before the mission-40 fight).
export function jetSkiModel() {
  const b = new Builder();
  b.add('rbox2', 0xffffff, [0, 0.45, 0], [4.6, 0.9, 1.9]);
  b.add('rbox2', 0xff7a1f, [0.4, 0.95, 0], [3.4, 0.5, 1.7]);
  b.add('cone', 0xffffff, [2.7, 0.45, 0], [1.6, 1.4, 0.8], [0, 0, -Math.PI / 2]);
  b.add('rbox', 0x24262d, [-0.5, 1.3, 0], [1.9, 0.36, 0.9]);
  b.add('box', 0x24262d, [1.2, 1.7, 0], [0.18, 0.9, 0.18], [0, 0, -0.4]);
  b.add('box', 0x24262d, [1.4, 2.1, 0], [0.16, 0.16, 1.5]);
  return solidMesh(b.build());
}

// Navy gift box with a gold ribbon and bow (the first-gift and the drop on a new building).
export function giftModel() {
  const b = new Builder(), N = 0x2b4f9e, NL = 0x3a63b8, GD = PAL.gold;
  b.add('rbox', N, [0, 1.1, 0], [2.6, 2.2, 2.6]);
  b.add('rbox', NL, [0, 2.3, 0], [2.86, 0.55, 2.86]);
  b.add('box', GD, [0, 1.3, 0], [0.56, 2.66, 2.68]);
  b.add('box', GD, [0, 1.3, 0], [2.68, 2.66, 0.56]);
  for (const s of [-1, 1]) b.add('torus', GD, [s * 0.55, 2.88, 0], [1.25, 1.25, 2.4], [0, Math.PI / 2, s * 0.5]);
  b.add('sph', 0xffb21a, [0, 2.75, 0], [0.55, 0.45, 0.55]);
  return solidMesh(b.build());
}

// Wooden chest with gold bands (on a beaten outpost).
export function chestModel() {
  const b = new Builder(), W = 0xa0632f, WD = 0x7a4722, GD = PAL.gold;
  b.add('rbox', W, [0, 0.9, 0], [3.6, 1.8, 2.5]);
  b.add('hcyl', WD, [0, 1.8, 0], [2.5, 1.9, 3.6], [0, Math.PI / 2, 0]);
  for (const x of [-1.2, 1.2]) { b.add('box', GD, [x, 0.95, 0], [0.32, 1.86, 2.58]); b.add('hcyl', GD, [x, 1.82, 0], [2.6, 2.0, 0.34], [0, Math.PI / 2, 0]); }
  b.add('rbox', GD, [0, 1.62, 1.3], [0.7, 0.8, 0.2]);
  b.add('box', 0x5a3a12, [0, 1.52, 1.42], [0.16, 0.3, 0.04]);
  return solidMesh(b.build());
}

export function propModel(kind) {
  switch (kind) {
    case 'gift': return giftModel();
    case 'chest': return chestModel();
    // captive (playtest P2E-03: on a bare rock he read as scenery): tied to a post, a raider with a cutlass beside him.
    // Round 8: chibi Bram drawn bigger (1.55) in clear space on the middle of the rock; the guard stands on his own ledge
    // off to the screen right and a little behind (the game does not turn this prop), so the two never overlap.
    case 'bram': { const g = propModel('bram-free'), p = g.userData.person, b = new Builder();
      b.add('cyl8', PAL.woodD, [0, 1.25, -0.82], [0.4, 3.1, 0.4]);
      b.add('sph', PAL.woodD, [0, 2.8, -0.82], [0.42, 0.2, 0.42]);
      for (const y of [1.08, 1.4, 1.72]) { // three turns of rope hugging his round coat and going round the post behind him
        const k = Math.sqrt(1 - ((y - 1.34) / 0.75) ** 2), fz = 0.55 * k + 0.04, bz = -1.05;
        b.addGeo(ROPE, [0, y, (fz + bz) / 2], [Math.PI / 2, 0, 0], [2 * (0.68 * k + 0.05), fz - bz, 1]);
      }
      p.add(solidMesh(b.build()));
      const r = personModel('raider'); r.position.set(4.1, 0.52, 1.75); r.scale.setScalar(1.3); g.add(r); g.userData.guard = r;
      const ledge = new Builder(); // the guard's lower ledge, one islet with Bram's rock
      ledge.add('ico', PAL.rock, [4.1, -0.45, 1.75], [3.4, 1.95, 3.0], [0, -Math.PI / 4, 0]);
      ledge.add('ico', 0xb3b9c0, [2.5, -0.5, 1.0], [2.6, 1.5, 2.3], [0, 0.4, 0]);
      ledge.add('ico', PAL.rockD, [5.3, -0.5, 0.6], [1.7, 1.1, 1.6]);
      g.add(solidMesh(ledge.build()));
      return g; }
    case 'bram-free': { const g = new THREE.Group(), r = rockModel(), p = personModel('bram'); p.position.y = ROCK_TOP; p.scale.setScalar(1.55); g.add(r, p); g.userData.arm = p.userData.arm; g.userData.person = p; return g; }
    case 'sailor': { const g = new THREE.Group(), r = raftModel(), p = personModel('sailor'); p.position.set(0.5, 0.62, 0.4); p.scale.setScalar(1.4); g.add(r, p); g.userData.arm = p.userData.arm; g.userData.person = p; return g; }
    case 'skye': { const g = new THREE.Group(), j = jetSkiModel(), p = personModel('skye'); p.position.set(-0.5, 0.45, 0); p.rotation.y = Math.PI / 2; p.scale.setScalar(0.92); g.add(j, p); g.userData.arm = p.userData.arm; g.userData.person = p; return g; }
    case 'p-sailor': return personModel('sailor');
    case 'p-bram': return personModel('bram');
    // cold-open boats (Top Force 0:02 to 0:12: a squad flees into the base, the enemy chasing): scripted, not in the rules
    case 'boat-gunboat': return boatModel('gunboat', 1);
    case 'boat-raider': return boatModel('raider', 1);
    case 'boat-boss': return boatModel('boss', 3); // Ironjaw's flying mothership comes in before the mission-40 fight (Top Force 12:21 its giant robot; round 8 owner "i dont need robots")
    // Bram's pickup after the outpost falls (Top Force 6:30 to 6:58: Victor walks out and heads for the base)
    case 'rock': return rockModel();
    case 'bram-ride': { const g = new THREE.Group(), b = boatModel('gunboat', 1), p = personModel('bram'); p.position.set(-2.9, 1.2, 0); p.scale.setScalar(1.2); g.add(b, p); g.userData.arm = p.userData.arm; g.userData.person = p; return g; } // on the open stern, same size as on the rock
    default: throw new Error('prop ' + kind);
  }
}
