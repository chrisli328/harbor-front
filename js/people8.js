// Round 8 chibi people (owner 2026-11-14 03:27 "the help charcter looks terrible"). The round 6 people were stacked
// boxes (Roblox-like). Top Force's Victor calling HELP (ftue/tf/025) and its soldiers and commander up close (tfimg/00)
// are soft round toys: a big round head about 42% of the height under a hat that is the widest thing seen from above,
// a small egg body, stubby capsule arms and legs, chunky round boots, and a simple face (dark oval eyes with a white
// glint, small brows, a little mouth). Built from spheres, capsules (a cylinder with sphere ends), domes and rounded
// boxes only. Same contract as the old props.js personModel: a Group facing +z, feet at y = 0, about 3.7 tall, with
// userData.arm = a pivot at the right (+x) shoulder holding an arm that hangs along -y at rotation 0 (view.js raises it
// to about 2.55 to wave HELP, rests it at 0.1; the raider holds his cutlass out at about 0.5).
import * as THREE from 'three';
import { Builder, solidMesh } from './look.js';
import { beam, arcGeo, SKIN, EYE, SHOE } from './kit8.js';

export const LOOK = {
  bram: { coat: 0x22325e, coatD: 0x1a274b, trim: 0xffc23a, pants: 0x1b2440, cap: 0xffffff, band: 0x22325e, brim: 0x1a1d24, beard: 0xb5532a, hair: 0xb5532a },
  sailor: { coat: 0xf4f6fa, coatD: 0xd9dee8, trim: 0x2f5fb8, pants: 0xf4f6fa, cap: 0xffffff, band: 0x2f5fb8, brim: null, beard: null, hair: 0x6b4a2e },
  skye: { coat: 0xff7a1f, coatD: 0xe0601a, trim: 0xffffff, pants: 0x2b3f6b, cap: null, band: null, brim: null, beard: null, hair: 0xffd46b },
  // the raider guarding Bram (playtest P2E-03; Top Force 2:17 to 2:23 shows the captive with a guard beside him)
  raider: { coat: 0x9a2f25, coatD: 0x7a241c, trim: 0x2a2a30, pants: 0x3b3029, cap: null, band: 0xd8382c, brim: null, beard: 0x3b2a1e, hair: 0x3b2a1e },
};
const MOUTH = 0x7e2626, CHEEK = 0xf39a86, NOSE = 0xeab08c, GLINT = 0xffffff, PATCH = 0x141418, STEEL = 0xdfe5ec, GRIP = 0x5a3a12, GOLD = 0xffc23a;

// Ellipsoids as [cx, cy, cz, rx, ry, rz]; front() is the z of the surface facing +z at (x, y), so face parts and
// buttons sit on the round head and body instead of floating in front of them.
const HEAD = [0, 2.74, 0.02, 0.81, 0.78, 0.76], BODY = [0, 1.34, 0, 0.68, 0.75, 0.55];
const front = (E, x, y, out = 0) => E[2] + E[5] * Math.sqrt(Math.max(0, 1 - ((x - E[0]) / E[3]) ** 2 - ((y - E[1]) / E[4]) ** 2)) + out;
const ell = (b, c, E) => b.add('sph', c, [E[0], E[1], E[2]], [E[3] * 2, E[4] * 2, E[5] * 2]);
const capsule = (b, c, p0, p1, d) => { beam(b, 'cyl', c, p0, p1, d); b.add('sph', c, p0, [d, d, d]); b.add('sph', c, p1, [d, d, d]); };

