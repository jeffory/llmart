import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { build } from '../scripts/build.mjs';
import { GalleryError } from '../scripts/lib/gallery.mjs';

const SRC_DIR = path.resolve(import.meta.dirname, '../src');
const silent = () => {};

async function fixture(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'llmart-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'images'));
  for (const [file, content] of Object.entries(files)) {
    await writeFile(path.join(root, file), await content);
  }
  return { root, outDir: path.join(root, 'dist') };
}

const png = (width, height, background) =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

function readManifest(html) {
  const match = html.match(/<script type="application\/json" id="gallery-data">(.*?)<\/script>/s);
  assert.ok(match, 'index.html should embed the gallery data');
  return JSON.parse(match[1]);
}

const galleryError = (pattern) => (error) => error instanceof GalleryError && pattern.test(error.message);

test('build writes the page, optimized images, data and cache headers', async (t) => {
  const { root, outDir } = await fixture(t, {
    'images/Tall Piece - Self Portrait.png': png(1200, 2400, { r: 30, g: 160, b: 220 }),
    'images/small.png': png(300, 200, { r: 220, g: 40, b: 90 }),
    'images/small.txt': 'I am **small**.',
    'prompt.md': 'Paint {{model}} $& </script>',
    'gallery.json': JSON.stringify({ 'small.png': { title: 'Small One', order: 1 } }),
  });

  const manifest = await build({ root, outDir, log: silent });
  const pieces = readManifest(await readFile(path.join(outDir, 'index.html'), 'utf8'));
  assert.deepEqual(pieces, manifest);
  assert.deepEqual(pieces.map((p) => p.title), ['Small One', 'Tall Piece']);

  const [small, tall] = pieces;
  assert.equal(small.thoughtsHtml.trim(), '<p>I am <strong>small</strong>.</p>');
  assert.equal(small.promptText, 'Paint Small One $& </script>');
  assert.match(small.promptHtml, /Paint Small One \$&amp; &lt;\/script&gt;/);
  assert.equal(tall.subtitle, 'Self Portrait');
  assert.equal(tall.thoughtsHtml, null);
  assert.deepEqual([tall.width, tall.height], [800, 1600]);
  assert.deepEqual([small.width, small.height], [300, 200]);
  assert.match(tall.src, /^img\/tall-piece-self-portrait\.[0-9a-f]{8}\.webp$/);
  assert.match(tall.accent, /^#[0-9a-f]{6}$/);

  const meta = await sharp(path.join(outDir, tall.src)).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 800, 1600]);

  const headers = await readFile(path.join(outDir, '_headers'), 'utf8');
  assert.match(headers, /^\/img\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);

  const srcFiles = (await readdir(SRC_DIR)).filter((file) => file !== 'index.html');
  const outFiles = await readdir(outDir);
  for (const file of srcFiles) assert.ok(outFiles.includes(file), `${file} should be copied to dist/`);
});

test('build refuses unsupported image formats by name', async (t) => {
  const { root, outDir } = await fixture(t, { 'images/IMG_0042.HEIC': 'not really heic' });
  await assert.rejects(build({ root, outDir, log: silent }), galleryError(/images\/IMG_0042\.HEIC.*PNG, JPG, WebP or AVIF/));
});

test('build names an image it cannot decode', async (t) => {
  const { root, outDir } = await fixture(t, { 'images/broken.png': 'this is not a png' });
  await assert.rejects(build({ root, outDir, log: silent }), galleryError(/images\/broken\.png.*PNG, JPG, WebP or AVIF/));
});

test('build fails on a sidecar with no image', async (t) => {
  const { root, outDir } = await fixture(t, { 'images/ghost.thoughts.md': 'boo' });
  await assert.rejects(build({ root, outDir, log: silent }), galleryError(/images\/ghost\.thoughts\.md/));
});

test('build skips unrelated files in images/ and says so', async (t) => {
  const { root, outDir } = await fixture(t, {
    'images/a.png': png(10, 10, { r: 0, g: 0, b: 0 }),
    'images/a.xuan': 'painting source',
  });
  const lines = [];
  const manifest = await build({ root, outDir, log: (line) => lines.push(line) });
  assert.equal(manifest.length, 1);
  assert.ok(lines.some((line) => line.includes('images/a.xuan')), 'should log the skipped file');
});

test('build with no images writes an empty gallery', async (t) => {
  const { root, outDir } = await fixture(t, {});
  const manifest = await build({ root, outDir, log: silent });
  assert.deepEqual(manifest, []);
  assert.deepEqual(readManifest(await readFile(path.join(outDir, 'index.html'), 'utf8')), []);
});
