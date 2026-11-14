// Harbor Front game rules. No DOM here: the same code runs the page, the bots and the node balance script.
// Core loop copied from Top Force: Commander (tutorial video Emo7e_uDwbA): no merging; each shed launches boats
// on a timer, boats sail out on their own and fight raiders streaming from the zone outpost; kills drop gold;
// gold upgrades sheds; milestone levels give stars; stars plus two requirements upgrade the HQ; every HQ level
// opens a boost path unlocked star by star. Missions run back to back, a boss closes zone 2, a countdown
// (INCOMING) starts with zone 3, and mission 40 is a manual FIGHT on a separate battlefield.
import { ZONES, FRONTS, SLIPS, isWater, TURRET_AT, GATE, ARMORY, LINES, lineCircle } from './world.js';

export const TUNE = {
  enemyHp: 1,          // QA difficulty multiplies this one number
  spawnGap: 0.75, betweenT: 2, waveGap: 1.5, costGrow: 1.1, z3Hp: 1.1, dmgBase: 7, dmgGrow: 1.075, lvDmg: 0.13,
  // round 9 (owner 2026-11-14 07:24 "are you sure the balancing is right? ... compare to reference 1 to 1"): Top Force's red
  // shows 3 hp at 0:38 (mission 1), 8 to 17 at 1:37 (mission 6), 41 at mission 10 (big red 197) and 153 at mission 22, so a
  // red grows 1.30x a mission through the gate and 1.116x after; every early red falls to one rifle shot (30)
  // past mission 22 (the last red we have a number for) hpGrow3 keeps missions 21 to 39 near Top Force's 20 s each
  hpBase: 4, hpGrow: 1.3, hpGrow2: 1.116, hpGrow3: 1.04,
  // kill gold through the gate: Top Force spends 99 gold on Rifle 1 to 20 and Grenade 1 to 9 by 1:57 with gold at 1, and the
  // gate pays +104 (gateGold); goldGrow2 carries it on past mission 10 (mission 10 took gold 55 to 165)
  // Top Force's spend fixes the shape (quests about +10 each, play-log 042-046): Rifle Lv.10 (32 gold) by 1:01, Rifle Lv.20
  // (51 more) by 1:21, then only Grenade 1 to 9 (16) by 1:57 with gold at 1 from 1:35 to 1:49 and 11 before the +104: the
  // first groups pay, groups 4 and 5 pay most, the last four hardly at all. Gold per kill for each of the nine groups
  goldBase: 1, goldGrow: 1.105, goldGate: [2.3, 2.3, 2.3, 4.4, 4.4, 0.5, 0.5, 0.5, 0.5],
  // round 9 (owner "enemy ships stills moving like in the face instead of shooting in the distance"): Top Force's reds walk
  // in and stop as soon as a soldier is in their reach, 0.3 to 0.42 screen widths off (refs f1 s0038, s0097, s0254); our
  // boats hold a line and step out at most lineStep toward a red they can not reach
  lineStep: 12,
  // round 9: how far past the front row a boat may step; the glowing line is drawn 2 further out (view.js)
  lineOut: 2,
  // R-300 round 9 second look: spots along the line this far apart (sim lineSlots); a helicopter holds heliBack inside it, as it
  // flies 7 up and so is drawn about 5.5 further out than where it hovers (sheet-f3 4:41 to 4:53: two straddled the line)
  lineGap: 12, heliBack: 8,
  // after the gate Top Force runs no mission until the Tank Factory is up (2:13 last red, 3:09 factory, 3:21 Mission-10);
  // ours waits for Helicopter Lv.10 (Top Force starts it at Tank Lv.10), or m10Wait seconds at most
  m10Wait: 70,
  // Top Force's missions 10 to 19 run about 12 s each in three waves (3:21 Mission-10 to 5:20 Mission-20): the next wave
  // leaves once two are left or waveNext s after the last one did
  waveNext: 2.5,
  goldMul: 1,
  incoming: 14 * 60,   // Top Force: INCOMING 13:57 at mission 22 (7:20) -> 7:53 at mission 40 (12:55)
  holdIncoming: true,  // L30: the tutorial never lets INCOMING run out (QA turns this off to test the armada)
  // round 6 gate stretch (missions 1 to 9, world.js GATE): a group's raiders come in this far apart, and the next group
  // sets out once this few are left or this many seconds after the last one did (Top Force 0:40 to 2:10: 42 in about 90 s)
  // round 6 full recording: Top Force holds the 42 for 100 s (0:35 to 2:15) with up to 8 reds in view; ours took 87 s
  // with at most 5, because the boats sank each raider in about 3 s. Gate raiders now take 2.5x the hits (gateHp) and the
  // next group waits for 2 left or 11 s: the node bot holds 101 s with up to 7 reds
  // round 6 playthrough: a group comes in as a bunch (gateGap 0.3 s, gateLane apart across the path)
  // round 9: gate raiders no longer take 2.7x the hits (Top Force's gate reds die to one shot) and the gate pays Top Force's +104
  // Top Force's 42 come in nine groups over 108 s (0:25 first red, 2:13 last; ours sim 5 to 113): one group every 11 to 12 s,
  // so the next group waits gateMin s even when the last one is already down
  gateGap: 0.3, gateLane: 4.2, gateNext: 2, gateMin: 12, gateWait: 15, gateFirst: 5, gateHp: 1, gateGold: 104,
  // round 6 review: mission 20's escort stream (missionTick) and how far a boat sails to join a fight that is already on
  // (escorts 8x hp every 0.7 s up to 10 out. Once the boats went for the flagship first (shipsTick), boss 90 lived 17 s;
  // 280 gives mission 20 61 s with 8 reds out on average for the node bot (Top Force 64 s, 9). Escorts hit at 0.3x:
  // they are the crowd, not the threat; at full damage the careless bot, 4 to 5 boats, sat 371 s at mission 20, at 0.3x 158 s.
  // Recording F: at 280 the browser flagship took damage 31 s (mission 19 to 20 50 s against Top Force's 64; the browser
  // fleet hits harder than the node bot's), so 380: node 80 s, careless bot 208 s). After boats that are blocked shoot the
  // escort in the way (shipsTick), recording H at 300 ran mission 19 to 20 in 48 s (flagship took damage 34 s), so 450:
  // node good bot 100 to 112 s, careless bot 216 s). Recordings J and K at 450 ran it in 86 s against Top Force's 64: the
  // escorts (40, up to 10 out) end about 65 s in either way and the flagship then took 20 s alone. A mission-20 jump at 360
  // took 76 s; at 240 the flagship goes down about when the last escorts do (node good bot 76 to 78 s, careless 158 to 165)
  // round 8: the mission 39 airship's drones (missionTick)
  airDroneGap: 5, airDrones: 3,
  // round 9: with Top Force's damage the old 240 / escorts 8x held mission 20 six minutes (good bot); Top Force's mission 20
  // runs 65 s (5:20 to 6:25), escorts are plain reds (153 at mission 22): node good bot 41 to 53 s
  bossHp: 40, bossEsc: 40, bossEscGap: 0.7, bossEscMax: 10, bossEscHp: 1, bossEscDmg: 0.3,
  // missions 10 to 19 (spawnGap2) and 21 to 39 (spawnGap3): once every boat joins the fight, missions 10 to 19 ran 11 s
  // and the flagship came 30 s before Top Force's (5:20); Top Force has 0 to 5 reds out in 10 to 19 and 0 to 8 later, so
  // the raiders come further apart rather than more of them. Node bot: mission 19 at 236 s, 25 to 33 in 128 s (Top
  // Force 141), 33 to 39 in 103 s (98), at most 6 reds out after mission 20, fights 0.56 base widths off (0.4)
  // Recording F: with the whole fleet joining, missions 21 to 39 had at most 5 reds on screen (Top Force 9) at 19.3 s a
  // mission (18.5); one more raider every 3 missions, 0.7 s apart: node most reds out 5.7 to 8.6 a mission, mission 39
  // 629 to 620 s, fights off the base unchanged (0.56 / 0.82 base widths for 21 to 30 / 31 to 39)
  spawnGap2: 0.8, spawnGap3: 0.7,
  // missions 21 to 39 gain one raider every lateStep missions (countPay keeps each mission's gold); before the fleet
  // joined fights, 4 made missions 33 to 39 run 19 to 23 s each against Top Force's 16
  // round 9 (recording rec-c): with mission 10 on Top Force's 3:21, missions 10 to 19 ran 14 to 20 s each and grew longer
  // (Top Force 10 to 12 s, 13 to 19 about 9 s, Mission-20 at 5:21); 6 to 9 raiders became 6 every mission (three waves of
  // two, Top Force at most 5 reds out), countPay keeps each mission's gold. Node quest bot 12.4 to 15.0 s a mission (was 14.5 to 15.1)
  midCount: 6,
  lateStep: 3,
};

// Shed numbers. Top Force card "Level 2 Rifle": damage 30, 4s, upgrade 2 gold.
// Round 7: the third shed's units go out as a squad (refs r7 tank_a: about 3 tanks at mission 14, 5 by mission 24), each lighter
// than the old lone destroyer (620 hp, 38 dmg) so the squad keeps the round 6 timeline (good bot 40th fight 10:16 to 10:24, R7 tanksweep)
// Round 8 (owner 2026-11-13 "i dont need robots and tanks ... can be helicoter, motherships, drones"): the third shed is a
// Helipad and its units are navy helicopters (key 'destroyer' kept so saves, tasks and bots still line up)
// Round 9 (owner 2026-11-14 07:24 "compare to reference 1 to 1 on the game logic"): Top Force's cards, one for one: Rifle 30
// every 4 s, Grenade 60 every 5 s (opens at Rifle Lv.20), Tank 178 every 6 s (HQ 2; ours the Helicopter, two shells of 89),
// Med Kit (ours the Repair Dock). Ranges in world units: the map camera shows 95 across at the base and 105 at the front, and
// Top Force's reds stand 0.3 to 0.42 of the screen off the soldiers they shoot (refs f1 s0038, s0097, s0254). Ours outreach
// the raiders (34 to 36) by 12 to 14: a red stops at the first boat in its reach, and at 38 to 40 only that one boat reached
// it back (node mission 14: one gunboat on it for 8 s, missions 10 to 19 took 20 s against Top Force's 12; at 46 to 50, 15 s). cap: boats out at once (Top Force 2 soldiers armed at 1:37, a tank
// and 2 to 3 soldiers at 4:13, about 7 units at 4:40)
export const SHEDS = {
  gunboat: { name: 'Gunboat', slot: 'W1', dmg: 30, hp: 140, range: 46, rate: 4, build: 4, speed: 13, cap: 2, buildCost: 0, needHq: 1, shot: 'shell' },
  torpedo: { name: 'Torpedo Boat', slot: 'S1', dmg: 60, splash: 8, hp: 170, range: 48, rate: 5, build: 6, speed: 15, cap: 1, buildCost: 0, needHq: 1, shot: 'torpedo' },
  destroyer: { name: 'Helicopter', shedName: 'Helipad', slot: 'W2', dmg: 178, hp: 450, range: 50, rate: 6, build: 7, speed: 10, cap: 2, buildCost: 0, needHq: 2, shot: 'shell2' },
  repair: { name: 'Repair Dock', heal: 0.04, buildCost: 400, needHq: 3 },
};
export const SHED_ORDER = ['gunboat', 'torpedo', 'destroyer', 'repair'];
// Top Force: a star at every promote (Lv.10, 20, 30, 40, 50), five a factory
export const STAR_LEVELS = [10, 20, 30, 40, 50];
export const RANK_LEVELS = [10, 20, 30, 40, 50];
// Top Force upgrade prices: flat within each ten levels, the x9 level is the promote. [each level, promote] per band of ten.
// Rifle 2/16, 3/24, 15/109, 48/288, 104/504; Grenade 2/16, 3/24, 14/106, 40/240; Tank 4/(32, own guess: 8x the level price
// as the others), 6/50, 31/227, 48/288; Med Kit 6/48, 8/72, 44/324, 64/384. Bands Top Force never showed are own guesses
// (each level price about 2.1x the band before, promote about 5x it) and marked so in copy.html
export const COSTS = {
  gunboat: [[2, 16], [3, 24], [15, 109], [48, 288], [104, 504]],
  torpedo: [[2, 16], [3, 24], [14, 106], [40, 240], [86, 430]],
  destroyer: [[4, 32], [6, 50], [31, 227], [48, 288], [104, 504]],
  repair: [[6, 48], [8, 72], [44, 324], [64, 384], [138, 690]],
};
// Top Force damage: base x (1 + 0.025 per level) x a promote step (Rifle 36 -> 45 at Lv.10, 66 at 20, 90 at 30, 118 at 40)
export const RANK_DMG = [1, 1.22, 1.488, 1.739, 1.99, 2.25];

