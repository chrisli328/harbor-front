// Two QA players (proto-qa recipe): 'good' plays every 0.25 s and spends where it buys the most firepower ('quest' is the
// good player who also follows the quest bar);
// 'careless' plays every 0.8 s, never opens boosts, never builds the destroyer or repair dock, never upgrades
// the HQ, and just buys the cheapest upgrade it can afford.
import * as G from './sim.js';

function dpsOf(S, key, lv) {
  const d = G.SHEDS[key];
  return G.shipDmg(S, key, lv) / d.rate * (key === 'destroyer' ? 2 : key === 'torpedo' ? 1.8 : 1) * G.shedCap(S, key) + G.shipHp(S, key, lv) * G.shedCap(S, key) * 0.02;
}

function goodSpend(S, quest) {
  // HQ first when everything but gold is ready: save for it.
  const r = G.hqReq(S);
  if (r && G.totalStars(S) >= r.stars && S.done >= r.mission) {
    if (G.upgradeHq(S)) return true;
    if (S.gold < r.gold) return false;
  }
  for (const k of ['torpedo', 'destroyer', 'repair']) if (G.buildOpen(S, k)) { if (G.build(S, k)) return true; if (S.gold < G.SHEDS[k].buildCost) return false; }
  let best = null, bs = 0;
  for (const k of ['gunboat', 'torpedo', 'destroyer']) {
    const s = S.sheds[k]; if (!s.built) continue;
    const c = G.upCost(k, s.lv);
    let gain = dpsOf(S, k, s.lv + 1) - dpsOf(S, k, s.lv);
    // stars matter for HQ and boosts: a level that gives a star is worth more
    if (G.shedStars(s.lv + 1) > G.shedStars(s.lv)) gain *= 1.6;
    const sc = gain / c; if (sc > bs) { bs = sc; best = k; }
  }
  // round 6 (R-300: "Upgrade Torpedo Boat to Lv.10" sat on the quest bar from 1:35 to 3:35): the 'quest' player is the good
  // player who also follows the quest bar like the Top Force player does (3:20 "Upgrade Tank to Lv.10 (10/10)"): an upgrade
  // the quest asks for goes first, and is saved for while it costs no more than twice the best buy
  const qp = quest && G.questProgress(S);
  if (qp && !qp.done && qp.q.k === 'lv' && S.sheds[qp.q.s].built) {
    const cq = G.upCost(qp.q.s, S.sheds[qp.q.s].lv);
    if (S.gold >= cq) return G.upgrade(S, qp.q.s);
    if (!best || cq <= 2 * G.upCost(best, S.sheds[best].lv)) return false;
  }
  const rp = S.sheds.repair;
  if (rp.built && rp.lv < 10 && S.gold >= G.upCost('repair', rp.lv) && (!best || G.upCost('repair', rp.lv) < G.upCost(best, S.sheds[best].lv) * 2)) return G.upgrade(S, 'repair');
  if (best && S.gold >= G.upCost(best, S.sheds[best].lv)) return G.upgrade(S, best);
  return false;
}

function carelessSpend(S) {
  if (G.buildOpen(S, 'torpedo') && G.build(S, 'torpedo')) return true;
  let best = null, bc = Infinity;
  for (const k of ['gunboat', 'torpedo']) { const s = S.sheds[k]; if (!s.built) continue; const c = G.upCost(k, s.lv); if (c < bc) { bc = c; best = k; } }
  return best ? G.upgrade(S, best) : false;
}

export function makeBot(kind) {
  const good = kind === 'good' || kind === 'quest', every = good ? 0.25 : 0.8;
  let t = 0;
  // round 9: the browser recorder passes max 1, one buy per call like a player's tap (Top Force 3:14 to 3:21: Tank Lv2 to Lv10
  // in 7 s, about one tap a second); node keeps 6
  return function botStep(S, dt, max = 6) {
    t -= dt; if (t > 0) return; t = every;
    G.claimQuest(S);
    if (S.phase === 'wreck') { G.collectChest(S); G.recoverZone(S); return; }
    if (good) {
      for (const lv in G.BOOSTS) for (const b of G.BOOSTS[lv]) G.unlockBoost(S, b.id);
      for (let i = 0; i < max && goodSpend(S, kind === 'quest'); i++);
    } else carelessSpend(S);
  };
}
