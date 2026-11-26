// Voxel world storage, deterministic terrain generation, edit tracking and circuit power.
import { AIR, BY_KEY, SOLID, isRail } from './blocks.js';

export const W = 128; // x
export const D = 128; // z
export const H = 56; // y
export const CHUNK = 16;
export const CX = W / CHUNK;
export const CZ = D / CHUNK;
export const SPAWN = { x: 64, z: 64 };

const B = BY_KEY;

// Six neighbour directions. Index order matters for piston facing metadata.
export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const HDIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// --- Noise -------------------------------------------------------------------------------------------------
function hash2(x, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
function fbm(x, z, seed, oct = 4) {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * f, z * f, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm; // 0..1
}
export function hash3(x, y, z) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- World -------------------------------------------------------------------------------------------------
export class World {
  constructor(dim, seed) {
    this.dim = dim;
    this.seed = seed;
    this.data = new Uint8Array(W * D * H);
    this.powered = new Uint8Array(W * D * H);
    this.meta = new Map(); // idx -> number (loop axis, piston/head facing, portal axis)
    this.edits = new Map(); // idx -> block id (diff against generated terrain)
    this.dirty = new Set(); // chunk indices needing a remesh
    this.onChange = null; // (x,y,z) hook
    this.generated = false;
  }

  idx(x, y, z) { return (y * D + z) * W + x; }
  inBounds(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H; }
  get(x, y, z) { return this.inBounds(x, y, z) ? this.data[(y * D + z) * W + x] : (y < 0 ? B.stone : AIR); }
  solid(x, y, z) {
    if (x < 0 || x >= W || z < 0 || z >= D) return 1; // invisible boundary walls
    if (y < 0) return 1;
    if (y >= H) return 0;
    return SOLID[this.data[(y * D + z) * W + x]];
  }
  getMeta(x, y, z) { return this.meta.get(this.idx(x, y, z)) ?? 0; }

  /** Sets a block, records the edit and marks affected chunks dirty. */
  set(x, y, z, id, meta) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.idx(x, y, z);
    this.data[i] = id;
    if (meta !== undefined) this.meta.set(i, meta); else this.meta.delete(i);
    if (this.generated) this.edits.set(i, meta !== undefined ? id | (meta << 8) : id);
    this.markDirty(x, z);
    return true;
  }

  markDirty(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(cz * CX + cx);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(cz * CX + cx - 1);
    if (lx === CHUNK - 1 && cx < CX - 1) this.dirty.add(cz * CX + cx + 1);
    if (lz === 0 && cz > 0) this.dirty.add((cz - 1) * CX + cx);
    if (lz === CHUNK - 1 && cz < CZ - 1) this.dirty.add((cz + 1) * CX + cx);
  }

  markAllDirty() { for (let i = 0; i < CX * CZ; i++) this.dirty.add(i); }

  /** Height of the highest solid block's top face in a column (or 0). */
  surface(x, z) {
    x = Math.max(0, Math.min(W - 1, Math.floor(x)));
    z = Math.max(0, Math.min(D - 1, Math.floor(z)));
    for (let y = H - 1; y >= 0; y--) if (SOLID[this.data[(y * D + z) * W + x]]) return y + 1;
    return 0;
  }

  // ----- generation -----
  generate() {
    this.generated = false;
    this.data.fill(0);
    this.meta.clear();
    if (this.dim === 'bunny') genBunny(this); else genOverworld(this);
    this.generated = true;
    this.recomputePower();
    this.markAllDirty();
  }

  applyEdits(entries) {
    for (const [i, v] of entries) {
      const id = v & 255, meta = v >> 8;
      this.data[i] = id;
      if (v > 255) this.meta.set(i, meta); else this.meta.delete(i);
      this.edits.set(i, v);
    }
    this.recomputePower();
    this.markAllDirty();
  }

  // ----- circuits -----
  /** Flood power from generators through wires; returns pistons whose state changed. */
  recomputePower() {
    const next = new Uint8Array(this.powered.length);
    const queue = [];
    const size = this.data.length;
    for (let i = 0; i < size; i++) if (this.data[i] === B.generator && this.meta.get(i) !== 1) { next[i] = 1; queue.push(i); } // meta 1 = switched off
    const WD = W * D;
    while (queue.length) {
      const i = queue.pop();
      const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / WD);
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!this.inBounds(nx, ny, nz)) continue;
        const ni = this.idx(nx, ny, nz);
        if (next[ni]) continue;
        const t = this.data[ni];
        if (t === B.wire) { next[ni] = 1; queue.push(ni); } else if (t === B.piston || t === B.lamp || t === B.note || t === B.firework || t === B.tnt) next[ni] = 1;
      }
    }
    const changed = [];
    for (let i = 0; i < size; i++) {
      if (next[i] !== this.powered[i]) {
        const t = this.data[i];
        const x = i % W, z = Math.floor(i / W) % D;
        this.markDirty(x, z);
        if (t === B.piston) changed.push(i);
        if (t === B.note || t === B.firework || t === B.lamp || t === B.tnt) (this.signals ||= []).push([i, t, next[i]]);
      }
    }
    this.powered = next;
    return changed;
  }

  railConnections(x, y, z, out = []) {
    out.length = 0;
    const self = this.get(x, y, z);
    const axis = self === B.loop ? this.getMeta(x, y, z) : -1;
    for (let pass = 0; pass < 3 && out.length < 2; pass++) {
      const dy = pass === 0 ? 0 : pass === 1 ? 1 : -1;
      for (let d = 0; d < 4 && out.length < 2; d++) {
        const [dx, dz] = HDIRS[d];
        if (axis === 0 && dx === 0) continue;
        if (axis === 1 && dz === 0) continue;
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const t = this.get(nx, ny, nz);
        if (!isRail(t)) continue;
        if (t === B.loop) {
          const na = this.getMeta(nx, ny, nz);
          if ((na === 0 && dx === 0) || (na === 1 && dz === 0)) continue;
        }
        if (dy !== 0 && (t === B.loop || self === B.loop)) continue;
        // Avoid stepping diagonally if a same-level connection already exists in this direction.
        if (out.some((c) => c.dx === dx && c.dz === dz)) continue;
        out.push({ dx, dy, dz, x: nx, y: ny, z: nz });
      }
    }
    return out;
  }

  /** Where this world's golden carrot is (null once it has been found). */
  findGolden() {
    const i = this.data.indexOf(B.goldcarrot);
    if (i < 0) return null;
    return [i % W, Math.floor(i / (W * D)), Math.floor(i / W) % D];
  }

  railHeight(x, y, z) {
    const conns = this.railConnections(x, y, z, []);
    return y + 0.1 + (conns.some((c) => c.dy > 0) ? 0.5 : 0);
  }
}

