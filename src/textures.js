import * as THREE from 'three';
import { BLOCKS, T } from './blocks.js';

// A tiny procedural greyscale atlas (4x2 tiles of 16px). Vertex colours carry the hue; the atlas adds grain.
export const TILE = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintTile(img, tx, ty, fn) {
  const W = ATLAS_COLS * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y) * 255)));
      const i = ((ty * TILE + y) * W + tx * TILE + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
}

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const r = rng(7);
  const grain = () => 0.9 + r() * 0.1;

  paintTile(img, 0, 0, () => 0.88 + r() * 0.12); // GRAIN
  paintTile(img, 1, 0, (x, y) => { // PLANKS
    const seam = y % 4 === 3 ? 0.78 : 1;
    const joint = (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0 ? 0.82 : 1;
    return seam * joint * (0.9 + r() * 0.08);
  });
  paintTile(img, 2, 0, (x, y) => { // BRICK
    const row = Math.floor(y / 4);
    const mortarH = y % 4 === 3;
    const mortarV = (x + (row % 2) * 4) % 8 === 7;
    return mortarH || mortarV ? 1.12 : 0.88 + r() * 0.1;
  });
  paintTile(img, 3, 0, () => (r() < 0.16 ? 0.7 : grain())); // LEAVES
  paintTile(img, 0, 1, (x) => (x % 4 === 0 ? 0.8 : 0.92 + r() * 0.08)); // BARK
  paintTile(img, 1, 1, () => (r() < 0.1 ? 0.78 : r() < 0.06 ? 1.08 : grain())); // SPECKLE
  paintTile(img, 2, 1, (x, y) => { // GLOW (framed)
    const edge = x === 0 || y === 0 || x === 15 || y === 15 ? 0.75 : 1;
    const inner = x > 4 && x < 11 && y > 4 && y < 11 ? 1.08 : 1;
    return edge * inner * (0.95 + r() * 0.05);
  });
  paintTile(img, 3, 1, () => 0.96 + r() * 0.04); // SMOOTH
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  return tex;
}

export function tileUV(tile) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const pad = 0.02 / ATLAS_COLS;
  const u0 = col / ATLAS_COLS + pad;
  const u1 = (col + 1) / ATLAS_COLS - pad;
  const v1 = 1 - row / ATLAS_ROWS - pad;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + pad;
  return [u0, v0, u1, v1];
}

// Colour lookup tables per block: [top, side, bottom, sideTop, on] as linear 0..255 rgb triples.
const hex = (h) => {
  const c = new THREE.Color(h);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};
export const COLORS = BLOCKS.map((b) => b && {
  top: hex(b.top), side: hex(b.side), bottom: hex(b.bottom),
  sideTop: b.sideTop ? hex(b.sideTop) : null, on: b.on ? hex(b.on) : null,
});

// ---------------------------------------------------------------------------------------------------------
// Isometric block icons for the hotbar / inventory (drawn once, cached as data URLs).

