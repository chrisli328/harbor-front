// Generic DOM widgets: dialogue, tutorial finger, toast, reward popup, number format, plus the juice helpers
// at the bottom (banner, float text, flying icons, count-up, confetti, screen flash), copied from the snow-train mockup.
import { sfx, buzz } from './audio.js';
export const $ = id => document.getElementById(id);
export const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
export const QA = window.__PROTO_QA || null;

export function fmt(n) {
  n = Math.floor(n);
  if (n < 100000) return n.toLocaleString('en-US');
  if (n < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1e6).toFixed(2).replace(/0$/, '') + 'M';
}

// side: the screen edge the bust stands on (Top Force puts the speaker opposite the thing being talked about);
// each portrait faces into the screen from its default side.
const PEOPLE = {
  Iris: { img: 'img/por-iris.png', side: 'left' },
  Bram: { img: 'img/por-bram.png', side: 'left' },
  Skye: { img: 'img/por-skye.png', side: 'left' },
  Ironjaw: { img: 'img/por-ironjaw.png', side: 'right' },
  // the player's own character (Top Force 2:29, 6:30, 13:50: peaked cap, arms crossed, always on the left)
  Commander: { img: 'img/por-commander.png', side: 'left' },
};

// Dialogue (Top Force shots 009, 024, 096, 174): white box, italic name on a striped plate, bust on one side with its
// waist behind the box, key words coloured, Skip at top right; HUD buttons step aside while someone talks.
// lines: [{ who, text, side, at }]; *word* is blue (ours), [word] is red (enemy). opts.onLine(line) runs per line.
let talking = null;
export function talk(lines, opts = {}) {
  if (QA) return Promise.resolve();
  return new Promise(res => {
    let i = 0;
    const box = $('talk'), app = $('app');
    const next = () => {
      if (i >= lines.length) { show(box, false); show('talk-comic', false); app.classList.remove('talking'); talking = null; opts.onEnd && opts.onEnd(); res(); return; }
      const L = lines[i++], P = PEOPLE[L.who];
      $('talk-name').textContent = L.who;
      $('talk-text').innerHTML = L.text.replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\[(.+?)\]/g, '<em class="r">$1</em>');
      const por = $('talk-por'), changed = por.dataset.who !== L.who;
      if (changed) { por.dataset.who = L.who; if (P.img) por.src = P.img; por.style.visibility = P.img ? '' : 'hidden'; }
      box.classList.toggle('right', (L.side || P.side) === 'right');
      const wrap = $('talk-wrap'); if (changed) { wrap.classList.remove('pop'); void wrap.offsetWidth; wrap.classList.add('pop'); }
      // Top Force 7:13: a comic panel above the speaker's head for a line that has one; it sits 14 px over the bust's top
      const cm = $('talk-comic');
      let place = null;
      if (L.comic) {
        cm.querySelector('img').src = L.comic;
        place = () => { cm.style.bottom = (wrap.clientHeight - por.offsetTop + 14) + 'px'; };
        show(cm, true); cm.classList.remove('cin'); void cm.offsetWidth; cm.classList.add('cin');
      } else show(cm, false);
      opts.onLine && opts.onLine(L);
      // first line: the box rises 16 px and fades in; every line: the text fades in with a soft click
      const first = box.classList.contains('hidden');
      box.classList.toggle('rise', first); if (first) { void box.offsetWidth; }
      const tx = $('talk-text'); tx.classList.remove('tin'); void tx.offsetWidth; tx.classList.add('tin');
      sfx.click();
      app.classList.add('talking'); show(box, true);
      // round 6 recording (Bram's armada line at 7:24): the panel is placed once the box shows; on a first line the box was
      // still hidden, the wrap one box shorter, and the panel sat behind the box with only its top edge showing
      if (place) { if (por.complete && por.naturalWidth) place(); else por.addEventListener('load', place, { once: true }); }
    };
    // L11: each line ignores taps for its first 300 ms, so a fast double tap cannot skip the line it just opened
    const step = () => { talking.at = performance.now(); next(); };
    talking = { next: step, end: () => { i = lines.length; next(); }, at: 0 };
    $('talk-por').dataset.who = '';
    opts.onStart && opts.onStart();
    talking.next();
  });
}
export const isTalking = () => !!talking;
$('talk').addEventListener('click', e => { if (!talking || performance.now() - talking.at < 300) return; if (e.target.id === 'skip') talking.end(); else talking.next(); });

