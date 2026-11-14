// Harbor Front 3D map. World units (a gunboat is 8 long), x east, z south, y up. Land south-west, sea north-east.
// Scale and distances measured on Top Force: Commander (emulator play 2026-11-11, shots 027, 055, 094, 107, 130):
// the camera looks down about 52 degrees with a 45 degree turn, so the base reads as a diamond; at the normal
// zoom the base is about one screen wide; the first enemy outpost sits about 1.3 base widths above the base on
// screen (top edge), and the fighting happens between the two.

// The harbor base: a 64 x 64 concrete quay. Its north and east edges are the waterfront (top-left and top-right
// edges of the diamond on screen), its south and west edges are fenced land.
export const BASE = { x0: -32, x1: 32, z0: -32, z1: 32, y: 1.8 };
// Stage 3 (harbor grows after mission 40): a new wharf south of the torpedo slip and a pier west of the gunboat slip.
export const WHARF = [32, 54, 24, 46];
export const PIER = [-31, -23, -62, -32];

// Coast: land where x is west of the east coast and z is south of the north coast. Straight along the quay,
// wavy beaches further out (the wave never reaches the quay corners).
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function coastE(z) { const k = sstep(36, 60, z); return 32 + k * (8 + 7 * Math.sin(z * 0.045) + 3 * Math.sin(z * 0.13)); }
export function coastN(x) { const k = sstep(-36, -60, x); return -32 - k * (6 + 6 * Math.sin(x * 0.05 + 1) + 3 * Math.sin(x * 0.17)); }
// > 0 on land (distance-ish to the mainland coast), < 0 at sea
export function mainland(x, z) { return Math.min(coastE(z) - x, z - coastN(x)); }

// Zones around the harbor (Top Force: about 20 small areas around the base, cleared one by one).
export const ZONES = {
  2: { n: 2, name: 'North Reef Outpost', at: [80, -95], r: 14, missions: [1, 20], kind: 'outpost' },
  3: { n: 3, name: 'East Raft Camp', at: [125, -20], r: 16, missions: [21, 40], kind: 'rafts' },
  4: { n: 4, name: 'North-East Anchorage', at: [178, -102], r: 18, missions: [41, 60], kind: 'pontoon' },
};
// Zone 2 jetty, pointing south toward the harbor [x0, x1, z0, z1].
export const JETTY = [70, 74, -84, -72];
// Small rocky islets that only decorate (boats sail round them).
export const ROCKS = [[28, -96, 5], [108, -62, 4], [150, 12, 5], [62, 46, 4], [-6, -78, 3.5], [150, -60, 3]];

const inRect = (x, z, r, m) => x > r[0] - m && x < r[1] + m && z > r[2] - m && z < r[3] + m;
const inBase = (x, z, m) => x > BASE.x0 - m && x < BASE.x1 + m && z > BASE.z0 - m && z < BASE.z1 + m;

// Sea check for boat navigation. stage: 1 start, 2 repair dock moored, 3 harbor grown.
export function isWater(x, z, stage, margin = 2) {
  if (mainland(x, z) > -margin) return false;
  if (inBase(x, z, margin)) return false;
  if (x < -60 || z > 70 || z < -170 || x > 240) return false; // edge of the playable sea
  if (Math.hypot(x - 80, z + 95) < 16 + margin) return false; // zone 2 reef island
  if (inRect(x, z, JETTY, margin * 0.5)) return false; // its wooden jetty
  if (Math.hypot(x - 125, z + 20) < 17 + margin) return false; // zone 3 raft camp
  if (Math.hypot(x - 178, z + 102) < 18 + margin) return false; // zone 4 anchorage
  for (const r of ROCKS) if (Math.hypot(x - r[0], z - r[1]) < r[2] + margin) return false;
  if (stage >= 2 && Math.hypot(x - 46, z + 12) < 6 + margin) return false; // floating repair dock
  if (stage >= 3 && (inRect(x, z, WHARF, margin) || inRect(x, z, PIER, margin))) return false;
  return true;
}

