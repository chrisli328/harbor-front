// Harbor Front prototype: main loop, HUD, upgrade card, HQ panel, world labels, tutorial script, save, QA hooks.
// Tutorial order copied from Top Force: Commander (video Emo7e_uDwbA): guide talk, first upgrade card, quest bar,
// build the second factory on a dashed plot, first star, base Lv.2 and its boost path, boss at mission 20, chest,
// captain talk, next zone with INCOMING, gift, base Lv.3, mission 40 manual FIGHT, harbor grows, mission 41.
import * as G from './sim.js';
import { SHED_AT, HQ_AT, REPAIR_AT, TAG_Y, ZONES, ZONE_CAM, BASE, WHARF, PIER, isWater, GATE } from './world.js';
import { loadImages, createView } from './view.js';
import { makeBot } from './bots.js';
import { runFight } from './fight.js';
import { $, show, fmt, QA, talk, isTalking, finger, fingerTick, toast, toastTick, reward } from './ui.js';
import * as J from './ui.js';
import { sfx, buzz, unlockAudio, setAudio, audioSettings, audioState, duckMusic } from './audio.js';

const SAVE_KEY = 'harborfront-v1', SPEED_KEY = 'harborfront-speed';
const params = new URLSearchParams(location.search);
const setVh = () => document.documentElement.style.setProperty('--app-vh', innerHeight + 'px');
setVh(); addEventListener('resize', setVh);

const QA_SPEED = 4;
let bot = null;
if (QA) {
  document.documentElement.classList.add('qa');
  G.TUNE.enemyHp = QA.difficulty || 1;
  G.setSeed(QA.seed || 1);
  bot = makeBot(QA.bot === 'careless' ? 'careless' : 'good');
}
const DRAW = !QA || QA.draw !== false;

// Where things stand on the map (world x, z, label height) for labels and taps.
const SPOT = {
  // R-300 round 7 fourth look (crops quay 3:44, pairs mech, robot39): the Torpedo tag hid its counter and the table's west end; it sits
  // 5 west and 5 south on the shed roof, about 28 px lower on the 390 px screen (front camera, zoom 0.9); at 4 it still touched
  // the counter under the missions 21 to 39 camera
  gunboat: [...SHED_AT.W1, TAG_Y.gunboat], torpedo: [SHED_AT.S1[0] - 5, SHED_AT.S1[1] + 5, TAG_Y.torpedo], destroyer: [...SHED_AT.W2, TAG_Y.destroyer], repair: [...REPAIR_AT, TAG_Y.repair], hq: [...HQ_AT, TAG_Y.hq],
};
const PIN = { gunboat: 'img/gunboat-a.png', torpedo: 'img/ic-torp.png', destroyer: 'img/heli-a.png', repair: 'img/ic-repair.png' };
const WEAPON_PIN = { gunboat: 'img/it-mg.png', torpedo: 'img/ic-torp.png', destroyer: 'img/it-rocket.png' }; // round 7: what the sailors pick up (the table bubble shows the weapon, refs r7 pick_a); R-300 round 8: the gun on its green crate (it-gun.png) read as a tank, so the gun is drawn alone and the helicopter's is a rocket (crewview ITEM)

let S, view, IM;
let busy = false, cardKey = null, hqOpen = false, frameNo = 0, speed = +(localStorage.getItem(SPEED_KEY) || 1);

// ---------- state, save, jump ----------
// story: a real new game starts on an empty plot (Top Force 005: build the first factory); QA and jumps keep the shed
function fresh(story) { const s = G.newState(); s.flags.tut = {}; if (story) s.sheds.gunboat = { built: false, lv: 0, timer: 0 }; return s; }
const KEEP = ['t', 'gold', 'gems', 'hq', 'mission', 'done', 'stage', 'sheds', 'boosts', 'quest', 'zone', 'zonePhase', 'chest', 'incoming', 'incomingTotal', 'phase', 'kills', 'flags'];
function save() { if (QA || !S) return; const o = {}; for (const k of KEEP) o[k] = S[k]; try { localStorage.setItem(SAVE_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!o) return null;
    const s = G.newState(); Object.assign(s, o); s.flags.tut = s.flags.tut || {};
    if (s.phase === 'fight') s.phase = 'fightReady';
    if (s.phase === 'between') s.phase = 'battle';
    s.m = null; if (s.phase === 'fightReady') G.startMission(s);
    // saved mid chest or mid harbor growth: finish that step
    if (s.phase === 'expand' || (s.phase === 'wreck' && (!s.chest || s.chest.taken))) { if (s.zone === 3) s.stage = 3; G.recoverZone(s); }
    const t = s.flags.tut; if (s.sheds.gunboat.built && !s.flags.gift0) s.flags.gift0 = 'taken';
    if (s.done >= GATE.last) t.outpost = 1;
    s.ev = []; return s;
  } catch (e) { return null; }
}
// Tutorial beats that already happened in a jumped or loaded state.
function markTut(s) {
  const t = s.flags.tut;
  t.intro = t.up1 = t.q1 = t.blast = 1; s.flags.gift0 = 'taken';
  if (s.done >= GATE.last) t.outpost = 1;
  if (s.done >= 6) t.tasks = 1;
  if (s.done >= 10) { t.help = 1; s.flags.sailor = 1; }
  if (s.done >= 20 && !(s.chest && s.chest.zone === 2 && !s.chest.taken)) t.victor = 1; // Bram still waits by an unopened chest
  if (s.zone >= 3 || s.done >= 21) t.inc = 1;
  if (s.done >= 40) t.f40 = t.after = 1;
  if (s.stage >= 3) t.heroes = 1;
  if (s.sheds.torpedo.built) t.torp = 1;
  if (G.totalStars(s) > 0) t.star = 1;
  if (s.hq >= 2) t.hq2 = t.hq2done = 1;
  if (s.boosts.length) t.boost1 = 1;
  if (s.sheds.destroyer.built) t.des = 1;
  if (s.done >= 20) t.m20 = t.wantD = 1; // round 7: a jump past mission 20 said "I want to fly a Helicopter" long ago (it came at mission 39)
  if (s.hq >= 3) t.hq3 = t.hq3done = 1;
  if (s.sheds.repair.built) t.rep = 1;
  if (s.boosts.includes('capt1') && s.flags.gift !== 'shown') s.flags.gift = 'taken';
}
function jumpTo(n) {
  const s = fresh(), b = makeBot('good');
  for (let i = 0; i < 400000 && s.done < n - 1 && s.phase !== 'fightReady'; i++) { G.step(s, 0.05); b(s, 0.05); s.ev.length = 0; }
  if (n > 40 && s.phase === 'fightReady') { G.fightWon(s); s.incoming = null; G.collectChest(s); s.stage = 3; G.recoverZone(s); }
  markTut(s); s.ev = [];
  return s;
}

// ---------- HUD ----------
const txt = (id, v) => { const el = $(id); if (el._v !== v) { el._v = v; el.textContent = v; } };
// r5 juice: the gold counter follows the coins (ST main.js:348-352). Gold still flying (3D coins and DOM coin flights)
// is held back and added as each coin lands; spending eases down over about 0.3 s; QA shows the real number.
let shownGold = null, flyGold = 0, flyAt = 0, flyGem = 0, flyGemAt = 0, hudT = 0, hudGem = null, hudHq = null, zbId = 0, zbTrail = 1, zbHit = 0, zbHitAt = 0;
const SHED_TAG = { gunboat: 'Gunboat', torpedo: 'Torpedo', destroyer: 'Helicopter', repair: 'Repair' }; // round 8: the third shed is the Helipad (owner 2026-11-13 "i dont need robots and tanks")
function hud() {
  const now = performance.now(), hdt = Math.min(0.1, (now - (hudT || now)) / 1000); hudT = now;
  if (flyGold > 0 && now - flyAt > 3500) flyGold = 0;
  const want = Math.max(0, S.gold - (view ? view.coinsInFlight : 0) - flyGold);
  if (QA || shownGold == null || want >= shownGold || Math.abs(want - shownGold) < 1) shownGold = want;
  else shownGold += (want - shownGold) * Math.min(1, hdt * 12);
  txt('t-gold', fmt(shownGold));
  // L16: gems get their own counter once there are any; it pops when they go up
  show('p-gem', S.gems > 0);
  if (flyGem > 0 && now - flyGemAt > 3500) flyGem = 0;
  const gemS = Math.max(0, Math.round(S.gems - flyGem)); // P2L-12: gems still in the air are not on the counter yet
  if (hudGem !== gemS) { if (hudGem != null && gemS > hudGem) J.bump('p-gem'); hudGem = gemS; txt('t-gem', fmt(gemS)); }
  // E20: each shed tag carries its ship's icon and name; E13: the shed whose card is open hides its tag under the card
  for (const k of ['gunboat', 'torpedo', 'destroyer', 'repair']) { const L = labels['lv-' + k], s = S.sheds[k]; if (L) { const c = !QA && s.built && S.gold >= G.upCost(k, s.lv); if (L._can !== c) { L._can = c; L.classList.toggle('can', c); L._sz = null; } // the up arrow adds 20 px the box must know (same trap as the name below)
    if (!L._named) { L._named = 1; L.classList.add('k-' + k); L.dataset.n = SHED_TAG[k]; L._sz = null; } // recQ: boxOf had sized the tag before its name went in (32 px for 101), so bubbles, numbers and the tag slide all missed it
    const cd = cardKey === k; if (L._cd !== cd) { L._cd = cd; L.classList.toggle('carded', cd); } } }
  // the badge and power keep the old HQ while its upgrade plays out, then change (and pop) as the new HQ bursts in
  const hqS = hqShown(), showBase = hqS >= 2, pw = G.power(S) - G.hqPower(S.hq) + G.hqPower(hqS);
  show('hqbadge', showBase); show('p-power', showBase); show('b-heroes', !!T().heroes && !QA);
  txt('t-hq', String(hqS)); txt('t-power', fmt(pw));
  if (hudHq !== hqS) { if (hudHq != null && hqS > hudHq && !QA) { J.bump('hqbadge'); J.bump('p-power'); } hudHq = hqS; }
  // L30, L31: the chip reads HERE! once Ironjaw has arrived (FIGHT is up) and COMPLETED / INCOMING after the win, until the harbor
  // grows (Top Force 13:34: "Completed" over "INCOMING", and the claim panel keeps its INCOMING title at 13:38)
  const won = S.incoming == null && S.done >= 40, here = S.incoming != null && (S.phase === 'fightReady' || S.phase === 'fight');
  const inc = (S.incoming != null || won) && S.phase !== 'end' && S.stage < 3 && !incHold; // incHold: the chip waits for Bram to explain it
  show('incoming', inc && !(here && !$('bwarn').classList.contains('hidden'))); // look review 8 (flag): one name at a time while the strip is up
  if (inc) {
    const t = Math.ceil(S.incoming || 0), ic = $('incoming');
    txt('t-inc', won ? 'COMPLETED' : here ? 'HERE!' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    txt('t-incs', here ? 'IRONJAW' : 'INCOMING');
    ic.classList.toggle('warn', !won && !here && t <= 60); ic.classList.toggle('here', here); ic.classList.toggle('won', won);
  }
  // L13: the mission-20 flagship's named bar: red follows the hull, a yellow trail drains after it, it jolts on a hit
  const zb = S.enemies.find(e => e.kind === 'boss' && e.hp > 0);
  // look review 7 (boss20): the warship's name showed twice, on its bar and on the strip; the bar waits for the strip to go
  show('zboss', !!zb && $('bwarn').classList.contains('hidden'));
  if (zb) {
    const f = Math.max(0, zb.hp / zb.max), el = $('zboss');
    if (zbId !== zb.id) { zbId = zb.id; zbTrail = 1; }
    zbTrail = Math.max(f, f + (zbTrail - f) * Math.exp(-hdt * 2.5));
    el.querySelector('.hp').style.width = (f * 100).toFixed(1) + '%'; el.querySelector('.tr').style.width = (zbTrail * 100).toFixed(1) + '%';
    if (zb.hitT > zbHit + 1e-4 && now - zbHitAt > 140) { zbHitAt = now; J.bump(el, 'bhit'); }
    zbHit = zb.hitT;
  }
  // L33: FIGHT waits until the camera has stopped, so it does not drift away from the first tap
  const fb = labels.fight;
  if (fb) { const c = view.cam, mv = !!c && c.follow && (Math.hypot(c.gx - c.tx, c.gz - c.tz) > 1.5 || Math.abs(c.gzoom - c.zoom) > 0.03); if (fb._mv !== mv) { fb._mv = mv; fb.classList.toggle('settling', mv); } }
  // mission tag: three wave dots (Top Force: orange skull per wave, green tick when cleared, boss on the last)
  const m = S.m, n = m ? m.n : S.mission;
  // round 6: Top Force shows no mission tag while the first 42 come at the fence (0:35 to 2:10), only the Enemies counter
  // R-300 round 9 (pair line, sheet 2:14 to 2:17): Mission-10 showed through the rescue story and the upgrades about 60 s
  // before mission 10; Top Force shows no tag from the gate's end until mission 10 starts (f1 s0138 to s0200, tag at 3:23)
  show('mission', !G.inGate(S) && !S.waitPad);
  txt('t-mission', 'Mission-' + n);
  const key = [n, m ? m.wave : -1, m && m.killed >= m.total ? 1 : 0].join(',');
  if ($('dots')._k !== key) {
    $('dots')._k = key;
    let h = '';
    for (let i = 0; i < 3; i++) {
      const done = m ? (i < m.wave || (m.killed >= m.total)) : false;
      h += `<i class="${done ? 'done' : ''}${(n === 20 || n === 40) && i === 2 ? ' boss' : ''}"></i>`;
    }
    $('dots').innerHTML = h;
  }
  // Upgrades red dot: a boost to unlock or the HQ ready
  const anyBoost = Object.keys(G.BOOSTS).some(lv => G.BOOSTS[lv].some(b => G.boostState(S, b) === 'ready'));
  show('upg-dot', anyBoost || G.canHq(S));
  // quest bar
  const p = G.questProgress(S);
  show('questwrap', !!p);
  $('app').classList.toggle('prebuild', !QA && S.flags.gift0 !== 'taken'); // P2E-10: Top Force shows no task bar or mission tag until the first units are out (0:12 to 0:21)
  if (p) { txt('t-quest', `${p.q.t} (${p.cur}/${p.q.n})`); $('quest').classList.toggle('done', p.done); }
  if (cardKey) renderCard();
}
let coinBump = 0;
function goldAt() { const r = $('p-gold').getBoundingClientRect(), a = $('app').getBoundingClientRect(); return [r.left - a.left + 12, r.top - a.top + 11]; }

// ---------- upgrade card (Top Force 0:50: Level, name, five stars, green bar to next star, ship box, blue gold button) ----------
function openCard(key) { cardKey = key; closeHq(); show('card', true); renderCard(); if (camMode === 'front' && view.cam.follow === false) return; if (camMode !== 'base') { camMode = 'base'; camHold = 2.5; homeIcon(); } }
function closeCard() { cardKey = null; show('card', false); }
function renderCard() {
  const key = cardKey, s = S.sheds[key], d = G.SHEDS[key];
  txt('c-lv', 'Level ' + s.lv); txt('c-name', d.name);
  const st = G.shedStars(s.lv), sk = 'st' + st;
  if ($('c-stars')._k !== sk) { $('c-stars')._k = sk; $('c-stars').innerHTML = [0, 1, 2, 3, 4].map(i => `<span class="${i < st ? 'on' : ''}">&#9733;</span>`).join(''); }
  const next = G.STAR_LEVELS[st], prev = st ? G.STAR_LEVELS[st - 1] : 1;
  $('c-bar').style.right = next ? `calc(${(1 - (s.lv - prev) / (next - prev)) * 100}% + 2px)` : '2px';
  const img = key === 'repair' ? 'img/ic-repair.png' : `img/${key}-a.png`;
  if ($('c-img')._src !== img) { $('c-img')._src = img; $('c-img').src = img; }
  txt('c-dmg', key === 'repair' ? Math.round(G.healPct(S) * 100) + '%' : fmt(G.shipDmg(S, key, s.lv)));
  txt('c-time', key === 'repair' ? '2s' : (Math.round(G.buildTime(S, key) * 10) / 10) + 's');
  const cost = G.upCost(key, s.lv);
  txt('c-cost', fmt(cost)); $('c-buy').classList.toggle('off', S.gold < cost);
  // Top Force 014: the level that adds a star turns the button green, "Promote"
  const promo = G.shedStars(s.lv + 1) > st, b = $('c-buy');
  if (b._p !== promo) { b._p = promo; b.classList.toggle('promo', promo); b.classList.toggle('green', promo); b.classList.toggle('blue', !promo); }
}
function placeCard() {
  if (!cardKey) return;
  const [x, y] = spotScreen(cardKey), [W] = view.size, c = $('card');
  const w = c.offsetWidth, h = c.offsetHeight;
  const left = Math.max(6, Math.min(W - w - 6, x - w / 2));
  let top = y - h - 22; if (top < 64) top = 64;
  c.style.left = left + 'px'; c.style.top = top + 'px';
  $('c-tip').style.left = Math.max(14, Math.min(w - 14, x - left)) + 'px';
}
$('c-buy').onclick = () => {
  if (!cardKey) return;
  // r5 juice: spending floats a red "-cost", the level word bumps, the numbers flash green with a "+x"; not enough gold
  // shakes the button and flashes the gold pill red with a low buzz
  const key = cardKey, s = S.sheds[key], cost = G.upCost(key, s.lv);
  const d0 = key === 'repair' ? G.healPct(S) * 100 : G.shipDmg(S, key, s.lv), st0 = G.shedStars(s.lv);
  if (!G.upgrade(S, key)) { toast('Not enough gold'); noGold($('c-buy')); hud(); return; }
  sfx.upgrade(); buzz(20);
  const g = J.rectOf('p-gold'); J.floatText(g.x + 10, g.y + 22, '-' + fmt(cost), 'red');
  hud(); renderCard();
  J.bump('c-lv'); J.bump('c-dmg', 'upg'); J.bump('c-time', 'upg');
  const d1 = key === 'repair' ? G.healPct(S) * 100 : G.shipDmg(S, key, s.lv), r = J.rectOf('c-dmg');
  if (d1 > d0) J.floatText(r.x + r.w / 2 + 16, r.y - 6, '+' + (key === 'repair' ? Math.round(d1 - d0) + '%' : fmt(d1 - d0)), 'green small');
  const st1 = G.shedStars(s.lv);
  if (st1 > st0) { const sp = $('c-stars').children[st1 - 1]; if (sp) J.bump(sp, 'in'); }
};
// shared "not enough gold" reaction (D10)
function noGold(el) { if (el) J.bump(el, 'nope'); J.bump('p-gold', 'nogold'); sfx.deny(); buzz(10); }

// ---------- HQ panel (Top Force 3:40 "Lv. 2 Military Base": star pill, green header, rows with Unlock / Go) ----------
function openHq() { closeCard(); hqOpen = true; show('hq', true); $('app').classList.add('panelopen'); renderHq(); }
function closeHq() { hqOpen = false; hqStamp = null; show('hq', false); $('app').classList.remove('panelopen'); }
let hqStamp = null;
function renderHq() {
  txt('h-stars', String(G.totalStars(S))); txt('h-lv', String(S.hq));
  // E31: the gold you hold sits beside the stars while the panel is open (the price is in the rows below)
  txt('h-gold', fmt(Math.floor(S.gold)));
  const path = G.BOOSTS[S.hq] || [];
  const r = G.hqReq(S);
  // E31: the header bar fills a third for each HQ condition met (stars, mission, gold); at the top level, by boosts unlocked
  // round 9: Top Force's HQ 2 asks 3 stars only, HQ 3 9 stars and 500 gold: a condition that asks nothing is not shown
  const conds = r ? [[G.totalStars(S) >= r.stars, true], [S.done >= r.mission, r.mission > 0], [S.gold >= r.gold, r.gold > 0]].filter(c => c[1]) : [];
  const met = r ? conds.filter(c => c[0]).length / conds.length : path.length ? path.filter(b => S.boosts.includes(b.id)).length / path.length : 0;
  $('h-bar').firstElementChild.style.width = met * 100 + '%';
  let up = '';
  if (r) {
    const st = G.totalStars(S), ok = G.canHq(S);
    up = `<div class="req"><p class="${st >= r.stars ? 'ok' : 'no'}">Stars ${Math.min(st, r.stars)}/${r.stars}</p>${r.mission ? `<p class="${S.done >= r.mission ? 'ok' : 'no'}">Complete Mission ${r.mission}</p>` : ''}${r.gold ? `<p class="${S.gold >= r.gold ? 'ok' : 'no'}">Gold ${fmt(Math.floor(S.gold))}/${fmt(r.gold)}</p>` : ''}</div>
      <button id="hq-go" class="${ok ? 'green' : 'grey'}">Upgrade to Lv.${S.hq + 1}${r.gold ? `<img src="img/coin.png" alt="">${fmt(r.gold)}` : ''}</button>`;
  } else up = '<div class="req"><p>Top level in this prototype</p></div>';
  let list = '';
  // round 9: Top Force's Lv.1 base already has its boost path (Officer Expansion I, Soldier Rally I, Officer Expansion II)
  for (let lv = S.hq; lv >= 1; lv--) for (const b of G.BOOSTS[lv] || []) {
    const st = G.boostState(S, b);
    const btn = st === 'done' ? '<span class="lockt">Done</span>' : st === 'ready' ? `<button class="green" data-b="${b.id}">Unlock</button>` : st === 'stars' ? `<button class="blue" data-go="1">Go</button>` : '<span class="lockt">Locked</span>';
    list += `<div class="brow ${st === 'ready' ? 'ready' : st === 'done' ? 'done' : ''}${hqStamp === b.id ? ' stamp' : ''}"><i class="need"><span>${b.need}</span></i><img src="img/${['ic-steam', 'ic-rally', 'ic-capt', 'ic-gasm', 'ic-torp'][b.icon]}.png" alt=""><div><h5>${b.name}</h5><small>${b.desc}</small></div>${btn}</div>`;
  }
  const key = up + '|' + list;
  if ($('hq-in')._k !== key) { $('hq-in')._k = key; $('hq-up').innerHTML = up; $('hq-list').innerHTML = list; }
  $('hq-list').classList.toggle('solo', !list); // E05: no boost rail until the path has nodes on it
}
$('hq').addEventListener('click', e => {
  if (e.target === $('hq')) { closeHq(); return; } // E31: a tap outside the panel closes it
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'hq-go') { if (!G.upgradeHq(S)) toast('Not ready yet'); renderHq(); }
  else if (t.dataset.b) { G.unlockBoost(S, t.dataset.b); hqStamp = t.dataset.b; renderHq(); } // L22: its Done stamps in
  else if (t.dataset.go) { closeHq(); goUpgrade(); }
});
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { const id = b.dataset.close; if (id === 'hq') closeHq(); else show(id, false); });
$('b-upg').onclick = () => (hqOpen ? closeHq() : openHq());
$('b-gear').onclick = () => { show('settings', true); renderSpeed(); };
$('b-fleet').onclick = () => (camMode === 'base' ? focusZone() : focusBase(6));

