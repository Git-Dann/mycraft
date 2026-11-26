// Sky dome, drifting clouds and hopping bunnies. Each is a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SOLID } from './blocks.js';
import { W, D, H } from './world.js';

export const PALETTES = {
  overworld: { top: 0x8fbcd4, horizon: 0xe4ecea, fog: 0xdfe8e6, cloud: 0xffffff },
  bunny: { top: 0xf2a7c9, horizon: 0xffe6f0, fog: 0xffe3ee, cloud: 0xfff7fb },
};

export class Sky {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(150, 24, 12);
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Low-poly clouds: flat slabs merged into one mesh
    const parts = [];
    const r = mulberry(11);
    for (let i = 0; i < 26; i++) {
      const cx = r() * 260 - 130, cz = r() * 260 - 130, cy = 0;
      const n2 = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n2; k++) {
        const b = new THREE.BoxGeometry(6 + r() * 10, 1.4, 4 + r() * 6);
        b.translate(cx + (r() - 0.5) * 10, cy + (r() < 0.3 ? 1.2 : 0), cz + (r() - 0.5) * 6);
        parts.push(b);
      }
    }
    const cg = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
    this.clouds = new THREE.Mesh(cg, this.cloudMat);
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
  }

  setPalette(p, scene) {
    this.setColors(new THREE.Color(p.top), new THREE.Color(p.horizon), new THREE.Color(p.fog), scene);
    this.cloudMat.color.setHex(p.cloud);
  }

  /** Repaints the dome gradient and fog. Called a few times a second by the day/night cycle. */
  setColors(top, hor, fog, scene) {
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    const c = this._c || (this._c = new THREE.Color());
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 150;
      const t = Math.max(0, Math.min(1, (y + 0.05) / 0.6));
      c.copy(hor).lerp(top, Math.pow(t, 0.8));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    scene.fog.color.copy(fog);
    if (!scene.background || !scene.background.isColor) scene.background = new THREE.Color();
    scene.background.copy(fog);
    document.body.style.background = `#${fog.getHexString()}`;
  }

  update(dt, camPos) {
    this.mesh.position.copy(camPos);
    // Clouds slowly turn around the middle of the world: seamless drift with no wrapping.
    this.clouds.position.set(W / 2, H + 14, D / 2);
    this.clouds.rotation.y += dt * 0.004;
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadedBox(w, h, d, color, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const nrm = g.attributes.normal.array;
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length / 3; i++) {
    const s = nrm[i * 3 + 1] > 0.5 ? 1 : nrm[i * 3 + 1] < -0.5 ? 0.6 : Math.abs(nrm[i * 3]) > 0.5 ? 0.82 : 0.74;
    cols[i * 3] = c.r * s; cols[i * 3 + 1] = c.g * s; cols[i * 3 + 2] = c.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

const BUNNY_TINTS = [0xffffff, 0xffffff, 0xf1e4d3, 0xc9a27e, 0xb8b3ad, 0xffffff];

export class Bunnies {
  constructor(scene, audio) {
    this.audio = audio;
    const parts = [
      shadedBox(0.5, 0.42, 0.66, 0xffffff, 0, 0.21, 0),
      shadedBox(0.38, 0.36, 0.36, 0xffffff, 0, 0.44, -0.36),
      shadedBox(0.1, 0.34, 0.07, 0xffffff, -0.1, 0.78, -0.36),
      shadedBox(0.1, 0.34, 0.07, 0xffffff, 0.1, 0.78, -0.36),
      shadedBox(0.05, 0.24, 0.02, 0xf4a9c8, -0.1, 0.78, -0.40),
      shadedBox(0.05, 0.24, 0.02, 0xf4a9c8, 0.1, 0.78, -0.40),
      shadedBox(0.18, 0.18, 0.12, 0xffffff, 0, 0.32, 0.36),
      shadedBox(0.06, 0.07, 0.02, 0x2a302c, -0.11, 0.5, -0.545),
      shadedBox(0.06, 0.07, 0.02, 0x2a302c, 0.11, 0.5, -0.545),
      shadedBox(0.07, 0.05, 0.02, 0xf08aa8, 0, 0.42, -0.545),
    ];
    const geo = mergeGeometries(parts);
    this.max = 24;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  spawn(world, count, cx, cz, radius) {
    this.world = world;
    this.list = [];
    const col = new THREE.Color();
    for (let i = 0; i < count && i < this.max; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * radius;
      const x = Math.max(2, Math.min(W - 3, cx + Math.cos(a) * r)), z = Math.max(2, Math.min(D - 3, cz + Math.sin(a) * r));
      const y = this.ground(x, z, H - 1);
      const tint = BUNNY_TINTS[i % BUNNY_TINTS.length];
      this.list.push({ x, y, z, fromX: x, fromY: y, fromZ: z, toX: x, toY: y, toZ: z, t: 1, dur: 0.38, wait: Math.random() * 2, yaw: Math.random() * 6.28, tint, pet: false, fed: false, arc: 0.55 });
      col.setHex(tint);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.count = this.list.length;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Adds the player's pet bunny right beside them (it follows through portals). */
  addPet(tint, x, z) {
    if (this.list.some((b) => b.pet) || this.list.length >= this.max) return;
    const y = this.ground(x, z, H - 1);
    const i = this.list.length;
    this.list.push({ x, y, z, fromX: x, fromY: y, fromZ: z, toX: x, toY: y, toZ: z, t: 1, dur: 0.38, wait: 0.3, yaw: 0, tint, pet: true, fed: true, arc: 0.55 });
    this.mesh.setColorAt(i, new THREE.Color(tint));
    this.mesh.count = this.list.length;
    this.mesh.instanceColor.needsUpdate = true;
  }

  pet() { return this.list.find((b) => b.pet) || null; }

  /** A happy little hop in place. */
  hop(b, high = 1.05) {
    b.fromX = b.toX = b.x; b.fromZ = b.toZ = b.z; b.fromY = b.toY = this.ground(b.x, b.z, b.y + 0.5);
    b.t = 0; b.dur = 0.5; b.arc = high; b.wait = 0.4;
  }

  /** Nearest bunny hit by a ray (origin o, unit direction d) within maxDist, or null. */
  pick(o, d, maxDist) {
    let best = null, bestT = maxDist;
    for (const b of this.list) {
      const cx = b.x - o.x, cy = b.y + 0.4 - o.y, cz = b.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bestT) continue;
      const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t;
      if (px * px + py * py + pz * pz < 0.36) { best = b; bestT = t; }
    }
    return best ? { bunny: best, dist: bestT } : null;
  }

  /** Top of the highest solid block at or below `fromY` in this column. */
  ground(x, z, fromY) {
    const w = this.world;
    const ix = Math.floor(x), iz = Math.floor(z);
    for (let y = Math.min(H - 1, Math.floor(fromY)); y >= 0; y--) if (SOLID[w.get(ix, y, iz)]) return y + 1;
    return 0;
  }

  update(dt, player, lure) {
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const b = this.list[i];
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt / b.dur);
        const t = b.t;
        b.x = b.fromX + (b.toX - b.fromX) * t;
        b.z = b.fromZ + (b.toZ - b.fromZ) * t;
        b.y = b.fromY + (b.toY - b.fromY) * t + Math.sin(t * Math.PI) * b.arc;
        if (b.t >= 1) { b.arc = 0.55; b.dur = b.pet ? 0.3 : 0.38; }
      } else {
        b.wait -= dt;
        if (b.wait <= 0) {
          const dx = player.pos.x - b.x, dz = player.pos.z - b.z;
          const dist = Math.hypot(dx, dz);
          if (b.pet) {
            // Pet: stays close, catching up quickly; pops back beside you if it gets left far behind
            if (dist > 22 || Math.abs(player.pos.y - b.y) > 8) {
              b.x = b.fromX = b.toX = player.pos.x - Math.sin(player.yaw) * -1.5;
              b.z = b.fromZ = b.toZ = player.pos.z - Math.cos(player.yaw) * -1.5;
              b.y = b.fromY = b.toY = this.ground(b.x, b.z, player.pos.y + 1);
              b.wait = 0.2;
              continue;
            }
            if (dist < 2.2) { b.wait = 0.3 + Math.random() * 0.8; b.yaw = Math.atan2(-dx, -dz); continue; }
            b.yaw = Math.atan2(-dx, -dz);
          } else if (lure && dist < 14 && dist > 1.6) b.yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.4;
          else b.yaw += (Math.random() - 0.5) * 1.8;
          const step = b.pet ? Math.max(0.8, Math.min(1.5, dist - 1.6)) : 0.9 + Math.random() * 0.5;
          const tx = b.x - Math.sin(b.yaw) * step, tz = b.z - Math.cos(b.yaw) * step;
          const gy = this.ground(tx, tz, b.y + 1.2);
          const blocked = tx < 1 || tz < 1 || tx > W - 2 || tz > D - 2 || gy > b.y + 1.05 || gy < b.y - 3 || SOLID[this.world.get(Math.floor(tx), Math.floor(b.y + 0.5), Math.floor(tz))] && gy > b.y + 1.05;
          if (blocked) { b.yaw += Math.PI * (0.6 + Math.random() * 0.8); b.wait = 0.2; }
          else {
            b.fromX = b.x; b.fromY = b.y; b.fromZ = b.z;
            b.toX = tx; b.toZ = tz; b.toY = gy;
            b.t = 0;
            b.wait = b.pet ? 0.05 + Math.random() * 0.1 : lure && dist < 14 ? 0.15 + Math.random() * 0.3 : 0.4 + Math.random() * 2.2;
            if (dist < 6 && Math.random() < 0.15) this.audio.boing();
          }
        }
      }
      this._p.set(b.x, b.y, b.z);
      this._q.setFromAxisAngle(this._up, b.yaw);
      const squash = b.t < 1 ? 1 + Math.sin(b.t * Math.PI) * 0.12 : 1;
      this._s.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