// Sheds on the quay: centre of the building, which way its door faces, and where its slipway meets open water.
export const SHEDS3D = {
  W1: { at: [-14, -19], face: 'n', w: 16, d: 20 },   // gunboat shed, door north
  W2: { at: [12, -18], face: 'n', w: 18, d: 22 },    // destroyer dry dock, door north
  S1: { at: [19, 14], face: 'e', w: 20, d: 16 },     // torpedo shed, door east
};
export const SLIPS = { W1: [-14, -40], W2: [12, -42], S1: [41, 14] };
export const SHED_AT = { W1: SHEDS3D.W1.at, W2: SHEDS3D.W2.at, S1: SHEDS3D.S1.at };
export const HQ_AT = [-13, 15];
export const REPAIR_AT = [46, -12];
// world height of each level tag's anchor (the tag sits on top of it); main.js labels and view.js LV UP share it
export const TAG_Y = { gunboat: 11.5, torpedo: 10.5, destroyer: 13, repair: 6, hq: 16 };
export const TURRET_AT = [26, -26];

// Round 7 (owner 2026-11-13 "from the reference they have something like generating guns for troops to pick up"): Top Force
// 0:22 to 0:44 (refs r7 pick_a, pick_b): a factory crafts a weapon onto a white counter in front of it, an officer carries it
// to a white distribution table, the soldiers queue in a yellow-lined square beside the table, the front one takes it and
// walks out to fight. Ours on the open quay south of the two north sheds: each shed's counter faces the table, the table
// stands east of the north-south road, the queue square west of it; armed sailors walk up the road to the north edge (or
// round to the torpedo slip) and their boat goes down the slip. [x, z] in world units; paths avoid every building.
export const ARMORY = {
  table: [14.5, -1.2], tableW: 7, tableD: 2.6,                    // long side along x (x 11 to 18, z -2.5 to 0.1)
  drop: [[12.5, -3.4], [14.5, -3.4], [16.5, -3.4]],               // where an officer puts an item down (north side)
  home: [[13, -4.4], [16, -4.4], [10, -4.6], [19, -4.6], [6.5, -3.6]], // where idle officers wait (the fifth clear of the tank counter)
  take: [12, 0.9],                                                 // where the front sailor stands to take one (south-west end)
  queue: [9.6, 1.1], qGap: 2.3, qRow: 3, qRowGap: 2.3,            // first queue spot; rows of three running west, then south
  pad: [7.3, 3.3, 8.2, 6.4],                                       // the yellow-lined queue square [x, z, w, d]
  // R-300 round 7 fourth look (pairs mech, robot39): the table's count bubble hung over the tank counter's east end and pushed its
  // number and craft bar onto the sand; the tank counter stands 3 west (still before the factory door, x 3 to 21)
  counter: { gunboat: [-9.5, -7.6], destroyer: [9, -6.1], torpedo: [22, 5.3] }, // in front of each shed, facing the table
  pick: { gunboat: [[-9.5, -5.7]], destroyer: [[9, -4.3]], torpedo: [[19.8, -3.4], [19.8, 1.8], [22, 3.5]] }, // officer's way there
  board: {                                                         // armed sailor's way from the take spot to his boat
    gunboat: [[10.4, -0.6], [1, -2.6], [0.6, -29.8], [-9.2, -29.8]],
    destroyer: [[10.4, -0.6], [1, -2.6], [0.6, -29.8], [5.4, -29.8]],
    torpedo: [[12.5, 1.9], [26.5, 1.9], [30.3, 2.4], [30.3, 8.8]],
  },
  gate: [0.5, 30], fromGate: [[0.8, 4]],                           // new sailors and officers walk in through the land gate
};

// Round 6 (owner 2026-11-12 22:26 "try to get the exact same flow and feel and pacing and distance and size and qty"):
// Top Force 0:35 to 2:10 is one "Enemies 42" counter fought at the base fence, 30 to 90 px out with the base 460 px wide
// (0.07 to 0.2 base widths), red groups of 1 to 8 walking in from the top right, 3 to 9 green on screen. Missions 1 to 9
// are that stretch here: the boats hold a line just off the north-east quay corner and the raiders sail all the way in.
// sizes: the nine groups add up to 42 (Top Force's counter starts at 42 at 0:40).
export const GATE = {
  last: 9, sizes: [3, 4, 4, 5, 5, 5, 5, 5, 6],
  slots: [[30, -36], [36, -30], [21, -36], [36, -21], [12, -36], [36, -12], [3, -36], [36, -3]],
  via: [[58, -62]], goal: [40, -40], label: [20, -20],
  perp: [0.775, 0.634], // across the via-to-goal path, for the side-by-side lanes of a group
};