// "Go": point at the cheapest shed upgrade for a few seconds
let guide = null;
const hand = t => (t && t.nohand ? null : t); // a bubble-only hint (Top Force 3:22 "Clear Missions to complete Tasks": no finger)
// r5 walk: the HQ Lv.3 finger came up while the camera was still sliding to the harbor, and a tap on it landed on the
// Destroyer shed that had slid under it. Harbor fingers wait until the camera has stopped (the FIGHT test, L33).
const camSettling = () => { const c = view && view.cam; return !!c && c.follow && (Math.hypot(c.gx - c.tx, c.gz - c.tz) > 1.5 || Math.abs(c.gzoom - c.zoom) > 0.03); };
function setGuide(target, done, ttl) {
  const base = !!(target && (target.base || (target.el && /^(plot-|gift)/.test(target.el))));
  if (base && !QA) target = { ...target, wait: camSettling };
  // r5 juice (D15): the first steps (first shed, the first gift, the first shed upgrade, the first HQ upgrade) dim the
  // rest of the screen around the target; later hints keep the plain finger
  if (target && !target.spot && !QA && (
    (target.el === 'plot-gunboat' && !S.sheds.gunboat.built) || target.el === 'gift0w' ||
    (target.key === 'gunboat' && S.sheds.gunboat.lv < 2) || (target.hq && S.hq < 2))) target = { ...target, spot: true };
  guide = { done, ttl: ttl || 0, base, bub: target && target.bub, target, hid: false }; finger(hand(target));
  if (base && camMode !== 'base') focusBase();
}
// playtest E04: a panel the hint is not about (settings, the HQ panel, another shed's card, the incoming sheet, heroes,
// a reward) hides the finger and its bubble until it closes; Top Force never draws its finger over an unrelated panel
const isOpen = id => { const e = $(id); return !!e && !e.classList.contains('hidden'); };
function guideBlocked(tg) {
  if (!tg) return false;
  if (['settings', 'incp', 'heroes', 'reward', 'lineup', 'offer', 'hqup', 'victory', 'end'].some(isOpen)) return true;
  if (hqOpen && !tg.hq) return true;
  return !!cardKey && tg.key !== cardKey && tg.el !== 'plot-' + cardKey;
}
// playtest E28: a hint from the quest bar or the Upgrades button stays until the step is done (or 10 s), not 3 s
const lvDone = (k, lv) => () => S.sheds[k].lv > lv;
function goUpgrade() {
  let best = null, bc = Infinity;
  for (const k of ['gunboat', 'torpedo', 'destroyer']) { const s = S.sheds[k]; if (!s.built) continue; const c = G.upCost(k, s.lv); if (c < bc) { bc = c; best = k; } }
  if (best) setGuide(fingerOn(best), lvDone(best, S.sheds[best].lv), 10);
}
// on the card the finger taps the right part of the button so the coin and the price stay readable
const fingerOn = key => ({ base: true, key, at: () => (cardKey === key ? elPoint('c-buy', 0.78) : spotScreen(key)), spotR: () => (cardKey === key ? 100 : 58), ellEl: () => (cardKey === key ? 'c-buy' : null) });
// on the HQ panel the finger taps the lower edge of the button so "Upgrade to Lv.N" and the price stay readable
// look review 3 (m10 020): a round spot on the wide button washed out the panel's words; on a panel the spot hugs the button (ellEl)
const fingerHq = () => ({ base: true, hq: 1, at: () => (hqOpen ? elPoint('hq-go', 0.76, 0.72) : spotScreen('hq')), spotR: () => (hqOpen ? 80 : 70), ellEl: () => (hqOpen ? 'hq-go' : null) });
const elPoint = (id, fx = 0.76, fy = 0.72) => { const el = $(id); if (!el || el.classList.contains('hidden')) return null; const r = el.getBoundingClientRect(), a = $('app').getBoundingClientRect(); return [r.left - a.left + r.width * fx, r.top - a.top + r.height * fy, r.left - a.left + r.width / 2, r.top - a.top + r.height / 2]; }; // finger point, then the spot centre (the button middle)

// ---------- quest bar ----------
let questBusy = false;
$('quest').onclick = () => {
  const p = G.questProgress(S); if (!p) return;
  if (p.done) {
    // r5 juice (D11): a green tick drops in, the task slides away, coins fly from the bar to the gold counter (the number
    // follows them), then the next task pops in
    if (QA) { G.claimQuest(S); return; }
    if (questBusy) return; questBusy = true;
    // R-300 round 9 (rec-d 0:33 to 0:34): the Claim finger stayed while the bar slid away, pointing at bare grass for half a
    // second; the finger leaves with the tap (Top Force's finger is gone as the Claim is tapped)
    if (guide && guide.target && guide.target.el === 'quest') { finger(null); guide = null; }
    const q = $('quest'); J.bump(q, 'claimed'); sfx.quest(); buzz(15);
    setTimeout(() => q.classList.add('qout'), 340);
    setTimeout(() => {
      const g0 = S.gold, from = J.rectOf(q); G.claimQuest(S); const got = S.gold - g0;
      q.classList.remove('claimed', 'qout'); J.bump(q, 'qin');
      if (got > 0) {
        const k = Math.min(12, Math.round(3 + got / 50)); flyGold += got; flyAt = performance.now();
        J.flyIcons('img/coin.png', from, 'p-gold', k, { size: 26, onEach: i => { flyGold = Math.max(0, flyGold - got / k); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i); } });
      }
      questBusy = false; hud();
    }, 560);
    return;
  }
  const qn = S.quest, qDone = () => S.quest !== qn || G.questProgress(S).done;
  if (p.q.k === 'lv' && S.sheds[p.q.s].built) setGuide(fingerOn(p.q.s), qDone, 10);
  else if (p.q.k === 'built' || p.q.k === 'lv') setGuide({ el: 'plot-' + p.q.s }, () => S.sheds[p.q.s].built, 10);
  else if (p.q.k === 'hq') setGuide(fingerHq(), qDone, 10);
};

// ---------- settings ----------
function renderSpeed() {
  document.querySelectorAll('#s-speed button').forEach(b => b.classList.toggle('on', +b.dataset.v === speed));
  const a = audioSettings();
  document.querySelectorAll('#s-sound button').forEach(b => b.classList.toggle('on', +b.dataset.v === (a.sound ? 1 : 0)));
  document.querySelectorAll('#s-vibe button').forEach(b => b.classList.toggle('on', +b.dataset.v === (a.vibe ? 1 : 0)));
}
$('s-sound').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v) { setAudio({ sound: v === '1' }); renderSpeed(); } };
$('s-vibe').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v) { setAudio({ vibe: v === '1' }); renderSpeed(); if (v === '1') buzz(20); } };
$('s-speed').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v) { speed = +v; localStorage.setItem(SPEED_KEY, v); renderSpeed(); } };
$('s-reset').onclick = () => { if (confirm('Restart from Mission 1?')) { localStorage.removeItem(SAVE_KEY); location.href = location.pathname; } };

// ---------- world labels ----------
const world = $('world'), labels = {};
function label(id, cls, html) {
  let el = labels[id];
  if (!el) { el = document.createElement('div'); el.className = cls; world.appendChild(el); labels[id] = el; el._h = null; }
  if (html != null && el._h !== html) { el.innerHTML = html; el._h = html; el._sz = null; }
  el.style.display = ''; el._seen = frameNo; return el;
}
let GIFT_AT = [-15, -5.5];            // open quay just in front of the gunboat shed (Top Force 006: small gift on the ground by the factory)
const BRAM_AT = [56, -100], CAST_AT = [66, -44];   // the raft drifts off to the side of the boats' route (Top Force 059)
const CAST_BUB = [66, -44, 10.5]; // over the raft (CAST_AT)
const HOME_AT = [-15, -5.5];      // where a rescued sailor stands in the harbor to say his line (Top Force 080)
const rich = t => t.replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\[(.+?)\]/g, '<em class="r">$1</em>');
const elEdge = (id, below) => { const el = $(id); if (!el || el.classList.contains('hidden') || !el.offsetParent) return null; const r = el.getBoundingClientRect(), a = $('app').getBoundingClientRect(); return [r.left - a.left + r.width / 2, below ? r.bottom - a.top : r.top - a.top]; };
let hqHold = null; // the HQ level the harbor still shows while an upgrade plays out
const hqShown = () => hqHold ?? (S.hq - (hqWait ? 1 : 0)), openNow = k => G.buildOpen(S, k) && (k === 'torpedo' || hqShown() >= G.SHEDS[k].needHq);
let lastKill = null, loot = null, skirm = null; // round 6: mission 39's loot beat and the skirmish before Skye (bossIntro)
let armadaXY = [], skyeShots = [], quip = null, skye = null, runner = null, incHold = false, flagship = null, armada = null, hqWait = null, dropN = 0, sailorHome = null, bramRide = null;
window.__HFride = (t) => { if (t != null) bramRide = { t, hold: 1 }; return bramRide; }; // QA: freeze Bram's pickup at a time for screenshots
const drops = [];
const place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
function spotScreen(key) { const p = SPOT[key]; return view.w2s(p[0], p[1], key === 'hq' && S.hq >= 3 ? 20.5 : p[2]); }
const zoomK = () => view.cam.zoom;

// a see-through tap area over a 3D story prop; finger and setGuide find it by id
function hitAt(key, id, x, z, y, size, fn) {
  const el = label(key, 'hit'); el.id = id; if (!el.onclick) el.onclick = () => fn();
  const d = Math.max(64, view.ppu(x, z, y) * size); el.style.width = el.style.height = d + 'px'; // 64 px floor: the finger tip always lands inside
  const [sx, sy] = view.w2s(x, z, y); place(el, sx, sy);
}
// comic HELP burst over someone in trouble (Top Force 025, 059)
function burstAt(key, x, z, y, keep, small) { const el = label('burst-' + key, 'burst' + (keep ? ' keep' : ''), '<b>HELP</b>'); el.classList.toggle('small', !!small); const [sx, sy] = view.w2s(x, z, y); place(el, sx, sy); }
// where the chest lands on a beaten outpost: the open ground in front, not inside the wrecked tent
const CHEST_OFF = { 2: [1, 7, 2.4], 3: [0, 6, 1.0], 4: [0, 6, 1.2] };
const chestAt = n => { const z = ZONES[n].at, o = CHEST_OFF[n]; return [z[0] + o[0], z[1] + o[1], o[2]]; };
// small 3D figures and boxes at unit scale, drawn by view.js (owner 2026-11-12 Image #4, #5)
function storyProps() {
  if (QA || !S) return [];
  const L = [];
  if (S.flags.gift0 === 'shown') L.push({ id: 'gift0', kind: 'gift', x: GIFT_AT[0], z: GIFT_AT[1], y: BASE.y, s: 2.2, drop: 1, hop: 1, glow: 1, ry: -0.7 });
  if (S.flags.gift === 'shown') L.push({ id: 'gift', kind: 'gift', x: GIFT_AT[0], z: GIFT_AT[1], y: BASE.y, s: 2.2, drop: 1, hop: 1, glow: 1, ry: -0.7 });
  if (loot && !loot.taken) L.push({ id: 'loot40', kind: 'chest', x: loot.x, z: loot.z, y: 0.5, s: 1.4, drop: 1, hop: 1, glow: 1, ry: -0.6 });
  if (S.chest && !S.chest.taken) { const c = chestAt(S.chest.zone); L.push({ id: 'chest' + S.chest.zone, kind: 'chest', x: c[0], z: c[1], y: c[2], s: 1.4, drop: 1, hop: 1, glow: 1, ry: -0.6 }); }
  if (T().outpost && !T().victor && S.zone === 2) {
    const saved = !!(S.chest && S.chest.zone === 2 && S.chest.taken), off = bramRide && bramRide.t >= RIDE_HOP;
    L.push({ id: 'bram', kind: off ? 'rock' : S.phase === 'wreck' || saved ? 'bram-free' : 'bram', x: BRAM_AT[0], z: BRAM_AT[1], y: 0, s: 1.7, face: !off, wave: !saved }); // tied with a guard until the outpost falls
  } else if (T().victor) L.push({ id: 'bram', kind: 'rock', x: BRAM_AT[0], z: BRAM_AT[1], y: 0, s: 1.7 }); // the empty rock stays put
  if (bramRide) for (const p of rideProps()) L.push(p);
  if (S.flags.castaway === 'shown') L.push({ id: 'sailor', kind: 'sailor', x: CAST_AT[0], z: CAST_AT[1], y: 0, s: 1.7, bob: 1, face: 1, wave: 1 });
  if (sailorHome) L.push({ id: 'sailorHome', kind: 'p-sailor', x: HOME_AT[0], z: HOME_AT[1], y: BASE.y, s: 2.1, drop: 1, face: 1, wave: 1 });
  if (skye) {
    const u = Math.min(1, skye.t / 2.2), e = 1 - Math.pow(1 - u, 3), dx = skye.b[0] - skye.a[0], dz = skye.b[1] - skye.a[1];
    L.push({ id: 'skye', kind: 'skye', x: skye.a[0] + dx * e, z: skye.a[1] + dz * e, y: 0, s: 2.8, bob: u >= 1, ry: Math.atan2(-dz, dx), wave: u >= 1 });
    if (u < 1 && (skye.sp = (skye.sp || 0) + 1) % 3 === 0) view.splash && view.splash(skye.a[0] + dx * e - Math.cos(Math.atan2(-dz, dx)) * 4, skye.a[1] + dz * e + Math.sin(Math.atan2(-dz, dx)) * 4, 0.8); // a long white wake behind her (Top Force 12:06: a blue streak)
  }
  if (runner && runner.t < 3.2) { // the raider that runs for backup: slow away from the camp, then full speed out of shot
    const u = runner.t / 3.2, e = u * u, dx = runner.b[0] - runner.a[0], dz = runner.b[1] - runner.a[1], x = runner.a[0] + dx * e, z = runner.a[1] + dz * e, ry = Math.atan2(-dz, dx);
    L.push({ id: 'runner', kind: 'boat-raider', x, z, y: 0, s: 1, ry });
    if ((runner.sp = (runner.sp || 0) + 1) % 5 === 0) view.splash && view.splash(x - Math.cos(ry) * 4, z + Math.sin(ry) * 4, 0.6);
  }
  for (const d of drops) { const p = SPOT[d.key]; L.push({ id: 'drop' + d.id, kind: 'gift', x: p[0], z: p[1], y: d.key === 'repair' ? 0.5 : BASE.y, s: d.key === 'repair' ? 2.6 : 4.4, drop: 1, hop: 1, glow: 1, ry: -0.7 }); }
  for (const b of coBoats()) L.push(b);
  // after the intro the flagship stays parked where the fight puts the boss (a reload or a cancelled lineup too)
  if (!flagship && S.phase === 'fightReady' && T().f40 && !busy && !QA) flagship = { t: 99 };
  if (!armada && S.phase === 'fightReady' && T().f40 && !busy && !QA) armada = { t: 99, sunk: Object.fromEntries((S.flags.armSunk || [0, 1, 11]).map(i => [i, -9])) }; // the three Skye sank stay gone
  armadaXY = []; if (armada) for (const b of armadaProps()) { L.push(b); if (b.y > -1) armadaXY.push([b.x, b.z]); } // round 6: the recorder counts the armada as reds on screen
  if (flagship) {
    const [x, z, u, ry] = flagAt();
    L.push({ id: 'flag', kind: 'boat-boss', x, z, y: 0, s: FLAG_DRAW, ry, walk: u < 1 });
    if (u < 1 && (flagship.sp = (flagship.sp || 0) + 1) % 5 === 0) view.splash(x - Math.cos(ry) * 16, z + Math.sin(ry) * 16, 1.6);
  }
  return L;
}
// look review 7 (skye): her fixed stop (96, -12) was where one of our gunboats often stood, so she sat on its deck. She now
// stops just past the fleet's front edge, toward the camp, and arrives along that edge from the south instead of over the fleet
function skyeSpot() {
  const fl = S.ships.filter(u => u.hp > 0), mx = ARMADA.reduce((a, p) => a + p[0], 0) / ARMADA.length, mz = ARMADA.reduce((a, p) => a + p[1], 0) / ARMADA.length;
  if (!fl.length) return { a: [58, -2], b: [96, -12], h: [0.967, -0.254] };
  let cx = 0, cz = 0; for (const u of fl) { cx += u.x; cz += u.z; } cx /= fl.length; cz /= fl.length;
  let dx = mx - cx, dz = mz - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  let front = 0; for (const u of fl) front = Math.max(front, (u.x - cx) * dx + (u.z - cz) * dz + u.len * 0.6);
  // she sinks the three armada boats nearest her stop; the next one must stay clear of her, else she stops a little shorter
  // look review 8 (skye): she stopped 4 to 8 from the three she blew up, so their smoke hid her (a grey smear under SKYE
  // JOINED) and she sat on a raider; now every raider is at least 10 off her stop and she keeps clear of our boats too,
  // (Top Force 12:06: the hero stays sharp and the enemy goes up in fire)
  // look review 9 (skye, 057): 8.3 from a gunboat's centre left her jet ski on its bow (drawn hull 9.6, jet ski about 3.5
  // each side of her centre); she wants about 10.8 from our boats, and the scene eases any closer boat back (keepOff below)
  // playthrough 22 (059): the jet ski is drawn at 2.8 times its model, about 16 long (tail 6.4 behind her centre, nose 9.8
  // ahead, 2.7 each side), and she stops still heading along our front row, so a round 10.8 from her centre put the nose on
  // the next gunboat's bow; clearance is now measured from the hull itself, for the heading she really stops with
  const TAIL = 2.3 * 2.8, NOSE = 3.5 * 2.8, HALF = 0.95 * 2.8;
  // re-shot (debug): heading along the front row, a 16-long hull fitted nowhere and she fell back among the raiders; the
  // stop heading is now searched too (16 ways round), and she arrives straight along it from 34 behind
  const HEADS = Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);
  const segD = (p, h, x, z) => { const vx = x - p[0], vz = z - p[1], s = Math.max(-TAIL, Math.min(NOSE, vx * h[0] + vz * h[1])); return Math.hypot(vx - h[0] * s, vz - h[1] * s); };
  // look review 10 (flag, intro-seq 4 and 5): the flagship parks after she does and its bow came to rest against her head
  // (Top Force 12:21: the boss stays far off, open sea between it and the hero); her hull keeps 4 of water off its keel
  // (len 22 x 1.6 = 35, beam 7 x 1.6 = 11) as it arrives and swings round to face the fleet, and her hull stays on screen,
  // clear of the Upgrades button (else the best corner was under it)
  const fin = FLAG_P[FLAG_P.length - 1], pre = FLAG_P[FLAG_P.length - 2], r0 = Math.atan2(-(fin[1] - pre[1]), fin[0] - pre[0]);
  const dr = Math.atan2(Math.sin(FLAG_FACE - r0), Math.cos(FLAG_FACE - r0)), FK = [];
  for (const t of [0, 0.5, 1]) { const r = r0 + dr * t; for (let s = -11 * FLAG_S; s <= 11 * FLAG_S + 0.01; s += 2.2) FK.push([fin[0] + Math.cos(r) * s, fin[1] - Math.sin(r) * s]); }
  // the button is hidden while anyone talks (rect 0), so its spot comes from the stylesheet: right 6, top 62%, 64 by about 70;
  // the camera is still easing in when she is placed, so spots are measured where it will settle
  const W = innerWidth, H = innerHeight, ub = [W - 70 - 18, H * 0.62 - 18, W, H * 0.62 + 70 + 18];
  const onScreen = (p, h) => !view.w2sGoal || [-TAIL, -TAIL / 2, 0, NOSE / 2, NOSE].every(t => { const [x, y] = view.w2sGoal(p[0] + h[0] * t, p[1] + h[1] * t); return x > 16 && x < W - 16 && y > 130 && y < H - 130 && !(x > ub[0] && x < ub[2] && y > ub[1] && y < ub[3]); });
  const clear = (p, h, rd, ro) => [-TAIL, 0, NOSE].every(t => isWater(p[0] + h[0] * t, p[1] + h[1] * t, 3, 1)) && ARMADA.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= rd && segD(p, h, q[0], q[1]) >= 7 * 0.6 + HALF + 1) && fl.every(u => segD(p, h, u.x, u.z) >= u.len * 0.6 + HALF + ro) && FK.every(q => segD(p, h, q[0], q[1]) >= 3.5 * FLAG_S + HALF + 4) && onScreen(p, h);
  // the armada parks only about 8 past our front row, so a clear spot is usually a gap in our own front line (re-shot: with
  // the search limited to the front edge nothing fitted and she fell back onto the raiders); front and centre wins; ro is
  // the strip of water left between her hull and ours; re-shot (debug): a packed front row has no gap her whole hull fits,
  // so the search reaches out to the corners of our front row (up to 30 either side) and a little behind it
  let b = null, ok = HEADS;
  for (const [rd, ro] of [[10, 2.5], [8.5, 2.5], [8.5, 1]]) {
    let best = -1e9;
    for (let k = Math.round(front) + 4; k >= -8; k -= 1) for (let j = -30; j <= 30; j += 1.5) {
      const p = [cx + dx * k - dz * j, cz + dz * k + dx * j], sc = k - Math.abs(j) * 0.7;
      if (sc <= best) continue;
      const hs = HEADS.filter(h => clear(p, h, rd, ro));
      if (hs.length) { best = sc; b = p; ok = hs; }
    }
    if (b) break;
  }
  b = b || [cx + dx * (front + 4), cz + dz * (front + 4)];
  // look review 8 (skye-seq 1): her run crossed the raider row, so she seemed to ram two of them; of the headings her hull
  // fits at, take the one whose run stays clear of every boat and of land, then the one facing the armada most
  const run = h => [b[0] - h[0] * 34, b[1] - h[1] * 34];
  const gap = a => { let m = 1e9; for (let i = 0; i <= 18; i++) { const x = a[0] + (b[0] - a[0]) * i / 20, z = a[1] + (b[1] - a[1]) * i / 20; if (!isWater(x, z, 3, 1)) m = Math.min(m, -5); for (const q of ARMADA) m = Math.min(m, Math.hypot(q[0] - x, q[1] - z)); for (const u of fl) m = Math.min(m, Math.hypot(u.x - x, u.z - z) - u.len * 0.3); } return m; };
  let h = ok[0], hv = -1e9;
  for (const q of ok) { const v = Math.min(gap(run(q)), 8) + 1.5 * (q[0] * dx + q[1] * dz); if (v > hv) { hv = v; h = q; } }
  return { a: run(h), b, h };
}
const skyeAt = () => { const u = Math.min(1, skye.t / 2.2), e = 1 - Math.pow(1 - u, 3); return [skye.a[0] + (skye.b[0] - skye.a[0]) * e, skye.a[1] + (skye.b[1] - skye.a[1]) * e]; };
// P2L-01 (Top Force 12:02: "massive reinforcements" over a screen full of red soldiers): when Bram says "whole armada",
// a crowd of raider boats sails in from the open sea and parks in rows round the raft camp, facing the fleet. Skye sinks
// the three in front when she arrives; the rest wait there until the fight (and after a reload).
// look review 6 (flag): the last boat sat at (139, -44), on the flagship's stern once it parked; moved clear of its path and hull
// look review 7 (armada): (110, 1) was 4.5 from (106, 3), so two raiders were drawn on top of each other; moved to (118, 0),
// at least 11.7 from every other spot
// round 6 count (Top Force 12:35: up to 24 red soldiers on screen as the armada closes in; ours showed 14 boats): eight
// more round the back and the north side, open water with 5 of clearance, 11.7 from every other spot and 18 off the
// flagship's run (scratch armcand.mjs), so 22 park and 19 are left once Skye sinks her three
const ARMADA = [[103, -16], [104, -6], [106, 3], [110, -24], [112, 10], [121, 13], [131, 12], [141, 6], [146, -6], [148, -18], [141, -32], [111, -11], [118, 0], [127, -30],
  [125, 24], [157, -10], [139, 21], [113, 22], [159, 2], [153, -29], [101, 14], [162, -21]];
