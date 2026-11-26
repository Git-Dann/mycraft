// "MyCraft" wordmark: every pixel is a little 3D block (front, top and side faces),
// grass caps on the letter tops, bunny ears peeking over the A, and a coaster track underneath.
// Built as SVG so it is crisp at any size and needs no fonts.

const GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.###.', '..#..', '..#..'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
};

const BODY = ['#c77d62', '#e5c579', '#8daabb', '#f4a9c8', '#9fd8c0'];
const GRASS = '#7fb069';
const OUTLINE = '#4a3a2e';

function mix(hex, f) {
  // f > 0 lightens towards white, f < 0 darkens towards black
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `rgb(${ch.join(',')})`;
}

/** Draws a word as extruded voxel letters. Returns { svg parts, width }. */
function voxelWord(word, { x0, y0, u, depth, colours, caps }) {
  const back = [], front = [];
  const letters = [];
  let x = x0;
  [...word].forEach((ch, li) => {
    const g = GLYPHS[ch];
    const body = colours[li % colours.length];
    letters.push({ ch, x, w: g[0].length * u });
    g.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        const px = x + rx * u, py = y0 + ry * u;
        const exposedTop = ry === 0 || g[ry - 1][rx] !== '#';
        const cap = caps && exposedTop;
        const face = cap ? GRASS : body;
        // top and right faces (extruded up-right)
        back.push(`<path d="M${px} ${py}l${depth} ${-depth}h${u}l${-depth} ${depth}z" fill="${mix(face, 0.35)}"/>`);
        back.push(`<path d="M${px + u} ${py}l${depth} ${-depth}v${u}l${-depth} ${depth}z" fill="${mix(body, -0.28)}"/>`);
        // front face with a soft bevel
        front.push(`<rect x="${px}" y="${py}" width="${u}" height="${u}" fill="${body}"/>`);
        front.push(`<rect x="${px}" y="${py + u - u * 0.16}" width="${u}" height="${u * 0.16}" fill="${mix(body, -0.12)}"/>`);
        if (cap) {
          // grass cap with a little drip
          front.push(`<rect x="${px}" y="${py}" width="${u}" height="${u * 0.34}" fill="${GRASS}"/>`);
          if ((rx + li) % 2 === 0) front.push(`<rect x="${px + u * 0.2}" y="${py + u * 0.34}" width="${u * 0.25}" height="${u * 0.18}" fill="${GRASS}"/>`);
        }
      }
    });
    x += g[0].length * u + u * 0.55;
  });
  return { back, front, width: x - x0 - u * 0.55, letters };
}

export function logoSVG({ title = 'MyCraft' } = {}) {
  const parts = [];
  // "MY": smaller cream blocks, tilted like a tag
  const my = voxelWord('MY', { x0: 0, y0: 0, u: 7, depth: 3, colours: ['#fbf6ee', '#fbf6ee'], caps: false });
  // "CRAFT": big blocks with grass caps
  const U = 12, D = 5, cx0 = 6, cy0 = 54;
  const craft = voxelWord('CRAFT', { x0: cx0, y0: cy0, u: U, depth: D, colours: BODY, caps: true });
  const textRight = cx0 + craft.width + D + 10;
  const width = textRight + 40; // room for the track hill and cart past the T

  // Outline: draw the CRAFT block faces offset in the outline colour for a sticker edge
  const outline = [];
  for (const s of [...craft.back, ...craft.front]) {
    if (s.startsWith('<rect') || s.startsWith('<path')) outline.push(s.replace(/fill="[^"]+"/, `fill="${OUTLINE}"`));
  }

  // Bunny ears peeking over the A
  const a = craft.letters[2];
  const ax = a.x + a.w / 2 + D / 2;
  const ear = (dx, rot) => `<g transform="translate(${ax + dx} ${cy0 - D - 2}) rotate(${rot})">
      <ellipse cx="0" cy="-14" rx="7.5" ry="16" fill="${OUTLINE}"/>
      <ellipse cx="0" cy="-14" rx="5.8" ry="14.3" fill="#fbf6ee"/>
      <ellipse cx="0" cy="-13" rx="2.6" ry="9.5" fill="#f4a9c8"/></g>`;
  parts.push(ear(-8, -16), ear(8, 14));

  // MY tag above the C and R
  parts.push(`<g transform="translate(${cx0 + 4} 8) rotate(-7)">
    <rect x="-7" y="-6" width="${my.width + 17}" height="${5 * 7 + 13}" rx="9" fill="${OUTLINE}"/>
    <rect x="-5" y="-4" width="${my.width + 13}" height="${5 * 7 + 9}" rx="7" fill="#c77d62"/>
    <g transform="translate(0 4)">${my.back.join('')}${my.front.join('')}</g></g>`);

  // CRAFT with a chunky outline
  parts.push(`<g transform="translate(-2.2 0)">${outline.join('')}</g><g transform="translate(2.2 0)">${outline.join('')}</g>`);
  parts.push(`<g transform="translate(0 2.6)">${outline.join('')}</g><g transform="translate(0 -2.2)">${outline.join('')}</g>`);
  parts.push(craft.back.join(''), craft.front.join(''));

  // Coaster track under the word, rising into a hill at the right with a little cart
  const ty = cy0 + 5 * U + 14;
  const right = width - 4;
  const path = `M4 ${ty} H${textRight - 6} C${textRight + 14} ${ty} ${textRight + 14} ${ty - 26} ${right} ${ty - 30}`;
  const sleepers = [];
  for (let sx = 8; sx < textRight - 8; sx += 9) sleepers.push(`<rect x="${sx}" y="${ty - 1}" width="4" height="7" rx="1" fill="#8a6a4f"/>`);
  parts.push(sleepers.join(''));
  parts.push(`<path d="${path}" fill="none" stroke="${OUTLINE}" stroke-width="5.5" stroke-linecap="round"/>`);
  parts.push(`<path d="${path}" fill="none" stroke="#c9ced1" stroke-width="2.6" stroke-linecap="round"/>`);
  parts.push(`<g transform="translate(${right - 12} ${ty - 41}) rotate(-22)">
    <rect x="-13" y="-2" width="26" height="13" rx="4" fill="${OUTLINE}"/>
    <rect x="-11" y="0" width="22" height="9" rx="3" fill="#c77d62"/>
    <rect x="-11" y="0" width="22" height="3" rx="1.5" fill="#e5c579"/>
    <circle cx="-6" cy="12" r="3" fill="${OUTLINE}"/><circle cx="6" cy="12" r="3" fill="${OUTLINE}"/></g>`);

  const height = ty + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -10 ${width + 10} ${height + 12}" role="img" aria-label="${title}"><title>${title}</title>${parts.join('')}</svg>`;
}
