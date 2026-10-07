# llmart Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimalist, dark, Apple-styled one-at-a-time gallery of AI self-portraits (reflection, caption, prompt sheet, flip-to-read thoughts), built from a folder of images and deployed as a static-assets Cloudflare Worker from GitHub.

**Architecture:** A Node build script (`scripts/build.mjs`) reads `images/`, optional sidecar Markdown, `prompt.md` and `gallery.json`; pure decision logic lives in `scripts/lib/gallery.mjs` (unit tested). The build writes `dist/`: optimized WebP images, `index.html` with the gallery manifest embedded as JSON, the static CSS/JS, and `_headers`. A vanilla-JS page (`src/gallery.js`) renders one slide at a time. `wrangler.jsonc` declares an assets-only Worker serving `dist/`.

**Tech Stack:** Node ≥ 22 (ESM, `node:test`), `sharp` (image processing), `marked` (Markdown), `wrangler` (Workers), vanilla HTML/CSS/JS, Playwright MCP for browser verification.

**Spec:** `docs/superpowers/specs/2026-10-07-llmart-gallery-design.md`

## Global Constraints

- Node ≥ 22; ESM everywhere (`"type": "module"`).
- Dev dependencies only: `sharp`, `marked`, `wrangler`. No framework, no runtime Worker script, no other packages.
- Supported image formats: `.png .jpg .jpeg .webp .avif` (case-insensitive). Output: WebP quality 82, long edge ≤ 1600px, never upscaled.
- Output image path: `dist/img/<slug>.<hash8>.webp`; `_headers`: `/img/*` → `Cache-Control: public, max-age=31536000, immutable`.
- Worker name `llmart`; assets directory `./dist`.
- Dark theme only. Fonts: system San Francisco → Inter (Google Fonts); serif `ui-serif` ("New York") → Newsreader (Google Fonts).
- Motion easing `cubic-bezier(0.25, 1, 0.5, 1)`, slide transition ~650ms; `prefers-reduced-motion` → crossfade, instant flip.
- Layout must work at 390px wide with 16px gutters and no horizontal scroll.
- Never fabricate content: prompts and thoughts come only from the owner. Test/showcase fixtures are clearly synthetic and never land in `images/`.

## Review Focus

1. **Long thoughts** (many paragraphs, headings, lists) → the back of the card scrolls inside the card with fade edges, the signature is reachable, swipe/keys still navigate. *(Task 6, showcase browser check)*
2. **Landscape or square images** → card becomes width-limited, reflection and caption keep proportion, desktop side buttons never overlap the card, nothing scrolls horizontally on phones. *(Task 5, showcase browser check)*
3. **Unsupported or broken uploads** (iPhone `.HEIC`, `.gif`, a text file saved as `.png`) → build fails naming the exact file and the accepted formats. *(Task 4 tests)*
4. **Special characters in text** (`$&`, `$1`, `</script>`, `<the model name>`) → appear verbatim on the page; nothing breaks or vanishes. *(Task 2 + Task 4 tests)*
5. **Case-mismatched names in `gallery.json`** (`Kimi-K3.png` vs `kimi-k3.png`) → build fails with a "Did you mean" hint. *(Task 2 test)*

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `package-lock.json` | Scripts (`build`, `dev`, `deploy`, `test`, `showcase`) + dev deps |
| `wrangler.jsonc` | Assets-only Worker config |
| `.node-version` | Node 22 for Cloudflare Workers Builds |
| `scripts/lib/gallery.mjs` | Pure logic: file classification, captions, slugs, override validation, gallery planning, accent colour, HTML-safe JSON |
| `scripts/lib/markdown.mjs` | Markdown → HTML with raw HTML escaped |
| `scripts/build.mjs` | Build orchestration: filesystem, sharp, writes `dist/` |
| `scripts/showcase.mjs` | Synthetic edge-case gallery for browser checks (`.showcase/`, git-ignored) |
| `src/index.html` | Page shell with `<!-- GALLERY_DATA -->` placeholder |
| `src/styles.css` | All styling |
| `src/gallery.js` | All page behaviour |
| `test/*.test.mjs` | `node:test` suites |
| `gallery.json`, `prompt.md`, `images/` | Content |
| `README.md` | How to add a piece, local dev, deployment |

---

### Task 1: Scaffold + filename rules

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `.node-version`, `scripts/lib/gallery.mjs`, `test/filenames.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces (in `scripts/lib/gallery.mjs`):
  - `class GalleryError extends Error` — user-facing build errors.
  - `IMAGE_EXTENSIONS: string[]`
  - `splitExtension(filename: string): { name: string, ext: string }` — `ext` lowercased incl. dot, `''` if none.
  - `classifyFiles(filenames: string[]): { images: string[], sidecars: {file, name, kind: 'thoughts'|'prompt'}[], unsupported: string[], ignored: string[] }` — dotfiles dropped entirely.
  - `captionFromFilename(filename: string): { title: string, subtitle: string|null }`
  - `slugify(name: string): string` — never empty (`'piece'` fallback).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "llmart",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "dev": "npm run build && wrangler dev",
    "deploy": "npm run build && wrangler deploy",
    "test": "node --test \"test/*.test.mjs\"",
    "showcase": "node scripts/showcase.mjs"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install --save-dev sharp@^0.35.5 marked@^18.1.0 wrangler@^4.148.0`
Expected: `package-lock.json` created, `devDependencies` added to `package.json`, no errors.

- [ ] **Step 3: Write `wrangler.jsonc`, `.node-version`, extend `.gitignore`**

`wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "llmart",
  "compatibility_date": "2026-09-01",
  // Static-assets-only Worker: serves whatever `npm run build` writes to dist/.
  "assets": {
    "directory": "./dist"
  }
}
```

`.node-version`:
```
22
```

Append to `.gitignore`:
```
.showcase/
```

- [ ] **Step 4: Write the failing tests** — `test/filenames.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionFromFilename, classifyFiles, slugify, splitExtension } from '../scripts/lib/gallery.mjs';

test('splitExtension lowercases the extension and keeps dotted names intact', () => {
  assert.deepEqual(splitExtension('Claude Opus 5.5 - Self Portrait.PNG'), {
    name: 'Claude Opus 5.5 - Self Portrait',
    ext: '.png',
  });
  assert.deepEqual(splitExtension('README'), { name: 'README', ext: '' });
});

test('classifyFiles sorts files into images, sidecars, unsupported and ignored', () => {
  const result = classifyFiles([
    'a.png', 'B.JPG', 'c.webp', 'd.avif', 'e.jpeg',
    'a.thoughts.md', 'a.Prompt.MD',
    'IMG_0001.HEIC', 'loop.gif',
    'notes.txt', '.DS_Store',
  ]);
  assert.deepEqual(result.images, ['a.png', 'B.JPG', 'c.webp', 'd.avif', 'e.jpeg']);
  assert.deepEqual(result.sidecars, [
    { file: 'a.thoughts.md', name: 'a', kind: 'thoughts' },
    { file: 'a.Prompt.MD', name: 'a', kind: 'prompt' },
  ]);
  assert.deepEqual(result.unsupported, ['IMG_0001.HEIC', 'loop.gif']);
  assert.deepEqual(result.ignored, ['notes.txt']);
});

test('captionFromFilename splits title and subtitle on the first " - "', () => {
  assert.deepEqual(captionFromFilename('Claude Opus 5.5 - Self Portrait.png'), {
    title: 'Claude Opus 5.5',
    subtitle: 'Self Portrait',
  });
  assert.deepEqual(captionFromFilename('A - B - C.png'), { title: 'A', subtitle: 'B - C' });
});

test('captionFromFilename keeps typed casing when the name has spaces', () => {
  assert.deepEqual(captionFromFilename('Deepseek v4 Flash.png'), { title: 'Deepseek v4 Flash', subtitle: null });
});

test('captionFromFilename turns hyphen/underscore names into title case', () => {
  assert.deepEqual(captionFromFilename('kimi-k3-self-portrait.png'), { title: 'Kimi K3 Self Portrait', subtitle: null });
  assert.deepEqual(captionFromFilename('night_owl__study.JPG'), { title: 'Night Owl Study', subtitle: null });
});

test('slugify makes URL-safe slugs and never returns an empty string', () => {
  assert.equal(slugify('Claude Opus 5.5 - Self Portrait'), 'claude-opus-5-5-self-portrait');
  assert.equal(slugify('Café Crème'), 'cafe-creme');
  assert.equal(slugify('通义千问'), 'piece');
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/lib/gallery.mjs'`.

- [ ] **Step 6: Implement** — `scripts/lib/gallery.mjs`