// look review 11 (skye-seq 3, s5 058): a raider Skye hit rolled under within 1.5 s, so 0.65 s after the blast hull and fire
// were gone and only a white splash showed (the fire glow is additive and washes out over bright water); the hull now stays
// afloat burning and listing for 1.8 s, then rolls under in 1.2 s (Top Force 12:06: the hit enemies stay down on the ground)
const ARM_FROM = [44, -30], ARM_T = 2.6, ARM_BURN = 1.8, ARM_SINK = 1.2;
function armadaProps() {
  const L = [], dir = Math.atan2(ARM_FROM[1], -ARM_FROM[0]);
  for (let i = 0; i < ARMADA.length; i++) {
    const [ax, az] = ARMADA[i], d = armada.sunk[i], t = armada.t - i * 0.08;
    if (d != null && armada.t - d > ARM_BURN + ARM_SINK) continue;
    const u = Math.min(1, Math.max(0, t / ARM_T)), e = 1 - Math.pow(1 - u, 3), x = ax + ARM_FROM[0] * (1 - e), z = az + ARM_FROM[1] * (1 - e);
    const k = Math.min(1, Math.max(0, (t - ARM_T) / 0.8)), turn = k * k * (3 - 2 * k), face = Math.PI; // then swing round to face the fleet
    let ry = dir + Math.atan2(Math.sin(face - dir), Math.cos(face - dir)) * turn, y = 0, roll = null;
    if (d != null) { const g = armada.t - d, l = Math.min(1, g / 0.4), q = Math.max(0, g - ARM_BURN) / ARM_SINK; y = -0.35 * l - q * q * 5; roll = 0.22 * l + q * 0.7; ry += q * 0.4; } // lists and burns, then rolls over and goes down
    L.push({ id: 'arm' + i, kind: 'boat-raider', x, z, y, s: 1, ry, bob: u >= 1 && d == null, roll });
    if (u < 1 && i % 3 === 0 && (armada.sp = (armada.sp || 0) + 1) % 4 === 0) view.splash(x + Math.cos(dir) * -5, z - Math.sin(dir) * -5, 0.6);
  }
  return L;
}
// Skye's entrance (Top Force 12:06 to 12:08: the new hero races in through the enemy and blasts the front of it):
// the three armada boats nearest her stop blow up one after another, then SKYE JOINED!
function skyeStrike() {
  if (QA || !armada) return;
  // look review 7: the boats round her stop, not round where she is mid-run (she fires on the way in)
  const [sx, sz] = skye ? skye.b : skyeAt(), near = ARMADA.map((p, i) => [Math.hypot(p[0] - sx, p[1] - sz), i]).filter(([, i]) => armada.sunk[i] == null).sort((a, b) => a[0] - b[0]).slice(0, 3);
  S.flags.armSunk = near.map(([, i]) => i); // which three depends on where the fleet stood; a reload keeps the same three gone
  // look review 8 (skye): "fires as she races in" did not read; a bright shot now flies from her jet ski to each raider and
  // the raider blows up in orange fire where it lands (Top Force 12:06)
  near.forEach(([, i], k) => setTimeout(() => {
    if (!armada || !skye) return; const [x, z] = ARMADA[i], [hx, hz] = skyeAt();
    sfx.shot(true);
    skyeShots.push({ kind: 'shell2', side: 'us', tracer: 1, x: hx, z: hz, tx: x, tz: z, speed: 50, hit: () => {
      if (!armada) return; armada.sunk[i] = armada.t;
      view.boom(x, 1.5, z, 0.9, 12); view.fireball(x, 2, z, 0.8); view.splash(x, z, 1.2); view.addShake(0.25, 0.4); sfx.boom(1.6); buzz(20);
      // look review 9 (skye-seq): the fireball turns to brown smoke within half a second, so every frame read as a brown
      // ball; the wreck now burns orange for 1.2 s
      // look review 10 (skye, skye-seq 2 and 3): still mostly a brown ball with a small flame, and gone 0.65 s later; the
      // wreck now burns twice as big for 2.4 s, dying down at the end (Top Force 12:06: the boats go up in orange fire)
      // look review 11: the fire now sits on the floating hull (orange over the dark hull reads, over water it washed out)
      // for the whole 1.8 s it floats, with a dark smoke plume, and dies down while the hull rolls under
      let fn = 0; const fi = setInterval(() => { if (++fn > 38 || !armada) { clearInterval(fi); return; } const f = fn < 26 ? 1 : 1 - (fn - 26) / 16; view.fireAt(x, 1.6, z, 2.6 * f); view.fireAt(x + 1.2, 1.3, z - 0.8, 1.8 * f); if (fn % 2) view.fireAt(x - 1.1, 1.2, z + 0.7, 1.6 * f); if (fn % 4 === 1 && fn < 30) view.smokeColumn(x, 2.2, z, 0.55); }, 75);
    } });
  }, k * 170));
  // look review (round 5): the banner waits for the third blast and sits above the action instead of over her strike; a plain subtitle
  setTimeout(() => { J.callout('SKYE JOINED!<small>NEW CAPTAIN</small>', 'green', 1600, Math.round($('app').clientHeight * 0.13)); sfx.fanfare(); buzz([15, 30, 15]); }, 1050);
}
// Ironjaw's flagship sails in from the open sea and stops off the camp's north-west corner, then turns its guns on
// the fleet (Top Force 12:21: the giant mech walks in before its commander talks). Not on the fight's own boss spot:
// the fleet waits there on the map; the fight hides the map and starts the boss on its spot.
// round 6 (armada shot): it parked at (122, -50), the far left of the armada, and the shot that holds on the armada left its
// hull on the screen edge and cut its name plate; it now parks 8 further along, its keel line still about 12 from the nearest raider (127, -30)
const FLAG_P = [[178, -52], [146, -52], [130, -50]], FLAG_T = 3.6, FLAG_S = 1.6, FLAG_FACE = Math.atan2(-31, -33); // toward the fleet, south-west
// R-300 round 7 second look (giant pair): the fight draws Ironjaw's robot 2.4x (fight.js GIANT_DRAW), Top Force 13:12 about 20%
// of the screen wide (refs r7 robot_a); it wades in at the same size so it does not grow when the fight starts. FLAG_S stays
// the footprint the armada's spots keep clear of. GIANT_HAT: the 1x model's height to the top of its hat (its flag reaches 18.5)
// round 8: Ironjaw's flying mothership (fight.js MOTHER_DRAW); MOTHER_TOP: the 1x model's height from the water to its deck top
const FLAG_DRAW = 1.3, MOTHER_TOP = 23; // mother8: hovering at 10, Ironjaw's skull and hat top out about 23 (the flag at 25.2)
// Bram's pickup (Top Force 6:30 to 6:58: Victor walks out of the ruins and heads for the base, "Ready for duty, sir!"):
// a gunboat comes alongside his rock, he jumps aboard, and it carries him back toward the harbor
const RIDE_IN = [[22, -66], [38, -84], [47, -93]], RIDE_OUT = [[47, -93], [34, -78], [14, -56]];
const RIDE_ARRIVE = 2.0, RIDE_HOP = 2.1, RIDE_ON = 2.6, RIDE_GO = 3.0, RIDE_END = 6.2;
function rideAt() {
  const t = bramRide.t;
  if (t < RIDE_GO) { const u = Math.min(1, t / RIDE_ARRIVE), e = 1 - Math.pow(1 - u, 2.5), [x, z, h] = along(RIDE_IN, e * pathLen(RIDE_IN)); return [x, z, h, u < 1]; }
  const u = Math.min(1, (t - RIDE_GO) / (RIDE_END - RIDE_GO)), [x, z, h] = along(RIDE_OUT, u * u * pathLen(RIDE_OUT));
  return [x, z, h, true];
}
function rideProps() {
  const t = bramRide.t, [x, z, h, moving] = rideAt(), L = [];
  if (t > RIDE_END) return L;
  L.push({ id: 'ride', kind: t >= RIDE_ON ? 'bram-ride' : 'boat-gunboat', x, z, y: 0, s: 1.25, ry: h, bob: !moving, face: t >= RIDE_ON, wave: t >= RIDE_ON && t < RIDE_GO + 1.2 });
  if (moving && (bramRide.sp = (bramRide.sp || 0) + 1) % 7 === 0) view.splash(x - Math.cos(h) * 6, z + Math.sin(h) * 6, 0.6);
  if (t >= RIDE_HOP && t < RIDE_ON) { // the jump: a short arc from the rock top onto the deck
    const k = (t - RIDE_HOP) / (RIDE_ON - RIDE_HOP), sx = BRAM_AT[0], sz = BRAM_AT[1];
    const ex = x - Math.cos(h) * 3.6, ez = z + Math.sin(h) * 3.6; // the stern, where he lands
    L.push({ id: 'hop', kind: 'p-bram', x: sx + (ex - sx) * k, z: sz + (ez - sz) * k, y: 3.2 + (1.5 - 3.2) * k + Math.sin(k * Math.PI) * 4.5, s: 2.1 + (1.5 - 2.1) * k, face: 1, wave: 1 });
  }
  if (quip && quip.ride) quip.w = [x - Math.cos(h) * 3.6, z + Math.sin(h) * 3.6, 10.5]; // over Bram on the stern; look review 8 (ride): higher, so it no longer sits on his rock and hides all of him but his cap and arm
  return L;
}
function flagAt() {
  const u = Math.min(1, flagship.t / FLAG_T), e = 1 - Math.pow(1 - u, 2), [x, z, h] = along(FLAG_P, e * pathLen(FLAG_P));
  const k = Math.min(1, Math.max(0, (flagship.t - FLAG_T) / 0.9)), turn = k * k * (3 - 2 * k); // then swing round to face the fleet
  return [x, z, u, h + Math.atan2(Math.sin(FLAG_FACE - h), Math.cos(FLAG_FACE - h)) * turn]; // the short way round
}

// ---------- unit barks (round 5, owner 2026-11-12 "theres no narraitve to it ... please follow as much as possible").
// Top Force tells most of its story in short white bubbles over units (video 0:07, 0:21, 0:34, 3:18 to 5:20, 7:03 to
// 7:08, 12:08, 13:10): one bubble over one unit for a couple of seconds, no pause. ----------
// Look review (round 5): every bubble carries the speaker's face at its left (Top Force 0:34 a sunglasses face on ours,
// 7:05 a scared face on the raider), raiders' bubbles get a red edge, and only one bubble shows at a time.
const barks = []; let barkN = 0, barkT = 0;
const FACE = { us: '😎', them: '😠' };
function bark(text, src = 'us', dur = 2.8, o = {}) {
  if (QA) return;
  const them = o.them ?? (src === 'them' || src === 'boss');
  barks.push({ id: ++barkN, text, src, dur, until: 0, giveUp: performance.now() + 8000, uid: null, them, face: o.face || FACE[them ? 'them' : 'us'], live: o.live });
}
// src 'us' / 'them' / 'boss': a unit on screen nearest the middle, followed while it lives; [x, z, y]; or a function.
// undefined = nobody on screen yet (wait), null = gone (drop the bubble)
// round 7: a sailor waiting in the queue square speaks (else the nearest boat's spot, else wait)
const queueVoice = () => { const c = S.crew && S.crew.find(o => o.st === 'q' && !(o.hold > 0)); if (c) return [c.x, c.z, 7]; const u = S.ships[0]; return u ? [u.x, u.z, 8] : undefined; };
function barkPos(b) {
  if (typeof b.src === 'function') return b.src();
  if (Array.isArray(b.src)) return b.src;
  const list = b.src === 'us' ? S.ships : S.enemies.filter(e => (e.kind === 'boss') === (b.src === 'boss'));
  const y = b.src === 'boss' ? 17 : 8;
  if (b.uid != null) { const u = list.find(x => x.id === b.uid); return u ? [u.x, u.z, y] : null; }
  const W = $('app').clientWidth, H = $('app').clientHeight; let best = 1e9, pick = null;
  for (const u of list) {
    const [sx, sy] = view.w2s(u.x, u.z, y);
    if (sx < 60 || sx > W - 60 || sy < 150 || sy > H - 180 || barks.some(o => o !== b && o.uid === u.id && o.src === b.src)) continue;
    const d = Math.hypot(sx - W / 2, sy - H * 0.45); if (d < best) { best = d; pick = u; }
  }
  if (!pick) return undefined;
  b.uid = pick.id; return [pick.x, pick.z, y];
}
function barksTick() {
  const now = performance.now(), dt = barkT ? Math.min(now - barkT, 200) : 0; barkT = now;
  // a tutorial bubble (or the sailor's "Over here!") speaks first: a bark waits, its give-up clock paused (walk8 037: two bubbles stacked)
  const guideUp = ['bub', 'castcall'].some(k => labels[k] && labels[k]._seen === frameNo);
  let on = barks.find(b => b.until && now <= b.until);
  const shown = []; // where each bubble on screen sits this frame, its tail included
  for (let i = 0; i < barks.length; i++) {
    const b = barks[i];
    // walk13 041: "What is this?!" queued behind a tutorial bubble came out after the boss had sunk; a line tied to a
    // moment (o.live) is dropped once that moment has passed
    if (b.live && !b.live()) { const el = labels['bark' + b.id]; if (el) { el.remove(); delete labels['bark' + b.id]; } if (on === b) on = null; barks.splice(i--, 1); continue; }
    if (!b.until && (on || guideUp)) { b.giveUp += dt; continue; }
    const over = b.until ? now > b.until : now > b.giveUp, p = over ? null : barkPos(b);
    if (p === undefined) continue;
    if (!p) { const el = labels['bark' + b.id]; if (el) { el.remove(); delete labels['bark' + b.id]; } if (on === b) on = null; barks.splice(i--, 1); continue; }
    // look review 5 (s4 041, mission 27): the camera moved to the empty outpost and the line hung at the screen's edge with
    // nobody under it; a bark whose speaker is off screen does not start, or hides until the speaker is back
    const [sx, sy] = view.w2s(p[0], p[1], p[2]), W = $('app').clientWidth, H = $('app').clientHeight;
    if (sx < 20 || sx > W - 20 || sy < 90 || sy > H - 120) continue;
    if (!b.until) { b.until = now + b.dur * 1000; on = b; }
    const el = label('bark' + b.id, 'bub bark' + (b.them ? ' them' : ''), `<i class="face">${b.face}</i><span>${rich(b.text)}</span>`);
    // R-300 round 7 seventh look (want pair 3:09): "I want to drive a Tank!" over the queue covered the tank and torpedo
    // counters' numbers and the table's count bubble (Top Force's sits over the open yard); a bubble that would cover a tag,
    // the table bubble or a counter number slides sideways (its tail still on the speaker) or hangs below the speaker's feet
    const hw = el.offsetWidth / 2, bh = el.offsetHeight, clampX = v => Math.max(hw + 6, Math.min(W - hw - 6, v));
    // (recL: on a crowded quay often no place is fully clear, and the bubble then stayed wherever it was, 27% of bubble
    // frames touching a number or tag; it now takes the place that covers least, numbers counting double)
    const fy = view.w2s(p[0], p[1], BASE.y)[1], blocks = tagBoxes.map(q => [q, 1]).concat(view.numBoxes().map(q => [q, 2]));
    const rect = c => c.below ? [c.x - hw, fy + 5, c.x + hw, fy + 14 + bh] : [c.x - hw, sy - 14 - bh, c.x + hw, sy - 5];
    const cover = c => {
      if (Math.abs(sx - c.x) > hw - 14) return Infinity; // the tail must stay on the bubble
      const r = rect(c); let v = 0;
      for (const [q, w] of blocks) { const ox = Math.min(r[2], q[2]) - Math.max(r[0], q[0]), oy = Math.min(r[3], q[3]) - Math.max(r[1], q[1]); if (ox > 0 && oy > 0) v += ox * oy * w; }
      return v;
    };
    if (b.at) b.at.x = clampX(sx + b.at.dx);
    const held = b.at ? cover(b.at) : Infinity;
    if (held > 0) { // keep the place it took while it stays clear (no flicker); else the first that covers least, above first,
      let best = null, bc = Infinity; // and only move for a clear gain so two near-equal places do not swap every frame
      for (const below of [false, true]) for (let k = 0; k * 12 <= hw - 14; k++) for (const s of k ? [1, -1] : [1]) {
        const c = { below, dx: s * k * 12, x: clampX(sx + s * k * 12) }, v = cover(c); if (v < bc) { bc = v; best = c; }
      }
      if (best && bc < held * 0.7 - 1) b.at = best;
      b.at = b.at || { below: false, dx: 0, x: clampX(sx) };
    }
    const x = b.at.x; el.classList.toggle('below', b.at.below);
    place(el, x, b.at.below ? fy : sy); el.style.setProperty('--tail', Math.max(14 - hw, Math.min(hw - 14, sx - x)) + 'px');
    el.style.visibility = guideUp ? 'hidden' : '';
    if (!guideUp) shown.push(rect(b.at));
  }
  // recN 0:15 to 0:17 and 3:07: on the crowded quay the officer's "Weapons are almost ready!" covered half the HQ tag, then
  // half the Gunboat tag, and the tank line touched the HQ tag, wherever the bubble went; the counter numbers on the canvas
  // cannot move, but a tag can: one the bubble still covers eases up or down clear of it (at most 30 px) and back after
  // (recQ 0:16: the Gunboat tag eased 20 px down off the officer's bubble onto the "30" counter number for 25 frames;
  // a sliding tag now stops 2 px short of any counter number in its way and takes the side that leaves least covered)
  const nums = view.numBoxes();
  const room = (q, d) => { let m = 30; for (const n of nums) if (n[0] < q[2] + 2 && n[2] > q[0] - 2) { if (d > 0 && n[1] >= q[3]) m = Math.min(m, n[1] - 2 - q[3]); if (d < 0 && n[3] <= q[1]) m = Math.min(m, q[1] - 2 - n[3]); } return Math.max(0, m); };
  for (const [t, q] of tagEls) {
    let dy = 0;
    for (const r of shown) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) {
      const dn = r[3] + 2 - q[1], up = r[1] - 2 - q[3]; let left = Infinity; dy = 0;
      // (recS 0:17: the officer walked on and his bubble needed more than 30 px; the tag gave up and eased back under it,
      // 96% covered; it now keeps the full 30 px and is left a sliver short)
      for (const d of [up, dn]) { const g = Math.sign(d) * Math.min(Math.abs(d), room(q, d)), l = Math.abs(d - g); if (l < left || (l === left && Math.abs(g) < Math.abs(dy))) { left = l; dy = g; } }
    }
    t._ny = (t._ny || 0) + (dy - (t._ny || 0)) * 0.35; if (Math.abs(t._ny) < 0.3) t._ny = 0;
    if (t._ny) t.style.top = (parseFloat(t.style.top) + t._ny) + 'px';
  }
}
// idle and battle barks by mission (Top Force 3:18 to 5:18, 7:47, 8:32, 11:21, 14:24; their mission numbers are read
// off the video, ours follow the same order)
const BARKS = {
  9: [['us', 'My muscles need a real gym.']], 12: [['us', 'Let them have a taste of this!']], // the destroyer wish has its own trigger (wantD)
  13: [['us', 'Tremble before my firepower!']], 14: [['us', 'Train for a thousand days, fight for one moment.']],
  15: [['them', 'Protect the outpost!'], ['us', 'Attack! Full speed ahead!']], 16: [['us', 'Easy. Leave it to me!']],
  19: [['us', 'Navy blue is the coolest style.']], 23: [['us', 'Train for a thousand days, fight for one moment.']],
  29: [['us', 'I\'ll be the brightest page in the book of legends.']], 39: [['us', 'I can take on *ten* at once!']],
  42: [['us', 'Train for a thousand days, fight for one moment.']],
};

// ---------- cold open (Top Force video 0:02 to 0:16, frames t0006, t0007, t0012, t0016): before any mission a small
// squad flees into the empty base with the enemy firing behind it, the officer shouts "Get inside the base!", the
// camera follows them in, the enemy stops at the edge and stays there until the first units are out. Ours: three
// gunboats run in along the raiders' own route and moor off the north quay; three raiders stop where raiders spawn. ----------
const CO_IN = [[108, -84], [88, -70], [66, -60], [46, -48], [28, -40]];  // round the reef island, its jetty and the rocks (checked with isWater)
const CO_MOOR = [[-5.5, -36.4], [4.7, -36.4], [14.9, -36.4]];  // between the two slips, clear of the launch lanes
const CO_HOLD = [[[140, -104], [84, -74]], [[146, -86], [94, -74]], [[136, -80], [116, -74], [96, -68], [76, -66]]];  // start behind the fleeing boats
const CO_V = 11, CO_GAP = 10.6;
let co = null;
const pathLen = P => P.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
function along(P, d) { // point and heading at distance d along a polyline; before the start it runs back along the first leg
  let i = 0;
  for (; i < P.length - 2; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (d <= l) break; d -= l; }
  const a = P[i], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), u = Math.min(d, l) / l;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(-(b[1] - a[1]), b[0] - a[0])];
}
const coD = (t, v, off, L) => { const d = v * t - off; return d < L - 8 ? d : L - 8 * Math.exp(-(d - L + 8) / 8); }; // glides into its berth
const coUs = i => along(co.us[i], coD(co.t, CO_V, i * CO_GAP, co.usL[i]));
function coBoats() {
  if (!co || QA) return [];
  const L = [];
  co.us.forEach((P, i) => { if (co.armed[i]) return; const [x, z, h] = coUs(i); L.push({ id: 'co-us' + i, kind: 'boat-gunboat', x, z, y: 0, s: 1, ry: h, bob: 1 }); });
  co.them.forEach((c, i) => { if (!c) return; const [x, z, h] = along(c.P, coD(Math.max(0, co.t - 0.5), 9, 0, c.L)); L.push({ id: 'co-them' + i, kind: 'boat-raider', x, z, y: 0, s: 1, ry: h, bob: 1 }); });
  return L;
}
function coldOpen() {
  const us = CO_MOOR.map(m => [...CO_IN, m]);
  co = { t: 0, us, usL: us.map(pathLen), armed: us.map(() => false), them: CO_HOLD.map(P => ({ P, L: pathLen(P) })), fire: 0.3, live: true, shells: [] };
  // round 7 (Top Force 0:16 to 0:22: the squad that ran in stands in the queue square): each boat's sailor hops onto the
  // north quay once it is moored and walks round to the queue; the boats wait at their berths for their armed crews
  G.crewMove(S, 0); S.berth = CO_MOOR.map(m => m[0]);
  S.crew.slice(0, 3).forEach((c, i) => { c.x = CO_MOOR[i][0]; c.z = -30.4; c.path = [[0.6, -29.8], [1, -2.6]]; c.hold = 8.6 + i * 0.7; c.hop = 1; c.hx = 0; c.hz = 1; });
  busy = true; camMode = 'talk'; $('app').classList.add('cold');
  const p = coUs(0); view.focusAt(p[0], p[1], 1.35, 0.5, true);
}
// round 6 (owner 22:26 "these boat are stuck?"): the three boats that fled in stayed moored off the north quay for the
// whole first stretch, the same model as our fighting gunboats, so they read as boats stuck against the quay. Top Force
// 0:22 to 0:36: the squad that ran in is told "Weapons are almost ready!" and walks out armed as the first riflemen.
// Ours: each of the first gunboats the shed sends out IS one of the moored boats (east one first, nearest the front):
// the new boat starts at its berth with its heading and full size, and the moored copy goes.
function coArm(ev) {
  for (const e of ev) {
    if (e.e !== 'launch' || e.key !== 'gunboat') continue;
    let i = co.armed.lastIndexOf(false); if (i < 0) return;
    const u = S.ships.find(o => o.id === e.id); if (!u) continue;
    const P = co.us[i], a = P[P.length - 2], b = P[P.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    [u.x, u.z] = coUs(i); u.vx = (b[0] - a[0]) / l; u.vz = (b[1] - a[1]) / l; u.adopt = 1; co.armed[i] = true;
  }
  if (co.armed.every(Boolean)) S.berth = null;
}
function coTick(dt) {
  if (!co) return;
  if (co.live) {
    co.t += dt;
    const lead = coUs(0);
    if (co.t < 7.2) view.focusAt(lead[0], lead[1], 1.35, 0.5);
    else if (!co.home) { co.home = 1; const c = ZONE_CAM.base; view.focusAt(c[0], c[1], c[2], 0.56); }
    if (!co.shout && co.t > 2.4) { co.shout = 1; bark('Get inside the *harbor*!', () => (co ? [...coUs(0).slice(0, 2), 8] : null), 3); }
    co.fire -= dt;
    if (co.fire <= 0 && co.t < 8) { // the raiders' shots fall short around them
      co.fire = 0.2 + Math.random() * 0.2;
      const p = coUs(Math.floor(Math.random() * co.us.length)), a = Math.random() * 6.28, r = 4 + Math.random() * 5;
      // look review (round 5): the chase read as calm; each shot now flashes at a raider's gun and booms (Top Force 0:07 enemy fire)
      // look review 2: a still frame missed the 0.1 s flash; the shell now flies (orange, with a glowing trail) and splashes where it lands
      const c = co.them[Math.floor(Math.random() * co.them.length)];
      if (c) { const [x, z] = along(c.P, coD(Math.max(0, co.t - 0.5), 9, 0, c.L)); view.flash(x, 3, z, 4.2, [1, 0.69, 0.53]); sfx.shot(false);
        co.shells.push({ kind: 'shell2', side: 'them', tracer: 1, x, z, tx: p[0] + Math.cos(a) * r, tz: p[1] + Math.sin(a) * r, speed: 30 }); }
    }
    for (let i = co.shells.length - 1; i >= 0; i--) { const s = co.shells[i], dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz), st = s.speed * dt;
      if (d <= st) { co.shells.splice(i, 1); view.splash(s.tx, s.tz, 1.2); } else { s.x += dx / d * st; s.z += dz / d * st; } }
    if (co.t > 10.5) { co.live = false; busy = false; $('app').classList.remove('cold'); focusZone(); }
  }
  // one held raider leaves each time a real raider appears at a spawn point, so the hand-over is not seen
  const n = S.m ? S.m.spawned : 0;
  co.them.forEach((c, i) => { if (c && n > i) co.them[i] = null; });
  if (!co.live && S.hq >= 2 && co.them.every(c => !c)) co = null;
}

