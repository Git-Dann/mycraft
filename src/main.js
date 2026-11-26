import * as THREE from 'three';
import './style.css';
import { AIR, BLOCKS, BY_KEY, DEFAULT_HOTBAR, ITEMS, ITEM_BY_KEY, SOLID, isRail, itemName } from './blocks.js';
import { createAtlas, itemIcon } from './textures.js';
import { World, W, D, H, CHUNK, CX, CZ, SPAWN, DIRS, findPortalInterior } from './world.js';
import { meshChunk } from './mesher.js';
import { Coaster } from './coaster.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Sky, Bunnies, PALETTES } from './scenery.js';
import { logoSVG } from './logo.js';
import { saveGame, loadGame, clearGame, loadSettings, saveSettings } from './save.js';

const B = BY_KEY;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------------------
// Renderer

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = Math.min(maxRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe8e6, 34, 92);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';

const atlas = createAtlas();
const chunkMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });
const portalMat = new THREE.MeshBasicMaterial({ color: 0xff8fd0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });

const sky = new Sky(scene);
const audio = new Audio();
const coaster = new Coaster(scene, audio);
const bunnies = new Bunnies(scene, audio);

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x2a302c, transparent: true, opacity: 0.55 }),
);
highlight.visible = false;
scene.add(highlight);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 80 : 72;
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); try { input.restJoystick(); } catch { /* input not ready yet */ } });
resize();

// ---------------------------------------------------------------------------------------------------------
// State

const settings = loadSettings();
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
const state = {
  seed: 0,
  dim: 'overworld',
  worlds: {},
  hotbar: [...DEFAULT_HOTBAR],
  slot: 0,
  started: false,
  paused: true,
  tapBreaks: false,
  needsSave: false,
  portalCooldown: 0,
  lastPortal: {},
};
let world = null;

const player = {
  pos: new THREE.Vector3(SPAWN.x + 0.5, 17, SPAWN.z + 3.5),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.12,
  flying: false,
  onGround: false,
  hw: 0.3,
  height: 1.72,
  eye: 1.58,
  ride: { yaw: 0, pitch: 0 },
};

// Chunk meshes for the active dimension
const chunks = new Array(CX * CZ).fill(null);

function setChunkMesh(ci) {
  const cx = ci % CX, cz = Math.floor(ci / CX);
  const { opaque, trans } = meshChunk(world, cx, cz);
  let c = chunks[ci];
  if (!c) {
    c = chunks[ci] = { o: new THREE.Mesh(new THREE.BufferGeometry(), chunkMat), t: new THREE.Mesh(new THREE.BufferGeometry(), portalMat) };
    c.o.matrixAutoUpdate = c.t.matrixAutoUpdate = false;
    c.t.renderOrder = 2;
    scene.add(c.o, c.t);
  }
  c.o.geometry.dispose();
  c.o.geometry = opaque.v ? opaque.toGeometry() : new THREE.BufferGeometry();
  c.o.visible = opaque.v > 0;
  c.t.geometry.dispose();
  c.t.geometry = trans.v ? trans.toGeometry() : new THREE.BufferGeometry();
  c.t.visible = trans.v > 0;
}

function remesh(budget) {
  if (!world.dirty.size) return;
  // Nearest chunks first
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  const list = [...world.dirty].sort((a, b) => Math.hypot((a % CX) - pcx, Math.floor(a / CX) - pcz) - Math.hypot((b % CX) - pcx, Math.floor(b / CX) - pcz));
  for (let i = 0; i < list.length && i < budget; i++) {
    world.dirty.delete(list[i]);
    setChunkMesh(list[i]);
  }
}

function getWorld(dim) {
  if (!state.worlds[dim]) {
    const w = new World(dim, state.seed);
    w.generate();
    const saved = state.pendingEdits?.[dim];
    if (saved?.length) w.applyEdits(saved);
    w.dirty.clear();
    state.worlds[dim] = w;
  }
  return state.worlds[dim];
}

function enterDimension(dim, spawnAt) {
  state.dim = dim;
  world = getWorld(dim);
  world.markAllDirty();
  remesh(Infinity);
  coaster.rebuildRings(world);
  sky.setPalette(PALETTES[dim], scene);
  if (dim === 'bunny') bunnies.spawn(world, 16, SPAWN.x, SPAWN.z, 22);
  else bunnies.spawn(world, 5, SPAWN.x - 10, SPAWN.z + 8, 10);
  audio.setMood(dim);
  if (spawnAt) {
    player.pos.set(spawnAt.x, spawnAt.y, spawnAt.z);
    player.vel.set(0, 0, 0);
  }
  updateDimChip();
}