function face(b, P, kind) {
  ell(b, SKIN, HEAD);
  for (const s of [-1, 1]) b.add('sphLo', SKIN, [s * 0.79, 2.66, 0.02], [0.22, 0.3, 0.2]); // ears
  const ey = 2.73;
  for (const s of [-1, 1]) {
    const x = s * 0.27;
    if (kind === 'raider' && s < 0) { b.add('sph', PATCH, [x, ey + 0.02, front(HEAD, x, ey, -0.06)], [0.36, 0.34, 0.16]); continue; } // eyepatch
    b.add('sph', EYE, [x, ey, front(HEAD, x, ey, -0.045)], [0.18, 0.26, 0.1]);
    b.add('sphLo', GLINT, [x + 0.04, ey + 0.065, front(HEAD, x + 0.04, ey + 0.065, -0.005)], [0.07, 0.07, 0.04]);
  }
  // brows: worried (inner ends up) on the two calling for help, a scowl on the raider, nearly level on Skye
  const tilt = kind === 'raider' ? -0.42 : kind === 'skye' ? 0.1 : 0.32;
  for (const s of [-1, 1]) b.add('rbox', kind === 'skye' ? 0xc99a3c : P.hair, [s * 0.28, 2.93, front(HEAD, s * 0.28, 2.93, -0.03)], [0.3, 0.08, 0.07], [0, 0, -s * tilt]);
  b.add('sphLo', NOSE, [0, 2.6, front(HEAD, 0, 2.6, -0.04)], [0.17, 0.13, 0.12]);
  for (const s of [-1, 1]) b.add('sphLo', CHEEK, [s * 0.47, 2.55, front(HEAD, s * 0.47, 2.55, -0.03)], [0.2, 0.11, 0.05]);
  if (kind === 'bram') { // full red-brown beard and moustache, shouting mouth in it
    b.add('sph', P.beard, [0, 2.27, 0.27], [1.36, 0.86, 1.0]);
    for (const s of [-1, 1]) {
      b.add('sph', P.beard, [s * 0.15, 2.5, front(HEAD, s * 0.15, 2.5, 0.0)], [0.38, 0.17, 0.16], [0, 0, s * 0.32]);
      capsule(b, P.beard, [s * 0.73, 2.95, 0.1], [s * 0.6, 2.42, 0.32], 0.22); // sideburns
    }
    b.add('sph', MOUTH, [0, 2.38, 0.77], [0.22, 0.16, 0.08]);
  } else if (kind === 'raider') { // short black beard, scowl
    b.add('sph', P.beard, [0, 2.26, 0.3], [1.12, 0.62, 0.88]);
    for (const s of [-1, 1]) b.add('sph', P.beard, [s * 0.15, 2.48, front(HEAD, s * 0.15, 2.48, 0.0)], [0.36, 0.15, 0.15], [0, 0, s * 0.42]);
    b.addGeo(arcGeo(0.12, 0.035, Math.PI, MOUTH), [0, 2.33, 0.76]);
  } else if (kind === 'skye') { // smile
    b.addGeo(arcGeo(0.13, 0.04, Math.PI, MOUTH), [0, 2.49, front(HEAD, 0, 2.42, -0.02)], [0, 0, Math.PI]);
  } else { // shouting
    b.add('sph', MOUTH, [0, 2.4, front(HEAD, 0, 2.4, -0.035)], [0.22, 0.17, 0.08]);
  }
}