// round 6 (R-300 4, after_0738, after_0761, after_0845): the Repair and Torpedo tags sat on boats parked on the pad and the slip;
// a level tag over a boat fades to a third so the boat shows through, and comes back when the boat moves on
let tagPpu = 0;
// R-300 round 7 (pairs tanks, mech, robot39): the tank counter's number sat half under the table bubble and the torpedo counter's on the
// Torpedo tag; the tags and the bubble placed this frame are listed here and the counter numbers step around them (crewview.js)
const tagBoxes = [], tagEls = []; // tagEls: each tag element with its box, so a tag a bubble still covers can make room (barksTick)
// tagRef: the camera target and where it sat on screen when the boxes were taken; the next frame's numbers are drawn
// after the camera moves, so view.js shifts the boxes by how far that point moved (recU 2:51: a 12 px-a-frame pan left
// a counter number stepping clear of where the Gunboat tag had been, half under where it now was); a second point 30 east
// gives the zoom and turn too (R-300 ninth look, recX 0:29: the camera zooming back in from sea left "435" under the Gunboat tag)
let tagRef = null;
// recT 0:29: a level tag at the screen's edge was slid inside by hudDodge after its box was taken at the anchor, so the
// counter numbers and bubbles kept off a box up to 90 px away from the tag ("Lv.66" over a counter's number for 2 s);
// the same slide is done here, before the box is taken (hudDodge keeps it as a backstop). Returns the tag's x.
const boxOf = (el, x, y, below = 0) => {
  // a tag game.css hides (#app.wide level tags in the wide harbor shot, #app.cold during a talk, a panel open) takes no box: the
  // tank counter's number stepped around tags no one could see and waited for want of a spot (recZ 2:56 "HARBOR EXPANDED", 0:34,
  // 1:44 and 2:29 talks)
  if (el._tin) { el.classList.remove('tagin'); el._tin = false; }
  // and stays hidden (.tagin) the frame it is hidden in: the ninth recZ (30.1 s talk, 132 s look) caught the Gunboat tag hidden here,
  // shown later in the same frame when the talk or panel ended, with no box, over "435" for a frame
  if (getComputedStyle(el).visibility === 'hidden') { el.classList.add('tagin'); el._tin = true; return x; }
  if (!el._sz) el._sz = [el.offsetWidth, el.offsetHeight]; const [w, h] = el._sz, W = view.size[0];
  let d = 0;
  if ((el.classList.contains('lvl') || el === labels.enemies) && x >= 2 && x <= W - 2) { d = Math.max(0, 4 - (x - w / 2)) - Math.max(0, x + w / 2 - (W - 4)); if (d) { x += d; el.style.left = x + 'px'; } }
  // recZ 0:29.7 and 2:12.7: a tag showing for the first time (the end of a talk) or snapping in from past the screen's edge (its
  // anchor coming on screen slides it up to 90 px at once, camera back from sea) had no box yet where it now is for the numbers
  // drawn before it, so "435" sat under it for a frame or two; such a tag stays hidden (game.css .tagin) for that frame and shows
  // once the numbers have its box
  // (40: a tag held at the edge in a fast pan shifts its slide by the pan's speed each frame and must not blink)
  if (el._bx !== frameNo - 1 || Math.abs(d - (el._sd || 0)) > 40) { el.classList.add('tagin'); el._tin = true; }
  el._bx = frameNo; el._sd = d;
  const q = [x - w / 2, y - h, x + w / 2, y + below]; tagBoxes.push(q); tagEls.push([el, q]); return x;
};
function overBoats(el, x, y) {
  if (!el._sz) el._sz = [el.offsetWidth, el.offsetHeight];
  const [w, h] = el._sz, x0 = x - w / 2, x1 = x + w / 2, y0 = y - h;
  let hit = false;
  for (const list of [S.ships, S.enemies]) { for (const b of list) {
    if (b.hp <= 0) continue;
    const [bx, by] = view.w2s(b.x, b.z, 1.5), r = (b.len || 8) * 0.45 * tagPpu;
    const cx = Math.max(x0, Math.min(bx, x1)), cy = Math.max(y0, Math.min(by, y));
    if ((bx - cx) * (bx - cx) + (by - cy) * (by - cy) < r * r) { hit = true; break; }
  } if (hit) break; }
  el.classList.toggle('over', hit);
}
let newTagsUntil = 0;
function labelsTick() {
  frameNo++; tagBoxes.length = 0; tagEls.length = 0; tagRef = [view.cam.tx, view.cam.tz, ...view.w2s(view.cam.tx, view.cam.tz, 0), ...view.w2s(view.cam.tx + 30, view.cam.tz, 0)];
  // look review 2 (expand): the new wharf and pier carry a NEW tag for a few seconds, so the eye finds what was built
  if (newTagsUntil > performance.now() && !QA) for (const [k, [x0, x1, z0, z1]] of [['wharf', WHARF], ['pier', PIER]]) { const el = label('new-' + k, 'newtag', 'NEW'); const [sx, sy] = view.w2s((x0 + x1) / 2, (z0 + z1) / 2, BASE.y + 3); place(el, sx, sy); }
  const k = zoomK();
  tagPpu = view.ppu(0, 0, 1.5); // pixels per world unit at the harbor centre, for the tag-over-boat test
  // the wide harbor shot drops the level tags, which would pile up at that zoom (Top Force 14:13 shows the base bare)
  $('app').classList.toggle('wide', camMode === 'wide');
  // shed and HQ level badges
  for (const key of ['gunboat', 'torpedo', 'destroyer', 'repair']) {
    const s = S.sheds[key];
    if (s.built && wrapped(key)) continue;
    if (key === 'gunboat' && S.flags.gift0 === 'shown') continue; // look review 2 (gift0): the "Craft boats" bubble sat on this tag and left only "Lv.1"
    // look review 12 (cast, des, 024): a tag at the very bottom showed half a "Build 120" under the mission bar, cut by the
    // screen edge; tags in the bottom band stay hidden until the camera brings them up, unless the hand points at one
    const low = (y, h, id) => y > view.size[1] - h && !(guide && guide.target && guide.target.el === id);
    if (s.built) {
      const [x, y] = spotScreen(key); if (low(y, 60, 'lv-' + key)) continue;
      const st = G.shedStars(s.lv);
      const el = label('lv-' + key, 'wl lvl', `Lv.${s.lv}${st ? ` <span class="st">${'&#9733;'.repeat(st)}</span>` : ''}`);
      place(el, x, y); overBoats(el, boxOf(el, x, y), y);
    } else if (openNow(key) && S.stage < 3) { // a plot the new HQ opens waits for the celebration (L26)
      const p = SPOT[key], [x, y] = view.w2s(p[0], p[1], key === 'repair' ? 0.5 : BASE.y + 0.2);
      if (low(y, 90, 'plot-' + key)) continue;
      const d = G.SHEDS[key], ok = S.gold >= d.buildCost && S.hq >= d.needHq;
      const el = label('plot-' + key, 'plot', `<i class="pin"><img src="${PIN[key]}" alt=""></i><b class="${ok ? '' : 'no'}">Build${d.buildCost ? ' ' + fmt(d.buildCost) : ''}</b>`);
      el.id = 'plot-' + key;
      if (!el.onclick) el.onclick = () => { if (!G.build(S, key)) toast('Not enough gold'); };
      place(el, x, y);
    }
  }
  if (hqWait) {
    const t = Math.max(0, Math.ceil(hqWait.t)), el = label('hqwait', 'hqwait', `<i></i>00:0${t}`);
    const [x, y] = spotScreen('hq'); place(el, x, y);
  } else {
    // P2E notes: once stars start coming in, the HQ tag counts them toward the next HQ level (Top Force 015)
    const rq = G.hqReq(S), ts = G.totalStars(S), stc = rq && ts > 0 && hqHold == null && !hqWait ? `<span class="hst">&#9733;${Math.min(ts, rq.stars)}/${rq.stars}</span>` : '';
    const el = label('lv-hq', 'wl lvl', `HQ Lv.${hqShown()}${stc}${G.canHq(S) && hqHold == null ? '<i class="bang">!</i>' : ''}`);
    // R-300 round 7 seventh look recheck (recM 0:16): "Weapons are almost ready!" hung under its sailor right over this tag,
    // which was never in the boxes bubbles and numbers keep off
    const [x, y] = spotScreen('hq'); place(el, x, y); boxOf(el, x, y);
  }
  // round 7: the arming table's white bubble, the weapon waiting there and how many (Top Force 0:26 to 0:44, refs r7 pick_a, pick_b)
  if (S.arm && S.phase !== 'fight' && !QA) {
    const tt = view.tableTop(), [x, y] = view.w2s(tt[0], tt[1], tt[2]), k = S.arm.table.length ? S.arm.table[0].key : 'gunboat';
    if (y < view.size[1] - 40) { const el = label('armt', 'wl armt', `<img src="${WEAPON_PIN[k]}" alt=""><b>${S.arm.table.length}</b>`); place(el, x, y); boxOf(el, x, y, 5); }
  }
  // first gift on the quay: "Craft boats to fight the raiders" (Top Force 006)
  if (S.flags.gift0 === 'shown' && !QA) {
    hitAt('gift0', 'gift0w', GIFT_AT[0], GIFT_AT[1], BASE.y + 2.6, 7, openGift0);
  }
  // Bram stranded by the outpost, HELP (Top Force 025), until he joins after the outpost falls
  if (T().outpost && !T().victor && S.zone === 2 && !QA) {
    const saved = !!(S.chest && S.chest.zone === 2 && S.chest.taken);
    // playtest L14: once the outpost falls he waves instead; P2E-02 hid it while the sailor called, look review 2 (Top Force 3:00 keeps
    // Victor's HELP up through the soldier's rescue): it stays, smaller and dimmer, so the sailor's call still leads
    if (!saved && S.phase !== 'wreck') burstAt('bram', BRAM_AT[0] + 1.5, BRAM_AT[1], 12.6, true, S.flags.castaway === 'shown');
    if (!bramRide) { const el = label('bram-name', 'wl lvl keep', 'Bram'), [x, y] = view.w2s(BRAM_AT[0], BRAM_AT[1], 0); place(el, x, y + 30); boxOf(el, x, y + 30); } // P2E-03: he read as scenery without a name (recM 3:55: a boat's "Attack!" covered it; now in the boxes bubbles keep off)
  }
  // look review 5 (flag): Top Force 12:21 brings the boss in with its power over a red bar; the flagship carries Ironjaw's name
  // and the enemy power the fight shows, once the BOSS INCOMING strip has gone, until his lines are over
  // look review 8 (flag): the plate came at 2.4 s while the strip (0.8 s to 3.2 s) still named him; it waits for the strip to go,
  // like the mission-20 bar, and sits a little higher so the guns do not poke through it
  // look review 9 (flag): at 18 the red bar still rested on the rear turret and its barrels poked past the plate; 22 clears them
  if (flagship && busy && S.phase === 'fightReady' && flagship.t > 2.4 && $('bwarn').classList.contains('hidden') && !QA) {
    const [fx, fz] = flagAt(), el = label('flag-name', 'wlab keep fl', `<span class="cap">IRONJAW <b>${fmt(G.power(S) * 1.15)}</b></span><div class="bar"><i></i></div>`);
    // round 6: the plate stays on the screen even when the hull sits near the edge (it was cut to "JAW 149.7K")
    // round 7: on the 2.4x robot it rests on its hat (it may cover the thin flag, never the head) and never goes up under the
    // top-left bar (over the flag's tip it sat behind the bar, unseen)
    const [sx, sy] = view.w2s(fx, fz, MOTHER_TOP * FLAG_DRAW + 1), hw = (el.offsetWidth || 128) / 2 + 6, tl = $('tl'), top = tl.offsetTop + tl.offsetHeight + 4 + (el.offsetHeight || 34);
    place(el, Math.min(Math.max(sx, hw), view.size[0] - hw), Math.max(sy, top));
  }
  // a castaway sailor on a raft calls HELP; tap to bring him in (Top Force 059, 080)
  if (S.flags.castaway === 'shown' && !QA) {
    hitAt('cast', 'castw', CAST_AT[0], CAST_AT[1], 3.5, 8, rescueSailor);
    if (!(guide && guide.bub && !guide.hid && guide.bub.w === CAST_BUB)) { const el = label('castcall', 'bub bark', '<i class="face">😰</i><span>Over here!</span>'); const [sx, sy] = view.w2s(CAST_AT[0], CAST_AT[1], 10.5); place(el, sx, sy); }
  }
  // Skye races in on her jet ski before the boss (Top Force 150)
  // (drawn in 3D: storyProps)
  // speech bubble from the guide or a short quip
  const bub = (guide && !guide.hid && guide.bub) || quip;
  if (bub && !QA) {
    const p = bub.spot ? (q => [q[0], q[1] - 24])(spotScreen(bub.spot)) /* P2E notes: sits above the tag, not on it */ : bub.el ? elEdge(bub.el, bub.below) : bub.w ? view.w2s(bub.w[0], bub.w[1], bub.w[2] || 8) : null;
    if (p) {
      // keep the bubble on screen; the tail still points at the speaker
      // look review 2: a character's line carries its face like the barks (the sailor's "Over here!", Bram's "Ready for duty, sir!")
      const el = label('bub', 'bub keep', bub.face ? `<i class="face">${bub.face}</i><span>${rich(bub.text)}</span>` : rich(bub.text)); el.classList.toggle('below', !!bub.below); el.classList.toggle('hasface', !!bub.face);
      const W = $('app').clientWidth, hw = el.offsetWidth / 2;
      let x = Math.max(hw + 6, Math.min(W - hw - 6, p[0])), y = p[1];
      // look review 3 (m03 010, cast): the hand hanging from above lay over the bubble's last word ("Shed", "me"); the bubble
      // steps left of the hand, else right, else up above it, and its tail still points at the target
      const f = $('finger'), h = el.offsetHeight;
      if (f && !f.classList.contains('hidden') && !$('app').classList.contains('talking')) {
        const L = parseFloat(f.style.left), T = parseFloat(f.style.top), dl = f.classList.contains('dl'), dn = f.classList.contains('down');
        const hb = dn ? (dl ? [L - 44, T - 62, L + 12, T + 4] : [L - 12, T - 62, L + 44, T + 4]) : [L - 12, T - 4, L + 44, T + 62];
        const bb = (bx, by) => (bub.below ? [bx - hw, by + 14, bx + hw, by + 14 + h] : [bx - hw, by - 14 - h, bx + hw, by - 14]);
        const hit = b => b[0] < hb[2] && b[2] > hb[0] && b[1] < hb[3] && b[3] > hb[1];
        if (hit(bb(x, y))) {
          if (hb[0] - 4 - 2 * hw >= 6) x = hb[0] - 4 - hw;
          else if (hb[2] + 4 + 2 * hw <= W - 6) x = hb[2] + 4 + hw;
          else y = bub.below ? Math.max(y, hb[3] - 10) : Math.min(y, hb[1] + 10);
        }
      }
      place(el, x, y);
      el.style.setProperty('--tail', Math.max(14 - hw, Math.min(hw - 14, p[0] - x)) + 'px');
    }
  }
  // enemies left on the active outpost (Top Force 0:40 "Enemies 43"); not on mission 20, whose escorts keep coming until
  // the flagship sinks (its own bar on the HUD is the count there)
  if (S.m && S.phase === 'battle' && S.m.n !== 20 && (QA || S.flags.gift0 === 'taken')) {
    const z = ZONES[S.zone], left = Math.max(0, S.m.total - S.m.killed);
    const el = label('enemies', 'wlab', `<span class="cap">Enemies ${left}</span><div class="bar"><i style="right:${(1 - left / S.m.total) * 100}%"></i></div>`);
    // round 6: at the gate the counter hangs over the quay corner the raiders are coming at (Top Force 0:40)
    // round 6 test recording: at [24,-24] height 8 the counter covered the boats on the quay; Top Force 0:41 keeps it on the fence
    // R-300 round 7 fourth look check (recK39): the 3.8x mission 39 robot stops under this bar and its red hp number sat
    // half under it; the bar's box joins the tag boxes, so the hp number (view.js) and the counter numbers step clear of it
    const [x, y] = S.m.gate ? view.w2s(GATE.label[0], GATE.label[1], 3) : view.w2s(z.at[0], z.at[1], 15); place(el, x, y); boxOf(el, x, y);
  }
  if (loot && !loot.taken && !QA) hitAt('loot', 'lootw', loot.x, loot.z, 2.9, 7, () => loot && loot.open && loot.open());
  // chest on a beaten outpost
  if (S.chest && !S.chest.taken && !QA) {
    const c = chestAt(S.chest.zone); hitAt('chest', 'chestw', c[0], c[1], c[2] + 2.2, 7, openChest);
  }
  // gift box beside the sheds (Top Force 019: a gift falls by the factory, opens on tap)
  if (S.flags.gift === 'shown' && !QA) {
    hitAt('gift', 'giftw', GIFT_AT[0], GIFT_AT[1], BASE.y + 2.6, 7, openGift);
  }
  // FIGHT 40 on the raft camp
  if (S.phase === 'fightReady' && !busy && !isTalking()) { // P2L-06: not during Ironjaw's arrival or a line
    const el = label('fight', '', '<b>FIGHT</b><span>Mission 40</span>');
    el.id = 'fightbtn'; if (!el.onclick) el.onclick = () => doFight();
    const z = ZONES[3], [x, y] = view.w2s(z.at[0], z.at[1], 10); place(el, x, y);
  }
  barksTick();
  for (const id in labels) if (labels[id]._seen !== frameNo) labels[id].style.display = 'none';
  hudDodge();
}
// P2E-06: from HQ Lv.2 the top-left stack is taller; a map tag (Enemies bar, shed tags, HELP, names) that runs under any
// top HUD box hides instead of colliding with it (Top Force t0237 keeps the HUD band clear). Read after all the writes: one layout.
// Look review (round 5): the bottom HUD (Captains, Fleet, task bar, Upgrades) counts too ("Torpedo Lv.22" sat under the task bar).
const DODGE = ['tl', 'mission', 'incoming', 'zboss', 'b-gear', 'b-heroes', 'b-fleet', 'quest', 'b-upg'];
function hudDodge() {
  const rs = [], ar = $('app').getBoundingClientRect();
  // round 7: a HUD part the talk hides (#app.talking #incoming, visibility hidden) still had its box, and hid the 2.4x
  // robot's IRONJAW plate under an empty corner through all of Ironjaw's lines
  for (const id of DODGE) { const e = $(id); if (!e || e.classList.contains('hidden') || getComputedStyle(e).visibility === 'hidden') continue; const r = e.getBoundingClientRect(); if (r.width && r.height) rs.push([r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]); }
  for (const id in labels) {
    const el = labels[id]; if (el.style.display === 'none' || !/(^| )(wl|wlab|burst)( |$)/.test(el.className)) continue;
    let r = el.getBoundingClientRect();
    // a shed name tag near the screen edge slides back inside instead of being cut off (base camera, Gunboat at the left)
    // look review (round 5): a tag whose shed is off screen hides instead of sliding in over open sea (Repair, Destroyer tags at sea)
    let off = false;
    // look review 9 (boss20): the outpost's Enemies bar was cut at the left edge too; it slides in the same way
    if (el.classList.contains('lvl') || id === 'enemies') {
      const ax = parseFloat(el.style.left) + ar.left; off = ax < ar.left + 2 || ax > ar.right - 2;
      const d = Math.max(0, ar.left + 4 - r.left) - Math.max(0, r.right - (ar.right - 4)); if (d && !off) { el.style.left = parseFloat(el.style.left) + d + 'px'; r = el.getBoundingClientRect(); const te = tagEls.find(t => t[0] === el); if (te) { te[1][0] += d; te[1][2] += d; } }
    }
    const hit = off || rs.some(h => r.left < h[2] && r.right > h[0] && r.top < h[3] && r.bottom > h[1]);
    if (el._uh !== hit) { el._uh = hit; el.classList.toggle('underhud', hit); }
  }
}

// taps on the map: sheds open their card, the HQ opens its panel, empty water closes them
function onTap(x, y) {
  let best = null, bd = 46 * Math.max(1, zoomK());
  for (const key of ['gunboat', 'torpedo', 'destroyer', 'repair', 'hq']) {
    if (key !== 'hq' && !S.sheds[key].built) continue;
    const p = SPOT[key], [sx, sy] = view.w2s(p[0], p[1], p[2] * 0.5);
    const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = key; }
  }
  if (!best) { closeCard(); return; }
  if (best === 'hq') openHq(); else if (cardKey === best) closeCard(); else openCard(best);
}

