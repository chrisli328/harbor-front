// Block units: round 8 (owner 2026-11-14 03:27 "i dont need robots and tanks ... helicoter, motherships, drones") routes
// our helicopters, pirate helicopters, drones, motherships and the airship to air8.js and mother8.js (the round 7 tank and
// robots are gone); this file keeps the assembly, the quay crew that carries crafted weapons, and the quay furniture
// (factory counter, distribution table, yellow queue square).
// Same toy block method as models.js: Builder primitives with vertex colours, one merged geometry per moving part.
// Forward is +x, the waterline / ground is y = 0. Imports three and look.js only (models.js imports this file).
import * as THREE from 'three';
import { Builder, PAL, MAT, solidMesh, paint } from './look.js';
import { OURS, NAVY, SLATE, LB, GOLD, GOLDD, TRACK, TRACKL, WHEEL, GUN, IRON, IRONL, RUST, RUSTD, BLK, BLK2, BONE, GLOW, LAMP, SKIN, EYE, SHOE, TAU, HP, XAX, ZAX, sstep, hullGeo, flatGeo, triGeo, starGeo, arcGeo, skull, SKULLS, skullGeo, skullFront, jollyRoger, _q, _e, _v, UP, beam } from './kit8.js';
import { heliSpec, pirateHeliSpec, droneSpec } from './air8.js';
import { seaMotherSpec, airshipSpec, skyMotherSpec } from './mother8.js';

