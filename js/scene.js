// Low-Poly-Filmset: Straße, Häuser, Platz mit Rundkurs, Requisiten, Figuren, Fahrzeuge.
// Statische Geometrie wird pro Material zusammengeführt (wenige Draw Calls -> 60 fps).
import * as THREE from './vendor/three.module.min.js';

// ---------- Materialien ----------
const matCache = new Map();
export function lam(color) {
  const key = 'l' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(key);
}
export function glow(color) {
  const key = 'b' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color }));
  return matCache.get(key);
}

// Deterministischer Zufall, damit die Welt immer gleich aussieht
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Statische Geometrie sammeln & mergen ----------
class StaticBatch {
  constructor() { this.buckets = new Map(); }

  add(geometry, material, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(sx, sy, sz),
    );
    this.addMatrix(geometry, material, m);
  }

  addMatrix(geometry, material, matrix) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    g.applyMatrix4(matrix);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }

  build(parent) {
    for (const [mat, geos] of this.buckets) {
      let n = 0;
      for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
  }
}

// Grundformen (wiederverwendet)
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BOX_B = BOX.clone().translate(0, 0.5, 0); // Boden bei y=0
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0);
const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ROOF = new THREE.CylinderGeometry(0, 0.71, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const GABLE = (() => {
  // Satteldach: Prisma, Grundfläche 1x1, Höhe 1, First entlang X
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();
const CANOPY = new THREE.IcosahedronGeometry(1, 0);

// ---------- Farben ----------
const C = {
  asphalt: 0x34373c, asphaltDark: 0x2b2e33, sidewalk: 0x8b8781, curb: 0xa29e97,
  grass: 0x5b7443, grassDark: 0x4d653a, gravel: 0xa8977b, line: 0xe9e4d6,
  trunk: 0x5b4332, leaf: [0x4f7a3a, 0x5f8a43, 0x3f6a35, 0x6e8f3e],
  houses: [0xc9b392, 0xa86f5a, 0x8b97a0, 0xd8c6a5, 0x8c6f5d, 0xb98c64, 0x6f7f8f, 0xcfa98a, 0x9aa48a],
  roofs: [0x5a3b32, 0x46484d, 0x6b3f2e, 0x3d4a52],
  window: 0x26303a, windowLit: 0xf2c46b, door: 0x3b2a22, trim: 0xe7e0d2,
  metal: 0x2a2c30, steel: 0x7d828a, lampLit: 0xfff1c8,
  stone: 0x9d968c, water: 0x4f86a8,
};

// =====================================================================
// Welt
// =====================================================================
export function buildWorld(scene) {
  const rand = rng(1907);
  const batch = new StaticBatch();
  const root = new THREE.Group();
  scene.add(root);

  // Himmel (Verlauf) + Nebel
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x1d3557) },
      mid: { value: new THREE.Color(0x7b8fa6) },
      bottom: { value: new THREE.Color(0xe8b48a) },
    },
    vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying float h;
      void main(){ vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xc9a98e, 120, 420);
  scene.background = new THREE.Color(0x7b8fa6);

  // Licht: tiefstehende Abendsonne
  scene.add(new THREE.HemisphereLight(0xbfd2ea, 0x5a4a3c, 1.25));
  const sun = new THREE.DirectionalLight(0xffd7a8, 2.1);
  sun.position.set(-80, 60, -40);
  scene.add(sun);

  // Sonne als Scheibe am Himmel
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 20), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false }));
  sunDisc.position.set(-560, 210, -280);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // ---------- Boden ----------
  batch.add(PLANE, lam(C.grassDark), 0, -0.02, 0, 0, 1400, 1, 1400);
  // Hauptstraße (entlang X), z -12..-4
  batch.add(PLANE, lam(C.asphalt), 0, 0, -8, 0, 400, 1, 8);
  // Gehweg Kameraseite z -4..+3, Gegenseite z -14..-12
  batch.add(BOX_B, lam(C.sidewalk), 0, 0, -0.5, 0, 400, 0.15, 7);
  batch.add(BOX_B, lam(C.sidewalk), 0, 0, -13, 0, 400, 0.15, 2);
  batch.add(BOX_B, lam(C.curb), 0, 0, -4.05, 0, 400, 0.17, 0.25);
  batch.add(BOX_B, lam(C.curb), 0, 0, -11.95, 0, 400, 0.17, 0.25);
  // Mittellinie gestrichelt
  for (let x = -200; x < 200; x += 6) batch.add(PLANE, lam(C.line), x, 0.01, -8, 0, 3, 1, 0.15);
  // Zebrastreifen links von der Kamera
  for (let i = 0; i < 6; i++) batch.add(PLANE, lam(C.line), -14, 0.012, -5.2 - i * 1.2, 0, 3.2, 1, 0.6);

  // Seitenstraßen x = ±68 (z -14..-80) und hintere Straße z = -76
  for (const sx of [-68, 68]) {
    batch.add(PLANE, lam(C.asphalt), sx, 0.002, -45, 0, 8, 1, 66);
    for (let z = -16; z > -74; z -= 6) batch.add(PLANE, lam(C.line), sx, 0.012, z, 0, 0.15, 1, 3);
  }
  batch.add(PLANE, lam(C.asphalt), 0, 0.003, -76, 0, 144, 1, 8);
  for (let x = -60; x < 64; x += 6) batch.add(PLANE, lam(C.line), x, 0.013, -76, 0, 3, 1, 0.15);

  // Platz: Rasen + Rundkurs (Oval) + Brunnen
  batch.add(PLANE, lam(C.grass), 0, 0.001, -44, 0, 128, 1, 60);
  const oval = new THREE.Shape();
  oval.absellipse(0, 0, 34, 22, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, 28, 16, 0, Math.PI * 2, true);
  oval.holes.push(hole);
  const ovalGeo = new THREE.ShapeGeometry(oval, 48).rotateX(-Math.PI / 2);
  batch.add(ovalGeo, lam(C.asphaltDark), 0, 0.006, -44);
  // Kies-Wege kreuzförmig zum Brunnen
  batch.add(PLANE, lam(C.gravel), 0, 0.004, -26, 0, 2.5, 1, 24);
  batch.add(PLANE, lam(C.gravel), 0, 0.007, -44, 0, 56, 1, 2.5);
  // Brunnen
  batch.add(CYL8, lam(C.stone), 0, 0.3, -44, 0, 9, 0.6, 9);
  batch.add(CYL8, lam(C.water), 0, 0.55, -44, 0, 8, 0.1, 8);
  batch.add(CYL8, lam(C.stone), 0, 1.4, -44, 0, 0.8, 2.2, 0.8);
  batch.add(CYL8, lam(C.stone), 0, 2.5, -44, 0, 2.6, 0.25, 2.6);

  // ---------- Häuser ----------
  // Reihe hinter der Kamera (Front Richtung -Z)
  houseRow(batch, rand, { x0: -150, x1: 150, z: 9, facing: -1, depth: 10, gapChance: 0.12 });
  // Reihe hinter der hinteren Straße
  houseRow(batch, rand, { x0: -150, x1: 150, z: -88, facing: 1, depth: 12, tall: true });
  // Häuserblöcke links/rechts vom Platz (jenseits der Seitenstraßen)
  for (const sx of [-1, 1]) {
    houseCol(batch, rand, { x: sx * 76, z0: -34, z1: -84, facing: -sx, depth: 12 });
  }
  // Gegenüberliegende Straßenseite außerhalb des Platzes
  houseRow(batch, rand, { x0: -150, x1: -76, z: -21, facing: 1, depth: 12 });
  houseRow(batch, rand, { x0: 76, x1: 150, z: -21, facing: 1, depth: 12 });

  // ---------- Bäume ----------
  const treeSpots = [];
  // Baumreihe am Platzrand, mit Lücke in der Sichtachse der Kamera
  for (let x = -60; x <= 60; x += 15) if (Math.abs(x) > 12) treeSpots.push([x + (rand() - 0.5) * 3, -17]);
  // Im Oval nur flache Büsche, damit der Blick auf den Platz frei bleibt
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.3;
    const s = 0.7 + rand() * 0.5;
    batch.add(CANOPY, lam(C.leaf[i % C.leaf.length]), Math.cos(a) * 17, s * 0.2, -44 + Math.sin(a) * 9, rand() * 3, s * 1.3, s * 0.45, s * 1.3);
  }
  for (let i = 0; i < 16; i++) treeSpots.push([(rand() < 0.5 ? -1 : 1) * (44 + rand() * 16), -24 - rand() * 46]);
  for (let x = -140; x <= 140; x += 16) if (Math.abs(x) > 6) treeSpots.push([x + 3, 2.2]);
  for (const [x, z] of treeSpots) tree(batch, rand, x, z);

  // ---------- Straßenlaternen ----------
  // (keine Laternen direkt vor der Kamera, damit die Sichtachse frei bleibt)
  for (let x = -130; x <= 140; x += 24) {
    if (Math.abs(x + 12) > 24) lamp(batch, x + 12, -3.6, 1);
    if (Math.abs(x) > 9) lamp(batch, x, -12.4, -1);
  }

  // ---------- Filmset-Requisiten rund um die Kamera ----------
  filmSet(batch, root);

  // Bänke am Platz
  for (const [x, z, r] of [[-8, -17.5, 0], [8, -17.5, 0], [-14, -44, Math.PI / 2], [14, -44, Math.PI / 2]]) bench(batch, x, z, r);

  // Parkende Autos vor den Häusern hinter der Kamera (statisch)
  for (const [x, z, col, ry] of [[-30, 5.6, 0x3d5a80, 0], [22, 5.6, 0xd9d4c7, Math.PI], [46, 5.6, 0x8f2d2d, 0], [-60, 5.6, 0x4a4e57, Math.PI]]) {
    const car = makeCar(col);
    car.position.set(x, 0, z);
    car.rotation.y = ry;
    car.updateMatrixWorld(true);
    car.traverse(o => { if (o.isMesh) batch.addMatrix(o.geometry, o.material, o.matrixWorld); });
  }

  batch.build(root);

  // ---------- Bewegte Ambient-Objekte ----------
  const ambient = new THREE.Group();
  scene.add(ambient);
  const movers = [];

  // Zwei Autos auf der Hauptstraße in Gegenrichtung
  const carA = makeCar(0xc8402f); ambient.add(carA);
  const carB = makeCar(0xe0b13c); ambient.add(carB);
  movers.push((t, dt) => {
    const L = 320, v = 11;
    const xa = ((t * v) % L) - L / 2;
    carA.position.set(xa, 0, -6); carA.rotation.y = 0; spinWheels(carA, v, dt);
    const xb = L / 2 - (((t * v * 0.85) + 140) % L);
    carB.position.set(xb, 0, -10); carB.rotation.y = Math.PI; spinWheels(carB, v * 0.85, dt);
  });

  // Fußgänger auf den Gehwegen
  const walkers = [
    { z: -2.4, x0: -40, x1: 30, speed: 1.3, shirt: 0x6a8caf, phase: 0 },
    { z: -1.0, x0: -10, x1: 60, speed: 1.1, shirt: 0xb5533c, phase: 17 },
    { z: -13.2, x0: -50, x1: 40, speed: 1.4, shirt: 0x8a9a5b, phase: 33 },
    { z: -12.8, x0: -20, x1: 70, speed: 1.2, shirt: 0xd6c08a, phase: 51 },
  ];
  for (const w of walkers) {
    const p = makePerson({ shirt: w.shirt, pants: 0x2e3440 });
    ambient.add(p);
    movers.push(t => {
      const len = w.x1 - w.x0;
      const s = (t * w.speed + w.phase) % (2 * len);
      const fwd = s < len;
      p.position.set(fwd ? w.x0 + s : w.x1 - (s - len), 0.15, w.z);
      p.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
      animatePerson(p, t * w.speed * 3.2, 0.5);
    });
  }

  // Crew am Set (stehend, leichte Bewegung)
  const crew = [];
  for (const [x, z, shirt, ry] of [[3.2, 1.2, 0x222222, -2.6], [-3.5, 1.6, 0x3b4a5a, 2.4], [7.5, -1.0, 0x5c3b3b, -1.2]]) {
    const p = makePerson({ shirt, pants: 0x1f2328 });
    p.position.set(x, 0.15, z);
    p.rotation.y = ry;
    root.add(p);
    crew.push(p);
  }
  movers.push(t => crew.forEach((p, i) => { p.userData.parts.torso.rotation.y = Math.sin(t * 0.4 + i * 2) * 0.25; }));

  // Kameradrohne über dem Platz (nur im freien Modus sichtbar)
  const drone = makeDrone();
  ambient.add(drone);
  movers.push(t => {
    drone.position.set(Math.sin(t * 0.11) * 30, 14 + Math.sin(t * 0.23) * 3, -45 + Math.cos(t * 0.11) * 18);
    spinRotors(drone, t);
  });

  return {
    root,
    ambient,
    update(t, dt) { for (const m of movers) m(t, dt); },
    setAmbientVisible(v) { ambient.visible = v; },
  };
}

