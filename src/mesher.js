// Chunk mesher: culled faces with baked ambient occlusion, face shading and per-block tint jitter.
// Writes into reusable typed scratch buffers, then copies out exactly-sized arrays for the GPU.
import * as THREE from 'three';
import { BLOCKS, BY_KEY, CUBE } from './blocks.js';
import { COLORS, tileUV, BLOCK_TILES, WHITE_TILE, PLANKS_TILE } from './textures.js';

const WHITE = [255, 255, 255];
import { CHUNK, H, HDIRS, hash3 } from './world.js';

const B = BY_KEY;
const AO = [0.5, 0.68, 0.84, 1];

// Face table: normal, u axis, v axis, origin, shade
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1], shade: 0.8, kind: 'side' },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0], shade: 0.8, kind: 'side' },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1], shade: 1, kind: 'top' },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0], shade: 0.55, kind: 'bottom' },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1], shade: 0.9, kind: 'side' },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0], shade: 0.68, kind: 'side' },
];

class Buf {
  constructor(cap) {
    this.v = 0;
    this.i = 0;
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Uint8Array(cap * 3);
    this.uv = new Float32Array(cap * 2);
    this.idx = new Uint32Array(cap * 1.5);
  }
  reset() { this.v = 0; this.i = 0; }
  ensure(n) {
    if (this.v + n <= this.cap) return;
    const cap = this.cap * 2;
    const grow = (Arr, old, per) => { const a = new Arr(cap * per); a.set(old); return a; };
    this.pos = grow(Float32Array, this.pos, 3);
    this.col = grow(Uint8Array, this.col, 3);
    this.uv = grow(Float32Array, this.uv, 2);
    this.idx = grow(Uint32Array, this.idx, 1.5);
    this.cap = cap;
  }
  vert(x, y, z, r, g, b, u, v) {
    const k = this.v;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.col[k * 3] = r; this.col[k * 3 + 1] = g; this.col[k * 3 + 2] = b;
    this.uv[k * 2] = u; this.uv[k * 2 + 1] = v;
    this.v++;
  }
  quad(flip) {
    const a = this.v - 4;
    const I = this.idx;
    let i = this.i;
    if (flip) { I[i++] = a + 1; I[i++] = a + 2; I[i++] = a + 3; I[i++] = a + 1; I[i++] = a + 3; I[i++] = a; }
    else { I[i++] = a; I[i++] = a + 1; I[i++] = a + 2; I[i++] = a; I[i++] = a + 2; I[i++] = a + 3; }
    this.i = i;
  }
  toGeometry(geo) {
    geo = geo || new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.v * 3), 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.v * 2), 2));
    const big = this.v > 65535;
    geo.setIndex(new THREE.BufferAttribute(big ? this.idx.slice(0, this.i) : new Uint16Array(this.idx.subarray(0, this.i)), 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

const opaque = new Buf(1 << 15);
const trans = new Buf(1 << 10);
const glowBuf = new Buf(1 << 10); // lit lamps, generators, golden carrot: stay bright at night
const conns = [];

export function meshChunk(world, cx, cz) {
  opaque.reset();
  trans.reset();
  glowBuf.reset();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const data = world.data;
  for (let y = 0; y < H; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      let i = world.idx(x0, y, z);
      for (let x = x0; x < x0 + CHUNK; x++, i++) {
        const id = data[i];
        if (!id) continue;
        const def = BLOCKS[id];
        if (!def.shape) cube(world, x, y, z, id, world.powered[i]);
        else if (def.shape === 'rail' || def.shape === 'loop') rail(world, x, y, z, id);
        else if (def.shape === 'wire') wire(world, x, y, z, world.powered[i]);
        else if (def.shape === 'head') head(world, x, y, z, world.getMeta(x, y, z));
        else if (def.shape === 'portal') portal(world, x, y, z, world.getMeta(x, y, z));
      }
    }
  }
  return { opaque, trans, glow: glowBuf };
}

function cube(world, x, y, z, id, powered) {
  const def = BLOCKS[id];
  const tiles = BLOCK_TILES[id];
  const jitter = 0.96 + hash3(x, y, z) * 0.06;
  const genOff = id === B.generator && world.getMeta(x, y, z) === 1;
  const lampOn = id === B.lamp && powered;
  // Glowing blocks keep full brightness at night: lit lamps, running generators, golden carrot, Sunshine, Star blocks
  const glow = lampOn || (id === B.generator && !genOff) || !!def.glow || id === B.butter || id === B.sky || id === B.warp;
  const out = glow ? glowBuf : opaque;
  const set = genOff ? tiles.off : lampOn ? tiles.on : tiles;
  const facing = id === B.piston ? world.getMeta(x, y, z) : -1;
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
    if (ny < 0 || CUBE[world.get(nx, ny, nz)]) continue;
    let tile = F.kind === 'top' ? set.top : F.kind === 'bottom' ? set.bottom : set.side;
    if (facing >= 0) {
      // the pushing plate faces the way the piston was placed; the opposite face shows its back
      tile = f === facing ? tiles.top : (f ^ 1) === facing ? tiles.bottom : tiles.side;
    }
    const ao = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const a = k === 1 || k === 2 ? 1 : -1;
      const bb = k >= 2 ? 1 : -1;
      const s1 = CUBE[world.get(nx + F.u[0] * a, ny + F.u[1] * a, nz + F.u[2] * a)];
      const s2 = CUBE[world.get(nx + F.v[0] * bb, ny + F.v[1] * bb, nz + F.v[2] * bb)];
      const cr = CUBE[world.get(nx + F.u[0] * a + F.v[0] * bb, ny + F.u[1] * a + F.v[1] * bb, nz + F.u[2] * a + F.v[2] * bb)];
      ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
    }
    const shadeBase = glow ? 1 : F.shade * jitter;
    const flip = ao[0] + ao[2] < ao[1] + ao[3];
    emitFace(out, x, y, z, F, WHITE, tile, ao, shadeBase, 0, 1, flip, glow);
  }
}

