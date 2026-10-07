// Builds dist/ from images/, gallery.json, prompt.md and src/.
// Usage: node scripts/build.mjs [root] [outDir]
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { classifyFiles, GalleryError, htmlSafeJson, parseOverrides, pickAccent, planGallery } from './lib/gallery.mjs';
import { renderMarkdown } from './lib/markdown.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_EDGE = 1600;
const WEBP_QUALITY = 82;
// Part of every image hash, so changing encoder settings busts caches.
const ENCODER_ID = `webp:q${WEBP_QUALITY}:edge${MAX_EDGE}:v1`;
const DATA_PLACEHOLDER = '<!-- GALLERY_DATA -->';
const HEADERS = '/img/*\n  Cache-Control: public, max-age=31536000, immutable\n';

export async function build({
  root = PROJECT_ROOT,
  outDir = path.join(root, 'dist'),
  srcDir = path.join(PROJECT_ROOT, 'src'),
  log = console.log,
} = {}) {
  const imagesDir = path.join(root, 'images');
  const { images, sidecars, unsupported, ignored } = classifyFiles(await listFiles(imagesDir));
  if (unsupported.length > 0) {
    const files = unsupported.map((file) => `images/${file}`).join(', ');
    throw new GalleryError(`Unsupported image format: ${files}. Convert to PNG, JPG, WebP or AVIF.`);
  }
  for (const file of ignored) log(`  skipping images/${file} (not an image or a .txt/.thoughts.md/.prompt.md)`);

  const pieces = planGallery({
    images,
    overrides: parseOverrides(await readOptional(path.join(root, 'gallery.json')), images),
    sidecars: await Promise.all(
      sidecars.map(async (sidecar) => ({ ...sidecar, text: await readFile(path.join(imagesDir, sidecar.file), 'utf8') })),
    ),
    sharedPrompt: await readOptional(path.join(root, 'prompt.md')),
  });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'img'), { recursive: true });

  const manifest = [];
  for (const piece of pieces) {
    const image = await processImage(path.join(imagesDir, piece.file), piece.slug, outDir);
    manifest.push({
      slug: piece.slug,
      title: piece.title,
      subtitle: piece.subtitle,
      stealth: piece.stealth,
      ...image,
      promptHtml: piece.prompt && renderMarkdown(piece.prompt),
      promptText: piece.prompt,
      thoughtsHtml: piece.thoughts && renderMarkdown(piece.thoughts),
    });
    log(`  ✓ images/${piece.file} → ${image.src} (${image.width}×${image.height})`);
  }

  const template = await readFile(path.join(srcDir, 'index.html'), 'utf8');
  if (!template.includes(DATA_PLACEHOLDER)) throw new Error(`src/index.html is missing ${DATA_PLACEHOLDER}`);
  const dataTag = `<script type="application/json" id="gallery-data">${htmlSafeJson(manifest)}</script>`;
  // Function replacer: "$&" in the data must not be treated as a replacement pattern.
  await writeFile(path.join(outDir, 'index.html'), template.replace(DATA_PLACEHOLDER, () => dataTag));

  const staticFiles = (await listFiles(srcDir)).filter((file) => file !== 'index.html');
  await Promise.all(staticFiles.map((file) => copyFile(path.join(srcDir, file), path.join(outDir, file))));
  await writeFile(path.join(outDir, '_headers'), HEADERS);

  log(`Built ${manifest.length} piece${manifest.length === 1 ? '' : 's'} → ${path.relative(process.cwd(), outDir) || '.'}`);
  return manifest;
}

async function processImage(file, slug, outDir) {
  const source = await readFile(file);
  try {
    const hash = createHash('sha256').update(ENCODER_ID).update(source).digest('hex').slice(0, 8);
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(source)
      .rotate()
      .flatten({ background: '#000000' })
      .resize(48, 48, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const src = `img/${slug}.${hash}.webp`;
    await writeFile(path.join(outDir, src), data);
    return {
      src,
      width: info.width,
      height: info.height,
      accent: pickAccent(thumbnail.data, thumbnail.info.channels),
    };
  } catch (error) {
    throw new GalleryError(
      `Could not process images/${path.basename(file)} (${error.message}). Re-export it as PNG, JPG, WebP or AVIF.`,
    );
  }
}

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [rootArg, outArg] = process.argv.slice(2);
  build({
    ...(rootArg && { root: path.resolve(rootArg) }),
    ...(outArg && { outDir: path.resolve(outArg) }),
  }).catch((error) => {
    console.error(error instanceof GalleryError ? `\n✖ ${error.message}\n` : error);
    process.exitCode = 1;
  });
}