// ---------------------------------------------------------------- unit assembly (boatModel's userData contract)
const SPECS = {};
const DISC_GEO = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
// R-300 round 8 fourth review (pair giant): the pale disc vanished on the light sea, so the pirate helicopters read as boats
// turned diagonally; a smoky dark disc shows on the water (on the black deck the blades still show)
const DISC_MAT = new THREE.MeshBasicMaterial({ color: 0x1b2129, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
function assemble(spec, tier) {
  const g = new THREE.Group(), roll = new THREE.Group(); g.add(roll);
  const hull = solidMesh(spec.hull); roll.add(hull);
  const parts = [], legs = [];
  let spinner = null, treads = null;
  const turrets = spec.turrets.map(t => {
    const m = solidMesh(t.geo); m.position.set(...t.at); m.userData.rest = 0; roll.add(m);
    if (t.spinner) { spinner = solidMesh(t.spinner.geo); spinner.position.set(...t.spinner.at); m.add(spinner); parts.push(spinner); }
    return m;
  });
  for (const l of spec.legs) {
    const p = new THREE.Group(); p.position.set(...l.at); p.rotation.y = l.yaw || 0;
    p.userData = { y0: l.at[1], yaw: l.yaw || 0, axis: l.axis, sgn: l.sgn || 1, off: l.off || 0 };
    const m = solidMesh(l.geo); p.add(m); roll.add(p); legs.push(p); parts.push(m);
  }
  if (spec.treads) { treads = solidMesh(spec.treads.geo); roll.add(treads); parts.push(treads); }
  // round 8: rotors (helicopter blades, drone props, airship screws) spin about their own axis all the time
  const rotors = (spec.rotors || []).map(r => { const m = solidMesh(r.geo); m.position.set(...r.at); m.userData.rotor = { axis: r.axis || 'y', speed: r.speed ?? 30 }; roll.add(m); parts.push(m); return m; });
  // R-300 round 8 third review: Ironjaw's helicopters read as dark spiky boats (thin black blades) and the drones as 10 px
  // red crosses; a pale blur disc over a turning rotor (r.disc = its radius) says "rotor" at phone size. Not in parts, so
  // a hit flash leaves it alone
  for (const r of spec.rotors || []) if (r.disc) { const d = new THREE.Mesh(DISC_GEO, DISC_MAT); d.scale.set(r.disc, 1, r.disc); d.position.set(r.at[0], r.at[1] + 0.12, r.at[2]); d.renderOrder = 6; roll.add(d); }
  // round 8: fliers hover spec.fly above the water (the model is built standing on y = 0)
  if (spec.fly) roll.position.y = spec.fly;
  // funnels on a turning upper body are kept in turret space and moved with it every frame (animate7)
  const funnels = (spec.funnels || []).map(f => f.slice()), funT = [];
  if (spec.funnelsT) for (const f of spec.funnelsT) { const w = [0, 0, 0]; funnels.push(w); funT.push({ base: f, out: w }); }
  g.userData = { roll, hull, turrets, funnels, len: spec.len, beam: spec.beam, tier, legs, parts, walker: !!spec.walker,
    spinner, treads, funT, rotors, fly: spec.fly || 0, bay: spec.bay || null, ph0: Math.random() * TAU, anim: { ph: 0, mv: 0, spin: 0, tread: 0, pitch: spec.treads ? spec.treads.pitch : 1, rate: spec.rate, swing: spec.swing || 0, lift: spec.lift || 0, bob: spec.bob || 0 } };
  placeFunnels(g.userData);
  return g;
}
function placeFunnels(ud) {
  if (!ud.funT.length) return;
  const tm = ud.turrets[0], a = tm.rotation.y, c = Math.cos(a), s = Math.sin(a), p = tm.position;
  for (const f of ud.funT) { const [x, y, z] = f.base; f.out[0] = p.x + c * x + s * z; f.out[1] = p.y + y; f.out[2] = p.z - s * x + c * z; }
}

export { assemble };
export function unit7(key, tier = 1) {
  tier = Math.max(1, Math.min(3, Math.round(tier) || 1));
  // round 8 (owner 2026-11-14 03:27 "i dont need robots and tanks ... helicoter, motherships, drones"): our third shed flies
  // helicopters; from mission 20 the pirate gunship is a helicopter, motherships launch drones, mission 39's leader is an airship
  let kind = null;
  if (key === 'destroyer') kind = 'heli' + tier;
  else if (key === 'boss' && tier === 2) kind = 'seaMother';
  else if (key === 'boss' && tier === 3) kind = 'skyMother';
  else if (key === 'airship' || key === 'robot') kind = 'airship';
  else if (key === 'drone') kind = 'drone';
  else if (key === 'gunship' && tier >= 2) kind = 'pheli' + tier;
  if (!kind) return null;
  if (!SPECS[kind]) {
    SPECS[kind] = kind.startsWith('heli') ? heliSpec(tier) : kind.startsWith('pheli') ? pirateHeliSpec(tier) : kind === 'drone' ? droneSpec()
      : kind === 'seaMother' ? seaMotherSpec() : kind === 'skyMother' ? skyMotherSpec() : airshipSpec();
  }
  return assemble(SPECS[kind], tier);
}

// Per-frame motion, after the view has placed the unit: rotors spin, fliers bob, walkers (none since round 8) swing their legs.
export function animate7(ud, dt, t, moving, firing) {
  const a = ud && ud.anim; if (!a) return;
  dt = Math.min(Math.max(dt || 0, 0), 0.1);
  if (ud.spinner) { a.spin += ((firing ? 20 : 0) - a.spin) * Math.min(1, dt * (firing ? 6 : 1.4)); ud.spinner.rotation.x += a.spin * dt; }
  if (ud.rotors) for (const m of ud.rotors) { const R = m.userData.rotor; m.rotation[R.axis] += R.speed * dt; }
  if (ud.fly) ud.roll.position.y = ud.fly + Math.sin(t * 2.1 + ud.ph0) * Math.max(0.2, ud.fly * 0.04); // round 8: hover bob (view.js dips the nose)
  if (!ud.walker) {
    if (ud.treads && moving) { a.tread = (a.tread + dt * 2.4) % a.pitch; ud.treads.position.x = a.tread; }
    return;
  }
  a.mv += ((moving ? 1 : 0) - a.mv) * Math.min(1, dt * 4);
  a.ph += dt * (a.rate * a.mv + 0.9 * (1 - a.mv));
  const mv = a.mv, idle = 1 - mv;
  for (let i = 0; i < ud.legs.length; i++) {
    const p = ud.legs[i], L = p.userData, s = Math.sin(a.ph + L.off), c = Math.cos(a.ph + L.off);
    const sw = s * a.swing * mv + Math.sin(t * 1.1 + i * 1.7) * 0.03 * idle;
    if (L.axis === 'y') p.rotation.y = L.yaw + L.sgn * sw; else p.rotation.z = sw;
    p.position.y = L.y0 + Math.max(0, c) * a.lift * mv;
  }
  const roll = ud.roll;
  roll.rotation.x = 0;
  roll.rotation.z = Math.sin(a.ph) * 0.025 * mv;
  roll.position.y = Math.abs(Math.cos(a.ph)) * a.bob * mv + Math.sin(t * 1.6) * a.bob * 0.3 * idle;
  placeFunnels(ud);
}

// ---------------------------------------------------------------- quay crew
// personModel's proportions and face (about 3.6 tall), with both legs on hip pivots and both arms on shoulder pivots so
// the crew can walk and carry. Built facing +z like personModel, then turned so the face looks along +x.
const CREW = {
  sailor: { coat: 0xf4f6fa, pants: 0xf4f6fa, trim: 0x2f5fb8 },
  officer: { coat: 0xc9a86a, pants: 0xa88a4e, trim: 0x22325e },
};
const CREWGEO = {};
function crewGeo(kind) {
  if (CREWGEO[kind]) return CREWGEO[kind];
  const P = CREW[kind], b = new Builder();
  b.boxOn('rbox2', P.coat, 0, 1.05, 0, 1.36, 1.3, 0.86);
  b.boxOn('rbox', P.pants, 0, 0.95, 0, 1.2, 0.35, 0.8);
  if (kind === 'sailor') { // blue sailor collar and a red neckerchief
    b.add('box', P.trim, [0, 2.24, -0.12], [1.2, 0.16, 0.72]);
    b.add('cone', 0xe24a3f, [0, 1.95, 0.45], [0.36, 0.42, 0.1], [Math.PI, 0, 0]);
  } else { // khaki shirt: chest pockets, gold buttons, brown belt with a gold buckle, gold shoulder boards, navy tie
    for (const x of [-0.34, 0.34]) b.add('box', P.pants, [x, 1.85, 0.44], [0.36, 0.3, 0.04]);
    b.add('box', P.trim, [0, 1.85, 0.44], [0.16, 0.62, 0.04]);
    b.add('box', 0x5a3a1a, [0, 1.16, 0], [1.42, 0.2, 0.92]);
    b.add('box', GOLD, [0, 1.16, 0.47], [0.26, 0.16, 0.04]);
    for (const x of [-0.6, 0.6]) b.add('box', GOLD, [x, 2.32, 0], [0.34, 0.1, 0.58]);
  }
  b.add('sph', SKIN, [0, 2.92, 0], [1.08, 1.06, 1.0]);
  for (const x of [-0.2, 0.2]) b.add('box', EYE, [x, 3.0, 0.5], [0.12, 0.17, 0.05]);
  b.add('box', 0xc0504a, [0, 2.7, 0.5], [0.26, 0.07, 0.04]);
  if (kind === 'sailor') { // round white sailor cap with a blue band
    b.cylOn('cyl', PAL.white, 0, 3.28, 0, 1.12, 0.36);
    b.add('cyl', P.trim, [0, 3.34, 0], [1.14, 0.12, 1.14]);
  } else { // navy peaked cap, black peak, gold badge
    b.cylOn('cyl', 0x1a1d24, 0, 3.3, 0, 1.12, 0.22);
    b.add('cyl', 0x2a3d72, [0, 3.62, -0.04], [1.34, 0.32, 1.26]);
    b.add('cyl', GOLD, [0, 3.53, -0.04], [1.37, 0.09, 1.29]);
    b.add('box', 0x1a1d24, [0, 3.34, 0.5], [0.96, 0.08, 0.42], [0.22, 0, 0]);
    b.add('box', GOLD, [0, 3.4, 0.68], [0.8, 0.05, 0.08], [0.22, 0, 0]);
    b.add('sph', GOLD, [0, 3.64, 0.6], [0.34, 0.3, 0.12]);
  }
  const leg = new Builder(); // hip at the origin
  leg.boxOn('rbox', P.pants, 0, -0.95, 0, 0.48, 1.05, 0.52);
  leg.boxOn('rbox', SHOE, 0, -1.15, 0.06, 0.5, 0.3, 0.66);
  const arm = new Builder(); // shoulder at the origin
  arm.add('rbox', P.coat, [0, -0.52, 0], [0.4, 1.15, 0.44]);
  arm.add('sph', SKIN, [0, -1.18, 0], [0.42, 0.42, 0.42]);
  return (CREWGEO[kind] = { body: b.build(), leg: leg.build(), arm: arm.build() });
}
export function crewModel(kind = 'sailor') {
  if (!CREW[kind]) kind = 'sailor';
  const G = crewGeo(kind), g = new THREE.Group(), inner = new THREE.Group(), body = new THREE.Group();
  inner.rotation.y = HP; g.add(inner); inner.add(body);
  const parts = [], mesh = geo => { const m = solidMesh(geo); parts.push(m); return m; };
  body.add(mesh(G.body));
  const pv = (geo, x, y, rz) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.z = rz; p.add(mesh(geo)); body.add(p); return p; };
  const legL = pv(G.leg, 0.3, 1.15, 0), legR = pv(G.leg, -0.3, 1.15, 0);
  const armL = pv(G.arm, 0.84, 2.2, 0.1), armR = pv(G.arm, -0.84, 2.2, -0.1);
  // a carried weapon at 0.65 of its counter size: at full size the shell was longer than the sailor's torso, Top Force's
  // carried rifle is about half a soldier tall (refs r7 pick_a)
  const hold = new THREE.Object3D(); hold.position.set(0, 1.15, 1.0); hold.scale.setScalar(0.65); body.add(hold);
  g.userData = { legL, legR, armL, armR, hold, parts, body, kind };
  return g;
}
// Walk cycle (legs and arms swing, a small bob) and the carry pose (both arms reach to the hold point and stay).
export function animateCrew(ud, t, walking, carrying) {
  if (!ud || !ud.legL) return;
  const ph = t * 10, s = walking ? Math.sin(ph) : 0;
  ud.legL.rotation.x = s * 0.6; ud.legR.rotation.x = -s * 0.6;
  ud.body.position.y = walking ? Math.abs(Math.cos(ph)) * 0.12 : Math.sin(t * 2.2) * 0.02;
  if (carrying) {
    const r = -1.0 + (walking ? Math.cos(ph * 2) * 0.04 : 0);
    ud.armL.rotation.x = ud.armR.rotation.x = r;
    ud.armL.rotation.z = 0.06; ud.armR.rotation.z = -0.06;
  } else {
    ud.armL.rotation.x = walking ? -s * 0.55 : Math.sin(t * 2.2) * 0.04;
    ud.armR.rotation.x = walking ? s * 0.55 : -Math.sin(t * 2.2) * 0.04;
    ud.armL.rotation.z = 0.1; ud.armR.rotation.z = -0.1;
  }
}

// ---------------------------------------------------------------- crafted items (person scale, long axis along x)
// R-300 round 7 third look: the gun and the torpedo were mid grey and vanished on the white counter; Top Force's gun on its white
// bench is black (refs r7 pick_a), so the gun is near black and the torpedo a darker steel
const GUNK = 0x2b2e35, STEEL = 0x6a7380, STEELD = 0x3f4650;
const ITEMS = {};
export function itemModel(key = 'gun') {
  if (!ITEMS[key]) {
    const b = new Builder();
    if (key === 'torpedo') {
      const r = 0.28;
      b.add('cyl', STEEL, [-0.05, r, 0], [r * 2, 1.5, r * 2], XAX);
      b.add('sph', 0xe24a3f, [0.7, r, 0], [0.8, r * 2, r * 2]);
      b.add('cyl', 0xe24a3f, [0.55, r, 0], [r * 2 + 0.03, 0.1, r * 2 + 0.03], XAX);
      b.add('cyl', 0x7d8794, [-0.45, r, 0], [r * 2 + 0.02, 0.06, r * 2 + 0.02], XAX);
      b.add('cone', STEEL, [-1.0, r, 0], [r * 2, 0.4, r * 2], [0, 0, HP]);
      b.add('box', STEELD, [-1.0, r, 0], [0.32, 0.04, 0.8]);
      b.add('box', STEELD, [-1.0, r, 0], [0.32, 0.8, 0.04]);
      b.add('sph', 0xc9a24a, [-1.23, r, 0], [0.12, 0.14, 0.14]);
      for (const a of [0.5, 0.5 + Math.PI / 1.5, 0.5 + 2 * Math.PI / 1.5]) b.add('box', 0xd9b45a, [-1.28, r + Math.sin(a) * 0.17, Math.cos(a) * 0.17], [0.05, 0.34, 0.14], [a, 0, 0]);
    } else if (key === 'rocket') { // round 8: the helicopter's rocket (was the tank shell): white body, red nose, navy band, four fins
      const r = 0.34, y = r;
      b.add('cyl', 0xf4f1e8, [-0.25, y, 0], [r * 2, 1.7, r * 2], XAX);
      b.add('cyl', 0x3157a8, [0.2, y, 0], [r * 2 + 0.03, 0.22, r * 2 + 0.03], XAX);
      b.add('cone', 0xe24a3f, [0.95, y, 0], [r * 2, 0.75, r * 2], XAX);
      b.add('cyl', 0x5d6778, [-1.15, y, 0], [r * 1.5, 0.16, r * 1.5], XAX);
      for (let k = 0; k < 4; k++) { const a = k * HP + Math.PI / 4; b.add('box', 0xe24a3f, [-0.9, y + Math.sin(a) * r * 1.15, Math.cos(a) * r * 1.15], [0.5, 0.06, 0.34], [a, 0, 0]); }
    } else { // 'gun': a machine gun lying on its side with its brass belt
      // R-300 round 8: on its olive ammo crate the gun read as a tank turret (crate = hull), so the crate is gone and the gun is a
      // third bigger; still near black for the white counters (round 7 third look)
      const k = 1.3, o = -0.25 * k, y = -0.04 * k, P = (x, yy, z) => [o + x * k, y + yy * k, z * k], Z = (a, bb, c) => [a * k, bb * k, c * k];
      b.add('rbox', GUNK, P(0.1, 0.2, 0), Z(0.85, 0.3, 0.32)); // receiver
      b.add('box', 0x2a2a30, P(0.05, 0.42, 0), Z(0.42, 0.06, 0.07)); // carry handle
      for (const x of [-0.16, 0.26]) b.add('box', 0x2a2a30, P(x, 0.38, 0), Z(0.06, 0.1, 0.07));
      b.add('rbox', PAL.woodD, P(-0.52, 0.18, 0), Z(0.5, 0.24, 0.22), [0, 0, -0.12]); // stock
      b.add('cyl8', GUNK, P(0.85, 0.22, 0), Z(0.26, 0.7, 0.26), XAX); // cooling jacket
      for (const x of [0.62, 0.85, 1.08]) b.add('cyl8', 0x2a2a30, P(x, 0.22, 0), Z(0.28, 0.04, 0.28), XAX);
      b.add('cyl8', GUNK, P(1.4, 0.22, 0), Z(0.12, 0.42, 0.12), XAX);
      b.add('cyl8', 0x2a2a30, P(1.64, 0.22, 0), Z(0.18, 0.12, 0.18), XAX);
      for (let q = 0; q < 5; q++) b.add('cyl8', GOLD, P(0.1 - q * 0.04, 0.08, 0.26 + q * 0.1), Z(0.07, 0.24, 0.07), XAX); // brass belt
    }
    ITEMS[key] = b.build();
  }
  const m = solidMesh(ITEMS[key]); m.userData.key = key;
  return m;
}

// ---------------------------------------------------------------- quay furniture
let TABLE = null, COUNTER = null;
// White folding distribution table (Top Force's white table): about 7 x 2.6, top at 1.6.
export function tableModel() {
  if (!TABLE) {
    const b = new Builder();
    b.add('rbox', PAL.white, [0, 1.49, 0], [7.0, 0.22, 2.6]);
    b.add('box', 0xd7dce4, [0, 1.6, 0], [0.06, 0.02, 2.5]);
    b.add('box', NAVY, [0, 1.32, 0], [6.8, 0.14, 2.4]);
    for (const x of [-2.95, 2.95]) {
      for (const z of [-1.0, 1.0]) b.add('cyl8', 0x9aa3ae, [x, 0.66, z], [0.14, 1.32, 0.14]);
      b.add('cyl8', 0x9aa3ae, [x, 0.3, 0], [0.1, 2.0, 0.1], [HP, 0, 0]);
      for (const z of [-1.0, 1.0]) b.add('cyl8', SHOE, [x, 0.04, z], [0.22, 0.08, 0.22]);
    }
    b.add('cyl8', 0x9aa3ae, [0, 0.3, 0], [0.1, 5.9, 0.1], [0, 0, HP]);
    TABLE = b.build();
  }
  const m = solidMesh(TABLE); m.userData.top = 1.6; return m;
}
// Small white counter in front of a factory: about 4 x 2, top at 1.4.
export function counterModel() {
  if (!COUNTER) {
    const b = new Builder();
    b.add('rbox', NAVY, [0, 0.6, 0], [3.8, 1.2, 1.8]);
    b.add('box', PAL.white, [0, 0.62, 0], [3.82, 0.14, 1.82]);
    b.add('box', 0x24427e, [0, 0.08, 0], [3.84, 0.16, 1.84]);
    b.add('rbox', PAL.white, [0, 1.275, 0], [4.0, 0.25, 2.0]);
    COUNTER = b.build();
  }
  const m = solidMesh(COUNTER); m.userData.top = 1.4; return m;
}
// Yellow-lined rectangle painted on the ground (Top Force's queue square): lines 0.4 wide, 0.06 high, w x d outside.
const PADS = {};
export function queuePadModel(w = 8, d = 6) {
  const k = w + ':' + d;
  if (!PADS[k]) {
    const b = new Builder(), lw = 0.4, h = 0.06;
    for (const sd of [-1, 1]) {
      b.add('box', PAL.paint, [0, h / 2, sd * (d / 2 - lw / 2)], [w, h, lw]);
      b.add('box', PAL.paint, [sd * (w / 2 - lw / 2), h / 2, 0], [lw, h, d - lw * 2]);
    }
    PADS[k] = b.build();
  }
  return solidMesh(PADS[k], MAT.solid, false);
}