// HQ = Top Force "Military Base": HQ 2 at 3 stars (Power 900 -> 1800, free), HQ 3 at 9 stars and 500 gold. mission: none
export const HQ_REQ = {
  2: { stars: 3, mission: 0, gold: 0 },
  3: { stars: 9, mission: 0, gold: 500 },
};
// Boost paths (Top Force Lv.2: Urgent Order I, Troop Rally II, Officer Expansion III, Troop Rally III, Urgent Order II;
// Lv.3: Officer Expansion IV, Rifle Assembly I, Troop Rally VI, Urgent Order III, High Explosives I).
// Round 9: Top Force's HQ 1 path too (stars 1 to 3: Officer Expansion I, Soldier Rally I, Officer Expansion II)
export const BOOSTS = {
  1: [
    { id: 'capt1', name: 'Officer Expansion I', desc: '+1 Officer', need: 1, fx: 'capt', icon: 2 },
    { id: 'rally1', name: 'Fleet Rally I', desc: '+1 Sailor', need: 2, fx: 'rally', icon: 1 },
    { id: 'capt2', name: 'Officer Expansion II', desc: '+1 Officer', need: 3, fx: 'capt', icon: 2 },
  ],
  2: [
    { id: 'steam1', name: 'Full Steam I', desc: 'All boats sail faster', need: 4, fx: 'steam', icon: 0 },
    { id: 'rally2', name: 'Fleet Rally II', desc: '+1 Sailor', need: 5, fx: 'rally', icon: 1 },
    { id: 'capt3', name: 'Officer Expansion III', desc: '+1 Officer', need: 6, fx: 'capt', icon: 2 },
    { id: 'rally3', name: 'Fleet Rally III', desc: '+1 Sailor', need: 7, fx: 'rally', icon: 1 },
    { id: 'steam2', name: 'Full Steam II', desc: 'All boats sail faster', need: 8, fx: 'steam', icon: 0 },
  ],
  3: [
    { id: 'capt4', name: 'Officer Expansion IV', desc: '+1 Officer', need: 10, fx: 'capt', icon: 2 },
    { id: 'gasm1', name: 'Gunboat Assembly I', desc: 'Gunboats launch faster', need: 11, fx: 'gasm', icon: 3 },
    { id: 'rally6', name: 'Fleet Rally VI', desc: '+1 Sailor', need: 12, fx: 'rally', icon: 1 },
    { id: 'steam3', name: 'Full Steam III', desc: 'All boats sail faster', need: 13, fx: 'steam', icon: 0 },
    { id: 'torp1', name: 'Torpedo Loading I', desc: 'Torpedo boats launch faster', need: 14, fx: 'torp', icon: 4 },
  ],
};

// Bottom quest bar (Top Force: "Upgrade Grenade to Lv.30 (26/30)" at mission 13, "Complete Mission 20 (19/20)",
// "Upgrade Tank to Lv.30 (29/30)" at 22 (ours: the Helicopter), "Upgrade Military Base to Lv.3 (2/3)" at 29, "Upgrade Med Kit to Lv.10 (1/10)",
// "Complete Mission 40 (39/40)").
// Round 9: Top Force's own order through the first five minutes (about +10 gold a task, Mission 10 +43): Rifle to 20 opens
// the Grenade, "Upgrade Grenade to Lv.10" (2:41 9/10), HQ 2, the Tank to Lv.10 (3:20 10/10), "Complete Mission 10",
// "Upgrade Grenade to Lv.30" (3:49 10/30, 4:13 21/30), "Complete Mission 15", "Complete Mission 20"
export const QUESTS = [
  { t: 'Upgrade Gunboat to Lv.2', k: 'lv', s: 'gunboat', n: 2, gold: 4 },
  { t: 'Upgrade Gunboat to Lv.10', k: 'lv', s: 'gunboat', n: 10, gold: 10 },
  { t: 'Upgrade Gunboat to Lv.20', k: 'lv', s: 'gunboat', n: 20, gold: 10 },
  { t: 'Build a Torpedo Shed', k: 'built', s: 'torpedo', n: 1, gold: 4 },
  { t: 'Upgrade Torpedo Boat to Lv.10', k: 'lv', s: 'torpedo', n: 10, gold: 10 },
  { t: 'Upgrade Harbor HQ to Lv.2', k: 'hq', n: 2, gold: 10 },
  { t: 'Build a Helipad', k: 'built', s: 'destroyer', n: 1, gold: 10 },
  { t: 'Upgrade Helicopter to Lv.10', k: 'lv', s: 'destroyer', n: 10, gold: 10 },
  { t: 'Complete Mission 10', k: 'mission', n: 10, gold: 43 },
  { t: 'Upgrade Torpedo Boat to Lv.30', k: 'lv', s: 'torpedo', n: 30, gold: 60 },
  { t: 'Complete Mission 15', k: 'mission', n: 15, gold: 60 },
  { t: 'Complete Mission 20', k: 'mission', n: 20, gold: 100 },
  { t: 'Upgrade Helicopter to Lv.30', k: 'lv', s: 'destroyer', n: 30, gold: 160 },
  { t: 'Upgrade Harbor HQ to Lv.3', k: 'hq', n: 3, gold: 200 },
  { t: 'Upgrade Repair Dock to Lv.10', k: 'lv', s: 'repair', n: 10, gold: 300 },
  { t: 'Complete Mission 40', k: 'mission', n: 40, gold: 500 },
  { t: 'Complete Mission 41', k: 'mission', n: 41, gold: 600 },
];

// Seeded random so bot runs repeat.
let seedV = 12345;
export function setSeed(n) { seedV = (n >>> 0) || 1; }
export function rnd() { seedV |= 0; seedV = seedV + 0x6D2B79F5 | 0; let t = Math.imul(seedV ^ seedV >>> 15, 1 | seedV); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

export const zoneOf = n => (n <= 20 ? 2 : n <= 40 ? 3 : 4);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- sea navigation ----------
// Boats never cross land, quays, piers or islets. Straight line when clear; otherwise follow a grid
// distance field (3-unit cells) toward the goal, so a boat rounds the pier instead of pushing into it.
const NAV = { cs: 3, x0: -60, z0: -170, nx: 100, nz: 80 };
const navStage = S => (S.stage >= 3 ? 3 : S.sheds.repair.built ? 2 : 1);
const wet = (S, x, z, m) => isWater(x, z, navStage(S), m);
const masks = {}, fields = new Map();
function navMask(st) {
  if (masks[st]) return masks[st];
  const m = new Uint8Array(NAV.nx * NAV.nz);
  for (let j = 0; j < NAV.nz; j++) for (let i = 0; i < NAV.nx; i++) m[j * NAV.nx + i] = isWater(NAV.x0 + (i + 0.5) * NAV.cs, NAV.z0 + (j + 0.5) * NAV.cs, st, 2.5) ? 1 : 0;
  return (masks[st] = m);
}
const cellI = x => Math.max(0, Math.min(NAV.nx - 1, Math.floor((x - NAV.x0) / NAV.cs)));
const cellJ = z => Math.max(0, Math.min(NAV.nz - 1, Math.floor((z - NAV.z0) / NAV.cs)));
function navField(st, tx, tz) {
  const ti = cellI(tx), tj = cellJ(tz), key = st * 100000 + tj * NAV.nx + ti;
  let f = fields.get(key); if (f) return f;
  const m = navMask(st); f = new Uint16Array(NAV.nx * NAV.nz).fill(65535);
  const q = new Int32Array(NAV.nx * NAV.nz); let h = 0, t = 0;
  f[tj * NAV.nx + ti] = 0; q[t++] = tj * NAV.nx + ti;
  while (h < t) {
    const c = q[h++], ci = c % NAV.nx, cj = (c / NAV.nx) | 0, d = f[c];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= NAV.nx || nj >= NAV.nz) continue;
      const n = nj * NAV.nx + ni; if (!m[n] || f[n] !== 65535) continue;
      if (di && dj && (!m[cj * NAV.nx + ni] || !m[nj * NAV.nx + ci])) continue; // no corner cutting
      f[n] = d + 1; q[t++] = n;
    }
  }
  if (fields.size > 200) fields.delete(fields.keys().next().value);
  fields.set(key, f); return f;
}
function clearLine(S, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 1.5);
  for (let k = 1; k <= n; k++) { const t = k / n; if (!wet(S, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 1.5)) return false; }
  return true;
}
function navAim(S, u, tx, tz) {
  if (clearLine(S, u.x, u.z, tx, tz)) return [tx, tz];
  const f = navField(navStage(S), tx, tz), ci = cellI(u.x), cj = cellJ(u.z);
  let best = f[cj * NAV.nx + ci], bi = -1, bj = -1;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= NAV.nx || nj >= NAV.nz) continue;
    const v = f[nj * NAV.nx + ni]; if (v < best) { best = v; bi = ni; bj = nj; }
  }
  if (bi < 0) return [tx, tz];
  return [NAV.x0 + (bi + 0.5) * NAV.cs, NAV.z0 + (bj + 0.5) * NAV.cs];
}

export function newState() {
  return {
    t: 0, gold: 0, gems: 0, hq: 1, mission: 1, done: 0, stage: 1,
    sheds: {
      gunboat: { built: true, lv: 1, timer: 2 },
      torpedo: { built: false, lv: 0, timer: 0 },
      destroyer: { built: false, lv: 0, timer: 0 },
      repair: { built: false, lv: 0, timer: 0 },
    },
    boosts: [], quest: 0, questDone: false,
    ships: [], enemies: [], shots: [], ev: [],
    m: null,               // current mission run
    zone: 2, zonePhase: 'active', chest: null,
    incoming: null, incomingTotal: TUNE.incoming,
    phase: 'battle',       // battle | between | wreck | fightReady | fight | expand | end
    paused: false, uid: 1, kills: 0, turretCd: 0, healCd: 2, between: 0,
    flags: {},
    crew: [], officers: [], arm: null, // round 7: sailors on the quay, officers, and the armory (armInit fills them)
  };
}

