import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

// Voxel-art atlas: every block face is a hand-designed 16x16 pixel tile, painted in code (no image files).
// Tiles sit in 20px cells with a 2px repeated-edge gutter so mipmaps don't bleed between neighbours.
export const TILE = 16;
const PAD = 8; // wide gutters so distant (mipmapped) tiles never pick up their neighbours
const CELL = TILE + PAD * 2;
const COLS = 8;

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
const seedOf = (name) => [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

// ---- painters ----
export const TILES = {}; // name -> index
const PAINTERS = [];
function tile(name, fn) { TILES[name] = PAINTERS.length; PAINTERS.push([name, fn]); }

/** A 16x16 pixel grid with tiny drawing helpers. */
function grid(seed) {
  const px = new Array(TILE * TILE).fill('#ff00ff');
  const r = rng(seed);
  const g = {
    r,
    set: (x, y, c) => { if (x >= 0 && y >= 0 && x < TILE && y < TILE) px[y * TILE + x] = c; },
    get: (x, y) => px[Math.max(0, Math.min(TILE - 1, y)) * TILE + Math.max(0, Math.min(TILE - 1, x))],
    pick: (list) => list[Math.floor(r() * list.length)],
    noise: (list, x0 = 0, y0 = 0, x1 = TILE, y1 = TILE) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.set(x, y, g.pick(list)); },
    dots: (list, chance) => { for (let i = 0; i < TILE * TILE; i++) if (r() < chance) px[i] = g.pick(list); },
    rect: (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g.set(x, y, c); },
    frame: (c, inset = 0) => { for (let i = inset; i < TILE - inset; i++) { g.set(i, inset, c); g.set(i, TILE - 1 - inset, c); g.set(inset, i, c); g.set(TILE - 1 - inset, i, c); } },
    px,
  };
  return g;
}

const GRASS = ['#6fae5a', '#67a653', '#78b862', '#62a24f', '#6fae5a'];
const DIRT = ['#8a6142', '#7f5739', '#94694a', '#86603f'];
const STONE = ['#9a9c96', '#8f918b', '#a3a59f', '#888a84'];

tile('white', (g) => g.noise(['#ffffff']));