// ---------- Bausteine ----------
function house(batch, rand, x, z, w, d, facing, tall) {
  const floors = tall ? 3 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 3);
  const fh = 3.1;
  const h = floors * fh + 0.6;
  const col = C.houses[Math.floor(rand() * C.houses.length)];
  const roofCol = C.roofs[Math.floor(rand() * C.roofs.length)];
  batch.add(BOX_B, lam(col), x, 0, z, 0, w, h, d);
  // Sockel
  batch.add(BOX_B, lam(0x5f5a54), x, 0, z, 0, w + 0.1, 0.6, d + 0.1);
  // Dach
  const roofType = rand();
  if (roofType < 0.45) batch.add(GABLE, lam(roofCol), x, h, z, 0, w + 0.4, 2.2 + rand() * 1.5, d + 0.4);
  else if (roofType < 0.7) batch.add(ROOF, lam(roofCol), x, h, z, 0, w + 0.3, 2.5, d + 0.3);
  else batch.add(BOX_B, lam(C.trim), x, h, z, 0, w + 0.3, 0.4, d + 0.3);
  // Fenster & Tür an der Front
  const fz = z + facing * (d / 2 + 0.02);
  const cols = Math.max(2, Math.floor(w / 2.6));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + (c + 0.5) * (w / cols);
      const wy = 0.6 + f * fh + 1.0;
      if (f === 0 && c === Math.floor(cols / 2)) {
        batch.add(BOX_B, lam(C.door), wx, 0.6, fz, 0, 1.2, 2.2, 0.12);
        continue;
      }
      const lit = rand() < 0.22;
      batch.add(BOX_B, lit ? glow(C.windowLit) : lam(C.window), wx, wy, fz, 0, 1.1, 1.5, 0.1);
      batch.add(BOX_B, lam(C.trim), wx, wy - 0.12, fz + facing * 0.04, 0, 1.35, 0.12, 0.16);
    }
  }
}

