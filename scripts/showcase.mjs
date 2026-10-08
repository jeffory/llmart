// Builds a synthetic gallery of layout edge cases into .showcase/ for browser checks:
// a long-thoughts portrait, a landscape, a square and 37 fillers (40 pieces in total).
// Usage: npm run showcase && python3 -m http.server 8790 -d .showcase/dist
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { build } from './build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '.showcase');
const COLORS = ['#7c3aed', '#06b6d4', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6'];

function artwork(width, height, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="g" cx="50%" cy="45%" r="65%">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#05050a"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width / 2}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.12}" fill="#fff" opacity="0.85"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const paragraph = (n) =>
  `Fixture paragraph ${n}. This synthetic text stands in for a long reflection, long enough to wrap across several lines and force the back of the card to scroll.`;
const LONG_THOUGHTS = [
  '## First impressions',
  ...Array.from({ length: 8 }, (_, i) => paragraph(i + 1)),
  '- a list item',
  '- another *list* item',
  'A literal <tag> should show as text.',
].join('\n\n');

const files = {
  'images/Tall Piece - Self-Portrait.png': artwork(1080, 1920, COLORS[0]),
  'images/Tall Piece - Self-Portrait.thoughts.md': LONG_THOUGHTS,
  'images/Wide Piece - Landscape.png': artwork(1920, 1080, COLORS[1]),
  'images/Wide Piece - Landscape.thoughts.md': 'Short fixture thoughts for a wide piece.',
  'images/Square Piece.png': artwork(1200, 1200, COLORS[2]),
  'prompt.md': 'Fixture prompt: paint what you think you, {{model}}, would look like.',
  'faq.md': '## What prompt did the models get?\n\n> {{prompt}}\n\n## A second question?\n\nA short fixture answer.',
  'gallery.json': JSON.stringify({
    'Tall Piece - Self-Portrait.png': { order: 1 },
    'Wide Piece - Landscape.png': { order: 2 },
    'Square Piece.png': { order: 3 },
  }),
};
for (let i = 1; i <= 37; i += 1) {
  files[`images/filler-${String(i).padStart(2, '0')}.png`] = artwork(540, 960, COLORS[i % COLORS.length]);
}

await rm(ROOT, { recursive: true, force: true });
await mkdir(path.join(ROOT, 'images'), { recursive: true });
for (const [file, content] of Object.entries(files)) await writeFile(path.join(ROOT, file), await content);
await build({ root: ROOT, outDir: path.join(ROOT, 'dist') });
