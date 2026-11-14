// Synthesized sound kit (no audio files), same build as the snow-train mockup: master -> compressor,
// one sfx bus, a quiet music bus, one shared noise buffer. Nothing starts until the first finger lift.
// Navy extras (cannon, slam, alarm, radio dispatch) follow the Octo Arms kit.
// QA mode (html.qa / window.__PROTO_QA) plays nothing and never buzzes.
const KEY = 'harborfront-audio';
const QA = () => !!window.__PROTO_QA || document.documentElement.classList.contains('qa');
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let settings = { sound: true, vibe: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* keep defaults */ }

export function audioSettings() { return { ...settings }; }
export function setAudio(patch) {
  Object.assign(settings, patch);
  localStorage.setItem(KEY, JSON.stringify(settings));
  if (sfxBus) sfxBus.gain.value = settings.sound ? 1 : 0;
  if (musicBus) musicBus.gain.value = settings.sound ? MUSIC_VOL : 0;
}
export function audioState() { return ctx ? ctx.state : 'none'; }

const MUSIC_VOL = 0.1;
export function unlockAudio() {
  if (QA()) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sound ? 1 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.sound ? MUSIC_VOL : 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

function tone(freq, t, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.005, bus = sfxBus } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', to = 0, bus = sfxBus } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + Math.min(dur + 0.02, 0.99));
}

// Command-centre radio (owner: "add officier command centre kind of sound"): a narrow crunchy band with hiss,
// and a fast buzzy voice of nonsense syllables.
let crunch = null;
function radio(t, dur, vol) {
  if (!crunch) { crunch = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; crunch[i] = Math.tanh(x * 3.2); } }
  const g = ctx.createGain(); g.gain.value = vol;
  const ws = ctx.createWaveShaper(); ws.curve = crunch;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900;
  const out = ctx.createGain(); out.gain.value = 0.17;
  g.connect(ws); ws.connect(hp); hp.connect(lp); lp.connect(out); out.connect(sfxBus);
  const h = ctx.createBufferSource(); h.buffer = noiseBuf; h.loop = true;
  const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2100; hf.Q.value = 0.6;
  const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
  hg.gain.setValueAtTime(0.05, t + dur - 0.05); hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  h.connect(hf); hf.connect(hg); hg.connect(out); h.start(t); h.stop(t + dur + 0.05);
  return g;
}
function chatter(bus, t, n, f0, rate) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
  const env = ctx.createGain(); env.gain.value = 0.0001;
  o.connect(f1); o.connect(f2); f1.connect(env); f2.connect(env); env.connect(bus);
  const V = [[700, 1200], [400, 2000], [300, 2300], [550, 900], [500, 1700], [650, 1500]];
  let at = t;
  for (let i = 0; i < n; i++) {
    const d = (0.07 + Math.random() * 0.07) / rate, v = V[(Math.random() * V.length) | 0];
    const p = f0 * (1 + 0.12 * Math.sin(i * 1.3) + (Math.random() - 0.5) * 0.1) * (i === n - 1 ? 0.85 : 1);
    o.frequency.setTargetAtTime(p, at, 0.02);
    f1.frequency.setTargetAtTime(v[0], at, 0.015); f2.frequency.setTargetAtTime(v[1], at, 0.015);
    env.gain.setTargetAtTime(1.6, at, 0.008); env.gain.setTargetAtTime(0.0001, at + d * 0.78, 0.012);
    if (Math.random() < 0.55) noise(at, 0.035, { vol: 0.05, freq: 2400 + Math.random() * 600, q: 2, bus });
    at += d + (i % 4 === 3 ? 0.09 / rate : 0.012);
  }
  o.start(t); o.stop(at + 0.1);
  return at;
}

const last = {};
const ok = (k, gap) => { const t = ctx.currentTime; if (t - (last[k] ?? -1e9) < gap) return false; last[k] = t; return true; };
const PENTA = [0, 2, 4, 7, 9];
const live = () => ctx && ctx.state === 'running' && settings.sound && !QA();

