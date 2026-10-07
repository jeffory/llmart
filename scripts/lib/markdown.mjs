import { Marked } from 'marked';

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Raw HTML is shown as text: prompts like "<the model name>" must not vanish as unknown tags.
const marked = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

export const renderMarkdown = (text) => marked.parse(text);