// --- Generators ----------------------------------------------------------------------------------------------
export function plantTree(w, x, y, z, leaf, height) {
  for (let i = 0; i < height; i++) w.set(x, y + i, z, B.log);
  const top = y + height;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && hash3(x + dx, top + dy, z + dz) < 0.6) continue;
      if (w.get(x + dx, top + dy, z + dz) === AIR) w.set(x + dx, top + dy, z + dz, leaf);
    }
  }
}

function genOverworld(w) {
  const s = w.seed;
  const heights = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.028, z * 0.028, s);
    const m = fbm(x * 0.008 + 50, z * 0.008 + 50, s + 9);
    let h = 14 + (n - 0.5) * 22 + (m - 0.45) * 20;
    const dist = Math.hypot(x - SPAWN.x, z - SPAWN.z);
    const blend = Math.min(1, Math.max(0, (dist - 15) / 10));
    h = 16 * (1 - blend) + h * blend; // flat meadow at spawn for building
    heights[z * W + x] = Math.max(4, Math.min(H - 12, Math.round(h)));
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = heights[z * W + x];
    for (let y = 0; y < h; y++) {
      let id = B.stone;
      if (y >= h - 1) id = h <= 11 ? B.sand : h >= 31 ? B.snow : B.grass;
      else if (y >= h - 4) id = h <= 11 ? B.sand : B.dirt;
      w.data[w.idx(x, y, z)] = id;
    }
  }
  // Trees, away from spawn and edges
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const h = heights[z * W + x];
    if (w.get(x, h - 1, z) !== B.grass) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 17) continue;
    const r = hash2(x, z, s + 77);
    if (r < 0.014) plantTree(w, x, h, z, hash2(x, z, s + 3) < 0.18 ? B.pinkleaf : B.leaves, 4 + Math.floor(r * 140) % 2);
  }
  // A few trees framing the meadow
  for (const [dx, dz] of [[-12, -10], [-13, 6], [9, 13], [-5, 14]]) plantTree(w, SPAWN.x + dx, 16, SPAWN.z + dz, dx === 9 ? B.pinkleaf : B.leaves, 5);

  // Golden carrot: buried flush in the grass far out in the hills; only its top shows
  hideGolden(w, heights, 40, 56);
  // Starter portal frame (unlit) so the Portal Key has an obvious use
  buildFrame(w, SPAWN.x - 6, 16, SPAWN.z - 8, 0, false);
  // Starter coaster so the Cart works straight away
  buildStarterCoaster(w, SPAWN.x + 2, 16, SPAWN.z - 4);
}