// ---------- derived numbers ----------
export function rank(lv) { let r = 0; for (const l of RANK_LEVELS) if (lv >= l) r++; return r; }
export function shedStars(lv) { let r = 0; for (const l of STAR_LEVELS) if (lv >= l) r++; return r; }
export function totalStars(S) { let r = 0; for (const k of SHED_ORDER) if (S.sheds[k].built) r += shedStars(S.sheds[k].lv); return r; }
// the price of going from lv to lv + 1 (Top Force: flat in each band of ten, the x9 level promotes)
export function upCost(key, lv) {
  const C = COSTS[key], b = Math.floor(lv / 10), promo = lv % 10 === 9;
  if (b < C.length) return C[b][promo ? 1 : 0];
  const k = Math.pow(2.1, b - C.length + 1), L = C[C.length - 1]; // past the last band: own guess, 2.1x a band
  return Math.round(L[promo ? 1 : 0] * k);
}
const boostCount = (S, fx) => S.boosts.filter(id => findBoost(id).fx === fx).length;
export function findBoost(id) { for (const k in BOOSTS) for (const b of BOOSTS[k]) if (b.id === id) return b; return null; }
// round 9 (Top Force 1:04 to 1:10): unlocking Officer Expansion I drops a gift box at the base and the officer joins when it
// is opened ("1 officer(s) joined"); the page sets flags.giftBox, and while that box waits the officer does too
export function captains(S) { return 1 + boostCount(S, 'capt') - (S.flags.gift === 'shown' ? 1 : 0); }
// round 9: Top Force's card numbers (Rifle 30, 36 at Lv.9, 45 at 10, 54 at 19, 66 at 20, 76 at 29, 90 at 30, 118 at 40);
// officers only carry, as in Top Force (they no longer add damage)
export function shipDmg(S, key, lv) { return SHEDS[key].dmg * (1 + 0.025 * (lv - 1)) * RANK_DMG[Math.min(rank(lv), RANK_DMG.length - 1)]; }
export function shipHp(S, key, lv) { return SHEDS[key].hp * (1 + 0.11 * (lv - 1)) * Math.pow(1.35, rank(lv)); }
// a rescued sailor (Top Force's soldier calling HELP) crews one more gunboat
export function shedCap(S, key) { return SHEDS[key].cap + (key === 'gunboat' ? boostCount(S, 'rally') + (S.flags && S.flags.sailor ? 1 : 0) : 0); }
export function buildTime(S, key) {
  let t = SHEDS[key].build;
  if (key === 'gunboat') t *= Math.pow(0.8, boostCount(S, 'gasm'));
  if (key === 'torpedo') t *= Math.pow(0.8, boostCount(S, 'torp'));
  return t;
}
export function speedMul(S) { return 1 + 0.15 * boostCount(S, 'steam'); }
export function healPct(S) { const r = S.sheds.repair; return r.built ? SHEDS.repair.heal + 0.004 * (r.lv - 1) : 0; }
// P2E-07: the HQ itself carries power, so the HQ page can lead with Power X -> Y (Top Force t0259) and the HUD number agrees
export const HQ_POWER = [0, 400, 1600, 4000];
export const hqPower = lv => HQ_POWER[Math.min(lv, HQ_POWER.length - 1)] || 0;
export function power(S) {
  let p = hqPower(S.hq);
  for (const k of ['gunboat', 'torpedo', 'destroyer']) { const s = S.sheds[k]; if (s.built) p += shipDmg(S, k, s.lv) / SHEDS[k].rate * shedCap(S, k) * 6 + shipHp(S, k, s.lv) * shedCap(S, k) * 0.4; }
  return Math.round(p);
}

// Enemy numbers per mission.
export function enemyHp(n) {
  const h = n <= 10 ? TUNE.hpBase * Math.pow(TUNE.hpGrow, n - 1) : TUNE.hpBase * Math.pow(TUNE.hpGrow, 9) * Math.pow(TUNE.hpGrow2, Math.min(n, 22) - 10) * Math.pow(TUNE.hpGrow3, Math.max(0, n - 22));
  return h * (n > 20 ? TUNE.z3Hp : 1) * TUNE.enemyHp;
}
export function enemyDmg(n) { return TUNE.dmgBase * Math.pow(TUNE.dmgGrow, n - 1); }
// round 9: the stand-off keeps a group's raiders alive into the next groups, so the gate's gold steps follow the kill count
// (the n-th red down pays its group's goldGate), which keeps Top Force's shape whatever order they fall in
function gateKillGold(m) {
  let i = m.killed; for (let g = 0; g < m.first - 1; g++) i += GATE.sizes[g];
  let c = 0; for (let g = 0; g < GATE.sizes.length; g++) { c += GATE.sizes[g]; if (i < c) return TUNE.goldGate[g] * TUNE.goldMul; }
  return TUNE.goldGate[GATE.sizes.length - 1] * TUNE.goldMul;
}
export function killGold(n) {
  if (n <= GATE.last) return TUNE.goldGate[n - 1] * TUNE.goldMul;
  return TUNE.goldBase * Math.pow(TUNE.goldGrow, n - 1) * TUNE.goldMul * countPay(n);
}
// round 6: Top Force's missions past the first run are one small group each (3 to 9 reds on screen, 8 to 16 s a mission:
// 10 at 3:39, 17 at 5:04, 33 to 39 at 10:39 to 12:17); ours had 14 to 27 and took 16 to 50 s. A kill pays what it took
// to clear the old count, so the gold per mission, and the fleet a player has at each mission, stays where it was
const oldCount = n => 10 + Math.floor(n * 0.45);
export function missionCount(n) { return n === 20 ? 1 + TUNE.bossEsc : n <= GATE.last ? oldCount(n) : n < 20 ? TUNE.midCount : 8 + Math.floor((n - 21) / TUNE.lateStep); }
const countPay = n => (n > GATE.last && n !== 20 ? oldCount(n) / missionCount(n) : 1);
// round 6 review: mission 20 used to pay 8 escorts and the boss; the longer escort stream shares the same 8 escorts' gold
const escPay = (n, kind) => (n === 20 && kind !== 'boss' ? 8 / TUNE.bossEsc : 1);

// ---------- actions (UI and bots call these) ----------
export function canUpgrade(S, key) { const s = S.sheds[key]; return s.built && S.gold >= upCost(key, s.lv); }
export function upgrade(S, key) {
  const s = S.sheds[key]; if (!canUpgrade(S, key)) return false;
  const before = shedStars(s.lv), rb = rank(s.lv);
  S.gold -= upCost(key, s.lv); s.lv++;
  S.ev.push({ e: 'level', key, lv: s.lv, star: shedStars(s.lv) > before, rank: rank(s.lv) > rb });
  // living boats of this shed get the new numbers
  for (const b of S.ships) if (b.key === key) { const hp = shipHp(S, key, s.lv); b.hp += hp - b.max; b.max = hp; }
  return true;
}
export function canBuild(S, key) { const s = S.sheds[key]; return !s.built && S.hq >= SHEDS[key].needHq && S.gold >= SHEDS[key].buildCost && buildOpen(S, key); }
export function buildOpen(S, key) {
  if (S.sheds[key].built) return false;
  if (key === 'torpedo') return S.sheds.gunboat.lv >= 20; // round 9: Top Force's Grenade opens at Rifle Lv.20
  return S.hq >= SHEDS[key].needHq;
}
export function build(S, key) {
  if (!canBuild(S, key)) return false;
  S.gold -= SHEDS[key].buildCost; const s = S.sheds[key]; s.built = true; s.lv = 1; s.timer = 0.5;
  S.ev.push({ e: 'build', key });
  return true;
}
export function hqReq(S) { return HQ_REQ[S.hq + 1] || null; }
export function canHq(S) { const r = hqReq(S); return !!r && totalStars(S) >= r.stars && S.done >= r.mission && S.gold >= r.gold; }
// round 9: where our boats hold. At the gate the quay line (GATE.slots); after it the front line of the zone (world.js LINES):
// an arc round the quay toward the outpost, slots 11 apart, filled from the middle out, a second arc behind it
const lineCache = new Map();
export function lineSlots(S, zone) {
  const L = LINES[zone]; if (!L) return null;
  const st = navStage(S), key = zone * 10 + st; let out = lineCache.get(key); if (out) return out;
  out = []; const a0 = Math.atan2(L.dir[1], L.dir[0]);
  // R-300 round 9 second look (pairs line, m12; sheet-f3): on the small circle round c the side spots fell 12 behind the
  // middle one, so the boats stood in a dome bunched at its top. Each row now runs along the flat line (world.js
  // lineCircle), lineGap apart, middle first; the back row sits in the gaps of the front one. Nine spots for up to nine boats
  for (const [r, offs] of [[L.r, [0, 1, -1, 2, -2]], [L.r - L.back, [0.5, -0.5, 1.5, -1.5]]]) {
    const H = lineCircle(L, r), da = TUNE.lineGap / H.r;
    for (const o of offs) {
      const a = a0 + o * da, x = H.c[0] + Math.cos(a) * H.r, z = H.c[1] + Math.sin(a) * H.r;
      if (isWater(x, z, st, 4)) out.push([x, z]);
    }
  }
  lineCache.set(key, out); return out;
}
export function upgradeHq(S) {
  if (!canHq(S)) return false;
  S.gold -= hqReq(S).gold; S.hq++;
  S.ev.push({ e: 'hq', lv: S.hq });
  return true;
}
export function boostState(S, b) {
  if (S.boosts.includes(b.id)) return 'done';
  for (const k in BOOSTS) {
    const path = BOOSTS[k], i = path.indexOf(b); if (i < 0) continue;
    if (S.hq < +k) return 'locked';
    if (i > 0 && !S.boosts.includes(path[i - 1].id)) return 'locked';
  }
  return totalStars(S) >= b.need ? 'ready' : 'stars';
}
export function unlockBoost(S, id) {
  const b = findBoost(id); if (!b || boostState(S, b) !== 'ready') return false;
  S.boosts.push(id); S.ev.push({ e: 'boost', id });
  if (id === 'capt1' && S.flags.giftBox && !S.flags.gift) S.flags.gift = 'shown';
  return true;
}
export function questProgress(S) {
  const q = QUESTS[S.quest]; if (!q) return null;
  let cur = 0;
  if (q.k === 'lv') cur = S.sheds[q.s].lv; else if (q.k === 'built') cur = S.sheds[q.s].built ? 1 : 0;
  else if (q.k === 'mission') cur = S.done; else if (q.k === 'hq') cur = S.hq;
  return { q, cur: Math.min(cur, q.n), done: cur >= q.n };
}
export function claimQuest(S) {
  const p = questProgress(S); if (!p || !p.done) return false;
  S.gold += p.q.gold * TUNE.goldMul; S.quest++; S.ev.push({ e: 'quest', gold: p.q.gold });
  return true;
}
export function collectChest(S) {
  if (!S.chest || S.chest.taken) return false;
  S.chest.taken = true; S.gold += S.chest.gold; S.gems += S.chest.gems;
  S.ev.push({ e: 'chest', gold: S.chest.gold, gems: S.chest.gems });
  return true;
}
// After the chest: the zone is recovered and the next zone's fog lifts.
export function recoverZone(S) {
  S.zonePhase = 'recovered'; S.ev.push({ e: 'recovered', zone: S.zone });
  S.zone = zoneOf(S.mission); S.zonePhase = 'active'; S.chest = null;
  if (S.zone === 3 && S.incoming == null) S.incoming = S.incomingTotal;
  S.phase = 'battle'; startMission(S);
}