// Tutorial finger: points at an element or at a screen point from a callback; updated every frame.
// The finger slides in from 40 px down-right when it appears and glides 0.2 s to a new target instead of jumping;
// a yellow ring pulses under its tip. target.spot dims the rest of the screen around a hole on the target.
let fingerTarget = null, fingerShown = false;
const ringEl = (() => { const r = document.createElement('div'); r.id = 'fring'; r.className = 'ringpulse hidden'; $('app').appendChild(r); return r; })();
export function finger(target) {
  const f = $('finger');
  if (target && fingerTarget && fingerShown) { f.classList.add('glide'); clearTimeout(f._g); f._g = setTimeout(() => f.classList.remove('glide'), 260); }
  fingerTarget = target;
  if (!target) { show('finger', false); show(ringEl, false); show('spot', false); $('app').classList.remove('spoton'); fingerShown = false; }
}
// look review 2: the hand must not lie over these buttons (cast: the plain hand over Upgrades under the sailor's raft)
const UI_KEEP = ['b-upg', 'b-heroes', 'b-fleet', 'quest'];
function overUi(b, tgt) {
  const a = $('app').getBoundingClientRect(), te = typeof tgt === 'string' ? $(tgt) : tgt;
  for (const id of UI_KEEP) {
    const e = $(id); if (!e || e === te || e.classList.contains('hidden') || !e.offsetParent) continue;
    const r = e.getBoundingClientRect(), L = r.left - a.left, T = r.top - a.top;
    if (b[0] < L + r.width && b[2] > L && b[1] < T + r.height && b[3] > T) return true;
  }
  return false;
}
export function fingerTick() {
  if (!fingerTarget || QA) return;
  const off = () => { show('finger', false); show(ringEl, false); show('spot', false); $('app').classList.remove('spoton'); fingerShown = false; };
  if (fingerTarget.wait && fingerTarget.wait()) { off(); return; } // e.g. a harbor finger waits for the camera to stop
  let down = false, x, y, cx, cy, ell = null, elR = null, rad = (typeof fingerTarget.spotR === 'function' ? fingerTarget.spotR() : fingerTarget.spotR) || 40;
  if (fingerTarget.el) {
    const el = typeof fingerTarget.el === 'string' ? $(fingerTarget.el) : fingerTarget.el;
    if (!el || el.classList.contains('hidden') || !el.offsetParent) { off(); return; }
    const r = el.getBoundingClientRect(), a = $('app').getBoundingClientRect();
    // look review (round 5): by default the tip sits on the button's lower right (Top Force 13:38 Claim), so the hand leaves its word readable
    x = r.left - a.left + r.width * (fingerTarget.fx ?? 0.76); y = r.top - a.top + r.height * (fingerTarget.fy ?? 0.72);
    // a button on the bottom edge (captains Quick Assign and Battle, the quest bar): the hand comes from above and points down,
    // so it stays on screen and off the button's word (from below it fell off the screen; lifted, it lay over 'Quick Assign')
    down = r.bottom - a.top > a.height - 40; if (down) y = r.top - a.top + r.height * 0.3;
    if (!fingerTarget.spotR) rad = Math.max(r.width, r.height) / 2 + 14;
    // look review 2 (m02 020): a round spot on a wide button lit the Boost Path words under it; a button gets an oval that hugs it
    if (!fingerTarget.spotR && r.width > r.height * 1.6) ell = [r.width / 2 + 16, r.height / 2 + 16];
    elR = { top: r.top - a.top, height: r.height };
    cx = r.left - a.left + r.width / 2; cy = r.top - a.top + r.height / 2;
  } else {
    const p = fingerTarget.at(); if (!p) { off(); return; } [x, y, cx = x, cy = y] = p; // optional 3rd/4th value: spot centre
    // look review 3 (m10 020): a target on a panel button (ellEl) gets the oval that hugs the button, not a big round glow
    const ee = fingerTarget.ellEl && fingerTarget.ellEl(), e2 = ee && $(ee);
    if (e2 && e2.offsetParent) { const r = e2.getBoundingClientRect(), a = $('app').getBoundingClientRect(); ell = [r.width / 2 + 16, r.height / 2 + 16]; cx = r.left - a.left + r.width / 2; cy = r.top - a.top + r.height / 2; }
  }
  const f = $('finger'), W = $('app').clientWidth;
  // E35: near the right edge the hand is mirrored to come from the left, so it stays on screen and points inward
  // only when the down-right hand (40px right of its tip) would leave the screen: at 0.72 of the width the mirrored hand lay over the HQ panel's Unlock word
  let flip = !down && x > W - 44;
  // look review 2: the mirrored hand lay over the "Upgrades" word under that button (m02 023), the plain hand over the Upgrades button
  // under the sailor's raft (cast); there the hand hangs from above and points down, mirrored to the left near the right edge
  if (!down && ((flip && elR) || overUi(flip ? [x - 46, y - 4, x + 8, y + 58] : [x - 8, y - 4, x + 44, y + 58], fingerTarget.el))) { down = true; if (elR) y = elR.top + elR.height * 0.3; }
  if (down) flip = false;
  const dl = down && x > W - 44;
  f.style.left = x + 'px'; f.style.top = y + 'px';
  if (f._flip !== flip) { f._flip = flip; f.classList.toggle('flip', flip); }
  if (f._down !== down) { f._down = down; f.classList.toggle('down', down); }
  if (f._dl !== dl) { f._dl = dl; f.classList.toggle('dl', dl); }
  if (!fingerShown) { f.classList.remove('enter'); void f.offsetWidth; f.classList.add('enter'); fingerShown = true; }
  show(f, true);
  ringEl.style.left = x + 'px'; ringEl.style.top = y + 'px'; ringEl.style.width = ringEl.style.height = '44px'; show(ringEl, true);
  const sp = $('spot');
  if (fingerTarget.spot) {
    const R = Math.round(rad);
    // look review 4 (inc): Top Force 7:20 darkens the whole map and rings the timer with a round orange ring (even on a wide chip)
    sp.style.background = fingerTarget.spot === 'deep' ? `radial-gradient(circle at ${Math.round(cx)}px ${Math.round(cy)}px, transparent 0 ${R}px, rgba(255,150,40,.95) ${R + 1}px ${R + 5}px, rgba(0,0,0,.62) ${R + 9}px)`
      : ell ? `radial-gradient(ellipse ${Math.round(ell[0] / 0.8)}px ${Math.round(ell[1] / 0.8)}px at ${Math.round(cx)}px ${Math.round(cy)}px, transparent 0 80%, rgba(0,0,0,.45) 100%)`
      : `radial-gradient(circle at ${Math.round(cx)}px ${Math.round(cy)}px, transparent 0 ${R}px, rgba(0,0,0,.45) ${R + 24}px)`;
    show(sp, true); $('app').classList.add('spoton'); // guide bubbles stay above the dim so their words stay readable
  } else { show(sp, false); $('app').classList.remove('spoton'); }
}

