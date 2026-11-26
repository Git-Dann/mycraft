// "BLOCKHOP" voxel wordmark, built from pixel glyphs as an SVG so it is crisp at any size and needs no fonts.

const GLYPHS = {
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
};

const COLOURS = ['#c77d62', '#e5c579', '#7fb069', '#8daabb', '#f4a9c8', '#c77d62', '#e5c579', '#7fb069'];

function lighten(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(Math.min(255, c + (255 - c) * f));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function logoSVG({ word = 'BLOCKHOP', ears = true, title = 'Blockhop' } = {}) {
  const u = 10; // pixel size
  const depth = 5;
  const gap = 4;
  const letters = word.split('');
  const top = ears ? 34 : 6;
  let x = 6;
  const back = [], front = [];
  const positions = [];
  letters.forEach((ch, li) => {
    const g = GLYPHS[ch];
    const col = COLOURS[li % COLOURS.length];
    const w = g[0].length;
    positions.push(x);
    g.forEach((row, ry) => {
      for (let rx = 0; rx < w; rx++) {
        if (row[rx] !== '#') continue;
        const px = x + rx * u, py = top + ry * u;
        back.push(`<rect x="${px + depth}" y="${py + depth}" width="${u}" height="${u}" fill="#4a3a2e"/>`);
        front.push(`<rect x="${px}" y="${py}" width="${u}" height="${u}" fill="${col}"/>`);
        front.push(`<rect x="${px}" y="${py}" width="${u}" height="2.5" fill="${lighten(col, 0.45)}"/>`);
      }
    });
    x += w * u + gap + (ch === 'K' ? 10 : 0);
  });
  const width = x + depth + 4;
  const height = top + 5 * u + depth + 6;
  let earSvg = '';
  if (ears) {
    // Bunny ears on the O of HOP
    const ox = positions[6] + 2.5 * u;
    const ear = (dx, rot) => `
      <g transform="translate(${ox + dx} ${top + 4}) rotate(${rot})">
        <ellipse cx="0" cy="-15" rx="7.5" ry="17" fill="#4a3a2e" transform="translate(3 3)"/>
        <ellipse cx="0" cy="-15" rx="7.5" ry="17" fill="#fbf6ee"/>
        <ellipse cx="0" cy="-14" rx="3.4" ry="11" fill="#f4a9c8"/>
      </g>`;
    earSvg = ear(-10, -14) + ear(10, 12);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${earSvg}${back.join('')}${front.join('')}</svg>`;
}