// ---------- what the 3D harbor shows (stage, buildings, plots, zone states) ----------
function sceneState() {
  const big = S.stage >= 3, wreck = S.zonePhase === 'wreck';
  const plot = k => !S.sheds[k].built && openNow(k) && !big;
  return {
    stage: S.stage, hq: hqShown(),
    built: { gunboat: S.sheds.gunboat.built && !wrapped('gunboat'), torpedo: S.sheds.torpedo.built && !wrapped('torpedo'), destroyer: S.sheds.destroyer.built && !wrapped('destroyer'), repair: S.sheds.repair.built && !wrapped('repair') },
    plots: { gunboat: plot('gunboat') || wrapped('gunboat'), torpedo: plot('torpedo') || wrapped('torpedo'), destroyer: plot('destroyer') || wrapped('destroyer'), repair: plot('repair') || wrapped('repair') },
    zone2: big || S.zone > 2 ? 'ours' : wreck ? 'wreck' : 'active',
    zone3: big || S.zone > 3 ? 'ours' : S.zone < 3 ? 'fog' : wreck ? 'wreck' : 'active',
    zone4: S.zone >= 4 ? 'active' : 'fog',
    east: S.mission >= 40, // the armada's water east of the raft camp, open from mission 40 (see view.js sea fog)
  };
}
// ---------- camera (Top Force: close on the fight while missions run, the harbor while you upgrade, pulled back only
// for HQ upgrades and the harbor growing). camMode: front | base | talk | wide.
let camMode = 'front', camHold = 0;
const frontCam = () => ZONE_CAM[S.stage >= 3 ? 4 : S.zone] || ZONE_CAM[2];
const atHome = () => !QA && !T().outpost;
// where our boats near a spot are, on average (boats still on the way out from the harbor are left out)
const fleetMid = (x, z) => { let sx = 0, sz = 0, n = 0; for (const b of S.ships) if (Math.hypot(b.x - x, b.z - z) < 70) { sx += b.x; sz += b.z; n++; } return n ? [sx / n, sz / n] : null; };
function focusZone(instant) {
  camMode = 'front';
  // look review 12 (boss20-seq 3): back from the look at the mission 20 flagship, the zone view left it and the fight in the
  // top-right corner with two of our boats cut by the edge; while it lives the camera sits halfway between it and our
  // boats (Top Force 5:22: the boss mid-screen, the squad beside it)
  const b = S.zone === 2 && S.enemies.find(e => e.kind === 'boss' && e.hp > 0), f = b && fleetMid(b.x, b.z);
  if (atHome()) { const c = ZONE_CAM.base; view.focusAt(c[0], c[1], c[2], 0.62, instant); }
  else if (f) view.focusAt((b.x + f[0]) / 2, (b.z + f[1]) / 2, ZONE_CAM[2][2], 0.5, instant);
  else { const c = frontCam(); view.focus(c[0], c[1], c[2], instant); }
  homeIcon();
}
function focusBase(hold) { camMode = 'base'; camHold = hold || 2.5; const c = ZONE_CAM.base; view.focusAt(c[0], c[1], c[2], 0.56); homeIcon(); }
function focusWide() {
  camMode = 'wide'; const c = S.stage >= 3 ? ZONE_CAM.wide3 : ZONE_CAM.wide;
  // round 6 (R-300, after_0540): an HQ upgrade during a fight left the fight and its Enemies bar cut by the right edge; with
  // raiders out the shot moves a quarter of the way toward the zone's front (the base stays whole)
  const f = S.stage < 3 && S.enemies.some(e => e.hp > 0) ? frontCam() : null;
  view.focus(f ? c[0] + (f[0] - c[0]) / 4 : c[0], f ? c[1] + (f[1] - c[1]) / 4 : c[1], c[2]);
}
// back to the fight once nothing on the harbor needs the player (no card, panel, finger, or recent drag)
let lastTouch = -1e9; addEventListener('pointerdown', () => { lastTouch = performance.now(); }, true);
function camTick(dt) {
  if (camMode !== 'base' || busy || isTalking() || S.phase === 'fight') return;
  // playtest E27/L04: 4 s without a drag sent the camera away mid-look; taps count as input, the harbor stays 8 s
  // after the last touch, and never leaves while a gift waits or a hint points at the harbor
  const idle = performance.now() - Math.max(view.lastInput, lastTouch), gift = S.flags.gift0 === 'shown' || S.flags.gift === 'shown';
  if (cardKey || hqOpen || gift || (guide && guide.base) || idle < 8000) { camHold = Math.max(camHold, 2.5); return; }
  camHold -= dt; if (camHold <= 0) focusZone();
}
// bottom-left button: harbor <-> fight (Top Force's base button)
function homeIcon() { show('b-fleet', !atHome()); const im = $('b-fleet').firstElementChild, src = camMode === 'base' ? 'img/gunboat-a.png' : 'img/ic-home.png'; if (im.getAttribute('src') !== src) im.setAttribute('src', src); }
// where a dialogue line looks: the thing being talked about sits in the upper part of the screen, above the box
// round 6 (seventh R-300 review, size): talk lines zoomed to 1.25 to 2.4, so a unit under a talk was 10.3% of the screen
// (median, up to 23%) against Top Force's 7.7% (up to 10.4%, the same as its play camera): Top Force pans to the speaker
// and keeps its play zoom; these keep the zone camera's zoom (base 1.0, zones 0.9 to 0.98)
const TZ = ZONE_CAM.base[2];
const LOOK = {
  base: () => [0, -2, TZ], gunboat: () => [...SHED_AT.W1, TZ], torpedo: () => [...SHED_AT.S1, TZ], destroyer: () => [...SHED_AT.W2, TZ],
  repair: () => [...REPAIR_AT, TZ], hq: () => [...HQ_AT, TZ],
  z2: () => [ZONES[2].at[0] - 6, ZONES[2].at[1] + 10, ZONE_CAM[2][2]],
  flag: () => (flagship ? [...flagAt().slice(0, 2), ZONE_CAM[3][2]] : LOOK.z3()),
  boss: () => { const b = S.enemies.find(e => e.kind === 'boss'); return b ? [b.x, b.z, ZONE_CAM[2][2]] : LOOK.z2(); }, z3: () => [ZONES[3].at[0] - 12, ZONES[3].at[1], ZONE_CAM[3][2]], z4: () => [ZONES[4].at[0] - 10, ZONES[4].at[1] + 8, ZONE_CAM[4][2]],
  // look review 13 (real-flow 6): with z4 the anchorage sat top-centre and Iris's pointing hand aimed at the outpost just taken
  // in the bottom-right corner; for her report the camera slides so the ringed anchorage sits up-right of her hand and the taken
  // outpost leaves the frame (Top Force 14:22: the report holds on the new target alone)
  // look review 14: at +24/-47 the ring's right side touched the screen edge and its pulse was cut; about 40 px further left
  // (the report's pulse ring is also smaller, see the ping in the expansion)
  // round 6: at the zone zoom (0.98, was 1.3) the offset grows by 1.3 / 0.98 so the anchorage keeps its spot up-right of her hand
  z4r: () => [ZONES[4].at[0] + 29.5 * 1.33, ZONES[4].at[1] - 41.5 * 1.33, ZONE_CAM[4][2]],
  front: () => { const c = frontCam(); return [c[0], c[1], c[2]]; },
  // P2E-03: on the captive and his guard (Top Force 2:21); seventh R-300 review: at 2.4 Bram was 11% of the screen, about
  // 1.8 times Top Force's captive (its story shots keep the play scale, 7:08 is about 1.2 times it), so 1.1
  bram: () => [BRAM_AT[0] + 2, BRAM_AT[1] + 3, 1.1],
  // round 6 (seventh R-300 review, quantity): over the mission-40 talk the camera panned between the flagship and our line,
  // so 10 of our boats stayed on screen against Top Force's 2 (1 to 7) while 21 reds filled it; Top Force holds one shot on
  // the enemy horde with its own squads at the bottom-left edge (video 12:06 to 12:54), so one held shot centred past the
  // armada's middle, our line off the left and bottom but its front 3 boats, the flagship and its plate below the top bar
  // R-300 round 7 second look: Ironjaw's robot now wades in 2.4x (FLAG_DRAW) and stood cut by the left edge with its head
  // under the top bar; the shot moves 8 west and 6 north so it stands whole at the top left of the horde (Top Force 13:12
  // keeps its giant whole over its reds, refs r7 robot_a)
  armada: () => [142, -10, ZONE_CAM[3][2], 0.3],
};
function lookLine(L) {
  if (!L.at || !LOOK[L.at]) return;
  const [x, z, zoom, fy = 0.3] = LOOK[L.at](); camMode = 'talk'; view.focusAt(x, z, zoom, fy);
}

// ---------- tutorial script ----------
let saying = Promise.resolve();
function say(lines) {
  saying = saying.then(() => { S.paused = true; closeCard(); return talk(lines, { onLine: lookLine }); }).then(() => { S.paused = false; if (camMode === 'talk') focusZone(); });
  return saying;
}
const T = () => S.flags.tut;