function genBunny(w) {
  const s = w.seed + 1000;
  const heights = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.035, z * 0.035, s);
    let h = 15 + (n - 0.5) * 12;
    const dist = Math.hypot(x - SPAWN.x, z - SPAWN.z);
    const blend = Math.min(1, Math.max(0, (dist - 10) / 8));
    h = 16 * (1 - blend) + h * blend;
    heights[z * W + x] = Math.round(h);
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = heights[z * W + x];
    for (let y = 0; y < h; y++) w.data[w.idx(x, y, z)] = y >= h - 1 ? B.candy : y >= h - 4 ? B.dirt : B.stone;
  }
  // Giant carrots and blossom trees
  for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9) continue;
    const r = hash2(x, z, s + 5);
    const h = heights[z * W + x];
    if (r < 0.006) {
      const tall = 4 + Math.floor(hash2(x, z, s + 6) * 4);
      for (let y = 0; y < tall; y++) {
        w.set(x, h + y, z, B.carrot);
        if (y < tall - 2) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(x + dx, h + y, z + dz, B.carrot);
      }
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        w.set(x + dx, h + tall, z + dz, B.leaves);
        if (dx === 0 || hash2(x + dx, z + dz, s) < 0.5) w.set(x + dx, h + tall + 1, z + dz, B.leaves);
      }
      w.set(x, h + tall + 2, z, B.leaves);
    } else if (r < 0.011) plantTree(w, x, h, z, B.pinkleaf, 4);
    else if (r < 0.013) w.set(x, h, z, hash2(x, z, 1) < 0.5 ? B.butter : B.mint);
  }
  // Floating clouds
  for (let i = 0; i < 22; i++) {
    const cx = 8 + Math.floor(hash2(i, 1, s) * (W - 16));
    const cz = 8 + Math.floor(hash2(i, 2, s) * (D - 16));
    const cy = 32 + Math.floor(hash2(i, 3, s) * 10);
    const rx = 3 + Math.floor(hash2(i, 4, s) * 4), rz = 2 + Math.floor(hash2(i, 5, s) * 3);
    for (let dx = -rx; dx <= rx; dx++) for (let dz = -rz; dz <= rz; dz++) {
      if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) > 1) continue;
      w.set(cx + dx, cy, cz + dz, B.cloud);
      if (hash3(cx + dx, cy, cz + dz) < 0.4) w.set(cx + dx, cy + 1, cz + dz, B.cloud);
    }
  }
  // Golden carrot on top of a cloud: bounce or fly up to find it
  {
    let best = null;
    for (let i = 0; i < 22 && !best; i++) {
      const cx = 8 + Math.floor(hash2(i, 1, s) * (W - 16)), cz = 8 + Math.floor(hash2(i, 2, s) * (D - 16));
      const d = Math.hypot(cx - SPAWN.x, cz - SPAWN.z);
      if (d > 30 && d < 56 && w.get(cx, 32 + Math.floor(hash2(i, 3, s) * 10), cz) === B.cloud) best = [cx, 32 + Math.floor(hash2(i, 3, s) * 10), cz];
    }
    if (best) {
      let y = best[1];
      while (w.get(best[0], y + 1, best[2]) !== AIR) y++;
      w.set(best[0], y + 1, best[2], B.goldcarrot);
      w.golden = [best[0], y + 1, best[2]];
    } else placeGolden(w, heights, 20, 40);
  }
  // Lit return portal near spawn
  buildFrame(w, SPAWN.x - 1, 16, SPAWN.z - 6, 0, true);
}

/** Buries the golden carrot in the ground surface between minD and maxD from spawn, away from trees. */
function hideGolden(w, heights, minD, maxD) {
  for (let i = 0; i < 600; i++) {
    const a = hash2(i, 21, w.seed) * Math.PI * 2;
    const d = minD + hash2(i, 22, w.seed) * (maxD - minD);
    const x = Math.round(SPAWN.x + Math.cos(a) * d), z = Math.round(SPAWN.z + Math.sin(a) * d);
    if (x < 4 || z < 4 || x > W - 5 || z > D - 5) continue;
    const h = heights[z * W + x];
    if (w.get(x, h - 1, z) !== B.grass || w.get(x, h, z) !== AIR) continue;
    let clear = true;
    for (let dx = -2; dx <= 2 && clear; dx++) for (let dz = -2; dz <= 2; dz++) if (w.get(x + dx, h, z + dz) === B.log) { clear = false; break; }
    if (!clear) continue;
    w.set(x, h - 1, z, B.goldcarrot);
    w.golden = [x, h - 1, z];
    return;
  }
  placeGolden(w, heights, minD, maxD);
}