// ---------- missions ----------
// round 6: the gate stretch is one run with one counter (Top Force 0:40 "Enemies 42"), its missions tick over as the
// counter passes each group (no mission label until it ends); a jump into the middle starts it at that group
export const inGate = S => S.zone === 2 && S.done < GATE.last && S.stage < 3;
export function startMission(S) {
  const n = S.mission, total = missionCount(n);
  if (n <= GATE.last && S.zone === 2) {
    const sz = GATE.sizes.slice(n - 1); let c = 0; const cum = sz.map(k => (c += k));
    S.m = { n, first: n, total: c, killed: 0, spawned: 0, wave: 0, waves: sz.length, per: 0, cum, gate: true, waveT: 0, spawnT: n === 1 ? TUNE.gateFirst : 0.6, boss: false };
    S.ev.push({ e: 'mission', n, gate: 1 }); return;
  }
  // round 6: Top Force sends each later mission as one group from the outpost; three waves each sailing 60 from the
  // spawns made a 9-raider mission take 20 to 30 s
  // round 9: Top Force's missions 10 to 19 come in three waves (the mission tag's three marks; Mission-10 "3 waves"), each
  // once the last is down (missionTick)
  const waves = n > GATE.last && n < 20 ? 3 : 1, per = Math.ceil(total / waves);
  S.m = { n, total, killed: 0, spawned: 0, wave: 0, waves, per, waveT: 0, spawnT: 0.6, boss: n === 20 || n === 40 };
  S.zone = zoneOf(n);
  S.ev.push({ e: 'mission', n });
  if (n === 40) { S.phase = 'fightReady'; S.ev.push({ e: 'fightReady' }); }
}

const PACK39 = 9; // raiders round the mission 39 airship (Top Force about 10 reds round its robot, refs r7 robot_a)
// R-300 round 7: the leader drew 2.5x (about 8 out from its middle), raiders keep about 11.6 from it (AIR_KEEP), so their
// spots start 12.5 out. Round 8: the leader is a pirate airship (owner "i dont need robots and tanks")
const PACK_SLOTS = [[12.5, 0], [12.5, -11], [12.5, 11], [0, -13], [0, 13], [-12.5, -11], [-12.5, 0], [-12.5, 11], [-23, 0]]; // [ahead, beside]
// every other spot round it, nearest first (16 angles, 12.5 to 26 out), for slots on land or taken
const PACK_RING = [12.5, 17, 21.5, 26].flatMap(r => Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8) * r, Math.sin(i * Math.PI / 8) * r]));
function spawnEnemy(S, kind) {
  const n = S.m.n, F = FRONTS[S.zone];
  // playtest P2E-08: the flagship lay on the reef sand from the spawns 4 off the shore; it always comes in from the most
  // open water, without jitter
  const boss = kind === 'boss' && F.bossSpawn;
  const gate = S.m.gate, m = S.m;
  // round 6 playthrough (Top Force 0:35 to 2:15): each red group walks in as a loose bunch of 2 to 8 side by side, not
  // single file; a gate group now comes from one spawn and each raider keeps its own lane across the path
  if (gate && m.gw !== m.wave) { m.gw = m.wave; m.gsp = F.spawns[Math.floor(rnd() * F.spawns.length)]; }
  // R-300 round 7 second look (robot39 pair): Top Force's mission 39 robot walks out inside about ten reds (refs r7 robot_a);
  // ours led alone (its raiders, speed 8 against its 4.5, ran ahead and sank first), 3 reds beside it against about 10.
  // The robot and the next PACK39 raiders now leave one spawn together, each on its own spot round the robot, at its speed
  const pack = !gate && n === 39 && m.spawned <= PACK39 && kind !== 'drone';
  if (pack && !m.psp) m.psp = F.spawns[Math.floor(rnd() * F.spawns.length)];
  const sp = boss ? F.bossSpawn : gate ? m.gsp : pack ? m.psp : F.spawns[Math.floor(rnd() * F.spawns.length)];
  const jitter = () => (boss ? 0 : (rnd() - 0.5) * 6);
  let x = sp[0] + jitter(), z = sp[1] + jitter(), lane = 0;
  if (gate) {
    const w0 = m.wave ? m.cum[m.wave - 1] : 0, nG = m.cum[m.wave] - w0, j = m.spawned - w0;
    lane = (j - (nG - 1) / 2) * TUNE.gateLane; x = sp[0] + GATE.perp[0] * lane + jitter() * 0.3; z = sp[1] + GATE.perp[1] * lane + jitter() * 0.3;
  }
  let po = [0, 0];
  // slots ahead, beside and behind the robot (12.5 out, round 7 fifth look), laid round where the robot is now (it walks on while the pack
  // spawns): enemies keep (len + len) x 0.7 = 9.8 apart, and a ring 6 out stacked them on the robot so separate() threw it
  // 18 off in half a second. A slot on land or taken is tried on the other side, then one step back, then any free slot
  if (pack && m.spawned > 0) {
    const R = S.enemies.find(e => e.kind === 'airship'), ax = R ? R.x : sp[0], az = R ? R.z : sp[1];
    const v = F.via[0], dl = Math.hypot(v[0] - ax, v[1] - az) || 1, fx = (v[0] - ax) / dl, fz = (v[1] - az) / dl;
    const [f0, s0] = PACK_SLOTS[m.spawned - 1];
    const free = o => wet(S, ax + o[0], az + o[1], 2) && !S.enemies.some(e => Math.hypot(e.x - ax - o[0], e.z - az - o[1]) < 9.8);
    for (const [f, sd] of [[f0, s0], [f0, -s0], [f0 - 10.5, s0], [f0 - 10.5, -s0], ...PACK_RING]) {
      const o = [fx * f - fz * sd, fz * f + fx * sd];
      if (free(o)) { po = o; break; }
    }
    // no free water round it (a spawn by the shore): this raider leaves from the next spawn on its own, never on the robot
    if (po[0] === 0 && po[1] === 0) { const s2 = F.spawns[(F.spawns.indexOf(sp) + 1) % F.spawns.length]; x = s2[0]; z = s2[1]; }
    else { x = ax + po[0]; z = az + po[1]; }
  }
  if (!wet(S, x, z, 2)) { x = sp[0]; z = sp[1]; }
  // round 8: a drone takes off from a mothership or airship still afloat (its deck, a few steps ahead of its middle) and
  // follows the rest of its path; it falls when that ship goes down (cleanup)
  const mom = kind === 'drone' ? S.enemies.find(o => (o.kind === 'boss' || o.kind === 'airship') && o.hp > 0) : null;
  if (mom) { const hl = Math.hypot(mom.vx, mom.vz) || 1; x = mom.x + mom.vx / hl * 4; z = mom.z + mom.vz / hl * 4; }
  // L13: the mission-20 flagship holds about 10 s under fire for the good bot (hp 50: 7-15 s; careless bot 17-27 s).
  // round 6 full recording: Top Force's boss fight runs about 60 s (5:20 flame beam to 6:25 mission 20); ours took 29 s.
  // hp 95: mission 20 takes the node bot 55 s (careless bot 92 s; hp 120 was 82 s once the gate ran longer)
  // P2E-08: drawn 1.15x (25 long, about three raiders), not 1.8x (40 long, as wide as the reef island); Top Force's
  // boss is about the size of a building (12:21)
  const hold = n === 20 && F.bossHold;
  const k = kind === 'boss' ? { hp: TUNE.bossHp, dmg: 5, range: 40, speed: 3.5, rate: 1.4, gold: 40, len: 25, big: 1.15 }
    : kind === 'gunship' ? { hp: 4.8, dmg: 2.2, range: 36, speed: 6, rate: 1.6, gold: 4, len: 9.5 }
    // round 7 (owner 2026-11-13 "tanks n robots"; Top Force 11:05 a red humanoid robot, 1.1K, leads mission 39's reds, refs r7 robot_a)
    // drawn 1.9x: at 1x it was a raider's size from our camera; at 1.4x the R-300 review still could not find it among mission
    // 39's raiders (Top Force's robot is about twice a soldier's height)
    // R-300 round 7 third look (pair robot39): drawn 1.9x it stood about 6 to 8% of the screen wide, one raider's size, against
    // Top Force's 16% (twice a soldier, refs r7 robot_a); 3.8x. big also sets how far our boats stand off it (pushOff) and
    // how far raiders keep from it (ROBOT_KEEP)
    // R-300 round 7 fifth look (pair giant): at 3.8x it stood about 4 gunboats tall (23% of the screen wide with its arms) and
    // as tall as mission 40's giant, which then did not tower over it; Top Force's robot is about 2 soldiers tall (17% wide)
    // and its giant about 4, so 2.5x: about 2.6 gunboats tall, 15% wide, and the giant (fight.js GIANT_DRAW 2.8) about 1.9x it
    // round 8: the robot became a pirate airship (units8 model about 16 long at 1x, drawn 1.2x: about 19 long, as the robot's
    // 2.5x drawing was 17.5 wide); len 14 x big 1.2 keeps the robot's stand-off (pushOff 8.4 against 8.75) and pack spots
    : kind === 'airship' ? { hp: 14, dmg: 2.6, range: 36, speed: 4.5, rate: 1.4, gold: 10, len: 14, big: 1.2 }
    // round 8 (owner "drones"): small fast pirate drones, launched from the mission 20 mothership and the mission 39 airship
    // and flying in with the later missions' groups; weak alone
    : kind === 'drone' ? { hp: 0.45, dmg: 0.5, range: 28, speed: 10, rate: 0.8, gold: 0.5, len: 3.5 }
    : { hp: 1, dmg: 1, range: 34, speed: 8, rate: 1.2, gold: 1, len: 7 }; // round 9 ranges: stand off as Top Force's reds do (enemiesTick)
  const hp = enemyHp(n) * k.hp * (gate ? TUNE.gateHp : 1) * (n === 20 && kind !== 'boss' ? TUNE.bossEscHp : 1);
  const e = { id: S.uid++, kind, x, z, hp, max: hp, dmg: enemyDmg(n) * k.dmg * (n === 20 && kind !== 'boss' ? TUNE.bossEscDmg : 1), range: k.range, speed: pack ? 4.5 : k.speed, rate: k.rate,
    cd: rnd() * k.rate, gold: killGold(n) * k.gold * escPay(n, kind), path: (gate ? [...GATE.via, GATE.goal] : [...F.via, F.goal]).map((p, i, A) => {
      const f = gate ? (i === A.length - 1 ? 0.6 : 1) * lane : 0, g = i === A.length - 1 ? 0.6 : 1, q = { x: p[0] + GATE.perp[0] * f + po[0] * g, z: p[1] + GATE.perp[1] * f + po[1] * g };
      return wet(S, q.x, q.z, 2) ? q : { x: p[0], z: p[1] };
    }), pi: 0,
    vx: 0, vz: 1, len: k.len, hitT: 0, big: k.big || 1 };
  if (gate) e.gk = 1; // round 9: a gate kill pays by how many have fallen so far (gateKillGold), not by its group or kind
  // round 6: the mission 20 flagship sails to its anchor and holds there (it shoots what comes in range, never chases);
  // its escorts make for a ring on our side of it, 10 to 16 off its middle, and fight whatever comes near
  if (hold && boss) { e.path = [{ x: 80, z: -66 }, { x: F.bossHold[0], z: F.bossHold[1] }]; e.hold = true; } // round the jetty's tip
  else if (hold) { const a = Math.atan2(F.rally[1] - F.bossHold[1], F.rally[0] - F.bossHold[0]) + (rnd() - 0.5) * 2.4, r = 10 + rnd() * 6; e.path = [{ x: F.bossHold[0] + Math.cos(a) * r, z: F.bossHold[1] + Math.sin(a) * r }]; }
  if (pack && m.spawned > 0 && (po[0] || po[1])) e.esc = po;
  if (mom) { e.mom = mom.id; if (!hold) { e.path = mom.path.slice(mom.pi); } }
  S.enemies.push(e); S.m.spawned++;
  S.ev.push({ e: 'spawn', id: e.id, kind });
  return e;
}