// Per zone: where our fleet gathers, where raiders appear, where they head.
export const FRONTS = {
  // round 5: [60, -96] dropped, raiders appeared on top of Bram's rock (main.js BRAM_AT [56, -100]); the other three
  // average the same path to the harbor (62 against 63). bossSpawn: the most open water (9 off the reef)
  // round 6: Top Force fights missions 12 to 20 190 to 290 px out from the fence (0.45 to 0.65 base widths) and zone 3
  // 115 to 335 px; the fleet gathered 1 base width out and went 58 to meet raiders by the outpost (0.8 to 1.0). It now
  // gathers closer and only sails out to raiders within engage of it
  // round 6 (R-300 #3, playthrough against Top Force 5:22 to 6:20): the boss stands by its camp about half a base width off
  // the fence and the soldiers go out to it; ours chased our boats and stopped wherever it met them, 11 to 50 off the quay
  // (node seeds 1, 7, 2). bossHold: where the flagship drops anchor and waits, 45 off the quay corner, its hull clear of the
  // jetty and the reef; its escorts gather round it
  2: { rally: [38, -44], engage: 16, spawns: [[64, -82], [84, -74], [94, -74]], via: [[56, -64]], goal: [36, -38], bossSpawn: [94, -74], bossHold: [50, -69] }, // R-300 round 8: [56, -70] left the mothership's stern 0.4 off the jetty tip (it read as moored on the outpost's pier); 6.4 clear now
  3: { rally: [46, 2], engage: 16, spawns: [[106, -24], [108, -8], [104, -36], [110, 4]], via: [[86, -14]], goal: [42, 4] },
  4: { rally: [100, -72], spawns: [[156, -92], [160, -78], [152, -110]], via: [[124, -84]], goal: [62, -40] },
};

// Round 9 (owner 2026-11-14 07:26 "[Image #7] and wheres this line thing"): Top Force draws a glowing front line, green on
// our side and red on theirs, round the ground it holds; at 2:16 the soldiers walk out onto it and from then on stand on it
// (refs f1 s0137 to s0142). Ours is an arc on the water round the quay toward the zone's outpost: c the arc's middle, dir
// toward the outpost, r how far out the front row stands, back how far behind it the second row stands (Top Force's
// soldiers stand on and behind the line, never past it). Zone 2's
// nearest raider spawn is 59 off the arc's middle: at r 18 a raider sails 8 to 20 before the front row is in its reach
export const LINES = {
  2: { c: [32, -32], dir: [0.606, -0.795], r: 18, back: 9, flat: 100 },
  3: { c: [32, -6], dir: [0.98, -0.2], r: 26, back: 9, flat: 100 },
};
// R-300 round 9 (pairs line, m12, m20; owner image 7; f1 s0138 to s0140): drawn round c the line was a dome about a
// quarter of the screen across, read as the quay gun's range ring; Top Force's runs right across the screen in a gentle
// curve. The glowing line and the furthest a boat may stand sit on one wider circle: its middle pushed back flat along dir
// (inside the quay), so it meets the old arc's front point (out past c along dir) and runs out flat both ways.
// R-300 round 9 second look (pair line, play camera): at flat 40 it still read as a rainbow or a range ring, curving down at
// both screen edges; at 100 it drops about 2.5 over a screen half (Top Force's runs edge to edge with a gentle wave, s0139)
export function lineCircle(L, out) { return { c: [L.c[0] - L.dir[0] * L.flat, L.c[1] - L.dir[1] * L.flat], r: out + L.flat }; }

// Camera target and zoom (1 = 95 units across). Top Force keeps the camera close: on the fight in front of the
// outpost while missions run (a gunboat about 1/8 of the screen), on the harbor while you upgrade (a shed about
// 1/3), and pulls back only for an HQ upgrade or the harbor growing (base about half the screen).
// round 6: Top Force fights beside the base at the base's own zoom (units 8.3% of the screen width at 0:40 and 4:15 alike);
// ours zoomed in to 1.5 for the fronts (gunboats 12% of the width). Same 1.2 now, centred on where the fights run
// round 6 (playthrough measured against Top Force): at 1.2 a gunboat was 9.4% of the screen width at the base and 10.5% at
// the front, the base 1.19 to 1.42 screens wide; Top Force's soldier is 7.9% / 7.7%, its base about 0.96 screens wide.
// The owner asked for "exact same ... size", so the base view is 1.0 and the front 0.9
export const ZONE_CAM = { 2: [52, -58, 0.9], 3: [68, -6, 0.9], 4: [140, -90, 0.98], base: [0, -2, 1.0], wide: [4, -8, 0.64], wide3: [28, -18, 0.56] }; // wide3 moved so the grown harbor sits mid-screen instead of 40% forest (look review, round 5); look review 2: at 0.66 the new pier left the screen and the wharf sat under Upgrades, so it pulls back to 0.56 with both in view
