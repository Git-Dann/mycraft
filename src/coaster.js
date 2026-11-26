// Roller coaster: walks connected track blocks into a smooth path (with vertical loops),
// simulates a small train along it with simple gravity physics, and drives the rider camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BY_KEY } from './blocks.js';
import { W, D } from './world.js';

const B = BY_KEY;
const LOOP_R = 2.3;
const STEP = 0.1;
const CARS = 3;
const CAR_GAP = 1.35;

function loopPoints(p0, d, lat, n = 26) {
  // Starts a little before the cell centre, climbs a vertical circle, and leaves a little after it.
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const along = LOOP_R * Math.sin(th) + 0.8 * (i / n) - 0.4;
    pts.push({
      x: p0.x + d.x * along + lat.x * 0.55 * Math.sin(th / 2),
      y: p0.y + LOOP_R * (1 - Math.cos(th)),
      z: p0.z + d.z * along + lat.z * 0.55 * Math.sin(th / 2),
      loop: i > 0 && i < n,
    });
  }
  return pts;
}

function colouredBox(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const normals = g.attributes.normal.array;
  for (let i = 0; i < n; i++) {
    const ny = normals[i * 3 + 1], nx = normals[i * 3];
    const s = ny > 0.5 ? 1 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.8 : 0.7;
    cols[i * 3] = c.r * s; cols[i * 3 + 1] = c.g * s; cols[i * 3 + 2] = c.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

function cartGeometry(front) {
  const parts = [
    colouredBox(0.95, 0.42, 1.2, 0xc77d62, 0, 0.36, 0),
    colouredBox(0.99, 0.1, 1.24, 0xe5c579, 0, 0.6, 0),
    colouredBox(0.7, 0.12, 0.9, 0x5b4636, 0, 0.6, 0.02),
    colouredBox(0.18, 0.18, 0.2, 0x3a3f3b, 0.42, 0.12, 0.38),
    colouredBox(0.18, 0.18, 0.2, 0x3a3f3b, -0.42, 0.12, 0.38),
    colouredBox(0.18, 0.18, 0.2, 0x3a3f3b, 0.42, 0.12, -0.38),
    colouredBox(0.18, 0.18, 0.2, 0x3a3f3b, -0.42, 0.12, -0.38),
  ];
  if (front) parts.push(colouredBox(0.95, 0.5, 0.18, 0xa9634b, 0, 0.55, -0.62), colouredBox(0.5, 0.12, 0.05, 0xffe7a3, 0, 0.6, -0.72));
  return mergeGeometries(parts);
}

export class Coaster {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.riding = false;
    this.path = null;
    this.rings = new THREE.Group();
    scene.add(this.rings);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe5c579, fog: true });
    this.spineMat = new THREE.MeshBasicMaterial({ color: 0xa9853f, fog: true });
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.cars = [];
    for (let i = 0; i < CARS; i++) {
      const m = new THREE.Mesh(cartGeometry(i === 0), mat);
      m.visible = false;
      m.matrixAutoUpdate = false;
      scene.add(m);
      this.cars.push(m);
    }
    this.camQuat = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._cp = new THREE.Vector3(); this._ct = new THREE.Vector3(); this._cu = new THREE.Vector3();
    this._bx = new THREE.Vector3(); this._by = new THREE.Vector3(); this._bz = new THREE.Vector3();
    this._lq = new THREE.Quaternion();
  }

  /** Rebuild the decorative loop rings for every Loop block in the world. */
  rebuildRings(world) {
    for (const c of this.rings.children) c.geometry.dispose();
    this.rings.clear();
    for (const [i, axis] of world.meta) {
      if (world.data[i] !== B.loop) continue;
      const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D));
      const p0 = { x: x + 0.5, y: y + 0.1, z: z + 0.5 };
      const d = axis === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const lat = { x: -d.z, z: d.x };
      const pts = loopPoints(p0, d, lat, 40).map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const ctr = (j) => new THREE.Vector3(p0.x + d.x * (0.8 * j - 0.4), p0.y + LOOP_R, p0.z + d.z * (0.8 * j - 0.4));
      for (const side of [-0.3, 0.3]) {
        const rail = pts.map((p) => p.clone().add(new THREE.Vector3(lat.x * side, 0, lat.z * side)));
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 80, 0.04, 5, false);
        this.rings.add(new THREE.Mesh(g, this.ringMat));
      }
      const spine = pts.map((p, j) => {
        const c = ctr(j / (pts.length - 1));
        return p.clone().add(c.sub(p).normalize().multiplyScalar(-0.14));
      });
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 80, 0.05, 5, false);
      this.rings.add(new THREE.Mesh(g, this.spineMat));
    }
  }

  /** Builds an ordered list of track cells from the start cell. */
  walk(world, sx, sy, sz) {
    const key = (x, y, z) => world.idx(x, y, z);
    const conns = world.railConnections(sx, sy, sz, []);
    const follow = (from, first) => {
      const out = [];
      const seen = new Set([key(from.x, from.y, from.z)]);
      let prev = from, cur = first;
      while (cur && out.length < 4000) {
        const k = key(cur.x, cur.y, cur.z);
        if (seen.has(k)) return { cells: out, closed: k === key(sx, sy, sz) };
        seen.add(k);
        out.push({ x: cur.x, y: cur.y, z: cur.z });
        const next = world.railConnections(cur.x, cur.y, cur.z, []).find((c) => !(c.x === prev.x && c.y === prev.y && c.z === prev.z));
        prev = cur;
        cur = next;
      }
      return { cells: out, closed: false };
    };
    const start = { x: sx, y: sy, z: sz };
    if (!conns.length) return { cells: [start], closed: false };
    const a = follow(start, conns[0]);
    if (a.closed) return { cells: [start, ...a.cells], closed: true };
    const b = conns[1] ? follow(start, conns[1]) : { cells: [] };
    return { cells: [...b.cells.reverse(), start, ...a.cells], closed: false, startIndex: b.cells.length };
  }

  buildPath(world, sx, sy, sz) {
    const { cells, closed, startIndex = 0 } = this.walk(world, sx, sy, sz);
    if (cells.length < 2) return null;
    // Control points (rail centre heights), with loops expanded into circles.
    const ctrl = [];
    let startCtrl = 0;
    const n = cells.length;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      if (i === startIndex) startCtrl = ctrl.length;
      const p = { x: c.x + 0.5, y: world.railHeight(c.x, c.y, c.z), z: c.z + 0.5, loop: false };
      // Corners: steer through the middle of the curved rail rather than the cell centre
      const cc = world.railConnections(c.x, c.y, c.z, []);
      if (cc.length === 2 && cc[0].dx * cc[1].dx + cc[0].dz * cc[1].dz === 0 && world.get(c.x, c.y, c.z) !== B.loop) {
        const kx = p.x + (cc[0].dx + cc[1].dx) * 0.5, kz = p.z + (cc[0].dz + cc[1].dz) * 0.5;
        const len = Math.hypot(p.x - kx, p.z - kz);
        p.x = kx + ((p.x - kx) / len) * 0.5;
        p.z = kz + ((p.z - kz) / len) * 0.5;
      }
      if (world.get(c.x, c.y, c.z) === B.loop) {
        const prev = cells[(i - 1 + n) % n], next = cells[(i + 1) % n];
        const a = i > 0 || closed ? prev : c, b = i < n - 1 || closed ? next : c;
        let dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
        if (!dx && !dz) dx = world.getMeta(c.x, c.y, c.z) === 0 ? 1 : 0, dz = dx ? 0 : 1;
        const d = { x: dx, z: dz }, lat = { x: -dz, z: dx };
        ctrl.push(...loopPoints(p, d, lat));
      } else ctrl.push(p);
    }
    // Dense Catmull-Rom samples
    const dense = [];
    const m = ctrl.length;
    const get = (i) => (closed ? ctrl[(i + m) % m] : ctrl[Math.max(0, Math.min(m - 1, i))]);
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const sub = p1.loop || p2.loop ? 3 : 6;
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z), loop: p1.loop && p2.loop, start: i === startCtrl && k === 0 });
      }
    }
    if (!closed) dense.push({ ...ctrl[m - 1] });
    if (closed) dense.push({ ...dense[0] });
    // Resample at uniform arc length
    const P = [], U = [], L = [];
    let acc = 0, startS = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1], b = dense[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (seg < 1e-6) continue;
      let s = (Math.ceil(acc / STEP) * STEP) - acc;
      if (a.start) startS = acc;
      while (s <= seg) {
        const t = s / seg;
        P.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        L.push(a.loop ? 1 : 0);
        s += STEP;
      }
      acc += seg;
    }
    const count = P.length / 3;
    if (count < 4) return null;
    // Tangents and parallel-transported up vectors (so loops roll naturally)
    const T = new Float32Array(count * 3);
    const Up = new Float32Array(count * 3);
    const t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
      const ia = closed ? (i - 1 + count) % count : a, ib = closed ? (i + 1) % count : b;
      t.set(P[ib * 3] - P[ia * 3], P[ib * 3 + 1] - P[ia * 3 + 1], P[ib * 3 + 2] - P[ia * 3 + 2]).normalize();
      up.sub(tmp.copy(t).multiplyScalar(up.dot(t)));
      if (!L[i] && Math.abs(t.y) < 0.8) up.lerp(tmp.set(0, 1, 0), 0.08);
      up.sub(tmp.copy(t).multiplyScalar(up.dot(t))).normalize();
      T.set([t.x, t.y, t.z], i * 3);
      Up.set([up.x, up.y, up.z], i * 3);
    }
    return { P, T, Up, L, count, length: (count - 1) * STEP, closed, startS: Math.round(startS / STEP) * STEP };
  }

  board(world, x, y, z) {
    const path = this.buildPath(world, x, y, z);
    if (!path) return false;
    this.path = path;
    this.s = path.startS;
    this.v = 4;
    this.dir = 1;
    this.riding = true;
    this.laps = 0;
    this.wasInLoop = false;
    this.lookYaw = 0;
    this.lookPitch = 0;
    for (const c of this.cars) c.visible = true;
    this.audio.cartStart();
    this.update(0, null);
    this.camQuat.copy(this.targetQuat || this.camQuat);
    return true;
  }

  exit() {
    this.riding = false;
    for (const c of this.cars) c.visible = false;
    this.audio.cartStop();
  }

  wrap(s) {
    const p = this.path;
    if (p.closed) return ((s % p.length) + p.length) % p.length;
    return Math.max(0, Math.min(p.length, s));
  }

  sample(s, outP, outT, outU) {
    const p = this.path;
    const f = s / STEP;
    let i = Math.floor(f);
    const k = f - i;
    i = Math.min(i, p.count - 1);
    const j = p.closed ? (i + 1) % p.count : Math.min(i + 1, p.count - 1);
    outP.set(p.P[i * 3] + (p.P[j * 3] - p.P[i * 3]) * k, p.P[i * 3 + 1] + (p.P[j * 3 + 1] - p.P[i * 3 + 1]) * k, p.P[i * 3 + 2] + (p.P[j * 3 + 2] - p.P[i * 3 + 2]) * k);
    if (outT) outT.set(p.T[i * 3], p.T[i * 3 + 1], p.T[i * 3 + 2]);
    if (outU) outU.set(p.Up[i * 3], p.Up[i * 3 + 1], p.Up[i * 3 + 2]);
    return p.L[i];
  }

  /** Returns the rider eye position into `eye` and sets `this.targetQuat`. */
  update(dt, eye) {
    if (!this.riding || !this.path) return;
    const p = this.path;
    const pos = this._x, tan = this._y, up = this._z;
    let inLoop = this.sample(this.s, pos, tan, up);
    // Physics: gravity along the slope, rolling resistance and drag. A chain lift keeps it moving.
    const slope = tan.y * this.dir;
    this.v += (-9.81 * slope - 0.012 * this.v * this.v - 0.25) * dt;
    let lifting = false;
    if (this.v < 3.2) { this.v = 3.2; lifting = slope > 0.05; }
    if (inLoop && this.v < 8) this.v += 14 * dt; // magnetic booster keeps loops friendly
    this.v = Math.min(this.v, 21);
    this.s += this.v * this.dir * dt;
    if (p.closed && (this.s >= p.length || this.s < 0)) {
      // Closed circuit: wrap round (previously the camera got stuck at the end after one lap)
      this.s = this.wrap(this.s);
      this.laps = (this.laps || 0) + 1;
      this.onLap?.(this.laps);
    }
    if (!p.closed && (this.s <= 0 || this.s >= p.length)) {
      this.s = Math.max(0, Math.min(p.length, this.s));
      this.dir *= -1; // shuttle back at the end of an open track
      this.v = Math.max(3.2, this.v * 0.5);
    }
    this.dist = (this.dist || 0) + this.v * dt;
    this.audio.cartUpdate(this.v, lifting, this.dist);

    // Place cars
    const cp = this._cp, ct = this._ct, cu = this._cu;
    for (let i = 0; i < CARS; i++) {
      const s = this.wrap(this.s - this.dir * i * CAR_GAP);
      this.sample(s, cp, ct, cu);
      if (this.dir < 0) ct.negate();
      this.basis(ct, cu);
      this.cars[i].matrix.copy(this._m).setPosition(cp);
      this.cars[i].matrixWorldNeedsUpdate = true;
    }
    // Rider camera (front car)
    inLoop = this.sample(this.s, pos, tan, up);
    if (this.wasInLoop && !inLoop) this.onLoop?.();
    this.wasInLoop = !!inLoop;
    if (this.dir < 0) tan.negate();
    this.basis(tan, up);
    this.targetQuat = this._q.setFromRotationMatrix(this._m);
    if (eye) eye.copy(pos).addScaledVector(up, 1.3).addScaledVector(tan, 0.05);
    return inLoop;
  }

  basis(t, u) {
    const z = this._bz.copy(t).negate();
    const x = this._bx.crossVectors(u, z).normalize();
    const y = this._by.crossVectors(z, x);
    this._m.makeBasis(x, y, z);
  }

  applyCamera(camera, dt, lookYaw, lookPitch) {
    const k = 1 - Math.exp(-dt * 10);
    this.camQuat.slerp(this.targetQuat, dt === 0 ? 1 : k);
    this._e.set(lookPitch, lookYaw, 0, 'YXZ');
    camera.quaternion.copy(this.camQuat).multiply(this._lq.setFromEuler(this._e));
  }
}
