// 3D harbor view (three.js, same setup as the Octo Arms prototype): perspective camera looking down about 52 degrees
// with a 45 degree turn like Top Force: Commander, toy-coloured block models, real shadows, sea fog as low clouds,
// and code-only effects (muzzle flashes, shells on arcs, explosions, smoke, foam wakes, water rings, debris).
// A transparent 2D canvas on top carries health bars and coins flying to the gold counter.
import * as THREE from 'three';
import { MAT, VIG } from './look.js';
import { landMesh, islandsMesh, treesMesh, waterMesh, waterDepthTex, createFog } from './terrain.js';
import { boatModel, shedModel, slipModel, plotModel, hqModel, shoreGunModel, repairDockModel, quayModel, zoneModel, cannonMesh } from './models.js';
import { BASE, SHEDS3D, ZONES, REPAIR_AT, TURRET_AT, HQ_AT, WHARF, PIER, TAG_Y, LINES, lineCircle, isWater } from './world.js';
import { propModel } from './props.js';
import { animate7 } from './units7.js';
import { crewLayer } from './crewview.js';
import { ARMORY } from './world.js';
import { sfx } from './audio.js';

export function loadImages(names) {
  const out = {};
  return Promise.all(names.map(n => new Promise(res => {
    const im = new Image(); im.onload = () => { out[n] = im; res(); }; im.onerror = () => { console.warn('missing', n); res(); };
    im.src = 'img/' + n;
  }))).then(() => out);
}