function houseRow(batch, rand, { x0, x1, z, facing, depth, gapChance = 0, tall = false }) {
  let x = x0;
  while (x < x1) {
    const w = 7 + rand() * 7;
    // z ist die Frontlinie, das Haus liegt dahinter
    if (rand() >= gapChance) house(batch, rand, x + w / 2, z - facing * depth / 2, w - 0.4, depth, facing, tall);
    x += w;
  }
}

function houseCol(batch, rand, { x, z0, z1, facing, depth }) {
  // Häuser entlang Z (x = Frontlinie): lokal mit Front nach +Z bauen, dann drehen.
  let z = z0;
  while (z > z1) {
    const w = 7 + rand() * 6;
    const local = new StaticBatch();
    house(local, rand, 0, 0, w - 0.4, depth, 1, false);
    const m = new THREE.Matrix4().makeRotationY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.setPosition(x - facing * depth / 2, 0, z - w / 2);
    for (const [mat, geos] of local.buckets) for (const geo of geos) batch.addMatrix(geo, mat, m);
    z -= w;
  }
}

function tree(batch, rand, x, z) {
  const h = 2.2 + rand() * 1.8;
  const s = 1.6 + rand() * 1.4;
  batch.add(CYL6, lam(C.trunk), x, 0, z, 0, 0.35, h, 0.35);
  const leaf = lam(C.leaf[Math.floor(rand() * C.leaf.length)]);
  batch.add(CANOPY, leaf, x, h + s * 0.7, z, rand() * 3, s, s * 1.15, s);
  if (rand() < 0.5) batch.add(CANOPY, leaf, x + 0.5, h + s * 1.5, z - 0.3, rand() * 3, s * 0.6, s * 0.7, s * 0.6);
}

