// Pure gallery logic: every decision the build makes that doesn't touch the filesystem.

// .jfif/.jpe are JPEGs under the names browsers sometimes "Save image as".
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.jfif', '.jpe', '.webp', '.avif'];
// Image types people are likely to upload that the pipeline doesn't accept.
const UNSUPPORTED_IMAGE_EXTENSIONS = ['.heic', '.heif', '.gif', '.tif', '.tiff', '.bmp', '.svg'];
// Text files next to an image: `<name>.txt` and `<name>.thoughts.md` are the model's thoughts.
const SIDECAR_PATTERN = /^(.+)\.(thoughts\.md|prompt\.md|txt)$/i;
const SIDECAR_KINDS = { 'thoughts.md': 'thoughts', 'prompt.md': 'prompt', txt: 'thoughts' };

export class GalleryError extends Error {
  name = 'GalleryError';
}

export function splitExtension(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { name: filename, ext: '' };
  return { name: filename.slice(0, dot), ext: filename.slice(dot).toLowerCase() };
}

export function classifyFiles(filenames) {
  const images = [];
  const sidecars = [];
  const unsupported = [];
  const ignored = [];
  for (const file of filenames) {
    if (file.startsWith('.')) continue; // .DS_Store, .gitkeep
    const { ext } = splitExtension(file);
    const sidecar = file.match(SIDECAR_PATTERN);
    if (IMAGE_EXTENSIONS.includes(ext)) images.push(file);
    else if (sidecar) sidecars.push({ file, name: sidecar[1], kind: SIDECAR_KINDS[sidecar[2].toLowerCase()] });
    else if (UNSUPPORTED_IMAGE_EXTENSIONS.includes(ext)) unsupported.push(file);
    else ignored.push(file);
  }
  return { images, sidecars, unsupported, ignored };
}

export function captionFromFilename(filename) {
  let { name } = splitExtension(filename);
  if (!name.includes(' ')) {
    name = name
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/(^|\s)(\S)/g, (_, space, letter) => space + letter.toUpperCase());
  }
  const separator = name.indexOf(' - ');
  if (separator === -1) return { title: name.trim(), subtitle: null };
  return {
    title: name.slice(0, separator).trim(),
    subtitle: name.slice(separator + 3).trim() || null,
  };
}

export function slugify(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'piece';
}

// `model` names the model for {{model}} in prompts when the title isn't just the model's name.
// `stealth` marks a model tested anonymously before release; viewers can hide those pieces.
const OVERRIDE_TYPES = { title: 'string', subtitle: 'string', model: 'string', order: 'number', stealth: 'boolean' };
const MODEL_PLACEHOLDER = /\{\{\s*model\s*\}\}/g;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function cleanText(text) {
  if (text == null) return null;
  return text.replace(/^\uFEFF/, '').trim() || null;
}

export function parseOverrides(text, imageFiles) {
  const source = cleanText(text);
  if (source === null) return {};
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new GalleryError(`gallery.json is not valid JSON (${error.message}).`);
  }
  if (!isPlainObject(data)) {
    throw new GalleryError('gallery.json must be an object keyed by image filename, e.g. { "my-art.png": { "title": "My Art" } }.');
  }
  for (const [file, entry] of Object.entries(data)) {
    if (!imageFiles.includes(file)) {
      const match = imageFiles.find((image) => image.toLowerCase() === file.toLowerCase());
      const hint = match ? ` Did you mean "${match}"?` : '';
      throw new GalleryError(`gallery.json mentions "${file}", but images/ has no such file.${hint}`);
    }
    if (!isPlainObject(entry)) {
      throw new GalleryError(`gallery.json → "${file}" must be an object like { "title": "…" }.`);
    }
    for (const [key, value] of Object.entries(entry)) {
      const type = OVERRIDE_TYPES[key];
      if (!type) {
        throw new GalleryError(`gallery.json → "${file}": unknown field "${key}" (allowed: ${Object.keys(OVERRIDE_TYPES).join(', ')}).`);
      }
      if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) {
        throw new GalleryError(`gallery.json → "${file}": "${key}" must be a ${type}.`);
      }
    }
  }
  return data;
}

export function planGallery({ images, overrides = {}, sidecars = [], sharedPrompt = null }) {
  const imageNames = new Set(images.map((file) => splitExtension(file).name));
  const texts = new Map();
  const sources = new Map();
  for (const { file, name, kind, text } of sidecars) {
    if (!imageNames.has(name)) {
      throw new GalleryError(
        `images/${file} has no matching image — expected an image named "${name}" (.png, .jpg, .jpeg, .webp or .avif) next to it.`,
      );
    }
    const source = `${name}\0${kind}`;
    if (sources.has(source)) {
      throw new GalleryError(`images/${sources.get(source)} and images/${file} are both ${kind} for "${name}" — keep one.`);
    }
    sources.set(source, file);
    texts.set(name, { ...texts.get(name), [kind]: text });
  }

  const shared = cleanText(sharedPrompt);
  const pieces = images.map((file) => {
    const caption = captionFromFilename(file);
    const override = overrides[file] ?? {};
    const own = texts.get(splitExtension(file).name) ?? {};
    const title = override.title?.trim() || caption.title;
    const subtitle = override.subtitle === undefined ? caption.subtitle : override.subtitle.trim() || null;
    const prompt = cleanText(own.prompt) ?? shared;
    const model = override.model?.trim() || title;
    return {
      file,
      title,
      subtitle,
      order: override.order ?? null,
      stealth: override.stealth === true,
      // Function replacer so "$&"-style sequences in titles are inserted literally.
      prompt: prompt && prompt.replace(MODEL_PLACEHOLDER, () => model),
      thoughts: cleanText(own.thoughts),
    };
  });

  pieces.sort(comparePieces);
  assignSlugs(pieces);
  return pieces.map(({ order, ...piece }) => piece);
}

function comparePieces(a, b) {
  if (a.order !== b.order) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    return a.order - b.order;
  }
  return collator.compare(a.file, b.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}

function assignSlugs(pieces) {
  const used = new Set();
  for (const piece of pieces) {
    const base = slugify(splitExtension(piece.file).name);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    piece.slug = slug;
  }
}

const NEUTRAL_ACCENT = '#8c8c8c';

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// Picks a glow colour: the dominant vivid hue, lifted to a consistent lightness.
export function pickAccent(pixels, channels = 3) {
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    count += 1;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.15 || l > 0.85 || s < 0.25) continue;
    const bucket = buckets[Math.floor(h / 30) % 12];
    bucket.weight += s;
    bucket.r += r * s;
    bucket.g += g * s;
    bucket.b += b * s;
  }
  if (count === 0) return NEUTRAL_ACCENT;
  const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top));
  if (best.weight === 0) {
    // Nothing vivid: keep the image's own muted hue rather than inventing one.
    const [h, s] = rgbToHsl(sumR / count, sumG / count, sumB / count);
    return hslToHex(h, s, 0.55);
  }
  const [h, s] = rgbToHsl(best.r / best.weight, best.g / best.weight, best.b / best.weight);
  return hslToHex(h, Math.max(s, 0.5), 0.55);
}

export function htmlSafeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
