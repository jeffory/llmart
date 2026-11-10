import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/search.js';

const { matches, groupPieces } = globalThis.llmartSearch;

const piece = (title, creator = null, flags = {}) => ({ title, creator, stealth: false, lowEffort: false, ...flags });
const sol = piece('GPT-6.1 Sol', 'OpenAI');
const luna = piece('GPT-6 Luna', 'OpenAI');
const opus = piece('Opus 5.5', 'Anthropic');
const bunny = piece('Space Bunny', null, { stealth: true });

test('matches finds a model by name, ignoring case and punctuation', () => {
  assert.equal(matches(sol, 'sol'), true);
  assert.equal(matches(sol, 'GPT6'), true);
  assert.equal(matches(sol, 'gpt-6.1'), true);
  assert.equal(matches(opus, 'opus 5.5'), true);
  assert.equal(matches(luna, 'sol'), false);
});

test('matches finds a model by its creator, or a familiar name for the creator', () => {
  assert.equal(matches(sol, 'openai'), true);
  assert.equal(matches(sol, 'Open AI'), true);
  assert.equal(matches(opus, 'claude'), true);
  assert.equal(matches(opus, 'openai'), false);
  assert.equal(matches(bunny, 'openai'), false);
});

test('matches needs every word of the query somewhere in the name or creator', () => {
  assert.equal(matches(sol, 'openai sol'), true);
  assert.equal(matches(luna, 'openai sol'), false);
});

test('matches finds stealth models by the word "stealth"', () => {
  assert.equal(matches(bunny, 'stealth'), true);
  assert.equal(matches(sol, 'stealth'), false);
});

test('an empty query matches everything', () => {
  assert.equal(matches(sol, ''), true);
  assert.equal(matches(bunny, '   '), true);
});

test('groupPieces puts the big labs first, then other creators A–Z, then unknown, then stealth', () => {
  const pieces = [
    piece('Kimi K3', 'Moonshot AI'),
    bunny,
    piece('Apex'),
    piece('Grok 4.7', 'xAI'),
    piece('Gemini Argon 4', 'Google'),
    opus,
    piece('Mistral Large 4', 'Mistral AI'),
    sol,
    piece('Muse Spark 1.3', 'Meta'),
    piece('GLM 5.3 Prime', 'Z.ai'),
  ];
  assert.deepEqual(
    groupPieces(pieces).map((group) => group.name),
    ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Meta', 'Mistral AI', 'Moonshot AI', 'Z.ai', 'Creator unknown', 'Stealth'],
  );
});

test('groupPieces keeps gallery order inside a group and files stealth models under Stealth', () => {
  const tipped = piece('Iceman', 'OpenAI', { stealth: true });
  const groups = groupPieces([luna, tipped, sol, bunny]);
  assert.deepEqual(
    groups.map((group) => [group.name, group.pieces.map((p) => p.title)]),
    [
      ['OpenAI', ['GPT-6 Luna', 'GPT-6.1 Sol']],
      ['Stealth', ['Iceman', 'Space Bunny']],
    ],
  );
});

test('groupPieces treats differently-cased spellings of a creator as one creator', () => {
  const groups = groupPieces([sol, piece('GPT-6 Astra', 'openai')]);
  assert.deepEqual(
    groups.map((group) => [group.name, group.pieces.length]),
    [['OpenAI', 2]],
  );
});
