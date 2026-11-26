// Block and item definitions. Block ids are bytes stored in the world's Uint8Array.
// Texture tiles index into the procedural atlas built in textures.js.

export const T = { GRAIN: 0, PLANKS: 1, BRICK: 2, LEAVES: 3, BARK: 4, SPECKLE: 5, GLOW: 6, SMOOTH: 7 };

export const AIR = 0;

// shape: cube | rail | loop | wire | portal | head
export const BLOCKS = [
  null,
  { id: 1, key: 'grass', name: 'Grass', top: '#7fb069', side: '#9a7451', bottom: '#8a6646', sideTop: '#7fb069', tile: T.GRAIN, solid: true },
  { id: 2, key: 'dirt', name: 'Dirt', top: '#9a7451', side: '#9a7451', bottom: '#8a6646', tile: T.GRAIN, solid: true },
  { id: 3, key: 'stone', name: 'Stone', top: '#9c9e98', side: '#8f918b', bottom: '#83857f', tile: T.SPECKLE, solid: true },
  { id: 4, key: 'log', name: 'Log', top: '#b88a5c', side: '#7a5a3f', bottom: '#b88a5c', tile: T.BARK, topTile: T.GRAIN, solid: true },
  { id: 5, key: 'leaves', name: 'Leaves', top: '#5f8f57', side: '#56834f', bottom: '#4d7647', tile: T.LEAVES, solid: true },
  { id: 6, key: 'planks', name: 'Planks', top: '#c99a66', side: '#c08f5c', bottom: '#b38452', tile: T.PLANKS, solid: true },
  { id: 7, key: 'sand', name: 'Sand', top: '#e8d5a6', side: '#e1cc9b', bottom: '#d6c08e', tile: T.GRAIN, solid: true },
  { id: 8, key: 'brick', name: 'Brick', top: '#c77d62', side: '#c77d62', bottom: '#a9634b', tile: T.BRICK, solid: true },
  { id: 9, key: 'carrot', name: 'Carrot', top: '#f08a3c', side: '#ef8233', bottom: '#d9702a', tile: T.BARK, solid: true },
  { id: 10, key: 'candy', name: 'Bunny Grass', top: '#f4a9c8', side: '#e8c9a8', bottom: '#dcb995', sideTop: '#f4a9c8', tile: T.GRAIN, solid: true },
  { id: 11, key: 'cloud', name: 'Cloud', top: '#ffffff', side: '#f3f1f6', bottom: '#e8e4ee', tile: T.SMOOTH, solid: true },
  { id: 12, key: 'butter', name: 'Sunshine', top: '#e5c579', side: '#dcbb6c', bottom: '#cfae60', tile: T.SMOOTH, solid: true },
  { id: 13, key: 'mint', name: 'Mint', top: '#9fd8c0', side: '#94cdb5', bottom: '#86bfa7', tile: T.SMOOTH, solid: true },
  { id: 14, key: 'sky', name: 'Star Block', top: '#8daabb', side: '#829fb0', bottom: '#7691a2', tile: T.SMOOTH, solid: true },
  { id: 15, key: 'snow', name: 'Snow', top: '#f7f6f2', side: '#eeece6', bottom: '#e2e0da', tile: T.GRAIN, solid: true },
  { id: 16, key: 'rail', name: 'Track', shape: 'rail', top: '#8a6a4f', side: '#6c5240', bottom: '#6c5240', tile: T.PLANKS, solid: false },
  { id: 17, key: 'loop', name: 'Loop', shape: 'loop', top: '#e5c579', side: '#c9a85a', bottom: '#c9a85a', tile: T.SMOOTH, solid: false },
  { id: 18, key: 'generator', name: 'Generator', top: '#e05a47', side: '#c94a39', bottom: '#a93b2d', tile: T.GLOW, solid: true },
  { id: 19, key: 'wire', name: 'Wire', shape: 'wire', top: '#7a2e25', side: '#7a2e25', bottom: '#7a2e25', on: '#ff5a3d', tile: T.SMOOTH, solid: false },
  { id: 20, key: 'piston', name: 'Piston', top: '#b9a27e', side: '#8e979b', bottom: '#7c8589', tile: T.PLANKS, solid: true },
  { id: 21, key: 'head', name: 'Piston Head', shape: 'head', top: '#b9a27e', side: '#a48d6a', bottom: '#a48d6a', tile: T.PLANKS, solid: true, hidden: true },
  { id: 22, key: 'lamp', name: 'Lamp', top: '#7c6a50', side: '#7c6a50', bottom: '#6a5a44', on: '#ffd76a', tile: T.GLOW, solid: true },
  { id: 23, key: 'portal', name: 'Portal', shape: 'portal', top: '#ff8fd0', side: '#ff8fd0', bottom: '#ff8fd0', tile: T.SMOOTH, solid: false, hidden: true },
  { id: 24, key: 'glassy', name: 'Ice', top: '#cfe8f2', side: '#c4dfeb', bottom: '#b7d3df', tile: T.SMOOTH, solid: true },
  { id: 25, key: 'pinkleaf', name: 'Blossom', top: '#f6b7cf', side: '#eeaac4', bottom: '#e09ab6', tile: T.LEAVES, solid: true },
  { id: 26, key: 'goldcarrot', name: 'Golden Carrot', top: '#ffd34d', side: '#f5b82e', bottom: '#e09d1c', tile: T.GLOW, solid: true, hidden: true, glow: true },
  { id: 27, key: 'note', name: 'Note Block', top: '#8a5a3c', side: '#7a4e33', bottom: '#6a432c', on: '#b07a52', tile: T.GLOW, solid: true },
  { id: 28, key: 'firework', name: 'Fireworks', top: '#e05a7a', side: '#c94a69', bottom: '#a93b55', tile: T.BRICK, solid: true },
  { id: 29, key: 'tnt', name: 'TNT', top: '#d8463a', side: '#d8463a', bottom: '#a93b2d', tile: T.BRICK, solid: true },
  { id: 30, key: 'seed', name: 'Tree Seed', top: '#7cc06a', side: '#c77d62', bottom: '#a9634b', tile: T.SMOOTH, solid: true },
  { id: 31, key: 'booster', name: 'Booster Track', shape: 'rail', top: '#e2553f', side: '#c94a39', bottom: '#c94a39', tile: T.SMOOTH, solid: false },
  { id: 32, key: 'warp', name: 'Warp Pad', top: '#8f6ad8', side: '#7a58c2', bottom: '#5e4499', tile: T.GLOW, solid: true },
  { id: 33, key: 'honey', name: 'Honey', top: '#f0b23a', side: '#e5a42e', bottom: '#cf8f22', tile: T.SMOOTH, solid: true },
  { id: 34, key: 'jukebox', name: 'Jukebox', top: '#6c4a32', side: '#7a5438', bottom: '#5a3c28', tile: T.PLANKS, solid: true },
];