function missionTick(S, dt) {
  const m = S.m; if (!m || S.phase !== 'battle') return;
  m.waveT += dt;
  const alive = S.enemies.length;
  const waveEnd = m.cum ? m.cum[m.wave] : Math.min(m.total, (m.wave + 1) * m.per);
  if (m.spawned < waveEnd) {
    m.spawnT -= dt;
    if (m.spawnT <= 0) {
      m.spawnT = m.gate ? TUNE.gateGap : m.n < 20 ? TUNE.spawnGap2 : m.n > 20 ? TUNE.spawnGap3 : TUNE.spawnGap;
      const idx = m.spawned;
      let kind = 'raider';
      // round 6 review (R-300 FAIL 4): Top Force's boss came with about 8 reds and they kept coming until it fell
      // (5:30 to 6:10, 9 reds in every 5 s sample); ours sent 8 raiders first and the flagship alone after them.
      // The flagship now leads, the first escorts follow, then one more every bossEscGap s while fewer than bossEscMax
      // are out; the stream stops when the flagship sinks.
      if (m.n === 20 && idx === 0) kind = 'boss';
      // round 8: every other one of the stream after the first escorts is a drone launched off the mothership's deck
      else if (m.n === 20 && idx > 7) { if (alive >= TUNE.bossEscMax) { m.spawnT = 0.5; kind = null; } else { m.spawnT = TUNE.bossEscGap; if (idx % 2) kind = 'drone'; } }
      else if (m.n === 39 && idx === 0) kind = 'airship';
      else if (m.n > 20 && idx % 6 === 2) kind = 'drone';
      else if (m.n >= 4 && idx % 5 === 4) kind = 'gunship';
      if (m.n === 39 && idx < PACK39) m.spawnT = 0; // the airship's pack leaves together (spawnEnemy)
      if (kind) spawnEnemy(S, kind);
    }
  } else if (m.wave < m.waves - 1 && (m.gate ? (alive <= TUNE.gateNext && m.waveT >= TUNE.gateMin) || m.waveT > TUNE.gateWait : alive <= 2 || m.waveT > (m.n < 20 ? TUNE.waveNext : 16))) { m.wave++; m.waveT = 0; m.spawnT = m.gate ? TUNE.gateGap : TUNE.waveGap; S.ev.push({ e: 'wave', n: m.wave }); }
  // round 8: the mission 39 airship launches a drone every airDroneGap s once it meets our boats, up to airDrones out at once;
  // launched drones are extra to the mission's count
  const A = m.n === 39 ? S.enemies.find(e => e.kind === 'airship' && e.hp > 0) : null;
  if (A && A.fight) {
    m.launchT = (m.launchT ?? 2) - dt;
    if (m.launchT <= 0 && S.enemies.filter(e => e.mom === A.id).length < TUNE.airDrones) { m.launchT = TUNE.airDroneGap; spawnEnemy(S, 'drone'); m.spawned--; m.total++; }
  }
  if (m.gate) while (m.n < GATE.last && m.killed >= m.cum[m.n - m.first]) {
    S.done = Math.max(S.done, m.n); S.ev.push({ e: 'missionDone', n: m.n, gate: 1 }); m.n++; S.mission = m.n; S.ev.push({ e: 'mission', n: m.n, gate: 1 });
  }
  if (m.n === 20 && m.spawned > 0 && m.spawned < m.total && !S.enemies.some(e => e.kind === 'boss')) m.total = m.spawned;
  if (m.killed >= m.total && alive === 0) missionDone(S);
}

function missionDone(S) {
  const n = S.m.n; S.done = Math.max(S.done, n);
  S.ev.push({ e: 'missionDone', n });
  // round 6: Top Force 2:13 pays "+104" as the last of the 42 falls at the fence (11 coins to 115)
  if (S.m.gate) { const g = Math.round(TUNE.gateGold * TUNE.goldMul); S.gold += g; S.ev.push({ e: 'gateClear', gold: g }); }
  if (n === 20) { // zone 2 beaten: wreck with a chest
    S.zonePhase = 'wreck'; S.phase = 'wreck';
    S.chest = { zone: 2, gold: Math.round(80 * TUNE.goldMul), gems: 50, taken: false };
    S.mission = 21; S.m = null; S.ev.push({ e: 'wreck', zone: 2 });
    return;
  }
  S.mission = n + 1; S.phase = 'between'; S.between = TUNE.betweenT; S.m = null;
  if (n === GATE.last && S.zone === 2) { S.between = TUNE.m10Wait; S.waitPad = true; } // round 9: Mission 10 waits for the Helipad
}

// Mission 40 won on the manual battlefield.
export function fightWon(S) {
  S.done = Math.max(S.done, 40); S.mission = 41; S.m = null;
  S.zonePhase = 'wreck'; S.phase = 'wreck';
  S.chest = { zone: 3, gold: Math.round(400 * TUNE.goldMul), gems: 100, taken: false };
  for (const e of S.enemies) e.hp = 0; S.enemies = [];
  // look review 11 (after-fight 1): the map does not step under the victory and offer panels, so hulls left touching
  // when FIGHT was tapped slid apart on screen as the camera came back; they part here, off screen, in one go
  for (let k = 0; k < 40; k++) separate(S, S.ships, (a, b) => (a.len + b.len) * FLEET_HOLD);
  S.ev.push({ e: 'wreck', zone: 3 });
}