function safeSpawn(x, z) {
  return { x: x + 0.5, y: world.surface(x, z) + 0.01, z: z + 0.5 };
}

// ---------------------------------------------------------------------------------------------------------
// Physics

function collides(px, py, pz) {
  const hw = player.hw;
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw);
  const y0 = Math.floor(py), y1 = Math.floor(py + player.height - 0.001);
  const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (world.solid(x, y, z)) return true;
  return false;
}

function moveAxis(axis, delta) {
  const p = player.pos;
  const steps = Math.ceil(Math.abs(delta) / 0.35) || 1;
  const d = delta / steps;
  for (let i = 0; i < steps; i++) {
    p[axis] += d;
    if (collides(p.x, p.y, p.z)) {
      const hw = player.hw;
      if (axis === 'y') {
        if (d < 0) p.y = Math.floor(p.y) + 1;
        else p.y = Math.floor(p.y + player.height) - player.height - 0.001;
      } else if (d > 0) p[axis] = Math.floor(p[axis] + hw) - hw - 0.001;
      else p[axis] = Math.floor(p[axis] - hw) + 1 + hw + 0.001;
      return true;
    }
  }
  return false;
}

const fwd = new THREE.Vector3();
function updatePlayer(dt) {
  const mi = input.move;
  const speed = player.flying ? 9 : 4.6;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const vx = (mi.x * cy + mi.z * sy) * speed;
  const vz = (mi.z * cy - mi.x * sy) * speed;
  const up = jumpHeld || input.keyJump;
  const down = downHeld || input.keyDown;

  if (player.flying) {
    player.vel.y = up ? 7 : down ? -7 : 0;
  } else {
    player.vel.y = Math.max(player.vel.y - 26 * dt, -40);
    if (up && player.onGround) jump();
  }

  const hitX = moveAxis('x', vx * dt);
  const hitZ = moveAxis('z', vz * dt);
  // Auto-jump onto single-block steps while walking
  if ((hitX || hitZ) && player.onGround && !player.flying && Math.hypot(vx, vz) > 1) {
    const ahead = 0.45;
    const nx = player.pos.x + Math.sign(vx) * (Math.abs(vx) > 0.5 ? ahead : 0);
    const nz = player.pos.z + Math.sign(vz) * (Math.abs(vz) > 0.5 ? ahead : 0);
    if (!collides(nx, player.pos.y + 1.05, nz) && !collides(player.pos.x, player.pos.y + 1.05, player.pos.z)) jump(true);
  }
  const hitY = moveAxis('y', player.vel.y * dt);
  if (hitY) {
    if (player.vel.y < 0) player.onGround = true;
    player.vel.y = 0;
  } else player.onGround = player.flying ? false : collides(player.pos.x, player.pos.y - 0.05, player.pos.z);

  if (player.pos.y < -8) {
    const s = safeSpawn(SPAWN.x, SPAWN.z + 3);
    player.pos.set(s.x, s.y, s.z);
    player.vel.set(0, 0, 0);
  }
}

function jump(auto) {
  player.vel.y = auto ? 7.2 : 8.2;
  player.onGround = false;
  if (!auto) audio.jump();
}

function checkPortal(dt) {
  if (state.portalCooldown > 0) { state.portalCooldown -= dt; return; }
  const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
  const y0 = Math.floor(player.pos.y + 0.2), y1 = Math.floor(player.pos.y + 1.2);
  if (world.get(x, y0, z) === B.portal || world.get(x, y1, z) === B.portal) {
    state.portalCooldown = 3;
    travel(x, y0, z);
  }
}

function travel(px, py, pz) {
  const from = state.dim;
  state.lastPortal[from] = { x: px, y: py, z: pz, axis: world.getMeta(px, py, pz) };
  audio.portal();
  const fade = $('fade');
  fade.classList.add('on');
  setTimeout(() => {
    if (coaster.riding) stopRide();
    const to = from === 'overworld' ? 'bunny' : 'overworld';
    world = getWorld(to);
    let at;
    const lp = state.lastPortal[to];
    if (to === 'bunny') at = { x: SPAWN.x + 1, y: 17.01, z: SPAWN.z - 2.5 };
    else if (lp) at = { x: lp.axis === 0 ? lp.x + 0.5 : lp.x + 2.5, y: lp.y + 0.01, z: lp.axis === 0 ? lp.z + 2.5 : lp.z + 0.5 };
    else at = safeSpawn(SPAWN.x, SPAWN.z + 3);
    enterDimension(to, at);
    player.yaw = Math.PI; // face away from the portal, into the new world
    player.pitch = -0.1;
    toast(to === 'bunny' ? 'Welcome to Bunny Meadow!' : 'Back in the Overworld');
    if (to === 'bunny') audio.chime();
    setTimeout(() => fade.classList.remove('on'), 120);
    state.needsSave = true;
  }, 420);
}

