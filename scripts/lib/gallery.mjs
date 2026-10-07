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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'piece';
}