const Y0 = BASE.y, DEG = Math.PI / 180, R2 = Math.SQRT1_2, TAU = Math.PI * 2;
const QS = new URLSearchParams(location.search);
const LOW = QS.get('q') === 'low';
const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const PITCH = 52 * DEG, FOV = 38, VIEW_W = 95; // at zoom 1 the camera target sees 95 units across (base about one screen wide)
const ZMIN = 0.6, ZMAX = 1.8, ZSCRIPT = 2.6; // ZMAX limits the player's pinch; scripted story shots may go closer (P2E-03)
const ZWIDE = 0.54; // scripted wide shots may pull back past the pinch limit (the grown harbor, look review 2)
const SLOT = { gunboat: 'W1', torpedo: 'S1', destroyer: 'W2' };
const BAR_Y = { gunboat: 4, torpedo: 3.6, destroyer: 9, raider: 3.6, gunship: 4.5, boss: 11, airship: 14, drone: 6 };
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rgb = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- particles (two pools: glowing and plain)
const PV = `attribute vec4 acol; attribute float asize; varying vec4 vCol; uniform float uScale;
void main() { vCol = acol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = asize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PF = `varying vec4 vCol; uniform float uSoft;
void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
  float a = vCol.a * (1.0 - smoothstep(uSoft, 1.0, r));
  vec3 c = vCol.rgb * (0.86 + 0.28 * (1.0 - gl_PointCoord.y));
  gl_FragColor = vec4(c, a); }`;
function pointsPool(n, additive) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), siz = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aC = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aS = new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aP); g.setAttribute('acol', aC); g.setAttribute('asize', aS);
  const U = { uScale: { value: 500 }, uSoft: { value: additive ? 0.15 : 0.45 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 4 : 3;
  const list = [];
  return {
    pts, U, list,
    add(p) { if (list.length >= n) return; p.t = 0; list.push(p); },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) { const p = list[i]; p.t += dt; if (p.t >= p.life) { list[i] = list[list.length - 1]; list.pop(); } }
      let k = 0;
      for (const p of list) {
        const dr = Math.max(0, 1 - (p.drag || 0) * dt);
        p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - (p.grav || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy = 0; }
        const q = p.t / p.life, e = 1 - (1 - q) * (1 - q);
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        const c = p.c, c1 = p.c1 || c;
        col[k * 4] = c[0] + (c1[0] - c[0]) * q; col[k * 4 + 1] = c[1] + (c1[1] - c[1]) * q; col[k * 4 + 2] = c[2] + (c1[2] - c[2]) * q;
        col[k * 4 + 3] = (p.a ?? 1) * (p.fin ? Math.min(1, q / p.fin) : 1) * (1 - Math.pow(q, p.fo || 1));
        siz[k] = p.s0 + (p.s1 - p.s0) * e;
        k++;
      }
      g.setDrawRange(0, k);
      aP.needsUpdate = aC.needsUpdate = aS.needsUpdate = true;
    },
  };
}

// Instanced helper: flat rings on the water, flying debris, shells.
function instPool(geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0;
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  return m;
}

export function createView(canvas, overlay, IM) {
  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW && QS.get('aa') !== '0', powerPreference: 'high-performance' });
  const PR = QS.has('pr') ? +QS.get('pr') : Math.min(window.devicePixelRatio || 1, LOW ? 1 : MOBILE ? 1.25 : 2);
  renderer.setPixelRatio(PR);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.08;
  const SHADOW = !LOW && QS.get('shadow') !== '0';
  renderer.shadowMap.enabled = SHADOW;
  renderer.shadowMap.type = (QS.get('st') === 'basic' || MOBILE) ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  const SM = +QS.get('sm') || (MOBILE ? 1024 : 2048);
  const octx = overlay.getContext('2d');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a7fc0);
  const camera = new THREE.PerspectiveCamera(FOV, 0.5, 5, 3000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a96b0, 1.9);
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.3);
  sun.castShadow = SHADOW;
  sun.shadow.mapSize.set(SM, SM); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 420;
  scene.add(hemi, sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-20, 60, -40).normalize();

  // ---------------------------------------------------------------- static world
  scene.add(landMesh(), islandsMesh());
  const trees = treesMesh(); scene.add(trees);
  const water = waterMesh(); scene.add(water);
  const depthTex = {};
  let waterStage = 0;
  function setWater(st) { if (st === waterStage) return; waterStage = st; if (!depthTex[st]) depthTex[st] = waterDepthTex(st); water.userData.U.uDepth.value = depthTex[st]; }
  setWater(1);
  const fog = createFog(); scene.add(fog.mesh);

  // effects
  const glow = pointsPool(1600, true), puff = pointsPool(2400, false);
  scene.add(glow.pts, puff.pts);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = instPool(new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2), ringMat, 96); rings.renderOrder = 2; scene.add(rings);
  const ringList = [];
  // L29: enemy rings read red on the cyan sea: a multiply ring darkens the water to a red-brown band (it fades by
  // going to white, since multiply ignores alpha) under the usual additive ring tinted red
  const darkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false });
  const darkRings = instPool(new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2), darkMat, 64); darkRings.renderOrder = 1; scene.add(darkRings);
  const darkList = [];

  // ---------------------------------------------------------------- round 9: the front line
  // owner 2026-11-14 07:26 "[Image #7] and wheres this line thing": Top Force draws a glowing line round the ground it holds,
  // green fading in on our side, a thin bright edge, red fading out on theirs (refs r9-owner-image7, f1 s0137 to s0141). It
  // shows up hugging the fence once the 42 are down and pushes out with the soldiers (2:16 to 2:19), and the soldiers stand on
  // it from then on. Ours: an arc lineOut past the zone's front row (world.js LINES, sim.js TUNE.lineOut), faded where it
  // meets land; it first hugs the quay and pushes out, and moves when the next zone opens
  // R-300 round 9 second look (pair line): the green side read as a 6 to 8 px mint rim beside 12 to 14 px of red (Top Force: about
  // 25 to 30 px of saturated green, 425 px wide) and the arc as a rainbow; green 8 wide in grass green, flatter (world.js flat
  // 100), a slow wave of LWAV along it (Top Force's runs in a gentle S), and its core LEDGE past the furthest a boat stands
  // R-300 round 9 third look (sbs poster 2:18, line zoom): each colour still 5 to 12 px of 390 as a crisp double stripe, the wave
  // not seen; Top Force's green runs about 20 to 25 px of 480 and its red is a soft glow about 15 to 20 px into the sea. Green 15
  // wide, red 12 with a soft falloff, one long S across the screen (LWAV 2.5 at 6 per radian) and the core 1 further out
  const LSEG = 200, LIN = 15, LOUT = 12, LARC = 0.75, LPAD = 6, LWAV = 2.5, LEDGE = 6; // segments, green and red widths, half the arc (round world.js lineCircle), quay gap
  const lPos = new Float32Array((LSEG + 1) * 9), lD = new Float32Array((LSEG + 1) * 3), lU = new Float32Array((LSEG + 1) * 3), lM = new Float32Array((LSEG + 1) * 3);
  const lIdx = [];
  for (let i = 0; i < LSEG; i++) for (let j = 0; j < 2; j++) { const v = i * 3 + j; lIdx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4); }
  for (let i = 0; i <= LSEG; i++) { lD[i * 3] = -LIN; lD[i * 3 + 1] = 0; lD[i * 3 + 2] = LOUT; lU[i * 3] = lU[i * 3 + 1] = lU[i * 3 + 2] = (i / LSEG * 2 - 1) * LARC; }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3)); lineGeo.setAttribute('aD', new THREE.BufferAttribute(lD, 1));
  lineGeo.setAttribute('aU', new THREE.BufferAttribute(lU, 1)); lineGeo.setAttribute('aM', new THREE.BufferAttribute(lM, 1)); lineGeo.setIndex(lIdx);
  const lineMat = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float aD; attribute float aU; attribute float aM; varying float vD; varying float vU; varying float vM;
void main() { vD = aD; vU = aU; vM = aM; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vD; varying float vU; varying float vM; uniform float uOp; uniform float uTime;
void main() {
  float g = vD < 0.0 ? pow(1.0 - clamp(-vD / ${LIN.toFixed(1)}, 0.0, 1.0), 0.85) : 0.0;
  float r = vD > 0.0 ? pow(1.0 - clamp(vD / ${LOUT.toFixed(1)}, 0.0, 1.0), 1.7) : 0.0;
  float core = 1.0 - smoothstep(0.1, 0.38, abs(vD));
  vec3 col = (vec3(0.22, 0.86, 0.12) * g + vec3(0.92, 0.12, 0.14) * r) / max(g + r, 0.001);
  col = mix(col, vec3(0.93, 1.0, 0.88), core);
  float a = max(max(g * 0.86, r * 0.9), core * (0.88 + 0.12 * sin(uTime * 2.2 - vU * 5.0)));
  gl_FragColor = vec4(col, a * vM * uOp);
}`,
  });
  const lineMesh = new THREE.Mesh(lineGeo, lineMat); lineMesh.frustumCulled = false; lineMesh.renderOrder = 1; lineMesh.visible = false; lineMesh.position.y = 0.05; scene.add(lineMesh);
  const line = { z: 0, t: 0, k: 1 };
  // how far a ray from the line's middle runs before it is LPAD clear of the quay (the base square), capped at the line
  function quayGap(c, dx, dz, R) {
    let t = R;
    if (dx > 1e-4) t = Math.min(t, (BASE.x1 + LPAD - c[0]) / dx); if (dx < -1e-4) t = Math.min(t, (BASE.x0 - LPAD - c[0]) / dx);
    if (dz > 1e-4) t = Math.min(t, (BASE.z1 + LPAD - c[1]) / dz); if (dz < -1e-4) t = Math.min(t, (BASE.z0 - LPAD - c[1]) / dz);
    return Math.max(LIN + 1, t);
  }
  function buildLine(z, k) {
    // sim.js TUNE.lineOut (the furthest a boat steps) plus half a gunboat: bows reach the edge, never past; on the wide flat circle
    const L = LINES[z], a0 = Math.atan2(L.dir[1], L.dir[0]), H = lineCircle(L, L.r + 2 + LEDGE), R = H.r;
    // pushes out at an even walk easing in at the end (cubic ease-out finished most of it in 0.7 s; Top Force takes about 2 s)
    // third look: the sine ease-out still read as about 1 s (1-s frames: 85% out by the first); eased in and out, Top Force's
    // line visibly travels through 2:17 to 2:19
    const e = k >= 1 ? 1 : k * k * (3 - 2 * k), wet = new Float32Array((LSEG + 1) * 3);
    for (let i = 0; i <= LSEG; i++) {
      const a = a0 + lU[i * 3], dx = Math.cos(a), dz = Math.sin(a), q = quayGap(H.c, dx, dz, R), r = q + (R - q) * e + LWAV * Math.sin(lU[i * 3] * 6 + z) * e;
      for (let j = 0; j < 3; j++) {
        const v = i * 3 + j, rr = r + lD[v], x = H.c[0] + dx * rr, zz = H.c[1] + dz * rr;
        lPos[v * 3] = x; lPos[v * 3 + 1] = 0; lPos[v * 3 + 2] = zz; wet[v] = isWater(x, zz, 1, 1) ? 1 : 0;
      }
    }
    // soften where it meets land (and its two far ends) over a few segments
    for (let i = 0; i <= LSEG; i++) for (let j = 0; j < 3; j++) {
      let s = 0, n = 0; for (let o = -3; o <= 3; o++) { const ii = i + o; if (ii < 0 || ii > LSEG) { n++; continue; } s += wet[ii * 3 + j]; n++; }
      lM[i * 3 + j] = s / n;
    }
    lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.aM.needsUpdate = true;
  }
  function lineTick(S, dt, on) {
    const z = on && LINES[S.zone] && !['fight', 'fightReady', 'expand'].includes(S.phase) ? S.zone : 0, U = lineMat.uniforms;
    U.uTime.value = clock;
    if (z !== line.z) {
      if (line.z && U.uOp.value > 0) { U.uOp.value = Math.max(0, U.uOp.value - dt * 2.5); return; } // the old one fades first
      line.z = z; lineMesh.visible = !!z; if (!z) return;
      line.t = 0; line.k = frameId < 10 ? 1 : 0; buildLine(z, line.k); // already past it on load: no push-out
      if (line.k >= 1) U.uOp.value = 1;
    }
    if (!z) return;
    line.t += dt;
    if (line.k < 1) { line.k = clamp((line.t - 0.9) / 2.2, 0, 1); buildLine(z, line.k); }
    U.uOp.value = Math.min(1, Math.max(U.uOp.value, line.t / 0.4));
  }
  const debris = instPool(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 160); debris.castShadow = false; scene.add(debris);
  const debrisList = [];
  const shells = instPool(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 320); scene.add(shells);
  const shellStart = new WeakMap();

  // ---------------------------------------------------------------- camera
  const cam = { tx: 4, tz: -2, zoom: 1.1, gx: 4, gz: -2, gzoom: 1.1, yaw: -45 * DEG, gyaw: -45 * DEG, follow: true, lock: false, vx: 0, vz: 0 };
  let W = 1, H = 1, odpr = 1, shake = 0;
  // r5 juice: trauma shake (ST style). Each source adds trauma up to its own cap, it never stacks past the cap,
  // the offset is trauma squared, and it decays fast. QA mode adds none.
  const QAV = document.documentElement.classList.contains('qa') || !!window.__PROTO_QA;
  function addShake(a, cap = 1) { if (QAV) return; if (shake < cap) shake = Math.min(cap, shake + a); }
  function resize() {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    odpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(W * odpr); overlay.height = Math.round(H * odpr);
    const bh = H * renderer.getPixelRatio();
    glow.U.uScale.value = puff.U.uScale.value = bh / (2 * Math.tan(FOV * DEG / 2));
    VIG.uVig.value.set(1 / (W * renderer.getPixelRatio()), 1 / bh);
  }
  const dist = () => (VIEW_W / cam.zoom) / (2 * Math.tan(FOV * DEG / 2) * camera.aspect);
  // the pan limits, as (along the screen, into the screen) from the harbor; round 6: 95 to 104 along the screen, so the
  // mission 40 armada shot can hold on the armada with our line at the left edge (Top Force 12:40: 1 to 7 greens at the edge)
  const inPan = (x, z) => { let sr = (x + z) * R2, su = (x - z) * R2; sr = clamp(sr, -60, 104); su = clamp(su, -40, 215); return [(sr + su) * R2, (sr - su) * R2]; };
  function clampCam() {
    if (cam.lock) return;
    [cam.tx, cam.tz] = inPan(cam.tx, cam.tz);
  }
  let sox = 0, soz = 0;
  function placeCamera() {
    const d = dist(), hx = Math.cos(cam.yaw), hz = Math.sin(cam.yaw), ty = 1;
    const x = cam.tx + sox, z = cam.tz + soz;
    camera.position.set(x - hx * Math.cos(PITCH) * d, ty + Math.sin(PITCH) * d, z - hz * Math.cos(PITCH) * d);
    camera.lookAt(x, ty, z);
    camera.updateMatrixWorld();
  }
  function focus(x, z, zoom, instant) {
    // round 6: a goal past the pan limits was never reached (the clamp held the camera short), so the camera never read
    // as settled and FIGHT 40, which waits for a settled camera, never showed; story spots read off the goal were off too
    if (!cam.lock) [x, z] = inPan(x, z);
    cam.gx = x; cam.gz = z; if (zoom) cam.gzoom = clamp(zoom, ZWIDE, ZSCRIPT); cam.follow = true; cam.vx = cam.vz = 0;
    if (instant) { cam.tx = x; cam.tz = z; if (zoom) cam.zoom = cam.gzoom; }
  }
  // Put world point (x, z) at height fy of the screen (0 top, 1 bottom), e.g. above the dialogue box.
  function focusAt(x, z, zoom, fy = 0.5, instant) {
    const zz = clamp(zoom || cam.gzoom, ZWIDE, ZSCRIPT), d = (VIEW_W / zz) / (2 * Math.tan(FOV * DEG / 2) * camera.aspect);
    const a = Math.atan((1 - 2 * fy) * Math.tan(FOV * DEG / 2));
    const off = Math.sin(PITCH) * d / Math.tan(PITCH - a) - Math.cos(PITCH) * d;
    focus(x - Math.cos(cam.gyaw) * off, z - Math.sin(cam.gyaw) * off, zz, instant);
  }
  function setYaw(deg, instant) { cam.gyaw = deg * DEG; if (instant) cam.yaw = cam.gyaw; }

  // world (x, z, height) -> css px inside the canvas
  const V = new THREE.Vector3();
  function w2s(x, z, y = 0) { V.set(x, y, z).project(camera); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H]; }
  // where (x, z) will sit once the camera has eased onto its goal (story scenes pick spots while the camera still moves)
  function w2sGoal(x, z, y = 0) {
    const k = [cam.tx, cam.tz, cam.zoom, cam.yaw];
    if (cam.follow) { cam.tx = cam.gx; cam.tz = cam.gz; }
    if (cam.gzoom) cam.zoom = cam.gzoom; if (cam.gyaw != null) cam.yaw = cam.gyaw;
    placeCamera(); const r = w2s(x, z, y);
    [cam.tx, cam.tz, cam.zoom, cam.yaw] = k; placeCamera(); return r;
  }
  function ppu(x, z, y = 0) { const a = w2s(x, z, y), rx = -Math.sin(cam.yaw), rz = Math.cos(cam.yaw), b = w2s(x + rx, z + rz, y); return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  // ---------------------------------------------------------------- input: drag to pan (with a little glide), pinch or wheel to zoom, tap
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), N2 = new THREE.Vector2();
  function pick(c, sx, sy) { N2.set(sx / W * 2 - 1, -(sy / H) * 2 + 1); ray.setFromCamera(N2, c); const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; }
  const ptrs = new Map();
  let drag = null, pinch = null, onTap = null, lastInput = -1e9;
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function startDrag(x, y) { drag = { x0: x, y0: y, tx: cam.tx, tz: cam.tz, c: camera.clone(), moved: drag ? drag.moved : false, hist: [] }; drag.p0 = pick(drag.c, x, y); }
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = local(e); ptrs.set(e.pointerId, [x, y]);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    cam.vx = cam.vz = 0;
    if (ptrs.size === 1) { drag = null; startDrag(x, y); drag.moved = false; }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: cam.zoom }; if (drag) drag.moved = true; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = local(e); ptrs.set(e.pointerId, [x, y]);
    if (cam.lock) return;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      lastInput = performance.now(); cam.zoom = cam.gzoom = clamp(pinch.z0 * d / pinch.d0, ZMIN, ZMAX); return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 8) drag.moved = true;
    if (!drag.moved || !drag.p0) return;
    const p1 = pick(drag.c, x, y); if (!p1) return;
    lastInput = performance.now();
    cam.tx = cam.gx = drag.tx + (drag.p0.x - p1.x); cam.tz = cam.gz = drag.tz + (drag.p0.z - p1.z); cam.follow = false;
    clampCam();
    drag.hist.push([performance.now(), cam.tx, cam.tz]); if (drag.hist.length > 6) drag.hist.shift();
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = local(e); ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { pinch = null; const [q] = [...ptrs.values()]; startDrag(q[0], q[1]); drag.moved = true; return; }
    if (ptrs.size === 0) {
      if (drag && !drag.moved && onTap && e.type === 'pointerup') onTap(x, y);
      if (drag && drag.moved && drag.hist.length >= 2 && !cam.lock) {
        const a = drag.hist[0], b = drag.hist[drag.hist.length - 1], dt = (b[0] - a[0]) / 1000;
        if (dt > 0.01 && performance.now() - b[0] < 80) { cam.vx = clamp((b[1] - a[1]) / dt, -160, 160); cam.vz = clamp((b[2] - a[2]) / dt, -160, 160); }
      }
      drag = null; pinch = null;
    }
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (cam.lock) return; lastInput = performance.now(); cam.zoom = cam.gzoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), ZMIN, ZMAX); }, { passive: false });

  // ---------------------------------------------------------------- effects
  const FIRE = rgb(0xffc24a), FIRE2 = rgb(0xff5a1f), WHITE = [1, 1, 1], SMOKE = rgb(0x5d5d66), SMOKE_L = rgb(0xb9bcc4), FOAM = rgb(0xf4fbff);
  function flash(x, y, z, s, c = rgb(0xfff0b0)) { glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.11, s0: s, s1: s * 1.5, c, a: 1 }); }
  function ring(x, z, s, life = 0.7, y = 0.12, c = [0.9, 0.95, 1]) { if (ringList.length < 96) ringList.push({ x, y, z, s, life, t: 0, c }); }
  function redRing(x, z, s, life, y) { ring(x, z, s, life, y, [0.6, 0.07, 0.04]); if (darkList.length < 64) darkList.push({ x, y: y - 0.01, z, s, life, t: 0, c: [1, 0.32, 0.26] }); }
  function splash(x, z, s) {
    for (let i = 0; i < 8 * s; i++) { const a = rnd(0, TAU), v = rnd(0.5, 2.5) * s; puff.add({ x, y: 0.3, z, vx: Math.cos(a) * v, vy: rnd(6, 11) * s, vz: Math.sin(a) * v, grav: 26, life: rnd(0.5, 0.8), s0: 0.9 * s, s1: 1.6 * s, c: FOAM, a: 0.95, fo: 2 }); }
    ring(x, z, 2.2 * s, 0.7);
  }
  // look review 13 (after-fight, mission 40): the outpost's blasts threw puffs up to 7x their size that rolled over our front
  // boats' bows; an outpost blast (tight) keeps its smoke small, slow and on the camp (Top Force 6:28: the smoke stays on the base)
  function boom(x, y, z, s, debrisN = 0, tight = false) {
    flash(x, y + 0.5, z, 7 * s);
    for (let i = 0; i < 10 * s; i++) { const a = rnd(0, TAU), v = rnd(1, 6) * s; glow.add({ x, y: y + rnd(0, 1), z, vx: Math.cos(a) * v, vy: rnd(1, 5) * s, vz: Math.sin(a) * v, drag: 3, life: rnd(0.35, 0.6), s0: rnd(2, 3.5) * s, s1: rnd(3.5, 5.5) * s, c: FIRE, c1: FIRE2, a: 0.95, fo: 1.5 }); }
    for (let i = 0; i < 8 * s; i++) { const a = rnd(0, TAU), v = rnd(8, 18) * s; glow.add({ x, y: y + 0.5, z, vx: Math.cos(a) * v, vy: rnd(4, 14), vz: Math.sin(a) * v, grav: 30, drag: 1, life: rnd(0.3, 0.6), s0: 0.6, s1: 0.2, c: rgb(0xfff2a8), a: 1 }); }
    for (let i = 0; i < 5 * s; i++) { const a = rnd(0, TAU), v = (tight ? rnd(0.2, 0.7) : rnd(0.5, 2)) * s, sp = tight ? 0.5 : 1; puff.add({ x: x + rnd(-sp, sp) * s, y: y + rnd(1, 2), z: z + rnd(-sp, sp) * s, vx: Math.cos(a) * v, vy: rnd(2, 4), vz: Math.sin(a) * v, drag: tight ? 1.4 : 0.8, life: tight ? rnd(1.1, 1.6) : rnd(1.4, 2.2), s0: (tight ? 1.8 : 2.5) * s, s1: (tight ? 3.8 : 7) * s, c: SMOKE, c1: SMOKE_L, a: 0.75, fin: 0.12 }); }
    ring(x, z, 4 * s, 0.8);
    for (let i = 0; i < debrisN; i++) { const a = rnd(0, TAU), v = rnd(4, 10); if (debrisList.length < 160) debrisList.push({ x, y: y + 1, z, vx: Math.cos(a) * v, vy: rnd(7, 15), vz: Math.sin(a) * v, rx: rnd(0, 3), ry: rnd(0, 3), wx: rnd(-9, 9), wy: rnd(-9, 9), s: rnd(0.35, 0.9), c: Math.random() < 0.5 ? 0x4a4f5c : 0x7d5030, t: 0 }); }
  }
  function sparkle(x, y, z, n = 18, c = rgb(0xffe27a), spread = 4) {
    for (let i = 0; i < n; i++) glow.add({ x: x + rnd(-spread, spread), y: y + rnd(0, 2), z: z + rnd(-spread, spread), vx: 0, vy: rnd(4, 9), vz: 0, drag: 1.5, life: rnd(0.7, 1.2), s0: rnd(0.8, 1.4), s1: 0.2, c, a: 1 });
    ring(x, z, spread * 1.6, 0.9, y + 0.1, [1, 0.9, 0.5]);
  }
  function smokeAt(x, y, z, s = 1, dark = true) { puff.add({ x: x + rnd(-0.4, 0.4), y, z: z + rnd(-0.4, 0.4), vx: rnd(0.6, 1.4), vy: rnd(2.5, 4), vz: rnd(-0.3, 0.3), drag: 0.3, life: rnd(1.6, 2.6), s0: 1.4 * s, s1: 4.5 * s, c: dark ? SMOKE : SMOKE_L, c1: SMOKE_L, a: dark ? 0.7 : 0.5, fin: 0.15 }); }
  // look review 4 (bossdown): additive sparks stacked into a white camera flash; Top Force 13:18 is one big orange-red
  // fireball with dark edges under a black smoke column. Normal-blended puffs: orange that darkens to soot as they grow
  function fireball(x, y, z, s = 1) {
    for (let i = 0; i < 16; i++) { const a = rnd(0, TAU), r = rnd(0, 1.3) * s, v = rnd(1, 3) * s; puff.add({ x: x + Math.cos(a) * r, y: y + rnd(-0.5, 1.2) * s, z: z + Math.sin(a) * r, vx: Math.cos(a) * v, vy: rnd(2, 5), vz: Math.sin(a) * v, drag: 1.6, life: rnd(1, 1.5), s0: rnd(3, 4.5) * s, s1: rnd(6.5, 8.5) * s, c: rgb(0xff7a1c), c1: rgb(0x2b2321), a: 0.96, fin: 0.04 }); }
    for (let i = 0; i < 5; i++) glow.add({ x: x + rnd(-0.6, 0.6) * s, y: y + rnd(0, 1) * s, z: z + rnd(-0.6, 0.6) * s, vx: 0, vy: rnd(1, 2), vz: 0, life: rnd(0.35, 0.55), s0: 3.2 * s, s1: 1.2 * s, c: rgb(0xffd25a), c1: FIRE2, a: 0.8 });
  }
  function smokeColumn(x, y, z, s = 1) { for (let i = 0; i < 3; i++) puff.add({ x: x + rnd(-1, 1) * s, y: y + rnd(0, 2) * s, z: z + rnd(-1, 1) * s, vx: rnd(-0.4, 0.4), vy: rnd(4, 7), vz: rnd(-0.4, 0.4), drag: 0.35, life: rnd(2, 3), s0: 2.6 * s, s1: 7.5 * s, c: rgb(0x2a2a30), c1: SMOKE, a: 0.82, fin: 0.1 }); }
  function fireAt(x, y, z, s = 1) { glow.add({ x: x + rnd(-0.6, 0.6) * s, y, z: z + rnd(-0.6, 0.6) * s, vx: 0, vy: rnd(1.5, 3), vz: 0, life: rnd(0.3, 0.55), s0: 1.8 * s, s1: 0.6 * s, c: FIRE, c1: FIRE2, a: 0.9 }); }

  // ---------------------------------------------------------------- buildings and zones (rebuilt when state changes, with a pop)
  const slots = {}, pops = [], bounces = [];
  let firstScene = true;
  function wrapAt(mesh, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); mesh.position.set(-x, -y, -z); g.add(mesh); return g; }
  function put(name, key, make, pop) {
    const s = slots[name];
    if (s && s.key === key) return false;
    if (s && s.obj) scene.remove(s.obj);
    const obj = key == null ? null : make();
    if (obj) { scene.add(obj); if (pop && !firstScene) { pops.push({ obj, t: 0, base: obj.scale.clone() }); obj.scale.setScalar(0.01); } }
    slots[name] = { key, obj };
    return !!s;
  }
  function shedGroup(slot) { const g = new THREE.Group(); g.add(slipModel(slot)); const s = shedModel(slot); g.add(s); g.userData.shed = s; return g; }
  function zoneGroup(n, mode) {
    const m = zoneModel(n, mode), [cx, cz] = ZONES[n].at, g = wrapAt(m, cx, 0, cz);
    g.userData.smoke = m.userData.smoke; g.userData.mode = mode;
    g.userData.guns = m.userData.guns.map(p => { const c = cannonMesh(); c.position.set(p[0] - cx, p[1], p[2] - cz); c.rotation.y = rnd(0, TAU); g.add(c); return c; });
    return g;
  }
  let sceneState = null, hqHold = null, hqWob = 0;
  function setScene(st) {
    const key = JSON.stringify(st);
    if (sceneState === key) return;
    const prev = sceneState ? JSON.parse(sceneState) : null;
    sceneState = key;
    const big = st.stage >= 3;
    put('quay', big ? 3 : 1, () => quayModel(big ? 3 : 1));
    if (prev && prev.stage < 3 && big) {
      for (const r of [WHARF, PIER]) for (let i = 0; i < 6; i++) boom(rnd(r[0], r[1]), Y0, rnd(r[2], r[3]), 0.5);
      sparkle((WHARF[0] + WHARF[1]) / 2, Y0, (WHARF[2] + WHARF[3]) / 2, 30, undefined, 10);
    }
    for (const [k, slot] of [['gunboat', 'W1'], ['torpedo', 'S1'], ['destroyer', 'W2']]) {
      const S3 = SHEDS3D[slot];
      const changed = put(slot, st.built[k] ? 'b' : st.plots[k] ? 'p' : null, () => (st.built[k] ? shedGroup(slot) : (() => { const p = plotModel(S3.w, S3.d, Y0 + 0.08); p.position.set(S3.at[0], 0, S3.at[1]); return p; })()), true);
      if (changed && st.built[k]) { dust(S3.at[0], S3.at[1], S3.w * 0.6); sparkle(S3.at[0], Y0 + 4, S3.at[1], 26, undefined, S3.w * 0.4); }
    }
    {
      const ch = put('repair', st.built.repair ? 'b' : st.plots.repair ? 'p' : null, () => (st.built.repair ? repairDockModel() : (() => { const p = plotModel(11, 11, 0.35); p.position.set(REPAIR_AT[0], 0, REPAIR_AT[1]); return p; })()), true);
      if (ch && st.built.repair) { splash(REPAIR_AT[0], REPAIR_AT[1], 1.6); sparkle(REPAIR_AT[0], 2, REPAIR_AT[1], 20, rgb(0x7dff9a), 5); }
    }
    const hqN = hqHold != null ? Math.min(hqHold, st.hq) : st.hq; // r5 juice (D17): the old HQ stays until the camera has pulled back
    if (put('hq', hqN, () => hqModel(hqN), true)) { dust(HQ_AT[0], HQ_AT[1], 10); sparkle(HQ_AT[0], Y0 + 8, HQ_AT[1], 34, undefined, 8); }
    put('gun', 1, () => shoreGunModel());
    for (const n of [2, 3, 4]) {
      const mode = st['zone' + n], model = mode === 'fog' ? 'active' : mode;
      const was = slots['z' + n] && slots['z' + n].key;
      put('z' + n, model, () => zoneGroup(n, model), model === 'ours');
      if (was === 'active' && model === 'wreck') zoneBlast(n);
      if (was && model === 'ours' && was !== 'ours') { const [cx, cz] = ZONES[n].at; sparkle(cx, 2, cz, 40, rgb(0x9fd8ff), 12); }
    }
    setWater(big ? 3 : st.built.repair ? 2 : 1);
    // sea fog: open circles around what the player owns or fights over
    const circ = [[4, -2, big ? 122 : 96], [...ZONES[2].at, 46]];
    if (st.zone3 !== 'fog') circ.push([...ZONES[3].at, 52]);
    if (st.zone4 !== 'fog') circ.push([...ZONES[4].at, 58]);
    // round 6: the mission 40 armada shot holds east of the raft camp (Top Force 12:40 to 13:38 holds on the red horde)
    // and a third of it was sea fog; open the water there from mission 40 on, kept clear of the anchorage (zone 4)
    if (st.east) circ.push([150, 70, 120]);
    fog.setReveal(circ, firstScene);
    firstScene = false;
  }
  function dust(x, z, s) { for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), v = rnd(3, 7); puff.add({ x: x + Math.cos(a) * s * 0.4, y: Y0 + 0.5, z: z + Math.sin(a) * s * 0.4, vx: Math.cos(a) * v, vy: rnd(0.5, 2), vz: Math.sin(a) * v, drag: 2.5, life: rnd(0.8, 1.3), s0: 2.5, s1: 6, c: rgb(0xe9dfc8), a: 0.75 }); } ring(x, z, s, 0.8, Y0 + 0.15, [1, 0.95, 0.8]); }
  const blasts = [];
  // look review 12 (080, after-fight 1): blasts up to 0.7 of the camp's radius out, the last and biggest one too, threw
  // their fireball, shock ring and dark smoke over our front boats, which read as our own boats being hit; Top Force 6:28
  // keeps the blast on the camp, so the small ones stay within 0.4 of the radius and the big one goes off in the middle
  function zoneBlast(n) { const [cx, cz] = ZONES[n].at, r = ZONES[n].r; for (let i = 0; i < 9; i++) blasts.push({ at: i * 0.16, x: i === 8 ? cx : cx + rnd(-r, r) * 0.4, z: i === 8 ? cz : cz + rnd(-r, r) * 0.4, s: i === 8 ? 2.2 : rnd(0.9, 1.5), tight: true }); addShake(0.3, 0.5); }

  // ---------------------------------------------------------------- story props (gift, chest, captive Bram, castaway, Skye)
  // main.js lists them every frame: { id, kind, x, z, y, s, drop, hop, bob, wave, face, glow, ry, roll }
  const props = new Map();
  const crew = crewLayer(scene); // round 7: sailors, officers and the arming table on the quay
  function propsTick(list, dt, t) {
    const seen = new Set();
    for (const p of list || []) {
      seen.add(p.id);
      let r = props.get(p.id);
      const s0 = p.s || 1;
      if (!r || r.kind !== p.kind) {
        if (r) { scene.remove(r.obj); if (r.shadow) scene.remove(r.shadow); }
        const inner = propModel(p.kind), obj = new THREE.Group(); obj.add(inner); obj.scale.setScalar(s0); scene.add(obj);
        r = { kind: p.kind, obj, inner, t: 0, landed: !p.drop, rt: 0 }; props.set(p.id, r);
        // look review 10 (after-fight 1): caught mid-fall the chest hung over the sea with nothing under it, like the floating
        // gift the owner flagged (Image #4); a soft shadow on the deck grows as it comes down
        if (p.drop) { r.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b2233, transparent: true, opacity: 0, depthWrite: false })); r.shadow.renderOrder = 5; scene.add(r.shadow); }
        // re-shoot after look review 11 (fin7 x0): the zone 3 chest lands on the outpost centre while it blows up, so its shadow
        // lay under the hut wreck, the debris and the fireball and could not be seen; while the chest is still high it is drawn
        // over them (renderOrder 5, after the fire), and only near the ground does it go back under what stands on the deck
      }
      r.t += dt;
      const o = r.obj, ud = r.inner.userData;
      o.position.set(p.x, p.y || 0, p.z);
      if (!r.landed) { // falls from the sky, lands with a dust ring and a little shake
        const k = Math.min(1, r.t / 0.5); o.position.y += (1 - k * k) * 30;
        if (r.shadow) { r.shadow.position.set(p.x, (p.y || 0) + 0.14, p.z); r.shadow.scale.setScalar(s0 * (2.1 + 0.6 * k)); r.shadow.material.opacity = 0.42 + 0.2 * k; r.shadow.material.depthTest = k > 0.8; } // re-shoot (x0): the first one was narrower than the chest and too faint to read; look review 11 (after-fight 1): still half the chest's width (the chest high up is nearer the camera and looks bigger) and lost among the blast debris
        if (k >= 1) { if (r.shadow) { scene.remove(r.shadow); r.shadow = null; } r.landed = true; r.squash = 0; dust(p.x, p.z, 5 * s0); shake = Math.max(shake, 0.14); }
      }
      if (r.squash != null) { r.squash += dt; const q = Math.min(1, r.squash / 0.4), w = Math.sin(q * Math.PI * 2) * 0.22 * (1 - q); o.scale.set(s0 * (1 + w), s0 * (1 - w * 1.3), s0 * (1 + w)); if (q >= 1) { r.squash = null; o.scale.setScalar(s0); } }
      if (r.landed && p.hop && r.squash == null) { const ph = (t * 1.2) % 1, h = ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : 0; o.position.y += h * 0.9 * s0; o.scale.set(s0 * (1 - h * 0.04), s0 * (1 + h * 0.06), s0 * (1 - h * 0.04)); }
      if (p.bob) { o.position.y += Math.sin(t * 2.2 + p.x) * 0.22; o.rotation.z = Math.sin(t * 1.7 + p.z) * 0.05; o.rotation.x = Math.sin(t * 1.3) * 0.04; }
      if (p.ry != null) o.rotation.y = p.ry;
      if (ud.walker || ud.rotors) animate7(ud, dt, t, !!p.walk, false); // round 8: Ironjaw's mothership hovers, rotors turning, before the mission 40 fight
      if (p.roll != null) o.rotation.z = p.roll; // a prop boat rolling over as it sinks
      if (p.face && ud.person) ud.person.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - o.rotation.y;
      else if (p.face) o.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      if (ud.arm) ud.arm.rotation.z = p.wave ? 2.55 + Math.sin(t * 9 + p.x) * 0.45 : 0.1;
      if (ud.guard && ud.person) { ud.guard.rotation.y = ud.person.rotation.y - 0.5; ud.guard.userData.arm.rotation.z = 0.5 + Math.sin(t * 2.6) * 0.18; } // Bram's guard turns half to him, cutlass up
      if (p.glow && r.landed) { r.rt -= dt; if (r.rt <= 0) { r.rt = 0.9; ring(p.x, p.z, 5.5 * s0, 1.0, (p.y || 0) + 0.2, [1, 0.82, 0.3]); } }
    }
    for (const [id, r] of props) if (!seen.has(id)) { scene.remove(r.obj); if (r.shadow) scene.remove(r.shadow); props.delete(id); }
  }

  // ---------------------------------------------------------------- boats
  const units = new Map(), fireRec = new Map();
  let frameId = 0, clock = 0;
  // Look tier of our boats from shed level (1: Lv 1-19, 2: Lv 20-39, 3: Lv 40+); the FIGHT state has no sheds, so keep the last.
  const lastTier = {};
  function shipTier(S, key) { const s = S.sheds && S.sheds[key]; if (s) lastTier[key] = s.lv >= 40 ? 3 : s.lv >= 20 ? 2 : 1; return lastTier[key] || 1; }
  // Pirate look tier from the mission number (1: missions 1-19, 2: 20-39, 3: 40+); the FIGHT state has no mission, so keep the last.
  let lastPirate = 1;
  function pirateTier(S) { const mn = S.m && S.m.n != null ? S.m.n : S.mission; if (typeof mn === 'number') lastPirate = mn >= 40 ? 3 : mn >= 20 ? 2 : 1; return lastPirate; }
  // round 8 (owner 2026-11-13 "helicoter, motherships, drones"): fliers (ud.fly, units7 assemble) hover over a soft shadow
  // on the water, push a downwash ring instead of a foam wake, dip their nose while flying and fall when shot down
  const SHADOW_GEO = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0b2233, transparent: true, opacity: 0.3, depthWrite: false });
  // round 8 (owner 2026-11-14 03:27 "super croweded ... they all cluttered together"): in the round 7 recordings our drawn
  // boats were 9.4% of the screen width with the next boat about 1.0 drawn lengths away (centre to centre), against Top
  // Force's green blobs at about 6% and 1.95 body heights apart; boats, helicopters and raiders are drawn smaller (bosses,
  // motherships and the airship keep their size); hits and spacing use the sim's own lengths
  // R-300 round 8 review: drones (0.9) and pirate helicopters (gunship tier 2+, 0.75) read as specks in the recording, so the
  // fliers are drawn bigger than the boats they fly among (their count stays small, so the crowding numbers barely move)
  // R-300 round 8 third review: at 1.6 the drones were 10 px red crosses, not drones at a glance; 2.3 plus the pale prop discs
  const DRAW = { gunboat: 0.66, torpedo: 0.66, destroyer: 0.82, raider: 0.7, gunship: 0.75, drone: 2.3 };
  const AIR_DRAW = { gunship: [0, 0.75, 1.05, 0.85] }; // by pirate tier: 1 a boat, 2 the gunship helicopter (9 long), 3 the tandem (12 long, final fight)
  const drawOf = (key, tier) => (AIR_DRAW[key] && AIR_DRAW[key][tier]) || DRAW[key] || 1;
  const drawBig = (u, key, tier) => (u.big || 1) * drawOf(key, tier);
  function unitRec(u, side, key, tier = 1) {
    let r = units.get(u.id);
    if (r && (r.key !== key || (r.tier !== tier && !r.dying))) { scene.remove(r.obj); r = null; }
    if (!r) {
      const obj = boatModel(key, tier); scene.add(obj);
      if (obj.userData.fly) { const sh = new THREE.Mesh(SHADOW_GEO, shadowMat); sh.renderOrder = 5; sh.position.y = 0.08; sh.scale.set(obj.userData.len * 0.42, 1, obj.userData.beam * 0.55); obj.add(sh); }
      r = { id: u.id, key, tier, side, obj, ud: obj.userData, h: Math.atan2(u.vz || 1, u.vx || 0), turn: 0, seen: 0, gone: 0, dying: null, recoil: 0, wakeT: 0, smokeT: 0, born: u.adopt ? 1 : 0, flashT: 0, mat: null }; // u.adopt: a moored cold-open boat that sails out armed (round 6)
      // R-300 round 7 third look: the mission 39 leader's red hp number sat on its top; its bar clears it by 3
      r.barY = new THREE.Box3().setFromObject(obj).max.y * drawBig(u, key, tier) + (key === 'airship' ? 3 : 1.2); // health bar just above the tallest mast, whatever the tier and scale
      units.set(u.id, r);
    }
    return r;
  }
  function setMat(r, m) { if (r.mat === m) return; r.mat = m; r.ud.hull.material = m; for (const t of r.ud.turrets) t.material = m; for (const p of r.ud.parts || []) p.material = m; }
  const TV = new THREE.Vector3();
  function stern(r, side) { // world point at the stern (side -1/1 for the quarters)
    const L = r.ud.len * (r.big || 1), B = r.ud.beam * (r.big || 1), c = Math.cos(r.h), s = Math.sin(r.h), lx = -L * 0.48, lz = side * B * 0.32;
    return [r.obj.position.x + c * lx - s * lz, r.obj.position.z + s * lx + c * lz];
  }
  function unitTick(u, side, key, dt, tier) {
    const r = unitRec(u, side, key, tier); r.seen = frameId; r.gone = 0;
    if (r.dying) return r;
    r.born += dt;
    let th = Math.atan2(u.vz || 0, u.vx || 0.0001);
    // R-300 round 8 sixth review (pair air39): sailing at our quay the mission 39 airship faced the camera nose first, a cream
    // upright cylinder with red bands that read as a lighthouse; it drifts side on to the camera (as on the model page), nose
    // to whichever side of the screen it is heading, and only swaps side when it clearly heads the other way
    if (key === 'airship') {
      const rx = -Math.sin(cam.yaw), rz = Math.cos(cam.yaw), s = (u.vx || 0) * rx + (u.vz || 0) * rz, sp = Math.hypot(u.vx || 0, u.vz || 0);
      if (r.side == null || Math.abs(s) > sp * 0.35 + 0.05) r.side = s < 0 ? -1 : 1;
      th = cam.yaw + r.side * Math.PI / 2;
    }
    const dh = wrapA(th - r.h); r.h += dh * Math.min(1, dt * 4.5); r.turn += (dh - r.turn) * Math.min(1, dt * 4);
    // L13: u.big draws a unit larger (mission 20's flagship 1.15x, mission 40's 1.6x); its wake, ripple and bar scale with it
    const big = drawBig(u, key, tier); r.big = big; const fly = r.ud.fly || 0;
    const o = r.obj, L = r.ud.len * big;
    o.position.set(u.x, Math.sin(clock * 2.1 + u.id) * 0.1, u.z);
    o.rotation.y = -r.h;
    const sc = r.born < 0.35 ? 0.4 + 0.6 * (1 - Math.pow(1 - r.born / 0.35, 3)) : 1; o.scale.setScalar(sc * big);
    const roll = r.ud.roll;
    roll.rotation.x = Math.sin(clock * 1.7 + u.id * 1.3) * 0.035 + clamp(r.turn, -0.8, 0.8) * 0.22;
    roll.rotation.z = Math.sin(clock * 1.3 + u.id * 2.1) * 0.018 + (u.moving ? (fly ? -0.13 : 0.035) : 0) + r.recoil * 0.05;
    r.recoil = Math.max(0, r.recoil - dt * 5);
    // r5: hit flash is throttled. A fresh hit (hitT went up) flashes 0.09 s; big ships at most every 0.3 s;
    // the boss only tints 35% white. The hull also knocks a little.
    r.u = u;
    if (u.hitT > (r.hitT0 || 0) + 1e-4) {
      const big = key === 'destroyer' || key === 'gunship' || key === 'boss' || key === 'airship';
      if (!big || clock - (r.lastFlash ?? -9) >= 0.3) { r.flashT = Math.max(r.flashT, 0.09); r.lastFlash = clock; }
      r.recoil = Math.max(r.recoil, 0.7);
    }
    r.hitT0 = u.hitT;
    r.flashT = Math.max(0, r.flashT - dt);
    setMat(r, r.flashT > 0 ? (key === 'boss' ? BOSS_MAT : MAT.flash) : MAT.solid);
    // turrets follow the last target for a moment after firing, then swing back
    const fr = fireRec.get(u.id), aiming = fr && clock - fr.t < 2.2;
    for (const tm of r.ud.turrets) {
      let want = tm.userData.rest;
      if (aiming) want = r.h - Math.atan2(fr.z - u.z, fr.x - u.x);
      tm.rotation.y += wrapA(want - tm.rotation.y) * Math.min(1, dt * 7);
    }
    // round 7 / 8: rotors spin, fliers hover (units7.js animate7)
    if (r.ud.walker || r.ud.legs) animate7(r.ud, dt, clock, !!u.moving, !!(fr && clock - fr.t < 0.5));
    // foam wake while sailing, a soft ripple while waiting
    r.wakeT -= dt;
    if (r.wakeT <= 0) {
      r.wakeT = fly ? (u.moving ? 0.22 : 0.5) : u.moving ? 0.05 : 0.5;
      const s = 0.6 + L * 0.07;
      if (fly && side === 'them' && !u.moving) redRing(u.x, u.z, L * 0.45, 1.4, 0.1);
      else if (fly && (u.moving || (!stillNow && !calloutLive()))) ring(u.x, u.z, L * 0.5, 0.6, 0.1, [0.85, 0.93, 1]);
      else if (u.moving) {
        for (const sd of [-1, 1]) {
          const [wx, wz] = stern(r, sd), ox = Math.cos(r.h + sd * 1.9), oz = Math.sin(r.h + sd * 1.9);
          puff.add({ x: wx, y: 0.15, z: wz, vx: ox * 1.6, vy: 0, vz: oz * 1.6, drag: 1.2, life: rnd(1.1, 1.5), s0: s * 1.2, s1: s * 3.0, c: FOAM, a: 0.85 });
        }
        const [bx, bz] = [u.x + Math.cos(r.h) * L * 0.45, u.z + Math.sin(r.h) * L * 0.45];
        if (Math.random() < 0.5) puff.add({ x: bx, y: 0.2, z: bz, vx: rnd(-1, 1), vy: rnd(1, 2.5), vz: rnd(-1, 1), grav: 8, life: 0.45, s0: s, s1: s * 1.8, c: FOAM, a: 0.8 });
      } else if (side === 'them') redRing(u.x, u.z, L * 0.55, 1.4, 0.1);
      else {
        // look review 9 (after-fight): a boat being nudged apart is not "moving", so it left a trail of empty rings behind it;
        // the ripple only goes under a boat that really sat still since the last one
        const sat = r.rx != null && Math.hypot(u.x - r.rx, u.z - r.rz) < 0.3; r.rx = u.x; r.rz = u.z;
        if (sat && !stillNow && !calloutLive()) { ring(u.x, u.z, L * 0.55, 1.4, 0.1, [0.45, 0.5, 0.55]); const q = ringList[ringList.length - 1]; if (q && q.x === u.x && q.z === u.z) q.idle = 1; } // look review 8: no idle ripple under one frozen boat in a story pause, none under a big banner
      }
    }
    // burning when badly hurt; funnel smoke on big ships
    r.smokeT -= dt;
    if (r.smokeT <= 0) {
      r.smokeT = 0.14;
      if (u.hp < u.max * 0.4) { smokeAt(u.x, 2.5 + fly * big, u.z, 0.8); fireAt(u.x, 2.2 + fly * big, u.z, 0.8); }
      for (const f of r.ud.funnels) { TV.set(...f); r.ud.roll.localToWorld(TV); smokeAt(TV.x, TV.y, TV.z, key === 'boss' ? 1.1 : 0.6, key === 'boss'); }
    }
    return r;
  }
  let stillNow = false, hushTo = 0;
  const flyH = id => { const r = id != null && units.get(id); return r && r.ud.fly ? r.ud.fly * (r.big || 1) : 0; };
  // re-shoot after look review 10 (fin8 burst): the outpost's 0.3 slow-mo kept two big ripples under the fleet; main.js hushes them for the slow-mo
  const hushRings = s => { hushTo = performance.now() + s * 1000; };
  // look review 8 (079): drop every boat the map's rules do not own (the fight's squads and its sinking flagship)
  function dropStray(S) { const own = new Set([...S.ships, ...S.enemies].map(u => u.id)); for (const [id, r] of units) if (!own.has(id)) { scene.remove(r.obj); units.delete(id); } }
  function dyingTick(r, dt) {
    const d = r.dying; d.t += dt;
    const o = r.obj;
    o.position.y = -Math.pow(d.t, 1.5) * 1.3 * (r.big || 1);
    // round 8: a flier falls out of the sky spinning, and splashes down
    const rl = r.ud.roll;
    if (r.ud.fly && rl.position.y > 0) { rl.position.y = Math.max(0, rl.position.y - dt * (5 + d.t * 22)); if (r.ud.len * (r.big || 1) < 15) rl.rotation.y += dt * 6; if (rl.position.y === 0) splash(o.position.x, o.position.z, 0.5 + r.ud.len * (r.big || 1) * 0.06); }
    r.ud.roll.rotation.x += dt * 0.7 * d.side; r.ud.roll.rotation.z += dt * 0.22;
    d.fx -= dt;
    if (d.fx <= 0) { d.fx = 0.12; const p = o.position; smokeAt(p.x, 1.5, p.z, r.key === 'boss' ? 1.6 * (r.big || 1) : 1); if (d.t < (r.big > 1 ? 2.2 : 1)) fireAt(p.x, 1.5, p.z, r.key === 'boss' ? 2 * (r.big || 1) : 1); puff.add({ x: p.x + rnd(-2, 2), y: 0.2, z: p.z + rnd(-2, 2), vx: 0, vy: rnd(1, 3), vz: 0, grav: 6, life: 0.5, s0: 0.8, s1: 1.6, c: FOAM, a: 0.8 }); }
    return d.t > (r.key === 'boss' ? (r.big > 1 ? 3.2 : 2.6) : 1.8);
  }

  // ---------------------------------------------------------------- r5 juice: words and numbers on the 2D overlay (ST fx.js label)
  // Each float sits on a world point, pops (scale p0 -> p1 -> 1 over the first popK of its life), rises and fades after 65-70%.
  // Barlow with a dark outline so it reads on water; at most 70 at once; none in QA.
  const floats = [], lastNum = new Map();
  if (document.fonts && document.fonts.load) { document.fonts.load('800 16px "Barlow SC"'); document.fonts.load('italic 800 16px "Barlow C"'); }
  // look review 2 (m03 030): MULTI SINK, "DESTROYER BUILT!" and a number all at the top at once; a big screen word (the DOM callout) wins
  const calloutLive = () => { const c = document.getElementById('callout'); return !!(c && c.classList.contains('show')); };
  function floatAt(x, y, z, text, o = {}) {
    if (QAV || floats.length >= 70) return;
    if (o.minor && calloutLive()) return;
    // one headline word at a time: a streak word (minor) waits out a live headline, a boss word (HULL BREACH!) clears a streak word
    if (o.italic) { if (o.minor && floats.some(f => f.italic)) return; if (!o.minor) for (let i = floats.length - 1; i >= 0; i--) if (floats[i].minor) floats.splice(i, 1); }
    // look review 2: the ultimate's four big yellow "3889!" crowded HULL BREACH! (Top Force 13:18: small orange numbers, the headline alone);
    // a boss headline turns the fresh crits into small orange numbers
    if (o.italic && !o.minor) for (const f of floats) if (f.crit && f.t < 0.5) { f.crit = false; f.size = 14; f.col = '#ffb547'; f.text = f.text.replace(/!$/, ''); }
    // two numbers born on the same spot (m05 057: "701" over "12.8K") stack instead of printing over each other
    if (o.uid != null) { let k = 0; for (const f of floats) if (f.uid != null && f.t < 0.3 && Math.abs(f.x - x) < 4 && Math.abs(f.z - z) < 4) k++; y += k * 2.4; }
    floats.push({ x, y, z, text, t: 0, life: o.life || 0.6, size: o.size || 15, col: o.col || '#ffffff', stroke: o.stroke || '#10202a', sw: o.sw || 3,
      jx: rnd(-6, 6), vx: o.still ? 0 : rnd(-20, 20), rise: o.rise ?? 34, dy: o.dy || 0, p0: o.p0 ?? 0.6, p1: o.p1 ?? 1.2, popK: o.popK ?? 0.18, fade: o.fade ?? 0.65, italic: !!o.italic, minor: !!o.minor, uid: o.uid ?? null, val: o.val || 0, crit: !!o.crit });
  }
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.max(1, Math.round(n)));
  const BOSS_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x595959 }); // the boss is hit-tinted 35% white, never full white
  let combo = 0, comboT = 0, multiCd = 0, launched = 0, coinsPending = 0;

  // ---------------------------------------------------------------- events from the rules
  const coins = [];
  function addCoins(x, z, n, gold, spread, delay0 = 0) {
    const v = n > 0 ? gold / n : 0;
    for (let i = 0; i < n; i++) { coins.push({ x: x + rnd(-spread, spread), z: z + rnd(-spread, spread), t: 0, delay: delay0 + i * 0.055, jx: rnd(-16, 16), jy: rnd(18, 34), v, i }); coinsPending += v; }
  }
  function consume(ev, S0) {
    for (let ei = 0; ei < ev.length; ei++) {
      const e = ev[ei];
      if (e.e === 'dmg') {
        // the shooter's side is e.side; the hit unit is on the other side. The next boom says which gun fired.
        const r = units.get(e.id); if (!r || r.dying || !r.u) continue;
        let kind = '';
        for (let j = ei + 1; j < ev.length; j++) if (ev[j].e === 'boom') { kind = ev[j].kind; break; }
        const max = r.u.max || 1, heavy = e.n >= max * 0.3, last = lastNum.get(e.id) ?? -9;
        sfx.hit();
        if (r.key === 'drone') continue; // R-300 round 8 fourth review: no numbers over a drone (see the bars)
        if (!heavy && clock - last < 0.11) continue;
        lastNum.set(e.id, clock);
        // look review 8 (m40-fight): the flagship's bar height is above its mast, so its numbers floated over the camp behind it;
        // a boss number starts on the middle of its hull (Top Force puts them on the boss)
        const p = r.obj.position, y = r.key === 'boss' ? 3.5 * (r.big || 1) : (r.barY || 4) - 0.6;
        // look review (round 5): one live number per target (a second hit within 0.35 s adds to it and pops it again), at most 14 numbers on screen
        const live = floats.find(f => f.uid === e.id && f.t < 0.35);
        if (live) { live.val += e.n; live.text = short(live.val) + (live.crit ? '!' : ''); live.t = Math.min(live.t, 0.06); continue; }
        if (floats.reduce((k, f) => k + (f.uid != null ? 1 : 0), 0) >= 14) continue;
        if (e.side === 'us') {
          const crit = e.crit || kind === 'shellBig' || kind === 'shell2';
          const head = crit && floats.some(f => f.italic && !f.minor && f.t < 0.9); // look review 2: no big crit under a live boss headline
          if (head) floatAt(p.x, y, p.z, short(e.n), { size: 14, col: '#ffb547', uid: e.id, val: e.n });
          else if (crit) floatAt(p.x, y, p.z, short(e.n) + '!', { size: 22, col: '#ffd23f', life: 0.85, uid: e.id, val: e.n, crit: true });
          else floatAt(p.x, y, p.z, short(e.n), { size: 15, uid: e.id, val: e.n });
        } else floatAt(p.x, y, p.z, short(e.n), { size: 12, col: '#ff6a5a', life: 0.6, rise: 26, uid: e.id, val: e.n });
        continue;
      }
      if (e.e === 'fire') {
        fireRec.set(e.id, { x: e.tx, z: e.tz, t: clock });
        const r = units.get(e.id), big = e.kind === 'shellBig';
        let mx = e.x, mz = e.z, my = 2.6;
        const a = Math.atan2(e.tz - e.z, e.tx - e.x);
        if (r) { r.recoil = 1; mx += Math.cos(a) * r.ud.beam * 0.6; mz += Math.sin(a) * r.ud.beam * 0.6; my = (big ? 5 : 2.6) + flyH(e.id); }
        if (e.id === -1) { mx = TURRET_AT[0] + Math.cos(a) * 3.5; mz = TURRET_AT[1] + Math.sin(a) * 3.5; my = Y0 + 3; }
        if (e.kind === 'torpedo') { splash(mx, mz, 0.5); sfx.torpedo(); continue; }
        sfx.shot(big);
        flash(mx, my, mz, big ? 7 : 3.6, e.side === 'us' ? rgb(0xfff0b0) : rgb(0xffb088));
        puff.add({ x: mx, y: my, z: mz, vx: Math.cos(a) * 3, vy: 1.5, vz: Math.sin(a) * 3, drag: 2, life: 0.7, s0: big ? 2.4 : 1.2, s1: big ? 5 : 2.8, c: SMOKE_L, a: 0.6 });
      } else if (e.e === 'boom') {
        const big = e.kind === 'torpedo' || e.kind === 'shellBig';
        flash(e.x, 1.6, e.z, big ? 6 : 3.5, rgb(0xffd77a));
        for (let i = 0; i < (big ? 6 : 3); i++) glow.add({ x: e.x, y: 1.4, z: e.z, vx: rnd(-4, 4), vy: rnd(2, 6), vz: rnd(-4, 4), drag: 3, life: rnd(0.25, 0.4), s0: big ? 2.6 : 1.6, s1: big ? 3.6 : 2.2, c: FIRE, c1: FIRE2, a: 0.95 });
        splash(e.x + rnd(-1, 1), e.z + rnd(-1, 1), big ? 1.1 : 0.55);
      } else if (e.e === 'kill' || e.e === 'sunk') {
        const r = units.get(e.id), boss = e.kind === 'boss', big = boss || e.kind === 'gunship' || e.kind === 'airship' || e.key === 'destroyer';
        boom(e.x, 1.2 + (r && r.ud.fly ? r.ud.fly * (r.big || 1) : 0), e.z, boss ? 2.6 : big ? 1.5 : 1.1, boss ? 26 : big ? 10 : 6);
        if (r && !r.dying) { r.dying = { t: 0, fx: 0, side: Math.random() < 0.5 ? -1 : 1 }; setMat(r, MAT.burnt); }
        // L13: the big flagship (mission 20) blows up along its hull, four more blasts 0.17 s apart (the fight's boss has its own)
        if (boss && r && r.big > 1 && !QAV) for (let i = 1; i <= 4; i++) { const c = Math.cos(r.h), sn = Math.sin(r.h), t = (i - 2.5) * 0.22 * r.ud.len * r.big; blasts.push({ at: i * 0.17, x: e.x + c * t, z: e.z + sn * t, s: i === 4 ? 2.4 : 1.5 }); }
        if (e.e === 'kill') {
          const n = boss ? 6 : e.kind === 'gunship' ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0);
          if (!e.nocoin) addCoins(e.x, e.z, n, e.gold || 0, 2);
          // gold word over the wreck, and a sink streak (4 in 1 s, then a 3 s rest) with a rising note per sink
          if (e.gold) floatAt(e.x, (r && r.barY) || 4, e.z, '+' + short(e.gold), { size: 18, col: '#ffd23f', life: 0.8, p0: 0.5, p1: 1.25, popK: 0.12, fade: 0.7, still: true, rise: 30 });
          combo = clock - comboT < 1 ? combo + 1 : 1; comboT = clock;
          sfx.pop(combo);
          if (combo >= 4 && clock >= multiCd) { multiCd = clock + 3; floatAt(e.x, ((r && r.barY) || 4) + 3, e.z, 'MULTI SINK x' + combo + '!', { size: 20, col: '#ffd23f', stroke: '#7a3a00', sw: 4, life: 1.1, p0: 0.5, p1: 1.25, popK: 0.12, fade: 0.7, still: true, rise: 22, italic: true, minor: true }); addShake(0.08, 0.35); }
        } else sfx.hurt();
        sfx.boom(boss ? 3 : big ? 1.6 : 1);
        if (boss) addShake(1, 1); else if (big) addShake(0.2, 0.45); else addShake(0.06, 0.25);
      } else if (e.e === 'launch') {
        // a boat leaves its shed: foam splash and a splash sound; the very first launch of the session also sounds the horn
        const u = (S0 && S0.ships || []).find(o => o.id === e.id), r = units.get(e.id); if (r) r.born = u && u.adopt ? 1 : 0;
        if (u) splash(u.x, u.z, 1); sfx.splash();
        if (launched++ === 0) sfx.horn();
      } else if (e.e === 'craft') {
        // round 7: a weapon pops onto the shed's counter (Top Force 0:22 to 0:26)
        const c = ARMORY.counter[e.key]; if (c) { sparkle(c[0], Y0 + 2.4, c[1], 10, undefined, 1.6); ring(c[0], c[1], 4, 0.5, Y0 + 0.15, [1, 0.9, 0.5]); }
      } else if (e.e === 'arm') {
        // the front sailor takes his weapon: a gold ring at his feet and a pick-up blip
        const u = S0 && S0.crew && S0.crew.find(o => o.id === e.id); if (u) ring(u.x, u.z, 3.2, 0.45, Y0 + 0.15, [1, 0.85, 0.35]); sfx.pick();
      } else if (e.e === 'board' || e.e === 'crewBack') {
        // a sailor jumps aboard his boat off the quay edge, or climbs back out of the sea
        splash(e.x, e.z + (e.e === 'board' && e.z < -25 ? -2 : 0), 0.7);
      } else if (e.e === 'spawn') {
        // raiders sail out of the outpost: a ring and foam where they appear
      } else if (e.e === 'heal') {
        const r = units.get(e.id); if (r) for (let i = 0; i < 3; i++) glow.add({ x: r.obj.position.x + rnd(-1.5, 1.5), y: 3, z: r.obj.position.z + rnd(-1.5, 1.5), vx: 0, vy: rnd(3, 5), vz: 0, life: 0.8, s0: 1.4, s1: 0.6, c: rgb(0x6dff8e), a: 1 });
      } else if (e.e === 'level') {
        const slot = SLOT[e.key], at = slot ? SHEDS3D[slot].at : REPAIR_AT, y = slot ? Y0 + 3 : 1.5;
        sparkle(at[0], y, at[1], e.star ? 36 : 14, undefined, 6);
        const s = slots[slot || 'repair']; if (s && s.obj) bounces.push({ obj: s.obj.userData.shed || s.obj, t: 0, amp: e.star ? 0.2 : 0.16 });
        // r5: green level ring 2 -> 12 units, a gold ring on a star, LV UP! over the shed, and every boat of this shed blinks once
        ring(at[0], at[1], 12, 0.5, y - 2.6, [0.65, 1, 0.49]);
        if (e.star) ring(at[0], at[1], 16, 0.8, y - 2.5, [1, 0.88, 0.4]);
        // round 6 (R-300 4, after_0095): LV UP! started at the tag's foot and rose under the DOM tag ("Gunboat Lv.17" on top of it);
        // it now starts on the tag's anchor and 30 px higher, clear of the tag (about 22 px tall)
        if (e.lv || e.star) floatAt(at[0], TAG_Y[e.key] ?? y + 4, at[1], e.star ? '★ STAR!' : 'LV UP!', { size: 18, col: e.star ? '#ffd23f' : '#7dff6a', life: 0.8, p0: 0.5, p1: 1.25, popK: 0.12, fade: 0.7, still: true, rise: 26, dy: 30 });
        for (const [, r] of units) if (r.side === 'us' && r.key === e.key && !r.dying) { r.flashT = 0.12; const p = r.obj.position; flash(p.x, 2.5, p.z, 6, rgb(0xb8ffb0)); }
      } else if (e.e === 'hq') {
        // the new HQ model pops in from setScene
      } else if (e.e === 'coins') {
        // a gift opened on the quay: coins hop out and fly to the gold counter
        addCoins(e.x, e.z, e.n || 8, e.gold || 0, 3);
        sparkle(e.x, Y0 + 2, e.z, 24, undefined, 4);
      } else if (e.e === 'chest') {
        sparkle(...[ZONES[e.zone || 2].at[0], 3, ZONES[e.zone || 2].at[1]], 30);
      }
    }
  }

  // ---------------------------------------------------------------- frame
  const M4 = new THREE.Matrix4(), QT = new THREE.Quaternion(), EU = new THREE.Euler(), PS = new THREE.Vector3(), SC = new THREE.Vector3(), CL = new THREE.Color();
  let lastShadowR = 0;
  function frame(S, dt, t, extra = {}) {
    frameId++; clock += dt;
    // camera (extra.camDt: the fight's slow-mo slows the boats, not the kill camera)
    const cdt = extra.camDt ?? dt;
    if (cam.follow) { const k = Math.min(1, cdt * 2.6); cam.tx += (cam.gx - cam.tx) * k; cam.tz += (cam.gz - cam.tz) * k; }
    else if (!drag && (cam.vx || cam.vz)) { cam.tx += cam.vx * dt; cam.tz += cam.vz * dt; const f = Math.exp(-dt * 5); cam.vx *= f; cam.vz *= f; if (Math.hypot(cam.vx, cam.vz) < 0.5) cam.vx = cam.vz = 0; }
    cam.zoom += (cam.gzoom - cam.zoom) * Math.min(1, cdt * 2.6);
    cam.yaw += wrapA(cam.gyaw - cam.yaw) * Math.min(1, cdt * 3);
    clampCam();
    if (shake > 0) { shake = Math.max(0, shake - dt * 1.6); const a = Math.min(1, shake) ** 2 * 2.2 / cam.zoom; sox = rnd(-a, a); soz = rnd(-a, a); } else sox = soz = 0;
    placeCamera();
    // sun and its shadow box follow the camera target
    const R = Math.ceil(85 / cam.zoom / 10) * 10;
    if (R !== lastShadowR) { const c = sun.shadow.camera; c.left = c.bottom = -R; c.right = c.top = R; c.updateProjectionMatrix(); lastShadowR = R; }
    const tex = (2 * R) / SM * 4, sx = Math.round(cam.tx / tex) * tex, sz = Math.round(cam.tz / tex) * tex;
    sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN_DIR.x * 200, SUN_DIR.y * 200, sz + SUN_DIR.z * 200);
    water.userData.U.uTime.value = t;
    fog.update(dt);
    lineTick(S, dt, extra.line);

    propsTick(extra.props, dt, t);
    crew.tick(S, dt, t);
    // buildings: pop in, bounce on level up, HQ flag and radar, wrecked zones smoke
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt; const k = Math.min(1, p.t / 0.6);
      const e = k === 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * 9.5); // elastic out
      p.obj.scale.set(p.base.x * Math.max(0.01, e), p.base.y * Math.max(0.01, e), p.base.z * Math.max(0.01, e));
      if (k >= 1) pops.splice(i, 1);
    }
    for (let i = bounces.length - 1; i >= 0; i--) {
      const b = bounces[i]; b.t += dt; const k = b.t / 0.45, s = Math.sin(Math.min(1, k) * Math.PI) * (b.amp || 0.12);
      b.obj.scale.set(1 + s * 0.5, 1 - s * 0.6 + (k < 0.5 ? s * 1.2 : 0), 1 + s * 0.5);
      if (k >= 1) { b.obj.scale.set(1, 1, 1); bounces.splice(i, 1); }
    }
    const hq = slots.hq && slots.hq.obj;
    if (hq) {
      // r5 juice (D17): the old HQ shudders (about 0.15 units at 30 Hz) just before the new one replaces it
      if (hqWob > 0) { hqWob = Math.max(0, hqWob - dt); const k = hqWob > 0 ? 0.15 * Math.min(1, hqWob * 4 + 0.4) : 0; hq.position.x = HQ_AT[0] + Math.sin(t * 188) * k; hq.position.z = HQ_AT[1] + Math.cos(t * 151) * k * 0.6; }
      if (hq.userData.radar) hq.userData.radar.rotation.y += dt * 1.6;
      const f = hq.userData.flag; if (f) { const p = f.geometry.attributes.position; if (!f.userData.x0) f.userData.x0 = Float32Array.from({ length: p.count }, (_, i) => p.getX(i)); for (let i = 0; i < p.count; i++) { const x = f.userData.x0[i]; p.setZ(i, Math.sin(x * 2.2 - t * 6) * 0.22 * (x / 2.8)); } p.needsUpdate = true; }
    }
    for (const n of [2, 3, 4]) {
      const z = slots['z' + n] && slots['z' + n].obj; if (!z) continue;
      if (z.userData.mode === 'wreck') { z.userData.st = (z.userData.st || 0) - dt; if (z.userData.st <= 0) { z.userData.st = 0.18; for (const p of z.userData.smoke) { smokeAt(p[0], p[1], p[2], 1.3); if (Math.random() < 0.6) fireAt(p[0], p[1], p[2], 1.1); } } }
      for (const g of z.userData.guns || []) g.rotation.y += dt * 0.25;
    }
    for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.at -= dt; if (b.at <= 0) { boom(b.x, 2, b.z, b.s, 8, !!b.tight); sfx.boom(b.s); if (b.s > 2) addShake(0.6, 0.9); blasts.splice(i, 1); } }
    // shore gun turns toward its last target
    const gun = slots.gun && slots.gun.obj;
    if (gun) { const fr = fireRec.get(-1); if (fr && clock - fr.t < 3) { const want = -Math.atan2(fr.z - TURRET_AT[1], fr.x - TURRET_AT[0]); const tm = gun.userData.turret; tm.rotation.y += wrapA(want - tm.rotation.y) * Math.min(1, dt * 6); } }

    // boats
    stillNow = !!S.paused || !!S.still || performance.now() < hushTo; // look review 9 (bossdown): none under the fleet once the flagship is going down
    // look review 13 (real-flow 3): with the finger on the chest, a bright double ring under every still boat pulled the eye
    // away from the chest's yellow tap ring; none while an unopened chest waits under the finger
    if (S.phase === 'wreck' && S.chest && !S.chest.taken) { const f = document.getElementById('finger'); if (f && !f.classList.contains('hidden')) stillNow = true; }
    // look review 10 (bossdown, m40-sink 2 and 3, burst): stopping new ripples was not enough; the ones already out ran on
    // through the 0.25 slow-mo (1.4 s became 5.6 s), so a dozen sat under the fleet at BOSS DOWN!; they now go at once
    if (stillNow || calloutLive()) for (let i = ringList.length - 1; i >= 0; i--) if (ringList[i].idle) ringList.splice(i, 1);
    const bars = [];
    for (const b of S.ships) { const r = unitTick(b, 'us', b.key, dt, shipTier(S, b.key)); if (!r.dying && b.hp < b.max) bars.push([b, r, 'us']); }
    for (const e of S.enemies) { const r = unitTick(e, 'them', e.kind, dt, e.kind === 'boss' ? Math.max(2, pirateTier(S)) : pirateTier(S)); if (!r.dying && (e.hp < e.max || e.kind === 'airship') && e.kind !== 'boss') bars.push([e, r, 'them']); } // the mission 39 leader shows its hp from the start, as Top Force's (refs r7 robot_a) // L13: the boss has a named bar on the HUD
    for (const [id, r] of units) {
      if (r.seen === frameId) continue;
      if (r.dying) { if (dyingTick(r, dt)) { scene.remove(r.obj); units.delete(id); } continue; }
      r.obj.visible = false; r.gone += dt; if (r.gone > 1) { scene.remove(r.obj); units.delete(id); }
    }
    for (const [, r] of units) if (r.seen === frameId) r.obj.visible = true;

    // shells fly on arcs (torpedoes run on the surface with a white trail)
    let n = 0;
    for (const s of extra.shells ? S.shots.concat(extra.shells) : S.shots) { // extra.shells: the cold open's raider fire (the rules are paused then)
      // round 8: a flier's shot leaves from its hover height and one aimed at a flier meets it up there
      let st = shellStart.get(s); if (!st) { st = { x: s.x, z: s.z, d: Math.hypot(s.tx - s.x, s.tz - s.z) || 1, h0: flyH(s.from), h1: flyH(s.target) }; shellStart.set(s, st); }
      const left = Math.hypot(s.tx - s.x, s.tz - s.z), p = clamp(1 - left / Math.max(st.d, left), 0, 1);
      const tor = s.kind === 'torpedo';
      const y = tor ? 0.2 : 2.2 + 4 * Math.min(st.d * 0.16, 7) * p * (1 - p) - 1.2 * p + st.h0 * (1 - p) + st.h1 * p;
      const big = s.kind === 'shellBig', sz = s.tracer ? 1.3 : tor ? 0.6 : big ? 1.5 : s.kind === 'shell2' ? 0.9 : 0.75;
      PS.set(s.x, y, s.z); SC.set(tor ? 1.6 : sz, sz, tor ? 0.6 : sz); EU.set(0, -Math.atan2(s.tz - s.z, s.tx - s.x), 0); QT.setFromEuler(EU);
      M4.compose(PS, QT, SC); shells.setMatrixAt(n, M4);
      CL.setHex(tor ? 0x2a2f3a : s.side === 'us' ? 0xfff07a : 0xff7a4a); shells.setColorAt(n, CL);
      n++;
      if (tor) { if (Math.random() < 0.8) puff.add({ x: s.x, y: 0.15, z: s.z, vx: 0, vy: 0, vz: 0, life: 0.9, s0: 0.8, s1: 2, c: FOAM, a: 0.9 }); }
      else if (s.tracer) glow.add({ x: s.x, y, z: s.z, vx: 0, vy: 0, vz: 0, life: 0.3, s0: 3.2, s1: 0.9, c: rgb(0xff8a3d), c1: rgb(0xffd860), a: 1 }); // the cold open's raider fire: a bright streak a still frame catches (Top Force 0:07)
      else if (Math.random() < 0.7) glow.add({ x: s.x, y, z: s.z, vx: 0, vy: 0, vz: 0, life: 0.16, s0: sz * 2.2, s1: sz * 0.8, c: s.side === 'us' ? rgb(0xffd860) : rgb(0xff6a3d), a: 0.8 });
      if (n >= 320) break;
    }
    shells.count = n; shells.instanceMatrix.needsUpdate = true; if (shells.instanceColor) shells.instanceColor.needsUpdate = true;

    // rings and debris
    let k = 0;
    for (let i = ringList.length - 1; i >= 0; i--) { const r = ringList[i]; r.t += dt; if (r.t >= r.life) { ringList.splice(i, 1); } }
    for (const r of ringList) {
      const q = r.t / r.life, s = r.s * (0.3 + 0.7 * (1 - Math.pow(1 - q, 3)));
      PS.set(r.x, r.y, r.z); SC.set(s, 1, s); QT.identity(); M4.compose(PS, QT, SC); rings.setMatrixAt(k, M4);
      const a = (1 - q) * 0.9; CL.setRGB(r.c[0] * a, r.c[1] * a, r.c[2] * a); rings.setColorAt(k, CL); k++;
    }
    rings.count = k; rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    k = 0;
    for (let i = darkList.length - 1; i >= 0; i--) { const r = darkList[i]; r.t += dt; if (r.t >= r.life) darkList.splice(i, 1); }
    for (const r of darkList) {
      const q = r.t / r.life, s = r.s * (0.3 + 0.7 * (1 - Math.pow(1 - q, 3))), a = (1 - q) * 0.9;
      PS.set(r.x, r.y, r.z); SC.set(s, 1, s); QT.identity(); M4.compose(PS, QT, SC); darkRings.setMatrixAt(k, M4);
      CL.setRGB(1 + (r.c[0] - 1) * a, 1 + (r.c[1] - 1) * a, 1 + (r.c[2] - 1) * a); darkRings.setColorAt(k, CL); k++;
    }
    darkRings.count = k; darkRings.instanceMatrix.needsUpdate = true; if (darkRings.instanceColor) darkRings.instanceColor.needsUpdate = true;
    k = 0;
    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i]; d.t += dt; d.vy -= 30 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt;
      if (d.y < 0) { if (d.s > 0.5) splash(d.x, d.z, 0.35); debrisList.splice(i, 1); }
    }
    for (const d of debrisList) { PS.set(d.x, d.y, d.z); EU.set(d.rx, d.ry, 0); QT.setFromEuler(EU); SC.set(d.s, d.s * 0.6, d.s * 1.4); M4.compose(PS, QT, SC); debris.setMatrixAt(k, M4); CL.setHex(d.c); debris.setColorAt(k, CL); k++; }
    debris.count = k; debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true;

    glow.update(dt); puff.update(dt);
    renderer.render(scene, camera);

    // 2D overlay: health bars and coins
    octx.setTransform(odpr, 0, 0, odpr, 0, 0); octx.clearRect(0, 0, W, H);
    // the tag boxes are last frame's; move each box's middle the way the camera's move, zoom and turn moved the ground
    // since (two points, main.js tagRef); a tag keeps its pixel size, so only its middle moves
    let avoid = extra.avoid;
    if (avoid && avoid.length && extra.avoidRef) {
      const [rx, rz, ax, ay, bx, by] = extra.avoidRef, [cx, cy] = w2s(rx, rz, 0), [ex, ey] = w2s(rx + 30, rz, 0);
      const ux = bx - ax, uy = by - ay, vx = ex - cx, vy = ey - cy, d = ux * ux + uy * uy || 1;
      const kr = (vx * ux + vy * uy) / d, ki = (vy * ux - vx * uy) / d; // (e - c) / (b - a) as a complex number: scale and turn
      if (Math.abs(cx - ax) + Math.abs(cy - ay) > 0.5 || Math.abs(kr - 1) + Math.abs(ki) > 0.002) avoid = avoid.map(q => {
        const mx = (q[0] + q[2]) / 2, my = (q[1] + q[3]) / 2, px = mx - ax, py = my - ay;
        const dx = cx + px * kr - py * ki - mx, dy = cy + px * ki + py * kr - my;
        return [q[0] + dx, q[1] + dy, q[2] + dx, q[3] + dy];
      });
    }
    for (const [u, r, side] of bars) {
      let [x, y] = w2s(r.obj.position.x, r.obj.position.z, r.barY || BAR_Y[r.key] || 4);
      // R-300 round 8 third review (pair helis, mission 14): the steep camera put a helicopter's bar over its own body; a
      // flier's bar steps up a quarter of its drawn length on screen
      if (r.ud.fly && r.key !== 'boss' && r.key !== 'airship') y -= ppu(u.x, u.z) * r.ud.len * drawOf(r.key, r.tier) * 0.25;
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      // R-300 round 8 fourth review (pair mother20): over the mission 20 deck the drones' bars and hit numbers covered them, so they
      // read as red bits; a drone dies in one or two hits, so it flies with no bar and no numbers (its coin still pops)
      if (r.key === 'drone') continue;
      if (side === 'us' && (u.hp >= u.max * 0.97 || !S.enemies.length)) continue; // look review 2: no raider left (outpost down, Bram aboard), no bars // look review (round 5): a full-health fleet drew a stack of green bars over itself (a scratch under 3% still counts as full)
      const boss = r.key === 'boss', w = boss ? Math.max(70, ppu(u.x, u.z) * 16) : Math.max(24, ppu(u.x, u.z) * r.ud.len * drawOf(r.key, r.tier) * 0.7), h = boss ? 7 : 4;
      octx.fillStyle = 'rgba(10,16,28,0.7)'; octx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
      octx.fillStyle = side === 'us' ? '#53e05b' : '#ff4a3d'; octx.fillRect(x - w / 2, y, w * clamp(u.hp / u.max, 0, 1), h);
      octx.fillStyle = 'rgba(255,255,255,0.35)'; octx.fillRect(x - w / 2, y, w * clamp(u.hp / u.max, 0, 1), h * 0.4);
      // R-300 round 7 (pairs tanks, mech, robot39): the mission 39 robot was lost among the raiders; Top Force prints its hp in red over it (refs r7 robot_a)
      // R-300 round 7 fourth look check (recK39): the robot stops under the outpost's Enemies bar, which covered half its number;
      // a number that would touch a tag steps beside its own bar, or else beside the tag, whichever is nearer and free
      if (r.key === 'airship') {
        octx.textAlign = 'center'; octx.textBaseline = 'bottom'; octx.lineJoin = 'round'; octx.font = '800 16px "Barlow SC", sans-serif';
        const t = short(u.hp), hw = octx.measureText(t).width / 2 + 3, av = avoid;
        const hitB = (px, py) => av && av.find(b => px + hw > b[0] && px - hw < b[2] && py + 2 > b[1] && py - 18 < b[3]);
        let tx = x, ty = y - 3; const b0 = hitB(tx, ty);
        if (b0) {
          const o = [[x + w / 2 + hw + 4, y + 10], [x - w / 2 - hw - 4, y + 10], [b0[2] + hw + 2, ty], [b0[0] - hw - 2, ty]].filter(([px, py]) => !hitB(px, py) && px - hw > 0 && px + hw < W);
          if (o.length) { o.sort((p, q) => Math.hypot(p[0] - x, p[1] - ty) - Math.hypot(q[0] - x, q[1] - ty)); [tx, ty] = o[0]; }
        }
        octx.lineWidth = 5; octx.strokeStyle = '#2a0a08'; octx.strokeText(t, tx, ty); octx.fillStyle = '#ff4a3d'; octx.fillText(t, tx, ty);
      }
    }
    crew.overlay(S, octx, w2s, avoid); // round 7: weapon power over the counters and over whoever carries one
    // look review 2: the cold open's raider shells draw as orange tracer streaks, long enough for a still frame to catch (Top Force 0:07)
    if (extra.shells) for (const s of extra.shells) {
      const st = shellStart.get(s); if (!s.tracer || !st) continue;
      const dx = s.tx - st.x, dz = s.tz - st.z, l = Math.hypot(dx, dz) || 1, back = Math.min(8, Math.hypot(s.x - st.x, s.z - st.z));
      const [hx, hy] = w2s(s.x, s.z, 2.4), [tx, ty] = w2s(s.x - dx / l * back, s.z - dz / l * back, 2.6);
      const g = octx.createLinearGradient(tx, ty, hx, hy); g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, 'rgba(255,190,80,0.95)');
      octx.strokeStyle = g; octx.lineCap = 'round'; octx.lineWidth = 4; octx.beginPath(); octx.moveTo(tx, ty); octx.lineTo(hx, hy); octx.stroke();
      octx.fillStyle = '#fff3c4'; octx.beginPath(); octx.arc(hx, hy, 3, 0, 6.283); octx.fill();
    }
    // r5 floats: damage numbers, +gold, LV UP!, MULTI SINK
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t >= f.life) { floats[i] = floats[floats.length - 1]; floats.pop(); } }
    octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.lineJoin = 'round';
    // look review (round 5): numbers first, then the headline words (MULTI SINK, HULL BREACH) on top of them, kept inside the screen
    // and below the mission name at the top; the headline pass runs after the coins so a flying coin never covers the word
    const cLive = calloutLive();
    const drawn = [], heads = [];
    // where a float sits this frame: [x, y, scale, half width, anchor on screen]; the font is set as a side effect
    const place = f => {
      const q = f.t / f.life, [sx, sy] = w2s(f.x, f.z, f.y);
      const sc = q < f.popK ? f.p0 + (f.p1 - f.p0) * (q / f.popK) : q < f.popK * 2 ? f.p1 + (1 - f.p1) * ((q - f.popK) / f.popK) : 1;
      let x = sx + f.jx + f.vx * f.t, y = sy - f.dy - f.rise * (1 - (1 - q) * (1 - q));
      octx.font = (f.italic ? 'italic 800 ' : '800 ') + Math.round(f.size * sc) + 'px ' + (f.italic ? '"Barlow C"' : '"Barlow SC"') + ', sans-serif';
      const hw = octx.measureText(f.text).width / 2 + f.sw + (f.italic ? 6 : 4);
      if (f.italic) { x = clamp(x, hw, W - hw); y = Math.max(y, hudTop() + f.size * sc / 2 + f.sw + 4); }
      return [x, y, sc, hw, sx >= -2 && sx <= W + 2 && sy >= -2 && sy <= H + 2];
    };
    // look review 10 (walk21 044, 074): the headline words were clamped into view even when their spot was off screen ("MULTI
    // SINK x8!" from the far outpost fight in the middle of the HQ tutorial), and a boss number rising from the hull slid under
    // HULL BREACH!; a headline needs its spot on screen, and a number that would touch a live headline is not drawn
    // (Top Force 13:18: the headline alone)
    for (const f of floats) if (f.italic && !(f.minor && cLive)) { const p = place(f); if (p[4]) heads.push([p[0], p[1], p[3], f.size * p[2] / 2 + f.sw]); }
    const drawFloats = pass => { for (const f of floats) {
      if (f.italic !== pass) continue;
      if (f.minor && cLive) continue;
      const q = f.t / f.life, [x0, y0, sc, hw0, on] = place(f);
      let x = x0, y = y0;
      octx.globalAlpha = q > f.fade ? Math.max(0, 1 - (q - f.fade) / (1 - f.fade)) : 1;
      if (f.italic) { if (!on) continue; }
      else {
        // look review 9 (041 to 044): clamping pulled numbers from a fight off the right edge into view ("4104!" at the edge
        // while the finger asked for HQ); a number whose spot is off screen is not drawn, one near the edge slides in
        if (y < hudTop() + 6 || !on) continue; const hw = hw0, hh = f.size * sc / 2 + f.sw; x = clamp(x, hw, W - hw);
        // look review 8 (burst): a "+2" and a "1017" born side by side printed as one "+21017"; a number that would touch
        // one already drawn this frame steps up above it
        for (let k = 0; k < 4; k++) { const o = drawn.find(d => Math.abs(d[0] - x) < d[2] + hw && Math.abs(d[1] - y) < d[3] + hh); if (!o) break; y = o[1] - o[3] - hh - 1; }
        if (y < hudTop() + 6 || heads.some(h => Math.abs(h[0] - x) < h[2] + hw && Math.abs(h[1] - y) < h[3] + hh)) continue;
        drawn.push([x, y, hw, hh]);
      } // look review 2: a number rising into the top bar ("250" over "Mission-14") is not drawn; look review 8: none cut off at the edge
      octx.lineWidth = f.sw * 2 * Math.max(0.6, sc); octx.strokeStyle = f.stroke; octx.strokeText(f.text, x, y);
      octx.fillStyle = f.col; octx.fillText(f.text, x, y);
    } octx.globalAlpha = 1; };
    // round 6 (R-300, after_0700): a flying coin covered a damage number; numbers now draw after the coins
    // coins on the ST curve: pop 0 -> 1 in 0.18 s (overshoot), wait 0.2 + i x 0.055 s, fly 0.55 s on cubic-bezier(.55,-.25,.6,1)
    // (pulls back first), shrink to 0.75 on arrival. Each coin carries its share of the gold; the counter adds it on arrival.
    const goldAt = extra.goldAt, cim = IM && IM['coin.png'];
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.t += dt; if (c.t < c.delay) continue;
      const tt = c.t - c.delay;
      if (!c.sx) { const p = w2s(c.x, c.z, 3); c.sx = p[0] + c.jx; c.sy = p[1] - c.jy; }
      const pop = Math.min(1, tt / 0.18), sc = pop < 1 ? bezY(pop, 1.8, 1) : 1;
      const wait = 0.2 + (c.i || 0) * 0.055, q = clamp((tt - 0.18 - wait) / 0.55, 0, 1);
      let x = c.sx, y = c.sy, a = 1, s = 22 * sc;
      if (q > 0) {
        if (goldAt) {
          const k = bezY(q, -0.25, 1, 0.55, 0.6);
          x = c.sx + (goldAt[0] - c.sx) * k; y = c.sy + (goldAt[1] - c.sy) * k; s = 22 * (1 - 0.25 * q);
          if (q >= 1) { coins.splice(i, 1); coinsPending = Math.max(0, coinsPending - (c.v || 0)); extra.onCoin && extra.onCoin(c.v || 0); sfx.coin(c.i || 0); continue; }
        } else { a = 1 - q; y -= q * 20; if (q >= 1) { coins.splice(i, 1); coinsPending = Math.max(0, coinsPending - (c.v || 0)); extra.onCoin && extra.onCoin(c.v || 0); continue; } }
      }
      octx.globalAlpha = a;
      if (cim) octx.drawImage(cim, x - s / 2, y - s / 2, s, s); else { octx.fillStyle = '#ffc93a'; octx.beginPath(); octx.arc(x, y, s / 2, 0, TAU); octx.fill(); }
      octx.globalAlpha = 1;
    }
    if (!coins.length) coinsPending = 0;
    drawFloats(false);
    drawFloats(true);
  }
  // bottom edge of the mission name at the top, in overlay pixels (headline words stay under it)
  let hudY = 0, hudAt = -1;
  function hudTop() {
    const now = performance.now();
    if (now - hudAt > 500) { hudAt = now; const m = document.getElementById('mission'); hudY = m ? m.getBoundingClientRect().bottom - octx.canvas.getBoundingClientRect().top : 60; }
    return hudY;
  }
  // y of a CSS cubic-bezier(x1, y1, x2, y2) at time x (solved by bisection; good enough for juice)
  function bezY(x, y1, y2, x1 = 0.3, x2 = 0.5) {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 18; i++) { t = (lo + hi) / 2; const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t; if (bx < x) lo = t; else hi = t; }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  }

  resize(); placeCamera();
  return {
    drawLen: id => { const r = units.get(id); return r ? r.ud.len * (r.big || 1) : 0; }, // round 8: drawn length, for the crowding check
    setFly: (id, h) => { const r = units.get(id); if (r && r.ud.fly && h > 0) r.ud.fly = h; }, // round 8: the final fight hovers its mothership lower
    resize, frame, consume, setScene, focus, focusAt, setYaw, w2s, w2sGoal, hushRings, ppu, cam, renderer, scene, camera, tableTop: () => crew.tableTop(), numBoxes: () => crew.numBoxes(),
    get lastInput() { return lastInput; },
    set onTap(f) { onTap = f; },
    get size() { return [W, H]; },
    set lock(v) { cam.lock = v; },
    shakeIt(v, cap) { addShake(v, cap ?? Math.max(v, 0.3)); },
    holdHq(v) { hqHold = v; sceneState = null; }, wobbleHq(s) { if (!QAV) hqWob = s; },
    clearFloats() { floats.length = 0; }, dropStray,
    // smoke, fire and sparks still in the air drop at once (the fight's flagship smoke must not come back with the map)
    clearFx() { puff.list.length = 0; glow.list.length = 0; }, // the Victory page sits over a still scene: no damage numbers frozen behind it
    // a quick push-in (zoom x k) that eases back on its own: the camera punch for big moments, not a cutscene
    punch(k = 1.06) { if (!QAV) cam.zoom = clamp(cam.zoom * k, ZWIDE, ZMAX * 1.2); },
    addShake, flash, ring, floatAt, dust, fireAt, fireball, smokeColumn,
    get coinsInFlight() { return coinsPending; },
    boom, splash, sparkle,
  };
}