function hat(b, P, kind) {
  if (kind === 'bram') { // captain's cap: navy band, wide white crown, black peak, gold cord and badge
    b.add('cyl', P.band, [0, 3.2, -0.02], [1.68, 0.32, 1.62]);
    b.add('cyl', P.cap, [0, 3.46, -0.1], [1.98, 0.22, 1.9]);
    b.add('dome', P.cap, [0, 3.56, -0.1], [1.98, 0.3, 1.9]);
    b.add('cyl', P.brim, [0, 3.1, 0.48], [1.3, 0.08, 0.84], [0.1, 0, 0]);
    b.add('rbox', GOLD, [0, 3.22, 0.8], [0.92, 0.08, 0.07]);
    b.add('sph', GOLD, [0, 3.42, 0.85], [0.4, 0.34, 0.14]);
    ell(b, P.hair, [0, 2.95, -0.3, 0.74, 0.38, 0.52]); // hair at the back under the cap
  } else if (kind === 'sailor') { // round flat sailor cap: wide white crown on a blue band, two ribbon tails behind
    b.add('cyl', P.band, [0, 3.18, -0.02], [1.68, 0.28, 1.62]);
    b.add('sph', P.cap, [0, 3.42, -0.05], [2.0, 0.5, 1.94]);
    for (const s of [-1, 1]) b.add('rbox', P.band, [s * 0.14, 2.86, -0.86], [0.16, 0.56, 0.06], [0.25, 0, s * 0.18]);
    ell(b, P.hair, [0, 2.95, -0.3, 0.74, 0.38, 0.52]);
  } else if (kind === 'raider') { // red bandana over the head, knot and tails at the back, eyepatch strap
    b.add('dome', P.band, [0, 2.86, -0.04], [1.74, 1.62, 1.66], [-0.3, 0, 0]);
    b.add('sph', P.band, [0, 2.98, -0.86], [0.38, 0.32, 0.3]);
    for (const s of [-1, 1]) b.add('rbox', P.band, [s * 0.16, 2.62, -0.86], [0.18, 0.5, 0.07], [0.2, 0, s * 0.35]);
    b.add('cyl', PATCH, [0, 2.73, 0.02], [1.66, 0.07, 1.56], [0, 0, -0.42]);
  } else { // Skye: blonde hair with side-swept bangs and a high ponytail
    ell(b, P.hair, [0, 2.98, -0.16, 0.86, 0.66, 0.84]);
    b.add('sph', P.hair, [-0.22, 3.22, 0.46], [0.86, 0.38, 0.42], [0, 0, 0.32]);
    b.add('sph', P.hair, [0.42, 3.12, 0.4], [0.48, 0.32, 0.36], [0, 0, -0.4]);
    b.add('sph', P.hair, [0, 3.36, -0.82], [0.5, 0.5, 0.5]);
    capsule(b, P.hair, [0, 3.18, -0.98], [0, 2.4, -1.06], 0.44);
    b.add('cyl', 0xff7a1f, [0, 3.3, -0.9], [0.4, 0.12, 0.4], [0.5, 0, 0]);
  }
}

function body(b, P, kind) {
  for (const s of [-1, 1]) { // stubby legs, round boots
    capsule(b, P.pants, [s * 0.27, 0.32, 0], [s * 0.27, 0.68, 0], 0.42);
    b.add('sph', SHOE, [s * 0.28, 0.17, 0.08], [0.48, 0.36, 0.64]);
  }
  ell(b, kind === 'skye' ? P.pants : P.coat, BODY);
  for (const s of [-1, 1]) b.add('sph', kind === 'skye' ? P.pants : P.coat, [s * 0.46, 1.84, 0], [0.5, 0.42, 0.52]); // shoulders
  if (kind === 'bram') { // double-breasted coat: two rows of gold buttons, gold shoulder boards
    for (const y of [1.78, 1.46, 1.14]) for (const x of [-0.19, 0.19]) b.add('sphLo', P.trim, [x, y, front(BODY, x, y, -0.02)], [0.15, 0.15, 0.08]);
    for (const s of [-1, 1]) b.add('rbox', P.trim, [s * 0.5, 2.04, 0], [0.46, 0.13, 0.5], [0, 0, -s * 0.22]);
  } else if (kind === 'sailor') { // blue square collar on the back, blue V in front, red neckerchief
    b.add('rbox', P.trim, [0, 1.86, -0.5], [1.0, 0.62, 0.1], [-0.42, 0, 0]);
    for (const s of [-1, 1]) beam(b, 'rbox', P.trim, [s * 0.4, 2.02, 0.3], [s * 0.02, 1.56, front(BODY, 0, 1.56, -0.01)], 0.14, 0.06);
    b.add('sph', 0xe24a3f, [0, 1.6, front(BODY, 0, 1.6, 0.02)], [0.22, 0.18, 0.14]);
    b.add('cone', 0xe24a3f, [0, 1.4, front(BODY, 0, 1.4, 0.02)], [0.32, 0.34, 0.1], [Math.PI, 0, 0]);
  } else if (kind === 'raider') { // dark lapels, black belt with a gold buckle
    for (const s of [-1, 1]) beam(b, 'rbox', P.coatD, [s * 0.36, 2.0, 0.32], [s * 0.06, 1.18, front(BODY, 0.06, 1.18, -0.01)], 0.16, 0.07);
    b.add('cyl', P.trim, [0, 1.02, 0], [1.24, 0.2, 1.02]);
    b.add('rbox', GOLD, [0, 1.02, front(BODY, 0, 1.02, 0.03)], [0.3, 0.24, 0.08]);
  } else { // Skye: puffy orange life vest with white straps and buckle
    b.add('rbox2', P.coat, [0, 1.5, 0.02], [1.42, 1.02, 1.18]);
    for (const s of [-1, 1]) b.add('rbox', P.trim, [s * 0.22, 1.6, 0.6], [0.12, 0.56, 0.04]);
    b.add('rbox', P.trim, [0, 1.33, 0.6], [0.66, 0.12, 0.04]);
    b.add('rbox', 0xd9dde4, [0, 1.33, 0.62], [0.2, 0.18, 0.04]);
  }
  // left arm hangs at the side
  const sleeve = kind === 'skye' ? P.pants : P.coat;
  capsule(b, sleeve, [-0.66, 1.86, 0], [-0.8, 1.22, 0.04], 0.36);
  if (kind === 'bram') b.add('cyl', P.trim, [-0.8, 1.17, 0.04], [0.4, 0.09, 0.4]);
  if (kind === 'sailor') b.add('cyl', P.trim, [-0.8, 1.17, 0.04], [0.4, 0.1, 0.4]);
  b.add('sph', SKIN, [-0.82, 1.03, 0.05], [0.38, 0.38, 0.38]);
}