// Array position must equal the block id
for (let i = 1; i < BLOCKS.length; i++) if (BLOCKS[i].id !== i) throw new Error(`BLOCKS out of order at ${i}`);

export const BY_KEY = {};
for (const b of BLOCKS) if (b) BY_KEY[b.key] = b.id;

// Fast lookup tables
export const SOLID = new Uint8Array(256);
export const CUBE = new Uint8Array(256); // full opaque cube: hides neighbour faces, casts AO
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  CUBE[b.id] = !b.shape || b.shape === 'head' ? 1 : 0;
}
CUBE[BY_KEY.head] = 0;

export const isRail = (id) => id === BY_KEY.rail || id === BY_KEY.loop || id === BY_KEY.booster;

// Items in the creative inventory, in display order. Tools are not blocks.
export const ITEMS = [
  { key: 'grass', block: 'grass' },
  { key: 'dirt', block: 'dirt' },
  { key: 'stone', block: 'stone' },
  { key: 'log', block: 'log' },
  { key: 'planks', block: 'planks' },
  { key: 'leaves', block: 'leaves' },
  { key: 'sand', block: 'sand' },
  { key: 'brick', block: 'brick' },
  { key: 'snow', block: 'snow' },
  { key: 'glassy', block: 'glassy' },
  { key: 'carrot', block: 'carrot' },
  { key: 'candy', block: 'candy' },
  { key: 'pinkleaf', block: 'pinkleaf' },
  { key: 'cloud', block: 'cloud' },
  { key: 'butter', block: 'butter' },
  { key: 'mint', block: 'mint' },
  { key: 'sky', block: 'sky' },
  { key: 'rail', block: 'rail' },
  { key: 'loop', block: 'loop' },
  { key: 'cart', tool: true, name: 'Coaster Cart' },
  { key: 'key', tool: true, name: 'Portal Key' },
  { key: 'generator', block: 'generator' },
  { key: 'wire', block: 'wire' },
  { key: 'piston', block: 'piston' },
  { key: 'lamp', block: 'lamp' },
  { key: 'note', block: 'note' },
  { key: 'firework', block: 'firework' },
  { key: 'tnt', block: 'tnt' },
  { key: 'seed', block: 'seed' },
  { key: 'booster', block: 'booster' },
  { key: 'warp', block: 'warp' },
  { key: 'honey', block: 'honey' },
  { key: 'jukebox', block: 'jukebox' },
];
export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((i) => [i.key, i]));
export const itemName = (item) => item.name || BLOCKS[BY_KEY[item.block]].name;