function emitFace(buf, x, y, z, F, c, tile, ao, shade, vb0, vb1, flip, glow) {
  buf.ensure(4);
  const [u0, v0, u1, v1] = tileUV(tile);
  const ox = x + F.o[0], oy = y + F.o[1], oz = z + F.o[2];
  // corners in (a,b): (0,0) (1,0) (1,1) (0,1), with b stretched to [vb0, vb1]
  const ab = [[0, vb0], [1, vb0], [1, vb1], [0, vb1]];
  for (let k = 0; k < 4; k++) {
    const a = ab[k][0], b = ab[k][1];
    // AO interpolated along v for split faces
    const aoBottom = a ? ao[1] : ao[0];
    const aoTop = a ? ao[2] : ao[3];
    const aoV = glow ? 1 : AO[aoBottom] + (AO[aoTop] - AO[aoBottom]) * b;
    const s = shade * aoV;
    buf.vert(
      ox + F.u[0] * a + F.v[0] * b, oy + F.u[1] * a + F.v[1] * b, oz + F.u[2] * a + F.v[2] * b,
      Math.min(255, c[0] * s), Math.min(255, c[1] * s), Math.min(255, c[2] * s),
      a ? u1 : u0, v0 + (v1 - v0) * b,
    );
  }
  buf.quad(flip);
}

// Axis-aligned box with simple face shading (no AO). Skips the bottom face.
function box(buf, x0, y0, z0, x1, y1, z1, c, tile, bright = 1) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const faces = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.8],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.8],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.9],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.7],
  ];
  for (const [a, b, cc, d, sh] of faces) {
    buf.ensure(4);
    const s = sh * bright;
    const r = Math.min(255, c[0] * s), g = Math.min(255, c[1] * s), bl = Math.min(255, c[2] * s);
    buf.vert(a[0], a[1], a[2], r, g, bl, u0, v0);
    buf.vert(b[0], b[1], b[2], r, g, bl, u1, v0);
    buf.vert(cc[0], cc[1], cc[2], r, g, bl, u1, v1);
    buf.vert(d[0], d[1], d[2], r, g, bl, u0, v1);
    buf.quad(false);
  }
}

const STEEL = [150, 160, 166];
const STEEL_GOLD = [229, 197, 121];
const BOOST_RED = [235, 92, 64];