```js
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc .node-version .gitignore scripts/lib/gallery.mjs test/filenames.test.mjs
git commit -m "Scaffold project and add filename caption/slug rules"
```

---

### Task 2: Overrides + gallery planning

**Files:**
- Modify: `scripts/lib/gallery.mjs` (append)
- Create: `test/plan.test.mjs`

**Interfaces:**
- Consumes: `GalleryError`, `splitExtension`, `captionFromFilename`, `slugify` (Task 1).
- Produces:
  - `parseOverrides(text: string|null, imageFiles: string[]): Record<string, {title?: string, subtitle?: string, order?: number}>` — throws `GalleryError`.
  - `planGallery({ images: string[], overrides?: object, sidecars?: {file, name, kind, text}[], sharedPrompt?: string|null }): Piece[]` where `Piece = { file: string, title: string, subtitle: string|null, prompt: string|null, thoughts: string|null, slug: string }`, sorted. Throws `GalleryError` on orphan sidecars. `prompt` has `{{model}}` already replaced.

- [ ] **Step 1: Write the failing tests** — `test/plan.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GalleryError, parseOverrides, planGallery } from '../scripts/lib/gallery.mjs';

const images = ['Claude Opus 5.5 - Self Portrait.png', 'Deepseek v4 Flash.png', 'kimi-k3-self-portrait.png'];
const galleryError = (pattern) => (error) => error instanceof GalleryError && pattern.test(error.message);

test('parseOverrides treats missing or blank gallery.json as no overrides', () => {
  assert.deepEqual(parseOverrides(null, images), {});
  assert.deepEqual(parseOverrides('  \n', images), {});
});

test('parseOverrides accepts valid overrides, including a leading BOM', () => {
  const text = '﻿{ "kimi-k3-self-portrait.png": { "title": "Kimi K3", "subtitle": "", "order": 2 } }';
  assert.deepEqual(parseOverrides(text, images), {
    'kimi-k3-self-portrait.png': { title: 'Kimi K3', subtitle: '', order: 2 },
  });
});

test('parseOverrides rejects invalid JSON and non-object roots', () => {
  assert.throws(() => parseOverrides('{ "a.png": ', images), galleryError(/not valid JSON/));
  assert.throws(() => parseOverrides('[]', images), galleryError(/must be an object/));
});

test('parseOverrides names unknown files and suggests a case-insensitive match', () => {
  assert.throws(
    () => parseOverrides('{ "Kimi-K3-Self-Portrait.png": {} }', images),
    galleryError(/"Kimi-K3-Self-Portrait\.png".*Did you mean "kimi-k3-self-portrait\.png"\?/),
  );
  assert.throws(
    () => parseOverrides('{ "nope.png": {} }', images),
    (error) => error instanceof GalleryError && error.message.includes('"nope.png"') && !error.message.includes('Did you mean'),
  );
});

test('parseOverrides rejects unknown fields, wrong types and non-object entries', () => {
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": { "caption": "x" } }', images), galleryError(/unknown field "caption"/));
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": { "order": "1" } }', images), galleryError(/"order" must be a number/));
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": "DeepSeek" }', images), galleryError(/must be an object/));
});

test('planGallery derives captions, sorts alphabetically and assigns slugs', () => {
  const pieces = planGallery({ images: [...images].reverse() });
  assert.deepEqual(pieces.map((p) => [p.title, p.subtitle, p.slug]), [
    ['Claude Opus 5.5', 'Self Portrait', 'claude-opus-5-5-self-portrait'],
    ['Deepseek v4 Flash', null, 'deepseek-v4-flash'],
    ['Kimi K3 Self Portrait', null, 'kimi-k3-self-portrait'],
  ]);
  assert.deepEqual(Object.keys(pieces[0]).sort(), ['file', 'prompt', 'slug', 'subtitle', 'thoughts', 'title']);
});

test('planGallery applies overrides; empty subtitle removes it; blank title falls back', () => {
  const pieces = planGallery({
    images,
    overrides: {
      'Deepseek v4 Flash.png': { title: 'DeepSeek v4 Flash', subtitle: 'Self Portrait' },
      'Claude Opus 5.5 - Self Portrait.png': { subtitle: '' },
      'kimi-k3-self-portrait.png': { title: '  ' },
    },
  });
  assert.deepEqual(pieces.map((p) => [p.title, p.subtitle]), [
    ['Claude Opus 5.5', null],
    ['DeepSeek v4 Flash', 'Self Portrait'],
    ['Kimi K3 Self Portrait', null],
  ]);
});

test('planGallery puts ordered pieces first, then natural alphabetical order', () => {
  const pieces = planGallery({
    images: ['b.png', 'piece 10.png', 'piece 2.png', 'a.png', 'z.png'],
    overrides: { 'z.png': { order: 1 }, 'b.png': { order: 2 } },
  });
  assert.deepEqual(pieces.map((p) => p.file), ['z.png', 'b.png', 'a.png', 'piece 2.png', 'piece 10.png']);
});

test('planGallery de-duplicates colliding slugs', () => {
  const pieces = planGallery({
    images: ['a b.png', 'a-b.jpg', 'a-b-2.png'],
    overrides: { 'a b.png': { order: 1 }, 'a-b.jpg': { order: 2 }, 'a-b-2.png': { order: 3 } },
  });
  assert.deepEqual(pieces.map((p) => p.slug), ['a-b', 'a-b-2', 'a-b-2-2']);
});

test('planGallery resolves shared vs per-image prompts and fills {{model}} with the final title', () => {
  const pieces = planGallery({
    images,
    overrides: { 'kimi-k3-self-portrait.png': { title: 'Kimi K3' } },
    sharedPrompt: 'Paint you, {{model}}, as {{ model }} sees it.\n',
    sidecars: [{ file: 'Deepseek v4 Flash.prompt.md', name: 'Deepseek v4 Flash', kind: 'prompt', text: 'Custom for {{model}}' }],
  });
  assert.deepEqual(pieces.map((p) => p.prompt), [
    'Paint you, Claude Opus 5.5, as Claude Opus 5.5 sees it.',
    'Custom for Deepseek v4 Flash',
    'Paint you, Kimi K3, as Kimi K3 sees it.',
  ]);
});

test('planGallery inserts titles containing $ patterns literally', () => {
  const [piece] = planGallery({
    images: ['x.png'],
    overrides: { 'x.png': { title: 'Cash $& $1' } },
    sharedPrompt: 'Hi {{model}}',
  });
  assert.equal(piece.prompt, 'Hi Cash $& $1');
});

test('planGallery attaches thoughts and treats blank text as absent', () => {
  const pieces = planGallery({
    images: ['a.png', 'b.png'],
    sharedPrompt: '   ',
    sidecars: [
      { file: 'a.thoughts.md', name: 'a', kind: 'thoughts', text: '﻿I see **light**.\n' },
      { file: 'b.thoughts.md', name: 'b', kind: 'thoughts', text: ' \n ' },
    ],
  });
  assert.deepEqual(pieces.map((p) => [p.thoughts, p.prompt]), [['I see **light**.', null], [null, null]]);
});

test('planGallery rejects a sidecar with no matching image', () => {
  assert.throws(
    () => planGallery({ images: ['a.png'], sidecars: [{ file: 'ghost.thoughts.md', name: 'ghost', kind: 'thoughts', text: 'boo' }] }),
    galleryError(/images\/ghost\.thoughts\.md/),
  );
});

test('planGallery returns an empty list for no images', () => {
  assert.deepEqual(planGallery({ images: [] }), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseOverrides`/`planGallery` not exported (SyntaxError: does not provide an export named ...).

- [ ] **Step 3: Implement** — append to `scripts/lib/gallery.mjs`

```js
const OVERRIDE_TYPES = { title: 'string', subtitle: 'string', order: 'number' };
const MODEL_PLACEHOLDER = /\{\{\s*model\s*\}\}/g;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function cleanText(text) {
  if (text == null) return null;
  return text.replace(/^﻿/, '').trim() || null;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in `filenames.test.mjs` and `plan.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/gallery.mjs test/plan.test.mjs
git commit -m "Add gallery.json validation and gallery planning"
```

---

### Task 3: Accent colour + HTML-safe JSON

**Files:**
- Modify: `scripts/lib/gallery.mjs` (append)
- Create: `test/accent.test.mjs`

**Interfaces:**
- Produces:
  - `rgbToHsl(r, g, b): [h 0–360, s 0–1, l 0–1]` (inputs 0–255)
  - `hslToHex(h, s, l): '#rrggbb'`
  - `pickAccent(pixels: Uint8Array|Buffer, channels = 3): '#rrggbb'`
  - `htmlSafeJson(value): string` — JSON safe to embed inside `<script type="application/json">`.

- [ ] **Step 1: Write the failing tests** — `test/accent.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hslToHex, htmlSafeJson, pickAccent, rgbToHsl } from '../scripts/lib/gallery.mjs';