let toastT = 0;
export function toast(msg, cls = '', dur = 1.6) {
  if (QA && !cls.includes('qa')) return;
  // snow-train banner entrance: scale .4 and tilted, springs to 1 in 0.25 s; leaves with a 0.15 s fade and shrink
  const t = $('toast'); t.textContent = msg; t.className = cls; void t.offsetWidth; t.classList.add('tin'); toastT = dur;
}
export function toastTick(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0.15) $('toast').classList.add('tout'); if (toastT <= 0) show('toast', false); }
}

// Reward popup (Top Force 9:00 gift and chest): items [[img, text]]. The chest pops with a glow, confetti falls and
// each number counts up; Collect shows 0.8 s later so a fast tap does not skip the payoff.
export function reward(img, items) {
  if (QA) return Promise.resolve();
  return new Promise(res => {
    const im = $('rw-img'); im.src = img; im.classList.remove('open'); void im.offsetWidth; im.classList.add('open');
    $('rw-items').innerHTML = items.map(([im, t]) => `<div><img src="${im}" alt=""><span class="ol">${t}</span></div>`).join('');
    show('reward', true);
    sfx.chest(); buzz([20, 30, 40]); confetti(40, 'reward');
    $('rw-items').querySelectorAll('span').forEach(s => {
      const m = /^([^\d]*)([\d,]+)([^\d.]*)$/.exec(s.textContent); if (!m) return;
      const to = +m[2].replace(/,/g, ''); countUp(s, 0, to, 600, v => m[1] + fmt(v) + m[3]);
    });
    const ok = $('rw-ok'); ok.style.visibility = 'hidden'; setTimeout(() => { ok.style.visibility = ''; }, 800);
    ok.onclick = () => { sfx.pick(); show('reward', false); res(); };
  });
}

