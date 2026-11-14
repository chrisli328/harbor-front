// Land, islands, sea and sea fog for the 3D harbor. The sea colour comes from a distance-to-land texture computed
// once on the CPU (shallow turquoise near shore, deep blue offshore, moving foam lines on the beaches), the same
// toy-water look as Top Force's coast but built from the map rules in world.js.
import * as THREE from 'three';
import { Builder, PAL, MAT, solidMesh, seeded, addVig } from './look.js';
import { BASE, ZONES, ROCKS, WHARF, PIER, REPAIR_AT, mainland } from './world.js';

const Y0 = BASE.y;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// value noise for hills and colour patches
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.1 + 5, z * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 9, z * 4.3 + 1) * 0.1;

const sdRect = (x, z, x0, x1, z0, z1) => { const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1); const out = Math.hypot(dx, dz); return out > 0 ? out : -Math.min(x - x0, x1 - x, z - z0, z1 - z); };
const baseDist = (x, z) => sdRect(x, z, BASE.x0, BASE.x1, BASE.z0, BASE.z1);

// Island outline radius at an angle (wobbly circle), kept inside the sim's no-sail circle.
function islandR(n, a) { const R = n === 2 ? 15 : 6.5; return R * (0.9 + 0.06 * Math.sin(3 * a + n) + 0.04 * Math.sin(5 * a + 2 * n)); }

// Distance from a sea point to the nearest land or structure (negative on land).
export function landDist(x, z, stage) {
  let d = Math.min(-mainland(x, z), baseDist(x, z));
  for (const n of [2, 3]) { const [cx, cz] = ZONES[n].at; const a = Math.atan2(z - cz, x - cx); d = Math.min(d, Math.hypot(x - cx, z - cz) - islandR(n, a)); }
  for (const r of ROCKS) d = Math.min(d, Math.hypot(x - r[0], z - r[1]) - r[2] * 0.85);
  { const [cx, cz] = ZONES[4].at; d = Math.min(d, sdRect(x, z, cx - 13, cx + 13, cz - 9, cz + 9) + 2); }
  { const [cx, cz] = ZONES[3].at; d = Math.min(d, Math.hypot(x - cx, z - cz) - 13 + 2); }
  if (stage >= 2) d = Math.min(d, sdRect(x, z, REPAIR_AT[0] - 5.5, REPAIR_AT[0] + 5.5, REPAIR_AT[1] - 5.5, REPAIR_AT[1] + 5.5) + 1.5);
  if (stage >= 3) d = Math.min(d, sdRect(x, z, WHARF[0], WHARF[1], WHARF[2], WHARF[3]), sdRect(x, z, PIER[0], PIER[1], PIER[2], PIER[3]));
  return d;
}