// ---------------------------------------------------------------------------------------------------------
// Targeting (voxel DDA)

const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, id: 0, ok: false };
const ray = new THREE.Vector3();
const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function raycast(ox, oy, oz, dx, dy, dz, maxDist = 8) {
  hit.ok = false;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tx = dx ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
  let ty = dy ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
  let tz = dz ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= maxDist) {
    const id = world.get(x, y, z);
    if (id && id !== B.portal) {
      Object.assign(hit, { x, y, z, nx, ny, nz, id, ok: true });
      return hit;
    }
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (y < 0 || y >= H) break;
  }
  return hit;
}

function targetFromScreen(sx, sy) {
  if (sx === undefined) {
    camera.getWorldDirection(ray);
  } else {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    ray.copy(raycaster.ray.direction);
  }
  const o = camera.position;
  return raycast(o.x, o.y, o.z, ray.x, ray.y, ray.z);
}

// ---------------------------------------------------------------------------------------------------------
// Building

function soundKind(id) {
  if (id === B.stone || id === B.brick || id === B.glassy) return 'stone';
  if (id === B.leaves || id === B.pinkleaf || id === B.cloud || id === B.candy || id === B.grass || id === B.sand || id === B.snow) return 'soft';
  if (isRail(id)) return 'rail';
  return 'solid';
}

const CIRCUIT = new Set([B.generator, B.wire, B.piston, B.lamp, B.head]);

function afterEdit(id) {
  if (CIRCUIT.has(id)) runCircuits();
  if (id === B.loop) coaster.rebuildRings(world);
  state.needsSave = true;
}