const kit = {
  // ship guns: a low thump with a short crack on top (many ships fire at once, so it is throttled)
  shot(big) {
    if (!ok('shot', 0.07)) return; const t = ctx.currentTime;
    tone(big ? 150 : 210, t, big ? 0.16 : 0.1, { type: 'triangle', vol: big ? 0.18 : 0.11, slide: 0.5 });
    noise(t, big ? 0.12 : 0.07, { vol: big ? 0.16 : 0.1, freq: 1800, q: 0.8, to: 500 });
  },
  torpedo() { if (!ok('torp', 0.15)) return; const t = ctx.currentTime; noise(t, 0.3, { vol: 0.1, freq: 600, q: 1.2, to: 1800 }); },
  hit() { if (!ok('hit', 0.05)) return; const t = ctx.currentTime; noise(t, 0.06, { vol: 0.14, freq: 2600, q: 1.5 }); tone(320, t, 0.06, { type: 'square', vol: 0.05, slide: 0.6 }); },
  // one pop per sink; the combo walks up the pentatonic scale
  pop(combo = 0) {
    if (!ok('pop', 0.04)) return; const t = ctx.currentTime;
    const n = PENTA[combo % 5] + 12 * Math.min(2, Math.floor(combo / 5));
    tone(520 * Math.pow(2, n / 12), t, 0.12, { type: 'triangle', vol: 0.16, slide: 1.4 });
    noise(t, 0.18, { vol: 0.14, freq: 900, q: 0.7, to: 220 });
  },
  boom(size = 1) {
    if (!ok('boom' + (size > 1.5 ? 'B' : ''), size > 1.5 ? 0.12 : 0.06)) return; const t = ctx.currentTime;
    tone(110 * (size > 1.5 ? 0.6 : 1), t, 0.35 + size * 0.15, { type: 'sine', vol: 0.3 + 0.1 * Math.min(size, 3), slide: 0.3 });
    noise(t, 0.4 + size * 0.2, { vol: 0.25 + 0.06 * Math.min(size, 3), freq: 1400, q: 0.6, type: 'lowpass', to: 120 });
  },
  splash() { if (!ok('splash', 0.2)) return; const t = ctx.currentTime; noise(t, 0.45, { vol: 0.2, freq: 1500, q: 0.6, to: 300 }); noise(t + 0.06, 0.3, { vol: 0.08, freq: 4000, q: 1.5 }); },
  hurt() { if (!ok('hurt', 0.25)) return; const t = ctx.currentTime; tone(140, t, 0.22, { type: 'sawtooth', vol: 0.12, slide: 0.6 }); noise(t, 0.18, { vol: 0.12, freq: 500, q: 0.8 }); },
  coin(i = 0) {
    if (!ok('coin', 0.035)) return; const t = ctx.currentTime, f = 1320 * Math.pow(2, PENTA[i % 5] / 12);
    tone(f, t, 0.07, { type: 'square', vol: 0.06 }); tone(f * 1.5, t + 0.05, 0.12, { type: 'square', vol: 0.05 });
  },
  click() { if (!ok('click', 0.03)) return; const t = ctx.currentTime; tone(880, t, 0.035, { type: 'triangle', vol: 0.09 }); noise(t, 0.02, { vol: 0.05, freq: 5000, q: 2 }); },
  pick() { const t = ctx.currentTime; tone(660, t, 0.05, { type: 'triangle', vol: 0.1 }); tone(990, t + 0.04, 0.07, { type: 'triangle', vol: 0.09 }); },
  // not enough gold: one low buzz
  deny() { if (!ok('deny', 0.2)) return; const t = ctx.currentTime; tone(220, t, 0.14, { type: 'square', vol: 0.08, slide: 0.85 }); tone(180, t + 0.1, 0.12, { type: 'square', vol: 0.07 }); },
  // upgrade: a quick rising chord plus a sparkle
  upgrade() {
    if (!ok('up', 0.06)) return; const t = ctx.currentTime;
    [0, 4, 7].forEach((n, i) => tone(523 * Math.pow(2, n / 12), t + i * 0.045, 0.16, { type: 'triangle', vol: 0.12 }));
    noise(t + 0.1, 0.15, { vol: 0.05, freq: 7000, q: 2 });
  },
  levelup() {
    const t = ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => tone(523 * Math.pow(2, n / 12), t + i * 0.07, 0.3, { type: 'triangle', vol: 0.13 }));
    tone(1046, t + 0.36, 0.5, { type: 'sine', vol: 0.1 });
  },
  // big build/landing thud
  slam() { const t = ctx.currentTime; tone(90, t, 0.35, { type: 'sine', vol: 0.4, slide: 0.45 }); noise(t, 0.25, { vol: 0.22, freq: 700, q: 0.7, type: 'lowpass', to: 120 }); },
  whoosh() { if (!ok('whoosh', 0.1)) return; const t = ctx.currentTime; noise(t, 0.32, { vol: 0.12, freq: 500, q: 1.4, to: 3200 }); },
  // gift box opening: a shake rattle then a bright burst
  chest() {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) noise(t + i * 0.09, 0.05, { vol: 0.1, freq: 1100, q: 3 });
    tone(392, t + 0.3, 0.2, { type: 'triangle', vol: 0.14 }); tone(784, t + 0.38, 0.4, { type: 'triangle', vol: 0.14 });
    noise(t + 0.3, 0.5, { vol: 0.12, freq: 6000, q: 0.8 });
  },
  quest() { const t = ctx.currentTime; [0, 7, 12].forEach((n, i) => tone(659 * Math.pow(2, n / 12), t + i * 0.08, 0.22, { type: 'square', vol: 0.06 })); },
  star(i = 0) { const t = ctx.currentTime, f = 880 * Math.pow(2, (i * 4) / 12); tone(f, t, 0.25, { type: 'triangle', vol: 0.14 }); tone(f * 2, t + 0.05, 0.3, { type: 'sine', vol: 0.07 }); },
  // ship horn (first boat out of the dock)
  horn() {
    const t = ctx.currentTime;
    for (const f of [110, 138.6]) tone(f, t, 0.9, { type: 'sawtooth', vol: 0.09, attack: 0.08 });
  },
  // boss warning (snow-train warn): three 440/330 Hz pairs
  warn() { if (!ok('warn', 0.6)) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) { tone(440, t + i * 0.36, 0.16, { type: 'square', vol: 0.09 }); tone(330, t + i * 0.36 + 0.17, 0.16, { type: 'square', vol: 0.09 }); } },
  // klaxon: two-tone siren, three swells
  alarm() {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) { tone(520, t + i * 0.5, 0.42, { type: 'sawtooth', vol: 0.09, slide: 1.4, attack: 0.04 }); }
  },
  // command-centre radio call before an order or a threat line
  dispatch(level = 1) {
    const t = ctx.currentTime, dur = 0.9 + level * 0.35;
    tone(1200, t, 0.06, { type: 'square', vol: 0.05 }); // squelch click
    noise(t, 0.08, { vol: 0.08, freq: 2400, q: 0.7 });
    const bus = radio(t + 0.05, dur, 1);
    chatter(bus, t + 0.1, 6 + level * 3, 150, 1.15);
    tone(1200, t + dur + 0.05, 0.05, { type: 'square', vol: 0.04 });
  },
  win() { const t = ctx.currentTime; [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => tone(392 * Math.pow(2, n / 12), t + i * 0.1, 0.32, { type: 'triangle', vol: 0.14 })); },
  fanfare() { const t = ctx.currentTime; [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]].forEach(([n, d]) => { tone(392 * Math.pow(2, n / 12), t + d, 0.5, { type: 'sawtooth', vol: 0.06, attack: 0.02 }); tone(392 * Math.pow(2, n / 12) * 2, t + d, 0.4, { type: 'triangle', vol: 0.05 }); }); },
  card() { const t = ctx.currentTime; noise(t, 0.12, { vol: 0.08, freq: 3000, q: 1, to: 6000 }); tone(600, t + 0.05, 0.08, { type: 'triangle', vol: 0.06 }); },
  tick() { const t = ctx.currentTime; tone(1800, t, 0.05, { type: 'triangle', vol: 0.08 }); tone(2400, t + 0.05, 0.08, { type: 'triangle', vol: 0.07 }); },
};
// Every call is a no-op until the context is running, with sound off, or in QA.
export const sfx = new Proxy(kit, { get: (o, k) => (...a) => { if (live() && o[k]) try { o[k](...a); } catch (e) { /* audio is decoration */ } } });