tile('grass_top', (g) => {
  g.noise(GRASS);
  g.dots(['#86c66d', '#8ccd73'], 0.07);
  g.dots(['#558f44'], 0.05);
});
tile('grass_side', (g) => {
  g.noise(DIRT);
  g.dots(['#a37d5c', '#6a4931'], 0.05);
  for (let x = 0; x < TILE; x++) {
    const d = 3 + (g.r() < 0.45 ? 1 : 0) + (g.r() < 0.2 ? 1 : 0);
    for (let y = 0; y < d; y++) g.set(x, y, g.pick(GRASS));
    g.set(x, d, '#558f44');
  }
});
tile('dirt', (g) => {
  g.noise(DIRT);
  g.dots(['#a88566', '#b08d6c'], 0.05);
  g.dots(['#5e3f28', '#664630'], 0.05);
});
tile('stone', (g) => {
  // cobbles: nearest-centre cells with darker mortar lines
  const c = Array.from({ length: 7 }, () => [g.r() * 16, g.r() * 16, g.pick(STONE)]);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ds = c.map(([cx, cy]) => {
      const dx = Math.min(Math.abs(x - cx), 16 - Math.abs(x - cx)), dy = Math.min(Math.abs(y - cy), 16 - Math.abs(y - cy));
      return Math.hypot(dx, dy);
    });
    const order = ds.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]);
    if (order[1][0] - order[0][0] < 1.1) g.set(x, y, '#6d6f6a');
    else g.set(x, y, g.r() < 0.18 ? '#b0b2ac' : c[order[0][1]][2]);
  }
});
tile('log_side', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const band = (x + (y > 8 ? 1 : 0)) % 4;
    g.set(x, y, band === 0 ? '#5a3f29' : band === 2 ? '#7a5a3d' : '#6c4e34');
  }
  g.dots(['#866645'], 0.05);
  for (let i = 0; i < 3; i++) { const x = Math.floor(g.r() * 16), y0 = Math.floor(g.r() * 12); g.rect(x, y0, 1, 3, '#4b3422'); }
});
tile('log_top', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.6) g.set(x, y, (x + y) % 3 ? '#5f432c' : '#6e4f35');
    else g.set(x, y, d < 1.2 ? '#9a6d43' : Math.floor(d) % 2 ? '#c8a074' : '#b4895c');
  }
});
tile('planks', (g) => {
  const boards = ['#c99a66', '#bf8f5c', '#d2a571', '#c4945f'];
  for (let b = 0; b < 4; b++) {
    const col = boards[b];
    const joint = (b % 2) * 8 + 3;
    for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < TILE; x++) {
      if (y % 4 === 3) g.set(x, y, '#8f6a44');
      else if (x === joint) g.set(x, y, '#9f7a52');
      else g.set(x, y, g.r() < 0.12 ? '#b3854f' : col);
    }
    g.set((joint + 2) % 16, b * 4 + 1, '#7a5a3d');
  }
});
tile('leaves', (g) => {
  g.noise(['#4f8a45', '#5a9a4f', '#4a8340', '#62a457']);
  g.dots(['#2f5a2c', '#365f31'], 0.12);
  g.dots(['#7cc06a', '#86c873'], 0.08);
});
tile('sand', (g) => {
  g.noise(['#e8d5a6', '#e2cd9a', '#eddcb2', '#e5d1a0']);
  for (const yy of [3, 9, 14]) for (let x = 0; x < TILE; x++) if ((x + yy) % 5 < 3) g.set(x, yy + (x % 6 < 3 ? 0 : 1), '#d1b982');
  g.dots(['#f6ead0'], 0.04);
});
tile('brick', (g) => {
  const cols = ['#c77d62', '#b96f55', '#cf8a6e', '#bd7459'];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let bx = -1; bx < 3; bx++) {
      const c = cols[Math.floor(g.r() * cols.length)];
      for (let y = row * 4; y < row * 4 + 4; y++) for (let x = bx * 8 + off; x < bx * 8 + off + 8; x++) {
        const mortar = y % 4 === 3 || (x - off + 16) % 8 === 7;
        g.set(x, y, mortar ? '#eadfcc' : y % 4 === 0 ? '#d99a80' : g.r() < 0.1 ? '#a9634b' : c);
      }
    }
  }
});
tile('snow', (g) => {
  g.noise(['#f7f6f2', '#f0f0ee', '#fbfbf9', '#eef2f5']);
  g.dots(['#dbe5ee'], 0.07);
  g.dots(['#ffffff'], 0.05);
});
tile('ice', (g) => {
  g.noise(['#cfe8f2', '#c6e2ee', '#d6edf6']);
  for (let i = -16; i < 16; i += 7) for (let k = 0; k < 6; k++) { g.set(i + k + 4, 11 - k, '#f4fbfe'); g.set(i + k + 5, 11 - k, '#eaf6fb'); }
  g.dots(['#a9d2e3'], 0.04);
  g.frame('#b3d7e6');
});
tile('carrot_side', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = (y + (x > 7 ? 2 : 0)) % 5 === 2 && (x + y) % 7 > 1;
    g.set(x, y, ridge ? '#cf6a22' : g.pick(['#ef8233', '#f08a3c', '#e9792c']));
  }
  g.dots(['#f9a865'], 0.06);
});
tile('carrot_top', (g) => {
  g.noise(['#ef8233', '#e9792c']);
  g.frame('#d26a22');
  const leaf = [[7, 7], [8, 7], [7, 8], [8, 8], [6, 6], [9, 6], [6, 9], [9, 9], [5, 5], [10, 5], [7, 5], [8, 4], [5, 8], [10, 8], [7, 10], [8, 11]];
  for (const [x, y] of leaf) g.set(x, y, g.r() < 0.5 ? '#5f9e4d' : '#7cc06a');
});
tile('candy_top', (g) => {
  g.noise(['#f4a9c8', '#f0a0c0', '#f7b6d1', '#eb98b9']);
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(g.r() * 12), y = 2 + Math.floor(g.r() * 12);
    g.set(x, y, '#f5c84c');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, '#fffaf3');
  }
});
tile('candy_side', (g) => {
  g.noise(['#c9a27e', '#bb9470', '#d1ab88']);
  g.dots(['#a98462'], 0.06);
  for (let x = 0; x < TILE; x++) {
    const d = 3 + (g.r() < 0.45 ? 1 : 0) + (g.r() < 0.2 ? 1 : 0);
    for (let y = 0; y < d; y++) g.set(x, y, g.pick(['#f4a9c8', '#f0a0c0', '#f7b6d1']));
    g.set(x, d, '#d987a8');
  }
});
tile('blossom', (g) => {
  g.noise(['#f6b7cf', '#eeaac4', '#f9c4d8', '#e69ab7']);
  g.dots(['#c97a9a'], 0.1);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(g.r() * 16), y = Math.floor(g.r() * 16);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.set(x + dx, y + dy, '#fff0f6');
    g.set(x, y, '#ffd3e4');
  }
});
tile('cloud', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const puff = Math.sin(x * 0.7) * 1.5 + Math.cos(y * 0.6 + x * 0.2) * 1.2;
    g.set(x, y, y > 11 + puff * 0.5 ? '#e3e7f0' : puff > 1.4 ? '#ffffff' : g.r() < 0.5 ? '#f7f8fb' : '#eef0f6');
  }
});
tile('sunshine', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ray = Math.cos(a * 8) > 0.6;
    g.set(x, y, d < 3.2 ? '#fff6c4' : d < 4.6 ? '#ffe37a' : ray ? '#ffd65c' : '#f2be45');
  }
  g.frame('#e0a93a');
});
tile('mint', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) g.set(x, y, (x + y) % 8 < 3 ? '#effaf5' : g.pick(['#9fd8c0', '#97d3ba', '#a6dcc6']));
  g.frame('#7fc0a5');
});
tile('star', (g) => {
  g.noise(['#2f3f73', '#34467d', '#2b3a6c']);
  g.dots(['#fff6c8', '#cfd8ff'], 0.04);
  const s = [[7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9], [7, 10], [4, 7], [5, 7], [6, 7], [8, 7], [9, 7], [10, 7], [6, 6], [8, 6], [6, 8], [8, 8]];
  for (const [x, y] of s) g.set(x + 1, y, '#fff1a8');
  g.set(8, 7, '#ffffff');
});
const bolt = [[9, 2], [8, 3], [8, 4], [7, 5], [7, 6], [6, 7], [7, 7], [8, 7], [9, 7], [9, 8], [8, 9], [8, 10], [7, 11], [7, 12], [6, 13]];
function generator(g, on) {
  g.noise(on ? ['#d84a3a', '#cf4434', '#e05545'] : ['#8e3b30', '#86372d', '#96402f']);
  g.frame('#4a3a2e');
  g.frame('#5e4a3a', 1);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.set(x, y, '#c9b8a0');
  for (const [x, y] of bolt) { g.set(x, y, on ? '#ffe27a' : '#b59a82'); g.set(x + 1, y, on ? '#fff3b8' : '#9c8470'); }
}
tile('generator_side', (g) => generator(g, true));
tile('generator_off', (g) => generator(g, false));
tile('generator_top', (g) => {
  g.noise(['#3a2e25']);
  for (let y = 3; y < 13; y += 3) g.rect(3, y, 10, 1, '#c94a39');
  g.frame('#4a3a2e');
});
tile('piston_side', (g) => {
  g.noise(STONE, 0, 4, 16, 16);
  g.dots(['#7d7f7a'], 0.05);
  g.rect(0, 0, 16, 4, '#c4ae88');
  for (let x = 0; x < 16; x++) if (x % 5 === 0) g.set(x, 1, '#a48d6a');
  g.rect(0, 4, 16, 1, '#5d6266');
  g.rect(7, 7, 2, 6, '#6d6f6a');
});
tile('piston_face', (g) => {
  g.noise(['#c4ae88', '#b9a27e', '#cbb692']);
  g.frame('#7c8589');
  g.frame('#9aa3a7', 1);
  g.rect(6, 6, 4, 4, '#7c8589');
  g.rect(7, 7, 2, 2, '#b8c0c4');
});
tile('piston_back', (g) => {
  g.noise(STONE);
  g.rect(5, 5, 6, 6, '#4e504c');
  g.rect(6, 6, 4, 4, '#3a3c39');
});
function lamp(g, on) {
  g.noise(on ? ['#ffd76a', '#ffdc7a', '#ffe08a'] : ['#7c6a50', '#76654c', '#826f54']);
  if (on) for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) g.set(x, y, Math.hypot(x - 7.5, y - 7.5) < 2 ? '#fffbe6' : '#fff1b8');
  else g.dots(['#9a8766'], 0.08);
  g.frame(on ? '#8a6a44' : '#4e3e2c');
  g.rect(7, 0, 2, 16, on ? '#a37d50' : '#5a4632');
  g.rect(0, 7, 16, 2, on ? '#a37d50' : '#5a4632');
}
tile('lamp_off', (g) => lamp(g, false));
tile('lamp_on', (g) => lamp(g, true));
tile('note_side', (g) => {
  g.noise(['#7a4e33', '#6f472e', '#83553a']);
  g.frame('#4f3222');
  const n = [[9, 3], [10, 3], [11, 4], [11, 5], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [8, 10], [6, 10], [7, 10], [5, 11], [6, 11], [7, 11], [8, 11], [6, 12], [7, 12]];
  for (const [x, y] of n) g.set(x, y, '#fbe9cf');
});
tile('note_top', (g) => {
  g.noise(['#7a4e33', '#6f472e']);
  for (let y = 2; y < 14; y += 3) for (let x = 2; x < 14; x += 3) if (Math.hypot(x - 7, y - 7) < 6.5) g.rect(x, y, 2, 2, '#3e2618');
  g.frame('#4f3222');
});
tile('firework_side', (g) => {
  g.noise(['#e05a7a', '#d9516f', '#e66784']);
  g.rect(7, 0, 2, 16, '#f5c84c');
  g.rect(7, 0, 1, 16, '#ffe08a');
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(g.r() * 16), y = Math.floor(g.r() * 16);
    if (x > 5 && x < 10) continue;
    g.set(x, y, '#fff3f7');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, '#f7b7c8');
  }
});
tile('firework_top', (g) => {
  g.noise(['#e05a7a', '#d9516f']);
  g.frame('#b8435f');
  g.rect(6, 6, 4, 4, '#3a2e25');
  g.set(7, 5, '#ff9a3c'); g.set(8, 4, '#ffd36a'); g.set(7, 4, '#ff7a2c');
});
tile('gold', (g) => {
  // polished gold with diagonal shine bands and a gleaming carrot
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const band = (x + y) % 11;
    g.set(x, y, band === 0 || band === 1 ? '#fff3b0' : band === 2 ? '#ffe27a' : g.pick(['#ffcc3d', '#f7c235', '#ffd34d']));
  }
  const body = [[4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [5, 12], [6, 11], [7, 10], [8, 9], [9, 8], [10, 7], [6, 12], [7, 11], [8, 10], [9, 9], [10, 8], [3, 13], [4, 13]];
  for (const [x, y] of body) g.set(x, y, '#ff9a1f');
  for (const [x, y] of [[6, 10], [8, 8]]) g.set(x, y, '#ffd08a');
  for (const [x, y] of [[10, 6], [11, 5], [11, 6], [12, 4], [10, 5], [12, 5], [13, 4]]) g.set(x, y, '#6fbf5a');
  for (const [x, y] of [[2, 2], [13, 11], [12, 2], [3, 9]]) { g.set(x, y, '#ffffff'); g.set(x + 1, y, '#fff6c8'); g.set(x, y + 1, '#fff6c8'); }
  g.frame('#d99a1e');
});

