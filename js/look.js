// Shared look (same method as the Octo Arms prototype's look.js): toy colours, rounded boxes and a vertex-colour
// merge builder. Every solid prop is one merged geometry on one Lambert material, so the whole harbor is a
// handful of draw calls. Rim light and the screen vignette live inside the material shaders.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

export const PAL = {
  quay: 0xd9d2c3, quayD: 0xb9b1a2, quayEdge: 0x8f8a80, asphalt: 0x6f7480, line: 0xf6f1e2, paint: 0xffd23d,
  white: 0xffffff, cream: 0xfff3dc, wall: 0xf1ede4, wallD: 0xd4cfc4,
  navy: 0x24427e, navyD: 0x1b3260, blue: 0x3e86e6, blueL: 0x6fb2ff, steel: 0x8b96a8, steelD: 0x5d6778, gun: 0x4a5160,
  glass: 0x9fd3f5, glassD: 0x5f9fd0, hull: 0x2f4f8f, deck: 0xc9b48a, deckD: 0xa98f62,
  red: 0xe24a3f, redD: 0xb3322b, roofRed: 0xd94b3c, wood: 0xa8703f, woodD: 0x7d5030, rope: 0xd9c08a,
  black: 0x24262d, sail: 0x2c2c33, gold: 0xffc93a, yellow: 0xffd23d, orange: 0xff8a1f, green: 0x3cc35a, greenD: 0x2a9a45,
  sand: 0xf0dcae, sandD: 0xd9c08d, grass: 0x8fcf6a, grassD: 0x6fb44f, rock: 0x9aa0a8, rockD: 0x767c86,
  leaf: 0x4fae4c, leafD: 0x3b8f3e, pine: 0x3f9a5a, trunk: 0x8a5a36, rust: 0xa8643a, burnt: 0x3a3634,
  container: [0xe24a3f, 0x3e86e6, 0xffb43d, 0x3cc35a, 0xf1ede4],
};

const C = new THREE.Color();
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3(), P = new THREE.Vector3();

// Unit box with rounded edges (radius r relative to a 1x1x1 box), built once per radius and scaled per use.
const rbCache = new Map();
export function roundedBoxGeo(r = 0.12, seg = 3) {
  const key = r + ':' + seg;
  if (rbCache.has(key)) return rbCache.get(key);
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3();
  const h = 0.5, ih = h - r;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(THREE.MathUtils.clamp(v.x, -ih, ih), THREE.MathUtils.clamp(v.y, -ih, ih), THREE.MathUtils.clamp(v.z, -ih, ih));
    n.subVectors(v, inner);
    if (n.lengthSq() < 1e-8) n.fromBufferAttribute(nor, i); else n.normalize();
    v.copy(inner).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.deleteAttribute('uv');
  rbCache.set(key, g);
  return g;
}

const prim = {};
export function base(kind) {
  if (prim[kind]) return prim[kind];
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'rbox': g = roundedBoxGeo(0.14); break;
    case 'rbox2': g = roundedBoxGeo(0.28, 4); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14); break;
    case 'cyl8': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); break;
    case 'cyl6': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); break;
    case 'cone6': g = new THREE.ConeGeometry(0.5, 1, 6); break;
    case 'cone4': g = new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4); break; // pyramid on a 1x1 base
    case 'sph': g = new THREE.SphereGeometry(0.5, 14, 10); break;
    case 'sphLo': g = new THREE.SphereGeometry(0.5, 9, 6); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'ico': g = new THREE.IcosahedronGeometry(0.5, 1); break;
    case 'ico0': g = new THREE.IcosahedronGeometry(0.5, 0); break;
    case 'torus': g = new THREE.TorusGeometry(0.5, 0.12, 6, 16); break;
    // half cylinder lying along z, flat side down (Quonset hangar roof); 1 wide, 0.5 high, 1 long
    case 'hcyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2); break;
    // wedge: ramp rising toward -z (slipways, bows)
    case 'wedge': {
      const s = new THREE.Shape(); s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(-0.5, 0.5); s.lineTo(-0.5, -0.5);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateY(-Math.PI / 2);
      break;
    }
    default: throw new Error('unknown prim ' + kind);
  }
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  prim[kind] = g;
  return g;
}

export function paint(g, color) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  C.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Collects coloured primitives and merges them into one geometry.
export class Builder {
  constructor() { this.parts = []; }
  add(kind, color, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
    const g = base(kind).clone();
    E.set(rx, ry, rz); Q.setFromEuler(E); P.set(x, y, z); SC.set(sx, sy, sz);
    M.compose(P, Q, SC);
    g.applyMatrix4(M);
    paint(g, color);
    this.parts.push(g);
    return this;
  }
  // a box whose bottom sits at y (handy for buildings and props)
  boxOn(kind, color, x, y, z, sx, sy, sz, ry = 0) { return this.add(kind, color, [x, y + sy / 2, z], [sx, sy, sz], [0, ry, 0]); }
  // an upright cylinder whose bottom sits at y
  cylOn(kind, color, x, y, z, d, h, d2 = d) { return this.add(kind, color, [x, y + h / 2, z], [d, h, d2]); }
  // already coloured geometry; optional placement
  addGeo(g, at, rot, scale) {
    if (at || rot || scale) {
      E.set(...(rot || [0, 0, 0])); Q.setFromEuler(E); P.set(...(at || [0, 0, 0])); SC.set(...(scale || [1, 1, 1]));
      M.compose(P, Q, SC); g = g.clone(); g.applyMatrix4(M);
    }
    this.parts.push(g); return this;
  }
  build() {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const parts = this.parts.map(p => {
      const q = p.index ? p.toNonIndexed() : p;
      for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') q.deleteAttribute(k);
      return q;
    });
    const g = mergeGeometries(parts, false);
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.parts = [];
    return g;
  }
}

// Soft rim light: a thin warm edge so blocky shapes read against the water.
const RIM = 'outgoingLight += vec3(1.0, 0.97, 0.9) * pow(1.0 - saturate(dot(geometryViewDir, normal)), 3.0) * 0.18;\n#include <opaque_fragment>';
// Screen vignette inside the scene's own shaders (cheaper than a full-screen CSS overlay on budget phones).
export const VIG = { uVig: { value: new THREE.Vector2(0, 0) } };
export function addVig(sh) {
  sh.uniforms.uVig = VIG.uVig;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec2 uVig;')
    .replace('#include <opaque_fragment>', `if (uVig.x > 0.0) {
    vec2 vq = (gl_FragCoord.xy * uVig - vec2(0.5, 0.5)) / vec2(1.15, 0.9);
    float va = 0.26 * clamp((length(vq) - 0.55) / 0.45, 0.0, 1.0);
    outgoingLight = mix(outgoingLight, vec3(0.02, 0.06, 0.12), 1.0 - pow(1.0 - va, 2.2));
  }
#include <opaque_fragment>`);
}
function addRim(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', RIM);
  addVig(sh);
}

export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  burnt: new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x55504c }),
  ghost: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
};
MAT.solid.onBeforeCompile = addRim; MAT.solid.customProgramCacheKey = () => 'rim-vig';
MAT.burnt.onBeforeCompile = addRim; MAT.burnt.customProgramCacheKey = () => 'rim-vig-b';
MAT.ground.onBeforeCompile = addVig; MAT.ground.customProgramCacheKey = () => 'vig';

export function solidMesh(geo, mat = MAT.solid, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// Seeded random for scenery placement (same harbor every load).
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