function lamp(batch, x, z, dir) {
  batch.add(CYL6, lam(C.metal), x, 0, z, 0, 0.16, 5.2, 0.16);
  batch.add(BOX_B, lam(C.metal), x, 5.1, z + dir * 0.6, 0, 0.14, 0.12, 1.3);
  batch.add(BOX_B, glow(C.lampLit), x, 4.9, z + dir * 1.15, 0, 0.45, 0.2, 0.3);
}

function bench(batch, x, z, ry) {
  batch.add(BOX_B, lam(0x6b4a33), x, 0.45, z, ry, 2, 0.08, 0.5);
  batch.add(BOX_B, lam(0x6b4a33), x, 0.55, z - 0.25 * Math.cos(ry), ry, 2, 0.5, 0.06);
  batch.add(BOX_B, lam(C.metal), x, 0, z, ry, 1.8, 0.45, 0.4);
}

function filmSet(batch, root) {
  // Zwei Scheinwerfer auf Stativen, Richtung Straße
  for (const [x, z, ry] of [[5, -1.8, 0.5], [-6, -2.2, -0.6]]) {
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x + Math.cos(a) * 0.45, 0.6, z + Math.sin(a) * 0.45),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)),
        new THREE.Vector3(0.05, 1.3, 0.05));
      batch.addMatrix(BOX, lam(C.metal), m);
    }
    batch.add(CYL6, lam(C.steel), x, 0.9, z, 0, 0.07, 1.9, 0.07);
    const head = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 3.0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, ry + Math.PI, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1));
    const body = new THREE.Matrix4().makeScale(0.7, 0.6, 0.6);
    batch.addMatrix(BOX, lam(0x1b1c1f), head.clone().multiply(body));
    const lens = new THREE.Matrix4().makeTranslation(0, 0, 0.31).multiply(new THREE.Matrix4().makeScale(0.55, 0.45, 0.02));
    batch.addMatrix(BOX, glow(0xfff4dc), head.clone().multiply(lens));
    // Torblenden
    for (const sx of [-1, 1]) {
      const flap = new THREE.Matrix4().makeTranslation(sx * 0.42, 0, 0.42).multiply(new THREE.Matrix4().makeRotationY(sx * 0.5)).multiply(new THREE.Matrix4().makeScale(0.02, 0.55, 0.32));
      batch.addMatrix(BOX, lam(0x111214), head.clone().multiply(flap));
    }
  }
  // C-Stand mit schwarzer Fahne
  batch.add(CYL6, lam(C.steel), 9, 0, -0.5, 0, 0.06, 2.6, 0.06);
  batch.add(BOX_B, lam(0x0e0f11), 8.4, 2.1, -0.6, 0.3, 1.2, 0.9, 0.03);
  // Regiestuhl
  for (const [x, z] of [[2.2, 2.4], [-2.4, 2.6]]) {
    batch.add(BOX_B, lam(0x6b4a33), x, 0.15, z, 0.3, 0.6, 0.6, 0.06);
    batch.add(BOX_B, lam(0x6b4a33), x, 0.15, z + 0.5, 0.3, 0.6, 0.6, 0.06);
    batch.add(BOX_B, lam(0x1f1f22), x, 0.75, z + 0.25, 0.3, 0.62, 0.04, 0.5);
    batch.add(BOX_B, lam(0x1f1f22), x - 0.08, 0.8, z + 0.55, 0.3, 0.62, 0.45, 0.04);
  }
  // Apple-Boxen, Sandsäcke, Pylonen, Kabelcase
  for (const [x, z, w, h, d, c] of [[1.4, 1.6, 0.5, 0.2, 0.3, 0xb08a5a], [1.4, 1.6, 0.5, 0.2, 0.3, 0xb08a5a], [-1.2, 2.2, 0.9, 0.45, 0.55, 0x222428], [4.2, 0.5, 0.6, 0.15, 0.35, 0x8a3b2e]]) {
    batch.add(BOX_B, lam(c), x, 0.15, z, 0.2, w, h, d);
  }
  for (const [x, z] of [[-12, -4.6], [-12, -11.4], [16, -4.6], [16, -11.4]]) {
    batch.add(new THREE.ConeGeometry(0.22, 0.7, 6).translate(0, 0.35, 0), lam(0xe8641e), x, 0.15, z);
    batch.add(BOX_B, lam(0xe8641e), x, 0.15, z, 0, 0.45, 0.04, 0.45);
  }
  // Monitorwagen
  batch.add(BOX_B, lam(0x2b2d31), -4.5, 0.15, 0.6, -0.4, 0.9, 1.0, 0.6);
  batch.add(BOX_B, lam(0x0b0c0d), -4.5, 1.15, 0.6, -0.4, 0.7, 0.45, 0.06);
  batch.add(BOX_B, glow(0x3a6ea5), -4.52, 1.2, 0.56, -0.4, 0.6, 0.35, 0.02);
  void root;
}