tile('tnt_side', (g) => {
  g.noise(['#d8463a', '#cf4034', '#e04e41']);
  for (let x = 0; x < TILE; x++) if (x % 4 === 0) for (let y = 0; y < TILE; y++) g.set(x, y, '#a93b2d');
  g.rect(0, 5, 16, 6, '#f4ece0');
  g.rect(0, 5, 16, 1, '#d9cbb6'); g.rect(0, 10, 16, 1, '#d9cbb6');
  const L = { T: ['###', '.#.', '.#.', '.#.'], N: ['#..#', '##.#', '#.##', '#..#'] };
  let x0 = 2;
  for (const ch of 'TNT') {
    const rows = L[ch];
    rows.forEach((row, ry) => [...row].forEach((c, rx) => { if (c === '#') g.set(x0 + rx, 6 + ry, '#2a302c'); }));
    x0 += rows[0].length + 1;
  }
});
tile('tnt_top', (g) => {
  g.noise(['#d8463a', '#cf4034']);
  g.frame('#a93b2d');
  g.rect(6, 6, 4, 4, '#4a3a2e');
  g.rect(7, 7, 2, 2, '#2a302c');
  g.set(8, 5, '#6c5c4e'); g.set(9, 4, '#6c5c4e'); g.set(9, 3, '#ffb03a'); g.set(10, 2, '#ffe27a');
});
tile('tnt_bottom', (g) => { g.noise(['#a93b2d', '#9a3427']); g.frame('#7a2a20'); });
tile('pot_side', (g) => {
  g.noise(['#c77d62', '#bd7459', '#cf8a6e']);
  g.rect(0, 0, 16, 3, '#e09a7c');
  g.rect(0, 3, 16, 1, '#a9634b');
  for (let x = 1; x < 16; x += 4) g.rect(x, 7, 2, 2, '#e9b59c');
  g.rect(0, 15, 16, 1, '#8f523d');
  g.set(7, 0, '#6fae5a'); g.set(8, 0, '#6fae5a'); g.set(8, 1, '#5a9a4f');
});
tile('pot_top', (g) => {
  g.noise(['#5e3f28', '#664630', '#57391f']);
  g.frame('#c77d62'); g.frame('#a9634b', 1);
  const sprout = [[7, 9], [7, 8], [7, 7], [7, 6], [8, 6], [6, 5], [5, 5], [5, 4], [8, 5], [9, 4], [10, 4], [10, 3], [6, 4], [9, 5]];
  for (const [x, y] of sprout) g.set(x, y, y > 6 ? '#4f8a45' : '#7cc06a');
});
tile('warp_top', (g) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const swirl = Math.sin(a * 2 + d * 0.9);
    g.set(x, y, d > 7 ? '#4a3780' : swirl > 0.35 ? '#c9b3ff' : swirl > -0.2 ? '#8f6ad8' : '#6a4fb0');
  }
  g.set(7, 7, '#ffffff'); g.set(8, 8, '#ffffff'); g.set(7, 8, '#efe4ff'); g.set(8, 7, '#efe4ff');
});
tile('warp_side', (g) => {
  g.noise(['#7a58c2', '#7252b8', '#8360cc']);
  g.dots(['#efe4ff', '#c9b3ff'], 0.06);
  g.rect(0, 0, 16, 2, '#4a3780');
  g.rect(0, 14, 16, 2, '#4a3780');
});
tile('honey', (g) => {
  g.noise(['#f0b23a', '#eaa830', '#f5bd4a']);
  // honeycomb cells
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = Math.floor(y / 4), ox = r % 2 ? 2 : 0;
    if (y % 4 === 0 || (x + ox) % 4 === 0) g.set(x, y, '#c98a1c');
  }
  g.dots(['#ffe08a'], 0.06);
});
tile('jukebox_side', (g) => {
  g.noise(['#7a5438', '#6f4c33', '#83593c']);
  g.frame('#4f3222');
  g.rect(3, 3, 10, 10, '#3e2618');
  for (let y = 4; y < 12; y += 2) g.rect(4, y, 8, 1, '#5a3c28');
});
tile('jukebox_top', (g) => {
  g.noise(['#6c4a32', '#654530']);
  g.frame('#4f3222');
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 6) g.set(x, y, d < 1.6 ? '#e05a7a' : Math.floor(d * 2) % 2 ? '#2a2a2a' : '#3a3a3a');
  }
  g.set(5, 5, '#6a6a6a'); g.set(6, 4, '#6a6a6a');
});

