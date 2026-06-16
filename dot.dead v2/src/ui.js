// Trimmed overlay: floating name hint + minimal epitaph card + intro.

const UI = (() => {
  const panel = document.getElementById('panel');
  const label = document.getElementById('grave-label');
  const intro = document.getElementById('intro');
  let currentKey = null;

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function sym(s) {
    return `<span class="sym">${s}</span>`;
  }

  // --- dissolution: progressive text corruption ------------------------------
  // As the world simplifies, the engraved hints rot into gibberish: a few
  // letters first, more and more as it deepens, until none of the text is
  // readable. Each string keeps its length (and its spaces).
  const GIB = '!@#$%^&*<>?/\\|=+~';
  let corruptionLevel = 0;

  // deterministic 0..1 from an integer seed (stable across frames → no flicker)
  function rnd01(seed) {
    let h = Math.imul(seed ^ 0x9e3779b9, 2654435761);
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
  }

  // each character flips on a fixed threshold, so corruption only ever deepens
  // as the level rises and a given letter never flickers back and forth
  function corrupt(text, level) {
    if (text == null || level <= 0) return text;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') { out += ch; continue; }
      const code = text.charCodeAt(i);
      const thr = rnd01(i * 131 + code * 977 + text.length * 31);
      if (level >= thr) out += GIB[(rnd01(i * 17 + code * 53) * GIB.length) | 0];
      else out += ch;
    }
    return out;
  }

  // corrupt the live text of an element in place, preserving its markup and
  // remembering each text node's original the first time it is touched
  function corruptElement(root, level) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.__orig === undefined) node.__orig = node.nodeValue;
      node.nodeValue = corrupt(node.__orig, level);
    }
  }

  // driven by the finale each frame with a rising 0..1 level
  function setCorruption(level) {
    corruptionLevel = level;
    if (level > 0 && currentKey && currentKey !== 'quote' && panel.classList.contains('open')) {
      corruptElement(panel, level);
    }
  }

  function fmtStars(n) {
    if (n == null) return '?';
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
  }

  function yearsHTML(grave) {
    const died = grave.status === 'undead' ? 'undead' : (grave.died ?? '?');
    return `${esc(grave.born ?? '?')} — ${esc(died)} &nbsp; ${sym('★')} ${fmtStars(grave.stars)}`;
  }

  function show(grave) {
    if (isSticky()) return; // a quote is being read
    const key = grave.repo || 'legend:' + grave.name;
    if (currentKey === key) return;
    currentKey = key;
    panel.classList.remove('paper');
    panel.classList.remove('fading');

    // legends (landmarks) have no repo: no stats fetch, no link, no last words
    if (!grave.repo) {
      const died = grave.status === 'undead' ? 'undead' : (grave.died ?? '?');
      panel.innerHTML = `
        <div class="panel-head">${sym(grave.status === 'undead' ? '☠' : '✝')} ${esc(grave.name)}</div>
        <div class="years">${esc(grave.born ?? '?')} — ${esc(died)}</div>
        <p class="epitaph">"${esc(grave.epitaph)}"</p>
        <p class="cause">${esc(grave.cause)}</p>`;
      panel.classList.add('open');
      return;
    }

    panel.innerHTML = `
      <div class="panel-head">${sym(grave.status === 'undead' ? '☠' : '✝')} ${esc(grave.name)}</div>
      <div class="years">${yearsHTML(grave)}</div>
      <p class="epitaph">"${esc(grave.epitaph)}"</p>
      <p class="last-words">last words: …</p>
      <p class="cause">${esc(grave.cause)}</p>
      <a class="repo-link" href="https://github.com/${esc(grave.repo)}" target="_blank" rel="noopener">github.com/${esc(grave.repo)}</a>`;
    panel.classList.add('open');

    // live stats, fetched only for graves the player actually visits
    GitHub.enrich(grave).then(() => {
      if (currentKey !== key) return;
      const el = panel.querySelector('.years');
      if (el) el.innerHTML = yearsHTML(grave);
    });

    // last words: final commit message + committer (cached on the grave)
    GitHub.fetchLastCommit(grave).then((lw) => {
      if (currentKey !== key) return;
      const el = panel.querySelector('.last-words');
      if (!el) return;
      el.innerHTML = lw
        ? `last words: "${esc(lw.msg)}" — <b>@${esc(lw.who)}</b>`
        : 'last words: <i>lost to the wind</i>';
    });
  }

  const counter = document.getElementById('paper-counter');
  const hint = document.getElementById('pickup-hint');
  let stickyUntil = 0;
  let quoteTimer = null;
  let quoteFadeTimer = null;
  let counterTimer = null;

  function isSticky() {
    return Date.now() < stickyUntil;
  }

  // a taken paper: quote and counter share the same rhythm —
  // 10 s on screen, then the same smooth fade
  function showQuote(quote, count, total) {
    stickyUntil = Date.now() + 11500;
    currentKey = 'quote';
    panel.classList.remove('fading');
    panel.classList.add('paper');
    panel.innerHTML = `
      <div class="panel-head"><span class="sym sym-big">✉</span> the paper reads</div>
      <p class="scrap-text">"${esc(quote)}"</p>
      <p class="scrap-src">${count} of ${total}</p>`;
    panel.classList.add('open');
    clearTimeout(quoteTimer);
    clearTimeout(quoteFadeTimer);
    quoteTimer = setTimeout(() => {
      if (currentKey === 'quote') panel.classList.add('fading');
    }, 10000);
    quoteFadeTimer = setTimeout(() => {
      if (currentKey === 'quote') hide(true);
    }, 11500);

    counter.textContent = `${count}/${total}`;
    counter.classList.add('show');
    clearTimeout(counterTimer);
    counterTimer = setTimeout(() => counter.classList.remove('show'), 10000);
  }

  function setHint(text) {
    hint.style.display = text ? 'block' : 'none';
    if (text) hint.textContent = text;
  }

  const testerBadge = document.getElementById('tester-badge');

  function setTester(on) {
    if (testerBadge) testerBadge.style.display = on ? 'block' : 'none';
  }

  function hide(force) {
    if (isSticky() && !force) return;
    stickyUntil = 0;
    currentKey = null;
    panel.classList.remove('open');
    panel.classList.remove('paper');
    if (panel.classList.contains('fading')) {
      // keep opacity at 0 until the slide-out finishes (no flash)
      setTimeout(() => panel.classList.remove('fading'), 400);
    }
  }

  function setLabel(text) {
    label.style.display = text ? 'block' : 'none';
    if (text) label.textContent = corrupt(text, corruptionLevel);
  }

  function dismissIntro() {
    if (intro && !intro.classList.contains('gone')) intro.classList.add('gone');
  }

  function showIntro() {
    if (intro) intro.classList.remove('gone');
  }

  return { show, showQuote, setHint, setTester, hide, setLabel, dismissIntro, showIntro, setCorruption };
})();