// Right arm on a shoulder pivot (origin): hangs along -y at rotation.z = 0, swings out and up as rotation.z grows.
function arm(b, P, kind) {
  capsule(b, kind === 'skye' ? P.pants : P.coat, [0, 0, 0], [0.12, -0.64, 0.02], 0.36);
  if (kind === 'bram' || kind === 'sailor') b.add('cyl', P.trim, [0.13, -0.69, 0.02], [0.4, 0.1, 0.4]);
  b.add('sph', SKIN, [0.14, -0.84, 0.03], [0.4, 0.4, 0.4]);
  if (kind === 'raider') { // cutlass: grip through the fist, gold guard, a broad curved blade reaching forward (flat side up so it reads from above)
    const h = [0.14, -0.84, 0.03];
    beam(b, 'cyl', GRIP, [h[0], h[1], h[2] - 0.16], [h[0], h[1], h[2] + 0.2], 0.12);
    b.add('sph', GOLD, [h[0], h[1], h[2] - 0.2], [0.13, 0.13, 0.13]);
    b.add('rbox', GOLD, [h[0], h[1], h[2] + 0.24], [0.42, 0.1, 0.09]);
    beam(b, 'rbox', STEEL, [h[0], h[1], h[2] + 0.26], [h[0], h[1] + 0.1, h[2] + 0.9], 0.24, 0.07);
    beam(b, 'rbox', STEEL, [h[0], h[1] + 0.1, h[2] + 0.88], [h[0], h[1] + 0.3, h[2] + 1.38], 0.2, 0.07);
  }
}

const GEO = {};
export function chibiModel(kind) {
  if (!LOOK[kind]) kind = 'sailor';
  if (!GEO[kind]) {
    const P = LOOK[kind], b = new Builder(), a = new Builder();
    body(b, P, kind); face(b, P, kind); hat(b, P, kind); arm(a, P, kind);
    GEO[kind] = { body: b.build(), arm: a.build() };
  }
  const g = new THREE.Group(), piv = new THREE.Group();
  g.add(solidMesh(GEO[kind].body));
  piv.position.set(0.66, 1.86, 0); piv.add(solidMesh(GEO[kind].arm)); g.add(piv);
  g.userData.arm = piv;
  return g;
}
export const CHIBI = chibiModel; // props.js personModel draws every person with this
