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
