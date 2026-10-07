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