// ---------- juice helpers (snow-train ui.js; every one is a no-op in QA) ----------
export function rectOf(el) {
  el = typeof el === 'string' ? $(el) : el; const a = $('app').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, w: r.width, h: r.height };
}
// restart a one-shot CSS animation class
export function bump(el, cls = 'bump') { if (QA) return; el = typeof el === 'string' ? $(el) : el; if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
// big centred words: "GUNBOAT SHED BUILT!", "MISSION 3 CLEAR!", "PROMOTED!", "OUTPOST DOWN!"
export function callout(text, cls = '', ms = 1500, top = null) {
  if (QA) return;
  const c = $('callout'); c.innerHTML = text; c.className = cls; c.style.top = top != null ? top + 'px' : ''; void c.offsetWidth; c.classList.add('show');
  clearTimeout(c._t); c._t = setTimeout(() => c.classList.remove('show'), ms);
}
// rising outlined words at a screen point (gold "+25", red "-120", green "+1 GUNBOAT")
export function floatText(x, y, text, cls = '') {
  if (QA) return;
  const e = document.createElement('div'); e.className = 'ftxt ' + cls; e.textContent = text;
  e.style.left = x + 'px'; e.style.top = y + 'px'; $('fxl').appendChild(e); setTimeout(() => e.remove(), 1000);
}
// icons pop out at `from`, wait, then fly with a pull-back curve into `target` (element id, element or {x, y})
export function flyIcons(src, from, target, n, { onEach, size = 30, spread = 44, delay = 55 } = {}) {
  if (QA || !n) { for (let i = 1; i <= n; i++) onEach && onEach(i); return Promise.resolve(); }
  const to = target && target.x != null && !target.getBoundingClientRect ? target : rectOf(target);
  return new Promise(done => {
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const f = document.createElement('img'); f.className = 'flyer'; f.src = src; f.alt = ''; f.style.width = size + 'px';
      const sx = from.x + (Math.random() - 0.5) * spread, sy = from.y + (Math.random() - 0.5) * spread;
      f.style.left = sx - size / 2 + 'px'; f.style.top = sy - size / 2 + 'px'; f.style.transform = 'scale(0)';
      $('fxl').appendChild(f);
      setTimeout(() => {
        f.style.transition = 'transform .18s cubic-bezier(.3,1.8,.5,1)'; f.style.transform = 'scale(1)';
        setTimeout(() => {
          f.style.transition = 'transform .55s cubic-bezier(.55,-0.25,.6,1)';
          f.style.transform = `translate(${to.x - sx}px, ${to.y - sy}px) scale(.75)`;
          setTimeout(() => { f.remove(); arrived++; onEach && onEach(arrived); if (arrived === n) done(); }, 560);
        }, 200 + i * delay);
      }, i * 20);
    }
  });
}
export function countUp(node, from, to, ms = 600, f = v => v) {
  node = typeof node === 'string' ? $(node) : node;
  if (QA) { node.textContent = f(to); return Promise.resolve(); }
  const t0 = performance.now();
  return new Promise(done => {
    const tick = () => {
      const e = Math.min(1, (performance.now() - t0) / ms);
      node.textContent = f(Math.round(from + (to - from) * (1 - (1 - e) ** 3)));
      if (e < 1) requestAnimationFrame(tick); else done();
    };
    tick();
  });
}
// generated paper strips (snow-train fx-confetti sheet), not drawn boxes
// host: a page element; the strips go in first so they fall behind its words. Default is #confl, under the dialogue.
export function confetti(n = 60, host) {
  if (QA) return;
  host = (typeof host === 'string' ? $(host) : host) || ['hqup', 'victory', 'end', 'reward'].map($).find(e => e && !e.classList.contains('hidden')) || $('confl');
  const bits = ['cf-orange', 'cf-blue', 'cf-yellow', 'cf-pink', 'cf-green', 'cf-purple', 'cf-red', 'cf-star'];
  for (let i = 0; i < n; i++) {
    const k = bits[i % bits.length], c = document.createElement('img');
    c.className = 'confetti' + (['cf-pink', 'cf-green', 'cf-purple', 'cf-star'].includes(k) ? ' bit' : ''); c.src = `img/fx/${k}.webp`; c.alt = '';
    c.style.left = Math.random() * 100 + '%';
    c.style.setProperty('--dx', (Math.random() - 0.5) * 160 + 'px');
    c.style.setProperty('--r', (Math.random() * 1080 - 540) + 'deg');
    c.style.animationDelay = Math.random() * 0.6 + 's'; c.style.animationDuration = 2 + Math.random() * 1.4 + 's';
    host.prepend(c); setTimeout(() => c.remove(), 4200);
  }
}
// full-screen white wash (big moments only; never full white)
export function flashScreen(op = 0.35, ms = 250) {
  if (QA) return;
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = Math.min(0.6, op); void f.offsetWidth;
  f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0;
}
