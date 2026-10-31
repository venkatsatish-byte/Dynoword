// Horizontal ruler with draggable indent markers and tab stops, plus tab-character layout.

const PX = 96; // CSS pixels per inch
const DEFAULT_TAB = 0.5; // inches

export const METRIC = !/^en-(US|LR)\b|^my\b/i.test(navigator.language || 'en-US');
export const UNIT = METRIC ? 'cm' : 'in';
export const toDisplay = (inches) => +(METRIC ? inches * 2.54 : inches).toFixed(2);
export const fromDisplay = (value) => (METRIC ? value / 2.54 : value);
const SNAP = METRIC ? 0.25 / 2.54 : 1 / 16;
const snap = (inches, free) => (free ? Math.round(inches * 100) / 100 : Math.round(inches / SNAP) * SNAP);

const TAB_TYPES = ['left', 'center', 'right'];
const TAB_GLYPH = { left: '⌊', center: '⊥', right: '⌋' };

/**
 * Lays out every tab character so it reaches the next tab stop of its paragraph
 * (custom stops first, then the default stops every half inch).
 */
export function layoutTabs(root) {
  const tabs = root.querySelectorAll('span.tab');
  if (!tabs.length) return;
  const paras = new Set();
  tabs.forEach((t) => paras.add(t.parentElement.closest('p, h1, h2, h3, h4, h5, h6') || t.parentElement));
  paras.forEach((para) => {
    const scale = para.getBoundingClientRect().width / (para.offsetWidth || 1) || 1;
    const marginLeft = parseFloat(getComputedStyle(para).marginLeft) || 0;
    // Tab stops are measured from the paragraph's container edge (the page margin), not its indent.
    const origin = para.getBoundingClientRect().left - marginLeft * scale;
    let stops = [];
    try { stops = JSON.parse(para.dataset.tabs || '[]'); } catch { stops = []; }
    stops = stops.slice().sort((a, b) => a.pos - b.pos);
    const own = Array.from(para.querySelectorAll('span.tab'));
    own.forEach((t) => { t.style.width = '0px'; });
    own.forEach((t, i) => {
      const x = (t.getBoundingClientRect().left - origin) / scale;
      const stop = stops.find((s) => s.pos * PX > x + 0.5);
      let width;
      if (stop) {
        let seg = 0;
        if (stop.align === 'right' || stop.align === 'center') {
          const r = document.createRange();
          r.setStartAfter(t);
          if (own[i + 1]) r.setEndBefore(own[i + 1]); else r.setEnd(para, para.childNodes.length);
          seg = r.getBoundingClientRect().width / scale;
        }
        width = stop.pos * PX - x - (stop.align === 'right' ? seg : stop.align === 'center' ? seg / 2 : 0);
      } else {
        const d = DEFAULT_TAB * PX;
        width = d - (x % d);
        if (width < 2) width += d;
      }
      t.style.width = `${Math.max(1, width)}px`;
    });
  });
}

/**
 * Creates the ruler inside `el`.
 * getGeometry() → { pageW, mL, mR } in inches.
 * getAttrs() → current paragraph { leftIndent, rightIndent, firstLine, tabStops } or null.
 * onChange(attrs) applies new paragraph attributes. guide is a page-height element used as a drag guide.
 */
