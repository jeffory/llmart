# llmart — Gallery Design

**Date:** 2026-10-07
**Status:** Approved in conversation, pending spec review

## Purpose

A minimalist, Apple-product-page-styled web gallery showing AI models' self-portraits
one at a time. Each piece has a mirror reflection, a caption, an optional prompt and the
model's optional "thoughts" written on the back of the card. Adding a piece must be as
easy as dropping a file into `images/` and pushing to GitHub.

### Success criteria

- Adding a piece = upload one image file to `images/` (GitHub web UI is enough) → site
  updates automatically. No list to edit, no local tooling required.
- Captions are right without configuration for sensibly named files; anything else is
  fixable in one optional JSON file.
- The page feels premium: smooth motion, no layout shift, fast loads on mobile.
- Hosted as a Cloudflare Worker (static assets only), deployed from GitHub.

### Non-goals (YAGNI)

No CMS/admin UI, no auth, no runtime storage (R2/KV/D1), no framework, no analytics,
no multiple image sizes/srcset, no comments or likes.

## 1. Visitor experience

### Stage
- Full-viewport near-black stage (`#050506`-ish), dark theme only.
- Thin top bar: `llmart` wordmark left, counter `01 / 03` right.
- Type: system San Francisco on Apple devices, Inter elsewhere (Google Fonts); tight
  tracking, generous whitespace. Serif for card backs: `ui-serif` ("New York" on Apple),
  Newsreader fallback (Google Fonts).

### Artwork card
- Centered; height ≈ 60vh on desktop (smaller on phones so caption, reflection and nav
  fit), width derived from the image's aspect ratio and clamped to viewport minus a
  16px gutter each side. Small corner radius.
- Layout dimensions come from build-time metadata, so there is no layout shift.
- **Reflection:** a mirrored copy of the card directly beneath (`scaleY(-1)`), ~25%
  opacity, slight blur, masked with a gradient so it fades out over ~35% of the card
  height — reads as a polished black floor. Built with a cloned element + `mask-image`
  (not `-webkit-box-reflect`, which Firefox lacks). Reflection is `aria-hidden`/inert.
- **Ambient glow:** a large, soft blurred radial light behind the card in the piece's
  accent colour (computed at build), crossfading between pieces.

### Caption
Under the reflection: title large and semibold (e.g. "Claude Opus 5.5"), subtitle muted
gray (e.g. "Self Portrait"). Below it, up to two frosted "pills":
- **`Prompt +`** — shown when the piece has a prompt (own or shared).
- **`Thoughts ↻`** — shown when the piece has a thoughts file.

### Prompt panel
`Prompt +` opens a native `<dialog>`: frosted-glass panel over a dimmed, blurred stage;
prompt rendered from Markdown in a readable column; **Copy** button copies the raw prompt
text and briefly shows "Copied". Closes via ×, Esc, or clicking the backdrop.

### Thoughts (card flip)
- `Thoughts ↻`, clicking/tapping the artwork, or the `F` key flips the card in 3D
  (rotateY) to show the back. The reflection flips in sync (it is a clone of the card).
- Back design ("matte dark card"): near-black card stock with fine grain, the piece's
  accent colour glowing faintly through; small-caps "THOUGHTS" label; thoughts rendered
  from Markdown in the serif; scrolls inside the card with soft fade edges top/bottom;
  signed at the bottom in italic: "— {title}".
- Esc or flipping again returns to the front; navigating to another piece resets to front.
- Pieces without thoughts: no pill, no flip, normal cursor.

### Navigation
- Frosted circular chevron buttons either side of the card (desktop); on narrow screens
  they move to the bottom row flanking the dots.
- `←`/`→` keys, horizontal swipe (≥ 50px; vertical gestures left alone so the card back
  can scroll), Apple-style dots (active dot stretches into a pill; dots are clickable).
- Wraps around at both ends.
- Motion: outgoing piece fades, drifts in the direction of travel and scales to ~0.96;
  incoming piece eases in; ~600ms, Apple-like `cubic-bezier(0.25, 1, 0.5, 1)`.
  `prefers-reduced-motion`: plain crossfade, no flip animation (instant face swap).

### Details
- Deep links: each piece's URL hash is its slug (`/#kimi-k3-self-portrait`); loading a
  hash opens that piece; navigating updates the hash via `history.replaceState`.
- Neighbouring images preloaded.
- Screen-reader live region announces "2 of 3: Kimi K3, Self Portrait"; all controls are
  real buttons with labels; flip button uses `aria-pressed`.
- Empty state (no images): a quiet centered "No pieces yet" message.

## 2. Content model and build

### Content files
```
images/
  <name>.png|jpg|jpeg|webp|avif     the artwork (required)
  <name>.thoughts.md                 optional: model's thoughts (card back)
  <name>.prompt.md                   optional: overrides the shared prompt
prompt.md                            optional: shared prompt for every piece
gallery.json                         optional: caption/order overrides
```
`<name>` is the image filename without its extension. Sidecars match by exact `<name>`.

**Prompt template:** in any prompt (shared or per-image), `{{model}}` is replaced with the
piece's final title (after overrides), e.g. "…what you think, you, Kimi K3 would look
like…". Substitution happens before Markdown rendering, so it applies to both the
displayed and the copied text.

### Captions from filenames
1. Strip the extension.
2. If the name contains no spaces, replace `-` and `_` with spaces and capitalise the
   first letter of each word (`kimi-k3-self-portrait` → `Kimi K3 Self Portrait`).
   Names with spaces keep their casing as typed (`Deepseek v4 Flash`).
