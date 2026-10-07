// llmart gallery: renders the pieces embedded by the build, one at a time.
(() => {
  'use strict';

  const DURATION = 650;
  const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const SWIPE_DISTANCE = 50;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (selector) => document.querySelector(selector);
  const els = {
    root: document.documentElement,
    stage: $('[data-stage]'),
    viewport: $('[data-viewport]'),
    dock: $('[data-dock]'),
    prev: $('[data-prev]'),
    next: $('[data-next]'),
    dotsWindow: $('[data-dots-window]'),
    dots: $('[data-dots]'),
    counter: $('[data-counter]'),
    counterCurrent: $('[data-counter-current]'),
    counterTotal: $('[data-counter-total]'),
    live: $('[data-live]'),
    glowLayers: [...document.querySelectorAll('.ambient__layer')],
    dialog: $('[data-prompt-dialog]'),
    promptTitle: $('[data-prompt-title]'),
    promptBody: $('[data-prompt-body]'),
    copyPrompt: $('[data-copy-prompt]'),
    closePrompt: $('[data-close-prompt]'),
  };

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
    flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20.5V16h-4.5"/></svg>',
  };

  const pieces = readPieces();
  let index = -1;
  let current = null;
  let activeGlow = 0;

  function readPieces() {
    try {
      const data = JSON.parse(document.getElementById('gallery-data')?.textContent ?? '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('llmart: could not read gallery data', error);
      return [];
    }
  }

  // ---- Helpers ----

  function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
    return node;
  }

  function hexToRgb(hex) {
    const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x8c8c8c;
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
  }

  const describe = (piece) => (piece.subtitle ? `${piece.title}, ${piece.subtitle}` : piece.title);
  const wrap = (i) => (i + pieces.length) % pieces.length;
  const pad = (n) => String(n).padStart(Math.max(2, String(pieces.length).length), '0');

  // ---- Slides ----

  function createSlide(piece, position, { eager = false } = {}) {
    const slide = el('article', 'slide', {
      'aria-roledescription': 'slide',
      'aria-label': `${position + 1} of ${pieces.length}`,
      'data-flippable': Boolean(piece.thoughtsHtml),
    });
    slide.style.setProperty('--ar', (piece.width / piece.height).toFixed(5));
    slide.style.setProperty('--accent-rgb', hexToRgb(piece.accent));

    const frame = el('div', 'piece__frame');
    frame.append(createCard(piece, { mirror: false, eager }));

    const reflectionStage = el('div', 'reflection__stage');
    reflectionStage.append(createCard(piece, { mirror: true }));
    const reflection = el('div', 'reflection', { 'aria-hidden': 'true' });
    reflection.append(reflectionStage);

    const pieceEl = el('div', 'piece');
    pieceEl.append(frame, reflection);
    slide.append(pieceEl, createCaption(piece));
    return slide;
  }

  function createCard(piece, { mirror, eager = false }) {
    const card = el('div', 'card');
    const front = el('div', 'card__face card__face--front', { 'data-front': !mirror });
    const img = el('img', mirror ? 'mirror' : null, {
      src: piece.src,
      alt: mirror ? '' : describe(piece),
      width: piece.width,
      height: piece.height,
      decoding: 'async',
      draggable: 'false',
      fetchpriority: eager ? 'high' : null,
    });
    const markLoaded = () => front.classList.add('is-loaded');
    if (img.complete && img.naturalWidth) markLoaded();
    else img.addEventListener('load', markLoaded, { once: true });
    front.append(img);
    card.append(front);

    if (piece.thoughtsHtml) {
      const back = el('div', 'card__face card__face--back', { inert: !mirror });
      back.append(el('div', mirror ? 'card__surface mirror' : 'card__surface'));
      if (!mirror) back.append(createThoughts(piece));
      card.append(back);
    }
    return card;
  }

  function createThoughts(piece) {
    const scroller = el('div', 'card__thoughts', {
      tabindex: '0',
      role: 'region',
      'aria-label': `${piece.title}'s thoughts`,
    });
    const label = el('p', 'card__label');
    label.textContent = 'Thoughts';
    const text = el('div', 'card__text');
    text.innerHTML = piece.thoughtsHtml;
    const signature = el('p', 'card__signature');
    signature.textContent = `— ${piece.title}`;
    scroller.append(label, text, signature);
    return scroller;
  }

  function createCaption(piece) {
    const caption = el('div', 'caption');
    const title = el('h2', 'caption__title');
    title.textContent = piece.title;
    caption.append(title);
    if (piece.subtitle) {
      const subtitle = el('p', 'caption__subtitle');
      subtitle.textContent = piece.subtitle;
      caption.append(subtitle);
    }
    const actions = el('div', 'caption__actions');
    if (piece.promptHtml) actions.append(pill('Prompt', ICONS.plus, { 'data-action': 'prompt', 'aria-haspopup': 'dialog' }));
    if (piece.thoughtsHtml) actions.append(pill('Thoughts', ICONS.flip, { 'data-action': 'flip' }));
    if (actions.childElementCount > 0) caption.append(actions);
    return caption;
  }

  function pill(label, icon, attrs) {
    const button = el('button', 'pill', { type: 'button', ...attrs });
    const text = el('span', 'pill__label');
    text.textContent = label;
    button.append(text);
    button.insertAdjacentHTML('beforeend', icon);
    return button;
  }

  // ---- Navigation ----

  function go(target, direction = 0, { initial = false } = {}) {
    if (pieces.length === 0) return;
    const nextIndex = wrap(target);
    if (nextIndex === index) return;
    const previous = current;
    // Drop slides still leaving from an interrupted transition.
    for (const stale of els.viewport.querySelectorAll('.slide.is-leaving')) stale.remove();
    const slide = createSlide(pieces[nextIndex], nextIndex, { eager: initial });
    els.viewport.append(slide);
    index = nextIndex;
    current = slide;
    updateChrome({ initial });
    measure(); // before animating, so transforms don't skew the measurement
    animateIn(slide, direction, initial);
    if (previous) animateOut(previous, direction);
    preloadNeighbours();
  }

  const next = () => go(index + 1, 1);
  const prev = () => go(index - 1, -1);

  function animateIn(slide, direction, initial) {
    if (reducedMotion.matches) {
      slide.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' });
      return;
    }
    const from = initial
      ? { opacity: 0, transform: 'translateY(16px) scale(0.985)' }
      : { opacity: 0, transform: `translateX(${direction * 5}%) scale(0.97)` };
    slide.animate([from, { opacity: 1, transform: 'none' }], {
      duration: initial ? 1200 : DURATION,
      delay: initial ? 100 : 80,
      easing: EASE,
      fill: 'backwards',
    });
  }

  function animateOut(slide, direction) {
    slide.classList.add('is-leaving');
    slide.inert = true;
    slide.setAttribute('aria-hidden', 'true');
    // Freeze any in-flight entrance where it is, then leave from there.
    for (const animation of slide.getAnimations()) {
      try {
        animation.commitStyles();
      } catch {
        // Element not rendered; nothing to freeze.
      }
      animation.cancel();
    }
    const to = reducedMotion.matches
      ? { opacity: 0 }
      : { opacity: 0, transform: `translateX(${direction * -5}%) scale(0.96)` };
    const animation = slide.animate([to], {
      duration: reducedMotion.matches ? 250 : DURATION * 0.75,
      easing: EASE,
      fill: 'forwards',
    });
    animation.finished.then(() => slide.remove(), () => {});
  }

  function updateChrome({ initial }) {
    const piece = pieces[index];
    els.counterCurrent.textContent = pad(index + 1);
    els.counterTotal.textContent = pad(pieces.length);
    [...els.dots.children].forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    centerActiveDot();
    setGlow(piece.accent);
    document.title = `${piece.title} · llmart`;
    if (!initial) {
      els.live.textContent = `${index + 1} of ${pieces.length}: ${describe(piece)}`;
      history.replaceState(null, '', `#${encodeURIComponent(piece.slug)}`);
    }
  }

  function setGlow(hex) {
    const incoming = els.glowLayers[1 - activeGlow];
    incoming.style.setProperty('--glow', hexToRgb(hex));
    incoming.classList.add('is-active');
    els.glowLayers[activeGlow].classList.remove('is-active');
    activeGlow = 1 - activeGlow;
  }

  // Positions the desktop buttons and the glow around the current card. Uses layout offsets
  // (relative to the stage) rather than getBoundingClientRect, which would include the
  // slide's in-flight entrance transform.
  function measure() {
    if (!current) return;
    const frame = current.querySelector('.piece__frame');
    const top = els.stage.getBoundingClientRect().top + frame.offsetTop;
    els.root.style.setProperty('--card-w', `${frame.offsetWidth}px`);
    els.root.style.setProperty('--card-h-px', `${frame.offsetHeight}px`);
    els.root.style.setProperty('--nav-y', `${top + frame.offsetHeight / 2}px`);
    els.root.style.setProperty('--floor-y', `${top + frame.offsetHeight}px`);
  }

  function preloadNeighbours() {
    if (pieces.length < 2) return;
    for (const i of new Set([wrap(index + 1), wrap(index - 1)])) {
      const img = new Image();
      img.decoding = 'async';
      img.src = pieces[i].src;
    }
  }

  // ---- Dots ----

  function buildDots() {
    const fragment = document.createDocumentFragment();
    pieces.forEach((piece, i) => {
      const dot = el('button', 'dot', { type: 'button', 'aria-label': `Show ${i + 1}: ${piece.title}` });
      dot.addEventListener('click', () => go(i, Math.sign(i - index)));
      fragment.append(dot);
    });
    els.dots.append(fragment);
  }

  // Long galleries scroll the dot strip to keep the active dot centred (iOS page-control style).
  // Computed from the CSS sizes rather than measured, because widths are mid-transition here.
  function centerActiveDot() {
    if (index < 0) return;
    const track = getComputedStyle(els.dots);
    const dot = parseFloat(track.getPropertyValue('--dot'));
    const active = parseFloat(track.getPropertyValue('--dot-active'));
    const gap = parseFloat(track.getPropertyValue('--dot-gap'));
    const frame = getComputedStyle(els.dotsWindow);
    const visible = els.dotsWindow.clientWidth - parseFloat(frame.paddingLeft) - parseFloat(frame.paddingRight);
    const trackWidth = (pieces.length - 1) * (dot + gap) + active;
    const overflowing = trackWidth > visible + 0.5;
    const center = index * (dot + gap) + active / 2;
    const offset = overflowing ? Math.min(0, Math.max(visible - trackWidth, visible / 2 - center)) : 0;
    els.dotsWindow.classList.toggle('fade-start', offset < 0);
    els.dotsWindow.classList.toggle('fade-end', overflowing && offset > visible - trackWidth);
    els.dots.style.transform = `translateX(${offset}px)`;
  }

  // ---- Input ----

  function setupSwipe() {
    let start = null;
    let swiped = false;
    els.stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      swiped = false;
    });
    els.stage.addEventListener('pointerup', (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swiped = true;
      if (dx < 0) next();
      else prev();
    });
    els.stage.addEventListener('pointercancel', () => {
      start = null;
    });
    // The tap that ends a swipe must not also count as a click on the card.
    els.stage.addEventListener(
      'click',
      (event) => {
        if (!swiped) return;
        swiped = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || els.dialog.open) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    } else if ((event.key === 'f' || event.key === 'F') && !event.repeat) {
      if (setFlipped(!isFlipped())) event.preventDefault();
    } else if (event.key === 'Escape' && isFlipped()) {
      setFlipped(false);
    }
  }

  function indexFromHash() {
    try {
      const slug = decodeURIComponent(location.hash.slice(1));
      return pieces.findIndex((piece) => piece.slug === slug);
    } catch {
      return -1;
    }
  }

  // ---- Thoughts (card flip) ----

  function isFlipped() {
    return Boolean(current?.classList.contains('is-flipped'));
  }

  function setFlipped(flipped) {
    if (!current || !pieces[index].thoughtsHtml) return false;
    const card = current.querySelector('.piece__frame .card');
    const pillButton = current.querySelector('[data-action="flip"]');
    // Don't strand keyboard focus inside the face that is about to become inert.
    if (!flipped && card.contains(document.activeElement)) pillButton.focus();
    current.classList.toggle('is-flipped', flipped);
    card.querySelector('.card__face--front').inert = flipped;
    card.querySelector('.card__face--back').inert = !flipped;
    pillButton.querySelector('.pill__label').textContent = flipped ? 'Artwork' : 'Thoughts';
    return true;
  }

  // ---- Prompt sheet ----

  let copyTimer;

  function setCopyLabel(text) {
    els.copyPrompt.textContent = text;
  }

  function openPrompt() {
    const piece = pieces[index];
    if (!piece?.promptHtml || els.dialog.open) return;
    els.promptTitle.textContent = piece.title;
    els.promptBody.innerHTML = piece.promptHtml;
    els.dialog.style.setProperty('--accent-rgb', hexToRgb(piece.accent));
    clearTimeout(copyTimer);
    setCopyLabel('Copy prompt');
    els.dialog.showModal();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API unavailable (insecure context) or denied: fall back to a selection copy.
      const area = el('textarea', 'visually-hidden');
      area.value = text;
      els.dialog.append(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
      return copied;
    }
  }

  function setupPrompt() {
    els.closePrompt.addEventListener('click', () => els.dialog.close());
    // Clicks on the backdrop land on the <dialog> itself; clicks in the panel don't.
    els.dialog.addEventListener('click', (event) => {
      if (event.target === els.dialog) els.dialog.close();
    });
    els.copyPrompt.addEventListener('click', async () => {
      const copied = await copyText(pieces[index].promptText);
      setCopyLabel(copied ? 'Copied' : 'Copy failed');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => setCopyLabel('Copy prompt'), 1800);
    });
  }

  function onViewportClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'prompt') openPrompt();
    else if (action === 'flip') setFlipped(!isFlipped());
    else if (event.target.closest('[data-front]')) setFlipped(true);
  }

  // ---- Start ----

  function renderEmpty() {
    const empty = el('div', 'empty');
    empty.innerHTML =
      '<p class="empty__title">No pieces yet</p><p class="empty__hint">Add an image to <code>images/</code> and deploy.</p>';
    els.viewport.append(empty);
  }

  function init() {
    if (pieces.length === 0) {
      renderEmpty();
      return;
    }
    els.counter.hidden = false;
    els.dock.hidden = pieces.length < 2;
    buildDots();
    els.prev.addEventListener('click', prev);
    els.next.addEventListener('click', next);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('hashchange', () => {
      const target = indexFromHash();
      if (target !== -1) go(target, Math.sign(target - index));
    });
    const relayout = () => {
      measure();
      centerActiveDot();
    };
    window.addEventListener('resize', relayout);
    document.fonts?.ready.then(relayout);
    setupSwipe();
    setupPrompt();
    els.viewport.addEventListener('click', onViewportClick);
    const start = indexFromHash();
    go(start === -1 ? 0 : start, 0, { initial: true });
  }

  init();
})();