function runCircuits() {
  for (let pass = 0; pass < 4; pass++) {
    const changed = world.recomputePower();
    if (!changed.length) break;
    let moved = false;
    for (const i of changed) {
      const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D));
      const f = world.getMeta(x, y, z);
      const [dx, dy, dz] = DIRS[f] || DIRS[2];
      const hx = x + dx, hy = y + dy, hz = z + dz;
      if (world.powered[i]) {
        // Extend: push up to 12 blocks in front
        const chain = [];
        let cx = hx, cy = hy, cz = hz;
        while (world.inBounds(cx, cy, cz) && world.get(cx, cy, cz) !== AIR && chain.length <= 12) {
          const t = world.get(cx, cy, cz);
          if (t === B.head || t === B.portal) { chain.length = 99; break; }
          chain.push([cx, cy, cz, t, world.meta.get(world.idx(cx, cy, cz))]);
          cx += dx; cy += dy; cz += dz;
        }
        if (chain.length > 12 || !world.inBounds(cx, cy, cz)) continue;
        for (let k = chain.length - 1; k >= 0; k--) {
          const [bx, by, bz, t, m] = chain[k];
          world.set(bx + dx, by + dy, bz + dz, t, m);
        }
        world.set(hx, hy, hz, B.head, f);
        moved = true;
        audio.place('stone');
      } else if (world.get(hx, hy, hz) === B.head) {
        world.set(hx, hy, hz, AIR);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Undo: the last 60 builds and breaks by the player
const undoStack = [];
function remember(x, y, z) {
  const i = world.idx(x, y, z);
  undoStack.push({ dim: state.dim, x, y, z, id: world.data[i], meta: world.meta.get(i) });
  if (undoStack.length > 60) undoStack.shift();
  updateUndoUI();
}
function undo() {
  const u = undoStack.pop();
  updateUndoUI();
  if (!u) { toast('Nothing to undo'); return; }
  if (u.dim !== state.dim) { toast('That change was in the other world'); return; }
  const cur = world.get(u.x, u.y, u.z);
  world.set(u.x, u.y, u.z, u.id, u.meta);
  if (u.id === 0) audio.breakBlock(soundKind(cur)); else audio.place(soundKind(u.id));
  flashAt(u.x, u.y, u.z);
  afterEdit(u.id || cur);
  if (CIRCUIT.has(cur)) runCircuits();
}
function updateUndoUI() { $('btn-undo').classList.toggle('dim', undoStack.length === 0); }

// Touch feedback: briefly outline the block that was just built or broken
let flashUntil = 0;
const flashPos = new THREE.Vector3();
function flashAt(x, y, z) {
  flashPos.set(x + 0.5, y + 0.5, z + 0.5);
  flashUntil = performance.now() + 260;
}

function breakAt(h) {
  if (!h.ok) return;
  const { x, y, z, id } = h;
  if (y === 0) { toast('That is the bottom of the world'); return; }
  if (id === B.piston) {
    const [dx, dy, dz] = DIRS[world.getMeta(x, y, z)] || DIRS[2];
    if (world.get(x + dx, y + dy, z + dz) === B.head) world.set(x + dx, y + dy, z + dz, AIR);
  }
  if (id === B.head) {
    const [dx, dy, dz] = DIRS[world.getMeta(x, y, z)] || DIRS[2];
    if (world.get(x - dx, y - dy, z - dz) === B.piston) world.set(x - dx, y - dy, z - dz, AIR);
  }
  remember(x, y, z);
  world.set(x, y, z, AIR);
  flashAt(x, y, z);
  if (id === B.carrot) collapsePortals(x, y, z);
  audio.breakBlock(soundKind(id));
  burst(x, y, z, id);
  afterEdit(id);
  if (id === B.head || id === B.piston) runCircuits();
}

function collapsePortals(x, y, z) {
  const stack = DIRS.map(([dx, dy, dz]) => [x + dx, y + dy, z + dz]);
  let n = 0;
  while (stack.length && n < 64) {
    const [cx, cy, cz] = stack.pop();
    if (world.get(cx, cy, cz) !== B.portal) continue;
    world.set(cx, cy, cz, AIR);
    n++;
    for (const [dx, dy, dz] of DIRS) stack.push([cx + dx, cy + dy, cz + dz]);
  }
}

function useAt(h) {
  const key = state.hotbar[state.slot];
  const item = ITEM_BY_KEY[key];
  if (!item) return;
  if (item.key === 'cart') {
    if (h.ok && isRail(h.id)) startRide(h.x, h.y, h.z);
    else toast('Tap a piece of track to ride it');
    return;
  }
  if (item.key === 'key') {
    if (!h.ok) return;
    const cands = [[h.x + h.nx, h.y + h.ny, h.z + h.nz], [h.x + h.nx, h.y + h.ny + 1, h.z + h.nz], [h.x + h.nx, h.y + h.ny - 1, h.z + h.nz]];
    for (const [cx, cy, cz] of cands) {
      const found = findPortalInterior(world, cx, cy, cz);
      if (found) {
        for (const [px, py, pz] of found.cells) world.set(px, py, pz, B.portal, found.axis);
        audio.portal();
        toast('Portal open! Walk through it');
        state.needsSave = true;
        return;
      }
    }
    toast('Build a frame of Carrot blocks, then use the key inside it');
    return;
  }
  if (!h.ok) return;
  const id = B[item.block];
  const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
  if (!world.inBounds(x, y, z)) { toast('You have reached the edge of the world'); return; }
  const existing = world.get(x, y, z);
  if (existing !== AIR && existing !== B.portal) return;
  if (SOLID[id]) {
    const p = player.pos, hw = player.hw;
    if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + player.height) { toast('Step back a little to build there'); return; }
  }
  let meta;
  if (id === B.loop) {
    camera.getWorldDirection(fwd);
    meta = Math.abs(fwd.x) > Math.abs(fwd.z) ? 0 : 1;
  }
  if (id === B.piston) {
    meta = DIRS.findIndex(([dx, dy, dz]) => dx === h.nx && dy === h.ny && dz === h.nz);
    if (meta < 0) meta = 2;
  }
  remember(x, y, z);
  world.set(x, y, z, id, meta);
  flashAt(x, y, z);
  navigator.vibrate?.(6);
  audio.place(soundKind(id));
  afterEdit(id);
  if (id === B.generator) audio.power();
  if (id === B.loop) {
    let space = true;
    for (let a = -2; a <= 2 && space; a++) for (let b = 1; b <= 5; b++) {
      const lx = meta === 0 ? x + a : x, lz = meta === 0 ? z : z + a;
      if (SOLID[world.get(lx, y + b, lz)]) { space = false; break; }
    }
    if (!space) toast('Loops need a clear space about 5 blocks tall');
  }
}

// Small block-break particles (one shared points object)
const PARTS = 48;
const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTS * 3), 3));
partGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PARTS * 3), 3));
const partPoints = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true }));
partPoints.frustumCulled = false;
scene.add(partPoints);
const partVel = new Float32Array(PARTS * 3);
let partLife = 0;
function burst(x, y, z, id) {
  const pos = partGeo.attributes.position.array, col = partGeo.attributes.color.array;
  const c = new THREE.Color(BLOCKS[id]?.top || '#999');
  for (let i = 0; i < PARTS; i++) {
    pos[i * 3] = x + 0.2 + Math.random() * 0.6; pos[i * 3 + 1] = y + 0.2 + Math.random() * 0.6; pos[i * 3 + 2] = z + 0.2 + Math.random() * 0.6;
    partVel[i * 3] = (Math.random() - 0.5) * 3; partVel[i * 3 + 1] = Math.random() * 3.5; partVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    const s = 0.75 + Math.random() * 0.3;
    col[i * 3] = c.r * s; col[i * 3 + 1] = c.g * s; col[i * 3 + 2] = c.b * s;
  }
  partGeo.attributes.color.needsUpdate = true;
  partLife = 0.6;
  partPoints.visible = true;
}
function updateParticles(dt) {
  if (partLife <= 0) return;
  partLife -= dt;
  const pos = partGeo.attributes.position.array;
  for (let i = 0; i < PARTS; i++) {
    partVel[i * 3 + 1] -= 14 * dt;
    pos[i * 3] += partVel[i * 3] * dt; pos[i * 3 + 1] += partVel[i * 3 + 1] * dt; pos[i * 3 + 2] += partVel[i * 3 + 2] * dt;
  }
  partGeo.attributes.position.needsUpdate = true;
  if (partLife <= 0) partPoints.visible = false;
}

