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
  const text = '\uFEFF{ "kimi-k3-self-portrait.png": { "title": "Kimi K3", "subtitle": "", "order": 2 } }';
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
      { file: 'a.thoughts.md', name: 'a', kind: 'thoughts', text: '\uFEFFI see **light**.\n' },
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

test('planGallery rejects two thoughts files for the same image', () => {
  assert.throws(
    () =>
      planGallery({
        images: ['a.png'],
        sidecars: [
          { file: 'a.txt', name: 'a', kind: 'thoughts', text: 'one' },
          { file: 'a.thoughts.md', name: 'a', kind: 'thoughts', text: 'two' },
        ],
      }),
    galleryError(/images\/a\.txt.*images\/a\.thoughts\.md/),
  );
});

test('planGallery returns an empty list for no images', () => {
  assert.deepEqual(planGallery({ images: [] }), []);
});
