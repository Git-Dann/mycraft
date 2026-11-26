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
  { id: 12, key: 'butter', name: 'Butter', top: '#e5c579', side: '#dcbb6c', bottom: '#cfae60', tile: T.SMOOTH, solid: true },
  { id: 13, key: 'mint', name: 'Mint', top: '#9fd8c0', side: '#94cdb5', bottom: '#86bfa7', tile: T.SMOOTH, solid: true },
  { id: 14, key: 'sky', name: 'Sky Blue', top: '#8daabb', side: '#829fb0', bottom: '#7691a2', tile: T.SMOOTH, solid: true },
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
];

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

export const isRail = (id) => id === BY_KEY.rail || id === BY_KEY.loop;

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
];
export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((i) => [i.key, i]));
export const itemName = (item) => item.name || BLOCKS[BY_KEY[item.block]].name;

export const DEFAULT_HOTBAR = ['grass', 'planks', 'stone', 'carrot', 'rail', 'loop', 'cart', 'key', 'wire'];
