import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionFromFilename, classifyFiles, slugify, splitExtension } from '../scripts/lib/gallery.mjs';

test('splitExtension lowercases the extension and keeps dotted names intact', () => {
  assert.deepEqual(splitExtension('Claude Opus 5.5 - Self-Portrait.PNG'), {
    name: 'Claude Opus 5.5 - Self-Portrait',
    ext: '.png',
  });
  assert.deepEqual(splitExtension('README'), { name: 'README', ext: '' });
});

test('classifyFiles sorts files into images, sidecars, unsupported and ignored', () => {
  const result = classifyFiles([
    'a.png', 'B.JPG', 'c.webp', 'd.avif', 'e.jpeg',
    'a.thoughts.md', 'a.Prompt.MD', 'B.txt',
    'IMG_0001.HEIC', 'loop.gif',
    'a.xuan', '.DS_Store',
  ]);
  assert.deepEqual(result.images, ['a.png', 'B.JPG', 'c.webp', 'd.avif', 'e.jpeg']);
  assert.deepEqual(result.sidecars, [
    { file: 'a.thoughts.md', name: 'a', kind: 'thoughts' },
    { file: 'B.txt', name: 'B', kind: 'thoughts' },
  ]);
  assert.deepEqual(result.unsupported, ['IMG_0001.HEIC', 'loop.gif']);
  assert.deepEqual(result.ignored, ['a.Prompt.MD', 'a.xuan']);
});

test('captionFromFilename splits title and subtitle on the first " - "', () => {
  assert.deepEqual(captionFromFilename('Claude Opus 5.5 - Self-Portrait.png'), {
    title: 'Claude Opus 5.5',
    subtitle: 'Self-Portrait',
  });
  assert.deepEqual(captionFromFilename('A - B - C.png'), { title: 'A', subtitle: 'B - C' });
});

test('captionFromFilename spells the Self-Portrait subtitle one way, however the file spells it', () => {
  for (const spelling of ['Self Portrait', 'self-portrait', 'SELF PORTRAIT', 'SelfPortrait']) {
    assert.deepEqual(captionFromFilename(`Opus 5.5 - ${spelling}.png`), { title: 'Opus 5.5', subtitle: 'Self-Portrait' }, spelling);
  }
  assert.deepEqual(captionFromFilename('Opus 5.5 - Self-Portrait 2.png'), { title: 'Opus 5.5', subtitle: 'Self-Portrait 2' });
});

test('captionFromFilename finds a trailing Self-Portrait even without the " - " separator', () => {
  assert.deepEqual(captionFromFilename('Fable 5.1 Self-Portrait.png'), { title: 'Fable 5.1', subtitle: 'Self-Portrait' });
  assert.deepEqual(captionFromFilename('Fable 5.1 self portrait.png'), { title: 'Fable 5.1', subtitle: 'Self-Portrait' });
  assert.deepEqual(captionFromFilename('Self Portrait.png'), { title: 'Self Portrait', subtitle: null });
  assert.deepEqual(captionFromFilename('Self-Portrait Study.png'), { title: 'Self-Portrait Study', subtitle: null });
});

test('captionFromFilename keeps typed casing when the name has spaces', () => {
  assert.deepEqual(captionFromFilename('Deepseek v4 Flash.png'), { title: 'Deepseek v4 Flash', subtitle: null });
});

test('captionFromFilename turns hyphen/underscore names into title case', () => {
  assert.deepEqual(captionFromFilename('kimi-k3-self-portrait.png'), { title: 'Kimi K3', subtitle: 'Self-Portrait' });
  assert.deepEqual(captionFromFilename('night_owl__study.JPG'), { title: 'Night Owl Study', subtitle: null });
});

test('slugify makes URL-safe slugs and never returns an empty string', () => {
  assert.equal(slugify('Claude Opus 5.5 - Self-Portrait'), 'claude-opus-5-5-self-portrait');
  assert.equal(slugify('Fable 5.1 Self-Portrait'), slugify('Fable 5.1 - Self-Portrait'));
  assert.equal(slugify('Café Crème'), 'cafe-creme');
  assert.equal(slugify('通义千问'), 'piece');
});

test('classifyFiles accepts the JPEG variants browsers save (.jfif, .jpe)', () => {
  assert.deepEqual(classifyFiles(['saved.jfif', 'old.JPE']).images, ['saved.jfif', 'old.JPE']);
});
