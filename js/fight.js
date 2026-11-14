// Mission 40 manual battle (Top Force 12:55-13:40), played on the same 3D harbor: the camera turns to face east
// with Ironjaw's flagship in front of the raft camp at the top and our quay at the bottom. Energy fills, tap the
// squad card (cost 50) to send five gunboats, hero portraits ride over squads and fill an ultimate bar; tap a full
// hero for the full-screen "Ultimate-DPS" card and a big hit. World units, same events as the sim so the view
// draws shells, explosions and sinking the same way.
import * as G from './sim.js';
import { ZONES, isWater } from './world.js';
import { $, show, fmt, callout, flashScreen, bump, finger, fingerTick } from './ui.js';
import { sfx, buzz } from './audio.js';

const QA = () => document.documentElement.classList.contains('qa') || !!window.__PROTO_QA;

// round 6 playthrough (Top Force video 13:08 to 13:30): the fight is 22 s from the first squad to Victory, about 11 green
// on screen 2 s in, 5 at 7 s and 2 at 12 s (the reds sink them), the purple ultimate lands about 8 s in (video 13:16). The bar starts full
// (two squads at once, then one every 4 s) and a squad is five boats; it was three boats with half a bar and 8 a second,
// 30 s with the ultimate 14 s in, and no boat of ours sank
const LIMIT = 90, COST = 50, EN_MAX = 100, EN_RATE = 12, SQUAD = 5, FILL = 30;
const ID0 = 1e6;
const [ZX, ZZ] = ZONES[3].at;           // raft camp (125, -20)
const BOSS_AT = [ZX - 28, ZZ];           // flagship guards the camp's west side
const DEPLOY_X = 58, LANE = [ZZ - 13, ZZ + 13]; // squads enter east of the repair dock
// R-300 round 8 fifth review (zoom g40): the fight camera looks down 52 degrees along +x, so a flier shows h / tan 52 further
// along x than its spot on the water (h = model fly x drawn size: tandem 6.5 x 0.85, drone 4.5 x 2.3, our helicopter 7 x 0.82).
// Guard slots are where a guard is seen: a drone drawn 8 up the screen sat on a tandem, tandems lay over the raiders of the
// next arc. Our helicopters hold as a back row (HELI_BACK behind the boats, reach + 12 like any boat firing over the front
// row) so, lifted 4.5 up the screen, they show as their own row instead of over our boats
const SEEN = { raider: 0, gunship: 6.5 * 0.85 / Math.tan(52 * Math.PI / 180), drone: 4.5 * 2.3 / Math.tan(52 * Math.PI / 180) };
const HELI_BACK = 13;
// round 6 (playthrough measured against Top Force): at 1.55 a gunboat was 14 to 15% of the screen width in this fight, Top
// Force's soldiers 7.3% (13:37 to 14:09 real), so the fight camera pulls back to 0.85
const CAM = [ZX - 46, ZZ, 0.85];
// round 6 (R-300 item 4): Top Force's final fight opens with about 23 reds round the mech (real 13:49), 15 five seconds
// later, then 1 until Victory at 14:09; ours had the flagship and about 4 raiders. 14 guards gave 15 to 17 on screen, so 20. A line of guards holds in front of the flagship (they shoot squads
// that come in reach but do not sail out), and the stream of raiders runs as before
const GUARDS = 20;
// round 6: Top Force's fight runs 22 s from the first squad to Victory (video 13:08 to 13:30; 12:59 to 13:08 is VS and
// the captains' talk, not the fight). Reds 23 at 2 s, 15 at 7 s, 1 from 12 s (the ultimate clears the guards,
// then only the mech is left). Guards take 0.9 of a squad boat's hull, the camp's stream (one every 4 s) stops at the
// first ultimate, and the flagship holds BOSS_HP x one three-boat volley a second
// (guards that sank in one or two hits, 1 to 2 s before their first shot, with a reach of 12 against our 15, fired 11 shots
// in the whole fight with the flagship and sank one boat of ours; Top Force's greens drop from 11 to 5 to 2 before the
// next squads land. Guards now take a few hits and open fire within a second; with our reach (15) only the two or three
// in front of the squads fired (25 shots, 3 boats lost), so the arcs' guards reach 22 and the flanks join in; at 0.15 a
// shot that sank 5 boats by 12 s against Top Force's 9, so a guard shot takes a quarter of a hull and the flagship's 0.4)
const BOSS_HP = 56, GUARD_HP = 0.9, GUARD_DMG = 0.25, GUARD_RANGE = 22, BOSS_DMG = 0.4, STREAM = 4;
const BOSS_BIG = 1.6; // P2L-01: the mission-40 flagship is clearly bigger than mission 20's (1.15), same as the one that sailed in
// R-300 round 7 second look (giant pair): Ironjaw's giant robot drawn at 1.6 stood about 13% of the screen wide and 1.4x the
// mission 39 robot, half under its taunt and lost in its raider ring; Top Force 13:12 (refs r7 robot_a) shows it about 20%
// wide, towering over its reds. Drawn 2.4x; its reach (rad) and the stream's offsets keep BOSS_BIG, so the fight plays the same
// R-300 round 7 fifth look (pair giant): at 2.4x it stood as tall as the mission 39 robot (then 3.8x), about 4 gunboats;
// Top Force's giant is about twice its mission 39 robot against soldiers. The robot now draws 2.5x and the giant 2.8x
// (about 4.6 gunboats tall, 1.9x the robot); main.js FLAG_DRAW matches so it does not grow when the fight starts
// Round 8 (owner 2026-11-13 "i dont need robots and tanks ... can be helicoter, motherships, drones"): the giant robot is
// Ironjaw's flying mothership (mother8.js skyMotherSpec), drawn MOTHER_DRAW; MOTHER_H is the 1x model's height from the
// water to its flag top, hover included (the taunt sits over it); main.js FLAG_DRAW matches
// In the fight it hovers at MOTHER_FLY, not its model's 10: 28 west of the camp, at 10 x 1.3 its skull bridge and flag sat over
// the camp's hut and crates on screen and the skull did not read (recording recD, round 8)
const MOTHER_DRAW = 1.3, MOTHER_FLY = 4, MOTHER_H = MOTHER_FLY + 15.2; // mother8: 15.2 from its underside to the flag top