// Rails: a sleeper and a pair of bars from the cell centre towards each connection, following slope heights.
function rail(world, x, y, z, id) {
  world.railConnections(x, y, z, conns);
  const hc = y + 0.1 + (conns.some((c) => c.dy > 0) ? 0.5 : 0);
  const wood = COLORS[B.rail].top;
  const bar = id === B.loop ? STEEL_GOLD : id === B.booster ? BOOST_RED : STEEL;
  const list = conns.length ? conns.slice() : [{ dx: 1, dz: 0, dy: 0, x: x + 1, y, z, solo: true }, { dx: -1, dz: 0, dy: 0, x: x - 1, y, z, solo: true }];
  if (list.length === 1) list.push({ dx: -list[0].dx, dz: -list[0].dz, dy: 0, solo: true });
  const cx = x + 0.5, cz = z + 0.5;
  if (list.length === 2 && list[0].dx * list[1].dx + list[0].dz * list[1].dz === 0) {
    curvedRail(world, cx, cz, hc, list[0], list[1], wood, bar);
    return;
  }
  for (const c of list) {
    const hn = c.solo ? hc : world.railHeight(c.x, c.y, c.z);
    const he = (hc + hn) / 2;
    const px = -c.dz, pz = c.dx; // perpendicular
    // sleeper at a quarter of the way
    const sx = cx + c.dx * 0.25, sz = cz + c.dz * 0.25, sy = hc + (he - hc) * 0.5;
    const hw = 0.46, hd = 0.09;
    slab(opaque, sx - px * hw - c.dx * hd, sz - pz * hw - c.dz * hd, sx + px * hw + c.dx * hd, sz + pz * hw + c.dz * hd, sy - 0.1, sy - 0.04, wood);
    for (const side of [-0.3, 0.3]) {
      beam(opaque, cx + px * side, hc, cz + pz * side, cx + c.dx * 0.5 + px * side, he, cz + c.dz * 0.5 + pz * side, bar);
    }
  }
}

// Corner pieces: the rails follow a quarter circle around the cell corner between the two connections.
function curvedRail(world, cx, cz, hc, a, b, wood, bar) {
  const kx = cx + (a.dx + b.dx) * 0.5, kz = cz + (a.dz + b.dz) * 0.5; // pivot corner
  const ha = (hc + (a.solo ? hc : world.railHeight(a.x, a.y, a.z))) / 2;
  const hb = (hc + (b.solo ? hc : world.railHeight(b.x, b.y, b.z))) / 2;
  const a0 = Math.atan2(-b.dz, -b.dx); // direction from pivot to edge A's midpoint
  let a1 = Math.atan2(-a.dz, -a.dx); // ... and to edge B's midpoint
  let da = a1 - a0;
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  const N = 6;
  for (const r of [0.2, 0.8]) {
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const p0 = a0 + da * t0, p1 = a0 + da * t1;
      beam(opaque, kx + Math.cos(p0) * r, ha + (hb - ha) * t0, kz + Math.sin(p0) * r, kx + Math.cos(p1) * r, ha + (hb - ha) * t1, kz + Math.sin(p1) * r, bar);
      beam(opaque, kx + Math.cos(p1) * r, ha + (hb - ha) * t1, kz + Math.sin(p1) * r, kx + Math.cos(p0) * r, ha + (hb - ha) * t0, kz + Math.sin(p0) * r, bar);
    }
  }
  // sleepers laid radially
  for (const t of [1 / 6, 0.5, 5 / 6]) {
    const p = a0 + da * t, ux = Math.cos(p), uz = Math.sin(p);
    const y = ha + (hb - ha) * t;
    plank(opaque, kx + ux * 0.5, kz + uz * 0.5, ux, uz, 0.46, 0.09, y - 0.1, y - 0.04, wood);
  }
}

// An oriented flat box (top and four sides): `ux,uz` is its long axis.
function plank(buf, mx, mz, ux, uz, hl, hw, y0, y1, c) {
  const vx = -uz, vz = ux;
  const P = (s, t) => [mx + ux * s * hl + vx * t * hw, mz + uz * s * hl + vz * t * hw];
  const q = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
  const [u0, v0] = tileUV(WHITE_TILE);
  const quad = (a, b, cc, d, sh) => {
    buf.ensure(4);
    const r = Math.min(255, c[0] * sh), g = Math.min(255, c[1] * sh), bl = Math.min(255, c[2] * sh);
    // both windings, so the piece reads correctly whichever way the curve turns
    for (const v of [a, b, cc, d]) buf.vert(v[0], v[1], v[2], r, g, bl, u0, v0);
    buf.quad(false);
    buf.ensure(4);
    for (const v of [d, cc, b, a]) buf.vert(v[0], v[1], v[2], r, g, bl, u0, v0);
    buf.quad(false);
  };
  quad([q[0][0], y1, q[0][1]], [q[1][0], y1, q[1][1]], [q[2][0], y1, q[2][1]], [q[3][0], y1, q[3][1]], 1);
  for (let i = 0; i < 4; i++) {
    const A = q[i], Bq = q[(i + 1) % 4];
    quad([A[0], y0, A[1]], [Bq[0], y0, Bq[1]], [Bq[0], y1, Bq[1]], [A[0], y1, A[1]], 0.75);
  }
}

function slab(buf, ax, az, bx, bz, y0, y1, c) {
  box(buf, Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), c, WHITE_TILE);
}