// ---------------------------------------------------------------------------------------------------------
// Riding

function startRide(x, y, z) {
  if (!coaster.board(world, x, y, z)) { toast('This track is too short to ride. Add more pieces!'); return; }
  player.ride.yaw = 0;
  player.ride.pitch = 0;
  document.body.classList.add('riding');
  toast('Hold on tight!');
}

function stopRide() {
  coaster.exit();
  document.body.classList.remove('riding');
  // Step off beside the track
  const p = camera.position;
  const x = Math.floor(p.x), z = Math.floor(p.z);
  let placed = false;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
    for (let yy = Math.floor(p.y) + 1; yy > Math.floor(p.y) - 6; yy--) {
      if (yy < 1) break;
      if (SOLID[world.get(x + dx, yy - 1, z + dz)] && !collides(x + dx + 0.5, yy, z + dz + 0.5)) {
        player.pos.set(x + dx + 0.5, yy, z + dz + 0.5);
        placed = true;
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) { player.pos.set(p.x, p.y, p.z); player.flying = true; updateFlyUI(); }
  player.vel.set(0, 0, 0);
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  player.yaw = e.y;
  player.pitch = Math.max(-1.5, Math.min(1.5, e.x));
}

// ---------------------------------------------------------------------------------------------------------
// UI

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 2200);
}

function renderHotbar() {
  const bar = $('hotbar');
  bar.innerHTML = '';
  state.hotbar.forEach((key, i) => {
    const item = ITEM_BY_KEY[key];
    const b = document.createElement('button');
    b.className = 'slot' + (i === state.slot ? ' sel' : '');
    b.setAttribute('aria-label', itemName(item));
    b.innerHTML = `<img src="${itemIcon(item)}" alt="" draggable="false"><span class="num">${i + 1}</span>`;
    b.addEventListener('click', () => selectSlot(i));
    bar.appendChild(b);
  });
  const more = document.createElement('button');
  more.className = 'slot more';
  more.setAttribute('aria-label', 'All blocks');
  more.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor"/></svg>';
  more.addEventListener('click', openInventory);
  bar.appendChild(more);
}

function selectSlot(i) {
  state.slot = (i + state.hotbar.length) % state.hotbar.length;
  document.querySelectorAll('#hotbar .slot').forEach((s, k) => s.classList.toggle('sel', k === state.slot));
  const item = ITEM_BY_KEY[state.hotbar[state.slot]];
  const label = $('item-label');
  label.textContent = itemName(item);
  label.classList.add('on');
  clearTimeout(label._t);
  label._t = setTimeout(() => label.classList.remove('on'), 1200);
  audio.tap();
}

function openInventory() {
  const grid = $('inv-grid');
  grid.innerHTML = '';
  for (const item of ITEMS) {
    const b = document.createElement('button');
    b.className = 'inv-item';
    b.innerHTML = `<img src="${itemIcon(item)}" alt="" draggable="false"><span>${itemName(item)}</span>`;
    b.addEventListener('click', () => {
      const existing = state.hotbar.indexOf(item.key);
      if (existing >= 0) state.slot = existing;
      else state.hotbar[state.slot] = item.key;
      renderHotbar();
      selectSlot(state.slot);
      closeSheet('inventory');
      state.needsSave = true;
    });
    grid.appendChild(b);
  }
  openSheet('inventory');
}