const tileCanvases = {};
let atlasW = 0, atlasH = 0;

export function createAtlas() {
  createAtlasSizes();
  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(atlasW, atlasH);
  PAINTERS.forEach(([name, fn], i) => {
    const g = grid(seedOf(name));
    fn(g);
    // small canvas per tile for icons
    const tc = document.createElement('canvas');
    tc.width = tc.height = TILE;
    const tx = tc.getContext('2d');
    const ti = tx.createImageData(TILE, TILE);
    const rgb = g.px.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let k = 0; k < TILE * TILE; k++) { ti.data[k * 4] = rgb[k][0]; ti.data[k * 4 + 1] = rgb[k][1]; ti.data[k * 4 + 2] = rgb[k][2]; ti.data[k * 4 + 3] = 255; }
    tx.putImageData(ti, 0, 0);
    tileCanvases[name] = tc;
    const ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
    for (let y = -PAD; y < TILE + PAD; y++) for (let x = -PAD; x < TILE + PAD; x++) {
      const sx = Math.max(0, Math.min(TILE - 1, x)), sy = Math.max(0, Math.min(TILE - 1, y));
      const c = rgb[sy * TILE + sx];
      const o = ((oy + y + PAD) * atlasW + ox + x + PAD) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  });
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  return tex;
}