// =====================================================================
// Modelle (exportiert für die Spielmodi)
// =====================================================================
export function makeCar(color = 0xc8402f) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BOX, lam(color));
  body.scale.set(4.2, 0.75, 1.8); body.position.y = 0.72;
  const cabin = new THREE.Mesh(BOX, lam(0x2a3540));
  cabin.scale.set(2.2, 0.62, 1.6); cabin.position.set(-0.25, 1.4, 0);
  const roof = new THREE.Mesh(BOX, lam(color));
  roof.scale.set(1.9, 0.08, 1.55); roof.position.set(-0.3, 1.74, 0);
  const bumperF = new THREE.Mesh(BOX, lam(0x1c1d20));
  bumperF.scale.set(0.15, 0.25, 1.8); bumperF.position.set(2.14, 0.45, 0);
  const bumperR = bumperF.clone(); bumperR.position.x = -2.14;
  g.add(body, cabin, roof, bumperF, bumperR);
  for (const z of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(BOX, glow(0xfff6d8)); hl.scale.set(0.05, 0.16, 0.36); hl.position.set(2.11, 0.82, z);
    const tl = new THREE.Mesh(BOX, glow(0xd02020)); tl.scale.set(0.05, 0.14, 0.32); tl.position.set(-2.11, 0.84, z);
    g.add(hl, tl);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10).rotateX(Math.PI / 2);
  for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const w = new THREE.Mesh(wheelGeo, lam(0x141518));
    w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function spinWheels(car, speed, dt = 1 / 60) {
  for (const w of car.userData.wheels) w.rotation.z -= (speed / 0.36) * dt;
}