let openSheetId = null;
function openSheet(id) {
  openSheetId = id;
  state.paused = true;
  input.reset();
  if (document.pointerLockElement) document.exitPointerLock();
  $(id).classList.add('on');
  audio.tap();
}
function closeSheet(id) {
  $(id).classList.remove('on');
  openSheetId = null;
  if (state.started) state.paused = false;
}

function updateDimChip() {
  $('dim-chip').textContent = state.dim === 'bunny' ? 'Bunny Meadow' : 'Overworld';
  document.body.dataset.dim = state.dim;
}

function updateFlyUI() {
  $('btn-fly').classList.toggle('on', player.flying);
  $('btn-fly').setAttribute('aria-pressed', String(player.flying));
  document.body.classList.toggle('flying', player.flying);
}

function toggleFly() {
  player.flying = !player.flying;
  player.vel.y = 0;
  updateFlyUI();
  toast(player.flying ? 'Flying' : 'Walking');
}

function updateModeUI() {
  $('btn-mode').classList.toggle('on', state.tapBreaks);
  $('btn-mode').querySelector('span').textContent = state.tapBreaks ? 'Break' : 'Build';
}

let jumpHeld = false, downHeld = false, lastJumpTap = 0;
function holdButton(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); onDown(); });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
}

holdButton($('btn-jump'), () => {
  audio.unlock();
  const now = performance.now();
  if (now - lastJumpTap < 280) toggleFly();
  lastJumpTap = now;
  jumpHeld = true;
  if (coaster.riding) stopRide();
}, () => { jumpHeld = false; });
holdButton($('btn-down'), () => { downHeld = true; }, () => { downHeld = false; });
$('btn-fly').addEventListener('click', toggleFly);
$('btn-undo').addEventListener('click', () => undo());
$('btn-mode').addEventListener('click', () => { state.tapBreaks = !state.tapBreaks; updateModeUI(); audio.tap(); });
$('btn-exit').addEventListener('click', () => stopRide());
$('btn-menu').addEventListener('click', () => openSheet('menu'));
$('btn-resume').addEventListener('click', () => closeSheet('menu'));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(b.dataset.close)));

function setToggle(id, on) { $(id).setAttribute('aria-checked', String(on)); }
$('tog-music').addEventListener('click', () => { settings.music = !settings.music; audio.unlock(); audio.setMusic(settings.music); setToggle('tog-music', settings.music); saveSettings(settings); });
$('tog-sfx').addEventListener('click', () => { settings.sfx = !settings.sfx; audio.setSfx(settings.sfx); setToggle('tog-sfx', settings.sfx); saveSettings(settings); });
$('btn-help').addEventListener('click', () => { closeSheet('menu'); openSheet('help'); });
$('btn-title-help').addEventListener('click', () => openSheet('help'));
$('btn-new').addEventListener('click', () => { closeSheet('menu'); openSheet('confirm'); });
$('btn-confirm-new').addEventListener('click', () => { closeSheet('confirm'); newWorld(); startGame(); });
$('btn-save').addEventListener('click', () => { persist(); toast('Saved'); });
$('btn-title').addEventListener('click', () => { persist(); closeSheet('menu'); showTitle(); });

function showTitle() {
  state.started = false;
  state.paused = true;
  if (coaster.riding) stopRide();
  document.body.classList.add('at-title');
}

$('btn-play').addEventListener('click', () => { audio.unlock(); audio.setMusic(settings.music); startGame(); });
$('btn-title-new').addEventListener('click', () => { audio.unlock(); audio.setMusic(settings.music); if (hasSave) openSheet('confirm'); else { newWorld(); startGame(); } });

function startGame() {
  document.body.classList.remove('at-title');
  state.started = true;
  state.paused = false;
  input.reset();
  input.restJoystick();
  let seen = false;
  try { seen = !!localStorage.getItem('mycraft.seenHelp'); localStorage.setItem('mycraft.seenHelp', '1'); } catch { /* ignore */ }
  if (!seen) {
    if (input.touchMode) {
      // Point at the two thumbs' jobs until the player has tried both
      const j = $('joy').getBoundingClientRect();
      $('coach-move').style.top = `${Math.max(60, j.top - 64)}px`;
      document.body.classList.add('coaching');
      setTimeout(() => document.body.classList.remove('coaching'), 9000);
      setTimeout(() => toast('Try the Cart on the track!'), 9500);
    } else setTimeout(() => toast('Click to play. Left click breaks, right click builds'), 600);
  }
}

