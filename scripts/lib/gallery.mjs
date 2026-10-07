// Pure gallery logic: every decision the build makes that doesn't touch the filesystem.

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
// Image types people are likely to upload that the pipeline doesn't accept.
const UNSUPPORTED_IMAGE_EXTENSIONS = ['.heic', '.heif', '.gif', '.tif', '.tiff', '.bmp', '.svg'];
const SIDECAR_PATTERN = /^(.+)\.(thoughts|prompt)\.md$/i;

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
    else if (sidecar) sidecars.push({ file, name: sidecar[1], kind: sidecar[2].toLowerCase() });
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

const OVERRIDE_TYPES = { title: 'string', subtitle: 'string', order: 'number' };
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
        throw new GalleryError(`gallery.json → "${file}": unknown field "${key}" (allowed: title, subtitle, order).`);
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
  for (const { file, name, kind, text } of sidecars) {
    if (!imageNames.has(name)) {
      throw new GalleryError(
        `images/${file} has no matching image — expected an image named "${name}" (.png, .jpg, .jpeg, .webp or .avif) next to it.`,
      );
    }
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
    return {
      file,
      title,
      subtitle,
      order: override.order ?? null,
      // Function replacer so "$&"-style sequences in titles are inserted literally.
      prompt: prompt && prompt.replace(MODEL_PLACEHOLDER, () => title),
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