const repeat = (rgb, times) => Array.from({ length: times }, () => rgb).flat();
const hslOf = (hex) => rgbToHsl(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));

test('rgbToHsl and hslToHex agree on primaries', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), [0, 1, 0.5]);
  assert.equal(hslToHex(0, 1, 0.5), '#ff0000');
  assert.equal(hslToHex(0, 0, 0.55), '#8c8c8c');
});

test('pickAccent turns a vivid image into a glow-friendly version of its colour', () => {
  assert.equal(pickAccent(Buffer.from(repeat([255, 0, 0], 4))), '#ff1a1a');
});

test('pickAccent finds the colour in a mostly near-black image', () => {
  const pixels = Buffer.from([...repeat([5, 5, 10], 90), ...repeat([0, 200, 230], 10)]);
  const [h, s, l] = hslOf(pickAccent(pixels));
  assert.ok(h > 180 && h < 200, `hue ${h} should be cyan`);
  assert.ok(s >= 0.5, `saturation ${s} should be boosted`);
  assert.ok(Math.abs(l - 0.55) < 0.01, `lightness ${l} should be ~0.55`);
});

test('pickAccent picks the dominant hue instead of averaging opposite hues', () => {
  const pixels = Buffer.from([...repeat([0, 200, 230], 60), ...repeat([230, 40, 160], 40)]);
  const [h] = hslOf(pickAccent(pixels));
  assert.ok(h > 180 && h < 200, `hue ${h} should follow the majority cyan`);
});

test('pickAccent keeps grayscale neutral and muted images muted', () => {
  assert.equal(pickAccent(Buffer.from(repeat([128, 128, 128], 10))), '#8c8c8c');
  const [h, s] = hslOf(pickAccent(Buffer.from(repeat([120, 100, 80], 10))));
  assert.ok(Math.abs(h - 30) < 2, `hue ${h} should stay warm`);
  assert.ok(s < 0.25, `saturation ${s} should stay muted`);
});

test('pickAccent reads RGBA buffers and survives empty input', () => {
  assert.equal(pickAccent(Buffer.from([255, 0, 0, 255, 255, 0, 0, 0]), 4), '#ff1a1a');
  assert.equal(pickAccent(Buffer.alloc(0)), '#8c8c8c');
});

test('htmlSafeJson cannot close the surrounding script tag and round-trips', () => {
  const value = { text: '</script><script>alert(1)</script>', line: 'a b', dollar: '$&' };
  const json = htmlSafeJson(value);
  assert.ok(!json.includes('<'));
  assert.ok(!json.includes(' '));
  assert.deepEqual(JSON.parse(json), value);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `pickAccent` etc. not exported.

- [ ] **Step 3: Implement** — append to `scripts/lib/gallery.mjs`

```js
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
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/gallery.mjs test/accent.test.mjs
git commit -m "Add accent colour picking and HTML-safe JSON"
```

---

### Task 4: Build script + page shell

**Files:**
- Create: `scripts/lib/markdown.mjs`, `scripts/build.mjs`, `src/index.html`, `test/markdown.test.mjs`, `test/build.test.mjs`

**Interfaces:**
- Consumes: everything exported from `scripts/lib/gallery.mjs`.
- Produces:
  - `renderMarkdown(text: string): string` (in `scripts/lib/markdown.mjs`).
  - `build({ root?, outDir?, srcDir?, log? }): Promise<ManifestEntry[]>` (in `scripts/build.mjs`). Defaults: `root` = project root, `outDir` = `<root>/dist`, `srcDir` = project `src/`, `log` = `console.log`. CLI: `node scripts/build.mjs [root] [outDir]`.
  - `ManifestEntry = { slug, title, subtitle: string|null, src: 'img/<slug>.<hash8>.webp', width: number, height: number, accent: '#rrggbb', promptHtml: string|null, promptText: string|null, thoughtsHtml: string|null }` — **the contract `src/gallery.js` reads** from `<script type="application/json" id="gallery-data">`.
  - Every file in `src/` other than `index.html` is copied verbatim to `dist/`.

- [ ] **Step 1: Write the failing Markdown tests** — `test/markdown.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../scripts/lib/markdown.mjs';

test('renderMarkdown renders Markdown formatting', () => {
  assert.equal(renderMarkdown('**bold** and _em_').trim(), '<p><strong>bold</strong> and <em>em</em></p>');
});

test('renderMarkdown shows raw HTML as text instead of swallowing it', () => {
  assert.equal(
    renderMarkdown('you, <the model name> would look like').trim(),
    '<p>you, &lt;the model name&gt; would look like</p>',
  );
  assert.match(renderMarkdown('<div>block</div>'), /&lt;div&gt;block&lt;\/div&gt;/);
  assert.match(renderMarkdown('end </script> here'), /&lt;\/script&gt;/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find `scripts/lib/markdown.mjs`.

- [ ] **Step 3: Implement** — `scripts/lib/markdown.mjs`

```js
import { Marked } from 'marked';

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Raw HTML is shown as text: prompts like "<the model name>" must not vanish as unknown tags.
const marked = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

export const renderMarkdown = (text) => marked.parse(text);
```

- [ ] **Step 4: Run Markdown tests to verify they pass**

Run: `npm test`
Expected: PASS. If the inline-tag case fails (marked version renders inline tags through a different hook), check `node -e "import('marked').then(m=>console.log(Object.keys(new m.Renderer().constructor.prototype)))"` and route that hook through `escapeHtml` the same way.

- [ ] **Step 5: Write the page shell** — `src/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>llmart</title>
    <meta name="description" content="Self-portraits painted by AI models, shown one at a time." />
    <meta name="theme-color" content="#050506" />
    <meta name="color-scheme" content="dark" />
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23050506'/%3E%3Crect x='10' y='6' width='12' height='15' rx='2' fill='%23f5f5f7'/%3E%3Crect x='10' y='23' width='12' height='4' rx='1' fill='%23f5f5f7' opacity='.25'/%3E%3C/svg%3E"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap"
    />
    <link rel="stylesheet" href="styles.css" />
    <script src="gallery.js" defer></script>
  </head>
  <body>
    <div class="ambient" aria-hidden="true">
      <div class="ambient__layer"></div>
      <div class="ambient__layer"></div>
    </div>

    <header class="topbar">
      <a class="wordmark" href="./">llm<span>art</span></a>
      <p class="counter" data-counter hidden>
        <span data-counter-current>01</span><span class="counter__sep">/</span><span data-counter-total>01</span>
      </p>
    </header>

    <main class="stage" data-stage>
      <div class="viewport" data-viewport></div>
    </main>

    <nav class="dock" aria-label="Gallery" data-dock hidden>
      <button class="nav-button nav-button--prev" type="button" data-prev aria-label="Previous piece">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
      </button>
      <div class="dots">
        <div class="dots__window" data-dots-window>
          <div class="dots__track" data-dots></div>
        </div>
      </div>
      <button class="nav-button nav-button--next" type="button" data-next aria-label="Next piece">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
      </button>
    </nav>

    <p class="visually-hidden" aria-live="polite" data-live></p>

    <dialog class="sheet" data-prompt-dialog aria-labelledby="prompt-heading">
      <div class="sheet__panel">
        <header class="sheet__header">
          <div>
            <p class="sheet__eyebrow">Prompt</p>
            <h2 class="sheet__title" id="prompt-heading" data-prompt-title></h2>
          </div>
          <button class="icon-button" type="button" data-close-prompt aria-label="Close prompt">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div class="sheet__body" data-prompt-body></div>
        <footer class="sheet__footer">
          <button class="pill" type="button" data-copy-prompt>Copy prompt</button>
        </footer>
      </div>
    </dialog>

    <noscript><p class="noscript">llmart needs JavaScript to show the gallery.</p></noscript>
    <!-- GALLERY_DATA -->
  </body>
</html>
```

- [ ] **Step 6: Write the failing build tests** — `test/build.test.mjs`

```js
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
    'images/small.thoughts.md': 'I am **small**.',
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
  await assert.rejects(build({ root, outDir, log: silent }), galleryError(/images\/broken\.png/));
});

test('build fails on a sidecar with no image', async (t) => {
  const { root, outDir } = await fixture(t, { 'images/ghost.thoughts.md': 'boo' });
  await assert.rejects(build({ root, outDir, log: silent }), galleryError(/images\/ghost\.thoughts\.md/));
});

