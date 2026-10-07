# llmart

Self-portraits painted by AI models, shown one at a time in a minimalist gallery.
A static site on Cloudflare Workers, rebuilt automatically from this repo.

## Add a piece

1. **Drop the image into `images/`** — PNG, JPG, WebP or AVIF, any size (the build resizes it).
   The filename becomes the caption:

   | Filename | Caption |
   |---|---|
   | `Kimi K3 - Self Portrait.png` | **Kimi K3** · Self Portrait |
   | `Space Bunny.png` | **Space Bunny** |
   | `night-owl-study.png` | **Night Owl Study** |

2. **Optional extras**, named after the image (same name, different ending):
   - `images/<name>.txt` — the model's thoughts, written on the back of the card
     (Markdown works: `- lists`, `**bold**`). `<name>.thoughts.md` works too.
   - `images/<name>.prompt.md` — only if this piece's prompt differs from `prompt.md`.
   - Anything else in `images/` (like `.xuan` sources) is ignored by the site.

3. **Commit and push to `main`.** On GitHub this works entirely in the browser:
   open `images/` → **Add file → Upload files**. Cloudflare rebuilds and deploys in about a minute.

## Fix a caption or the order — `gallery.json`

```json
{
  "Opus 5.5 - Self Portrait.png": { "title": "Claude Opus 5.5", "order": 1 }
}
```

- `title`, `subtitle` (`""` removes it) and `order` (lower numbers first; pieces without
  one follow alphabetically).
- `model`: the name used for `{{model}}` in the prompt, when the title isn't simply the
  model's name (e.g. `"(Old) Claude Opus 5.5"` → `"model": "Claude Opus 5.5"`).
- `stealth`: `true` for a model tested anonymously before release; its caption gets a
  **Stealth** label.
- Keys must match the filename exactly. If one doesn't, the build fails and tells you which.

## The shared prompt — `prompt.md`

Shown on every piece under the **Prompt** link (bottom right). `{{model}}` is replaced with the piece's title
(or its `model` from `gallery.json`). A piece with its own `images/<name>.prompt.md` shows that instead.

## Local development

```bash
npm install
npm run dev        # build, then serve at http://localhost:8787
npm test           # unit and build tests
npm run showcase   # synthetic edge-case gallery in .showcase/dist
```

## Deployment (one-time setup)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create application → Import a repository**,
   and pick this repo. (Already deployed once with `npm run deploy`? Open the `llmart` Worker →
   **Settings → Builds → Connect** instead.)
3. The Worker must be named `llmart` — it has to match `name` in `wrangler.jsonc` or builds fail.
   Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   Non-production branch deploy command: `npx wrangler versions upload` (gives each branch a preview URL).
4. Deploy. From then on every push to `main` goes live.

You can also deploy from your machine with `npm run deploy` (after `npx wrangler login`).