/** Puts the golden carrot on a 2-block plinth somewhere between `minD` and `maxD` blocks from spawn. */
function placeGolden(w, heights, minD, maxD) {
  for (let i = 0; i < 400; i++) {
    const a = hash2(i, 11, w.seed) * Math.PI * 2;
    const d = minD + hash2(i, 12, w.seed) * (maxD - minD);
    const x = Math.round(SPAWN.x + Math.cos(a) * d), z = Math.round(SPAWN.z + Math.sin(a) * d);
    if (x < 4 || z < 4 || x > W - 5 || z > D - 5) continue;
    const h = heights[z * W + x];
    if (w.get(x, h, z) !== AIR || w.get(x, h + 1, z) !== AIR || w.get(x, h + 2, z) !== AIR || w.get(x, h + 3, z) !== AIR) continue;
    w.set(x, h, z, B.brick);
    w.set(x, h + 1, z, B.goldcarrot);
    w.golden = [x, h + 1, z];
    return;
  }
}

/** Carrot frame, 4 wide by 5 tall, interior 2x3. axis 0 = frame spans x. */
export function buildFrame(w, x, y, z, axis, lit) {
  for (let a = 0; a < 4; a++) for (let b = 0; b < 5; b++) {
    const px = axis === 0 ? x + a : x, pz = axis === 0 ? z : z + a;
    const edge = a === 0 || a === 3 || b === 0 || b === 4;
    if (edge) w.set(px, y + b, pz, B.carrot);
    else w.set(px, y + b, pz, lit ? B.portal : AIR, lit ? axis : undefined);
  }
  // clear a little space in front and behind
  for (let a = -1; a < 5; a++) for (let b = 1; b < 6; b++) for (const off of [-1, 1, -2, 2]) {
    const px = axis === 0 ? x + a : x + off, pz = axis === 0 ? z + off : z + a;
    if (w.get(px, y + b, pz) !== B.carrot && w.get(px, y + b, pz) !== B.portal) w.set(px, y + b, pz, AIR);
  }
}

function buildStarterCoaster(w, x0, y, z0) {
  // Oval: two straights along x joined by short turns. One hill on the back straight and a loop on the front.
  const len = 16, wid = 8;
  const pts = [];
  for (let i = 0; i <= len; i++) pts.push([x0 + i, z0]);
  for (let j = 1; j <= wid; j++) pts.push([x0 + len, z0 + j]);
  for (let i = len - 1; i >= 0; i--) pts.push([x0 + i, z0 + wid]);
  for (let j = wid - 1; j >= 1; j--) pts.push([x0, z0 + j]);
  const hill = [0, 1, 2, 3, 3, 3, 2, 1, 0];
  for (const [x, z] of pts) {
    let lift = 0;
    if (z === z0 + wid) {
      const k = x - (x0 + 4);
      if (k >= 0 && k < hill.length) lift = hill[k];
    }
    for (let yy = y; yy < y + lift; yy++) w.set(x, yy, z, B.planks);
    w.set(x, y + lift, z, B.rail);
    for (let c = 1; c <= 3; c++) if (w.get(x, y + lift + c, z) !== AIR) w.set(x, y + lift + c, z, AIR);
  }
  // The loop piece, aligned with the x-axis straight
  w.set(x0 + 8, y, z0, B.loop, 0);
  for (let i = -3; i <= 3; i++) for (let c = 1; c <= 6; c++) for (const dz of [-1, 0, 1]) {
    const t = w.get(x0 + 8 + i, y + c, z0 + dz);
    if (t !== AIR) w.set(x0 + 8 + i, y + c, z0 + dz, AIR);
  }
}

// --- Portal detection ---------------------------------------------------------------------------------------
/** Flood-fills the air pocket at (x,y,z) inside a vertical carrot frame. Returns {cells, axis} or null. */
export function findPortalInterior(w, x, y, z) {
  if (w.get(x, y, z) !== AIR) return null;
  for (const axis of [0, 1]) {
    const seen = new Set();
    const stack = [[x, y, z]];
    const cells = [];
    let ok = true;
    while (stack.length && ok) {
      const [cx, cy, cz] = stack.pop();
      const k = w.idx(cx, cy, cz);
      if (seen.has(k)) continue;
      seen.add(k);
      cells.push([cx, cy, cz]);
      if (cells.length > 24) { ok = false; break; }
      const nbrs = axis === 0 ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] : [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
      for (const [dx, dy, dz] of nbrs) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        if (!w.inBounds(nx, ny, nz)) { ok = false; break; }
        const t = w.get(nx, ny, nz);
        if (t === AIR) stack.push([nx, ny, nz]);
        else if (t !== B.carrot) { ok = false; break; }
      }
    }
    if (ok && cells.length >= 2) return { cells, axis };
  }
  return null;
}
