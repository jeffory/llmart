import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillFaq, GalleryError, parseOverrides, planGallery } from '../scripts/lib/gallery.mjs';

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
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": { "model": "x" } }', images), galleryError(/unknown field "model"/));
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": { "order": "1" } }', images), galleryError(/"order" must be a number/));
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": { "stealth": "yes" } }', images), galleryError(/"stealth" must be a boolean/));
  assert.throws(() => parseOverrides('{ "Deepseek v4 Flash.png": "DeepSeek" }', images), galleryError(/must be an object/));
});

test('planGallery derives captions, sorts alphabetically and assigns slugs', () => {
  const pieces = planGallery({ images: [...images].reverse() });
  assert.deepEqual(pieces.map((p) => [p.title, p.subtitle, p.slug]), [
    ['Claude Opus 5.5', 'Self Portrait', 'claude-opus-5-5-self-portrait'],
    ['Deepseek v4 Flash', null, 'deepseek-v4-flash'],
    ['Kimi K3 Self Portrait', null, 'kimi-k3-self-portrait'],
  ]);
  assert.deepEqual(Object.keys(pieces[0]).sort(), ['file', 'slug', 'stealth', 'subtitle', 'thoughts', 'title']);
});

test('planGallery marks stealth pieces from overrides; everything else is not stealth', () => {
  const overrides = parseOverrides('{ "Deepseek v4 Flash.png": { "stealth": true }, "kimi-k3-self-portrait.png": { "stealth": false } }', images);
  const pieces = planGallery({ images, overrides });
  assert.deepEqual(pieces.map((p) => [p.file, p.stealth]), [
    ['Claude Opus 5.5 - Self Portrait.png', false],
    ['Deepseek v4 Flash.png', true],
    ['kimi-k3-self-portrait.png', false],
  ]);
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

test('planGallery attaches thoughts and treats blank text as absent', () => {
  const pieces = planGallery({
    images: ['a.png', 'b.png'],
    sidecars: [
      { file: 'a.thoughts.md', name: 'a', kind: 'thoughts', text: '\uFEFFI see **light**.\n' },
      { file: 'b.thoughts.md', name: 'b', kind: 'thoughts', text: ' \n ' },
    ],
  });
  assert.deepEqual(pieces.map((p) => p.thoughts), ['I see **light**.', null]);
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

test('fillFaq returns null when faq.md is missing or blank', () => {
  assert.equal(fillFaq(null, 'prompt'), null);
  assert.equal(fillFaq(' \n', 'prompt'), null);
});

test('fillFaq fills {{prompt}} from prompt.md, naming no model in particular', () => {
  const faq = fillFaq('\uFEFF## What was the prompt?\n\n{{ prompt }}\n', 'Paint you, {{model}}, as {{ model }} sees it.\n');
  assert.equal(faq, '## What was the prompt?\n\nPaint you, <model name>, as <model name> sees it.');
});

test('fillFaq keeps a quoted {{prompt}} quoted across every line of the prompt', () => {
  assert.equal(fillFaq('Q\n\n> {{prompt}}', 'One\n\nTwo $&'), 'Q\n\n> One\n> \n> Two $&');
  assert.equal(fillFaq('It said "{{prompt}}".', 'Hi'), 'It said "Hi".');
});

test('fillFaq needs prompt.md only when the FAQ uses {{prompt}}', () => {
  assert.equal(fillFaq('## Who paints these?\n\nThe {{model}}s.', null), '## Who paints these?\n\nThe <model name>s.');
  assert.throws(() => fillFaq('> {{prompt}}', '  '), galleryError(/faq\.md uses \{\{prompt\}\}.*prompt\.md/));
});