export function makePerson({ shirt = 0x6a8caf, pants = 0x2e3440, skin = 0xd9a77f, hair = 0x3a2a20 } = {}) {
  const g = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.62, 6), lam(shirt));
  chest.position.y = 0.31;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), lam(skin));
  head.position.y = 0.78;
  const hairM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.145, 0), lam(hair));
  hairM.position.set(0, 0.83, -0.02); hairM.scale.set(1, 0.6, 1);
  torso.add(chest, head, hairM);
  const legGeo = new THREE.BoxGeometry(0.14, 0.9, 0.16).translate(0, -0.45, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.6, 0.12).translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, lam(pants)); legL.position.set(-0.1, 0.95, 0);
  const legR = new THREE.Mesh(legGeo, lam(pants)); legR.position.set(0.1, 0.95, 0);
  const armL = new THREE.Mesh(armGeo, lam(shirt)); armL.position.set(-0.27, 0.58, 0);
  const armR = new THREE.Mesh(armGeo, lam(shirt)); armR.position.set(0.27, 0.58, 0);
  torso.add(armL, armR);
  g.add(torso, legL, legR);
  // Modell schaut nach +Z
  g.userData.parts = { torso, legL, legR, armL, armR };
  return g;
}

/** phase: Schrittphase (rad), amp: Schwungweite (0.5 gehen, 1 rennen) */
export function animatePerson(p, phase, amp) {
  const { legL, legR, armL, armR, torso } = p.userData.parts;
  const s = Math.sin(phase);
  legL.rotation.x = s * amp * 0.9;
  legR.rotation.x = -s * amp * 0.9;
  armL.rotation.x = -s * amp * 0.8;
  armR.rotation.x = s * amp * 0.8;
  torso.rotation.x = amp > 0.7 ? 0.18 : 0;
  torso.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.05 * amp;
}

export function makeDrone(scale = 1.4) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BOX, lam(0x2a2c31));
  body.scale.set(0.42, 0.16, 0.42);
  const gimbal = new THREE.Mesh(BOX, lam(0x111214));
  gimbal.scale.set(0.16, 0.16, 0.16); gimbal.position.y = -0.17;
  g.add(body, gimbal);
  const rotors = [];
  const rotorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.015, 10);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const arm = new THREE.Mesh(BOX, lam(0x3a3d43));
    arm.scale.set(0.5, 0.04, 0.05);
    arm.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    arm.rotation.y = -a;
    const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshBasicMaterial({ color: 0xcfd6de, transparent: true, opacity: 0.45 }));
    rotor.position.set(Math.cos(a) * 0.48, 0.07, Math.sin(a) * 0.48);
    const led = new THREE.Mesh(BOX, glow(i < 2 ? 0x30ff60 : 0xff3030));
    led.scale.set(0.05, 0.05, 0.05);
    led.position.set(Math.cos(a) * 0.48, -0.03, Math.sin(a) * 0.48);
    g.add(arm, rotor, led);
    rotors.push(rotor);
  }
  g.userData.rotors = rotors;
  g.scale.setScalar(scale);
  return g;
}

export function spinRotors(drone, t) {
  drone.userData.rotors.forEach((r, i) => { r.rotation.y = t * 40 * (i % 2 ? 1 : -1); });
}