export function runFight(S, view) {
  return new Promise(resolve => {
    const lv = S.sheds.gunboat.lv;
    const sq = { dmg: G.shipDmg(S, 'gunboat', lv) * 1.2, hp: G.shipHp(S, 'gunboat', lv) * 1.5, rate: 1.0, range: 15, speed: 8 };
    const squadDps = sq.dmg * 3 / sq.rate;
    const boss = { id: ID0, kind: 'boss', big: MOTHER_DRAW, rad: 22 * BOSS_BIG * 0.42, x: BOSS_AT[0], z: BOSS_AT[1], vx: 0, vz: 1, len: 22, hp: squadDps * BOSS_HP, max: squadDps * BOSS_HP, dmg: sq.hp * BOSS_DMG, rate: 1.3, cd: 1, range: 32, hitT: 0, moving: false };
    const F = { t: LIMIT, en: EN_MAX, spawnT: 2, side: 0, uid: ID0 + 1, done: false, ult: null, ev: [] };
    // mission: 40 so the view draws Ironjaw's flying mothership (pirate tier 3); without it the view kept the last map tier and the
    // round 7 recording showed the mission 20 four-legged mech in the final fight
    const FS = { ships: [], enemies: [boss], shots: [], mission: 40 };
    // the guards stand in arcs on our side of the flagship about 10 apart (rows 7 apart drew one raft for the first seconds;
    // Top Force 13:49: the reds fan out round the mech), radius 20 then 30, a third arc only for slots that fall on land
    const slots = [];
    for (const [r, n, span] of [[20, 7, 180], [30, 13, 220], [40, 10, 160]]) for (let k = 0; k < n; k++) { const a = Math.PI + (k / (n - 1) - 0.5) * span * Math.PI / 180; slots.push([BOSS_AT[0] + Math.cos(a) * r, ZZ + Math.sin(a) * r]); }
    for (let i = 0, si = 0; i < GUARDS && si < slots.length; si++) {
      // R-300 round 8 review: the mission 40 guards and our squads were all boats; one guard in three is a pirate helicopter
      // and one in five a drone (look only: same hit points, damage and reach)
      const gk = i % 3 === 1 ? 'gunship' : i % 5 === 3 ? 'drone' : 'raider';
      const x = slots[si][0] + (Math.random() - 0.5) * 2 - SEEN[gk], z = slots[si][1] + (Math.random() - 0.5) * 2;
      if (!isWater(x, z, S.stage, 1)) continue;
      // R-300 round 8 third review: a guard helicopter facing our squads sat nose-down the screen, fuselage end-on, and read
      // as a dark spiky boat; it hovers turned 40 degrees off that, so its side, tail and rotor show (look only)
      FS.enemies.push({ id: F.uid++, kind: gk, guard: true, slot: si, x, z, tz: z, vx: -1, vz: gk === 'gunship' ? (z > ZZ ? 0.85 : -0.85) : 0, len: 7, hp: sq.hp * GUARD_HP, max: sq.hp * GUARD_HP, dmg: sq.hp * GUARD_DMG, rate: 1.4, cd: 0.2 + Math.random() * 0.6, range: GUARD_RANGE, hitT: 0, speed: 4.5, moving: false });
      i++;
    }
    // round 6 (R-300 4): full recordings I to L tapped the ultimate 10.1 to 11.1 s after the first squad and it lands 1.4 s
    // later, so 13 reds were still up 12 s in (Top Force: lands about 8 s in, video 13:16, 1 red from 12 s). 0.45 moved a
    // mission-40 jump run only 0.3 s (hits land late while the squads sail in), so Skye starts at 0.55 (was 0.35); full
    // recording N tapped it 8.1 s after the first squad (lands about 9.5 s, about 1.5 s after Top Force's)
    const heroes = [{ who: 'Skye', img: 'img/por-skye.png', fill: 0.55, dmg: 0, taken: 0 }, { who: 'Bram', img: 'img/por-bram.png', fill: 0, dmg: 0, taken: 0 }];
    $('f-us').textContent = fmt(G.power(S)); $('f-them').textContent = fmt(G.power(S) * 1.15);
    $('f-heroes').innerHTML = heroes.map((h, i) => `<div class="fhero hidden" data-i="${i}"><img src="${h.img}" alt=""><span class="ub"><i></i></span></div>`).join('');
    const heroEls = [...$('f-heroes').children];
    // r5 juice: hitstop and slow-mo for the big moments only (ST run.js:222-232); boss bar with a yellow trail; a hull
    // breach every quarter of the boss's hull. None of it in QA.
    const J = { stop: 0, lastStop: -9, slowK: 1, slowT: 0, trail: 1, hitAt: 0, quarter: 4, T: 0 };
    // L35: the fight teaches itself: finger and a line on the squad card until the first squad goes out, the card
    // pulses while energy is full, then the finger moves to the first captain whose ultimate is ready until one is used.
    // L41 keeps what happened (squads sent, seconds at full energy, ultimates used or left waiting) to pick the defeat tip.
    const TUT = { key: '', deploys: 0, ults: 0, capT: 0, fullT: 0 };
    const hitstop = s => { if (QA()) return; if (s < 0.08 && J.T - J.lastStop < 0.8) return; J.stop = Math.max(J.stop, s); J.lastStop = J.T; };
    const slow = (k, s) => { if (QA()) return; J.slowK = k; J.slowT = s; };
    const bossEl = $('f-boss'), bbHp = bossEl.querySelector('.hp'), bbTr = bossEl.querySelector('.tr');
    bossEl.classList.remove('bhit'); bbHp.style.width = bbTr.style.width = '100%';
    show('fight', true);
    view.lock = true; view.setYaw(0); view.focus(CAM[0], CAM[1], CAM[2]);
    // round 6 (sixth R-300 review, fight 2/7/12 s): a guard slot just past the left edge of this shot kept one raider cut by the
    // edge for the whole fight, out of the squads' reach; a guard outside the shot moves to a free water slot inside it
    {
      const [w, h] = view.size, inShot = (x, z) => { const p = view.w2sGoal(x, z, 1); return p[0] > w * 0.06 && p[0] < w * 0.94 && p[1] > h * 0.1 && p[1] < h * 0.8; };
      const used = new Set(FS.enemies.filter(e => e.guard).map(e => e.slot));
      for (const e of FS.enemies) {
        if (!e.guard || inShot(e.x, e.z)) continue;
        const k = slots.findIndex((q, j) => !used.has(j) && isWater(q[0], q[1], S.stage, 1) && inShot(q[0], q[1]));
        if (k < 0) continue;
        used.add(k); e.slot = k; e.x = slots[k][0] - SEEN[e.kind]; e.z = e.tz = slots[k][1];
      }
      // R-300 round 8 fifth review (zoom g40): slots about 10 apart still let a 10-long tandem touch the drone or raider next to
      // it (recM40 at the arc ends); guards, which never move, are pushed apart once where they are seen, by half their drawn
      // lengths (raider 8 x 0.7, tandem 12 x 0.85, drone 3 x 2.3 with its guards) plus 1.5
      // sixth review (zoom g40): a slanted tandem's two rotor discs (4.0 x 0.85 each end) still lay over the raiders beside it,
      // so a tandem keeps its rotor tips clear (half 6.2)
      const half = { raider: 2.8, gunship: 6.2, drone: 3.5 }, gs = FS.enemies.filter(e => e.guard);
      for (let it = 0; it < 40; it++) for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j], dx = b.x + SEEN[b.kind] - a.x - SEEN[a.kind], dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
        const md = half[a.kind] + half[b.kind] + 1.5;
        if (d >= md) continue;
        const p = (md - d) / 2 / d;
        if (isWater(a.x - dx * p, a.z - dz * p, S.stage, 1)) { a.x -= dx * p; a.z = a.tz = a.z - dz * p; }
        if (isWater(b.x + dx * p, b.z + dz * p, S.stage, 1)) { b.x += dx * p; b.z = b.tz = b.z + dz * p; }
      }
    }
    // P2L-02 (Top Force 12:58): VS between the two captains and powers for 1.3 s; energy, raiders and the clock wait
    if (!QA()) {
      F.vs = 1.3; $('vs-us').textContent = $('f-us').textContent; $('vs-them').textContent = $('f-them').textContent;
      const v = $('f-vs'); v.classList.remove('out'); show(v, false); void v.offsetWidth; show(v, true);
      sfx.slam(); buzz([30, 30, 30]); setTimeout(() => sfx.horn(), 250);
      setTimeout(() => v.classList.add('out'), 1050); setTimeout(() => { show(v, false); v.classList.remove('out'); }, 1350);
    }

    function deploy() {
      if (F.en < COST || F.done) return;
      F.en -= COST; TUT.deploys++;
      const cz = LANE[0] + Math.random() * (LANE[1] - LANE[0]);
      const squad = [], h = heroes.findIndex(hh => !hh.squad || !hh.squad.some(u => u.hp > 0));
      for (let k = 0; k < SQUAD; k++) {
        // R-300 round 8 review: the two back-row boats of each squad are helicopters (same hit points and damage); second
        // review: 5.5 across and 3 back left helicopters rotor to rotor and boats touching (all cluttered), so 8 across, 5 back;
        // fifth review: 5 back, lifted by their height, drew the helicopters over the boats, so HELI_BACK
        const u = { id: F.uid++, key: k % 2 ? 'destroyer' : 'gunboat', x: DEPLOY_X - (k % 2) * HELI_BACK, z: cz + (k - (SQUAD - 1) / 2) * 8, vx: 1, vz: 0, len: 8, hp: sq.hp, max: sq.hp, cd: 0.4 + k * 0.2, hitT: 0, moving: true, h: h >= 0 ? h : 0 };
        FS.ships.push(u); squad.push(u);
        view.splash(u.x, u.z, 0.9);
      }
      if (h >= 0) heroes[h].squad = squad;
    }
    $('f-card').onclick = deploy;
    $('f-back').onclick = () => finish(false, true);
    heroEls.forEach((el, i) => el.onclick = () => ult(i));

    function ult(i) {
      const h = heroes[i]; if (h.fill < 1 || F.done || F.ult) return;
      h.fill = 0; F.ult = 1.4; TUT.ults++;
      show('ult', true);
      const card = $('ult-card'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      setTimeout(() => {
        show('ult', false); F.ult = null;
        const big = squadDps * 12;
        for (const e of FS.enemies) { const d = Math.min(e.hp, e.kind === 'boss' ? big : e.max); e.hp -= d; h.dmg += d; e.hitT = 0.3; view.boom(e.x, 1.5, e.z, e.kind === 'boss' ? 1.8 : 1, 4); F.ev.push({ e: 'dmg', id: e.id, side: 'us', n: d, crit: true }); }
        view.shakeIt(0.5, 0.6);
        // the ultimate lands: a short stop, a soft screen flash and a low slam (owner wants a punch, not a cutscene)
        hitstop(0.1); flashScreen(0.3, 220); sfx.slam(); buzz([20, 20, 40]); if (view.punch) view.punch(1.08);
      }, 1300);
    }

    const near = (list, u, max) => { let b = null, bd = max; for (const o of list) { if (o.hp <= 0) continue; const d = Math.hypot(o.x - u.x, o.z - u.z) - (o.rad || 0); if (d < bd) { bd = d; b = o; } } return b; }; // to the hull's edge, so the big flagship is not reached through
    function shoot(from, to, dmg, side, kind) {
      FS.shots.push({ kind, x: from.x, z: from.z, tx: to.x, tz: to.z, target: to.id, side, dmg, speed: kind === 'shellBig' ? 46 : 60, h: from.h });
      if (side === 'them') F.fired = (F.fired || 0) + 1; // the recorder's count of red shots
      F.ev.push({ e: 'fire', kind, x: from.x, z: from.z, tx: to.x, tz: to.z, side, id: from.id });
    }
    const face = (u, x, z) => { const d = Math.hypot(x - u.x, z - u.z) || 1; u.vx += ((x - u.x) / d - u.vx) * 0.1; u.vz += ((z - u.z) / d - u.vz) * 0.1; };

    function step(dt) {
      if (F.done || F.ult) return;
      if (F.vs > 0) { F.vs -= dt; return; }
      F.t = Math.max(0, F.t - dt); F.en = Math.min(EN_MAX, F.en + EN_RATE * dt);
      if (F.en >= EN_MAX) TUT.capT += dt;
      if (heroes.some(h => h.fill >= 1 && h.squad && h.squad.some(u => u.hp > 0))) TUT.fullT += dt;
      // raiders stream out of the camp
      F.spawnT -= dt;
      if (F.spawnT <= 0 && !TUT.ults) {
        F.spawnT = STREAM;
        for (let k = F.side = 1 - F.side, k1 = k + 1; k < k1; k++) {
          // one down each side of the flagship, never through its hull
          // look review 4 (m40 sink, ultimate): broadside, the hull runs along z, so escorts that started 9-15 off its middle
          // came out against the hull; they start off its bow and stern, about a boat length clear, and run in to the same
          // spot as before (tz), so they still meet the squads and the fight's pace stays the same
          // look review 5 (m40 fight): run on a slant from there, they passed over the bow and stern tips in a column like oars;
          // they start a boat length past each end and sail straight down until they are in front of the hull, then slant in
          const e = { id: F.uid++, kind: k ? 'gunship' : 'raider', tz: ZZ + (k ? 1 : -1) * (9 + Math.random() * 6), x: ZX - 8 + Math.random() * 4, z: ZZ + (k ? 1 : -1) * (boss.len * BOSS_BIG / 2 + 8 + Math.random() * 3), vx: -1, vz: 0, len: 7, hp: sq.hp * 0.5, max: sq.hp * 0.5, dmg: sq.hp * 0.05, rate: 1.2, cd: 1, range: 12, hitT: 0, speed: 4.5, moving: true };
          FS.enemies.push(e); view.splash(e.x, e.z, 0.7);
          // round 8: every other beat the mothership also launches a drone off its deck, down the same side
          if (k) { const d = { id: F.uid++, kind: 'drone', tz: ZZ + (Math.random() < 0.5 ? 1 : -1) * (6 + Math.random() * 8), x: boss.x + 2, z: boss.z + (Math.random() - 0.5) * 4, vx: -1, vz: 0, len: 3.5, hp: sq.hp * 0.25, max: sq.hp * 0.25, dmg: sq.hp * 0.03, rate: 0.8, cd: 1, range: 12, hitT: 0, speed: 8, moving: true }; FS.enemies.push(d); }
        }
      }
      // look review 4 (m40 ultimate, sink): squads that stopped on the same ring sat half on top of each other like one raft;
      // boats ease apart sideways (Top Force units stand apart)
      // look review 5 (bossdown, m40 sink): with 11-12 boats a round 6.5 gap (under a boat's length of 8) and a 6-a-second push
      // (under the 8-a-second sail) let back bows ride over front sterns into one mat; the gap is now 10 along the heading and
      // 6 across it, and the push (up to 16 a second) beats the sail
      // look review 6 (m40 fight, sink): boats are drawn 1.2x (9.6 long), so 10 still left back bows tucked under front sterns
      // while sailing; the gap along the heading is now 12 and a boat holds as a second row 13 behind a stopped one
      const live = FS.ships.filter(u => u.hp > 0);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j], dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 0.01;
        if (d >= 12) continue;
        let hx = a.vx + b.vx, hz = a.vz + b.vz, hl = Math.hypot(hx, hz);
        if (hl < 0.2) { hx = 1; hz = 0; hl = 1; }
        hx /= hl; hz /= hl;
        // R-300 round 8 sixth review (zoom g40): helicopters 9 across had rotor tip on rotor tip (disc 4.8 x 0.82 each side), so
        // our back row read as one blue clump; two helicopters keep 12 across
        const across = a.key === 'destroyer' && b.key === 'destroyer' ? 12 : 9;
        const q = Math.hypot((dx * hx + dz * hz) / 12, (dz * hx - dx * hz) / across); // R-300 round 8 second review: 6 across left the squad one mat
        if (q < 1) { const m = Math.min(d * (1 / Math.max(q, 0.01) - 1) / 2, 16 * dt); a.x += dx / d * m; a.z += dz / d * m; b.x -= dx / d * m; b.z -= dz / d * m; }
      }
      for (const u of FS.ships) {
        u.hitT = Math.max(0, u.hitT - dt);
        const t = near(FS.enemies, u, sq.range + (u.key === 'destroyer' ? 12 : 0));
        if (t) { u.moving = false; face(u, t.x, t.z); u.cd -= dt; if (u.cd <= 0) { u.cd = sq.rate; shoot(u, t, sq.dmg, 'us', 'shell'); } }
        else {
          const g = near(FS.enemies, u, 400);
          if (g) {
            const dx = g.x - u.x, dz = g.z - u.z, d = Math.hypot(dx, dz) || 1, hx = dx / d, hz = dz / d;
            // look review 5: a stopped boat of ours just ahead blocks the way; this one holds as a second row and fires over it
            // (reach 12 more than the front row's, so the fleet's firepower is the same), or steers round it if nothing is in reach
            const w = live.find(o => { if (o === u || o.moving) return false; const al = (o.x - u.x) * hx + (o.z - u.z) * hz, la = (o.z - u.z) * hx - (o.x - u.x) * hz; return al > 0 && al < 13 && Math.abs(la) < 6; });
            const t2 = w && near(FS.enemies, u, sq.range + 12);
            if (t2) { u.moving = false; face(u, t2.x, t2.z); u.cd -= dt; if (u.cd <= 0) { u.cd = sq.rate; shoot(u, t2, sq.dmg, 'us', 'shell'); } }
            else {
              let mx = hx, mz = hz;
              if (w) { const sd = ((w.z - u.z) * hx - (w.x - u.x) * hz) > 0 ? -1 : 1; mx = hx * 0.35 - hz * sd; mz = hz * 0.35 + hx * sd; const ml = Math.hypot(mx, mz); mx /= ml; mz /= ml; }
              u.x += mx * sq.speed * dt; u.z += mz * sq.speed * dt; face(u, g.x, g.z); u.moving = true;
            }
          }
        }
      }
      for (const e of FS.enemies) {
        e.hitT = Math.max(0, e.hitT - dt);
        const t = near(FS.ships, e, e.range);
        // look review 3 (vs, m40 ultimate): turned to the squads, the flagship's stern lay over the camp's decks; it stays broadside
        // (distance and hit circle unchanged, so the fight's balance is too)
        if (t) { e.moving = false; if (e.kind !== 'boss') face(e, t.x, t.z); e.cd -= dt; if (e.cd <= 0) { e.cd = e.rate; shoot(e, t, e.dmg, 'them', e.kind === 'boss' ? 'shellBig' : 'shellRed'); } }
        else if ((e.kind === 'raider' || e.kind === 'drone' || e.kind === 'gunship') && !e.guard && (e.x > DEPLOY_X + 8 || (e.tz != null && Math.abs(e.z - e.tz) > 0.3))) {
          const px = Math.min(e.x, DEPLOY_X + 8), pz = e.x < BOSS_AT[0] - 8 ? (e.tz ?? e.z) : e.z, dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, e.speed * dt);
          e.x += dx / d * st; e.z += dz / d * st; e.moving = true; face(e, e.x + dx / d * 5, e.z + dz / d * 5);
        }
        else e.moving = false;
      }
      const keep = [];
      for (const sh of FS.shots) {
        const list = sh.side === 'us' ? FS.enemies : FS.ships, to = list.find(o => o.id === sh.target);
        if (to) { sh.tx = to.x; sh.tz = to.z; }
        const dx = sh.tx - sh.x, dz = sh.tz - sh.z, d = Math.hypot(dx, dz), st = sh.speed * dt;
        if (d <= st) {
          if (to && to.hp > 0) {
            to.hp -= sh.dmg; to.hitT = 0.12; F.ev.push({ e: 'dmg', id: to.id, side: sh.side, n: sh.dmg });
            if (sh.side === 'us') { for (const h of heroes) if (h.squad) h.fill = Math.min(1, h.fill + sh.dmg / (squadDps * FILL)); if (heroes[sh.h]) heroes[sh.h].dmg += sh.dmg; }
            else if (heroes[to.h]) heroes[to.h].taken += sh.dmg; // Victory's DMG Taken tab
          }
          F.ev.push({ e: 'boom', kind: sh.kind, x: sh.tx, z: sh.tz, side: sh.side });
        } else { sh.x += dx / d * st; sh.z += dz / d * st; keep.push(sh); }
      }
      FS.shots = keep;
      FS.enemies = FS.enemies.filter(e => { if (e.hp > 0) return true; F.ev.push({ e: 'kill', x: e.x, z: e.z, kind: e.kind, id: e.id, nocoin: true }); return false; }); // no gold in the manual fight: Victory pays out
      FS.ships = FS.ships.filter(u => { if (u.hp > 0) return true; F.lost = (F.lost || 0) + 1; F.ev.push({ e: 'sunk', x: u.x, z: u.z, key: u.key, id: u.id }); return false; });
      if (boss.hp <= 0) finish(true);
      else if (F.t <= 0) finish(false);
    }

    function hud() {
      heroes.forEach((h, i) => {
        const el = heroEls[i], alive = h.squad && h.squad.filter(u => u.hp > 0);
        if (!alive || !alive.length) { el.classList.add('hidden'); return; }
        const u = alive[0], [x, y] = view.w2s(u.x, u.z, 7); el.classList.remove('hidden');
        el.style.left = x + 'px'; el.style.top = y + 'px';
        el.querySelector('.ub i').style.width = (h.fill * 100) + '%';
        el.classList.toggle('full', h.fill >= 1);
      });
      $('f-en').textContent = Math.floor(F.en);
      $('f-card').classList.toggle('off', F.en < COST);
      teach();
      const tl = Math.ceil(F.t); $('f-timer').textContent = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    }

    function teach() {
      if (QA()) return;
      $('f-card').classList.toggle('full', !F.done && F.en >= EN_MAX);
      let key = '', tgt = null;
      if (!F.done && !F.ult && !(F.vs > 0)) {
        if (!TUT.deploys) { key = 'card'; tgt = { el: 'f-card', fx: 0.5, fy: 0.4 }; }
        else if (!TUT.ults) { const i = heroes.findIndex((h, k) => h.fill >= 1 && !heroEls[k].classList.contains('hidden')); if (i >= 0) { key = 'hero' + i; tgt = { el: heroEls[i], fx: 0.5, fy: 0.45 }; } }
      }
      if (key !== TUT.key) { TUT.key = key; finger(tgt); show('f-tip', key === 'card'); }
      fingerTick();
    }
    // boss bar: red follows the hull at once, the yellow trail drains after it; the bar jolts on a hit (140 ms apart);
    // every lost quarter: HULL BREACH!, debris, a ring, a shake, a short stop and a buzz
    // boss taunts (Top Force 13:10 and 13:18): a white bubble over the flagship (above where HULL BREACH! rises), 2 s in and when its hull first drops below half
    const taunts = [{ at: 2, text: "Give up. You can't beat us!" }, { half: true, text: 'Not bad. Time to get serious!' }];
    let tauntEl = null, tauntT = 0;
    function tauntTick(dt) {
      if (QA()) return;
      // look review 3 (m40 078): the half taunt came the same frame as the 50% HULL BREACH! and sat on it; it waits 1.2 s
      for (const t of taunts) if (!t.done && boss.hp > 0 && (t.half ? boss.hp < boss.max * 0.5 && J.quarter <= 2 && J.T - (J.breachAt ?? -9) > 1.2 : J.T >= t.at)) {
        t.done = true; if (tauntEl) tauntEl.remove();
        tauntEl = document.createElement('div'); tauntEl.className = 'bub bark them'; tauntEl.innerHTML = '<i class="face">😠</i><span></span>'; tauntEl.lastChild.textContent = t.text; $('fight').appendChild(tauntEl); tauntT = 2.4;
      }
      if (!tauntEl) return;
      tauntT -= dt;
      if (tauntT <= 0 || boss.hp <= 0) { tauntEl.remove(); tauntEl = null; return; }
      const [x, y] = view.w2s(boss.x, boss.z, MOTHER_H * MOTHER_DRAW + 2); tauntEl.style.left = x + 'px'; tauntEl.style.top = y + 'px';
    }
    function juice(dt) {
      tauntTick(dt);
      const f = Math.max(0, boss.hp / boss.max);
      bbHp.style.width = (f * 100).toFixed(2) + '%';
      J.trail = Math.max(f, f + (J.trail - f) * Math.exp(-dt * 2.5));
      bbTr.style.width = (J.trail * 100).toFixed(2) + '%';
      if (boss.hitT > (J.bossHit0 || 0) + 1e-4 && J.T - J.hitAt > 0.14) { J.hitAt = J.T; bump(bossEl, 'bhit'); }
      J.bossHit0 = boss.hitT;
      const q = Math.ceil(f * 4 - 1e-6);
      if (q < J.quarter && boss.hp > 0) {
        J.quarter = q; J.breachAt = J.T;
        view.boom(boss.x, 3, boss.z, 1.4, 9); view.ring(boss.x, boss.z, 14, 0.7);
        // look review 9 (074): the hull numbers start at 3.5 x big now, so HULL BREACH! at 5 sat on them; it rises from above the cabin
        view.floatAt(boss.x, 10, boss.z, 'HULL BREACH!', { size: 26, col: '#ffd23f', stroke: '#3a0805', sw: 4, life: 1.1, p0: 0.5, p1: 1.25, popK: 0.12, fade: 0.7, still: true, rise: 20, italic: true });
        view.addShake(0.35, 0.6); hitstop(0.07); buzz(30); sfx.boom(2);
      }
    }
    let last = performance.now(), T = 0, raf = 0;
    function loop(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; T += dt; J.T += dt;
      let sdt = dt;
      if (J.stop > 0) { J.stop = Math.max(0, J.stop - dt); sdt = 0; }
      else if (J.slowT > 0) { J.slowT = Math.max(0, J.slowT - dt); sdt = dt * J.slowK; }
      if (sdt > 0) for (let k = 0; k < 3; k++) step(sdt / 3);
      juice(dt);
      const ev = F.ev; F.ev = [];
      view.consume(ev, FS);
      view.frame(FS, sdt > 0 ? sdt : dt * 0.05, T, { camDt: dt });
      if (view.setFly) view.setFly(ID0, MOTHER_FLY);
      hud();
      if (!F.closed) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    if (window.__HF) window.__HF.fight = { F, FS, deploy, boss, heroes, finish: w => finish(w) };

    function finish(won, quit) {
      if (F.done) return; F.done = true; FS.still = !!won; // look review 9: no idle ripple rings under the fleet at BOSS DOWN!
      TUT.key = ''; finger(null); show('f-tip', false); $('f-card').classList.remove('full');
      if (won) {
        // boss down: slow-mo 0.25 for 1.1 s, seven blasts 140 ms apart, full shake, BOSS DOWN!
        // P2L-03 (Top Force 13:18 to 13:31): the camera leaves the squads and closes in on the flagship as it breaks up
        slow(0.25, 1.1); view.addShake(1, 1); buzz([40, 40, 80]); sfx.boom(3);
        if (view.clearFloats) view.clearFloats(); // the last HULL BREACH! and damage numbers go, BOSS DOWN! stands alone
        // look review 4 (bossdown): at 2.0 with the hull at 0.6 the squads sank under the card tray, energy pill and back
        // button; Top Force 13:18 keeps its units above the tray, so the hull sits higher and the camera closes a little less
        // look review 7 (bossdown): at 1.85 the energy pill still sat on the last row's sterns; a little wider keeps them above it
        // seventh R-300 review (size): Top Force's boss goes down under its fight camera (video 13:18 to 13:31, no close-up), and
        // at 1.7 a gunboat was 15% of the screen against its 7.5%; the fight zoom, the hull still high above the card tray
        view.focusAt(boss.x, boss.z, 0.95, 0.42);
        // look review 3 (bossdown): the blasts sat low inside the hull and only grey smoke showed; they burst above the deck
        // along the hull, and fire keeps burning on it while it goes down (Top Force 13:18 fireball)
        // look review 4: one big orange fireball mid-hull and a black smoke column (Top Force 13:18); smaller blasts along the hull
        if (view.fireball) { view.fireball(boss.x, 6, boss.z, 2.6); setTimeout(() => { if (!F.closed) view.fireball(boss.x, 7, boss.z + (Math.random() - 0.5) * 8, 3); }, 840); }
        for (let i = 0; i < 7; i++) setTimeout(() => { if (F.closed) return; view.boom(boss.x + (Math.random() - 0.5) * 6, 5 + Math.random() * 3, boss.z + (Math.random() - 0.5) * 26, i === 6 ? 2.2 : 1.2, 8); sfx.boom(i === 6 ? 3 : 1.4); }, i * 140);
        for (let i = 0; i < 24; i++) setTimeout(() => { if (F.closed) return; view.fireAt(boss.x + (Math.random() - 0.5) * 5, 4 + Math.random() * 4, boss.z + (Math.random() - 0.5) * 24, 2.4); if (view.smokeColumn && i % 2 === 0) view.smokeColumn(boss.x, 8, boss.z + (Math.random() - 0.5) * 10, 2); }, 60 + i * 70);
        setTimeout(() => { callout('BOSS DOWN!<small>IRONJAW\'S MOTHERSHIP</small>', 'band', 1700, Math.round($('fight').clientHeight * 0.2)); sfx.fanfare(); }, 1100);
      } else if (!quit) { sfx.hurt(); buzz([60, 40, 120]); }
      const close = (retry = false) => {
        F.closed = true; cancelAnimationFrame(raf); if (tauntEl) { tauntEl.remove(); tauntEl = null; }
        if (view.clearFloats) { view.clearFloats(); view.frame(FS, 0, T, {}); } // one clean frame under the Victory page
        show('fight', false); show('f-lose', false); view.lock = false; view.setYaw(-45);
        if (window.__HF) window.__HF.fight = null;
        resolve({ won, quit, retry, dmg: heroes.map(h => ({ who: h.who, img: h.img, dmg: Math.round(h.dmg), taken: Math.round(h.taken) })) });
      };
      // L41: a lost fight (not a quit) holds on a Defeat card (never "Out of time") with one tip picked from what
      // happened, then Retry or Harbor
      if (!won && !quit && !QA()) {
        const tip = !TUT.deploys || TUT.capT > 8 ? ['img/ui-energy.png', 'Send a <em>Strike Squad</em> each time energy reaches 50. Energy left at 100 is wasted.']
          : !TUT.ults || TUT.fullT > 4 ? ['img/por-skye.png', 'When a captain glows, <em>tap them</em> for a big hit on every enemy.']
          : ['img/gunboat-a.png', 'Upgrade the <em>Gunboat</em> shed at the harbor for tougher squads, then try again.'];
        $('fl-img').src = tip[0]; $('fl-tip').innerHTML = tip[1];
        if (F.t <= 0) { const st = document.createElement('div'); st.id = 'f-stamp'; st.textContent = 'TIME UP!'; $('fight').appendChild(st); setTimeout(() => st.remove(), 1500); sfx.warn(); }
        setTimeout(() => {
          F.closed = true; cancelAnimationFrame(raf); show('f-lose', true);
          $('fl-retry').onclick = () => { sfx.click(); close(true); };
          $('fl-back').onclick = () => { sfx.click(); close(false); };
        }, F.t <= 0 ? 1500 : 700);
        return;
      }
      setTimeout(() => close(), won ? 3300 : 300);
    }
  });
}