// Phone buzz: off in QA, off when Vibration is off, only after a real tap.
export function buzz(ms) {
  if (QA() || !settings.vibe || !navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(ms); } catch (e) { /* not on desktop */ }
}

// Quiet sea-shanty loop on the music bus (low and soft so the effects lead).
const BPM = 112, STEP = 60 / BPM / 2;
const MEL = [7, null, 9, 7, 4, null, 2, null, 4, null, 7, 9, 12, null, 9, null, 7, null, 4, 2, 0, null, 2, null, 4, null, 2, 0, -3, null, null, null];
const BASS = [0, 0, 7, 7, 5, 5, 7, 7];
let nextNote = 0, step = 0, timer = 0, duck = 1;
function startMusic() { if (timer) return; nextNote = ctx.currentTime + 0.1; timer = setInterval(schedule, 100); }
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  while (nextNote < ctx.currentTime + 0.25) {
    const m = MEL[step % MEL.length];
    if (m !== null) tone(392 * Math.pow(2, m / 12), nextNote, STEP * 1.6, { type: 'triangle', vol: 0.18 * duck, bus: musicBus });
    if (step % 4 === 0) tone(98 * Math.pow(2, BASS[(step / 4) % BASS.length] / 12), nextNote, STEP * 3.5, { type: 'sine', vol: 0.32 * duck, bus: musicBus });
    nextNote += STEP; step++;
  }
}
// dialogue and big moments push the music down for a while
export function duckMusic(on) { duck = on ? 0.35 : 1; }