test('build skips unrelated files in images/ and says so', async (t) => {
  const { root, outDir } = await fixture(t, {
    'images/a.png': png(10, 10, { r: 0, g: 0, b: 0 }),
    'images/notes.txt': 'hi',
  });
  const lines = [];
  const manifest = await build({ root, outDir, log: (line) => lines.push(line) });
  assert.equal(manifest.length, 1);
  assert.ok(lines.some((line) => line.includes('images/notes.txt')), 'should log the skipped file');
});

test('build with no images writes an empty gallery', async (t) => {
  const { root, outDir } = await fixture(t, {});
  const manifest = await build({ root, outDir, log: silent });
  assert.deepEqual(manifest, []);
  assert.deepEqual(readManifest(await readFile(path.join(outDir, 'index.html'), 'utf8')), []);
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find `scripts/build.mjs`.

- [ ] **Step 8: Implement** — `scripts/build.mjs`

```js
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
  for (const file of ignored) log(`  skipping images/${file} (not an image, .thoughts.md or .prompt.md)`);

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
    throw new GalleryError(`Could not process images/${path.basename(file)}: ${error.message}`);
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
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites including 6 build tests.

- [ ] **Step 10: Build the real content**

Run: `npm run build`
Expected: three `✓ images/... → img/....webp` lines (Claude 512×768, DeepSeek 900×1600, Kimi 900×1600) and `Built 3 pieces → dist`. Then `ls -la dist dist/img` shows `index.html`, `_headers`, three `.webp` files each well under the 4 MB source.

- [ ] **Step 11: Commit**

```bash
git add scripts/build.mjs scripts/lib/markdown.mjs src/index.html test/markdown.test.mjs test/build.test.mjs
git commit -m "Add build script, Markdown rendering and page shell"
```

---

### Task 5: Stage, slides and navigation

**Files:**
- Create: `src/styles.css`, `src/gallery.js`, `scripts/showcase.mjs`

**Interfaces:**
- Consumes: `ManifestEntry[]` from `#gallery-data` (Task 4); DOM hooks in `src/index.html` (`data-viewport`, `data-stage`, `data-dock`, `data-prev`, `data-next`, `data-dots-window`, `data-dots`, `data-counter`, `data-counter-current`, `data-counter-total`, `data-live`, `.ambient__layer`).
- Produces (inside `gallery.js` IIFE, used by Task 6): `els` object, `pieces`, `index`, `current` (current `.slide` element), helpers `el(tag, className, attrs)`, `hexToRgb(hex)`, `onKeydown(event)` and `init()`; slide DOM: `.slide[data-flippable]` › `.piece` › `.piece__frame` › `.card` › `.card__face--front[data-front]` + `.card__face--back[inert]` (› `.card__surface` + `.card__thoughts` › `.card__label`, `.card__text`, `.card__signature`); caption pills `[data-action="prompt"]` and `[data-action="flip"]` with `.pill__label`. CSS custom properties `--ar`, `--accent-rgb` (on `.slide`), `--card-w`, `--nav-y`, `--floor-y` (on `:root`).

- [ ] **Step 1: Write `src/styles.css`**

```css
/* llmart — one piece at a time. */

:root {
  color-scheme: dark;
  --bg: #050506;
  --text: #f5f5f7;
  --muted: #86868b;
  --glass: rgb(255 255 255 / 0.07);
  --glass-strong: rgb(255 255 255 / 0.14);
  --hairline: rgb(255 255 255 / 0.1);
  --ease: cubic-bezier(0.25, 1, 0.5, 1);
  --gutter: 16px;
  --radius: 10px;
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Arial, sans-serif;
  --font-serif: ui-serif, "New York", "Newsreader", "Iowan Old Style", Georgia, serif;
  /* Space taken by the top bar, dock, caption and padding. The card gets the rest:
     card + visible reflection - caption overlap = 1.16 × card height. */
  --chrome-h: 300px;
  --card-h: max(180px, min(64vh, calc((100vh - var(--chrome-h)) / 1.16)));
  --side-space: calc(2 * var(--gutter));
}

@supports (height: 100dvh) {
  :root {
    --card-h: max(180px, min(64dvh, calc((100dvh - var(--chrome-h)) / 1.16)));
  }
}

@media (min-width: 720px) {
  :root {
    --side-space: calc(2 * (var(--gutter) + 44px + 36px));
  }
}

@media (max-width: 719px) {
  :root {
    --chrome-h: 262px;
  }
}

@media (max-height: 560px) {
  :root {
    --chrome-h: 200px;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

html {
  height: 100%;
  background: var(--bg);
}

body {
  margin: 0;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: radial-gradient(120% 80% at 50% 35%, #0c0c0f 0%, var(--bg) 60%);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

button {
  font: inherit;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.85);
  outline-offset: 3px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ---- Ambient glow ---- */

.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.ambient__layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1.4s var(--ease);
  background:
    radial-gradient(ellipse 48% 44% at 50% var(--nav-y, 42%), rgb(var(--glow) / 0.28), transparent 72%),
    radial-gradient(ellipse 34% 9% at 50% var(--floor-y, 76%), rgb(var(--glow) / 0.16), transparent 75%);
}

.ambient__layer.is-active {
  opacity: 1;
}

/* ---- Top bar ---- */

.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: max(20px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 0 max(24px, env(safe-area-inset-left));
}

.wordmark {
  color: var(--text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.03em;
  text-decoration: none;
}

.wordmark span {
  color: var(--muted);
  font-weight: 400;
}

.counter {
  display: flex;
  gap: 6px;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.counter [data-counter-current] {
  color: var(--text);
}

.counter__sep {
  opacity: 0.5;
}

/* ---- Stage and slides ---- */

.stage {
  position: relative;
  z-index: 1;
  min-height: 0;
  touch-action: pan-y;
}

.viewport {
  display: grid;
  place-items: center;
  height: 100%;
}

.slide {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.slide.is-leaving {
  pointer-events: none;
}

.piece {
  width: min(calc(var(--card-h) * var(--ar)), calc(100vw - var(--side-space)));
}

.piece__frame,
.reflection__stage {
  perspective: 1800px;
}

.card {
  position: relative;
  width: 100%;
  aspect-ratio: var(--ar);
  transform-style: preserve-3d;
}

.card__face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--radius);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.card__face--front {
  background: rgb(var(--accent-rgb) / 0.12);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.06),
    0 40px 80px -30px rgb(0 0 0 / 0.9);
}

.card__face--front img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.9s var(--ease);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.card__face--front.is-loaded img {
  opacity: 1;
}

.card__face--back {
  transform: rotateY(180deg);
  background: #0c0c0e;
}

.slide[data-flippable] [data-front] {
  cursor: pointer;
}

/* Reflection: a mirrored clone of the card on a glossy black floor. Its contents are
   flipped vertically while the clone rotates exactly like the real card. */
.reflection {
  position: relative;
  width: 100%;
  aspect-ratio: var(--ar) / 0.28;
  margin-top: 3px;
  /* Let the caption overlap the faded lower part of the reflection (12% of card height). */
  margin-bottom: calc(-100% * 0.12 / var(--ar));
  overflow: hidden;
  pointer-events: none;
  filter: blur(1.5px);
  -webkit-mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.4), transparent 88%);
  mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.4), transparent 88%);
}

.reflection .card__face {
  box-shadow: none;
}

.mirror {
  transform: scaleY(-1);
}

/* ---- Caption ---- */

.caption {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(640px, calc(100vw - 2 * var(--gutter)));
  text-align: center;
}

.caption__title {
  margin: 0;
  font-size: clamp(26px, 1.25rem + 1.3vw, 40px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.026em;
  text-wrap: balance;
}

.caption__subtitle {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: clamp(15px, 0.85rem + 0.35vw, 19px);
  line-height: 1.3;
  letter-spacing: -0.012em;
}

.caption__actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px 0 16px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    background-color 0.25s,
    border-color 0.25s,
    transform 0.3s var(--ease);
}

.pill:hover {
  border-color: rgb(255 255 255 / 0.16);
  background: var(--glass-strong);
}

.pill:active {
  transform: scale(0.96);
}

.pill svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.75;
}

/* ---- Dock: dots + buttons ---- */

.dock {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 14px var(--gutter) max(22px, env(safe-area-inset-bottom));
}

.nav-button {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: 50%;
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6);
  cursor: pointer;
  transition:
    background-color 0.25s,
    scale 0.3s var(--ease);
}

.nav-button:hover {
  background: var(--glass-strong);
}

.nav-button:active {
  scale: 0.92;
}

.nav-button svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Desktop: buttons float beside the card (position measured by gallery.js). */
@media (min-width: 720px) {
  .nav-button {
    position: fixed;
    z-index: 3;
    top: var(--nav-y, 45%);
    translate: 0 -50%;
    transition:
      background-color 0.25s,
      scale 0.3s var(--ease),
      top 0.6s var(--ease),
      left 0.6s var(--ease),
      right 0.6s var(--ease);
  }

  .nav-button--prev {
    left: max(var(--gutter), calc(50% - var(--card-w, 360px) / 2 - 80px));
  }

  .nav-button--next {
    right: max(var(--gutter), calc(50% - var(--card-w, 360px) / 2 - 80px));
  }
}

.dots {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6);
}

.dots__window {
  max-width: 172px;
  overflow: hidden;
  padding: 12px 4px;
}

.dots__window.is-overflowing {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 20px, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 20px, #000 calc(100% - 20px), transparent);
}

.dots__track {
  --dot: 7px;
  --dot-active: 22px;
  --dot-gap: 9px;
  display: flex;
  gap: var(--dot-gap);
  width: max-content;
  transition: transform 0.6s var(--ease);
}

.dot {
  position: relative;
  flex: none;
  width: var(--dot);
  height: var(--dot);
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.3);
  cursor: pointer;
  transition:
    width 0.5s var(--ease),
    background-color 0.3s;
}

.dot::after {
  content: "";
  position: absolute;
  inset: -12px calc(var(--dot-gap) / -2);
}

.dot:hover {
  background: rgb(255 255 255 / 0.6);
}

.dot[aria-current="true"] {
  width: var(--dot-active);
  background: var(--text);
}

/* ---- Empty state ---- */

.empty {
  padding: 0 var(--gutter);
  text-align: center;
}

.empty__title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.empty__hint {
  margin: 8px 0 0;
  color: var(--muted);
}

.empty__hint code {
  color: var(--text);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.9em;
}

.noscript {
  position: fixed;
  inset: auto 0 45% 0;
  color: var(--muted);
  text-align: center;
}

/* ---- Short viewports (landscape phones) ---- */

@media (max-height: 560px) {
  .topbar {
    padding-top: max(10px, env(safe-area-inset-top));
  }

  .dock {
    padding-top: 6px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
  }

  .caption__title {
    font-size: 22px;
  }

  .caption__subtitle {
    margin-top: 2px;
    font-size: 14px;
  }

  .caption__actions {
    margin-top: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ambient__layer,
  .dots__track,
  .dot,
  .nav-button,
  .card__face--front img {
    transition-duration: 0.01ms;
  }
}
```

- [ ] **Step 2: Write `src/gallery.js`**

```js
// llmart gallery: renders the pieces embedded by the build, one at a time.
(() => {
  'use strict';

  const DURATION = 650;
  const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const SWIPE_DISTANCE = 50;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (selector) => document.querySelector(selector);
  const els = {
    root: document.documentElement,
    stage: $('[data-stage]'),
    viewport: $('[data-viewport]'),
    dock: $('[data-dock]'),
    prev: $('[data-prev]'),
    next: $('[data-next]'),
    dotsWindow: $('[data-dots-window]'),
    dots: $('[data-dots]'),
    counter: $('[data-counter]'),
    counterCurrent: $('[data-counter-current]'),
    counterTotal: $('[data-counter-total]'),
    live: $('[data-live]'),
    glowLayers: [...document.querySelectorAll('.ambient__layer')],
  };

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
    flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20.5V16h-4.5"/></svg>',
  };

  const pieces = readPieces();
  let index = -1;
  let current = null;
  let activeGlow = 0;

  function readPieces() {
    try {
      const data = JSON.parse(document.getElementById('gallery-data')?.textContent ?? '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('llmart: could not read gallery data', error);
      return [];
    }
  }

  // ---- Helpers ----

  function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
    return node;
  }

  function hexToRgb(hex) {
    const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x8c8c8c;
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
  }

  const describe = (piece) => (piece.subtitle ? `${piece.title}, ${piece.subtitle}` : piece.title);
  const wrap = (i) => (i + pieces.length) % pieces.length;
  const pad = (n) => String(n).padStart(Math.max(2, String(pieces.length).length), '0');

  // ---- Slides ----

  function createSlide(piece, position, { eager = false } = {}) {
    const slide = el('article', 'slide', {
      'aria-roledescription': 'slide',
      'aria-label': `${position + 1} of ${pieces.length}`,
      'data-flippable': Boolean(piece.thoughtsHtml),
    });
    slide.style.setProperty('--ar', (piece.width / piece.height).toFixed(5));
    slide.style.setProperty('--accent-rgb', hexToRgb(piece.accent));

    const frame = el('div', 'piece__frame');
    frame.append(createCard(piece, { mirror: false, eager }));

    const reflectionStage = el('div', 'reflection__stage');
    reflectionStage.append(createCard(piece, { mirror: true }));
    const reflection = el('div', 'reflection', { 'aria-hidden': 'true' });
    reflection.append(reflectionStage);

    const pieceEl = el('div', 'piece');
    pieceEl.append(frame, reflection);
    slide.append(pieceEl, createCaption(piece));
    return slide;
  }

  function createCard(piece, { mirror, eager = false }) {
    const card = el('div', 'card');
    const front = el('div', 'card__face card__face--front', { 'data-front': !mirror });
    const img = el('img', mirror ? 'mirror' : null, {
      src: piece.src,
      alt: mirror ? '' : describe(piece),
      width: piece.width,
      height: piece.height,
      decoding: 'async',
      draggable: 'false',
      fetchpriority: eager ? 'high' : null,
    });
    const markLoaded = () => front.classList.add('is-loaded');
    if (img.complete && img.naturalWidth) markLoaded();
    else img.addEventListener('load', markLoaded, { once: true });
    front.append(img);
    card.append(front);

    if (piece.thoughtsHtml) {
      const back = el('div', 'card__face card__face--back', { inert: !mirror });
      back.append(el('div', mirror ? 'card__surface mirror' : 'card__surface'));
      if (!mirror) back.append(createThoughts(piece));
      card.append(back);
    }
    return card;
  }

  function createThoughts(piece) {
    const scroller = el('div', 'card__thoughts', {
      tabindex: '0',
      role: 'region',
      'aria-label': `${piece.title}'s thoughts`,
    });
    const label = el('p', 'card__label');
    label.textContent = 'Thoughts';
    const text = el('div', 'card__text');
    text.innerHTML = piece.thoughtsHtml;
    const signature = el('p', 'card__signature');
    signature.textContent = `— ${piece.title}`;
    scroller.append(label, text, signature);
    return scroller;
  }

  function createCaption(piece) {
    const caption = el('div', 'caption');
    const title = el('h2', 'caption__title');
    title.textContent = piece.title;
    caption.append(title);
    if (piece.subtitle) {
      const subtitle = el('p', 'caption__subtitle');
      subtitle.textContent = piece.subtitle;
      caption.append(subtitle);
    }
    const actions = el('div', 'caption__actions');
    if (piece.promptHtml) actions.append(pill('Prompt', ICONS.plus, { 'data-action': 'prompt', 'aria-haspopup': 'dialog' }));
    if (piece.thoughtsHtml) actions.append(pill('Thoughts', ICONS.flip, { 'data-action': 'flip' }));
    if (actions.childElementCount > 0) caption.append(actions);
    return caption;
  }

  function pill(label, icon, attrs) {
    const button = el('button', 'pill', { type: 'button', ...attrs });
    const text = el('span', 'pill__label');
    text.textContent = label;
    button.append(text);
    button.insertAdjacentHTML('beforeend', icon);
    return button;
  }

  // ---- Navigation ----

  function go(target, direction = 0, { initial = false } = {}) {
    if (pieces.length === 0) return;
    const nextIndex = wrap(target);
    if (nextIndex === index) return;
    const previous = current;
    // Drop slides still leaving from an interrupted transition.
    for (const stale of els.viewport.querySelectorAll('.slide.is-leaving')) stale.remove();
    const slide = createSlide(pieces[nextIndex], nextIndex, { eager: initial });
    els.viewport.append(slide);
    index = nextIndex;
    current = slide;
    updateChrome({ initial });
    measure(); // before animating, so transforms don't skew the measurement
    animateIn(slide, direction, initial);
    if (previous) animateOut(previous, direction);
    preloadNeighbours();
  }

  const next = () => go(index + 1, 1);
  const prev = () => go(index - 1, -1);

  function animateIn(slide, direction, initial) {
    if (reducedMotion.matches) {
      slide.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' });
      return;
    }
    const from = initial
      ? { opacity: 0, transform: 'translateY(16px) scale(0.985)' }
      : { opacity: 0, transform: `translateX(${direction * 5}%) scale(0.97)` };
    slide.animate([from, { opacity: 1, transform: 'none' }], {
      duration: initial ? 1200 : DURATION,
      delay: initial ? 100 : 80,
      easing: EASE,
      fill: 'backwards',
    });
  }

  function animateOut(slide, direction) {
    slide.classList.add('is-leaving');
    slide.inert = true;
    slide.setAttribute('aria-hidden', 'true');
    // Freeze any in-flight entrance where it is, then leave from there.
    for (const animation of slide.getAnimations()) {
      try {
        animation.commitStyles();
      } catch {
        // Element not rendered; nothing to freeze.
      }
      animation.cancel();
    }
    const to = reducedMotion.matches
      ? { opacity: 0 }
      : { opacity: 0, transform: `translateX(${direction * -5}%) scale(0.96)` };
    const animation = slide.animate([to], {
      duration: reducedMotion.matches ? 250 : DURATION * 0.75,
      easing: EASE,
      fill: 'forwards',
    });
    animation.finished.then(() => slide.remove(), () => {});
  }

  function updateChrome({ initial }) {
    const piece = pieces[index];
    els.counterCurrent.textContent = pad(index + 1);
    els.counterTotal.textContent = pad(pieces.length);
    [...els.dots.children].forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    centerActiveDot();
    setGlow(piece.accent);
    document.title = `${piece.title} · llmart`;
    if (!initial) {
      els.live.textContent = `${index + 1} of ${pieces.length}: ${describe(piece)}`;
      history.replaceState(null, '', `#${encodeURIComponent(piece.slug)}`);
    }
  }

  function setGlow(hex) {
    const incoming = els.glowLayers[1 - activeGlow];
    incoming.style.setProperty('--glow', hexToRgb(hex));
    incoming.classList.add('is-active');
    els.glowLayers[activeGlow].classList.remove('is-active');
    activeGlow = 1 - activeGlow;
  }

  // Positions the desktop buttons and the glow around the current card.
  function measure() {
    if (!current) return;
    const rect = current.querySelector('.piece__frame').getBoundingClientRect();
    els.root.style.setProperty('--card-w', `${rect.width}px`);
    els.root.style.setProperty('--nav-y', `${rect.top + rect.height / 2}px`);
    els.root.style.setProperty('--floor-y', `${rect.bottom}px`);
  }

  function preloadNeighbours() {
    if (pieces.length < 2) return;
    for (const i of new Set([wrap(index + 1), wrap(index - 1)])) {
      const img = new Image();
      img.decoding = 'async';
      img.src = pieces[i].src;
    }
  }

  // ---- Dots ----

  function buildDots() {
    const fragment = document.createDocumentFragment();
    pieces.forEach((piece, i) => {
      const dot = el('button', 'dot', { type: 'button', 'aria-label': `Show ${i + 1}: ${piece.title}` });
      dot.addEventListener('click', () => go(i, Math.sign(i - index)));
      fragment.append(dot);
    });
    els.dots.append(fragment);
  }

  // Long galleries scroll the dot strip to keep the active dot centred (iOS page-control style).
  // Computed from the CSS sizes rather than measured, because widths are mid-transition here.
  function centerActiveDot() {
    if (index < 0) return;
    const track = getComputedStyle(els.dots);
    const dot = parseFloat(track.getPropertyValue('--dot'));
    const active = parseFloat(track.getPropertyValue('--dot-active'));
    const gap = parseFloat(track.getPropertyValue('--dot-gap'));
    const frame = getComputedStyle(els.dotsWindow);
    const visible = els.dotsWindow.clientWidth - parseFloat(frame.paddingLeft) - parseFloat(frame.paddingRight);
    const trackWidth = (pieces.length - 1) * (dot + gap) + active;
    const overflowing = trackWidth > visible + 0.5;
    els.dotsWindow.classList.toggle('is-overflowing', overflowing);
    const center = index * (dot + gap) + active / 2;
    const offset = overflowing ? Math.min(0, Math.max(visible - trackWidth, visible / 2 - center)) : 0;
    els.dots.style.transform = `translateX(${offset}px)`;
  }

  // ---- Input ----

  function setupSwipe() {
    let start = null;
    let swiped = false;
    els.stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      swiped = false;
    });
    els.stage.addEventListener('pointerup', (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swiped = true;
      if (dx < 0) next();
      else prev();
    });
    els.stage.addEventListener('pointercancel', () => {
      start = null;
    });
    // The tap that ends a swipe must not also count as a click on the card.
    els.stage.addEventListener(
      'click',
      (event) => {
        if (!swiped) return;
        swiped = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    }
  }

  function indexFromHash() {
    try {
      const slug = decodeURIComponent(location.hash.slice(1));
      return pieces.findIndex((piece) => piece.slug === slug);
    } catch {
      return -1;
    }
  }

  // ---- Start ----

  function renderEmpty() {
    const empty = el('div', 'empty');
    empty.innerHTML =
      '<p class="empty__title">No pieces yet</p><p class="empty__hint">Add an image to <code>images/</code> and deploy.</p>';
    els.viewport.append(empty);
  }

  function init() {
    if (pieces.length === 0) {
      renderEmpty();
      return;
    }
    els.counter.hidden = false;
    els.dock.hidden = pieces.length < 2;
    buildDots();
    els.prev.addEventListener('click', prev);
    els.next.addEventListener('click', next);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('hashchange', () => {
      const target = indexFromHash();
      if (target !== -1) go(target, Math.sign(target - index));
    });
    const relayout = () => {
      measure();
      centerActiveDot();
    };
    window.addEventListener('resize', relayout);
    document.fonts?.ready.then(relayout);
    setupSwipe();
    const start = indexFromHash();
    go(start === -1 ? 0 : start, 0, { initial: true });
  }

  init();
})();
```

- [ ] **Step 3: Write `scripts/showcase.mjs`** (synthetic edge cases; output is git-ignored)

```js
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
  'images/Tall Piece - Self Portrait.png': artwork(1080, 1920, COLORS[0]),
  'images/Tall Piece - Self Portrait.thoughts.md': LONG_THOUGHTS,
  'images/Wide Piece - Landscape.png': artwork(1920, 1080, COLORS[1]),
  'images/Wide Piece - Landscape.thoughts.md': 'Short fixture thoughts for a wide piece.',
  'images/Square Piece.png': artwork(1200, 1200, COLORS[2]),
  'prompt.md': 'Fixture prompt: paint what you think you, {{model}}, would look like.',
  'gallery.json': JSON.stringify({
    'Tall Piece - Self Portrait.png': { order: 1 },
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
```

- [ ] **Step 4: Run unit/build tests**

Run: `npm test`
Expected: PASS (build test now also asserts `styles.css` and `gallery.js` are copied).

- [ ] **Step 5: Build both galleries and serve them**

Run: `npm run build && npm run showcase`
Expected: `Built 3 pieces → dist` and `Built 40 pieces → .showcase/dist`.
Then start two background servers: `python3 -m http.server 8789 -d dist` and `python3 -m http.server 8790 -d .showcase/dist`.

- [ ] **Step 6: Browser-verify the real gallery (Playwright MCP)**

At `http://localhost:8789/`, viewport 1440×900:
- Screenshot. Expect: dark stage, Claude piece centred with soft violet glow, reflection fading beneath, caption "Claude Opus 5.5 / Self Portrait", a `Prompt +` pill, counter `01 / 03`, three dots (first stretched), side buttons beside the card.
- `browser_console_messages`: no errors.
- Press `ArrowRight` → counter `02 / 03`, URL hash `#deepseek-v4-flash`, glow changes colour. Press `ArrowLeft` twice → wraps to `03 / 03`.
- Click the first dot → `01 / 03`.
- Navigate to `http://localhost:8789/#kimi-k3-self-portrait` → Kimi piece shown first.
- `browser_evaluate`: `document.querySelectorAll('.slide').length` is `1` after transitions settle.
- Resize to 390×844, screenshot: buttons sit in the dock flanking the dots; `document.documentElement.scrollWidth <= 390`.

- [ ] **Step 7: Browser-verify edge cases on the showcase (Review Focus #2, many pieces)**

At `http://localhost:8790/`, 1440×900 and 390×844:
- Go to piece 2 (Wide). `browser_evaluate` returns the card rect and both button rects: buttons must not intersect the card; at 390px `scrollWidth <= 390`.
- Piece 3 (Square) screenshot: reflection proportional, caption not overlapping the card.
- 40 dots: dot strip stays inside its capsule, edges fade, the active dot stays visible after jumping to the last piece (press `ArrowLeft` from piece 1).
- Fix any visual problems found, re-run `npm run build && npm run showcase`, re-check.

- [ ] **Step 8: Commit**

```bash
git add src/styles.css src/gallery.js scripts/showcase.mjs
git commit -m "Add gallery stage, slides, reflection and navigation"
```

---

### Task 6: Thoughts flip + prompt sheet

**Files:**
- Modify: `src/gallery.js`, `src/styles.css` (append)

**Interfaces:**
- Consumes (from Task 5's `gallery.js`): `els`, `pieces`, `index`, `current`, `el`, `hexToRgb`, `onKeydown`, `init`; slide DOM classes and `[data-action]` pills; dialog hooks in `src/index.html` (`data-prompt-dialog`, `data-prompt-title`, `data-prompt-body`, `data-copy-prompt`, `data-close-prompt`).
- Produces: `isFlipped()`, `setFlipped(flipped): boolean`, `openPrompt()`, `copyText(text): Promise<boolean>`, `onViewportClick(event)`, `setupPrompt()`.

- [ ] **Step 1: Add dialog elements to `els`** — in `src/gallery.js` replace:

```js
    glowLayers: [...document.querySelectorAll('.ambient__layer')],
  };
```
with:
```js
    glowLayers: [...document.querySelectorAll('.ambient__layer')],
    dialog: $('[data-prompt-dialog]'),
    promptTitle: $('[data-prompt-title]'),
    promptBody: $('[data-prompt-body]'),
    copyPrompt: $('[data-copy-prompt]'),
    closePrompt: $('[data-close-prompt]'),
  };
```

- [ ] **Step 2: Add the flip + prompt section** — in `src/gallery.js` insert directly above `  // ---- Start ----`:

```js
  // ---- Thoughts (card flip) ----

  function isFlipped() {
    return Boolean(current?.classList.contains('is-flipped'));
  }

  function setFlipped(flipped) {
    if (!current || !pieces[index].thoughtsHtml) return false;
    const card = current.querySelector('.piece__frame .card');
    const pillButton = current.querySelector('[data-action="flip"]');
    // Don't strand keyboard focus inside the face that is about to become inert.
    if (!flipped && card.contains(document.activeElement)) pillButton.focus();
    current.classList.toggle('is-flipped', flipped);
    card.querySelector('.card__face--front').inert = flipped;
    card.querySelector('.card__face--back').inert = !flipped;
    pillButton.querySelector('.pill__label').textContent = flipped ? 'Artwork' : 'Thoughts';
    return true;
  }

  // ---- Prompt sheet ----

  let copyTimer;

  function setCopyLabel(text) {
    els.copyPrompt.textContent = text;
  }

  function openPrompt() {
    const piece = pieces[index];
    if (!piece?.promptHtml || els.dialog.open) return;
    els.promptTitle.textContent = piece.title;
    els.promptBody.innerHTML = piece.promptHtml;
    els.dialog.style.setProperty('--accent-rgb', hexToRgb(piece.accent));
    clearTimeout(copyTimer);
    setCopyLabel('Copy prompt');
    els.dialog.showModal();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API unavailable (insecure context) or denied: fall back to a selection copy.
      const area = el('textarea', 'visually-hidden');
      area.value = text;
      els.dialog.append(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
      return copied;
    }
  }

  function setupPrompt() {
    els.closePrompt.addEventListener('click', () => els.dialog.close());
    // Clicks on the backdrop land on the <dialog> itself; clicks in the panel don't.
    els.dialog.addEventListener('click', (event) => {
      if (event.target === els.dialog) els.dialog.close();
    });
    els.copyPrompt.addEventListener('click', async () => {
      const copied = await copyText(pieces[index].promptText);
      setCopyLabel(copied ? 'Copied' : 'Copy failed');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => setCopyLabel('Copy prompt'), 1800);
    });
  }

  function onViewportClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'prompt') openPrompt();
    else if (action === 'flip') setFlipped(!isFlipped());
    else if (event.target.closest('[data-front]')) setFlipped(true);
  }

```

- [ ] **Step 3: Extend keyboard handling** — in `src/gallery.js` replace the whole `onKeydown` function with:

```js
  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || els.dialog.open) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    } else if ((event.key === 'f' || event.key === 'F') && !event.repeat) {
      if (setFlipped(!isFlipped())) event.preventDefault();
    } else if (event.key === 'Escape' && isFlipped()) {
      setFlipped(false);
    }
  }
```

- [ ] **Step 4: Wire it up in `init`** — in `src/gallery.js` replace:

```js
    setupSwipe();
    const start = indexFromHash();
```
with:
```js
    setupSwipe();
    setupPrompt();
    els.viewport.addEventListener('click', onViewportClick);
    const start = indexFromHash();
```

- [ ] **Step 5: Add flip + sheet styles** — in `src/styles.css`, replace the existing final block:

```css
@media (prefers-reduced-motion: reduce) {
  .ambient__layer,
  .dots__track,
  .dot,
  .nav-button,
  .card__face--front img {
    transition-duration: 0.01ms;
  }
}
```

with the following new sections, followed by the updated reduced-motion block shown after them (so reduced-motion stays last in the file):

```css
/* ---- Card back: matte card stock with the piece's colour glowing through ---- */

.card__surface {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 65% at 50% -5%, rgb(var(--accent-rgb) / 0.24), transparent 62%),
    radial-gradient(90% 50% at 50% 108%, rgb(var(--accent-rgb) / 0.1), transparent 70%),
    #0c0c0e;
}

.card__surface::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.16;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.card__face--back {
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.07),
    0 40px 80px -30px rgb(0 0 0 / 0.9);
}

.card__face--back:has(.card__thoughts:focus-visible) {
  outline: 2px solid rgb(255 255 255 / 0.6);
  outline-offset: 3px;
}

.card__thoughts {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: clamp(22px, 7%, 34px) clamp(20px, 8%, 32px) clamp(24px, 8%, 36px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  outline: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 26px, #000 calc(100% - 40px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 26px, #000 calc(100% - 40px), transparent);
}

.card__thoughts::-webkit-scrollbar {
  display: none;
}

.card__label {
  margin: 0 0 16px;
  color: rgb(var(--accent-rgb));
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.card__text {
  color: #e8e5df;
  font-family: var(--font-serif);
  font-size: clamp(14px, 0.8rem + 0.25vw, 16.5px);
  line-height: 1.62;
  text-wrap: pretty;
  hyphens: auto;
}

.card__text > :first-child {
  margin-top: 0;
}

.card__text p,
.card__text ul,
.card__text ol,
.card__text blockquote,
.card__text pre {
  margin: 0 0 1em;
}

.card__text h1,
.card__text h2,
.card__text h3,
.card__text h4 {
  margin: 1.4em 0 0.5em;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.card__text ul,
.card__text ol {
  padding-left: 1.2em;
}

.card__text blockquote {
  padding-left: 0.9em;
  border-left: 1px solid rgb(255 255 255 / 0.2);
  color: #c9c6c0;
  font-style: italic;
}

.card__text code,
.card__text pre {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.84em;
  white-space: pre-wrap;
}

.card__text a {
  color: inherit;
  text-decoration-color: rgb(var(--accent-rgb));
}

.card__signature {
  margin: auto 0 0;
  padding-top: 20px;
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 15px;
  font-style: italic;
  text-align: right;
}

/* ---- Flip ---- */

.card {
  transition: transform 0.95s cubic-bezier(0.45, 0, 0.12, 1);
}

.slide.is-flipped .card {
  transform: rotateY(180deg);
}

/* ---- Prompt sheet ---- */

.sheet {
  width: min(560px, calc(100vw - 2 * var(--gutter)));
  max-width: none;
  max-height: none;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  color: var(--text);
}

.sheet::backdrop {
  background: rgb(0 0 0 / 0.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  backdrop-filter: blur(16px) saturate(1.2);
}

.sheet[open] {
  animation: sheet-in 0.5s var(--ease);
}

.sheet[open]::backdrop {
  animation: fade-in 0.5s var(--ease);
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

.sheet__panel {
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 720px);
  overflow: hidden;
  border: 1px solid var(--hairline);
  border-radius: 22px;
  background: rgb(28 28 30 / 0.78);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  backdrop-filter: blur(40px) saturate(1.8);
  box-shadow: 0 50px 120px -20px rgb(0 0 0 / 0.7);
}

.sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 12px 28px;
}

.sheet__eyebrow {
  margin: 0 0 6px;
  color: rgb(var(--accent-rgb, 245 245 247));
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.sheet__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.022em;
}

.sheet__body {
  padding: 4px 28px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: #d1d1d6;
  font-size: 17px;
  line-height: 1.6;
  letter-spacing: -0.01em;
}

.sheet__body > :first-child {
  margin-top: 0;
}

.sheet__body > :last-child {
  margin-bottom: 0;
}

.sheet__body p {
  margin: 0 0 0.9em;
}

.sheet__footer {
  display: flex;
  justify-content: flex-end;
  padding: 18px 24px 24px;
}

.icon-button {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--glass);
  cursor: pointer;
  transition: background-color 0.25s;
}

.icon-button:hover {
  background: var(--glass-strong);
}

.icon-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
```

then the updated reduced-motion block, last in the file:

```css
@media (prefers-reduced-motion: reduce) {
  .ambient__layer,
  .dots__track,
  .dot,
  .nav-button,
  .card__face--front img {
    transition-duration: 0.01ms;
  }

  .card {
    transition: none;
  }

  .sheet[open],
  .sheet[open]::backdrop {
    animation: none;
  }
}
```

- [ ] **Step 6: Rebuild and run tests**

Run: `npm test && npm run build && npm run showcase`
Expected: tests PASS; both builds succeed. Servers from Task 5 still running (restart them if not).

- [ ] **Step 7: Browser-verify flip on the showcase (Review Focus #1)**

At `http://localhost:8790/` (piece 1, long thoughts), 1440×900:
- Click the artwork → card rotates; back shows accent-coloured "THOUGHTS" label, serif text, "FIRST IMPRESSIONS" heading, list, the literal text `A literal <tag> should show as text.`; pill reads `Artwork`. The reflection rotates in sync (screenshot mid-way with a ~400ms wait, and after).
- Scroll inside the back (`browser_evaluate`: set `.card__thoughts` `scrollTop` to its `scrollHeight`) → signature `— Tall Piece` visible at the bottom.
- Click on the back text → stays flipped. Press `Escape` → front again. Press `F` → back; press `F` → front.
- Flip, then press `ArrowRight` → piece 2 shows front-side (new slide).
- Piece 3 (Square, no thoughts): no Thoughts pill, clicking artwork does nothing, cursor is default.
- 390×844: flip piece 1, text legible, scroll works, no horizontal overflow.

- [ ] **Step 8: Browser-verify the prompt sheet**

At `http://localhost:8789/` (real gallery), 1440×900:
- Click `Prompt +` → sheet with eyebrow "PROMPT", title "Claude Opus 5.5", body "Lets do something fun, with the xuan mcp, … you, Claude Opus 5.5 would look like, …". Backdrop blurred.
- Click **Copy prompt** → label "Copied"; `browser_evaluate` `navigator.clipboard.readText()` (grant permission if prompted) equals the plain text.
- `Escape` closes; reopen, click backdrop closes; reopen, `×` closes. While open, `ArrowRight` does nothing.
- Go to Kimi → prompt says "you, Kimi K3 would look like" after Task 7's `gallery.json` (until then "Kimi K3 Self Portrait" — expected at this point).
- Console: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/gallery.js src/styles.css
git commit -m "Add flip-to-read thoughts and prompt sheet"
```

---

### Task 7: Content, docs and full verification

**Files:**
- Create: `gallery.json`, `README.md`
- Modify: (fixes found during verification only)

**Interfaces:**
- Consumes: the whole pipeline.

- [ ] **Step 1: Write `gallery.json`**

```json
{
  "Deepseek v4 Flash.png": { "title": "DeepSeek v4 Flash", "subtitle": "Self Portrait" },
  "kimi-k3-self-portrait.png": { "title": "Kimi K3", "subtitle": "Self Portrait" }
}
```

- [ ] **Step 2: Write `README.md`**

````markdown
# llmart

Self-portraits painted by AI models, shown one at a time in a minimalist gallery.
A static site on Cloudflare Workers, rebuilt automatically from this repo.

## Add a piece

1. **Drop the image into `images/`** — PNG, JPG, WebP or AVIF, any size (the build resizes it).
   The filename becomes the caption:

   | Filename | Caption |
   |---|---|
   | `Claude Opus 5.5 - Self Portrait.png` | **Claude Opus 5.5** · Self Portrait |
   | `Deepseek v4 Flash.png` | **Deepseek v4 Flash** |
   | `kimi-k3-self-portrait.png` | **Kimi K3 Self Portrait** |

2. **Optional extras**, named after the image (same name, different ending):
   - `images/<name>.thoughts.md` — the model's thoughts, written on the back of the card.
   - `images/<name>.prompt.md` — only if this piece's prompt differs from `prompt.md`.

3. **Commit and push to `main`.** On GitHub this works entirely in the browser:
   open `images/` → **Add file → Upload files**. Cloudflare rebuilds and deploys in about a minute.

## Fix a caption or the order — `gallery.json`

```json
{
  "kimi-k3-self-portrait.png": { "title": "Kimi K3", "subtitle": "Self Portrait", "order": 1 }
}
```

- `title`, `subtitle` (`""` removes it) and `order` (lower numbers first; pieces without
  one follow alphabetically).
- Keys must match the filename exactly. If one doesn't, the build fails and tells you which.

## The shared prompt — `prompt.md`

Shown on every piece under **Prompt +**. `{{model}}` is replaced with the piece's title.

## Local development

```bash
npm install
npm run dev        # build, then serve at http://localhost:8787
npm test           # unit and build tests
npm run showcase   # synthetic edge-case gallery in .showcase/dist
```

## Deployment (one-time setup)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick this repo.
3. Name the Worker `llmart` (it must match `name` in `wrangler.jsonc`).
   Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
4. Deploy. From then on every push to `main` goes live, and other branches get preview URLs.

You can also deploy from your machine with `npm run deploy` (after `npx wrangler login`).
````

Check the dashboard wording in step 2–3 against Cloudflare's current Workers Builds docs (WebFetch `https://developers.cloudflare.com/workers/ci-cd/builds/`) and correct it if the labels differ.

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test && npm run build`
Expected: all tests PASS; `Built 3 pieces → dist`.

- [ ] **Step 4: Verify under the real Workers runtime**

Run in background: `npx wrangler dev --port 8787`
Then:
- `curl -sI http://localhost:8787/` → `200`, `content-type: text/html`.
- `curl -sI "http://localhost:8787/$(node -e "const h=require('fs').readFileSync('dist/index.html','utf8');console.log(JSON.parse(h.match(/gallery-data\">(.*?)<\/script>/s)[1])[0].src)")"` → `200`, `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable`.
- `curl -sI http://localhost:8787/styles.css` → `200`.

- [ ] **Step 5: Full browser pass on `http://localhost:8787/`**

Desktop 1440×900 and phone 390×844, for each of the three pieces:
- Screenshot; check caption text: "Claude Opus 5.5 / Self Portrait", "DeepSeek v4 Flash / Self Portrait", "Kimi K3 / Self Portrait".
- Prompt sheet for Kimi says "…you, Kimi K3 would look like…".
- No console errors; no horizontal scroll at 390px.
- `browser_emulate_media` with `reducedMotion: 'reduce'`, navigate between pieces → plain crossfade, no slide drift.
- Review the screenshots critically for visual quality (spacing, glow strength, reflection opacity, caption overlap, button placement). Tune values in `src/styles.css` where something looks off, rebuild, re-check.

- [ ] **Step 6: Commit**

```bash
git add gallery.json README.md images prompt.md src
git commit -m "Add content overrides, README and verification fixes"
```

---

### Task 8: Publish to GitHub and Cloudflare (requires the owner's go-ahead)

**Files:** none

- [ ] **Step 1: Ask the owner** for the GitHub repo name (default `llmart`), visibility (public/private), and whether to deploy once from this machine now. Do not proceed without an explicit answer.

- [ ] **Step 2: Create and push**

Run: `gh repo create <name> --<public|private> --source . --remote origin --push`
Expected: repo URL printed; `git status -sb` shows `main...origin/main`.

- [ ] **Step 3 (if approved): First deploy from this machine**

Run: `npx wrangler whoami` (if not logged in, ask the owner to run `! npx wrangler login`), then `npm run deploy`.
Expected: a `https://llmart.<subdomain>.workers.dev` URL; open it and confirm the gallery loads.

- [ ] **Step 4: Hand over the Workers Builds connection**

The Git connection is made in the Cloudflare dashboard by the owner (README → Deployment). Give them the exact steps and settings from the README.
