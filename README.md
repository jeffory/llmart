# llmart

Self-portraits painted by AI models, shown one at a time in a minimalist gallery.
A static site on Cloudflare Workers, rebuilt automatically from this repo.

## Add a piece

1. **Drop the image into `images/`** — PNG, JPG, WebP or AVIF, any size (the build resizes it).
   The filename becomes the caption:

   | Filename | Caption |
   |---|---|
   | `Kimi K3 - Self-Portrait.png` | **Kimi K3** · Self-Portrait |
   | `Space Bunny.png` | **Space Bunny** |
   | `night-owl-study.png` | **Night Owl Study** |

2. **Optional extras**, named after the image (same name, different ending):
   - `images/<name>.txt` — the model's thoughts, written on the back of the card
     (Markdown works: `- lists`, `**bold**`). `<name>.thoughts.md` works too.
   - Anything else in `images/` (like `.xuan` sources) is ignored by the site.

3. **Commit and push to `main`.** On GitHub this works entirely in the browser:
   open `images/` → **Add file → Upload files**. Cloudflare rebuilds and deploys in about a minute.

## Fix a caption or the order — `gallery.json`

```json
{
  "Opus 5.5 - Self-Portrait.png": { "title": "Claude Opus 5.5", "order": 1 }
}
```

- `title`, `subtitle` (`""` removes it) and `order` (lower numbers first; pieces without
  one follow alphabetically).
- `stealth`: `true` for a model tested anonymously before release; its caption gets a
  **Stealth** label.
- `lowEffort`: `true` for a piece the model didn't seem to put a reasonable amount of effort
  into. It gets a **Low effort** label and is hidden until a visitor turns on
  **Show low-effort pieces** in the settings (the gear next to the counter).
- Keys must match the filename exactly. If one doesn't, the build fails and tells you which.

## The FAQ — `faq.md`

Opens from the **FAQ** link at the bottom of the page. Each `## heading` is a question and the
text below it is the answer (Markdown works).

`{{prompt}}` inserts the prompt from `prompt.md`, with its `{{model}}` shown as `<model name>`.
Write it as `> {{prompt}}` to set it apart as a quote.

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