// ---------- round 7: the armory ----------
// Owner 2026-11-13: "the ships are not interesting enough, from the reference they have something like generating guns
// for troops to pick up". Top Force 0:22 to 0:44 (refs r7 pick_a, pick_b; tutorial 0:22 "Weapons are almost ready!",
// 0:26 to 0:34 the officer carries the first rifle, 1:32 "1 soldier(s) joined", 3:50 "1 officer(s) joined"): factories
// craft onto a counter, officers carry to the distribution table, the soldiers queue, the front one takes a weapon and
// walks out. Ours: each shed crafts its weapon (deck gun, torpedo, tank shell) onto its counter on its build timer while
// the boats out plus the weapons on the way are under the shed's cap; an officer (one per Officer Expansion) carries it to
// the arming table; the front sailor in the queue takes it and walks to his boat on the slip, which then launches. A sunk
// boat's sailor swims back to the quay and queues again; Fleet Rally and the rescued sailor add a sailor (from the gate).
export const CREW = { walk: 8.5, officer: 7.5, pick: 0.35, take: 0.45, board: 0.25, swim: 2.6, swimMax: 6, swimV: 9, spare: 0 };
const ITEM_KEYS = ['gunboat', 'torpedo', 'destroyer'];
// sailors in all: one per boat the built sheds can field (the gunboat crews are there from the start: the cold open's squad)
export function crewTotal(S) { let n = shedCap(S, 'gunboat'); for (const k of ['torpedo', 'destroyer']) if (S.sheds[k].built) n += shedCap(S, k); return n; }
export function qSpot(k) { const A = ARMORY, r = Math.floor(k / A.qRow); return [A.queue[0] - (k % A.qRow) * A.qGap, A.queue[1] + r * A.qRowGap]; }
const newSailor = (S, at, path) => ({ id: S.uid++, x: at[0], z: at[1], st: 'q', item: null, path: path.map(p => [...p]), hx: 0, hz: -1, t: 0, moving: false });
function armInit(S) {
  if (S.arm) return;
  S.arm = { counter: { gunboat: 0, torpedo: 0, destroyer: 0 }, claim: { gunboat: 0, torpedo: 0, destroyer: 0 }, table: [], swim: [] };
  S.crew = []; S.officers = [];
  const n = Math.max(0, crewTotal(S) - S.ships.length);
  for (let i = 0; i < n; i++) S.crew.push(newSailor(S, qSpot(i), []));
  for (let i = 0; i < captains(S); i++) { const h = ARMORY.home[i % ARMORY.home.length]; S.officers.push({ id: S.uid++, x: h[0], z: h[1], st: 'idle', item: null, path: [], hx: 0, hz: 1, home: i, t: 0 }); }
}
// walk u along u.path ([x, z] points); true once it is at the end
function walkPath(u, speed, dt) {
  let left = speed * dt; u.moving = false;
  while (u.path.length) {
    const p = u.path[0], dx = p[0] - u.x, dz = p[1] - u.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) { u.hx = dx / d; u.hz = dz / d; }
    if (d <= left) { u.x = p[0]; u.z = p[1]; left -= d; u.path.shift(); }
    else { u.x += dx / d * left; u.z += dz / d * left; u.moving = true; return false; }
  }
  return true;
}
function inPipe(S, key) {
  const A = S.arm; let n = A.counter[key];
  for (const b of S.ships) if (b.key === key) n++;
  for (const o of S.officers) if (o.item === key) n++;
  for (const t of A.table) if (t.key === key) n++;
  for (const c of S.crew) if (c.item === key) n++;
  return n;
}
const dropAt = o => ARMORY.drop[o.home % ARMORY.drop.length];
const homeAt = o => ARMORY.home[o.home % ARMORY.home.length];
// the cold open's three boats are moored off the north quay; while main.js lists their berths (S.berth, x of each), the
// first gunboat crews walk to those instead of the slip (main.js coArm turns the launched boat into the moored one)
function boardPath(S, key) {
  if (key === 'gunboat' && S.berth && S.berth.length) { const bx = S.berth.pop(); return [[10.4, -0.6], [1, -2.6], [0.6, -29.8], [bx, -29.8]]; }
  return ARMORY.board[key].map(p => [...p]);
}
// a sunk boat's sailor climbs back onto the nearest quay edge and walks back to the queue (round the sheds by the roads)
function swimBack(S, b) {
  if (!S.arm) return;
  const cl = (v, a, c) => Math.max(a, Math.min(c, v));
  let at, path;
  if (b.x > 32 && (b.z > -32 || b.x - 32 > -32 - b.z)) { at = [30.4, cl(b.z, -28, 28)]; path = [[30.3, 2.4], [26.5, 1.9]]; }
  else if (b.z < -32) { at = [cl(b.x, -29, 29), -30.2]; path = [[0.6, -29.8], [1, -2.6]]; }
  else { at = ARMORY.gate; path = ARMORY.fromGate; }
  const t = Math.max(CREW.swim, Math.min(CREW.swimMax, Math.hypot(at[0] - b.x, at[1] - b.z) / CREW.swimV)); // a sunk boat's sailor swims home
  S.arm.swim.push({ t, t0: t, x0: b.x, z0: b.z, at, path });
}
// people walking while the rules are held (the first gift and the cold open): no crafting, no boats
export function crewMove(S, dt) {
  armInit(S);
  let qi = 0;
  for (const c of S.crew) {
    if (c.hold > 0) { c.hold -= dt; continue; }
    if (c.wet > 0) c.wet -= dt;
    if (c.st !== 'q') continue;
    const spot = qSpot(qi++);
    if (c.path.length) walkPath(c, CREW.walk, dt);
    else { c.path.push(spot); walkPath(c, CREW.walk, dt); c.path.length = 0; if (!c.moving) { c.hx = 0.6; c.hz = -0.8; } } // waiting: faces the table
  }
  for (const o of S.officers) if (o.st === 'back' && walkPath(o, CREW.officer, dt)) o.st = 'idle';
}
function armoryTick(S, dt) {
  armInit(S); const A = S.arm;
  for (const key of ITEM_KEYS) {
    const s = S.sheds[key]; if (!s.built) continue;
    if (inPipe(S, key) < shedCap(S, key) + CREW.spare) { s.timer -= dt; if (s.timer <= 0) { A.counter[key]++; s.timer = buildTime(S, key); S.ev.push({ e: 'craft', key }); } }
    else s.timer = Math.min(s.timer, buildTime(S, key));
  }
  const want = crewTotal(S) - S.ships.length - A.swim.length;
  let joined = 0;
  while (S.crew.length < want) { S.crew.push(newSailor(S, ARMORY.gate, ARMORY.fromGate)); joined++; }
  if (joined) S.ev.push({ e: 'join', who: 'sailor', n: joined });
  while (S.crew.length > Math.max(0, want)) { const i = S.crew.map(c => c.st).lastIndexOf('q'); if (i < 0) break; S.crew.splice(i, 1); } // a jump or an old save
  let oj = 0;
  while (S.officers.length < captains(S)) { const i = S.officers.length, o = { id: S.uid++, x: ARMORY.gate[0], z: ARMORY.gate[1], st: 'back', item: null, path: [], hx: 0, hz: -1, home: i, t: 0 }; o.path = [...ARMORY.fromGate.map(p => [...p]), [...homeAt(o)]]; S.officers.push(o); oj++; }
  if (oj) S.ev.push({ e: 'join', who: 'officer', n: oj });
  for (let i = A.swim.length - 1; i >= 0; i--) { const w = A.swim[i]; w.t -= dt; if (w.t <= 0) { A.swim.splice(i, 1); const c = newSailor(S, w.at, w.path); c.wet = 1.2; S.crew.push(c); S.ev.push({ e: 'crewBack', id: c.id, x: c.x, z: c.z }); } }
  // officers: an idle one (or one on its way back) goes for the first counter with an unclaimed weapon
  for (const o of S.officers) {
    if (o.st === 'idle' || o.st === 'back') {
      const key = ITEM_KEYS.find(k => S.sheds[k].built && A.counter[k] - A.claim[k] > 0);
      if (key) { A.claim[key]++; o.job = key; o.st = 'go'; o.path = ARMORY.pick[key].map(p => [...p]); if (key === 'gunboat') o.path.unshift([3.5, -6.4]); }
      else if (o.st === 'back') { if (walkPath(o, CREW.officer, dt)) o.st = 'idle'; continue; }
      else { o.moving = false; continue; }
    }
    if (o.st === 'go') { if (walkPath(o, CREW.officer, dt)) { o.st = 'pick'; o.t = CREW.pick; } }
    else if (o.st === 'pick') {
      o.t -= dt;
      if (o.t <= 0) {
        A.counter[o.job]--; A.claim[o.job]--; o.item = o.job; o.st = 'carry';
        const P = ARMORY.pick[o.job]; o.path = P.slice(0, -1).reverse().map(p => [...p]); if (o.job === 'gunboat') o.path.push([3.5, -6.4]); o.path.push([...dropAt(o)]);
        S.ev.push({ e: 'pick', id: o.id, key: o.item });
      }
    } else if (o.st === 'carry') { if (walkPath(o, CREW.officer, dt)) { o.st = 'put'; o.t = CREW.pick; o.hx = 0; o.hz = 1; } }
    else if (o.st === 'put') {
      o.t -= dt;
      if (o.t <= 0) { A.table.push({ id: S.uid++, key: o.item, res: 0 }); S.ev.push({ e: 'drop', id: o.id, key: o.item }); o.item = null; o.st = 'back'; o.path = [[...homeAt(o)]]; }
    }
  }
  // sailors: the queue holds its spots in order; the front one takes the oldest weapon on the table and walks to his boat
  let qi = 0;
  for (let i = 0; i < S.crew.length; i++) {
    const c = S.crew[i];
    if (c.hold > 0) { c.hold -= dt; continue; }
    if (c.wet > 0) c.wet -= dt;
    if (c.st === 'q') {
      const k = qi++, t = k === 0 && A.table.find(o => !o.res);
      if (t) { t.res = c.id; c.tid = t.id; c.st = 'take'; c.path.push([...ARMORY.take]); }
      else if (c.path.length) { walkPath(c, CREW.walk, dt); continue; }
      else { c.path.push(qSpot(k)); walkPath(c, CREW.walk, dt); c.path.length = 0; if (!c.moving) { c.hx = 0.6; c.hz = -0.8; } continue; }
    }
    if (c.st === 'take') { if (walkPath(c, CREW.walk, dt)) { c.st = 'grab'; c.t = CREW.take; c.hx = 0.45; c.hz = -0.9; } }
    else if (c.st === 'grab') {
      c.t -= dt;
      if (c.t <= 0) {
        const j = A.table.findIndex(o => o.id === c.tid), it = j >= 0 ? A.table.splice(j, 1)[0] : null;
        if (!it) { c.st = 'q'; continue; }
        c.item = it.key; c.st = 'go'; c.path = boardPath(S, it.key);
        S.ev.push({ e: 'arm', id: c.id, key: it.key, dmg: shipDmg(S, it.key, Math.max(1, S.sheds[it.key].lv)) });
      }
    } else if (c.st === 'go') { if (walkPath(c, CREW.walk, dt)) { c.st = 'board'; c.t = CREW.board; } }
    else if (c.st === 'board') {
      c.t -= dt;
      if (c.t <= 0) { S.ev.push({ e: 'board', id: c.id, key: c.item, x: c.x, z: c.z }); S.crew.splice(i--, 1); launch(S, c.item); }
    }
  }
}

// ---------- combat ----------
function launch(S, key) {
  const d = SHEDS[key], s = S.sheds[key], slip = SLIPS[d.slot];
  const hp = shipHp(S, key, s.lv);
  // boats slide out of the shed door: torpedo shed faces east, the other two face north
  const b = { id: S.uid++, key, x: slip[0], z: slip[1], hp, max: hp, cd: 0.5, vx: key === 'torpedo' ? 1 : 0, vz: key === 'torpedo' ? 0 : -1,
    slot: S.ships.filter(o => o.key === key).length, hitT: 0, len: key === 'destroyer' ? 10 : key === 'torpedo' ? 7.5 : 8, moving: false }; // round 8: the helicopter (9 long at 1x) was the 1.35x tank's 13
  S.ships.push(b); S.ev.push({ e: 'launch', id: b.id, key });
}

function moveToward(S, u, tx, tz, speed, dt, stopAt) {
  const d = Math.hypot(tx - u.x, tz - u.z);
  // (round 6: + 0.01, a raider that stepped exactly onto stopAt could land 1e-12 short and creep forever, stalling mission 22)
  if (d <= stopAt + 0.01) { u.moving = false; return true; }
  const step = Math.min(speed * dt, d - stopAt);
  const aim = navAim(S, u, tx, tz);
  let ang = Math.atan2(aim[1] - u.z, aim[0] - u.x);
  // pushed onto a shore or pier edge: sail straight out instead of freezing
  if (!wet(S, u.x, u.z, 1)) {
    u.x += Math.cos(ang) * step; u.z += Math.sin(ang) * step; u.moving = true; return false;
  }
  for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
    const a = ang + off, nx = u.x + Math.cos(a) * step, nz = u.z + Math.sin(a) * step;
    if (wet(S, nx, nz, 2)) {
      u.x = nx; u.z = nz;
      u.vx = lerp(u.vx, Math.cos(a), 0.25); u.vz = lerp(u.vz, Math.sin(a), 0.25);
      u.moving = true; return false;
    }
  }
  u.moving = false; return false;
}

// the mission 40 fight and the outpost burst after it (zone 3): our boats stay put
const holdFleet = S => S.zone === 3 && (S.phase === 'fight' || S.phase === 'wreck');

// R-300 round 7 third look: with its own len raiders crowded onto the leader's drawing; round 8 airship: (14 x 1.2 x 0.57 + 7)
// x 0.7 = 11.6 apart, a raider's bow just clear of the airship's envelope
const AIR_KEEP = 0.57;
// R-300 round 8 fourth review (pair air39): mission 39's drones kept 4.9 apart (len 3.5) but are drawn about 7 long (view DRAW
// 2.3), so two or three stacked into one red blob; a drone keeps its drawn length
const keepLen = u => u.kind === 'airship' ? u.len * (u.big || 1) * AIR_KEEP : u.kind === 'drone' ? u.len * 2 : u.len;
// R-300 round 8 fifth review (zoom g20): a drone flies 4.5 x its drawn 2.3 = 10.35 up, and the map camera looks down 52
// degrees along (1, -1) (view.js PITCH, yaw -45), so on screen it sits 10.35 / tan 52 = 8.1 further along the view than its
// spot on the water; one kept 18 from the mothership's middle on the camera side still lay over the hull. Keeping apart
// measures a drone where it is seen
const SEEN_K = 10.35 / Math.tan(52 * Math.PI / 180) * Math.SQRT1_2;
const seenX = u => u.kind === 'drone' ? u.x + SEEN_K : u.x, seenZ = u => u.kind === 'drone' ? u.z - SEEN_K : u.z;
function separate(S, list, minD) {
  // (round 6: the mission 20 flagship on its way to anchor is not shoved by its own escorts; nine of them pushed it 20 off
  // its course toward our quay)
  const nudge = (u, x, z) => { if (!u.hold && wet(S, x, z, 2)) { u.x = x; u.z = z; } };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], dx = seenX(b) - seenX(a), dz = seenZ(b) - seenZ(a), d = Math.hypot(dx, dz);
    const md = minD(a, b);
    // R-300 round 7 third look: the 3.8x robot is never shoved by its raiders, it shoves them (node sim s7 careless: raiders parked
    // on its last waypoint held it 15.5 off, out of our boats' reach, and mission 39 took 244 s against 72)
    const ka = a.kind === 'airship' ? 0 : b.kind === 'airship' ? 2 : 1, kb = b.kind === 'airship' ? 0 : a.kind === 'airship' ? 2 : 1;
    if (d > 0.01 && d < md) { const p = (md - d) / 2 / d; if (ka) nudge(a, a.x - dx * p * 0.5 * ka, a.z - dz * p * 0.5 * ka); if (kb) nudge(b, b.x + dx * p * 0.5 * kb, b.z + dz * p * 0.5 * kb); }
  }
}