async function openChest() {
  if (busy || !S.chest || S.chest.taken) return;
  busy = true; finger(null); guide = null;
  const c = S.chest; G.collectChest(S);
  // r5 juice (D18): the counter holds the chest gold until, 500 ms after Collect, eight coins fly to it from the chest
  const cg = c.gold || 0; if (!QA && cg > 0) { flyGold += cg; flyAt = performance.now() + 6e4; }
  const cm = c.gems || 0; if (!QA && cm > 0) { flyGem += cm; flyGemAt = performance.now() + 6e4; }
  await reward('img/chest-open.png', [['img/coin.png', '+' + fmt(c.gold)], ['img/gem.png', '+' + c.gems]]);
  if (!QA && cg > 0) setTimeout(() => {
    flyAt = performance.now(); const a = $('app').getBoundingClientRect();
    J.flyIcons('img/coin.png', { x: a.width / 2, y: a.height * 0.46 }, 'p-gold', 8, { size: 30, onEach: i => { flyGold = Math.max(0, flyGold - cg / 8); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i); } });
  }, 500);
  if (!QA && cm > 0) setTimeout(() => {
    flyGemAt = performance.now(); const a = $('app').getBoundingClientRect();
    J.flyIcons('img/gem.png', { x: a.width / 2, y: a.height * 0.46 }, 'p-gem', 6, { size: 26, onEach: () => { flyGem = Math.max(0, flyGem - cm / 6); flyGemAt = performance.now(); J.bump('p-gem'); } });
  }, 650);
  if (!QA && cg > 0) await wait(2000); // P2E: the coins land on the counter before anyone speaks (they fly 0.5 s to 1.8 s after Collect)
  if (c.zone === 2) {
    await say([
      { who: 'Commander', at: 'bram', text: 'Hey, buddy! Glad you\'re okay. What happened?' },
      { who: 'Bram', at: 'bram', text: '[Ironjaw\'s raiders] ambushed us. My crew got scattered in the fight, and I was captured.' },
      { who: 'Bram', at: 'bram', text: 'There\'s still a [raider camp] to the east. Their main fleet is on the way. We can\'t let them take the bay!' },
      { who: 'Commander', at: 'bram', text: 'Please, join us. We have to sink that camp before [Ironjaw\'s armada] arrives!' },
    ]);
    // a gunboat comes for him; he jumps aboard and answers on the way back to the harbor (Top Force 6:58)
    // the rock sits low on screen so the JOINED call-out (upper third) never covers the jump or his line
    // look review 7 (ride): at 1.6 Bram was about 10 px tall and his empty rock, half behind his line, read as smoke; closer
    // seventh R-300 review (size): 2.2 made him 2 times Top Force's story scale (its talk at side-by-side 6:51 keeps the play camera); 1.1
    camMode = 'talk'; view.focusAt(BRAM_AT[0] - 7, BRAM_AT[1] + 3, 1.1, 0.6);
    bramRide = { t: 0 }; await wait(RIDE_ON * 1000);
    J.callout('BRAM JOINED!<small>NEW CAPTAIN</small>', 'green', 1500); if (!QA) { sfx.fanfare(); buzz([15, 30, 15]); }
    await wait(350); quip = { ride: 1, w: [BRAM_AT[0], BRAM_AT[1], 9], text: 'Ready for duty, sir!', face: '😁' }; // the salute face (U+1FAE1) drew cut in half in Chrome, so a plain grin
    await wait(2400); quip = null;
    T().victor = 1;
    // Top Force 7:02 to 7:08: the camera reaches the next camp and its raiders panic, one runs for backup
    incHold = true; G.recoverZone(S); focusZone();
    // spoken from two fixed spots on the camp's rafts: a raider picked as speaker was often sunk mid-line and took
    // the bubble with it (round-5 compare shots)
    const cz = ZONES[3].at, pA = [cz[0] - 9, cz[1] + 2, 7], pB = [cz[0] + 7, cz[1] - 4, 7];
    // P2E: one bubble at a time (they used to overlap for 0.7 s), and a raider boat really leaves for backup
    await wait(1600); bark('Our front line is broken! They\'re attacking!', pA, 1.9, { them: true, face: '😨' });
    await wait(2000); bark('Keep fighting! I\'ll go get backup!', pB, 1.9, { them: true });
    await wait(900); runner = { t: 0, a: [cz[0] + 17, cz[1] - 6], b: [cz[0] + 66, cz[1] - 34] };
    await wait(1100); bark('Wait, I\'ll go with you!', pA, 1.9, { them: true, face: '😨' });
    await wait(2400);
    await say([{ who: 'Bram', at: 'z3', comic: 'img/comic-armada.jpg', text: '[Ironjaw] has called for reinforcements. They\'re preparing a [massive assault]. We must sink the camp right away!' }]);
    incHold = false; hud(); J.bump('incoming');
    setGuide({ el: 'incoming', fx: 0.82, fy: 0.9, spot: 'deep' }, () => T().inc, 0); // Top Force 7:20: the screen dims, the hand sits on the timer, the word stays readable (L20)
  } else await expandHarbor();
  busy = false; save();
}
// Top Force 019: the gift by the factory opens where it stands, coins fly to the counter
function openGift() {
  if (S.flags.gift !== 'shown') return;
  S.flags.gift = 'taken'; finger(null); guide = null;
  // round 9: Top Force's box holds the officer, no gold (1:08 gold 28 before and after); the officer walks in from the gate
  // and the join toast says so. r5 juice (D16): the same burst as the first gift, "+1 Officer" over the box
  if (!QA) {
    const gy = BASE.y + 2.6; view.flash(GIFT_AT[0], gy, GIFT_AT[1], 10); view.ring(GIFT_AT[0], GIFT_AT[1], 8, 0.4, BASE.y + 0.2, [1, 0.9, 0.5]);
    view.floatAt(GIFT_AT[0], gy + 3, GIFT_AT[1], '+1 Officer', { size: 22, col: '#ffd23f', life: 1, p0: 0.5, p1: 1.25, popK: 0.12, fade: 0.7, still: true, rise: 30 });
    sfx.chest(); buzz([20, 30, 40]);
  }
  save();
}
// the first shed's own small gift: "Craft boats to fight the raiders!" (Top Force 006)
// P2E-10: the box drops first; the dim, hand and bubble follow 0.9 s later (scriptTick) instead of on the landing frame
let gift0At = 0, starAt = 0; // starAt: P2E notes, Iris waits for the third star to land on the HQ before she speaks
function firstGift() { S.flags.gift0 = 'shown'; gift0At = performance.now(); }
const wrapped = k => drops.some(d => d.key === k);
// Top Force 005 to 006: the first factory comes with a gift; tapping it crafts the first units
function openGift0() {
  if (S.flags.gift0 !== 'shown') return;
  S.flags.gift0 = 'taken'; finger(null); guide = null;
  // r5 juice (D5): the box bursts (flash, sparks, a ring, chest sound, buzz), a gunboat icon flies into the Gunboat Shed,
  // and only when it lands does the shed bounce, the first boat launch (one boat: timer 0.05) and "+1 GUNBOAT" rise
  const gy = BASE.y + 2.6, [gx, gz] = GIFT_AT;
  view.flash(gx, gy, gz, 10); view.sparkle(gx, gy - 1, gz, 14, undefined, 2.5); view.ring(gx, gz, 8, 0.4, BASE.y + 0.2, [1, 0.9, 0.5]);
  sfx.chest(); buzz([20, 30, 40]);
  const [fx, fy] = view.w2s(gx, gz, gy), sp = SPOT.gunboat, [tx, ty] = spotScreen('gunboat');
  J.flyIcons('img/gunboat-a.png', { x: fx, y: fy }, { x: tx, y: ty }, 1, { size: 46, spread: 0, onEach: () => {
    S.sheds.gunboat.timer = 0.05; S.ev.push({ e: 'level', key: 'gunboat' }); // sparkle and bounce on the shed
    view.floatAt(sp[0], sp[2] + 5, sp[1], '+1 DECK GUN', { size: 22, col: '#7dff6a', life: 1.2, p0: 0.5, p1: 1.25, popK: 0.1, fade: 0.75, still: true, rise: 30, italic: true });
    sfx.pick(); save(); // P2E notes: "+1 GUNBOAT" starts above the shed tag (sp[2] + 5), not under it
  } });
  // round 7: Top Force 0:22 "Weapons are almost ready!" is the officer's line, said by the arming table (refs r7 pick_a)
  bark('Weapons are almost ready!', () => (S.officers && S.officers[0] ? [S.officers[0].x, S.officers[0].z, 8] : [...SHED_AT.W1, 12]), 2.6);
  save();
}
// Top Force 059 to 080: a soldier calling HELP joins the base ("I can take on ten at once!")
function rescueSailor() {
  if (S.flags.castaway !== 'shown') return;
  S.flags.castaway = 'saved'; S.flags.sailor = 1; finger(null); guide = null;
  view.splash(CAST_AT[0], CAST_AT[1], 1.4); view.sparkle(CAST_AT[0], 2, CAST_AT[1], 24, undefined, 3);
  if (!QA) { J.callout('SAILOR RESCUED!<small>+1 SAILOR</small>', 'green', 1500); sfx.pick(); } else toast('Sailor rescued: +1 Sailor', 'gold qa', 1.8);
  setTimeout(() => {
    focusBase(4); sailorHome = 1; quip = { w: [HOME_AT[0], HOME_AT[1], 13], text: 'I can take on *ten* at once!', face: '😎' };
    setTimeout(() => { quip = null; sailorHome = null; view.sparkle(HOME_AT[0], BASE.y + 1, HOME_AT[1], 16, undefined, 2); }, 3400);
  }, 700);
  save();
}
async function expandHarbor() {
  // Top Force 13:50 to 14:05: the commander calls the side clear, the new ally stays behind to investigate
  if (!QA) await wait(1300); // let the chest's coins and confetti land before the box covers the bottom
  await say([
    { who: 'Commander', at: 'z3', text: 'Well done. Now that the east side is clear, we can keep expanding the harbor.' },
    { who: 'Bram', at: 'z3', text: '*Skye*, what will you do next?' },
    { who: 'Skye', at: 'z3', text: '[Ironjaw] suddenly has a massive [flying] armada. I\'m staying behind to investigate. Call me if you need anything.' }, // round 8: adapted from Top Force's "massive mechanized army" line; ours flies (owner 2026-11-13 "helicoter, motherships, drones")
  ]);
  S.phase = 'expand'; S.ships.length = 0; S.enemies.length = 0; S.shots.length = 0;
  // P2L-08 (Top Force 14:10 to 14:22): the camera pulls back over the harbor first, then the new wharf and pier go up
  // with dust, sparks and rings, HARBOR EXPANDED!, and the fog line rolls back
  camMode = 'wide'; { const c = ZONE_CAM.wide3; view.focus(c[0], c[1], c[2]); }
  await wait(QA ? 300 : 1300);
  S.stage = 3; view.setScene(sceneState()); newTagsUntil = performance.now() + 5000;
  if (!QA) {
    for (const [x0, x1, z0, z1] of [WHARF, PIER]) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; view.dust(cx, cz, 14); view.ring(cx, cz, 26, 0.8, BASE.y + 0.3, [1, 0.9, 0.5]); view.sparkle(cx, BASE.y + 3, cz, 30, undefined, 10); }
    view.addShake(0.35, 0.5); view.punch(1.05); J.flashScreen(0.25, 250);
    // look review (round 5): no confetti over the new wharf, and the banner sits high (Top Force 14:13 shows the base bare)
    J.callout('HARBOR EXPANDED!<small>NEW WHARF AND PIER</small>', 'green', 2000, Math.round($('app').clientHeight * 0.12)); sfx.levelup(); buzz([15, 30, 15]);
  }
  await wait(QA ? 300 : 2600);
  G.recoverZone(S); // lift the fog first so the report shows the anchorage (Top Force 14:17: the camera finds the transport station)
  // a ring pulses on the anchorage while Iris reports it, so the eye finds the new target (Top Force 14:18 to 14:22 shows it by
  // rolling the fog back and holding the camera on it)
  // look review 14: grown to 30 the pulse reached about 160 px from the anchorage and was cut by the screen's right edge
  // (Top Force 14:22 keeps its frame inside the screen); 24 still clears the island (r 18) and stays in view
  const ping = QA ? 0 : setInterval(() => { const [x, z] = ZONES[4].at; view.ring(x, z, 24, 1.1, 0.6, [1, 0.35, 0.3]); }, 900);
  if (!QA) { sfx.dispatch(1); await wait(350); }
  await say([
    { who: 'Iris', at: 'z4r', text: 'Report! A [raider supply anchorage] spotted to the north. Their objective is unclear.' },
    { who: 'Commander', at: 'z4r', text: 'Send the fleet in now. We need to find out what they\'re shipping.' },
  ]);
  clearInterval(ping);
  for (const k of ['gunboat', 'torpedo', 'destroyer']) S.sheds[k].timer = Math.min(S.sheds[k].timer, 0.5);
  focusZone();
}
// HQ upgrade (Top Force 3:50): pull back over the whole harbor, then the full-screen badge, tap to go on.
const NEW_AT = { 2: ['img/new-heli.png', 'Helipad'], 3: ['img/new-repair.png', 'Repair Dock'] };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Top Force 9:20: HQ Lv.3 takes a few seconds to build, with a countdown over it, then the celebration
function hqStart(lv) {
  if (lv < 3) { hqUp(lv); return; }
  closeHq(); finger(null); guide = null; focusBase(8); hqWait = { lv, t: 5 };
}
async function hqUp(lv) {
  busy = true; finger(null); guide = null; closeCard(); closeHq(); S.paused = true;
  // r5 juice (D17): the old HQ stays while the camera pulls back; at 1.2 s it shudders with a rising whoosh; at 1.8 s the
  // new HQ bursts in (light, a screen wash, a shock ring, shake, a short stop, a push-in, the level-up sound); the page
  // comes at 2.6 s with the boost count rolling up and paper confetti, and "Tap to continue" only after 0.8 s
  if (!QA) { view.holdHq(lv - 1); hqHold = lv - 1; }
  focusWide();
  if (QA) await wait(1700);
  else {
    await wait(1200); view.wobbleHq(0.6); view.dust(HQ_AT[0], HQ_AT[1], 8); sfx.whoosh();
    await wait(600);
    view.holdHq(null); hqHold = null; // the next setScene pops the new HQ (elastic 0.6 s, dust, 34 sparks)
    view.flash(HQ_AT[0], BASE.y + 9, HQ_AT[1], 14); J.flashScreen(0.35, 250); view.ring(HQ_AT[0], HQ_AT[1], 30, 0.6, BASE.y + 0.2, [1, 0.9, 0.5]);
    view.addShake(0.5, 0.6); hitstop(0.08); view.punch(1.06); sfx.levelup(); buzz([15, 30, 15]);
    await wait(800);
  }
  const nb = k => Object.keys(G.BOOSTS).filter(x => +x <= k).reduce((a, x) => a + G.BOOSTS[x].length, 0);
  const a0 = nb(lv - 1), b0 = nb(lv);
  $('hu-lv').textContent = lv; $('hu-a').textContent = a0; $('hu-b').textContent = QA ? b0 : a0;
  const pb = G.power(S), pa = pb - G.hqPower(lv) + G.hqPower(lv - 1); // P2E-07: Power leads, boosts are the smaller second line
  $('hu-pa').textContent = fmt(pa); $('hu-pb').textContent = fmt(QA ? pb : pa);
  const n = NEW_AT[lv], im = $('hu-img'); im.src = n ? n[0] : ''; $('hu-name').textContent = n ? n[1] : '';
  $('hqup').querySelector('.hu-conf').innerHTML = '';
  const inn = $('hqup').querySelector('.hu-in'), tap = $('hqup').querySelector('.hu-tap');
  inn.classList.remove('pin'); tap.classList.remove('late'); im.classList.remove('starin'); void inn.offsetWidth;
  show('hqup', true);
  const t0 = performance.now();
  if (!QA) {
    inn.classList.add('pin'); tap.classList.add('late'); J.confetti(70); sfx.fanfare();
    setTimeout(() => J.countUp('hu-pb', pa, pb, 700, fmt), 250); setTimeout(() => J.countUp('hu-b', a0, b0, 600), 550);
    if (n) { im.style.visibility = 'hidden'; setTimeout(() => { im.style.visibility = ''; im.classList.add('starin'); sfx.star(1); }, 500); }
  }
  await new Promise(res => { $('hqup').onclick = () => { if (!QA && performance.now() - t0 < 800) return; $('hqup').onclick = null; show('hqup', false); res(); }; });
  S.paused = false; focusBase(3); busy = false; save();
}
// round 6 (playthrough against Top Force video 11:38 to 11:58): mission 39 ends on the beaten enemy, a finger on the loot, a burst of
// coins and gems into the counters, the camera back over the harbor and out to the front again, and only then INCOMING
// (20 s; ours went from mission 39 to the banner in 3 s). The loot floats where the last raider of mission 39 went down
async function lootBeat() {
  let p = lastKill && isWater(lastKill[0], lastKill[1], S.stage, 3) ? lastKill : [ZONES[3].at[0] - 40, ZONES[3].at[1]];
  for (let k = 0; k < 12 && S.ships.some(u => Math.hypot(u.x - p[0], u.z - p[1]) < 7); k++) p = [p[0] + 1.5, p[1]]; // off our hulls, toward the camp
  loot = { x: p[0], z: p[1], taken: false };
  camMode = 'talk'; view.focusAt(p[0], p[1], frontCam()[2] * 1.1, 0.5);
  view.splash(p[0], p[1], 1.1); sfx.splash();
  await wait(1800);
  await new Promise(res => {
    loot.open = res;
    setGuide({ el: 'lootw', fx: 0.66, fy: 0.72, bub: { w: [p[0], p[1], 9], text: 'Grab the *loot*!' } }, () => !loot || loot.taken);
  });
  loot.taken = true; loot.open = null; finger(null); guide = null;
  // Top Force 12:29: the box bursts, coins and purple gems spray out and fly to the counters (about half the gold it holds)
  const g = Math.round(G.killGold(39) * 10), m = 20, [sx, sy] = view.w2s(p[0], p[1], 2);
  view.flash(p[0], 2, p[1], 12); view.ring(p[0], p[1], 12, 0.6, 0.3, [1, 0.9, 0.5]); view.splash(p[0], p[1], 1.2); sfx.chest(); buzz([20, 30, 40]);
  S.gold += g; S.gems += m; save();
  flyGold += g; flyAt = performance.now() + 6e4; flyGem += m; flyGemAt = performance.now() + 6e4;
  const k = 18;
  J.flyIcons('img/coin.png', { x: sx, y: sy }, 'p-gold', k, { size: 34, spread: 170, delay: 32, onEach: i => {
    flyGold = Math.max(0, flyGold - g / k); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i);
    if (i === k) { flyGold = 0; const r = J.rectOf('p-gold'); J.floatText(r.x, tlBottom() + 32, '+' + fmt(g), 'gold'); }
  } });
  J.flyIcons('img/gem.png', { x: sx, y: sy }, 'p-gem', 10, { size: 30, spread: 150, delay: 40, onEach: i => {
    flyGem = Math.max(0, flyGem - m / 10); flyGemAt = performance.now(); J.bump('p-gem');
    if (i === 10) { flyGem = 0; const r = J.rectOf('p-gem'); J.floatText(r.x, tlBottom() + 32, '+' + m, 'gem'); }
  } });
  await wait(2200); loot = null;
  // Top Force 12:31 to 12:35: back over the base, then out over the field the enemy will come across
  camMode = 'talk'; { const c = ZONE_CAM.base; view.focusAt(c[0], c[1], c[2], 0.56); }
  await wait(2600);
  camMode = 'talk'; { const c = frontCam(); view.focusAt(c[0], c[1], c[2], 0.5); }
  await wait(1600);
}
// round 6 (Top Force 12:45 to 13:33): the fighting goes on from "Hold the line" through the talk; the armada's front boats and
// our boats nearest them trade shots (scene only: the rules stay paused, nobody sinks, Skye's strike sinks her three)
// round 6 (fifth R-300 look review, FAIL 1: at 12:41 two of our boats traded shots while the rest sat in rows by the base,
// and through the talk 13 sat round the repair dock with the armada a third of a screen off, no wakes and no shots; Top
// Force 12:45 to 13:33 fights on the map the whole time, greens and tanks in among the reds): after "Hold the line" the
// fleet sails out into a battle line facing the armada, the front row 15 off its boats and 13 between slots (a gunboat
// pair keeps 12 apart), at most 28 either side of the line between the fleet and the armada so it stays on screen; it
// keeps clear of Skye's stop and her run in (picked first, from where the fleet waits, as before) and of the flagship's
// keel where it parks. Front slots first, each to the nearest boat still free; a boat left over stays where it is.
function skirmLine(sk) {
  const fl = S.ships.filter(u => u.hp > 0), ar = ARMADA.filter((q, i) => armada.sunk[i] == null), go = new Map();
  if (!fl.length || !ar.length) return go;
  const mx = ar.reduce((a, p) => a + p[0], 0) / ar.length, mz = ar.reduce((a, p) => a + p[1], 0) / ar.length;
  let cx = 0, cz = 0; for (const u of fl) { cx += u.x; cz += u.z; } cx /= fl.length; cz /= fl.length;
  let dx = cx - mx, dz = cz - mz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const seg = (p, q, x, z) => { const vx = q[0] - p[0], vz = q[1] - p[1], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[1]) * vz) / l2)); return Math.hypot(x - p[0] - vx * t, z - p[1] - vz * t); };
  const TAIL = 2.3 * 2.8, NOSE = 3.5 * 2.8, tail = sk ? [sk.b[0] - sk.h[0] * TAIL, sk.b[1] - sk.h[1] * TAIL] : null, nose = sk ? [sk.b[0] + sk.h[0] * NOSE, sk.b[1] + sk.h[1] * NOSE] : null;
  const fin = FLAG_P[FLAG_P.length - 1], fk = 11 * FLAG_S, k0 = [fin[0] + Math.cos(FLAG_FACE) * fk, fin[1] - Math.sin(FLAG_FACE) * fk], k1 = [fin[0] - Math.cos(FLAG_FACE) * fk, fin[1] + Math.sin(FLAG_FACE) * fk];
  const C = [];
  for (let x = mx - 110; x <= mx + 10; x += 1.5) for (let z = mz - 50; z <= mz + 50; z += 1.5) {
    const vx = x - mx, vz = z - mz, vl = Math.hypot(vx, vz) || 1;
    if ((vx * dx + vz * dz) / vl < 0.55 || Math.abs(vx * dz - vz * dx) > 28) continue;
    let d = 1e9; for (const q of ar) d = Math.min(d, Math.hypot(q[0] - x, q[1] - z));
    if (d < 15 || d > 55 || !isWater(x, z, S.stage, 4)) continue;
    if (sk && (seg(tail, nose, x, z) < 10.5 || seg(sk.a, sk.b, x, z) < 8)) continue;
    if (seg(k0, k1, x, z) < 14) continue;
    C.push([x, z, d]);
  }
  C.sort((a, b) => a[2] - b[2]);
  const spots = [];
  for (const c of C) { if (spots.length >= fl.length) break; if (spots.every(o => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 13)) spots.push(c); }
  const free = new Set(fl);
  for (const p of spots) {
    let b = null, bd = 1e9; for (const u of free) { const d = Math.hypot(u.x - p[0], u.z - p[1]); if (d < bd) { bd = d; b = u; } }
    if (!b) break; free.delete(b); go.set(b.id, [p[0], p[1], go.size * 0.07]); // front row leaves first
  }
  return go;
}
function skirmishTick(dt) {
  if (!armada || S.phase !== 'fightReady') { skirm = null; return; }
  const fl = S.ships.filter(u => u.hp > 0), ar = ARMADA.map((q, i) => i).filter(i => armada.sunk[i] == null && armada.t - i * 0.08 > ARM_T + 0.6);
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), pick = a => a[Math.floor(Math.random() * a.length)];
  // sail out to the line at 11 (a gunboat sails at 13), bow first, with a wake; once there a boat turns to face the
  // nearest raider and is left to the scene's usual spacing (steering on would fight it and flicker the wake)
  skirm.t = (skirm.t || 0) + dt;
  if (skirm.go) for (const u of fl) {
    const g = skirm.go.get(u.id); if (!g || skirm.t < g[2]) continue;
    const vx = g[0] - u.x, vz = g[1] - u.z, d = Math.hypot(vx, vz);
    if (d > 0.6) { const st = Math.min(d, 11 * dt); u.x += vx / d * st; u.z += vz / d * st; u.vx += (vx / d - u.vx) * 0.15; u.vz += (vz / d - u.vz) * 0.15; u.moving = true; }
    else { u.moving = false; skirm.go.delete(u.id); skirm.face.add(u.id); }
  }
  if (skirm.face && ar.length) for (const u of fl) if (skirm.face.has(u.id)) {
    let q = ARMADA[ar[0]], qd = 1e9; for (const i of ar) { const d = d2([u.x, u.z], ARMADA[i]); if (d < qd) { qd = d; q = ARMADA[i]; } }
    const vx = q[0] - u.x, vz = q[1] - u.z, d = Math.hypot(vx, vz) || 1; u.vx += (vx / d - u.vx) * 0.04; u.vz += (vz / d - u.vz) * 0.04;
  }
  skirm.cd -= dt; if (skirm.cd > 0) return;
  skirm.cd = 0.1 + Math.random() * 0.12;
  if (!fl.length || !ar.length) return;
  const us = skirm.k++ % 2 === 0;
  // a shooter from every boat of that side within 46 of the other side, aimed at the nearest of the other side to it
  const from = us ? pick(fl.filter(u => ar.some(i => d2([u.x, u.z], ARMADA[i]) < 46)))
    : pick(ar.filter(i => fl.some(u => d2([u.x, u.z], ARMADA[i]) < 46)));
  if (from == null) return;
  const fx = us ? from.x : ARMADA[from][0], fz = us ? from.z : ARMADA[from][1];
  let to = null, bd = 46;
  if (us) for (const i of ar) { const d = d2([fx, fz], ARMADA[i]); if (d < bd) { bd = d; to = ARMADA[i]; } }
  else for (const u of fl) { const d = d2([fx, fz], [u.x, u.z]); if (d < bd) { bd = d; to = [u.x, u.z]; } }
  if (!to) return;
  const tx = to[0] + (Math.random() - 0.5) * 3, tz = to[1] + (Math.random() - 0.5) * 3;
  view.flash(fx, 2.2, fz, 2.4); sfx.shot(!us && Math.random() < 0.3);
  // (round 6 browser check: plain shells over 40 of open water did not show in a still frame; they fly as tracer streaks
  // like the cold open's raider fire and every one lands in a burst and a splash)
  skyeShots.push({ kind: us ? 'shell' : 'shellRed', side: us ? 'us' : 'them', tracer: 1, x: fx, z: fz, tx, tz, speed: us ? 60 : 46, hit: () => {
    view.boom(tx, 1.4, tz, 0.8, 6); view.splash(tx, tz, 0.7); if (Math.random() < 0.35) sfx.boom(0.8);
  } });
}
// Top Force 25:10: full-screen INCOMING, the hero rides in, the enemy commander gloats
async function bossIntro() {
  busy = true; finger(null); guide = null; closeCard(); closeHq(); S.paused = true;
  if (!QA) await lootBeat();
  if (!QA) S.keepOff = ARMADA.map(([x, z]) => [x, z, 7]); // look review 7: our boats ease back off the armada's spots under the banner (raider len 7)
  show('banner', true);
  // r5 juice (D19): the banner comes with the boss warning, a buzz and the music ducked; the strip follows it out
  if (!QA) { sfx.warn(); buzz([40, 40, 80]); duckMusic(true); }
  await Promise.race([wait(1800), new Promise(r => { $('banner').onclick = r; })]);
  $('banner').onclick = null; show('banner', false);
  if (!QA) { setTimeout(() => duckMusic(false), 2400); armada = { t: 0, sunk: {} }; sfx.horn(); }
  await say([{ who: 'Bram', at: 'armada', text: '[Ironjaw] has sent his whole [armada]. Hold the line, everyone!' }]);
  // look review 8 prep (armada, skye): a finished talk unpauses the sim, so from here to Ironjaw's line our fleet sailed off
  // its spots, bumped hulls and spawned escorts behind Skye's entrance; the scene stays still until the next talk ends
  if (!QA) S.paused = true;
  // seventh R-300 review (quantity): the shot stays on the armada through the skirmish, Skye's entrance and the flagship
  // (a finished talk sent it back to the front camera, 10 of our boats on screen against Top Force's 2 to 6)
  { const c = LOOK.armada(); camMode = 'talk'; view.focusAt(c[0], c[1], c[2], c[3]); }
  // round 6 (playthrough against Top Force video 12:06 to 12:14): after "Hold the line" the reds charge and both sides trade fire
  // for 8 s before the hero arrives; ours cut straight to Skye
  let sk = null;
  if (!QA) { sk = skyeSpot(); skirm = { cd: 0.4, k: 0, go: skirmLine(sk), face: new Set(), home: new Map(S.ships.map(u => [u.id, [u.x, u.z]])) }; await wait(7500); }
  skye = { t: 0, ...(sk || skyeSpot()) };
  // look review 9, playthrough 22: our boats ease back off her whole hull, four spots along it, (8 + 5.5) x 0.75 = 10.1
  // each, about the 4.8 + 2.7 + 2.5 a gunboat needs from her keel line
  if (!QA && S.keepOff) for (const s of [-4, 0, 4, 8]) S.keepOff.push([skye.b[0] + skye.h[0] * s, skye.b[1] + skye.h[1] * s, 5.5]);
  const atSkye = () => (skye ? [...skyeAt(), 11] : null);
  if (!QA) sfx.whoosh();
  await wait(900); bark('*Bram*, there you are.', atSkye, 2.0);
  // look review 7: her stop is close to the armada's front row, so she fires as she races in and those boats are already
  // going down when she parks (Top Force 12:06 to 12:08: the hero blasts the front of the enemy on the way in)
  await wait(50); skyeStrike();
  await wait(3650); bark('Leave it to me!', atSkye, 1.8);
  await wait(2000);
  flagship = { t: 0 }; // sixth R-300 review: its own shot was 1.15, units 11% of the screen; seventh: the armada shot holds
  // look review 5 (armada, flag): the strip came up over the small boats and the flagship then sailed in unnamed, so the
  // swarm read as the boss; the strip now comes with the flagship and it carries a name plate (Top Force 12:21)
  // look review 6 (intro-seq): at the middle of the screen the strip hid the flagship as it sailed through; it now comes
  // 0.8 s in, once the hull is below the top band, and sits high, above the hull and its name plate
  if (!QA) { sfx.horn(); buzz([40, 40, 80]); setTimeout(() => warnStrip('BOSS INCOMING', 'IRONJAW', 'top'), 800); }
  await wait(4300);
  if (!QA) { sfx.dispatch(2); await wait(350); } // r5 juice (D19): a command-centre radio call before Ironjaw speaks
  await say([
    { who: 'Ironjaw', at: 'armada', text: '*Skye*! I didn\'t expect you to chase me all the way here! But do you really think you can stop me?' },
    { who: 'Skye', at: 'armada', text: 'Last time, you only won because you caught us off guard. This time will be different!' },
    { who: 'Ironjaw', at: 'armada', text: 'My [flying fortress] is stronger than ever. You\'ll sink like everyone else! Ha!' },
    { who: 'Skye', at: 'armada', text: '*Bram*, let\'s fight together and bring that mothership down!' },
  ]);
  // round 6 (fifth R-300 review, FAIL 1): the line holds and keeps shooting until the fight starts (a finished talk
  // unpauses the sim, and in fightReady the fleet then sailed back to its ring round the rally point by the base)
  if (!QA) S.paused = true;
  // seventh R-300 review (quantity): the armada shot holds until the fight's own camera takes over (Top Force goes from
  // the talk straight to VS over the same shot, video 12:54 to 12:59)
  if (!QA) { const c = LOOK.armada(); camMode = 'talk'; view.focusAt(c[0], c[1], c[2], c[3]); }
  busy = false;
  setGuide({ el: 'fightbtn', fx: 0.2, fy: 0.82 }, () => S.phase !== 'fightReady');
}
// Top Force 25:40: two deploy slots, hero cards, Quick Assign, Battle
const HEROES = [{ who: 'Skye', img: 'img/por-skye.png', lv: 10 }, { who: 'Bram', img: 'img/por-bram.png', lv: 1 }];
function lineup() {
  return new Promise(res => {
    const slots = [...document.querySelectorAll('#lineup .lu-slot')], put = [];
    // look review 3 (m40 070): Iris says "Tap their portraits", so the finger taps the next portrait (Top Force 12:59 "Tap the avatar"),
    // then Battle; the tip sits on the lower right, the word stays readable
    const point = () => { const c = document.querySelector('#lu-cards .lu-card:not(.used)'); finger(put.length < HEROES.length && c ? { el: c, fx: 0.7, fy: 0.72 } : { el: 'lu-go' }); };
    const draw = () => {
      $('lu-cards').innerHTML = HEROES.map((h, i) => `<div class="lu-card${put.includes(i) ? ' used' : ''}" data-i="${i}"><img src="${h.img}" alt=""><b>Lv.${h.lv}</b></div>`).join('');
      slots.forEach((el, j) => { const i = put[j]; el.classList.toggle('on', i != null); el.innerHTML = i != null ? `<img src="${HEROES[i].img}" alt="">` : ''; });
      $('lu-go').disabled = !put.length; point();
    };
    $('lu-cards').onclick = e => { const c = e.target.closest('.lu-card'); if (!c) return; const i = +c.dataset.i; if (!put.includes(i) && put.length < slots.length) { put.push(i); draw(); } };
    slots.forEach((el, j) => { el.onclick = () => { if (put[j] != null) { put.splice(j, 1); draw(); } }; });
    $('lu-quick').onclick = () => { for (let i = 0; i < HEROES.length && put.length < slots.length; i++) if (!put.includes(i)) put.push(i); draw(); };
    $('lu-back').onclick = () => { finger(null); show('lineup', false); $('app').classList.remove('lineup'); res(false); };
    $('lu-go').onclick = () => { if (!put.length) return; finger(null); show('lineup', false); $('app').classList.remove('lineup'); res(true); };
    $('app').classList.add('lineup'); show('lineup', true); draw();
  });
}
// Top Force 28:00: Victory banner and damage dealt per hero
const VIC_GOLD = 500; // Top Force 13:31 pays 500 gold for mission 40
function victoryPage(r) {
  // L43: DMG Dealt and DMG Taken both work; the top dealer is the MVP
  const rows = k => { const top = Math.max(1, ...r.dmg.map(d => d[k] || 0)), mvp = r.dmg.reduce((a, d) => (d.dmg > a.dmg ? d : a), r.dmg[0]);
    return r.dmg.map(d => `<div class="v-row"><img src="${d.img}" alt=""><div><p><span>${d.who}${k === 'dmg' && d === mvp && d.dmg > 0 ? ` <i class="mvp${QA || !first ? '' : ' late'}">MVP</i>` : ''}</span><span class="vn">${fmt(d[k] || 0)}</span></p><div class="b"><i class="${k === 'taken' ? 'taken' : ''}" style="width:${Math.max(3, Math.round(100 * (d[k] || 0) / top))}%"></i></div></div></div>`).join(''); };
  const vg = Math.round(VIC_GOLD * G.TUNE.goldMul);
  let first = true; const list0 = rows('dmg'); first = false;
  $('victory').innerHTML = `<div class="vic"><div class="v-ban">Victory</div><h3>Mission 40</h3>
    <div class="v-rw"><span><img src="img/coin.png" alt=""><b>${fmt(vg)}</b></span></div>
    <div class="v-tabs"><b class="on" data-k="dmg">DMG Dealt</b><b data-k="taken">DMG Taken</b></div>
    <div class="v-list">${list0}</div>
    <button class="green" id="v-ok">Leave</button></div>`;
  show('victory', true);
  $('victory').querySelector('.v-tabs').onclick = e => {
    const b = e.target.closest('b'); if (!b || b.classList.contains('on')) return;
    $('victory').querySelectorAll('.v-tabs b').forEach(x => x.classList.toggle('on', x === b)); sfx.click();
    const L = $('victory').querySelector('.v-list'); L.innerHTML = rows(b.dataset.k);
    if (!QA) { const bars = [...L.querySelectorAll('.b i')], ws = bars.map(x => x.style.width); bars.forEach(x => { x.style.width = '0%'; }); void L.offsetWidth; bars.forEach((x, i) => { x.classList.add('grow'); x.style.width = ws[i]; }); }
  };
  // r5 juice (D20): bars grow from zero (0.6 s, each 0.15 s after the last), numbers count up over 900 ms, win sound, confetti
  if (!QA) {
    const bars = [...$('victory').querySelectorAll('.v-row .b i')], nums = [...$('victory').querySelectorAll('.v-row .vn')];
    const ws = bars.map(b => b.style.width); bars.forEach(b => { b.style.width = '0%'; }); void $('victory').offsetWidth;
    bars.forEach((b, i) => setTimeout(() => { b.classList.add('grow'); b.style.width = ws[i]; }, 150 + i * 150));
    nums.forEach((s, i) => { s.textContent = '0'; setTimeout(() => J.countUp(s, 0, r.dmg[i].dmg, 900, v => fmt(Math.round(v))), 150 + i * 150); });
    sfx.win(); J.confetti(90, 'victory'); buzz([20, 30, 40]);
    const mv = $('victory').querySelector('.mvp.late'); if (mv) setTimeout(() => { mv.classList.add('in'); sfx.star(2); }, 150 + nums.length * 150 + 950); // P2L-20: after the counts finish
  }
  // P2L-20: the win pays gold, and it flies to the counter when you leave
  S.gold += vg; if (!QA) { flyGold += vg; flyAt = performance.now() + 6e4; }
  return new Promise(res => { $('v-ok').onclick = () => {
    const from = J.rectOf($('victory').querySelector('.v-rw span')); show('victory', false);
    // the coins fly once the map and its gold counter are back (they used to fly behind the offer, to a hidden counter)
    res(QA ? null : () => { flyAt = performance.now(); J.flyIcons('img/coin.png', from, 'p-gold', 8, { size: 28, onEach: i => { flyGold = Math.max(0, flyGold - vg / 8); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i); } }); });
  }; });
}
// Top Force 28:20: the first offer is the hero just seen in the fight
function offerPage() {
  show('offer', true); if (!QA) sfx.card();
  return new Promise(res => {
    const close = () => { show('offer', false); res(); };
    $('of-x').onclick = close; $('of-buy').onclick = () => { toast('Prototype: no real purchase', 'gold', 1.6); close(); };
  });
}
async function doFight(again) {
  if (busy || S.phase !== 'fightReady') return;
  busy = true; finger(null); guide = null; closeCard(); closeHq(); skye = null;
  if (!QA && !again) await say([{ who: 'Iris', text: 'Commander, our captains are standing by. Tap their portraits to send them into battle.' }]);
  if (!QA && skirm) S.paused = true; // the line holds behind the lineup too
  if (!QA && !again && !(await lineup())) { S.paused = false; busy = false; setGuide({ el: 'fightbtn', fx: 0.2, fy: 0.82 }, () => S.phase !== 'fightReady'); return; }
  // the map's boats are hidden through the fight; they come back where they waited before the line sailed out, so the
  // fleet after the fight is as before (look review 11: it holds there through the outpost burst)
  if (skirm && skirm.home) for (const u of S.ships) { const h = skirm.home.get(u.id); if (h) { u.x = h[0]; u.z = h[1]; u.moving = false; } }
  S.paused = false;
  S.phase = 'fight'; flagship = null; armada = null; armadaXY = []; S.keepOff = null; show('dim', false); $('app').classList.add('infight');
  const r = await runFight(S, view);
  // look review 8 (079): the fight's boats and its sinking flagship stayed in the map scene and finished sinking across our
  // fleet under OUTPOST DOWN!; the map shows only the map's own boats again
  view.dropStray(S); view.clearFloats();
  $('app').classList.remove('infight'); focusZone();
  // L41: a loss shows the fight's Defeat card (not "Out of time"); Retry goes straight back in, Harbor leaves the finger on FIGHT
  if (!r.won) { S.phase = 'fightReady'; busy = false; if (r.retry) doFight(true); else if (!r.quit) setGuide({ el: 'fightbtn', fx: 0.2, fy: 0.82 }, () => S.phase !== 'fightReady'); return; }
  const payOut = await victoryPage(r);
  if (!QA) await offerPage();
  // look review 13 (after-fight 1): the two big black clouds over our front boats at OUTPOST DOWN! were the fight's flagship
  // sinking smoke, held still under the Victory and offer panels and then drifting on over the map; the map comes back clear
  // and only the outpost's own blasts smoke (Top Force cuts from the fight's Victory to a clean base)
  view.clearFx();
  G.fightWon(S); S.incoming = null; focusZone();
  if (payOut) setTimeout(payOut, 250);
  if (!QA) {
    await wait(3200); // OUTPOST DOWN! and its confetti finish before the reward panel (onEvent 'wreck': words at 1.35 s for 1.6 s)
    await openInc(true);
    await wait(1200);
    // look review 11 (082): the camera sat on the camp just taken, empty and blue, with the fleet under the HUD; Top Force
    // 13:45 shows the unexplored ground ahead while the Red Commander says this, so the camera goes to the next target
    await say([{ who: 'Ironjaw', at: 'z4', text: 'Don\'t celebrate yet. You have no idea what you\'re up against. Just wait and see!' }]);
    T().after = 1;
  }
  busy = false; save();
  setGuide({ el: 'chestw', fx: 0.66, fy: 0.72 }, () => !S.chest || S.chest.taken);
}
// Top Force 22:40: tap the INCOMING timer for the boss, its rewards and the two goals; after the fight it pays out
let incDone = null;
function renderInc() {
  const t = Math.ceil(S.incoming || 0);
  $('ip-t').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  const rows = [[`Upgrade HQ to Lv.3 (${Math.min(S.hq, 3)}/3)`, S.hq >= 3, 'hq'], [`Clear Mission 40 (${Math.min(S.done, 40)}/40)`, S.done >= 40, 'm']];
  const key = rows.map(x => x[0]).join();
  if ($('ip-rows')._k === key) return; $('ip-rows')._k = key;
  $('ip-rows').innerHTML = rows.map(([txt, ok, k]) => `<div class="ip-row${ok ? ' ok' : ''}"><i class="tri">!</i><span>${txt}</span>${ok ? '' : `<button class="blue" data-go="${k}">Go</button>`}</div>`).join('')
    + '<p class="ip-note">When the timer hits 00:00, Ironjaw\'s armada attacks the harbor. Be ready by Mission 40.</p>'; // L21
}
function closeInc() { show('incp', false); if (incDone) { const d = incDone; incDone = null; d(); } }
function openInc(claim) {
  T().inc = 1; finger(null); if (guide && !guide.base) guide = null;
  show('ip-t', !claim); show('ip-rows', !claim); show('ip-claim', !!claim); show('ip-x', !claim);
  $('ip-rows')._k = null; renderInc(); show('incp', true);
  if (claim && !QA) { sfx.chest(); setTimeout(() => { if (!$('incp').classList.contains('hidden')) finger({ el: 'ip-claim', fx: 0.5, fy: 0.55 }); }, 450); } // Top Force 13:38: the finger on Claim
  return new Promise(res => { incDone = res; });
}
$('incoming').onclick = () => { if (!busy && !isTalking() && S.incoming != null) openInc(false); }; // the COMPLETED chip is not a button
$('ip-x').onclick = closeInc;
$('ip-rows').onclick = e => { const k = e.target.dataset && e.target.dataset.go; if (!k) return; closeInc(); if (k === 'hq') openHq(); };
$('ip-claim').onclick = () => {
  const g = Math.round(300 * G.TUNE.goldMul); S.gold += g; S.gems += 100; finger(null);
  // P2L-07 and P2L-12: both rewards fly from their icons on the panel and only count when they land
  const rg = J.rectOf($('incp').querySelector('.ip-rw span:last-child')), rm = J.rectOf($('incp').querySelector('.ip-rw span'));
  if (!QA) { flyGold += g; flyAt = performance.now(); flyGem += 100; flyGemAt = performance.now(); sfx.pick(); }
  closeInc();
  J.flyIcons('img/coin.png', rg, 'p-gold', 8, { size: 28, onEach: i => { flyGold = Math.max(0, flyGold - g / 8); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i); } });
  J.flyIcons('img/gem.png', rm, 'p-gem', 6, { size: 26, onEach: () => { flyGem = Math.max(0, flyGem - 100 / 6); flyGemAt = performance.now(); J.bump('p-gem'); } }); // L16: the gems fly to their counter
};
// Top Force 33:00: the hero list, the two heroes we have and locked cards
// L50: the tabs filter by ship type, a card opens its detail page (rarity, level, squad, skill, shards and Level Up),
// and locked cards say they need 10 shards
const HERO_LIST = [
  { who: 'Skye', img: 'img/por-skye.png', rar: 'UR', lv: 10, ty: 'gunboat', role: 'Ultimate DPS', skill: 'Jet Ski Strike', desc: 'A big hit on every enemy at once.', note: 'Joined at Lv.10 with her jet ski.', isNew: true },
  { who: 'Bram', img: 'img/por-bram.png', rar: 'SR', lv: 1, ty: 'gunboat', role: 'Defender', skill: 'Iron Hull', desc: 'His squad shrugs off the first hits.', note: 'Just joined, so he starts at Lv.1. Shards level him up.' },
];
const LOCKED = ['torpedo', 'torpedo', 'destroyer', 'destroyer', 'gunboat', 'torpedo'];
const TY_IMG = { gunboat: 'img/gunboat-a.png', torpedo: 'img/ic-torp.png', destroyer: 'img/heli-a.png' };
let hlTab = '';
function renderHeroes() {
  const cards = HERO_LIST.map((h, i) => !hlTab || h.ty === hlTab ? `<div class="hl-card" data-h="${i}"><img src="${h.img}" alt=""><i class="ty" style="background-image:url(${TY_IMG[h.ty]})"></i>${h.isNew && !h.seen ? '<i class="new">NEW</i>' : ''}<b>${h.who} Lv.${h.lv}</b></div>` : '');
  LOCKED.forEach(t => { if (!hlTab || t === hlTab) cards.push(`<div class="hl-card lock"><i class="ty" style="background-image:url(${TY_IMG[t]})"></i><b><i></i>Shards 0/10</b></div>`); });
  $('hl-grid').innerHTML = cards.join('');
  const own = HERO_LIST.filter(h => !hlTab || h.ty === hlTab).length;
  $('hl-tabs').querySelectorAll('b').forEach(b => b.classList.toggle('on', b.dataset.t === hlTab));
  $('hl-sum').textContent = `${own} of ${own + LOCKED.filter(t => !hlTab || t === hlTab).length} captains${hlTab ? ' in ' + $('hl-tabs').querySelector('b.on').textContent : ''}`;
}
function heroDetail(i) {
  const h = HERO_LIST[i]; h.seen = true;
  $('hl-det').innerHTML = `<div class="hd-in">
    <div class="hd-por r-${h.rar.toLowerCase()}"><img src="${h.img}" alt=""><i class="rar">${h.rar}</i><b class="lv">Lv.${h.lv}</b></div>
    <h3>${h.who}<small>${h.role}</small></h3>
    <div class="hd-row"><img src="${TY_IMG[h.ty]}" alt=""><p>Leads a <b>Strike Squad</b> in battle</p></div>
    <div class="hd-row"><img src="img/ui-energy.png" alt=""><p><b>${h.skill}</b><br>${h.desc}</p></div>
    <div class="hd-row"><p>${h.note}<span class="hd-sh"><i style="width:0%"></i></span>Shards 0/10</p></div>
    <div class="hd-btns"><button class="blue" id="hd-back">&#8630;</button><button class="grey" id="hd-up">Level Up</button></div>
  </div>`;
  show('hl-det', true);
  $('hd-back').onclick = () => { show('hl-det', false); renderHeroes(); };
  $('hd-up').onclick = () => { J.bump('hd-up', 'nope'); toast('Needs 10 shards (0/10)', '', 1.4); };
}
$('b-heroes').onclick = () => {
  finger(null); guide = null; hlTab = ''; show('hl-det', false);
  renderHeroes(); show('heroes', true);
};
$('hl-tabs').onclick = e => { const b = e.target.closest('b'); if (!b) return; hlTab = b.dataset.t; renderHeroes(); };
$('hl-grid').onclick = e => { const c = e.target.closest('.hl-card'); if (!c) return; if (c.dataset.h != null) heroDetail(+c.dataset.h); else { J.bump(c, 'nope'); toast('Find 10 shards to unlock this captain', '', 1.4); } };
$('hl-back').onclick = () => { show('hl-det', false); show('heroes', false); };
function showEnd(title, body, btns) {
  $('end').innerHTML = `<div class="box"><h2>${title}</h2>${body}${btns || ''}</div>`;
  show('end', true);
}
// playtest L49: the end panel popped 0.8 s after mission 41 and caught the tap meant for Heroes; it now waits until
// the Heroes hint is done, nothing is open and nobody is talking, at least 4 s after the mission (or 25 s at most)
function endWhenFree(t0) {
  const waited = performance.now() - t0, open = ['heroes', 'reward', 'incp', 'hq', 'victory', 'offer', 'lineup', 'settings'].some(isOpen);
  if ((waited > 4000 && !open && !guide && !busy && !isTalking()) || (waited > 25000 && !open && !isTalking())) endPanel();
  else setTimeout(() => endWhenFree(t0), 500);
}
function endPanel() {
  const mins = Math.floor(S.t / 60), secs = Math.floor(S.t % 60);
  // L51: player words (no reference names), one icon per row (enemy for missions, the star medal for stars, a clock for
  // time), numbers count up, confetti falls behind the card and a fanfare plays
  showEnd('One loop done', `<p>You won back the harbor and sank Ironjaw's flagship. Keep playing to grow your fleet.</p>
    <div class="rows">
      <div><img src="img/ui-enemy.png" alt="">Missions cleared<b style="margin-left:auto" data-n="${S.done}">${S.done}</b></div>
      <div><img src="img/ic-capt.png" alt="">Harbor HQ<b style="margin-left:auto">Lv.${S.hq}</b></div>
      <div><img src="img/medal.png" alt="">Stars<b style="margin-left:auto" data-n="${G.totalStars(S)}">${G.totalStars(S)}</b></div>
      <div><img src="img/raider-l.png" alt="">Raiders sunk<b style="margin-left:auto" data-n="${S.kills}">${fmt(S.kills)}</b></div>
      <div><img src="img/ui-clock.png" alt="">Play time<b style="margin-left:auto">${mins}:${String(secs).padStart(2, '0')}</b></div>
    </div>`, `<button class="green" id="e-more">Keep playing</button>`);
  $('e-more').onclick = () => show('end', false);
  if (!QA) {
    $('end').querySelectorAll('b[data-n]').forEach((b, i) => { b.textContent = '0'; setTimeout(() => J.countUp(b, 0, +b.dataset.n, 800, v => fmt(Math.round(v))), 200 + i * 150); });
    J.confetti(70, 'end'); sfx.fanfare();
  }
}