export function tileUV(tile) {
  if (!atlasW) createAtlasSizes();
  const col = tile % COLS, row = Math.floor(tile / COLS);
  const x0 = col * CELL + PAD, y0 = row * CELL + PAD;
  const u0 = x0 / atlasW, u1 = (x0 + TILE) / atlasW;
  const v1 = 1 - y0 / atlasH, v0 = 1 - (y0 + TILE) / atlasH;
  return [u0, v0, u1, v1];
}
function createAtlasSizes() {
  atlasW = COLS * CELL;
  const h = Math.ceil(PAINTERS.length / COLS) * CELL;
  atlasH = 1 << Math.ceil(Math.log2(h)); // power of two for clean mipmaps
}

// Which tile each block face uses: [top, side, bottom], plus a lit variant for powered blocks.
const T3 = (t, s = t, b = s) => ({ top: TILES[t], side: TILES[s], bottom: TILES[b] });
export const BLOCK_TILES = [];
const BT = {
  grass: T3('grass_top', 'grass_side', 'dirt'), dirt: T3('dirt'), stone: T3('stone'), log: T3('log_top', 'log_side', 'log_top'),
  leaves: T3('leaves'), planks: T3('planks'), sand: T3('sand'), brick: T3('brick'), carrot: T3('carrot_top', 'carrot_side', 'carrot_side'),
  candy: T3('candy_top', 'candy_side', 'dirt'), cloud: T3('cloud'), butter: T3('sunshine'), mint: T3('mint'), sky: T3('star'),
  snow: T3('snow'), rail: T3('white'), loop: T3('white'), wire: T3('white'), portal: T3('white'),
  generator: { ...T3('generator_top', 'generator_side', 'generator_top'), off: T3('generator_top', 'generator_off', 'generator_top') },
  piston: { ...T3('piston_face', 'piston_side', 'piston_back') }, head: T3('piston_face'),
  lamp: { ...T3('lamp_off'), on: T3('lamp_on') }, glassy: T3('ice'), pinkleaf: T3('blossom'), goldcarrot: T3('gold'),
  note: T3('note_top', 'note_side', 'note_top'), firework: T3('firework_top', 'firework_side', 'firework_side'),
  tnt: T3('tnt_top', 'tnt_side', 'tnt_bottom'), seed: T3('pot_top', 'pot_side', 'pot_side'), booster: T3('white'),
  warp: T3('warp_top', 'warp_side', 'warp_side'), honey: T3('honey'), jukebox: T3('jukebox_top', 'jukebox_side', 'jukebox_side'),
};
for (const b of BLOCKS) if (b) BLOCK_TILES[b.id] = BT[b.key] || T3('white');
export const WHITE_TILE = TILES.white;