// Unlock / re-wake audio on every gesture. iOS only accepts touchend and click as unlocking gestures,
// and it can suspend audio again after a call or a trip to Control Centre.
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
  addEventListener(ev, () => { if (!audio.ctx || audio.ctx.state !== 'running') audio.unlock(); }, { passive: true, capture: true });
}

// ---------------------------------------------------------------------------------------------------------
// Input wiring

let holdTarget = null;
const input = new Input($('touch-layer'), {
  isPaused: () => state.paused,
  canLock: () => state.started && !state.paused,
  onTap: (x, y) => {
    if (coaster.riding) return;
    const h = targetFromScreen(x, y);
    if (state.tapBreaks) breakAt(h); else useAt(h);
  },
  onHold: (x, y) => {
    if (coaster.riding) return;
    const h = targetFromScreen(x, y);
    if (h.ok) { breakAt(h); navigator.vibrate?.(8); }
    // show what the next repeat will break
    const n = targetFromScreen(x, y);
    holdTarget = n.ok ? [n.x, n.y, n.z] : null;
  },
  onHoldEnd: () => { holdTarget = null; },
  onBreak: () => { if (coaster.riding) return; breakAt(targetFromScreen()); },
  onPlace: () => { if (coaster.riding) return; useAt(targetFromScreen()); },
  onWheel: (d) => selectSlot(state.slot + d),
  onLockChange: (locked) => {
    document.body.classList.toggle('locked', locked);
    if (!locked && state.started && !state.paused && !openSheetId && !input.touchMode) openSheet('menu');
  },
  onKey: (e) => {
    if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)) - 1; if (n >= 0 && n < 9) selectSlot(n); }
    if (e.code === 'KeyF') toggleFly();
    if (e.code === 'KeyE') { if (openSheetId === 'inventory') closeSheet('inventory'); else if (state.started) openInventory(); }
    if (e.code === 'KeyM') $('tog-music').click();
    if (e.code === 'KeyQ' && coaster.riding) stopRide();
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && state.started) undo();
    if (e.code === 'Space') {
      const now = performance.now();
      if (!e.repeat && now - lastJumpTap < 280) toggleFly();
      if (!e.repeat) lastJumpTap = now;
      if (coaster.riding) stopRide();
    }
    if (e.code === 'Escape' && openSheetId) closeSheet(openSheetId);
  },
});
input.sensitivity = settings.sensitivity;
$('look-speed').value = String(settings.sensitivity);
$('look-speed').addEventListener('input', (e) => {
  settings.sensitivity = Number(e.target.value);
  input.sensitivity = settings.sensitivity;
  saveSettings(settings);
});

// ---------------------------------------------------------------------------------------------------------
// Save / load

let hasSave = false;
function persist() {
  if (!state.seed) return;
  saveGame({
    seed: state.seed,
    dim: state.dim,
    player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying },
    hotbar: state.hotbar,
    worlds: state.worlds,
  });
  state.needsSave = false;
  hasSave = true;
}

function newWorld() {
  undoStack.length = 0;
  clearGame();
  state.seed = (Math.random() * 1e9) | 0;
  state.worlds = {};
  state.pendingEdits = null;
  state.lastPortal = {};
  state.hotbar = [...DEFAULT_HOTBAR];
  state.slot = 0;
  player.flying = false;
  enterDimension('overworld', safeSpawn(SPAWN.x, SPAWN.z + 3));
  player.yaw = 0;
  player.pitch = -0.1;
  renderHotbar();
  updateFlyUI();
  persist();
}

function boot() {
  const saved = loadGame();
  if (saved) {
    hasSave = true;
    state.seed = saved.seed;
    state.pendingEdits = saved.edits;
    state.hotbar = (saved.hotbar || DEFAULT_HOTBAR).map((k) => (ITEM_BY_KEY[k] ? k : 'grass'));
    enterDimension(saved.dim || 'overworld');
    const p = saved.player || {};
    player.pos.set(p.x ?? SPAWN.x + 0.5, p.y ?? 18, p.z ?? SPAWN.z + 3.5);
    player.yaw = p.yaw ?? 0;
    player.pitch = p.pitch ?? 0;
    player.flying = !!p.flying;
    $('btn-play').textContent = 'Continue';
  } else {
    state.seed = (Math.random() * 1e9) | 0;
    enterDimension('overworld', null);
    const s = safeSpawn(SPAWN.x, SPAWN.z + 3);
    player.pos.set(s.x, s.y, s.z);
    $('btn-play').textContent = 'Play';
  }
  renderHotbar();
  updateFlyUI();
  updateModeUI();
  setToggle('tog-music', settings.music);
  setToggle('tog-sfx', settings.sfx);
  updateUndoUI();
  audio.musicOn = settings.music;
  audio.sfxOn = settings.sfx;
  document.querySelectorAll('.logo').forEach((el) => { el.innerHTML = logoSVG(); });
  document.body.classList.add('at-title');
  document.body.classList.remove('loading');
}