// A thin sloped bar between two points (top + two sides).
function beam(buf, ax, ay, az, bx, by, bz, c) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * 0.045, pz = (dx / len) * 0.045;
  const t = 0.05;
  const [u0, v0] = tileUV(WHITE_TILE);
  const quads = [
    [[ax - px, ay, az - pz], [ax + px, ay, az + pz], [bx + px, by, bz + pz], [bx - px, by, bz - pz], 1.05],
    [[ax + px, ay - t, az + pz], [bx + px, by - t, bz + pz], [bx + px, by, bz + pz], [ax + px, ay, az + pz], 0.75],
    [[bx - px, by - t, bz - pz], [ax - px, ay - t, az - pz], [ax - px, ay, az - pz], [bx - px, by, bz - pz], 0.75],
  ];
  for (const [a, b, cc, d, s] of quads) {
    buf.ensure(4);
    const r = Math.min(255, c[0] * s), g = Math.min(255, c[1] * s), bl = Math.min(255, c[2] * s);
    buf.vert(a[0], a[1], a[2], r, g, bl, u0, v0);
    buf.vert(b[0], b[1], b[2], r, g, bl, u0, v0);
    buf.vert(cc[0], cc[1], cc[2], r, g, bl, u0, v0);
    buf.vert(d[0], d[1], d[2], r, g, bl, u0, v0);
    buf.quad(false);
    // double-sided for the top so slopes read from below as well
  }
}

function wire(world, x, y, z, powered) {
  const def = COLORS[B.wire];
  const c = powered ? def.on : def.top;
  const bright = powered ? 1.15 : 1;
  const y0 = y, y1 = y + 0.07;
  box(opaque, x + 0.38, y0, z + 0.38, x + 0.62, y1, z + 0.62, c, WHITE_TILE, bright);
  for (const [dx, dz] of HDIRS) {
    const t = world.get(x + dx, y, z + dz);
    const tb = world.get(x + dx, y - 1, z + dz);
    if (t === B.wire || t === B.generator || t === B.piston || t === B.lamp || t === B.note || t === B.firework || tb === B.wire) {
      const ax = dx > 0 ? x + 0.62 : dx < 0 ? x : x + 0.42;
      const bx = dx > 0 ? x + 1 : dx < 0 ? x + 0.38 : x + 0.58;
      const az = dz > 0 ? z + 0.62 : dz < 0 ? z : z + 0.42;
      const bz = dz > 0 ? z + 1 : dz < 0 ? z + 0.38 : z + 0.58;
      box(opaque, ax, y0, az, bx, y1, bz, c, WHITE_TILE, bright);
    }
  }
}

function head(world, x, y, z, facing) {
  const c = COLORS[B.head].top;
  const s = 0.18;
  // plate at the far end plus a rod back to the piston
  const boxes = {
    0: [[x + 0.75, y, z, x + 1, y + 1, z + 1], [x, y + 0.5 - s, z + 0.5 - s, x + 0.75, y + 0.5 + s, z + 0.5 + s]],
    1: [[x, y, z, x + 0.25, y + 1, z + 1], [x + 0.25, y + 0.5 - s, z + 0.5 - s, x + 1, y + 0.5 + s, z + 0.5 + s]],
    2: [[x, y + 0.75, z, x + 1, y + 1, z + 1], [x + 0.5 - s, y, z + 0.5 - s, x + 0.5 + s, y + 0.75, z + 0.5 + s]],
    3: [[x, y, z, x + 1, y + 0.25, z + 1], [x + 0.5 - s, y + 0.25, z + 0.5 - s, x + 0.5 + s, y + 1, z + 0.5 + s]],
    4: [[x, y, z + 0.75, x + 1, y + 1, z + 1], [x + 0.5 - s, y + 0.5 - s, z, x + 0.5 + s, y + 0.5 + s, z + 0.75]],
    5: [[x, y, z, x + 1, y + 1, z + 0.25], [x + 0.5 - s, y + 0.5 - s, z + 0.25, x + 0.5 + s, y + 0.5 + s, z + 1]],
  }[facing] || [];
  for (const b of boxes) box(opaque, b[0], b[1], b[2], b[3], b[4], b[5], WHITE, PLANKS_TILE);
}

function portal(world, x, y, z, axis) {
  const c = COLORS[B.portal].top;
  const t = 0.12;
  if (axis === 0) box(trans, x, y, z + 0.5 - t, x + 1, y + 1, z + 0.5 + t, c, WHITE_TILE, 1);
  else box(trans, x + 0.5 - t, y, z, x + 0.5 + t, y + 1, z + 1, c, WHITE_TILE, 1);
}