// ---------------------------------------------------------------- mainland
function landHeight(x, z) {
  const m = mainland(x, z), bd = baseDist(x, z);
  let h;
  if (m < 0) h = Math.max(-7, -1.2 + m * 0.35);
  else if (m < 6) h = -0.5 + m * 0.42;
  else h = 2.0 + fbm(x * 0.018, z * 0.018) * 9 * sstep(6, 45, m) + fbm(x * 0.07, z * 0.07) * 1.2 * sstep(6, 20, m);
  // flat apron around the quay on the land side
  if (bd < 14 && m > 0) h += (Y0 - 0.15 - h) * sstep(14, 4, bd);
  if (bd < 0.5) h = Y0 - 0.4;
  return h;
}
export function landMesh() {
  const x0 = -330, x1 = 110, z0 = -110, z1 = 330, cs = 3;
  const nx = Math.round((x1 - x0) / cs), nz = Math.round((z1 - z0) / cs);
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, landHeight(pos.getX(i), pos.getZ(i)));
  const q = g.toNonIndexed(); q.deleteAttribute('uv'); q.computeVertexNormals();
  const p = q.attributes.position, nor = q.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const sand = new THREE.Color(PAL.sand), wet = new THREE.Color(0xd8bf8a), grass = new THREE.Color(PAL.grass), grassD = new THREE.Color(PAL.grassD), rock = new THREE.Color(PAL.rock), dirt = new THREE.Color(0xc9b483);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3;
    const m = mainland(cx, cz), bd = baseDist(cx, cz);
    if (cy < 0.2) c.copy(wet);
    else if (m < 5.5 && bd > 3) c.copy(sand);
    else if (bd < 9) c.copy(dirt).lerp(grass, sstep(4, 9, bd));
    else { c.copy(grass).lerp(grassD, sstep(0.35, 0.75, fbm(cx * 0.05, cz * 0.05))); if (ny < 0.8) c.lerp(rock, sstep(0.8, 0.62, ny)); }
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  q.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(q, MAT.ground); mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- islands and rocks
function islandGeo(n) {
  const [cx, cz] = ZONES[n].at, top = n === 2 ? 1.6 : 0.5, rings = 12, segs = 48;
  const verts = [], cols = [];
  const ht = (r, a) => {
    const R = islandR(n, a), t = r / R;
    if (t < 0.78) return top + (n === 2 ? fbm(cx + r * Math.cos(a) * 0.2, cz + r * Math.sin(a) * 0.2) * 0.25 : 0);
    if (t < 1.0) return top * (1 - sstep(0.78, 1.0, t)) + 0.1;
    return 0.1 - (t - 1) * 8;
  };
  const pt = (k, s) => { const a = s / segs * TAU, R = islandR(n, a), r = R * 1.35 * k / rings; return [cx + Math.cos(a) * r, ht(r, a), cz + Math.sin(a) * r, r / R]; };
  const sand = new THREE.Color(PAL.sand), grass = new THREE.Color(PAL.grass), wet = new THREE.Color(0xd8bf8a), c = new THREE.Color();
  for (let k = 0; k < rings; k++) for (let s = 0; s < segs; s++) {
    const a = pt(k, s), b = pt(k + 1, s), d = pt(k + 1, s + 1), e = pt(k, s + 1);
    const tri = k === 0 ? [[a, b, d]] : [[a, b, d], [a, d, e]];
    for (const t of tri) {
      const tm = (t[0][3] + t[1][3] + t[2][3]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
      if (n === 2 && tm < 0.74) c.copy(grass); else if (cy > 0.25) c.copy(sand); else c.copy(wet);
      for (const v of [t[0], t[2], t[1]]) { verts.push(v[0], v[1], v[2]); cols.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
export function islandsMesh() {
  const b = new Builder(), rr = seeded(11);
  b.addGeo(islandGeo(2)); b.addGeo(islandGeo(3));
  for (const [x, z, r] of ROCKS) {
    for (let i = 0; i < 5; i++) {
      const a = rr() * TAU, d = rr() * r * 0.5, s = r * (0.6 + rr() * 0.5);
      b.add('ico0', i % 2 ? PAL.rock : PAL.rockD, [x + Math.cos(a) * d, s * 0.15, z + Math.sin(a) * d], [s, s * (0.7 + rr() * 0.5), s], [rr(), rr() * 3, rr()]);
    }
    b.add('ico0', PAL.grass, [x, r * 0.5, z], [r * 0.9, r * 0.35, r * 0.9], [0, rr() * 3, 0]);
    b.add('cyl', PAL.sand, [x, -0.2, z], [r * 2.3, 0.6, r * 2.3]);
  }
  // a few round trees and palms on the reef island, outside the palisade
  const [cx, cz] = ZONES[2].at;
  for (const a of [0.3, 1.2, 2.3, 3.6, 4.4, 5.4]) treeAt(b, cx + Math.cos(a) * 12.5, 1.6, cz + Math.sin(a) * 12.5, 0.8 + rr() * 0.3, a > 3 ? 'round' : 'palm', rr);
  return solidMesh(b.build(), MAT.solid, true);
}

// ---------------------------------------------------------------- trees
function treeAt(b, x, y, z, s, kind, rr) {
  if (kind === 'pine') {
    b.cylOn('cyl6', PAL.trunk, x, y, z, 0.6 * s, 1.6 * s);
    b.add('cone6', PAL.pine, [x, y + 3.2 * s, z], [4.2 * s, 3.8 * s, 4.2 * s], [0, rr() * 3, 0]);
    b.add('cone6', 0x4fb36a, [x, y + 5.4 * s, z], [3.0 * s, 3.0 * s, 3.0 * s], [0, rr() * 3, 0]);
  } else if (kind === 'palm') {
    b.add('cyl6', PAL.trunk, [x + 0.4 * s, y + 2.4 * s, z], [0.45 * s, 4.8 * s, 0.45 * s], [0, 0, -0.15]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rr(); b.add('rbox', PAL.leaf, [x + 0.8 * s + Math.cos(a) * 1.3 * s, y + 4.7 * s, z + Math.sin(a) * 1.3 * s], [2.8 * s, 0.25 * s, 0.9 * s], [0, -a, -0.35]); }
  } else {
    b.cylOn('cyl6', PAL.trunk, x, y, z, 0.6 * s, 2.0 * s);
    b.add('ico', rr() < 0.5 ? PAL.leaf : PAL.leafD, [x, y + 3.4 * s, z], [3.6 * s, 3.2 * s, 3.6 * s], [0, rr() * 3, 0]);
  }
}
export function treesMesh() {
  const b = new Builder(), rr = seeded(3);
  for (let i = 0; i < 2600; i++) {
    const x = -250 + rr() * 340, z = -95 + rr() * 350;
    const m = mainland(x, z), bd = baseDist(x, z);
    if (m < 9 || bd < 10) continue;
    // denser away from the harbor, thinner right behind the fence
    if (rr() > 0.18 + 0.5 * sstep(10, 70, bd)) continue;
    const y = landHeight(x, z) - 0.2;
    treeAt(b, x, y, z, 0.85 + rr() * 0.5, rr() < 0.6 ? 'pine' : 'round', rr);
  }
  return solidMesh(b.build(), MAT.solid, true);
}

// ---------------------------------------------------------------- sea
const WATER_RECT = [-280, -300, 620, 560]; // x0, z0, width, depth
export function waterDepthTex(stage) {
  const N = 512, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = WATER_RECT[0] + (i + 0.5) / N * WATER_RECT[2], z = WATER_RECT[1] + (j + 0.5) / N * WATER_RECT[3];
    const d = landDist(x, z, stage), k = (j * N + i) * 4;
    data[k] = Math.round(255 * Math.max(0, Math.min(1, 1 - d / 26)));
    data[k + 1] = Math.round(255 * Math.max(0, Math.min(1, d / 14)));
    data[k + 2] = 0; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
export function waterMesh() {
  const U = { uTime: { value: 0 }, uDepth: { value: null }, uRect: { value: new THREE.Vector4(...WATER_RECT) } };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vWxz; uniform float uTime; uniform sampler2D uDepth; uniform vec4 uRect;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 dt = texture2D(uDepth, (vWxz - uRect.xy) / uRect.zw);
  float sh = dt.r, d = dt.g * 14.0;
  vec3 deep = vec3(0.07, 0.45, 0.74), mid = vec3(0.13, 0.62, 0.84), shallow = vec3(0.36, 0.86, 0.86);
  vec3 wc = mix(deep, mid, smoothstep(0.0, 0.55, sh));
  wc = mix(wc, shallow, smoothstep(0.55, 0.95, sh));
  float n1 = sin(vWxz.x * 0.045 + uTime * 0.25) * sin(vWxz.y * 0.05 - uTime * 0.2);
  float n2 = sin(vWxz.x * 0.23 - vWxz.y * 0.17 + uTime * 0.9) * sin(vWxz.y * 0.21 + uTime * 0.7);
  wc *= 0.97 + 0.035 * n1 + 0.02 * n2;
  // foam: a steady white rim on every shore and soft lines that roll in toward it
  float rim = 1.0 - smoothstep(0.35, 1.3, d);
  float wob = sin(vWxz.x * 0.35 + vWxz.y * 0.27) * 0.35;
  float roll = smoothstep(0.82, 0.97, sin(d * 1.25 - uTime * 1.9 + wob)) * (1.0 - smoothstep(1.5, 6.0, d));
  float foam = max(rim * 0.95, roll * 0.7);
  wc = mix(wc, vec3(0.97, 1.0, 1.0), foam);
  // glints on open water
  float g1 = sin(vWxz.x * 0.9 + uTime * 1.6 + sin(vWxz.y * 0.55)) * sin(vWxz.y * 0.8 - uTime * 1.2 + sin(vWxz.x * 0.45));
  wc += vec3(0.9, 0.97, 1.0) * smoothstep(0.93, 0.995, g1) * 0.45 * (1.0 - sh);
  diffuseColor.rgb = wc;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.42;');
    addVig(sh);
  };
  mat.customProgramCacheKey = () => 'harbor-water';
  const g = new THREE.PlaneGeometry(WATER_RECT[2], WATER_RECT[3], 1, 1).rotateX(-Math.PI / 2).translate(WATER_RECT[0] + WATER_RECT[2] / 2, 0, WATER_RECT[1] + WATER_RECT[3] / 2);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  m.userData.U = U;
  return m;
}

// ---------------------------------------------------------------- sea fog (fog of war)
// Top Force covers every locked area with a soft white haze you can half see through, and clears it in a widening
// circle when the area unlocks. Here: three stacked haze sheets over the sea (parallax gives it depth), a wobbly
// cloud-bank edge from a tiling noise texture, thinned over the home coast, holes that grow open in 1.6 s.
function noiseTex(N = 128) {
  const data = new Uint8Array(N * N * 4), P = 8; // tiling value noise, 3 octaves
  const h = (i, j, p) => hash(((i % p) + p) % p, ((j % p) + p) % p);
  const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h(i, j, p), b = h(i + 1, j, p), c = h(i, j + 1, p), d = h(i + 1, j + 1, p); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N, k = (j * N + i) * 4;
    const n = vn(x * P, y * P, P) * 0.55 + vn(x * P * 2, y * P * 2, P * 2) * 0.3 + vn(x * P * 4, y * P * 4, P * 4) * 0.15;
    const m = vn(x * P * 2 + 3, y * P * 2 + 7, P * 2);
    data[k] = Math.round(n * 255); data[k + 1] = Math.round(m * 255); data[k + 2] = 0; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
function coastMask(N = 256) { // 1 over the sea, fading to 0 a little inland so the haze never sits on our own coast
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = WATER_RECT[0] + (i + 0.5) / N * WATER_RECT[2], z = WATER_RECT[1] + (j + 0.5) / N * WATER_RECT[3];
    const v = 1 - sstep(-4, 12, mainland(x, z)), k = (j * N + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = Math.round(v * 255); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
const FOG_MAX = 8;
export function createFog() {
  const holes = Array.from({ length: FOG_MAX }, () => new THREE.Vector3(0, 0, -1)); // x, z, current radius (-1 = unused)
  const U = { uTime: { value: 0 }, uNoise: { value: noiseTex() }, uMask: { value: coastMask() }, uRect: { value: new THREE.Vector4(...WATER_RECT) }, uHoles: { value: holes } };
  const group = new THREE.Group();
  const layers = [ // height, opacity, edge push, noise scale, drift
    { y: 3.0, a: 0.62, push: -6, sc: 1 / 150, dr: [0.6, 0.25], tint: [0.86, 0.91, 0.96] },
    { y: 8.0, a: 0.55, push: 0, sc: 1 / 115, dr: [-0.45, 0.4], tint: [0.94, 0.96, 0.99] },
    { y: 13.0, a: 0.5, push: 7, sc: 1 / 90, dr: [0.35, -0.5], tint: [1.0, 1.0, 1.0] },
  ];
  for (const L of layers) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...U, uA: { value: L.a }, uPush: { value: L.push }, uSc: { value: L.sc }, uDrift: { value: new THREE.Vector2(...L.dr) }, uTint: { value: new THREE.Color(...L.tint) } },
      vertexShader: `varying vec2 vW; varying vec4 vC;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; vC = gl_Position; }`,
      fragmentShader: `uniform sampler2D uNoise, uMask; uniform vec4 uRect; uniform vec3 uHoles[${FOG_MAX}];
uniform float uTime, uA, uPush, uSc; uniform vec2 uDrift; uniform vec3 uTint; varying vec2 vW; varying vec4 vC;
void main(){
  float mask = texture2D(uMask, (vW - uRect.xy) / uRect.zw).r;
  vec4 n1 = texture2D(uNoise, vW * uSc + uDrift * uTime * 0.004);
  vec4 n2 = texture2D(uNoise, vW * uSc * 2.3 - uDrift.yx * uTime * 0.006 + 0.37);
  float n = n1.r * 0.65 + n2.r * 0.35;
  float open = 1.0;
  for (int i = 0; i < ${FOG_MAX}; i++) { vec3 h = uHoles[i]; if (h.z < 0.0) continue;
    float d = length(vW - h.xy) - h.z - uPush + (n - 0.5) * 22.0;
    open = min(open, smoothstep(-2.0, 14.0, d)); }
  float body = smoothstep(0.18, 0.62, n * 0.8 + 0.35);
  float a = uA * open * mask * mix(0.7, 1.0, body);
  vec3 c = uTint * mix(0.9, 1.04, n1.g) ;
  c = mix(c * vec3(0.9, 0.94, 1.0), c, smoothstep(0.0, 0.6, open)); // a faint blue shade where the bank thins
  vec2 sp = vC.xy / vC.w; float vig = 1.0 - 0.18 * dot(sp * vec2(0.6, 0.5), sp * vec2(0.6, 0.5));
  gl_FragColor = vec4(c * vig, a);
}`,
    });
    const g = new THREE.PlaneGeometry(WATER_RECT[2] + 600, WATER_RECT[3] + 600, 1, 1).rotateX(-Math.PI / 2).translate(WATER_RECT[0] + WATER_RECT[2] / 2, L.y, WATER_RECT[1] + WATER_RECT[3] / 2);
    const m = new THREE.Mesh(g, mat); m.renderOrder = 10 + L.y; m.frustumCulled = false;
    group.add(m);
  }
  let T = 0, target = []; // target: [{x, z, r, cur}]
  function setReveal(list, instant) {
    const next = list.slice(0, FOG_MAX).map(c => {
      const old = target.find(o => Math.abs(o.x - c[0]) < 0.5 && Math.abs(o.z - c[1]) < 0.5);
      return { x: c[0], z: c[1], r: c[2], cur: instant ? c[2] : old ? old.cur : 0 };
    });
    target = next;
    write();
  }
  function write() {
    holes.forEach((h, i) => { const t = target[i]; if (t) h.set(t.x, t.z, t.cur); else h.set(0, 0, -1); });
  }
  function update(dt) {
    T += dt; U.uTime.value = T;
    let ch = false;
    for (const t of target) if (t.cur !== t.r) { // ease out over about 1.6 s
      const k = 1 - Math.pow(0.02, dt / 1.6); t.cur += (t.r - t.cur) * k; if (Math.abs(t.r - t.cur) < 0.05) t.cur = t.r; ch = true;
    }
    if (ch) write();
  }
  return { mesh: group, setReveal, update };
}
