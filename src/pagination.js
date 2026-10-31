// Page-by-page view: inserts a spacer wherever a page ends, showing that page's footer, a gap and
// the next page's header, so the continuous document looks like separate sheets. Spacers are view-only
// decorations; they never change the document, printing or export.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const paginationKey = new PluginKey('pagination');

const CONTAINERS = new Set(['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote']);

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function spacer(b, info) {
  const el = document.createElement(b.inline ? 'span' : 'div');
  el.className = 'pg-spacer';
  el.contentEditable = 'false';
  el.style.height = `${b.fill + info.mB + info.gap + info.mT}px`;
  const number = info.pageNumbers ? `<div class="pg-num">Page ${b.page} of ${info.total}</div>` : '';
  el.innerHTML = `
    <span class="pg-sheet" style="margin-top:${b.fill}px">
      <span class="pg-foot" style="height:${info.mB}px"><span class="pg-text">${escape(info.footer)}</span>${number}</span>
      <span class="pg-gap" style="height:${info.gap}px"></span>
      <span class="pg-head" style="height:${info.mT}px"><span class="pg-text">${escape(info.header)}</span></span>
    </span>`;
  return el;
}

function decorations(doc, breaks, info) {
  if (!breaks.length) return DecorationSet.empty;
  const infoKey = `${info.total}|${info.mT}|${info.mB}|${info.pageNumbers}|${info.header}|${info.footer}`;
  return DecorationSet.create(doc, breaks.map((b) => Decoration.widget(b.pos, () => spacer(b, info), {
    side: -1,
    ignoreSelection: true,
    stopEvent: () => true,
    key: `pg${b.page}-${b.inline ? 'i' : 'b'}-${Math.round(b.fill)}-${infoKey}`,
  })));
}

export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [new Plugin({
      key: paginationKey,
      state: {
        init: () => ({ breaks: [], info: null, deco: DecorationSet.empty }),
        apply(tr, value, _old, state) {
          const meta = tr.getMeta(paginationKey);
          if (meta) return { breaks: meta.breaks, info: meta.info, deco: decorations(state.doc, meta.breaks, meta.info) };
          if (!tr.docChanged) return value;
          return {
            ...value,
            breaks: value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) })),
            deco: value.deco.map(tr.mapping, tr.doc),
          };
        },
      },
      props: {
        decorations: (state) => paginationKey.getState(state).deco,
      },
    })];
  },
});

/**
 * Measures the rendered document and works out where each page ends.
 * geometry: { contentH, mT, mB, gap } in CSS pixels. Returns the list of breaks.
 */
export function measureBreaks(view, { contentH }) {
  const dom = view.dom;
  const box = dom.getBoundingClientRect();
  const scale = box.height / (dom.offsetHeight || 1) || 1;
  const top0 = box.top;
  const current = paginationKey.getState(view.state).breaks;

  // Existing spacers, in document order, with their positions in unscaled pixels from the top.
  const spacers = [...dom.querySelectorAll('.pg-spacer')].map((s) => {
    const r = s.getBoundingClientRect();
    return { top: (r.top - top0) / scale, h: r.height / scale };
  });
  // "Natural" y: where something would be if there were no spacers above it.
  const natural = (clientY) => {
    const y = (clientY - top0) / scale;
    let off = 0;
    for (const s of spacers) if (s.top + s.h <= y + 0.5) off += s.h;
    return y - off;
  };
  // Client y for a natural y (inverse of natural).
  const client = (n) => {
    let y = n;
    for (const s of spacers) if (s.top <= y + 0.5) y += s.h;
    return top0 + y * scale;
  };

  const breaks = [];
  let pageStart = 0;
  const limit = () => pageStart + contentH;

  // Starts a new page at `pos`; `at` is the natural y where the spacer goes.
  const brk = (pos, at, inline) => {
    const k = breaks.length;
    // Reuse the measured position of a spacer already at this place (exact after the first pass).
    const at2 = current[k] && current[k].pos === pos && spacers[k] ? spacers[k].top - spacers.slice(0, k).reduce((n, s) => n + s.h, 0) : at;
    breaks.push({ pos, fill: Math.max(0, limit() - at2), inline, page: k + 1 });
    pageStart = at2;
  };

  const marginTop = (el) => (parseFloat(getComputedStyle(el).marginTop) || 0);

  function splitLines(node, pos, el, top, bottom) {
    for (let guard = 0; guard < 50 && bottom - pageStart > contentH + 0.5; guard++) {
      const rect = el.getBoundingClientRect();
      const x = rect.left + Math.min(rect.width - 2, 4 * scale);
      const hit = view.posAtCoords({ left: x, top: client(limit()) - 1 });
      if (!hit) break;
      const line = view.coordsAtPos(Math.max(pos + 1, Math.min(hit.pos, pos + node.nodeSize - 1)), 1);
      const lineTop = natural(line.top);
      if (lineTop <= top + 1) {
        // The first line doesn't fit: move the whole paragraph to the next page.
        if (top > pageStart + 0.5) brk(pos, top - marginTop(el), false);
        return;
      }
      const start = view.posAtCoords({ left: x, top: line.top + 1 });
      const linePos = start ? Math.max(pos + 1, Math.min(start.pos, pos + node.nodeSize - 1)) : null;
      if (linePos == null || linePos <= pos + 1) {
        if (top > pageStart + 0.5) brk(pos, top - marginTop(el), false);
        return;
      }
      brk(linePos, lineTop, true);
    }
  }

  function visit(node, pos) {
    const el = view.nodeDOM(pos);
    if (!(el instanceof HTMLElement) || el.classList.contains('pg-spacer')) return;
    const r = el.getBoundingClientRect();
    const top = natural(r.top);
    const bottom = natural(r.bottom);
    if (node.type.name === 'pageBreak') {
      brk(pos + node.nodeSize, bottom + (parseFloat(getComputedStyle(el).marginBottom) || 0), false);
      return;
    }
    if (bottom - pageStart <= contentH + 0.5) return;
    if (CONTAINERS.has(node.type.name) && node.childCount) {
      node.forEach((child, offset) => visit(child, pos + 1 + offset));
      return;
    }
    if (node.isTextblock) { splitLines(node, pos, el, top, bottom); return; }
    // Tables, images and other blocks move to the next page whole (if taller than a page, they overflow).
    if (top > pageStart + 0.5) brk(pos, top - marginTop(el), false);
  }

  view.state.doc.forEach((node, offset) => visit(node, offset));
  return breaks;
}

/** Applies new breaks if they differ from the current ones. Returns true when the view changed. */
export function applyBreaks(view, breaks, info) {
  const cur = paginationKey.getState(view.state);
  if (!breaks.length && !cur.breaks.length) return false;
  const same = cur.info && JSON.stringify(cur.info) === JSON.stringify(info) && cur.breaks.length === breaks.length
    && cur.breaks.every((b, i) => b.pos === breaks[i].pos && b.inline === breaks[i].inline && Math.abs(b.fill - breaks[i].fill) < 1);
  if (same) return false;
  view.dispatch(view.state.tr.setMeta(paginationKey, { breaks, info }).setMeta('addToHistory', false));
  return true;
}