setInterval(() => { if (state.needsSave && state.started) persist(); }, 15000);
addEventListener('pagehide', () => { if (state.started) persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.started) persist(); });

// ---------------------------------------------------------------------------------------------------------
// Main loop

let last = performance.now();
let frameAcc = 0, frameCount = 0, slowFrames = 0;
let titleAngle = 0;
const eye = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);

  input.update();
  const lx = input.lookDX, ly = input.lookDY;
  input.lookDX = input.lookDY = 0;

  if (!state.started) {
    // Slow orbit behind the title screen
    titleAngle += dt * 0.05;
    const r = 26;
    camera.position.set(SPAWN.x + Math.sin(titleAngle) * r, 30, SPAWN.z + Math.cos(titleAngle) * r);
    camera.lookAt(SPAWN.x + 4, 17, SPAWN.z);
  } else if (coaster.riding) {
    if (!state.paused) {
      player.ride.yaw = Math.max(-2.2, Math.min(2.2, player.ride.yaw - lx));
      player.ride.pitch = Math.max(-1.2, Math.min(1.2, player.ride.pitch - ly));
      if (!input.look && !input.locked) { player.ride.yaw *= 1 - dt * 1.5; player.ride.pitch *= 1 - dt * 1.5; }
      coaster.update(dt, eye);
    }
    camera.position.copy(eye);
    coaster.applyCamera(camera, dt, player.ride.yaw, player.ride.pitch);
    player.pos.set(eye.x, eye.y - 1.5, eye.z);
  } else {
    if (!state.paused) {
      player.yaw -= lx;
      player.pitch = Math.max(-1.53, Math.min(1.53, player.pitch - ly));
      updatePlayer(dt);
      checkPortal(dt);
    }
    camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }

  if (!state.paused || !state.started) {
    const lure = ITEM_BY_KEY[state.hotbar[state.slot]]?.key === 'carrot';
    bunnies.update(dt, player, lure && state.started);
    updateParticles(dt);
  }

  // Desktop crosshair highlight
  if (state.started && !state.paused && !coaster.riding && !input.touchMode) {
    const h = targetFromScreen();
    highlight.visible = h.ok;
    if (h.ok) highlight.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5);
  } else if (state.started && !coaster.riding && holdTarget) {
    highlight.visible = true;
    highlight.position.set(holdTarget[0] + 0.5, holdTarget[1] + 0.5, holdTarget[2] + 0.5);
  } else if (state.started && !coaster.riding && now < flashUntil) {
    highlight.visible = true;
    highlight.position.copy(flashPos);
  } else highlight.visible = false;

  remesh(world.dirty.size > 8 ? 6 : 3);
  portalMat.opacity = 0.62 + Math.sin(now * 0.004) * 0.12;
  sky.update(dt, camera.position);
  audio.tick();
  // Resolution changes happen before drawing: resizing after a draw clears the canvas and flashes blank.
  // Dynamic resolution: keep frames smooth on phones, sharpen when there is headroom
  frameAcc += rawDt; frameCount++;
  if (rawDt > 1 / 40) slowFrames++;
  if (frameAcc > 1.2) {
    const avg = frameAcc / frameCount;
    let next = pixelRatio;
    if (avg > 1 / 50 || slowFrames > frameCount * 0.25) next = Math.max(0.6, pixelRatio - 0.15);
    else if (avg < 1 / 58 && pixelRatio < maxRatio) next = Math.min(maxRatio, pixelRatio + 0.1);
    if (Math.abs(next - pixelRatio) > 0.01 && !document.hidden) {
      pixelRatio = next;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(innerWidth, innerHeight, false);
    }
    frameAcc = 0; frameCount = 0; slowFrames = 0;
  }

  renderer.render(scene, camera);

}

boot();
requestAnimationFrame(frame);

// Debug hook for automated checks (no effect on play)
window.__mycraftAudio = audio;
window.__mycraft = { state, player, coaster, get world() { return world; }, startRide, stopRide, useAt, breakAt, targetFromScreen, travel, toast };

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