const iconCache = new Map();
function shade(h, f) {
  const c = new THREE.Color(h);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

export function itemIcon(item) {
  if (iconCache.has(item.key)) return iconCache.get(item.key);
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (item.key === 'cart') {
    g.fillStyle = '#5b625c';
    g.beginPath(); g.arc(22, 48, 6, 0, 7); g.arc(44, 48, 6, 0, 7); g.fill();
    g.fillStyle = '#c77d62';
    roundRect(g, 10, 20, 46, 24, 7); g.fill();
    g.fillStyle = '#e5c579';
    roundRect(g, 14, 24, 38, 6, 3); g.fill();
  } else if (item.key === 'key') {
    g.strokeStyle = '#d4569b'; g.lineWidth = 7;
    g.beginPath(); g.arc(22, 24, 11, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(30, 32); g.lineTo(50, 52); g.moveTo(42, 44); g.lineTo(48, 38); g.moveTo(47, 49); g.lineTo(53, 43); g.stroke();
    g.fillStyle = '#ffd1ea'; g.beginPath(); g.arc(22, 24, 5, 0, 7); g.fill();
  } else if (item.key === 'rail') {
    g.strokeStyle = '#8a6a4f'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(14 + i * 4, 52 - i * 12); g.lineTo(46 + i * 4, 52 - i * 12); g.stroke(); }
    g.strokeStyle = '#6f7a80'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(20, 56); g.lineTo(30, 10); g.moveTo(42, 56); g.lineTo(52, 10); g.stroke();
  } else if (item.key === 'loop') {
    g.strokeStyle = '#c9a85a'; g.lineWidth = 7;
    g.beginPath(); g.arc(32, 30, 17, 0, 7); g.stroke();
    g.strokeStyle = '#e5c579'; g.lineWidth = 3;
    g.beginPath(); g.arc(32, 30, 17, 0, 7); g.stroke();
    g.strokeStyle = '#8a6a4f'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(6, 50); g.lineTo(58, 50); g.stroke();
  } else if (item.key === 'wire') {
    g.strokeStyle = '#7a2e25'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(8, 44); g.bezierCurveTo(24, 20, 40, 60, 56, 26); g.stroke();
    g.strokeStyle = '#ff5a3d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(8, 44); g.bezierCurveTo(24, 20, 40, 60, 56, 26); g.stroke();
  } else {
    const b = BLOCKS.find((x) => x && x.key === item.block);
    const top = b.on && item.key === 'lamp' ? b.on : b.top;
    const sideTop = b.sideTop;
    // isometric cube
    const cx = 32, cy = 33, w = 24, h = 13, d = 26;
    g.fillStyle = top;
    g.beginPath(); g.moveTo(cx, cy - h * 2 + 2); g.lineTo(cx + w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx - w, cy - h + 2); g.closePath(); g.fill();
    g.fillStyle = shade(b.side, 0.82);
    g.beginPath(); g.moveTo(cx - w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx, cy + d); g.lineTo(cx - w, cy + d - h); g.closePath(); g.fill();
    g.fillStyle = shade(b.side, 0.66);
    g.beginPath(); g.moveTo(cx + w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx, cy + d); g.lineTo(cx + w, cy + d - h); g.closePath(); g.fill();
    if (sideTop) {
      g.fillStyle = shade(sideTop, 0.8);
      g.beginPath(); g.moveTo(cx - w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx, cy + 8); g.lineTo(cx - w, cy - h + 8); g.closePath(); g.fill();
      g.fillStyle = shade(sideTop, 0.65);
      g.beginPath(); g.moveTo(cx + w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx, cy + 8); g.lineTo(cx + w, cy - h + 8); g.closePath(); g.fill();
    }
    if (item.key === 'piston') {
      g.fillStyle = '#b9a27e';
      g.beginPath(); g.moveTo(cx, cy - h * 2 + 2); g.lineTo(cx + w, cy - h + 2); g.lineTo(cx, cy + 2); g.lineTo(cx - w, cy - h + 2); g.closePath(); g.fill();
    }
    if (item.key === 'note') {
      g.fillStyle = '#fffaf3';
      g.beginPath(); g.ellipse(29, 32, 5, 4, -0.4, 0, 7); g.fill();
      g.fillRect(32, 14, 3, 18);
      g.beginPath(); g.moveTo(35, 14); g.quadraticCurveTo(42, 17, 40, 24); g.lineTo(37, 22); g.quadraticCurveTo(38, 18, 35, 18); g.fill();
    }
    if (item.key === 'firework') {
      g.fillStyle = '#ffe7a3';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(32 + Math.cos(a) * 9, 16 + Math.sin(a) * 6, 2.4, 0, 7); g.fill(); }
      g.beginPath(); g.arc(32, 16, 3, 0, 7); g.fill();
    }
    if (item.key === 'generator') {
      g.fillStyle = '#ffe7a3';
      g.beginPath(); g.moveTo(34, 10); g.lineTo(26, 24); g.lineTo(33, 24); g.lineTo(29, 36); g.lineTo(39, 20); g.lineTo(32, 20); g.closePath(); g.fill();
    }
  }
  const url = c.toDataURL();
  iconCache.set(item.key, url);
  return url;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