/** A texture of a single named tile (used for the primed TNT entity). */
export function tileTexture(name) {
  const t = new THREE.CanvasTexture(tileCanvases[name]);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const PLANKS_TILE = TILES.planks;

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
  } else if (item.key === 'booster') {
    g.strokeStyle = '#8a6a4f'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(14 + i * 4, 52 - i * 12); g.lineTo(46 + i * 4, 52 - i * 12); g.stroke(); }
    g.strokeStyle = '#e2553f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(20, 56); g.lineTo(30, 10); g.moveTo(42, 56); g.lineTo(52, 10); g.stroke();
    g.fillStyle = '#ffd34d';
    g.beginPath(); g.moveTo(36, 14); g.lineTo(46, 30); g.lineTo(40, 30); g.lineTo(38, 44); g.lineTo(28, 28); g.lineTo(34, 28); g.closePath(); g.fill();
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
    const t = BLOCK_TILES[b.id];
    const lit = t.on && (item.key === 'lamp') ? t.on : t;
    const name = (i) => Object.keys(TILES).find((k) => TILES[k] === i);
    const top = tileCanvases[name(lit.top)], side = tileCanvases[name(lit.side)];
    // isometric cube built from the real block tiles, so icons match the world
    const cx = 32, cy = 31, w = 24, h = 13, d = 27;
    g.imageSmoothingEnabled = false;
    const face = (img, a, bb, cc, dd, e, f, poly, dark) => {
      g.save();
      g.beginPath(); poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      g.setTransform(a, bb, cc, dd, e, f);
      g.drawImage(img, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (dark) { g.fillStyle = `rgba(30,24,20,${dark})`; g.fillRect(0, 0, s, s); }
      g.restore();
    };
    const T = [[cx - w, cy - h], [cx, cy - 2 * h], [cx + w, cy - h], [cx, cy]];
    const L = [[cx - w, cy - h], [cx, cy], [cx, cy + d], [cx - w, cy - h + d]];
    const R = [[cx, cy], [cx + w, cy - h], [cx + w, cy - h + d], [cx, cy + d]];
    face(top, w / 16, -h / 16, w / 16, h / 16, cx - w, cy - h, T, 0);
    face(side, w / 16, h / 16, 0, d / 16, cx - w, cy - h, L, 0.12);
    face(side, w / 16, -h / 16, 0, d / 16, cx, cy, R, 0.3);
    g.strokeStyle = 'rgba(42,30,22,0.35)';
    g.lineWidth = 1;
    g.beginPath(); [T, L, R].forEach((p) => { p.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }); g.stroke();
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