3. Split on the first ` - ` (space-hyphen-space): left = title, right = subtitle.
   No separator → title only, no subtitle.

### `gallery.json` overrides
Optional. Object keyed by exact image filename:
```json
{
  "kimi-k3-self-portrait.png": { "title": "Kimi K3", "subtitle": "Self Portrait", "order": 3 }
}
```
- Allowed keys: `title` (string), `subtitle` (string; `""` removes it), `order` (number).
- Initial content: `Deepseek v4 Flash.png` → `DeepSeek v4 Flash` / `Self Portrait`;
  `kimi-k3-self-portrait.png` → `Kimi K3` / `Self Portrait`.

### Ordering
Pieces with `order` first, ascending; ties and all others by filename, case-insensitive
alphabetical.

### Slugs
Lowercased name, runs of non-alphanumerics → `-`, trimmed of leading/trailing `-`
(`Claude Opus 5.5 - Self Portrait` → `claude-opus-5-5-self-portrait`). Collisions get
`-2`, `-3`, … in sort order.

### Build (`npm run build` → `scripts/build.mjs`)
1. Read `images/`, `gallery.json`, `prompt.md`, sidecar `.md` files.
2. Validate — fail with a clear, specific message on: invalid JSON in `gallery.json`;
   an override key naming a file that doesn't exist; unknown override fields or wrong
   types; a `.thoughts.md`/`.prompt.md` with no matching image.
3. For each image (via `sharp`): auto-rotate from EXIF, resize so the long edge
   ≤ 1600px (never upscale), encode WebP quality ~82; record output width/height;
   compute an accent colour (below). Output to `dist/img/<slug>.<hash8>.webp`, where the
   hash is of the source bytes plus encoder settings.
4. Render Markdown (prompt, thoughts) to HTML with `marked` at build time. Keep the raw
   prompt text too (for Copy). Content is the repo owner's own; no sanitisation.
5. Write `dist/index.html` from `src/index.html`, injecting the manifest as
   `<script type="application/json" id="gallery-data">` (JSON with `<` escaped as
   `<`). Copy `src/styles.css`, `src/gallery.js` to `dist/`.
6. Write `dist/_headers`: `/img/*` → `Cache-Control: public, max-age=31536000, immutable`.
   HTML/CSS/JS keep Workers' default revalidating caching.

Manifest entry shape:
```json
{
  "slug": "kimi-k3-self-portrait",
  "title": "Kimi K3",
  "subtitle": "Self Portrait",
  "src": "img/kimi-k3-self-portrait.1a2b3c4d.webp",
  "width": 900, "height": 1600,
  "accent": "#3fb8e6",
  "promptHtml": "<p>…</p>", "promptText": "…",
  "thoughtsHtml": "<p>…</p>"
}
```
Optional fields are `null` when absent.

### Accent colour
Downscale to ~48×48, read RGB pixels. Keep pixels with HSL lightness 0.15–0.85 and
saturation ≥ 0.25; average them weighted by saturation. If none qualify, use the plain
average. Then clamp the result to a glow-friendly range (lightness ~0.55, saturation
≥ 0.5) so near-black images still produce a visible tint. Pure function, unit tested.

## 3. Repo and deployment

```
images/              art + optional sidecars
prompt.md            shared prompt (optional)
gallery.json         optional overrides
src/                 index.html, styles.css, gallery.js
scripts/build.mjs    build entry (I/O, sharp, marked)
scripts/lib/gallery.mjs   pure logic: captions, slugs, overrides, sort, validation,
                          accent, HTML-safe JSON — unit tested
test/                node:test unit tests + a build smoke test on a fixture
dist/                generated (git-ignored)
wrangler.jsonc       { name: "llmart", compatibility_date, assets: { directory: "./dist" } }
.node-version        22
README.md            "How to add a piece" in 3 steps + local dev
```

- `package.json` scripts: `build`, `dev` (build + `wrangler dev`), `deploy`
  (build + `wrangler deploy`), `test` (`node --test`). Dev dependencies: `sharp`,
  `marked`, `wrangler`.
- **Deploy:** Cloudflare Workers Builds connected to the GitHub repo. Build command
  `npm run build`, deploy command `npx wrangler deploy`. Push to `main` → production;
  other branches → preview URLs. No API token stored in GitHub.
- GitHub repo creation and first push happen only after explicit approval.

## 4. Testing

- **Unit (node:test):** caption derivation (spaces / no spaces / separator / no
  separator), slugify + collisions, override merge incl. `subtitle: ""`, ordering,
  validation errors (bad JSON, missing file, unknown key, wrong type, orphan sidecar),
  shared vs per-image prompt resolution, `{{model}}` substitution, accent picking (vivid, near-black, grayscale),
  HTML-safe JSON escaping.
- **Build smoke test:** run the build against a temp fixture (generated PNGs + sidecars)
  and assert `dist/` contents: index with valid embedded manifest, hashed WebPs within
  1600px, `_headers`.
- **Browser verification (Playwright):** desktop and phone viewports — navigation via
  buttons/keys/dots, wrap-around, deep link, flip + reflection sync, prompt dialog +
  copy, reduced motion, no console errors, screenshots reviewed for visual quality.

## Content

- `prompt.md` (shared, provided by owner — kept verbatim apart from `{{model}}`):
  "Lets do something fun, with the xuan mcp, I want you to paint a picture of what you
  think, you, {{model}} would look like, be detailed, be abstract as you would like take
  your time"
- Pieces whose prompt differed get an `images/<name>.prompt.md` when the owner supplies it.
- `*.thoughts.md` files: owner supplies later. Until then the Thoughts pill stays hidden;
  verification uses fixture content.