export function createRuler(el, { getGeometry, getAttrs, onChange, guide }) {
  el.innerHTML = `
    <button type="button" class="tab-type" title="Tab type: left (click to change)">${TAB_GLYPH.left}</button>
    <div class="ruler-scale"></div>
    <div class="ruler-tabs"></div>
    <div class="r-marker r-first" data-m="first" title="First line indent"></div>
    <div class="r-marker r-hang" data-m="hang" title="Hanging indent"></div>
    <div class="r-marker r-left" data-m="left" title="Left indent"></div>
    <div class="r-marker r-right" data-m="right" title="Right indent"></div>`;
  const scaleEl = el.querySelector('.ruler-scale');
  const tabsEl = el.querySelector('.ruler-tabs');
  const typeBtn = el.querySelector('.tab-type');
  const m = Object.fromEntries(['first', 'hang', 'left', 'right'].map((k) => [k, el.querySelector(`.r-${k}`)]));
  let tabType = 'left';
  let geomKey = '';
  let current = null;
  let drag = null;

  typeBtn.addEventListener('click', () => {
    tabType = TAB_TYPES[(TAB_TYPES.indexOf(tabType) + 1) % TAB_TYPES.length];
    typeBtn.textContent = TAB_GLYPH[tabType];
    typeBtn.title = `Tab type: ${tabType} (click to change)`;
  });

  function drawScale(g) {
    const W = g.pageW * PX;
    const parts = [`<rect x="0" y="0" width="${g.mL * PX}" height="22" class="rm"/>`,
      `<rect x="${W - g.mR * PX}" y="0" width="${g.mR * PX}" height="22" class="rm"/>`];
    // Numbers count outward from the left margin, as on a desk ruler.
    const unitPx = METRIC ? PX / 2.54 : PX;
    const sub = METRIC ? 2 : 8;
    const x0 = g.mL * PX;
    for (let dir = -1; dir <= 1; dir += 2) {
      for (let i = dir > 0 ? 0 : 1; ; i++) {
        const base = x0 + dir * i * unitPx;
        if (base < 0 || base > W) break;
        if (i > 0) parts.push(`<text x="${base}" y="15">${i}</text>`);
        for (let k = 1; k < sub; k++) {
          const x = base + dir * (k * unitPx) / sub;
          if (x < 0 || x > W) continue;
          const h = k === sub / 2 ? 6 : 3;
          parts.push(`<line x1="${x}" x2="${x}" y1="${11 - h / 2}" y2="${11 + h / 2}"/>`);
        }
      }
    }
    scaleEl.innerHTML = `<svg width="${W}" height="22" viewBox="0 0 ${W} 22" aria-hidden="true">${parts.join('')}</svg>`;
    el.style.width = `${W}px`;
  }

  function place(node, inches) { node.style.left = `${inches * PX}px`; }

  function render() {
    const g = getGeometry();
    const key = `${g.pageW}|${g.mL}|${g.mR}`;
    if (key !== geomKey) { drawScale(g); geomKey = key; }
    if (drag) return;
    current = getAttrs();
    el.classList.toggle('disabled', !current);
    const a = current || { leftIndent: 0, rightIndent: 0, firstLine: 0, tabStops: [] };
    place(m.first, g.mL + a.leftIndent + a.firstLine);
    place(m.hang, g.mL + a.leftIndent);
    place(m.left, g.mL + a.leftIndent);
    place(m.right, g.pageW - g.mR - a.rightIndent);
    tabsEl.innerHTML = (a.tabStops || []).map((t, i) =>
      `<div class="r-tab r-tab-${t.align}" data-i="${i}" style="left:${(g.mL + t.pos) * PX}px" title="${t.align} tab — drag off the ruler to remove"></div>`).join('');
  }

  function toInches(e) {
    const r = el.getBoundingClientRect();
    const scale = r.width / (el.offsetWidth || 1) || 1;
    return (e.clientX - r.left) / scale / PX;
  }

  function showGuide(inches) {
    guide.style.left = `${inches * PX}px`;
    guide.classList.add('show');
  }

  el.addEventListener('pointerdown', (e) => {
    if (!current || e.button > 0 || e.target === typeBtn) return;
    e.preventDefault();
    const g = getGeometry();
    const marker = e.target.closest('.r-marker, .r-tab');
    if (!marker) {
      // Click on the ruler adds a tab stop of the selected type.
      const pos = snap(toInches(e) - g.mL, e.altKey);
      const textW = g.pageW - g.mL - g.mR;
      if (pos <= 0 || pos >= textW) return;
      const stops = (current.tabStops || []).filter((t) => Math.abs(t.pos - pos) > 0.01);
      stops.push({ pos: +pos.toFixed(4), align: tabType });
      onChange({ tabStops: stops.sort((a, b) => a.pos - b.pos) });
      return;
    }
    marker.setPointerCapture(e.pointerId);
    drag = { marker, kind: marker.dataset.m || 'tab', index: +marker.dataset.i, start: { ...current }, g, value: null, remove: false };
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { g, start, kind } = drag;
    const textW = g.pageW - g.mL - g.mR;
    const x = snap(toInches(e), e.altKey);
    const rel = Math.max(0, Math.min(textW, x - g.mL));
    let v;
    switch (kind) {
      case 'first':
        v = { firstLine: rel - start.leftIndent };
        place(m.first, g.mL + rel);
        break;
      case 'hang': {
        const firstAbs = start.leftIndent + start.firstLine;
        const left = Math.min(rel, textW - start.rightIndent - 0.25);
        v = { leftIndent: left, firstLine: firstAbs - left };
        place(m.hang, g.mL + left);
        place(m.left, g.mL + left);
        break;
      }
      case 'left': {
        const left = Math.max(-Math.min(0, start.firstLine), Math.min(rel, textW - start.rightIndent - 0.25));
        v = { leftIndent: left, firstLine: start.firstLine };
        place(m.hang, g.mL + left);
        place(m.left, g.mL + left);
        place(m.first, g.mL + left + start.firstLine);
        break;
      }
      case 'right': {
        const right = Math.max(0, Math.min(textW - start.leftIndent - 0.25, textW - rel));
        v = { rightIndent: right };
        place(m.right, g.pageW - g.mR - right);
        break;
      }
      default: {
        const r = el.getBoundingClientRect();
        drag.remove = e.clientY > r.bottom + 24 || e.clientY < r.top - 24;
        drag.marker.classList.toggle('removing', drag.remove);
        v = { pos: rel };
        drag.marker.style.left = `${(g.mL + rel) * PX}px`;
      }
    }
    drag.value = v;
    const guideX = kind === 'right' ? g.pageW - g.mR - v.rightIndent : g.mL + (kind === 'first' ? rel : kind === 'hang' || kind === 'left' ? v.leftIndent : rel);
    showGuide(guideX);
  });

  const end = () => {
    if (!drag) return;
    const { kind, value, index, start, remove } = drag;
    drag = null;
    guide.classList.remove('show');
    const round = (n) => +n.toFixed(4);
    if (kind === 'tab') {
      const stops = (start.tabStops || []).slice();
      if (remove) stops.splice(index, 1);
      else if (value) stops[index] = { ...stops[index], pos: round(value.pos) };
      onChange({ tabStops: stops.length ? stops.sort((a, b) => a.pos - b.pos) : null });
    } else if (value) {
      onChange(Object.fromEntries(Object.entries(value).map(([k, n]) => [k, round(n)])));
    } else {
      render();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { render };
}