// look review 2 (round 5): Top Force 6:28 bursts a heap of coins and purple gems out of the outpost and "+202" lands by the counter.
// Half the chest's gold and 20 of its gems burst out here; the chest keeps the rest, so the total (and the bots' pace) is unchanged.
// bottom edge of the top-left counters (gold, gems, power, and INCOMING when it shows)
function tlBottom() {
  let yb = 0;
  for (const id of ['tlcol', 'incoming']) { const e = $(id); if (e && !e.classList.contains('hidden')) { const q = J.rectOf(e); yb = Math.max(yb, q.y + q.h / 2); } }
  return yb;
}
function outpostLoot() {
  const c = S.chest, g = Math.round((c.gold || 0) * 0.5), m = Math.min(20, c.gems || 0);
  c.gold -= g; c.gems -= m; S.gold += g; S.gems += m; save();
  flyGold += g; flyAt = performance.now() + 6e4; flyGem += m; flyGemAt = performance.now() + 6e4;
  setTimeout(() => {
    hud(); const z = ZONES[2].at, [x, y] = view.w2s(z[0], z[1], 3), from = { x, y }, a = $('app').getBoundingClientRect();
    from.x = Math.max(60, Math.min(a.width - 60, from.x)); from.y = Math.max(140, Math.min(a.height - 140, from.y));
    const k = 22, gr = J.rectOf('p-gold');
    J.flyIcons('img/coin.png', from, 'p-gold', k, { size: 34, spread: 170, delay: 32, onEach: i => {
      flyGold = Math.max(0, flyGold - g / k); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i);
      // look review 14: centre plus the full width put the gold "+N" on the gem pill once gems show ("20+40"); it now rises
      // just under the top-left counters (below the power pill, and below INCOMING when that shows); the rise is about 22 px
      // (box 24 px tall, -50% to -140%), so it starts 32 px under: measured, the box clears the power pill while still opaque
      if (i === k) { flyGold = 0; J.floatText(gr.x, tlBottom() + 32, '+' + fmt(g), 'gold'); }
    } });
    if (m) J.flyIcons('img/gem.png', from, 'p-gem', 10, { size: 30, spread: 150, delay: 40, onEach: i => {
      flyGem = Math.max(0, flyGem - m / 10); flyGemAt = performance.now(); J.bump('p-gem');
      // the gem "+N" sat against the mission skull chips; it rises under its own pill, level with the gold one
      if (i === 10) { flyGem = 0; const r = J.rectOf('p-gem'); J.floatText(r.x, tlBottom() + 32, '+' + m, 'gem'); }
    } });
  }, 420);
}
// juice D18: the camera leans in on the falling outpost through the slow-mo, then eases back for the chest
function pushOutpost() {
  if (QA || camMode !== 'front' || !ZONES[S.zone]) return;
  const z = ZONES[S.zone], c = frontCam(); camMode = 'look';
  // look review 12 (after-fight 2): centred on the camp at 1.3x, OUTPOST DOWN! left our fleet squeezed into the bottom-left
  // corner, two boats cut by the edge and one under the HQ button, with empty sea on the right; the camera now aims halfway
  // between the camp and our boats and pulls back from 1.3x only as far as it must to keep every boat clear of the edges,
  // the bottom HUD and the Upgrades button (Top Force 6:28: the blast mid-screen, the units around it all in frame);
  // it never goes wider than the normal battle view: with a 0.8x floor it ended at 1.28 at mission 40 and on the floor at
  // mission 21, so the boats looked smaller at the blast than in play, the opposite of Top Force's push-in; at that zoom the
  // plain midpoint cut Bram's rock in half at the left edge at mission 21, so the aim is nudged until the on-screen box of
  // the camp, our boats and (at the first outpost) Bram sits in the middle of the clear area before the edges are checked;
  // when that box is wider than the screen the camp and Bram win: centring alone cut the camp's right side at mission 40,
  // so after centring the aim slides back until they are inside the clear area and only the outermost boat is cut; the camp is eight points round 0.9 of its ring, because four points on the map axes sit on screen diagonals under the
  // 45-degree camera and only covered about half the camp's width, which cut the right-hand raft in half at mission 40
  const f = fleetMid(z.at[0], z.at[1]);
  if (!f) { view.focusAt(z.at[0], z.at[1], c[2] * 1.3, 0.5); }
  else {
    const [W, H] = view.size, near = S.ships.filter(b => Math.hypot(b.x - z.at[0], b.z - z.at[1]) < 70);
    const must = [z.at].concat([0, 1, 2, 3, 4, 5, 6, 7].map(i => [z.at[0] + z.r * 0.9 * Math.cos(i * Math.PI / 4), z.at[1] + z.r * 0.9 * Math.sin(i * Math.PI / 4)]), S.zone === 2 && !bramRide ? [BRAM_AT] : []);
    const pts = near.map(b => [b.x, b.z]).concat(must);
    const yaw = view.cam.gyaw, rx = -Math.sin(yaw), rz = Math.cos(yaw), fx = Math.cos(yaw), fz = Math.sin(yaw);
    let ax = (z.at[0] + f[0]) / 2, az = (z.at[1] + f[1]) / 2;
    const shift = (dx, dy) => {
      const o = view.w2sGoal(ax, az, 2), r = view.w2sGoal(ax + rx, az + rz, 2), u = view.w2sGoal(ax + fx, az + fz, 2), pr = r[0] - o[0], pu = u[1] - o[1];
      if (Math.abs(pr) < 1e-3 || Math.abs(pu) < 1e-3) return;
      ax += rx * dx / pr + fx * dy / pu; az += rz * dx / pr + fz * dy / pu;
    };
    const span = list => { const p = list.map(q => view.w2sGoal(q[0], q[1], 2)), xs = p.map(q => q[0]), ys = p.map(q => q[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
    const aim = zz => {
      for (let i = 0; i < 3; i++) { view.focusAt(ax, az, zz, 0.5); const [x0, x1, y0, y1] = span(pts); shift((x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - (130 + H - 135) / 2); }
      for (let i = 0; i < 2; i++) {
        view.focusAt(ax, az, zz, 0.5); const [x0, x1, y0, y1] = span(must);
        shift(x1 > W - 32 ? x1 - (W - 32) : x0 < 32 ? x0 - 32 : 0, y1 > H - 135 ? y1 - (H - 135) : y0 < 130 ? y0 - 130 : 0);
      }
      view.focusAt(ax, az, zz, 0.5);
    };
    const clear = () => pts.every(q => { const [x, y] = view.w2sGoal(q[0], q[1], 2); return x > 32 && x < W - 32 && y > 130 && y < H - 135 && !(x > W - 95 && y > H * 0.5 && y < H * 0.66); });
    for (let zm = c[2] * 1.3; ; zm -= 0.05) { const zz = Math.max(zm, c[2]); aim(zz); if (zz <= c[2] || clear()) break; }
  }
  setTimeout(() => { if (camMode === 'look') focusZone(); }, 2600);
}
let wreckSeen = 0, starSeen = 0; // when the outpost went down: its hint waits for the OUTPOST DOWN callout (1.35 s + 1.6 s) to clear
function scriptTick(dt) {
  if (S.phase !== 'wreck') wreckSeen = 0; else if (!wreckSeen) { wreckSeen = performance.now(); pushOutpost(); }
  if (guide) { if (guide.ttl) { guide.ttl -= dt; if (guide.ttl <= 0) { guide = null; finger(null); } } if (guide && guide.done()) { guide = null; finger(null); } }
  if (guide) { const b = guideBlocked(guide.target); if (b !== guide.hid) { guide.hid = b; finger(b ? null : hand(guide.target)); } }
  if (QA || busy || hqWait || isTalking() || S.paused || !$('reward').classList.contains('hidden') || document.querySelector('#incp:not(.hidden), #heroes:not(.hidden)')) return;
  const t = T();
  if (!t.intro) {
    t.intro = 1; coldOpen(); return;
  }
  // unit barks by mission (Top Force 3:18 to 14:24); a second bark in the same mission follows 1.6 s later
  if (S.m && S.phase === 'battle' && S.m.spawned >= 2 && t.barkM !== S.m.n) {
    t.barkM = S.m.n;
    (BARKS[S.m.n] || []).forEach(([src, text], i) => setTimeout(() => bark(text, src), i * 1600));
  }
  // "I want to drive a Tank" (refs r7 tank_a, first panel): the tank factory already stands and a soldier waiting in the
  // queue says it; the first tank squad goes out a mission later. Before, it waited for an empty plot and a quick player
  // who built the factory at once never heard it.
  if (!t.wantD && S.sheds.destroyer.built && S.m && S.m.spawned >= 2) { t.wantD = 1; setTimeout(() => bark('I want to fly a *Helicopter*!', queueVoice), Math.max(3500, (BARKS[S.m.n] || []).length * 1600 + 300)); } // after this mission's own barks and the TANK BUILT banner (said at once, it sat on the opening gift box)
  // Top Force 0:34: the first rifleman out of the factory
  if (!t.blast && S.ships.length && S.flags.gift0 === 'taken') { t.blast = 1; setTimeout(() => bark('Watch me blast them away!'), 900); }
  if (wrapped('gunboat')) return; // the first shed is still opening out of its gift box
  if (!S.sheds.gunboat.built || S.flags.gift0 === 'shown') {
    if (!guide && !S.sheds.gunboat.built) setGuide({ el: 'plot-gunboat' }, () => S.sheds.gunboat.built);
    else if (!guide && performance.now() - gift0At > 900) setGuide({ el: 'gift0w', fx: 0.7, fy: 0.74, bub: { w: [GIFT_AT[0], GIFT_AT[1], 8.5], text: 'Craft *boats* to fight the [raiders]!' } }, () => S.flags.gift0 === 'taken');
    return;
  }
  if (!t.up1 && S.gold >= G.upCost('gunboat', 1)) {
    t.up1 = 1;
    say([{ who: 'Iris', at: 'gunboat', text: 'Sink [raiders] to earn *gold* and upgrade the *Gunboat Shed*!' }]).then(() => setGuide(fingerOn('gunboat'), () => S.sheds.gunboat.lv >= 2));
    return;
  }
  if (!t.q1 && t.up1 && !guide && S.quest === 0 && G.questProgress(S).done) { t.q1 = 1; setGuide({ el: 'quest', fx: 0.88 }, () => S.quest > 0); return; } // R-300 round 9 second look: at 0.3 the tip sat on "Upgrade"; "Claim" is the bar's right end
  if (!t.torp && !guide && !cardKey && G.buildOpen(S, 'torpedo') && S.gold >= G.SHEDS.torpedo.buildCost) { // P2E-01: never closes the card the hand is on
    t.torp = 1;
    setGuide({ el: 'plot-torpedo', bub: { el: 'plot-torpedo', text: 'Build a *Torpedo Shed*!' } }, () => S.sheds.torpedo.built);
    return;
  }
  // Top Force 015: the first star, a bubble over the HQ and a finger on it
  if (!t.star && G.totalStars(S) >= 1 && !starSeen) starSeen = performance.now(); // juice D13: the hint waits for the star to land on the HQ tag
  if (!t.star && starSeen && performance.now() - starSeen > 1200 && !guide && !cardKey) {
    t.star = 1; focusBase();
    setGuide({ ...fingerHq(), bub: { spot: 'hq', text: 'Every *10 levels* earns a *Star*. Stars upgrade the *HQ*!' } }, () => hqOpen);
    return;
  }
  // Top Force 1:04 to 1:10: unlocking Officer Expansion I drops a gift box; the officer joins when it opens (sim.js captains)
  if (S.flags.gift === 'shown' && !t.gift && !guide && !hqOpen) { t.gift = 1; setGuide({ el: 'giftw', fx: 0.7, fy: 0.74 }, () => S.flags.gift === 'taken', 8); return; }
  // Top Force 024 to 027: the camera leaves the base for the first time; the advisor tells the rescue story
  // P2E-03: waits for the next mission's first raider so the MISSION CLEAR call-out has gone, then the camera goes in on
  // Bram and holds on his HELP before Iris speaks (Top Force 2:17 to 2:23)
  // round 6: now right after the gate stretch, as Top Force 2:15 to 2:35 does it: the last of the 42 falls, the squad leaves
  // the fence and the camera goes out with it to the outpost, then holds on Victor's HELP before Cassia speaks
  if (!t.outpost && S.done >= GATE.last && S.phase !== 'wreck' && !guide && !cardKey && !hqOpen) {
    t.outpost = 1; busy = true;
    const mid = () => { let x = 0, z = 0; for (const b of S.ships) { x += b.x; z += b.z; } const k = S.ships.length || 1; return [x / k, z / k]; };
    wait(1000).then(() => {
      camMode = 'talk'; let k = 0;
      const iv = setInterval(() => { const [x, z] = mid(); view.focusAt(x + 4, z - 6, ZONE_CAM.base[2], 0.45); if (++k >= 28) clearInterval(iv); }, 100);
      return wait(2900);
    }).then(() => { view.focusAt(...LOOK.bram(), 0.42); return wait(1800); }).then(() => { busy = false; return say([
      { who: 'Iris', at: 'bram', text: '*Bram* is in danger! We have to find a way to rescue him.' },
      { who: 'Commander', at: 'z2', text: 'The raiders built an [outpost]. We need to build up our fleet, sink the outpost, and rescue *Bram*!' },
    ]); }).then(() => setGuide({ el: 'mission', nohand: 1, bub: { el: 'mission', below: true, text: 'Sink the [outpost] at *Mission 20*!' } }, () => false, 4)); // E23/E24: a goal the player can count down to; the finger leaves the number readable
    return;
  }
  // Top Force 055 to 058: "Clear Missions to complete Tasks", then the task bar
  // P2E-05: only while the task itself is a mission count (Top Force 055 shows it at "Complete Mission 10 (9/10)"), and
  // without the hand: it sat on the task bar at the very bottom and the screen edge cut it
  const qp = G.questProgress(S);
  if (t.outpost && !t.tasks && S.done >= 6 && qp && qp.q.k === 'mission' && !qp.done && !guide && !cardKey && !hqOpen) {
    t.tasks = 1; J.bump('quest');
    setGuide({ el: 'quest', nohand: 1, bub: { el: 'mission', below: true, text: 'Clear *Missions* to complete *Tasks*.' } }, () => false, 4.5);
    return;
  }
  // Top Force 059: someone out at sea calls HELP
  // P2E-02: not on the MISSION CLEAR frame and never pulling the camera off the harbor while the player upgrades; it
  // waits for the next mission's raiders and the fight view
  if (t.outpost && !t.help && S.done >= 10 && S.zone === 2 && S.phase !== 'wreck' && camMode === 'front' && S.m && S.m.spawned >= 1 && !guide && !cardKey && !hqOpen) {
    t.help = 1; S.flags.castaway = 'shown';
    setGuide({ el: 'castw', fx: 0.66, fy: 0.72, bub: { w: CAST_BUB, text: 'Over here! *Tap* to pull me aboard!', face: '😰' } }, () => S.flags.castaway !== 'shown', 12); // E36
    return;
  }
  if (!t.hq2 && S.hq === 1 && G.canHq(S) && performance.now() - starAt > 1400) {
    t.hq2 = 1;
    say([{ who: 'Iris', at: 'hq', text: 'Wonderful! With enough *Stars* we can upgrade the *HQ* and build stronger boats!' }]).then(() => setGuide(fingerHq(), () => S.hq >= 2));
    return;
  }
  if (t.hq2 && !t.hq2done && S.hq >= 2) {
    t.hq2done = 1;
    say([
      { who: 'Iris', at: 'destroyer', text: 'The HQ upgrade is complete. Hurry and build a *Helipad*! [Raiders] won\'t stand a chance against helicopters!' },
    ]);
    return;
  }
  // look review 3 (m11 022-028): Iris had just said "build a Destroyer Shed" and the finger went to Upgrades and the Boost Path;
  // the boost hint waits until the shed is built (Top Force 3:40 builds the factory first)
  if (!t.boost1 && !guide && S.hq >= 2 && S.sheds.destroyer.built && G.boostState(S, G.BOOSTS[2][0]) === 'ready') {
    t.boost1 = 1;
    setGuide({ hq: 1, at: () => (hqOpen ? elPoint('hq-list') && (() => { const b = document.querySelector('#hq-list button.green'); if (!b) return null; const r = b.getBoundingClientRect(), a = $('app').getBoundingClientRect(); return [r.left - a.left + r.width * 0.76, r.top - a.top + r.height * 0.72]; })() : elPoint('b-upg')) }, () => S.boosts.length > 0);
    return;
  }
  // look review 4 (des): the finger sat on an unnamed plot with no words; like the torpedo step, the bubble names the shed
  if (!t.des && !guide && G.buildOpen(S, 'destroyer') && S.gold >= G.SHEDS.destroyer.buildCost) { t.des = 1; setGuide({ el: 'plot-destroyer', bub: { el: 'plot-destroyer', text: 'Build a *Helipad*!' } }, () => S.sheds.destroyer.built); return; }
  // P2E-08: waits for an open HQ panel or card to close (behind them the flagship came in unseen)
  if (!t.m20 && S.m && S.m.n === 20 && S.enemies.some(e => e.kind === 'boss') && !cardKey && !hqOpen) {
    t.m20 = 1;
    // playtest L12: the strip named a ship nobody could see; the camera follows the flagship in for 2.8 s, then back
    if ((camMode === 'front' || camMode === 'base') && !QA) {
      camMode = 'look'; let n = 0;
      const iv = setInterval(() => {
        const b = S.enemies.find(e => e.kind === 'boss');
        if (camMode !== 'look' || !b || ++n > 28) { clearInterval(iv); if (camMode === 'look') focusZone(); return; }
        // the ship under the BOSS INCOMING strip; seventh R-300 review (size): 1.9 drew the warship at twice Top Force's scale,
        // whose mission-20 boss comes in under its play camera (side-by-side 5:08), so the zone zoom
        // eighth R-300 review (round 6): with the ship at 0.64 of the screen height the top third was the fog north of the
        // reef outpost, the HELP bubble at the camp's left was cut by the screen edge and our fleet sat under the quest bar;
        // Top Force's boss comes in over open battlefield, so the ship sits at 0.42 (the fog stays behind the strip) and the
        // camera stays 40% of the way back toward the camp so the captive and his HELP stay in the frame
        view.focusAt(b.x * 0.6 + ZONES[2].at[0] * 0.4, b.z, ZONE_CAM[2][2], 0.42);
      }, 100);
    }
    // P2E-08: said by one of ours away from the flagship once the camera is back, so it is not read as the boss talking
    let by = null;
    const ours = () => {
      if (by != null) { const u = S.ships.find(x => x.id === by); return u ? [u.x, u.z, 8] : null; }
      const b = S.enemies.find(e => e.kind === 'boss'), W = $('app').clientWidth, H = $('app').clientHeight; let best = -1;
      for (const u of S.ships) { // the one on screen farthest from the flagship
        const [sx, sy] = view.w2s(u.x, u.z, 8); if (sx < 60 || sx > W - 60 || sy < 150 || sy > H - 180) continue;
        const d = b ? Math.hypot(u.x - b.x, u.z - b.z) : 0; if (d > best) { best = d; by = u.id; }
      }
      const u = S.ships.find(x => x.id === by); return u ? [u.x, u.z, 8] : undefined;
    };
    setTimeout(() => bark('What is this?!', ours, 2.6, { face: '😲', live: () => S.enemies.some(e => e.kind === 'boss' && e.hp > 0) }), 3300); // after the BOSS INCOMING strip and the look at the flagship
    return;
  }
  // Top Force 6:25 "Destroy the enemy outpost and reclaim the area."
  if (S.phase === 'wreck' && S.chest && !S.chest.taken && !guide && performance.now() - wreckSeen > 3300) { const c = chestAt(S.chest.zone); setGuide({ el: 'chestw', fx: 0.66, fy: 0.72, bub: { w: [c[0], c[1], c[2] + 9], text: 'Grab the loot and reclaim the *waters*!' } }, () => !S.chest || S.chest.taken); return; }
  if (!t.hq3 && S.hq === 2 && G.canHq(S)) {
    t.hq3 = 1;
    say([{ who: 'Iris', at: 'hq', text: 'The *Harbor HQ* can reach Lv.3. Tap it!' }]).then(() => setGuide(fingerHq(), () => S.hq >= 3));
    return;
  }
  if (t.hq3 && !t.hq3done && S.hq >= 3) {
    t.hq3done = 1;
    say([{ who: 'Iris', at: 'repair', text: 'The *Repair Dock* patches up damaged boats and keeps them in the fight.' }]);
    return;
  }
  if (!t.rep && !guide && G.buildOpen(S, 'repair') && S.gold >= G.SHEDS.repair.buildCost) { t.rep = 1; setGuide({ el: 'plot-repair' }, () => S.sheds.repair.built); return; }
  if (S.phase === 'fightReady' && !t.f40) { t.f40 = 1; bossIntro(); return; }
  if (S.phase === 'fightReady' && t.f40 && !guide && !busy) { setGuide({ el: 'fightbtn', fx: 0.2, fy: 0.82 }, () => S.phase !== 'fightReady'); return; }
  // Top Force 177: after the first big fight the Heroes button opens
  if (!t.heroes && S.stage >= 3 && S.phase === 'battle' && !guide) {
    t.heroes = 1; show('b-heroes', true);
    setGuide({ el: 'b-heroes', fy: 0.72, bub: { el: 'b-heroes', text: 'Meet your *captains*!' } }, () => !$('heroes').classList.contains('hidden')); // L49: a line, and the finger waits (P2L-24: no time-out, it stays until the tap)
    return;
  }
}

// ---------- events from the rules ----------
// r5 juice: hitstop (skip the rules but keep drawing) and slow-mo for big moments only; short stops at least 0.8 s apart
let stopT = 0, lastStop = -9, slowK = 1, slowT = 0;
function hitstop(s) { if (QA) return; if (s < 0.08 && clock - lastStop < 0.8) return; stopT = Math.max(stopT, s); lastStop = clock; }
function slowmo(k, s) { if (QA) return; slowK = k; slowT = s; view.hushRings(s + 0.4); }
// the red strip across the screen (snow-train boss warning), also used for the armada alarm
function warnStrip(big, small, cls = '') { if (QA) return; const w = $('bwarn'); w.firstElementChild.textContent = big; w.lastElementChild.textContent = small; w.classList.toggle('top', cls === 'top'); show(w, false); void w.offsetWidth; show(w, true); clearTimeout(w._t); w._t = setTimeout(() => show(w, false), 2400); }
let ringedGold = false;
function goldRing() { if (ringedGold || QA) return; ringedGold = true; const r = J.rectOf('p-gold'), el = document.createElement('div'); el.className = 'ringpulse'; el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 18 + 'px'; el.style.height = r.h + 18 + 'px'; $('app').appendChild(el); setTimeout(() => el.remove(), 2100); }
function onEvent(e) {
  if (e.e === 'kill') lastKill = [e.x, e.z];
  // round 7: Top Force 1:32 "1 soldier(s) joined", 3:50 "1 officer(s) joined"
  if (e.e === 'join' && !QA) { toast(`${e.n} ${e.who}${e.n > 1 ? 's' : ''} joined`, 'gold', 1.4); sfx.pick(); }
  if (e.e === 'level') {
    if (e.star) {
      // first star (D13): gold call-out, star sound, a star flies from the shed to the HQ level tag, which bumps
      // P2E notes: with a shed card open the call-out sits just above the card instead of across it
      const cr = cardKey && !$('card').classList.contains('hidden') ? $('card').getBoundingClientRect() : null, ar = $('app').getBoundingClientRect();
      J.callout('&#9733; PROMOTED!', '', 1200, cr ? Math.max(70, cr.top - ar.top - 52) : null); sfx.star(G.shedStars(S.sheds[e.key].lv) - 1); buzz(15); starAt = performance.now();
      if (!QA && SPOT[e.key]) {
        const [sx, sy] = spotScreen(e.key), hb = $('hqbadge'), tgt = !hb.classList.contains('hidden') ? hb : labels['lv-hq'] && labels['lv-hq'].style.display !== 'none' ? labels['lv-hq'] : null;
        if (tgt) J.flyIcons('img/medal.png', { x: sx, y: sy }, tgt, 1, { size: 34, spread: 0, onEach: () => { J.bump(tgt); sfx.pick(); } });
      }
    } else if (e.rank) { J.callout(G.SHEDS[e.key].name.toUpperCase() + '<small>POWER UP!</small>', 'small', 1200); sfx.levelup(); }
  } else if (e.e === 'build') {
    save();
    const cost = G.SHEDS[e.key].buildCost;
    if (cost && !QA) { const g = J.rectOf('p-gold'); J.floatText(g.x + 10, g.y + 22, '-' + fmt(cost), 'red'); }
    if (QA) toast(G.SHEDS[e.key].name + ' built!', 'gold');
    // Top Force 043: the new building lands as a big gift box on its plot, wobbles, then bursts open into the building
    if (!QA) {
      const d = { id: ++dropN, key: e.key }; drops.push(d);
      const p0 = SPOT[e.key], y0 = e.key === 'repair' ? 0.5 : BASE.y;
      // the box lands (0.5 s): a soft flash, a thud and a buzz; then the big "X BUILT!" words
      setTimeout(() => { view.flash(p0[0], y0 + 2, p0[1], 10); view.addShake(0.3, 0.4); sfx.slam(); buzz(25); }, 500);
      setTimeout(() => { J.callout((G.SHEDS[e.key].shedName || G.SHEDS[e.key].name).toUpperCase() + ' BUILT!', 'band', 1500); sfx.upgrade(); }, 700); // look review 6: gold words get the band too
      setTimeout(() => {
        drops.splice(drops.indexOf(d), 1); const p = SPOT[d.key], y = d.key === 'repair' ? 0.5 : BASE.y;
        view.sparkle(p[0], y + 2, p[1], 40, undefined, 6); view.boom(p[0], y + 1, p[1], 0.6); view.shakeIt(0.18);
        view.flash(p[0], y + 3, p[1], 12); view.ring(p[0], p[1], 12, 0.6, y + 0.3, [1, 0.9, 0.5]); sfx.chest();
        if (d.key === 'gunboat' && !S.flags.gift0) firstGift();
      }, 1500);
    }
  }
  else if (e.e === 'hq') { save(); if (!QA) hqStart(e.lv); }
  else if (e.e === 'boost') { toast(G.findBoost(e.id).name, 'gold', 1.2); sfx.upgrade(); buzz(15); }
  else if (e.e === 'quest') { if (QA) toast('+' + fmt(e.gold) + ' gold', 'gold', 1.2); }
  else if (e.e === 'spawn' && e.kind === 'boss') { if (QA) toast('BOSS', 'big', 1.6); else { warnStrip('BOSS INCOMING', 'PIRATE MOTHERSHIP', 'top'); sfx.warn(); duckMusic(true); setTimeout(() => duckMusic(false), 2600); } }
  else if (e.e === 'wave') { setTimeout(() => { const d = $('dots').children[Math.max(0, Math.min(2, (e.n || 1) - 1))]; if (d) J.bump(d); }, 0); }
  else if (e.e === 'wreck') {
    // outpost down (D18): slow-mo while the blasts go off, then the words (no confetti since the round-5 look review)
    // look review (round 5): Top Force bursts loot with no confetti; the banner stays clear of the gold counter's flight
    if (!QA) { slowmo(0.3, 1.5); J.flashScreen(0.25, 300); setTimeout(() => { J.callout('OUTPOST DOWN!', 'band', 1600, Math.round($('app').clientHeight * 0.16)); sfx.win(); }, 1350); }
    if (!QA && e.zone === 2 && S.chest && !S.chest.taken) outpostLoot();
  }
  // bots recover zones without the chest dialog: move the camera the way openChest does
  else if (e.e === 'recovered') { if (QA && DRAW) focusZone(); }
  else if (e.e === 'missionDone') {
    save(); if (e.n === 41 && !T().end && !QA) { T().end = 1; endWhenFree(performance.now()); }
    // D12: green "MISSION n CLEAR!" with a short win tune for the first ten; after that only the tag bumps (presumed: less noise)
    // round 6: none while the gate counter runs (Top Force has no mission tag or call-out until 4:15)
    if (!QA && !e.gate && e.n > GATE.last) { if (e.n <= 10) { J.callout('MISSION ' + e.n + ' CLEAR!', 'green', 1200); sfx.win(); } else sfx.quest(); setTimeout(() => J.bump('t-mission'), 0); }
    else if (!QA && e.gate && labels.enemies) J.bump(labels.enemies);
  }
  else if (e.e === 'gateClear') {
    // Top Force 2:13 to 2:15: the last heavy blows up at the fence and "+104" rises beside the squad, the coin count jumps
    if (!QA) {
      const [x, y] = view.w2s(GATE.goal[0], GATE.goal[1], 4), g = e.gold; J.floatText(x, y - 10, '+' + fmt(g), 'gold big');
      flyGold += g; flyAt = performance.now();
      J.flyIcons('img/coin.png', { x, y }, 'p-gold', 8, { size: 28, onEach: i => { flyGold = Math.max(0, flyGold - g / 8); flyAt = performance.now(); J.bump('p-gold'); sfx.coin(i); } });
    }
  }
  else if (e.e === 'fightReady') {
    if (QA) qaResult('win', S.incoming != null ? S.incoming / S.incomingTotal : 1);
  } else if (e.e === 'armada') {
    if (QA) qaResult('lose', -Math.min(1, (40 - S.mission) / 20));
    else { G.armadaWave(S); warnStrip('ARMADA INCOMING', 'IRONJAW\'S FLEET IS HERE'); sfx.alarm(); buzz([40, 40, 80]); }
  }
}

function qaResult(result, margin) {
  if (QA.result) return;
  margin = Math.round(margin * 1000) / 1000;
  if (result === 'lose') showEnd('So close!', `<p>Ironjaw's armada arrived at Mission ${S.mission} of 40.</p>`);
  QA.result = { result, margin };
  QA.mark && QA.mark('payoff');
}

// ---------- loop ----------
let last = 0, clock = 0, saveT = 0;
function loop(now) {
  const real = Math.max(0, Math.min(0.1, (now - last) / 1000 || 0)); last = now; clock += real;
  const hold0 = !QA && (!S.sheds.gunboat.built || wrapped('gunboat') || S.flags.gift0 === 'shown');
  const pausedUi = hold0 || isTalking() || !$('reward').classList.contains('hidden') || S.phase === 'fight' || (QA && QA.result);
  if (hqWait) { hqWait.t -= real; if (hqWait.t <= 0) { const lv = hqWait.lv; hqWait = null; hqUp(lv); } }
  if (skye) skye.t += real;
  for (let i = skyeShots.length - 1; i >= 0; i--) { const s = skyeShots[i], dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz), st = s.speed * real;
    if (d <= st) { skyeShots.splice(i, 1); s.hit(); } else { s.x += dx / d * st; s.z += dz / d * st; } }
  if (skirm) skirmishTick(real);
  if (runner && (runner.t += real) > 3.4) runner = null;
  if (flagship) flagship.t += real;
  if (armada) armada.t += real;
  if (bramRide && !bramRide.hold) { const t0 = bramRide.t; bramRide.t += real; if (t0 < RIDE_HOP && bramRide.t >= RIDE_HOP && !QA) sfx.whoosh(); if (t0 < RIDE_ON && bramRide.t >= RIDE_ON && !QA) { view.splash(...rideAt().slice(0, 2), 1.0); sfx.pick(); } if (bramRide.t > RIDE_END + 0.5) bramRide = null; }
  coTick(real);
  const tk = stopT > 0 ? 0 : slowT > 0 ? slowK : 1; // r5: hitstop and slow-mo scale the rules and the effects, not the UI
  if (stopT > 0) stopT = Math.max(0, stopT - real); else if (slowT > 0) slowT = Math.max(0, slowT - real);
  if (hold0 && !isTalking() && S.phase !== 'fight') G.crewMove(S, real * speed); // round 7: the crews walk ashore and queue while the first gift waits
  if (!pausedUi) {
    let acc = real * (QA ? QA_SPEED : speed) * tk;
    while (acc > 1e-6) { const h = Math.min(0.02, acc); acc -= h; G.step(S, h); if (bot && !QA.result) bot(S, h); }
  }
  const ev = S.ev; S.ev = [];
  if (co && !co.live) coArm(ev);
  const inFight = S.phase === 'fight';
  if (DRAW && !inFight) view.consume(ev, S);
  for (const e of ev) onEvent(e);
  scriptTick(real); if (!QA) camTick(real);
  if (DRAW && !inFight) {
    view.setScene(sceneState());
    show('dim', S.phase === 'fightReady' && !busy);
    view.frame(S, tk ? real * tk : real * 0.05, clock, { line: !!T().outpost, avoid: tagBoxes, avoidRef: tagRef, goldAt: goldAt(), onCoin: () => { J.bump('p-gold'); goldRing(); }, props: storyProps(), shells: co && co.shells && co.shells.length ? co.shells : skyeShots.length ? skyeShots : null });
    labelsTick(); hud(); placeCard(); if (hqOpen) renderHq(); if (!$('incp').classList.contains('hidden')) renderInc(); fingerTick(); toastTick(real);
    if (coinBump > 0) { coinBump -= real; $('p-gold').classList.toggle('bump', coinBump > 0); }
  }
  saveT += real; if (saveT > 3) { saveT = 0; save(); }
  requestAnimationFrame(loop);
}

// ---------- boot ----------
const IMG_LIST = ['coin.png'];

async function boot() {
  IM = await loadImages(IMG_LIST);
  try { await Promise.all(['700 16px "Barlow SC"', '800 16px "Barlow SC"', 'italic 800 16px "Barlow C"'].map(f => document.fonts.load(f))); } catch (e) { /* fall back */ }
  if (QA) S = fresh();
  else if (params.has('jump')) { S = jumpTo(Math.max(1, Math.min(41, +params.get('jump') || 1))); history.replaceState(null, '', location.pathname); }
  else if (params.has('fresh')) { localStorage.removeItem(SAVE_KEY); S = fresh(true); history.replaceState(null, '', location.pathname); }
  else S = load() || fresh(true);
  if (QA) { markTut(S); G.TUNE.holdIncoming = false; } // QA still tests the armada at 00:00 (L30 holds it in play)
  if (!QA) S.flags.giftBox = 1; // round 9: Officer Expansion I's officer comes in a gift box (sim.js captains)
  view = createView($('cv'), $('fx2d'), IM);
  view.onTap = onTap;
  view.resize(); addEventListener('resize', () => view.resize());
  view.setScene(sceneState()); focusZone(true);
  if (S.t > 0 && !QA) { const t = T(); t.intro = 1; }
  if (!co) S.berth = null; // a reload after the cold open: no moored boats wait for crews
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.__HF = { get S() { return S; }, get clock() { return clock; }, get cam() { return camMode; }, get guide() { return guide; }, get busy() { return busy; }, get skye() { return skye; }, get armadaXY() { return armadaXY; }, G, view, set speed(v) { speed = v; }, audio: audioState };
  // r5 juice (D1, D3, D10, D14): sound starts on the first touch; buttons click; a world plot pops when pressed and a
  // locked Build plot shakes with the gold pill flashing red; tutorial bubbles blip as they spring in
  addEventListener('pointerdown', unlockAudio, true); addEventListener('pointerup', unlockAudio, true);
  addEventListener('pointerdown', e => { const t = e.target.closest && e.target.closest('button, .plot, .hit, #fightbtn'); if (t && !t.closest('#talk')) sfx.click(); }, true);
  world.addEventListener('click', e => { const p = e.target.closest('.plot'); if (!p) return; const b = p.querySelector('b'); if (!b) return; if (b.classList.contains('no')) noGold(b); else J.bump(b, 'tapd'); }, true);
  addEventListener('animationstart', e => { if ((e.animationName === 'bubin' || e.animationName === 'bubinb') && !e.target.classList.contains('bark')) sfx.click(); });
  if (QA) QA.ready = true;
  last = performance.now();
  requestAnimationFrame(loop);
}
boot();
