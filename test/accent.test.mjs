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
  const value = { text: '</script><script>alert(1)</script>', line: 'a\u2028b', dollar: '$&' };
  const json = htmlSafeJson(value);
  assert.ok(!json.includes('<'));
  assert.ok(!json.includes('\u2028'));
  assert.deepEqual(JSON.parse(json), value);
});
