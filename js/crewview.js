// Round 7: the armory on the quay, drawn (sailors queueing, officers carrying, the arming table, the counters and their stock).
// Owner 2026-11-13: "the ships are not interesting enough, from the reference they have something like generating guns for
// troops to pick up". Top Force 0:22 to 0:44 (refs r7 pick_a, pick_b): a number over the counter (the weapon's power), a
// white bubble over the table with the weapon count, a yellow number over whoever carries a weapon.
// The rules live in sim.js (armoryTick); this file only draws S.crew, S.officers and S.arm.
import * as THREE from 'three';
import { crewModel, animateCrew, itemModel, tableModel, counterModel, queuePadModel } from './units7.js';
import { ARMORY, BASE } from './world.js';
import { buildTime, shipDmg } from './sim.js';

export const ITEM = { gunboat: 'gun', torpedo: 'torpedo', destroyer: 'rocket' }; // R-300 round 8: the gun lost its crate (it read as a tank)
const KEYS = ['gunboat', 'torpedo', 'destroyer'];
const SC = 1.6; // people on the quay, the same size as Bram and the castaway (1.7) give or take
// R-300 round 7 third look (crops-armory): the counter read as a small dark-grey lump in its shed's shadow, no white top showing;
// Top Force's white bench is about a soldier and a half long with a black gun on it (refs r7 pick_a). The counter now runs 1.9x
// along its length (1.15x deep, so the officers' spots in front of it still clear it), stays lit in the shed's shadow, and its
// weapons draw 1.7x laid along it (crates two side by side and one on top, torpedoes and shells two side by side and one on top)
const CNT = [1.9, 1, 1.15], STOCK = 1.7;
const SPOT = { gun: [[0, 0, -0.5], [0, 0, 0.5], [0, 0.5, 0]], torpedo: [[0, 0, -0.5], [0, 0, 0.5], [0, 0.85, 0]], rocket: [[0, 0, -0.62], [0, 0, 0.62], [0, 1.05, 0]] };
const short = n => n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.max(1, Math.round(n)));

