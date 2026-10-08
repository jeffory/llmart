// llmart gallery: renders the pieces embedded by the build, one at a time.
(() => {
  'use strict';

  const DURATION = 650;
  const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const SWIPE_DISTANCE = 50;
  // Slide height per card height: card + visible reflection (0.28) - caption overlap (0.12).
  // Mirrors .reflection in styles.css.
  const SLIDE_TO_CARD = 1.16;
  const BREATHING_ROOM = 28;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (selector) => document.querySelector(selector);
  const els = {
    root: document.documentElement,
    stage: $('[data-stage]'),
    viewport: $('[data-viewport]'),
    bottombar: $('[data-bottombar]'),
    dock: $('[data-dock]'),
    prev: $('[data-prev]'),
    next: $('[data-next]'),
    dotsWindow: $('[data-dots-window]'),
    dots: $('[data-dots]'),
    counter: $('[data-counter]'),
    counterCurrent: $('[data-counter-current]'),
    counterTotal: $('[data-counter-total]'),
    live: $('[data-live]'),
    openFaq: $('[data-open-faq]'),
    glowLayers: [...document.querySelectorAll('.ambient__layer')],
    dialog: $('[data-faq-dialog]'),
    faqBody: $('[data-faq-body]'),
    closeFaq: $('[data-close-faq]'),
    openSettings: $('[data-open-settings]'),
    settingsDialog: $('[data-settings-dialog]'),
    closeSettings: $('[data-close-settings]'),
    toggleLowEffort: $('[data-toggle-low-effort]'),
    lowEffortList: $('[data-low-effort-list]'),
  };
  const LOW_EFFORT_KEY = 'llmart:show-low-effort';
  const LOW_EFFORT_HINT = "Hidden by default: the model didn't seem to put much effort into this one";

  const ICONS = {
    flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20.5V16h-4.5"/></svg>',
  };

  // `allPieces` is everything the build shipped; `pieces` is what the gallery shows right now
  // (low-effort pieces are hidden unless the setting is on).
  const allPieces = readPieces();
  let pieces = allPieces;
  let showLowEffort = false;
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
    if (piece.subtitle || piece.stealth || piece.lowEffort) {
      const subtitle = el('p', 'caption__subtitle');
      subtitle.textContent = piece.subtitle ?? '';
      if (piece.stealth) {
        const tag = el('span', 'tag', { title: 'Tested anonymously before release' });
        tag.textContent = 'Stealth';
        subtitle.append(tag);
      }
      if (piece.lowEffort) {
        const tag = el('span', 'tag tag--quiet', { title: LOW_EFFORT_HINT });
        tag.textContent = 'Low effort';
        subtitle.append(tag);
      }
      caption.append(subtitle);
    }
    if (piece.thoughtsHtml) {
      const actions = el('div', 'caption__actions');
      actions.append(pill('Thoughts', ICONS.flip, { 'data-action': 'flip' }));
      caption.append(actions);
    }
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

  // Fits the card to the room the caption leaves, then positions the desktop buttons and the
  // glow around it.
  function measure() {
    if (!current) return;
    // Measured rather than assumed, so two-line titles and landscape phones never push the
    // caption under the dock.
    const room = els.stage.clientHeight - current.querySelector('.caption').offsetHeight - BREATHING_ROOM;
    els.root.style.setProperty('--card-h-fit', `${Math.max(0, room) / SLIDE_TO_CARD}px`);

    const frame = current.querySelector('.piece__frame');
    // Layout offsets ignore the slide's in-flight entrance transform (getBoundingClientRect
    // wouldn't). Walk up to the stage: Firefox makes the transformed slide the offsetParent.
    let top = els.stage.getBoundingClientRect().top;
    for (let node = frame; node && node !== els.stage; node = node.offsetParent) top += node.offsetTop;
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
    els.dots.replaceChildren();
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
      if (event.pointerType === 'mouse') return;
      if (!event.isPrimary) {
        start = null; // a second finger means pinch, not swipe
        return;
      }
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
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
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

  // A link straight to a hidden piece shows it for this visit, without changing the setting.
  function indexFromHash() {
    let slug;
    try {
      slug = decodeURIComponent(location.hash.slice(1));
    } catch {
      return -1;
    }
    const piece = allPieces.find((candidate) => candidate.slug === slug);
    if (piece && !pieces.includes(piece)) setShowLowEffort(true, { persist: false });
    return piece ? pieces.indexOf(piece) : -1;
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

  // ---- Sheets (FAQ and settings) ----

  function openSheet(dialog) {
    if (dialog.open) return;
    // Tinted with the colour of the piece on show.
    dialog.style.setProperty('--accent-rgb', hexToRgb(pieces[index].accent));
    dialog.querySelector('.sheet__body').scrollTop = 0;
    dialog.showModal();
  }

  function setupSheet(dialog, opener, closer) {
    opener.addEventListener('click', () => openSheet(dialog));
    closer.addEventListener('click', () => dialog.close());
    // Clicks on the backdrop land on the <dialog> itself; clicks in the panel don't.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  // ---- Settings: low-effort pieces ----

  function readLowEffortSetting() {
    try {
      return localStorage.getItem(LOW_EFFORT_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveLowEffortSetting(value) {
    try {
      localStorage.setItem(LOW_EFFORT_KEY, String(value));
    } catch {
      // Private mode or storage blocked: the choice just lasts for this visit.
    }
  }

  function visiblePieces() {
    const shown = showLowEffort ? allPieces : allPieces.filter((piece) => !piece.lowEffort);
    return shown.length > 0 ? shown : allPieces; // never hide the whole gallery
  }

  function setShowLowEffort(value, { persist = true } = {}) {
    showLowEffort = value;
    if (persist) saveLowEffortSetting(value);
    els.toggleLowEffort.checked = value;
    const piece = pieces[index];
    pieces = visiblePieces();
    els.dock.hidden = pieces.length < 2;
    els.bottombar.hidden = els.dock.hidden && els.openFaq.hidden;
    buildDots();
    if (index === -1) return; // before the first piece is shown
    const kept = pieces.indexOf(piece);
    if (kept !== -1) {
      index = kept;
      current.setAttribute('aria-label', `${kept + 1} of ${pieces.length}`);
      updateChrome({ initial: false });
    } else {
      const nearest = Math.min(index, pieces.length - 1);
      index = -1;
      go(nearest, 0);
    }
  }

  function setupSettings() {
    const lowEffort = allPieces.filter((piece) => piece.lowEffort);
    els.openSettings.hidden = lowEffort.length === 0; // nothing to set
    els.lowEffortList.textContent = `Tagged: ${lowEffort.map((piece) => piece.title).join(', ')}.`;
    setupSheet(els.settingsDialog, els.openSettings, els.closeSettings);
    els.toggleLowEffort.addEventListener('change', () => setShowLowEffort(els.toggleLowEffort.checked));
    setShowLowEffort(readLowEffortSetting());
  }

  function onViewportClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'flip') setFlipped(!isFlipped());
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
    if (allPieces.length === 0) {
      renderEmpty();
      return;
    }
    els.counter.hidden = false;
    els.openFaq.hidden = els.faqBody.childElementCount === 0; // no faq.md
    setupSettings(); // picks the visible pieces and builds the dots
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
    setupSheet(els.dialog, els.openFaq, els.closeFaq);
    els.viewport.addEventListener('click', onViewportClick);
    const start = indexFromHash();
    go(start === -1 ? 0 : start, 0, { initial: true });
  }

  init();
})();
