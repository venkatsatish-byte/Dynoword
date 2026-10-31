import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const BLOCK_TYPES = ['paragraph', 'heading'];

/** Paragraph-level formatting: line spacing and left indent, as in any desktop word processor. */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          indent: {
            default: 0,
            parseHTML: (el) => {
              const ml = parseFloat(el.style.marginLeft) || 0;
              const unit = el.style.marginLeft.endsWith('in') ? 1 : 1 / 48;
              return Math.max(0, Math.min(8, Math.round(ml * unit * 2)));
            },
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * 0.5}in` } : {}),
          },
        },
      },
      {
        types: ['heading'],
        attributes: {
          docStyle: {
            default: null,
            parseHTML: (el) => (el.classList.contains('doc-title') ? 'title' : null),
            renderHTML: (attrs) => (attrs.docStyle === 'title' ? { class: 'doc-title' } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    const update = (fn) => ({ tr, state, dispatch }) => {
      const { from, to } = state.selection;
      let changed = false;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (BLOCK_TYPES.includes(node.type.name)) {
          const attrs = fn(node.attrs);
          if (attrs) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
            changed = true;
          }
        }
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    };
    return {
      setLineSpacing: (value) => update(() => ({ lineHeight: value })),
      increaseIndent: () => update((a) => (a.indent < 8 ? { indent: a.indent + 1 } : null)),
      decreaseIndent: () => update((a) => (a.indent > 0 ? { indent: a.indent - 1 } : null)),
    };
  },

  addKeyboardShortcuts() {
    const indent = (dir) => () => {
      const ed = this.editor;
      if (ed.isActive('listItem')) return dir > 0 ? ed.commands.sinkListItem('listItem') : ed.commands.liftListItem('listItem');
      if (ed.isActive('taskItem')) return dir > 0 ? ed.commands.sinkListItem('taskItem') : ed.commands.liftListItem('taskItem');
      if (ed.isActive('table') || ed.isActive('codeBlock')) return false;
      return dir > 0 ? ed.commands.increaseIndent() : ed.commands.decreaseIndent();
    };
    return { Tab: indent(1), 'Shift-Tab': indent(-1) };
  },
});

/** Hard page break, printed as a new page and exported to .docx as a page break. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [
      { tag: 'div[data-page-break]' },
      { tag: 'hr.page-break' },
      { tag: 'br[style*="page-break-before"]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break', contenteditable: 'false' })];
  },
  addCommands() {
    return {
      setPageBreak: () => ({ tr, dispatch, state }) => {
        if (!dispatch) return true;
        tr.replaceSelectionWith(this.type.create(), false);
        // Put the caret in the block after the break, adding an empty paragraph if there is none.
        const after = tr.selection.to;
        const next = Selection.findFrom(tr.doc.resolve(after), 1, true);
        if (next && next.from <= after + 2) {
          tr.setSelection(next);
        } else {
          tr.insert(after, state.schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
        }
        dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});

/** Inline review comment anchored to a range of text. */
export const Comment = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-comment-id') },
      text: { default: '', parseHTML: (el) => el.getAttribute('data-comment') || '' },
      author: { default: 'Me', parseHTML: (el) => el.getAttribute('data-author') || 'Me' },
      date: { default: null, parseHTML: (el) => el.getAttribute('data-date') },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },
  renderHTML({ mark }) {
    const a = mark.attrs;
    return ['span', {
      class: 'comment-mark',
      'data-comment-id': a.id,
      'data-comment': a.text,
      'data-author': a.author,
      'data-date': a.date,
      title: `${a.author}: ${a.text}`,
    }, 0];
  },
  addCommands() {
    return {
      addComment: (attrs) => ({ commands }) => commands.setMark(this.name, attrs),
      removeComment: (id) => ({ tr, state, dispatch }) => {
        const type = state.schema.marks.comment;
        state.doc.descendants((node, pos) => {
          node.marks.forEach((m) => {
            if (m.type === type && m.attrs.id === id) tr.removeMark(pos, pos + node.nodeSize, m);
          });
        });
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});

/** Find & replace with highlighted matches. */
const searchKey = new PluginKey('search');

function findMatches(doc, term, caseSensitive) {
  const results = [];
  if (!term) return results;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Build a string where each inline leaf maps to exactly one position.
    let text = '';
    node.forEach((child) => {
      text += child.isText ? child.text : '￼';
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      results.push({ from: pos + 1 + i, to: pos + 1 + i + needle.length });
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return results;
}

export const Search = Extension.create({
  name: 'search',

  addStorage() {
    return { term: '', caseSensitive: false, results: [], index: -1 };
  },

  addCommands() {
    const refresh = (editor) => {
      const s = editor.storage.search;
      s.results = findMatches(editor.state.doc, s.term, s.caseSensitive);
      if (s.index >= s.results.length) s.index = s.results.length - 1;
    };
    const goTo = (editor, idx) => {
      const s = editor.storage.search;
      if (!s.results.length) return false;
      s.index = (idx + s.results.length) % s.results.length;
      const r = s.results[s.index];
      editor.chain().setTextSelection(r).scrollIntoView().run();
      return true;
    };
    return {
      setSearchTerm: (term, caseSensitive = false) => ({ editor, tr, dispatch }) => {
        const s = editor.storage.search;
        s.term = term;
        s.caseSensitive = caseSensitive;
        s.index = -1;
        refresh(editor);
        if (dispatch) dispatch(tr.setMeta(searchKey, true));
        return true;
      },
      findNext: () => ({ editor }) => {
        const s = editor.storage.search;
        const sel = editor.state.selection.from;
        const next = s.results.findIndex((r) => r.from > sel || (s.index === -1 && r.from >= sel));
        return goTo(editor, s.index === -1 ? Math.max(0, next) : s.index + 1);
      },
      findPrev: () => ({ editor }) => goTo(editor, editor.storage.search.index - 1),
      replaceCurrent: (replacement) => ({ editor }) => {
        const s = editor.storage.search;
        if (s.index < 0) return editor.commands.findNext();
        const r = s.results[s.index];
        const idx = s.index;
        editor.chain().insertContentAt(r, replacement, { updateSelection: false }).run();
        refresh(editor);
        s.index = idx - 1;
        return goTo(editor, s.index + 1);
      },
      replaceAll: (replacement) => ({ editor, tr, dispatch }) => {
        const s = editor.storage.search;
        const results = findMatches(tr.doc, s.term, s.caseSensitive);
        for (let i = results.length - 1; i >= 0; i--) {
          const { from, to } = results[i];
          const marks = tr.doc.resolve(from + 1).marks();
          if (replacement) tr.replaceWith(from, to, editor.schema.text(replacement, marks));
          else tr.delete(from, to);
        }
        if (dispatch) dispatch(tr);
        s.lastReplaceCount = results.length;
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const s = editor.storage.search;
            if (!s.term) return DecorationSet.empty;
            if (!tr.docChanged && !tr.getMeta(searchKey) && !tr.selectionSet) return old;
            if (tr.docChanged) s.results = findMatches(tr.doc, s.term, s.caseSensitive);
            const decos = s.results.map((r, i) =>
              Decoration.inline(r.from, r.to, { class: i === s.index ? 'search-hit current' : 'search-hit' }));
            return DecorationSet.create(tr.doc, decos);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/** Common word-processor keyboard shortcuts. */
export const WordShortcuts = Extension.create({
  name: 'wordShortcuts',
  addKeyboardShortcuts() {
    const e = () => this.editor;
    return {
      'Mod-l': () => e().commands.setTextAlign('left'),
      'Mod-e': () => e().commands.setTextAlign('center'),
      'Mod-r': () => e().commands.setTextAlign('right'),
      'Mod-j': () => e().commands.setTextAlign('justify'),
      'Mod-Alt-1': () => e().commands.toggleHeading({ level: 1 }),
      'Mod-Alt-2': () => e().commands.toggleHeading({ level: 2 }),
      'Mod-Alt-3': () => e().commands.toggleHeading({ level: 3 }),
      'Mod-Alt-0': () => e().commands.setParagraph(),
    };
  },
});