export function crewLayer(scene) {
  const Y0 = BASE.y;
  const people = new Map();
  const counters = {};
  let table = null, pad = null, stock = null, stockSig = '';
  const swimmers = new Map();
  function furniture(S) {
    if (!table) {
      table = tableModel(); table.position.set(ARMORY.table[0], Y0, ARMORY.table[1]); scene.add(table);
      pad = queuePadModel(ARMORY.pad[2], ARMORY.pad[3]); pad.position.set(ARMORY.pad[0], Y0, ARMORY.pad[1]); scene.add(pad);
      stock = new THREE.Group(); scene.add(stock);
    }
    for (const k of KEYS) {
      const built = !!(S.sheds && S.sheds[k] && S.sheds[k].built);
      if (built && !counters[k]) { const c = counterModel(); c.scale.set(...CNT); c.receiveShadow = false; c.position.set(ARMORY.counter[k][0], Y0, ARMORY.counter[k][1]); scene.add(c); counters[k] = c; }
      else if (!built && counters[k]) { scene.remove(counters[k]); delete counters[k]; }
    }
  }
  // weapons waiting on the counters and on the table (rebuilt only when the counts change)
  function stockTick(S) {
    const A = S.arm, sig = A ? KEYS.map(k => (counters[k] ? A.counter[k] : 0)).join(',') + '|' + A.table.map(t => t.key[0]).join('') : '';
    if (sig === stockSig) return;
    stockSig = sig; stock.clear();
    if (!A) return;
    // (the weapons on the counters: see CNT and SPOT at the top)
    for (const k of KEYS) {
      const c = counters[k]; if (!c) continue;
      const it = ITEM[k], sp = SPOT[it];
      for (let i = 0; i < Math.min(3, A.counter[k]); i++) { const m = itemModel(it); m.scale.setScalar(STOCK); m.receiveShadow = false; m.position.set(c.position.x + sp[i][0], Y0 + c.userData.top + sp[i][1], c.position.z + sp[i][2]); stock.add(m); }
    }
    const top = table.userData.top;
    A.table.slice(0, 5).forEach((t, i) => { const m = itemModel(ITEM[t.key]); m.rotation.y = Math.PI / 2; m.position.set(ARMORY.table[0] - 2.6 + i * 1.3, Y0 + top, ARMORY.table[1]); stock.add(m); });
  }
  function person(id, kind) {
    let r = people.get(id);
    if (!r) { const obj = crewModel(kind); obj.scale.setScalar(SC); scene.add(obj); r = { obj, ud: obj.userData, item: null, mesh: null }; people.set(id, r); }
    return r;
  }
  function holdItem(r, key) {
    if (r.item === key) return;
    if (r.mesh) { r.ud.hold.remove(r.mesh); r.mesh = null; }
    r.item = key || null;
    if (key) { r.mesh = itemModel(ITEM[key]); r.ud.hold.add(r.mesh); }
  }
  function tick(S, dt, t) {
    if (!S.arm || !S.crew) { for (const [, r] of people) r.obj.visible = false; return; }
    furniture(S); stockTick(S);
    const seen = new Set();
    const draw = (u, kind) => {
      const r = person(u.id, kind); seen.add(u.id);
      r.obj.visible = !(u.hold > 0);
      r.obj.position.set(u.x, Y0, u.z);
      r.obj.rotation.y = -Math.atan2(u.hz || 0, u.hx || 0.0001);
      holdItem(r, u.item);
      animateCrew(r.ud, t + u.id * 0.37, !!u.moving, !!u.item);
    };
    for (const c of S.crew) draw(c, 'sailor');
    for (const o of S.officers) draw(o, 'officer');
    for (const [id, r] of people) if (!seen.has(id)) { scene.remove(r.obj); people.delete(id); }
    // a sunk boat's sailor swims back to the quay: a head and a little foam crossing the water
    const sw = new Set();
    for (const w of S.arm.swim) {
      const key = w.x0 + ',' + w.z0; sw.add(key);
      let r = swimmers.get(key);
      if (!r) { const obj = crewModel('sailor'); obj.scale.setScalar(SC); scene.add(obj); r = { obj, ud: obj.userData }; swimmers.set(key, r); }
      const q = 1 - w.t / w.t0, x = w.x0 + (w.at[0] - w.x0) * q, z = w.z0 + (w.at[1] - w.z0) * q;
      r.obj.position.set(x, -2.9 * SC / 1.6 + Math.sin(t * 6) * 0.12, z); // only the head and shoulders above the water
      r.obj.rotation.y = -Math.atan2(w.at[1] - w.z0, w.at[0] - w.x0);
      animateCrew(r.ud, t * 1.6, true, false);
    }
    for (const [k, r] of swimmers) if (!sw.has(k)) { scene.remove(r.obj); swimmers.delete(k); }
  }
  // 2D overlay: power over each counter (and its craft bar), the table's count bubble is a DOM tag in main.js,
  // a yellow power number over whoever carries a weapon
  let numBoxes = [];
  function overlay(S, octx, w2s, avoid) {
    if (!S.arm || !S.crew) { numBoxes = []; return; }
    octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.lineJoin = 'round';
    const num = (x, y, text, col, size) => { octx.font = `800 ${size}px "Barlow SC", sans-serif`; octx.lineWidth = 5; octx.strokeStyle = '#10202a'; octx.strokeText(text, x, y); octx.fillStyle = col; octx.fillText(text, x, y); };
    const drawn = numBoxes = []; drawn.wait = 0; // .wait: numbers with no free spot this frame (read by the recorder); where each counter's number (and craft bar) landed on the screen this frame (main.js barks keep off them)
    for (const k of KEYS) {
      const c = counters[k], s = S.sheds[k]; if (!c || !s) continue;
      let [x, y] = w2s(c.position.x, c.position.z, Y0 + c.userData.top + 3.8); // over the top crate of three (1.7x)
      const txt = short(shipDmg(S, k, Math.max(1, s.lv)));
      // R-300 round 7 (pairs tanks, mech, robot39): the tank counter's number sat half under the table bubble ("20", "33") and the torpedo counter's
      // on the Torpedo tag; a number (with its craft bar) that would touch a tag or the bubble steps to the nearest free side of it
      // a number off the screen has nothing to step around (recZ: the harbor's numbers below the screen while the camera is at sea
      // found no on-screen spot and counted as waiting for 40% of the run)
      const onScr = x > -30 && x < (octx.canvas.clientWidth || 390) + 30 && y > -20 && y < (octx.canvas.clientHeight || 844) + 20;
      if (avoid && avoid.length && onScr) {
        octx.font = '800 13px "Barlow SC", sans-serif';
        const hw = Math.max(octx.measureText(txt).width / 2, 16.5) + 2;
        // R-300 round 7 ninth look (recX 0:29 to 0:31): the tank counter's "435" stepped left of the Gunboat tag past the screen's
        // edge (gone for a second), then right onto the gunboat counter's "1850", white on white; a spot is free only on the screen,
        // off every tag and bubble, off the numbers already drawn this frame, and within 50 px (farther reads as the next
        // counter's number); with no free spot the number waits, as a carrier's does
        const SW = octx.canvas.clientWidth || 390, ov = (px, py) => d => px + hw > d[0] && px - hw < d[2] && py + 15 > d[1] && py - 9 < d[3];
        const hit = (px, py) => avoid.find(ov(px, py)) || drawn.find(ov(px, py));
        const b = hit(x, y);
        if (b) {
          const free = ([px, py]) => px - hw >= 2 && px + hw <= SW - 2 && Math.hypot(px - x, py - y) <= 50 && !hit(px, py);
          let opts = [[b[0] - hw - 1, y], [b[2] + hw + 1, y], [x, b[1] - 16], [x, b[3] + 10]].filter(free);
          // the four sides of one box can all be taken (recZ mission 39: "435" under the Gunboat tag with the table bubble over it
          // and "1850" beside it waited 43% of the frames); then any free spot on a 6 px grid within the 50 px
          if (!opts.length) for (let gx = -48; gx <= 48; gx += 6) for (let gy = -48; gy <= 48; gy += 6) { const p = [x + gx, y + gy]; if (free(p)) opts.push(p); }
          if (!opts.length) { drawn.wait++; continue; }
          opts.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y)); [x, y] = opts[0];
        }
      }
      num(x, y, txt, '#ffffff', 13);
      octx.font = '800 13px "Barlow SC", sans-serif';
      const cw = Math.max(octx.measureText(txt).width / 2 + 2.5, 18.5); drawn.push([x - cw, y - 9, x + cw, y + 15]); // text + its 5-wide outline
      // the craft bar while the shed is making the next one
      const bt = buildTime(S, k), busy = s.timer < bt - 1e-3; // the timer only runs while the shed is under its cap (sim.js armoryTick)
      if (busy) { const p = Math.max(0, Math.min(1, 1 - s.timer / bt)), w = 30; octx.fillStyle = 'rgba(10,16,28,0.7)'; octx.fillRect(x - w / 2 - 1.5, y + 9 - 1.5, w + 3, 7); octx.fillStyle = '#7dff6a'; octx.fillRect(x - w / 2, y + 9, w * p, 4); }
    }
    for (const u of S.officers.concat(S.crew)) {
      if (!u.item || u.hold > 0) continue;
      const cc = counters[u.item]; // still beside its counter: the counter's own number already says it (no stacked twins)
      if (cc && Math.hypot(u.x - cc.position.x, u.z - cc.position.z) < 3.2) continue;
      const [x, y] = w2s(u.x, u.z, Y0 + 4.6 * SC);
      // a carrier walking behind a shed tag showed only the ends of its number ("5 4" either side of the Gunboat tag, recD 3:50);
      // the number waits until the carrier comes out from under the tag
      if (avoid && avoid.some(b => x + 14 > b[0] && x - 14 < b[2] && y + 8 > b[1] && y - 8 < b[3])) continue;
      // R-300 round 7 sixth look (pair want 3:06): an officer walking off along the 7.6-long counter showed his yellow "234" on the
      // counter's white "234" (the 3.2 test above is from the old 4-long counter), and one carrying past the tank counter touched its
      // number ("20" over "252", crops quay 3:11); a carrier's number also waits until it clears any counter's number
      // (measured with the outline: a fixed 14 x 8 box still let the two outlines touch for a few frames, recJ 3:06 and 3:42)
      const ctxt = short(shipDmg(S, u.item, Math.max(1, S.sheds[u.item].lv)));
      octx.font = '800 14px "Barlow SC", sans-serif'; const hw = octx.measureText(ctxt).width / 2 + 3.5;
      if (drawn.some(b => x + hw > b[0] && x - hw < b[2] && y + 10.5 > b[1] && y - 10.5 < b[3])) continue;
      num(x, y, ctxt, '#ffd23f', 14);
    }
  }
  // where the table's count bubble sits (world x, z, y); R-300 round 7 fourth look: over the table's east part (2 east of its
  // middle), so it clears the tank counter on the screen
  const tableTop = () => [ARMORY.table[0] + 2, ARMORY.table[1], Y0 + (table ? table.userData.top : 1.6) + 3.2];
  return { tick, overlay, tableTop, numBoxes: () => numBoxes };
}