// round 8 (owner 2026-11-14 03:27 "super croweded comapre to reference, like they all cluttered together"): the round 7
// recordings had 91 to 94% of our boats within 1.5 of their own drawn lengths of the next one (median 1.1 to 1.2), Top Force's
// green blobs about 1.95 body heights apart; boats are drawn smaller now (view.js DRAW) and keep 1.6 x / 1.2 x apart (node bots,
// seeds 7 and 1: 1.75 / 1.35 put boats out of reach and the careless run took 60 s longer; raiders 0.8 apart made mission 10
// 50 s later, so they stay at 0.7). Torpedo boats 2 -> 1 and helicopters 3 -> 2, each one stronger, so the fleet is 9 at most
const FLEET_ALONG = 1.6, FLEET_ACROSS = 1.2, FLEET_HOLD = 0.8, RED_KEEP = 0.7;
function separateFleet(S, list) {
  // R-300 round 9 (pair m20): keeping apart never shoves a boat further out past the glowing line while the zone's line holds
  // (node seed 3: the helicopter, len 9, sat 4 to 10 past it from mission 16 on, shoved out faster than it sails back); a shove
  // past it slides along it instead (a boat already outside, say on its way out from the sheds, is not pulled in by this)
  const L = (S.phase === 'battle' || S.phase === 'between') && !inGate(S) ? LINES[S.zone] : null;
  const nudge = (u, x, z) => {
    const H = L && lineCircle(L, L.r + TUNE.lineOut - (u.key === 'destroyer' ? TUNE.heliBack : 0));
    if (H) { const od = Math.hypot(x - H.c[0], z - H.c[1]); if (od > H.r) { const o0 = Math.hypot(u.x - H.c[0], u.z - H.c[1]); if (od > o0) { const k = Math.max(H.r, o0) / od; x = H.c[0] + (x - H.c[0]) * k; z = H.c[1] + (z - H.c[1]) * k; } } }
    if (wet(S, x, z, 2)) { u.x = x; u.z = z; }
  };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.01 || d > 20) continue;
    let hx = (a.vx || 0) + (b.vx || 0), hz = (a.vz || 0) + (b.vz || 0), hl = Math.hypot(hx, hz);
    if (hl < 0.2) { hx = 1; hz = 0; hl = 1; }
    hx /= hl; hz /= hl;
    const m = (a.len + b.len) / 2, q = Math.hypot((dx * hx + dz * hz) / (m * FLEET_ALONG), (dz * hx - dx * hz) / (m * FLEET_ACROSS));
    if (q < 1) { const p = (1 / Math.max(q, 0.05) - 1) / 4; nudge(a, a.x - dx * p, a.z - dz * p); nudge(b, b.x + dx * p, b.z + dz * p); }
  }
}

function nearest(list, u, maxD) {
  let best = null, bd = 1e9;
  for (const o of list) { if (o.hp <= 0) continue; const d = dist(o, u); if (d < bd && d < (typeof maxD === 'function' ? maxD(o) : maxD)) { bd = d; best = o; } }
  return best;
}

function fire(S, from, to, kind, dmg, extra = {}) {
  S.shots.push({ kind, x: from.x, z: from.z, tx: to.x, tz: to.z, target: to.id, side: extra.side || 'us', dmg,
    speed: kind === 'torpedo' ? 34 : 70, splash: extra.splash || 0, from: from.id });
  S.ev.push({ e: 'fire', kind, x: from.x, z: from.z, tx: to.x, tz: to.z, side: extra.side || 'us', id: from.id });
}

function shipsTick(S, dt) {
  const F = FRONTS[S.zone], sm = speedMul(S);
  // (round 7: boats no longer launch straight off the shed timer; armoryTick crafts, carries and crews them)
  const fighting = S.phase === 'battle', gate = inGate(S);
  // round 9 (owner 2026-11-14 07:24 "the enemy ships stills moving like in the face instead of shooting in the distance"):
  // Top Force's soldiers never chase. They hold the fence through the 42 (0:25 to 2:13), walk out onto the front line at
  // 2:16 and stand on it from then on, shooting whatever comes into reach (refs f1 s0097, s0139, s0254). The old fleet sailed
  // out to every raider (join 85, anchor 20) and closed to 0.92 of its range. Each boat now keeps a spot: the quay line at the
  // gate, the zone's front line after it (lineSlots), the middle spots first; a boat with nothing in reach steps out at most
  // lineStep toward the nearest red, and stays where it is once that red is in reach
  const slots = gate ? GATE.slots : lineSlots(S, S.zone), sk = gate ? 'g' : 'z' + S.zone + '.' + navStage(S);
  if (slots) {
    const taken = new Set();
    for (const b of S.ships) if (b.sk === sk && b.spot != null && b.spot < slots.length && !taken.has(b.spot)) taken.add(b.spot); else b.spot = null;
    for (const b of S.ships) if (b.spot == null) { let k = 0; while (taken.has(k) && k < slots.length) k++; b.spot = k < slots.length ? k : null; b.sk = sk; if (b.spot != null) taken.add(k); }
  }
  S.ships.forEach((b, i) => {
    const d = SHEDS[b.key]; b.hitT = Math.max(0, b.hitT - dt);
    // round 6: the mission-20 flagship goes first once it is in reach (its life is its hp over the fleet's fire)
    const boss = fighting ? S.enemies.find(o => o.kind === 'boss' && o.hp > 0 && dist(o, b) <= d.range) : null;
    const tgt = fighting ? boss || nearest(S.enemies, b, d.range) : null;
    let tx, tz;
    if (slots && b.spot != null) { [tx, tz] = slots[b.spot]; }
    else {
      // no line here (zone 4, or more boats than spots): hold formation around the rally point of the active zone
      const ring = i % 8, row = Math.floor(i / 8);
      // round 8 (owner "they all cluttered together"): the waiting ring is 14 across instead of 10 (8 slots 10.7 apart, not 7.7)
      const a = ring / 8 * Math.PI * 2 + row * 0.4, r = 14 + row * 11;
      tx = F.rally[0] + Math.cos(a) * r; tz = F.rally[1] + Math.sin(a) * r * 0.8;
      if (!wet(S, tx, tz, 4)) { tx = F.rally[0]; tz = F.rally[1]; }
    }
    const spot = { x: tx, z: tz }, holdLine = (fighting || S.phase === 'between') && !gate;
    if (fighting && !gate) {
      if (tgt) { if (dist(tgt, spot) > d.range) { tx = b.x; tz = b.z; } } // stepped out to reach it: stay till it falls
      else {
        // only toward a red that has stopped to fight: stepping toward one still sailing in made it stop at its spawn,
        // out of every other boat's reach (node trace, mission 14: one gunboat against it for 8 s)
        const o = nearest(S.enemies.filter(e => e.fight), spot, d.range + TUNE.lineStep);
        if (o) { const dd = dist(o, spot), k = Math.min(TUNE.lineStep, dd - d.range * 0.95) / dd; if (k > 0) { tx += (o.x - tx) * k; tz += (o.z - tz) * k; } }
      }
    }
    // no boat holds past the glowing line (view.js draws it lineOut past the front row): it slides along it. R-300 round 9
    // (pair m20, recording rec-d): this sat in the step branch only, so a boat shoved out by separateFleet (nine boats on
    // eight spots, a helicopter shoved 20 past) that then found a red in reach stayed out there; from mission 16 one or two
    // boats stood past the line in every logged frame. Now the hold point is pulled back too. Recording rec-e: in the 2 s
    // between missions the ninth boat (no spot, so the rally ring) sailed 6 past it and back; the line shows then too
    if (holdLine) {
      const L = LINES[S.zone];
      if (L) { const H = lineCircle(L, L.r + TUNE.lineOut - (b.key === 'destroyer' ? TUNE.heliBack : 0)), ox = tx - H.c[0], oz = tz - H.c[1], od = Math.hypot(ox, oz); if (od > H.r) { tx = H.c[0] + ox / od * H.r; tz = H.c[1] + oz / od * H.r; } }
    }
    // look review 11 (after-fight 1, s8 080): once the mission 40 fight starts, the fleet holds where the armada scene spread it
    if (holdFleet(S) && Math.hypot(b.x - F.rally[0], b.z - F.rally[1]) < 22) b.moving = false;
    else moveToward(S, b, tx, tz, d.speed * sm, dt, 1.5);
    if (tgt) {
      b.vx = lerp(b.vx, (tgt.x - b.x) / (dist(tgt, b) || 1), 0.1); b.vz = lerp(b.vz, (tgt.z - b.z) / (dist(tgt, b) || 1), 0.1);
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = d.rate; const dmg = shipDmg(S, b.key, S.sheds[b.key].lv);
        if (b.key === 'destroyer') { fire(S, b, tgt, 'shell2', dmg / 2); fire(S, b, tgt, 'shell2', dmg / 2); } // two shells, one Tank shot between them
        else fire(S, b, tgt, d.shot, dmg, { splash: d.splash || 0 });
      }
    } else b.cd = Math.max(0, b.cd - dt);
  });
  // repair dock heals everyone a little every 2 s
  const hp = healPct(S);
  if (hp > 0) { S.healCd -= dt; if (S.healCd <= 0) { S.healCd = 2; for (const b of S.ships) if (b.hp < b.max) { b.hp = Math.min(b.max, b.hp + b.max * hp); S.ev.push({ e: 'heal', id: b.id }); } } }
}

