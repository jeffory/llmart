// llmart search: which pieces match a query, and how the search panel groups them.
// A plain script (no modules) so the page can load it as-is; the tests import it too.
(() => {
  'use strict';

  // The labs most visitors look for, listed first. Every other creator follows A–Z.
  const FEATURED = ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Meta'];
  // Names people search for that aren't in the creator's own name.
  const ALIASES = { anthropic: 'claude', openai: 'chatgpt', google: 'deepmind' };
  const UNKNOWN = 'Creator unknown';
  const STEALTH = 'Stealth';
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

  // "GPT-6.1 Sol" → "gpt61sol", so "gpt6", "GPT 6.1" and "gpt-6.1" all find it.
  const compact = (text) =>
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

  const creatorKey = (creator) => creator.toLowerCase();

  function searchText(piece) {
    const parts = [piece.title];
    if (piece.creator) parts.push(piece.creator, ALIASES[creatorKey(piece.creator)] ?? '');
    if (piece.stealth) parts.push('stealth');
    return compact(parts.join(' '));
  }

  // Every word of the query has to appear in the piece's name, creator or labels.
  function matches(piece, query) {
    const words = query.split(/\s+/).map(compact).filter(Boolean);
    if (words.length === 0) return true;
    const text = searchText(piece);
    return words.every((word) => text.includes(word));
  }

  function rank(name) {
    if (name === STEALTH) return FEATURED.length + 2;
    if (name === UNKNOWN) return FEATURED.length + 1;
    const featured = FEATURED.findIndex((lab) => creatorKey(lab) === creatorKey(name));
    return featured === -1 ? FEATURED.length : featured;
  }

  // [{ name, pieces }], big labs first, then other creators A–Z, then unknown, then stealth.
  // Pieces keep their gallery order within a group.
  function groupPieces(pieces) {
    const groups = new Map();
    for (const piece of pieces) {
      const name = piece.stealth ? STEALTH : piece.creator || UNKNOWN;
      const key = creatorKey(name);
      if (!groups.has(key)) {
        const featured = FEATURED.find((lab) => creatorKey(lab) === key);
        groups.set(key, { name: featured ?? name, pieces: [] });
      }
      groups.get(key).pieces.push(piece);
    }
    return [...groups.values()].sort((a, b) => rank(a.name) - rank(b.name) || collator.compare(a.name, b.name));
  }

  globalThis.llmartSearch = { matches, groupPieces };
})();