export const DEFAULT_HOTBAR = ['grass', 'planks', 'stone', 'carrot', 'rail', 'loop', 'cart', 'key', 'wire'];

// Each special block's power, shown on its card and when it's picked. Plain building blocks have none.
export const POWERS = {
  cloud: ['Bouncy', 'Bouncy! Land on it to boing up high'],
  glassy: ['Slippery', 'Slippery! You slide when you walk on it'],
  mint: ['Speed', 'Zoom! Walk on it to go super fast'],
  sand: ['Falls', 'Falls down if nothing is under it'],
  snow: ['Crunchy', 'Crunchy footsteps'],
  leaves: ['Butterflies', 'Break it and a butterfly might fly out'],
  pinkleaf: ['Petals', 'Break it for a shower of petals'],
  butter: ['Glows', 'Glows like the sun, even at night'],
  sky: ['Twinkles', 'Twinkles with stars and glows at night'],
  carrot: ['Bunny food', 'Tap a bunny while holding this to feed it. Also builds portal frames'],
  generator: ['Tap: on/off', 'Makes power for Wire. Tap it to switch on or off'],
  wire: ['Carries power', 'Carries power from a Generator'],
  lamp: ['Lights up', 'Lights up when Wire powers it'],
  piston: ['Pushes', 'Pushes blocks when Wire powers it'],
  note: ['Tap to play', 'Tap it, walk on it or power it to play a note'],
  firework: ['Tap to launch', 'Tap it, jump on it or power it to launch a firework'],
  rail: ['Ride it', 'Build a track, then ride it with the Cart'],
  loop: ['Loop the loop', 'Put it in a straight track for a loop the loop'],
  cart: ['Ride', 'Tap a piece of track to ride it'],
  key: ['Activates portals', 'The portal activator: use it inside a Carrot frame to open a portal'],
  tnt: ['Tap to light', 'Tap it to light the fuse. Kaboom! Undo puts everything back'],
  seed: ['Grows a tree', 'Plant it and watch a tree grow'],
  booster: ['Speeds up', 'Put it in your track to speed the coaster up'],
  warp: ['Teleports', 'Build two, then step on one to warp to the other'],
  honey: ['Sticky', 'Sticky! You walk slowly and jump low'],
  jukebox: ['Tap: new song', 'Tap it to change the music'],
};