function enemiesTick(S, dt) {
  let R;
  // R-300 round 9 second look (pair first, recording rec-f 0:34): until the first armed boat is out (sim 15 s) a raider had
  // nothing to stop for, sailed to 16 off the quay and the quay gun sank it. Top Force's first reds stop at their reach from
  // the fence and shoot at it before any soldier is out (f1 s0024 to s0035): ours stop at their reach from the quay line's
  // first spot and shell the quay gun (no damage) until a boat there is in their reach. Not only while no boat is out: the
  // first boat leaves its slip or berth 15 to 40 behind that spot, and raiders that sailed on to its reach stood 18 off it
  const fence = inGate(S) ? { x: GATE.slots[0][0], z: GATE.slots[0][1] } : null, gun = { x: TURRET_AT[0], z: TURRET_AT[1], id: -9 };
  for (const e of S.enemies) {
    e.hitT = Math.max(0, e.hitT - dt); e.fight = false;
    // round 9 (owner 2026-11-14 07:24 "the enemy ships stills moving like in the face instead of shooting in the distance"):
    // Top Force's reds walk their path and stop the moment a soldier is in their reach, then stand and shoot from there,
    // 0.3 to 0.42 of the screen off (refs f1 s0038, s0097, s0254); ours used to close to 0.9 of their range and, at the gate,
    // sail in to 9 off the quay. They never turn off their path toward a boat now
    const tgt = nearest(S.ships, e, e.range);
    // (a flagship on its way to anchor sails on past the jetty's tip first: stopped where it first met a boat, it lay on the reef)
    if (tgt && !(e.hold && e.pi < 1)) {
      e.vx = lerp(e.vx, (tgt.x - e.x) / (dist(tgt, e) || 1), 0.1); e.vz = lerp(e.vz, (tgt.z - e.z) / (dist(tgt, e) || 1), 0.1);
      e.moving = false; e.fight = true; if (e.hold) e.held = true;
      e.cd -= dt; if (e.cd <= 0) { e.cd = e.rate; fire(S, e, tgt, e.kind === 'boss' ? 'shellBig' : 'shellRed', e.dmg, { side: 'them' }); }
    } else if (fence && dist(fence, e) <= e.range) {
      e.vx = lerp(e.vx, (gun.x - e.x) / (dist(gun, e) || 1), 0.1); e.vz = lerp(e.vz, (gun.z - e.z) / (dist(gun, e) || 1), 0.1);
      e.moving = false; e.fight = true;
      e.cd -= dt; if (e.cd <= 0) { e.cd = e.rate * 1.5; fire(S, e, gun, 'shellRed', 0, { side: 'them' }); }
    } else if (e.esc && (R = S.enemies.find(o => o.kind === 'airship')) && !R.fight) {
      // the mission 39 robot's pack keeps its slot round the robot until one of them meets our boats (each one following
      // its own offset path drifted 20 to 40 apart where a slot's waypoint fell on land); its waypoint keeps step
      moveToward(S, e, R.x + e.esc[0], R.z + e.esc[1], R.speed * 1.3, dt, 1.5); e.pi = Math.min(R.pi, e.path.length - 1);
      e.cd = Math.max(0, e.cd - dt);
    } else if (e.pi < e.path.length) {
      // round 6: a waypoint before the last counts as passed within 7 (with 3, the gate's last group of six jammed
      // around it, pushed apart by separate(), and sat out of reach for 40 s)
      const p = e.path[e.pi]; if (moveToward(S, e, p.x, p.z, e.speed, dt, e.pi < e.path.length - 1 ? 7 : 3)) e.pi++;
      e.cd = Math.max(0, e.cd - dt);
    } else if (!e.hold && (R = nearest(S.ships, e, 1e9))) {
      // round 8 bot run (seed 1 careless, mission 39): a raider shoved 34 off its last waypoint by the airship sat out of
      // everyone's reach for 15 min; one with no path left now makes for our nearest boat
      moveToward(S, e, R.x, R.z, e.speed, dt, e.range * 0.95); e.cd = Math.max(0, e.cd - dt);
    } else { e.moving = false; if (e.hold) e.held = true; }
  }
  // harbor turret helps near the quay
  S.turretCd -= dt;
  if (S.turretCd <= 0) {
    const t = { x: TURRET_AT[0], z: TURRET_AT[1], id: -1 };
    // round 9: only what comes up to the quay (30); at 62 it shot the raiders standing off our line, which Top Force's base never does
    const e = nearest(S.enemies, t, 30);
    if (e) { S.turretCd = 1.6; fire(S, t, e, 'shell', 25 * S.hq * Math.pow(1.1, S.done)); } else S.turretCd = 0.3;
  }
}

function shotsTick(S, dt) {
  const keep = [];
  for (const s of S.shots) {
    const list = s.side === 'us' ? S.enemies : S.ships;
    const t = list.find(o => o.id === s.target);
    if (t) { s.tx = t.x; s.tz = t.z; }
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz), st = s.speed * dt;
    if (d <= st) {
      if (s.splash) {
        for (const o of list) if (Math.hypot(o.x - s.tx, o.z - s.tz) <= s.splash) hit(S, o, o === t ? s.dmg : s.dmg * 0.5, s.side);
      } else if (t) hit(S, t, s.dmg, s.side);
      S.ev.push({ e: 'boom', kind: s.kind, x: s.tx, z: s.tz, side: s.side });
    } else { s.x += dx / d * st; s.z += dz / d * st; keep.push(s); }
  }
  S.shots = keep;
}

function hit(S, o, dmg, side) {
  if (o.hp <= 0) return;
  o.hp -= dmg; o.hitT = 0.15;
  S.ev.push({ e: 'dmg', id: o.id, side, n: dmg });
}

function cleanup(S) {
  const live = [];
  // round 8: drones fall with the ship that launched them
  for (const e of S.enemies) if (e.mom != null && e.hp > 0 && !S.enemies.some(o => o.id === e.mom && o.hp > 0)) { e.hp = 0; e.fell = true; }
  for (const e of S.enemies) {
    if (e.hp > 0) { live.push(e); continue; }
    if (e.gk != null && S.m && S.m.gate) e.gold = gateKillGold(S.m) * e.gk;
    S.gold += e.gold; S.kills++; if (S.m) S.m.killed++;
    S.ev.push({ e: 'kill', x: e.x, z: e.z, gold: e.gold, kind: e.kind, id: e.id });
  }
  S.enemies = live;
  const ships = [];
  for (const b of S.ships) { if (b.hp > 0) ships.push(b); else { S.ev.push({ e: 'sunk', x: b.x, z: b.z, key: b.key, id: b.id }); swimBack(S, b); } }
  S.ships = ships;
}

export function step(S, dt) {
  // look review 7 (armada, flag): story scenes pause the sim with the fleet still bunched from the last mission; the time
  // stands still but hulls keep easing apart. A stopped boat's heading is not known here, so the gap is the same all round:
  // 1.5 x the mean length (12 for gunboats, as along the heading while sailing), so a boat lying across its neighbours
  // cannot touch them either; at 10.4 the hulls were clear but cabins and masts, seen from the tilted camera, still met
  // (bots never pause, so balance is untouched)
  if (S.paused) {
    separate(S, S.ships, (a, b) => (a.len + b.len) * FLEET_HOLD); pushOff(S);
    // look review 7 (armada): with the fleet where mission 39 left it, the armada's front spots were 6 to 7 from our
    // front gunboats, so two raiders parked bow on bow with them; spots a story scene is about to fill ([x, z, len], set
    // by the game, never saved) push our boats back by the same all-round gap while the scene waits (bots never set it)
    if (S.keepOff) for (const u of S.ships) for (const [x, z, len] of S.keepOff) {
      const dx = u.x - x, dz = u.z - z, d = Math.hypot(dx, dz), md = (u.len + len) * 0.75;
      if (d > 0.01 && d < md) { const k = (md - d) * 0.5 / d, nx = u.x + dx * k, nz = u.z + dz * k; if (wet(S, nx, nz, 2)) { u.x = nx; u.z = nz; } }
    }
    return;
  }
  S.t += dt;
  // L30, L31: the INCOMING clock stops once the boss is here (fightReady) and, in the tutorial (holdIncoming), slows
  // so it can never reach 00:00 before mission 40: it keeps at least 20 s per mission still to play, and 1 s at worst
  if (S.incoming != null && S.phase !== 'fight' && S.phase !== 'fightReady' && S.phase !== 'expand' && S.phase !== 'end') {
    const left = 40 - S.done, k = TUNE.holdIncoming && left > 0 ? Math.min(1, Math.max(0, S.incoming - 1) / (left * 20)) : 1;
    S.incoming = Math.max(0, S.incoming - dt * k);
    if (S.incoming === 0 && !S.flags.armada) { S.flags.armada = true; S.ev.push({ e: 'armada' }); }
  }
  // round 9: Top Force's Mission-10 starts about 8 s after the Tank Factory is up (3:13 to 3:21)
  // Top Force starts Mission-10 the moment the Tank reaches Lv.10 (3:21)
  if (S.phase === 'between' && S.waitPad && S.sheds.destroyer.lv >= 10) { S.waitPad = false; S.between = Math.min(S.between, 2); }
  if (S.phase === 'between') { S.between -= dt; if (S.between <= 0) { S.phase = 'battle'; S.waitPad = false; startMission(S); } }
  if (S.phase === 'battle' && !S.m) startMission(S);
  missionTick(S, dt);
  armoryTick(S, dt);
  shipsTick(S, dt);
  enemiesTick(S, dt);
  shotsTick(S, dt);
  cleanup(S);
  // boats are drawn 1.2x bigger since round 4: keep hulls from stacking
  // look review (round 5): at 0.42 the fleet still read as one blob (boss20, mission 39 shots); 0.55 keeps a gap between hulls
  // look review 6 (bark, boss20, inc): drawn 1.2x, a gunboat is 9.6 long, so 8.8 apart still put a bow over the next stern;
  // the gap now runs along the pair's heading (1.5 x the mean length, 12 for gunboats) and stays 1.1 x across (8.8, as before)
  separateFleet(S, S.ships);
  // look review 11 (after-fight 1, s8 080): while the fleet holds after the mission 40 fight it keeps the all-round
  // 1.5 x mean length gap of the story pause (12 for gunboats); no enemies are left then, so balance is untouched
  if (holdFleet(S)) separate(S, S.ships, (a, b) => (a.len + b.len) * FLEET_HOLD);
  // round 6 (R-300, after_0330): at 0.42 the boss's escorts piled into one raft that could not be counted; Top Force's reds
  // stand about a body apart round the mech (5:30 to 6:10), so raiders keep 0.7 of their lengths apart (the boss as before)
  // R-300 round 8 fourth review (pair mother20): at 0.42 a drone kept 13.4 from the mothership's middle, still over its black
  // deck in the pile; a drone hovers clear of the drawn hull (half its drawn length plus a drone), over the water beside it
  const dk = (m, d) => m.len * (m.big || 1) * 0.5 + d.len * 1.1;
  separate(S, S.enemies, (a, b) => a.kind === 'boss' && b.kind === 'drone' ? dk(a, b) : b.kind === 'boss' && a.kind === 'drone' ? dk(b, a)
    : (keepLen(a) + keepLen(b)) * (a.kind === 'boss' || b.kind === 'boss' ? 0.42 : RED_KEEP));
  pushOff(S);
}

// our boats never sit inside a raider's or the boss's hull (boss20 shot: three gunboats drawn over the warship); only ours move
// never pushed past 0.85 x the boat's own gun range (the boss hull is wider than a gunboat's range: pushed further, gunboats and the destroyer could not fire and mission 20 stalled)
function pushOff(S) {
  for (const b of S.ships) for (const e of S.enemies) {
    if (e.hp <= 0) continue;
    const dx = b.x - e.x, dz = b.z - e.z, d = Math.hypot(dx, dz), md = Math.min(b.len * 0.6 + e.len * (e.big || 1) * 0.5, SHEDS[b.key].range * 0.85);
    if (d > 0.01 && d < md) { const k = (md - d) * 0.5 / d, x = b.x + dx * k, z = b.z + dz * k; if (wet(S, x, z, 2)) { b.x = x; b.z = z; } }
  }
}

// Armada (INCOMING reached zero): a big extra wave on the current mission. Top Force never shows this moment.
export function armadaWave(S) {
  if (!S.m) return;
  const extra = 18; S.m.total += extra; S.m.per = S.m.total; S.m.wave = S.m.waves - 1;
}
