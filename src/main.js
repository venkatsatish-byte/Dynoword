import './style.css';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { createIcons } from 'lucide';
import { icons } from './icons.js';

import { ParagraphFormat, PageBreak, Comment, Search, WordShortcuts } from './extensions.js';
import { PAGE_SIZES, MARGINS, DEFAULT_SETTINGS } from './page.js';
import { saveDoc, getDoc, listDocs, deleteDoc, newId } from './storage.js';
import { readFile, download, safeFilename, standaloneHtml, htmlToMarkdown } from './io.js';
import { TEMPLATES } from './templates.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const TEXT_COLORS = ['#111827', '#374151', '#6b7280', '#d1d5db', '#ffffff', '#b91c1c', '#ea580c', '#ca8a04',
  '#15803d', '#0f766e', '#0891b2', '#2563eb', '#4338ca', '#7c3aed', '#c026d3', '#be185d'];
const HIGHLIGHTS = ['#fde047', '#bef264', '#86efac', '#5eead4', '#7dd3fc', '#a5b4fc', '#d8b4fe', '#f9a8d4',
  '#fca5a5', '#fdba74', '#e5e7eb', '#9ca3af'];
const SYMBOLS = '© ® ™ § ¶ † ‡ • · … – — ‘ ’ “ ” « » ‹ › ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ π µ Ω α β γ δ ε θ λ σ φ ψ ω ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ € £ ¥ ₹ ¢ ½ ⅓ ¼ ¾ ¹ ² ³ ☐ ☑ ☺ ☹ ♪ ⚠'.split(' ');

const state = {
  doc: null,
  zoom: 100,
  textColor: '#b91c1c',
  hlColor: '#fde047',
  painter: null,
  layout: 'print',
  saveTimer: null,
  dictation: null,
};

// ---------- Editor ----------

const editor = new Editor({
  element: $('#editor'),
  extensions: [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    TextStyleKit.configure({ lineHeight: false, backgroundColor: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: true } }),
    Image.configure({
      allowBase64: true,
      resize: { enabled: true, directions: ['bottomRight', 'bottomLeft', 'topRight', 'topLeft'], minWidth: 40, minHeight: 40, alwaysPreserveAspectRatio: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CharacterCount,
    Placeholder.configure({ placeholder: ({ editor: ed }) => (ed.isEmpty ? 'Start typing…' : '') }),
    ParagraphFormat,
    PageBreak,
    Comment,
    Search,
    WordShortcuts,
  ],
  editorProps: {
    attributes: { class: 'doc-body', spellcheck: 'true', 'aria-label': 'Document' },
    handlePaste: (view, event) => insertImageFiles(event.clipboardData?.files),
    handleDrop: (view, event) => {
      const files = event.dataTransfer?.files;
      if (files?.length && /\.(docx|html?|txt|md)$/i.test(files[0].name)) {
        openFiles(files[0]);
        return true;
      }
      return insertImageFiles(files);
    },
  },
  onUpdate: () => { scheduleSave(); scheduleLayout(); refreshNav(); refreshComments(); },
  onSelectionUpdate: () => updateToolbar(),
  onTransaction: () => updateToolbar(),
});
window.dynoword = editor;

// ---------- Commands ----------

const chain = () => editor.chain().focus();

function currentFontSize() {
  const fs = editor.getAttributes('textStyle').fontSize;
  return fs ? parseFloat(fs) : 12;
}

function stepFont(dir) {
  const cur = currentFontSize();
  const next = dir > 0 ? FONT_SIZES.find((s) => s > cur) || cur + 12 : [...FONT_SIZES].reverse().find((s) => s < cur) || Math.max(1, cur - 1);
  chain().setFontSize(`${next}pt`).run();
}

function indent(dir) {
  for (const t of ['listItem', 'taskItem']) {
    if (editor.isActive(t)) return dir > 0 ? chain().sinkListItem(t).run() : chain().liftListItem(t).run();
  }
  return dir > 0 ? chain().increaseIndent().run() : chain().decreaseIndent().run();
}

function changeCase(mode) {
  const { from, to, empty } = editor.state.selection;
  if (empty) return toast('Select some text first');
  const tr = editor.state.tr;
  let sentenceStart = true;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    const text = node.text.slice(start - pos, end - pos);
    let out;
    switch (mode) {
      case 'upper': out = text.toUpperCase(); break;
      case 'lower': out = text.toLowerCase(); break;
      case 'title': out = text.toLowerCase().replace(/(^|[\s\-(“"])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); break;
      case 'toggle': out = Array.from(text).map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''); break;
      default:
        out = Array.from(text.toLowerCase()).map((c) => {
          if (sentenceStart && /\p{L}/u.test(c)) { sentenceStart = false; return c.toUpperCase(); }
          if (/[.!?]/.test(c)) sentenceStart = true;
          return c;
        }).join('');
    }
    if (out.length === text.length && out !== text) tr.insertText(out, start, end);
  });
  editor.view.dispatch(tr);
  editor.commands.focus();
}

function setStyle(s) {
  const c = chain();
  if (editor.isActive('blockquote') && s !== 'quote') c.lift('blockquote');
  if (editor.isActive('codeBlock') && s !== 'code') c.setParagraph();
  switch (s) {
    case 'p': c.setParagraph().run(); break;
    case 'title': c.setHeading({ level: 1 }).updateAttributes('heading', { docStyle: 'title' }).run(); break;
    case 'quote': c.toggleBlockquote().run(); break;
    case 'code': c.toggleCodeBlock().run(); break;
    default: c.setHeading({ level: +s.slice(1) }).updateAttributes('heading', { docStyle: null }).run();
  }
}

async function paste() {
  try {
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          return chain().insertContent(await (await item.getType('text/html')).text()).run();
        }
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) return insertImageFiles([new File([await item.getType(imgType)], 'image', { type: imgType })]);
      }
    }
    const text = await navigator.clipboard.readText();
    chain().insertContent(text).run();
  } catch {
    toast(`Press ${isMac() ? '⌘' : 'Ctrl'}+V to paste`);
  }
}

function clipboardCmd(cmd) {
  editor.commands.focus();
  if (!document.execCommand(cmd)) toast(`Press ${isMac() ? '⌘' : 'Ctrl'}+${cmd === 'cut' ? 'X' : 'C'} to ${cmd}`);
}

function togglePainter() {
  if (state.painter) { state.painter = null; document.body.classList.remove('painting'); updateToolbar(); return; }
  state.painter = editor.state.selection.$from.marks().filter((m) => m.type.name !== 'comment' && m.type.name !== 'link');
  document.body.classList.add('painting');
  toast('Select text to apply formatting');
  updateToolbar();
}

function applyPainter() {
  if (!state.painter) return;
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const tr = editor.state.tr;
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'textStyle', 'highlight', 'code']
    .forEach((n) => editor.schema.marks[n] && tr.removeMark(from, to, editor.schema.marks[n]));
  state.painter.forEach((m) => tr.addMark(from, to, m));
  editor.view.dispatch(tr);
  state.painter = null;
  document.body.classList.remove('painting');
  updateToolbar();
}
$('#editor').addEventListener('pointerup', () => setTimeout(applyPainter, 0));

const commands = {
  undo: () => chain().undo().run(),
  redo: () => chain().redo().run(),
  cut: () => clipboardCmd('cut'),
  copy: () => clipboardCmd('copy'),
  paste,
  formatPainter: togglePainter,
  bold: () => chain().toggleBold().run(),
  italic: () => chain().toggleItalic().run(),
  underline: () => chain().toggleUnderline().run(),
  strike: () => chain().toggleStrike().run(),
  subscript: () => chain().toggleSubscript().run(),
  superscript: () => chain().toggleSuperscript().run(),
  growFont: () => stepFont(1),
  shrinkFont: () => stepFont(-1),
  clearFormat: () => chain().unsetAllMarks().setParagraph().unsetTextAlign().setLineSpacing(null).run(),
  color: () => chain().setColor(state.textColor).run(),
  highlight: () => chain().toggleHighlight({ color: state.hlColor }).run(),
  bulletList: () => chain().toggleBulletList().run(),
  orderedList: () => chain().toggleOrderedList().run(),
  taskList: () => chain().toggleTaskList().run(),
  indent: () => indent(1),
  outdent: () => indent(-1),
  find: () => openFind(false),
  replace: () => openFind(true),
  closeFind,
  findNext: () => editor.commands.findNext() || updateFindCount(),
  findPrev: () => editor.commands.findPrev() || updateFindCount(),
  replaceOne: () => { editor.commands.replaceCurrent($('#replaceInput').value); updateFindCount(); },
  replaceAll: () => {
    editor.commands.replaceAll($('#replaceInput').value);
    toast(`Replaced ${editor.storage.search.lastReplaceCount} occurrence(s)`);
    updateFindCount();
  },
  pageBreak: () => chain().setPageBreak().run(),
  hr: () => chain().setHorizontalRule().run(),
  insertTable: tableDialog,
  insertImage: () => $('#imageInput').click(),
  link: linkDialog,
  comment: commentDialog,
  showComments: () => togglePane('commentsPane'),
  navPane: () => togglePane('navPane'),
  dateTime: dateDialog,
  symbol: symbolDialog,
  editHeader: () => { setLayout('print'); $('#pageHeader').focus(); },
  editFooter: () => { setLayout('print'); $('#footerText').focus(); },
  pageNumbers: () => updateSettings({ pageNumbers: !state.doc.settings.pageNumbers }),
  spellcheck: () => {
    const on = editor.view.dom.getAttribute('spellcheck') !== 'true';
    editor.view.dom.setAttribute('spellcheck', String(on));
    toast(on ? 'Spelling check on' : 'Spelling check off');
    updateToolbar();
  },
  wordCount: wordCountDialog,
  readAloud,
  dictate,
  focus: toggleFocus,
  zoomIn: () => setZoom(state.zoom + 10),
  zoomOut: () => setZoom(state.zoom - 10),
  toggleTheme,
  toggleRibbon: () => document.body.classList.toggle('ribbon-collapsed'),
  openHub,
  closeHub,
  openFile: () => $('#fileInput').click(),
  print: () => { closeHub(); setTimeout(() => window.print(), 50); },
  share,
  install: () => state.installPrompt?.prompt(),
};

const paramCommands = {
  case: changeCase,
  align: (v) => chain().setTextAlign(v).run(),
  lineHeight: (v) => chain().setLineSpacing(v).run(),
  style: setStyle,
  margins: (v) => updateSettings({ margins: v }),
  orientation: (v) => updateSettings({ orientation: v }),
  pageSize: (v) => updateSettings({ pageSize: v }),
  columns: (v) => updateSettings({ columns: +v }),
  layout: (v) => setLayout(v),
  zoom: (v) => (v === 'fit' ? fitWidth() : setZoom(+v)),
  tbl: (v) => chain()[v]().run(),
  new: (v) => newDocument(v),
  export: exportAs,
};

function run(cmd) {
  closeMenus();
  const [name, arg] = cmd.split(/:(.*)/s);
  if (arg !== undefined && paramCommands[name]) return paramCommands[name](arg);
  if (commands[name]) return commands[name]();
  console.warn('Unknown command', cmd);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cmd]');
  if (btn) { e.preventDefault(); run(btn.dataset.cmd); return; }
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) { e.preventDefault(); toggleMenu(menuBtn); return; }
  if (!e.target.closest('.menu')) closeMenus();
});

// Keep the editor selection when tapping toolbar buttons (important on iOS/Android).
$$('.ribbon, .ribbon-tabs, .titlebar-actions, .findbar').forEach((el) => el.addEventListener('mousedown', (e) => {
  if (e.target.closest('button') && !e.target.closest('input, select')) e.preventDefault();
}));

// ---------- Ribbon UI ----------

$$('.ribbon-tabs [data-tab]').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));

function selectTab(name) {
  document.body.classList.remove('ribbon-collapsed');
  $$('.ribbon-tabs [data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.ribbon .panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

function toggleMenu(btn) {
  const menu = document.getElementById(btn.dataset.menu);
  const open = menu.classList.contains('open');
  closeMenus();
  if (open) return;
  menu.classList.add('open');
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - mw - 8))}px`;
  menu.style.top = `${r.bottom + 4}px`;
}

function closeMenus() {
  $$('.menu.open').forEach((m) => m.classList.remove('open'));
}
$('#ribbon').addEventListener('scroll', closeMenus, true);
window.addEventListener('resize', closeMenus);

function buildPalettes() {
  $$('[data-palette]').forEach((menu) => {
    const kind = menu.dataset.palette;
    const colors = kind === 'color' ? TEXT_COLORS : HIGHLIGHTS;
    menu.innerHTML = `
      <div class="swatches">${colors.map((c) => `<button class="sw" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
      <button class="none-btn" data-color="">${kind === 'color' ? 'Automatic' : 'No colour'}</button>
      <label class="custom-color">More colours… <input type="color" value="${kind === 'color' ? state.textColor : state.hlColor}"></label>`;
    const apply = (c) => {
      if (kind === 'color') {
        if (c) { state.textColor = c; $('#colorSwatch').style.background = c; chain().setColor(c).run(); } else chain().unsetColor().run();
      } else if (c) { state.hlColor = c; $('#hlSwatch').style.background = c; chain().setHighlight({ color: c }).run(); } else chain().unsetHighlight().run();
      closeMenus();
    };
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (b) { e.stopPropagation(); apply(b.dataset.color); }
    });
    menu.querySelector('input[type=color]').addEventListener('change', (e) => apply(e.target.value));
  });
}

$('#fontFamily').addEventListener('change', (e) => {
  const v = e.target.value;
  v ? chain().setFontFamily(v).run() : chain().unsetFontFamily().run();
});
$('#fontSize').addEventListener('change', (e) => {
  const v = e.target.value;
  v ? chain().setFontSize(`${v}pt`).run() : chain().unsetFontSize().run();
});

function isActive(key) {
  const [name, arg] = key.split(':');
  if (name === 'align') return editor.isActive({ textAlign: arg });
  if (name === 'style') {
    switch (arg) {
      case 'p': return editor.isActive('paragraph') && !editor.isActive('blockquote') && !editor.isActive('listItem') && !editor.isActive('taskItem');
      case 'title': return editor.isActive('heading', { docStyle: 'title' });
      case 'quote': return editor.isActive('blockquote');
      case 'code': return editor.isActive('codeBlock');
      default: return editor.isActive('heading', { level: +arg.slice(1), docStyle: null });
    }
  }
  return editor.isActive(name);
}

let toolbarRaf = 0;
function updateToolbar() {
  cancelAnimationFrame(toolbarRaf);
  toolbarRaf = requestAnimationFrame(() => {
    $$('[data-active]').forEach((b) => b.classList.toggle('on', isActive(b.dataset.active)));
    const ts = editor.getAttributes('textStyle');
    const fam = ts.fontFamily ? ts.fontFamily.split(',')[0].replace(/["']/g, '') : '';
    const famSel = $('#fontFamily');
    if (fam && !Array.from(famSel.options).some((o) => o.value === fam)) famSel.add(new Option(fam, fam));
    famSel.value = fam;
    const sizeSel = $('#fontSize');
    const size = ts.fontSize ? String(Math.round(parseFloat(ts.fontSize) * 2) / 2) : '';
    if (size && !Array.from(sizeSel.options).some((o) => o.value === size)) sizeSel.add(new Option(size, size));
    sizeSel.value = size;
    const s = state.doc?.settings || {};
    const toggles = {
      painter: !!state.painter,
      pageNumbers: !!s.pageNumbers,
      spellcheck: editor.view.dom.getAttribute('spellcheck') === 'true',
      reading: speechSynthesis?.speaking,
      dictating: !!state.dictation,
      commentsPane: !$('#commentsPane').classList.contains('hidden'),
      navPane: !$('#navPane').classList.contains('hidden'),
      printLayout: state.layout === 'print',
      webLayout: state.layout === 'web',
      focusMode: document.body.classList.contains('focus-mode'),
    };
    $$('[data-toggle]').forEach((b) => b.classList.toggle('on', !!toggles[b.dataset.toggle]));
    const inTable = editor.isActive('table');
    $('#tableTab').classList.toggle('hidden', !inTable);
    if (!inTable && $('#tableTab').classList.contains('active')) selectTab('home');
    $('#statWords').textContent = `${editor.storage.characterCount.words().toLocaleString()} words`;
    updateCurrentPage();
  });
}

// ---------- Dialogs ----------

const dlg = $('#dlg');
function dialog(title, bodyHtml, { okText = 'OK', cancel = true, onOpen } = {}) {
  $('#dlgTitle').textContent = title;
  $('#dlgBody').innerHTML = bodyHtml;
  $('#dlgOk').textContent = okText;
  $('#dlgCancel').classList.toggle('hidden', !cancel);
  createIcons({ icons, root: dlg });
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? $('#dlgBody') : null);
    dlg.returnValue = '';
    dlg.showModal();
    onOpen?.($('#dlgBody'));
  });
}

async function tableDialog() {
  const body = await dialog('Insert table', `
    <div class="grid-picker" id="gridPicker">${Array.from({ length: 64 }, (_, i) => `<span data-r="${Math.floor(i / 8) + 1}" data-c="${(i % 8) + 1}"></span>`).join('')}</div>
    <div class="form-row"><label>Columns <input type="number" name="cols" min="1" max="20" value="3"></label>
    <label>Rows <input type="number" name="rows" min="1" max="100" value="3"></label></div>
    <label class="chk"><input type="checkbox" name="header" checked> Header row</label>`, {
    okText: 'Insert',
    onOpen: (b) => {
      const cells = $$('span', b);
      const mark = (r, c) => cells.forEach((s) => s.classList.toggle('sel', +s.dataset.r <= r && +s.dataset.c <= c));
      mark(3, 3);
      b.querySelector('#gridPicker').addEventListener('pointerover', (e) => {
        const s = e.target.closest('span');
        if (!s) return;
        mark(+s.dataset.r, +s.dataset.c);
        b.querySelector('[name=rows]').value = s.dataset.r;
        b.querySelector('[name=cols]').value = s.dataset.c;
      });
      b.querySelector('#gridPicker').addEventListener('click', (e) => {
        if (e.target.closest('span')) { dlg.returnValue = 'ok'; dlg.close('ok'); }
      });
    },
  });
  if (!body) return;
  const rows = Math.max(1, +$('[name=rows]', body).value || 3);
  const cols = Math.max(1, +$('[name=cols]', body).value || 3);
  chain().insertTable({ rows, cols, withHeaderRow: $('[name=header]', body).checked }).run();
}

async function linkDialog() {
  const { from, to, empty } = editor.state.selection;
  const existing = editor.getAttributes('link').href || '';
  const text = editor.state.doc.textBetween(from, to, ' ');
  const body = await dialog(existing ? 'Edit link' : 'Insert link', `
    <label class="field">Text to display <input name="text" value="${escapeAttr(text)}" ${empty ? '' : 'disabled'}></label>
    <label class="field">Address <input name="url" type="url" inputmode="url" placeholder="https://" value="${escapeAttr(existing)}" autofocus></label>
    ${existing ? '<label class="chk"><input type="checkbox" name="remove"> Remove link</label>' : ''}`, { okText: 'Apply' });
  if (!body) return;
  if ($('[name=remove]', body)?.checked) return chain().extendMarkRange('link').unsetLink().run();
  let url = $('[name=url]', body).value.trim();
  if (!url) return;
  if (!/^[a-z]+:/i.test(url)) url = url.includes('@') && !url.includes('/') ? `mailto:${url}` : `https://${url}`;
  if (empty) {
    const label = $('[name=text]', body).value || url;
    chain().insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] }).run();
  } else {
    chain().extendMarkRange('link').setLink({ href: url }).run();
  }
}

async function commentDialog() {
  if (editor.state.selection.empty) return toast('Select the text you want to comment on');
  const body = await dialog('New comment', '<label class="field">Comment <textarea name="c" rows="4" autofocus></textarea></label>', { okText: 'Post' });
  const text = body && $('[name=c]', body).value.trim();
  if (!text) return;
  chain().addComment({ id: newId(), text, author: localStorage.getItem('dw-author') || 'Me', date: new Date().toISOString() }).run();
  showPane('commentsPane');
}

async function dateDialog() {
  const d = new Date();
  const formats = [
    d.toLocaleDateString(), d.toLocaleDateString(undefined, { dateStyle: 'long' }), d.toLocaleDateString(undefined, { dateStyle: 'full' }),
    d.toISOString().slice(0, 10), d.toLocaleTimeString(undefined, { timeStyle: 'short' }), d.toLocaleString(),
  ];
  const body = await dialog('Date and time', `<div class="radio-list">${formats.map((f, i) =>
    `<label><input type="radio" name="f" value="${i}" ${i === 1 ? 'checked' : ''}> ${f}</label>`).join('')}</div>`, { okText: 'Insert' });
  if (!body) return;
  chain().insertContent(formats[+$('[name=f]:checked', body).value]).run();
}

async function symbolDialog() {
  await dialog('Symbol', `<div class="symbols">${SYMBOLS.map((s) => `<button type="button" data-sym="${s}">${s}</button>`).join('')}</div>`, {
    okText: 'Close', cancel: false,
    onOpen: (b) => b.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sym]');
      if (s) { editor.chain().insertContent(s.dataset.sym).run(); toast(`Inserted ${s.dataset.sym}`); }
    }),
  });
  editor.commands.focus();
}

async function wordCountDialog() {
  const cc = editor.storage.characterCount;
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ');
  const { from, to, empty } = editor.state.selection;
  const selText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
  let paragraphs = 0;
  editor.state.doc.descendants((n) => { if (n.isTextblock && n.textContent.trim()) paragraphs++; });
  const rows = [
    ['Pages', state.pageCount || 1],
    ['Words', cc.words()],
    ['Characters (no spaces)', text.replace(/\s/g, '').length],
    ['Characters (with spaces)', cc.characters()],
    ['Paragraphs', paragraphs],
  ];
  if (selText) rows.splice(2, 0, ['Words in selection', selText.split(/\s+/).filter(Boolean).length]);
  await dialog('Word count', `<table class="stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v.toLocaleString()}</td></tr>`).join('')}</table>`, { okText: 'Close', cancel: false });
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = escapeAttr;

// ---------- Find & replace ----------

function openFind(withReplace) {
  const bar = $('#findbar');
  bar.classList.remove('hidden');
  bar.classList.toggle('with-replace', withReplace);
  const { from, to, empty } = editor.state.selection;
  if (!empty) $('#findInput').value = editor.state.doc.textBetween(from, to, ' ');
  $('#findInput').focus();
  $('#findInput').select();
  doSearch();
}

function closeFind() {
  $('#findbar').classList.add('hidden');
  editor.commands.setSearchTerm('');
  editor.commands.focus();
}

function doSearch() {
  editor.commands.setSearchTerm($('#findInput').value, $('#findCase').checked);
  updateFindCount();
}

function updateFindCount() {
  const s = editor.storage.search;
  $('#findCount').textContent = s.term ? (s.results.length ? `${s.index + 1 > 0 ? s.index + 1 : 0} of ${s.results.length}` : 'No results') : '';
}

$('#findInput').addEventListener('input', doSearch);
$('#findCase').addEventListener('change', doSearch);
$('#findInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); run(e.shiftKey ? 'findPrev' : 'findNext'); }
  if (e.key === 'Escape') closeFind();
});
$('#replaceInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); run('replaceOne'); }
  if (e.key === 'Escape') closeFind();
});

// ---------- Panes: navigation & comments ----------

function togglePane(id) {
  const pane = document.getElementById(id);
  pane.classList.toggle('hidden');
  if (window.innerWidth < 900) {
    $$('.side-pane').forEach((p) => p !== pane && p.classList.add('hidden'));
  }
  refreshNav();
  refreshComments();
  updateToolbar();
}
function showPane(id) { if (document.getElementById(id).classList.contains('hidden')) togglePane(id); }

function refreshNav() {
  if ($('#navPane').classList.contains('hidden')) return;
  const items = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') items.push({ level: node.attrs.docStyle === 'title' ? 0 : node.attrs.level, text: node.textContent, pos });
    return node.isBlock && !node.isTextblock;
  });
  $('#navList').innerHTML = items.length
    ? items.map((h) => `<button class="nav-item lvl-${h.level}" data-pos="${h.pos}">${escapeHtml(h.text || '(empty heading)')}</button>`).join('')
    : '<p class="muted pad">Add headings (Home → Styles) to see them here.</p>';
}
$('#navList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pos]');
  if (!b) return;
  const pos = +b.dataset.pos + 1;
  chain().setTextSelection(pos).run();
  editor.view.domAtPos(pos).node?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (window.innerWidth < 900) togglePane('navPane');
});

function collectComments() {
  const map = new Map();
  editor.state.doc.descendants((node, pos) => {
    node.marks?.forEach((m) => {
      if (m.type.name !== 'comment') return;
      const c = map.get(m.attrs.id) || { ...m.attrs, from: pos, to: pos, quote: '' };
      c.to = pos + node.nodeSize;
      c.quote += node.text || '';
      map.set(m.attrs.id, c);
    });
  });
  return [...map.values()];
}

function refreshComments() {
  if ($('#commentsPane').classList.contains('hidden')) return;
  const list = collectComments();
  $('#commentList').innerHTML = list.length ? list.map((c) => `
    <div class="comment-card" data-id="${c.id}" data-from="${c.from}" data-to="${c.to}">
      <div class="cc-head"><b>${escapeHtml(c.author)}</b><span>${c.date ? new Date(c.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></div>
      <div class="cc-quote">“${escapeHtml(c.quote.slice(0, 80))}${c.quote.length > 80 ? '…' : ''}”</div>
      <div class="cc-text">${escapeHtml(c.text)}</div>
      <div class="cc-actions"><button class="txt-btn" data-act="resolve">Resolve</button></div>
    </div>`).join('') : '<p class="muted pad">No comments yet. Select text and choose New comment.</p>';
}
$('#commentList').addEventListener('click', (e) => {
  const card = e.target.closest('.comment-card');
  if (!card) return;
  if (e.target.closest('[data-act=resolve]')) { editor.commands.removeComment(card.dataset.id); return; }
  chain().setTextSelection({ from: +card.dataset.from, to: +card.dataset.to }).scrollIntoView().run();
});

// ---------- Page layout ----------

const pageEl = $('#page');
const pageStyle = document.createElement('style');
document.head.appendChild(pageStyle);

function applySettings() {
  const s = state.doc.settings;
  const size = PAGE_SIZES[s.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[s.margins] || MARGINS.normal;
  const landscape = s.orientation === 'landscape';
  const w = landscape ? size.h : size.w;
  const h = landscape ? size.w : size.h;
  pageEl.style.setProperty('--page-w', `${w}in`);
  pageEl.style.setProperty('--page-h', `${h}in`);
  pageEl.style.setProperty('--m-top', `${m.top}in`);
  pageEl.style.setProperty('--m-bottom', `${m.bottom}in`);
  pageEl.style.setProperty('--m-left', `${m.left}in`);
  pageEl.style.setProperty('--m-right', `${m.right}in`);
  pageEl.style.setProperty('--cols', s.columns || 1);
  $('#pageHeader').textContent = s.header || '';
  $('#footerText').textContent = s.footer || '';
  $('#pageNumLabel').classList.toggle('hidden', !s.pageNumbers);
  const q = (t) => `"${String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;
  pageStyle.textContent = `@media print {
    @page { size: ${size.css} ${landscape ? 'landscape' : 'portrait'}; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;
      ${s.header ? `@top-center { content: ${q(s.header)}; color: #666; font: 10pt Helvetica, Arial, sans-serif; white-space: pre; }` : ''}
      ${s.footer || s.pageNumbers ? `@bottom-center { content: ${s.footer ? q(s.footer) : '""'} ${s.footer && s.pageNumbers ? '"  ·  "' : ''} ${s.pageNumbers ? '"Page " counter(page) " of " counter(pages)' : ''}; color: #666; font: 10pt Helvetica, Arial, sans-serif; }` : ''}
    }
  }`;
  scheduleLayout();
  updateToolbar();
}

function updateSettings(patch) {
  Object.assign(state.doc.settings, patch);
  applySettings();
  scheduleSave();
}

['pageHeader', 'footerText'].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    state.doc.settings[id === 'pageHeader' ? 'header' : 'footer'] = el.innerText.replace(/\n$/, '');
    scheduleSave();
  });
  el.addEventListener('blur', applySettings);
});

let layoutRaf = 0;
function scheduleLayout() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(paginate);
}

// Estimate where printed pages begin and mark them on the continuous sheet.
function paginate() {
  const dom = editor.view.dom;
  const markers = $('#pageMarkers') || Object.assign(document.createElement('div'), { id: 'pageMarkers', className: 'page-markers' });
  if (!markers.parentNode) pageEl.appendChild(markers);
  markers.innerHTML = '';
  if (state.layout !== 'print' || !state.doc) { state.pageCount = 1; updatePageStatus(); return; }

  const s = state.doc.settings;
  const size = PAGE_SIZES[s.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[s.margins] || MARGINS.normal;
  const h = s.orientation === 'landscape' ? size.w : size.h;
  const perPage = (h - m.top - m.bottom) * 96 * (s.columns || 1);
  const top0 = dom.offsetTop;
  const starts = [0];
  let pageStart = 0;
  for (const el of dom.children) {
    const t = el.offsetTop - top0;
    const b = t + el.offsetHeight;
    if (el.classList.contains('page-break')) { pageStart = b; starts.push(b); continue; }
    while (b - pageStart > perPage + 1) {
      const next = t > pageStart && el.offsetHeight < perPage ? t : pageStart + perPage;
      pageStart = next;
      starts.push(next);
    }
  }
  state.pageStarts = starts;
  state.pageCount = starts.length;
  starts.slice(1).forEach((y, i) => {
    const mk = document.createElement('div');
    mk.className = 'page-marker';
    mk.style.top = `${top0 + y}px`;
    mk.innerHTML = `<span>Page ${i + 2}</span>`;
    markers.appendChild(mk);
  });
  pageEl.style.setProperty('--pages', starts.length);
  updatePageStatus();
}

function updateCurrentPage() {
  if (!state.pageStarts) return;
  try {
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    const y = coords.top - editor.view.dom.getBoundingClientRect().top;
    const scale = state.zoom / 100;
    let p = 1;
    state.pageStarts.forEach((s, i) => { if (y / scale >= s) p = i + 1; });
    state.currentPage = p;
  } catch { state.currentPage = 1; }
  updatePageStatus();
}

function updatePageStatus() {
  const total = state.pageCount || 1;
  $('#statPages').textContent = `Page ${Math.min(state.currentPage || 1, total)} of ${total}`;
  $('.pn-current').textContent = `${total} of ${total}`;
}

function setLayout(v) {
  state.layout = v;
  document.body.classList.toggle('web-layout', v === 'web');
  if (v === 'web') setZoom(100, true);
  scheduleLayout();
  updateToolbar();
}

function setZoom(z, silent) {
  state.zoom = Math.max(50, Math.min(200, Math.round(z)));
  $('#zoomer').style.zoom = state.zoom / 100;
  $('#zoomRange').value = state.zoom;
  $('#zoomLabel').textContent = `${state.zoom}%`;
  if (!silent) try { localStorage.setItem('dw-zoom', state.zoom); } catch {}
}
$('#zoomRange').addEventListener('input', (e) => setZoom(+e.target.value));

function fitWidth() {
  if (state.layout !== 'print') setLayout('print');
  const avail = $('#canvas').clientWidth - 32;
  setZoom(Math.floor((avail / pageEl.offsetWidth) * 100));
}

// Pinch to zoom on the page on touch devices.
(() => {
  let startDist = 0;
  let startZoom = 100;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  $('#canvas').addEventListener('touchstart', (e) => { if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = state.zoom; } }, { passive: true });
  $('#canvas').addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && startDist && state.layout === 'print') {
      e.preventDefault();
      setZoom(startZoom * (dist(e.touches) / startDist));
    }
  }, { passive: false });
  $('#canvas').addEventListener('touchend', () => { startDist = 0; });
})();

function toggleFocus() {
  document.body.classList.toggle('focus-mode');
  if (document.body.classList.contains('focus-mode')) toast('Focus mode — press Esc to exit');
  updateToolbar();
}

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('dw-theme', root.dataset.theme); } catch {}
}

// ---------- Speech ----------

function readAloud() {
  if (!('speechSynthesis' in window)) return toast('Read aloud is not supported in this browser');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); updateToolbar(); return; }
  const { from, to, empty } = editor.state.selection;
  const doc = editor.state.doc;
  const text = empty ? doc.textBetween(from, doc.content.size, '\n', ' ') : doc.textBetween(from, to, '\n', ' ');
  if (!text.trim()) return toast('Nothing to read');
  const u = new SpeechSynthesisUtterance(text);
  u.onend = u.onerror = () => updateToolbar();
  speechSynthesis.speak(u);
  updateToolbar();
}

function dictate() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Dictation is not supported here — use your keyboard’s microphone key');
  if (state.dictation) { state.dictation.stop(); return; }
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = navigator.language || 'en-US';
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        const before = editor.state.doc.textBetween(Math.max(0, editor.state.selection.from - 1), editor.state.selection.from);
        const t = e.results[i][0].transcript.trim();
        chain().insertContent((before && !/\s/.test(before) ? ' ' : '') + t).run();
      }
    }
  };
  rec.onend = () => { state.dictation = null; updateToolbar(); };
  rec.onerror = (e) => toast(`Dictation stopped: ${e.error}`);
  rec.start();
  state.dictation = rec;
  toast('Listening… tap Dictate again to stop');
  updateToolbar();
}

// ---------- Images ----------

function insertImageFiles(files) {
  const imgs = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return false;
  imgs.forEach(async (f) => {
    const src = await downscale(f);
    chain().setImage({ src, alt: f.name.replace(/\.[^.]+$/, '') }).run();
  });
  return true;
}

// Phone photos are huge; cap them so documents stay fast and small.
async function downscale(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    if (file.type === 'image/gif' || file.type === 'image/svg+xml' || Math.max(img.naturalWidth, img.naturalHeight) <= max) {
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    }
    const k = max / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

$('#imageInput').addEventListener('change', (e) => { insertImageFiles(e.target.files); e.target.value = ''; });

// ---------- Documents ----------

function setSaveState(text) { $('#saveState').textContent = text; }

function scheduleSave() {
  if (!state.doc) return;
  setSaveState('Saving…');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persist, 600);
}

async function persist() {
  clearTimeout(state.saveTimer);
  if (!state.doc) return;
  state.doc.content = editor.getJSON();
  state.doc.title = $('#docTitle').value.trim() || 'Untitled document';
  try {
    await saveDoc(state.doc);
    setSaveState('Saved');
  } catch {
    setSaveState('Not saved — storage full');
  }
}

function loadIntoEditor(doc) {
  state.doc = doc;
  doc.settings = { ...DEFAULT_SETTINGS, ...(doc.settings || {}) };
  $('#docTitle').value = doc.title;
  document.title = `${doc.title} — Dynoword`;
  editor.commands.setContent(doc.content || doc.html || '<p></p>', { emitUpdate: false });
  editor.commands.setSearchTerm('');
  applySettings();
  refreshNav();
  refreshComments();
  setSaveState('Saved');
  try { localStorage.setItem('dw-last', doc.id); } catch {}
  editor.commands.focus('start');
}

async function newDocument(template = 'blank', html, title) {
  await persist();
  const t = TEMPLATES[template] || TEMPLATES.blank;
  const doc = { id: newId(), title: title || t.title, html: html ?? t.html(), settings: { ...DEFAULT_SETTINGS }, created: Date.now() };
  loadIntoEditor(doc);
  delete doc.html;
  await persist();
  closeHub();
}

async function openDoc(id) {
  await persist();
  const doc = await getDoc(id);
  if (doc) loadIntoEditor(doc);
  closeHub();
}

async function openFiles(file) {
  try {
    toast(`Opening ${file.name}…`);
    const { name, html } = await readFile(file);
    await newDocument('blank', html, name);
    toast(`Opened ${file.name}`);
  } catch (e) {
    console.error(e);
    toast(`Could not open ${file.name}`);
  }
}
$('#fileInput').addEventListener('change', (e) => { if (e.target.files[0]) openFiles(e.target.files[0]); e.target.value = ''; });

$('#docTitle').addEventListener('input', () => { document.title = `${$('#docTitle').value} — Dynoword`; scheduleSave(); });
$('#docTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.focus(); } });

async function exportBlob(kind) {
  const title = $('#docTitle').value || 'Document';
  const s = { ...state.doc.settings, title };
  switch (kind) {
    case 'docx': {
      const { exportDocx } = await import('./docx-export.js');
      return new Blob([await exportDocx(editor.getJSON(), s)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    case 'html': return new Blob([standaloneHtml(title, editor.getHTML(), s)], { type: 'text/html' });
    case 'md': return new Blob([htmlToMarkdown(editor.getHTML())], { type: 'text/markdown' });
    default: return new Blob([editor.getText({ blockSeparator: '\n\n' })], { type: 'text/plain' });
  }
}

async function exportAs(kind) {
  try {
    const blob = await exportBlob(kind);
    download(blob, `${safeFilename($('#docTitle').value)}.${kind}`);
    toast(`Downloaded ${kind.toUpperCase()}`);
  } catch (e) {
    console.error(e);
    toast('Export failed');
  }
}

async function share() {
  try {
    const name = `${safeFilename($('#docTitle').value)}.docx`;
    const blob = await exportBlob('docx');
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: $('#docTitle').value });
    } else {
      download(blob, name);
      toast('Sharing isn’t available here — downloaded instead');
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not share');
  }
}

// ---------- Document hub ----------

async function renderRecent() {
  const docs = await listDocs();
  const html = docs.length ? docs.map((d) => `
    <div class="recent-item ${d.id === state.doc?.id ? 'current' : ''}">
      <button class="recent-open" data-open="${d.id}"><i data-lucide="file-text"></i>
        <span><b>${escapeHtml(d.title)}</b><small>${new Date(d.updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</small></span></button>
      <button class="icon-btn" data-del="${d.id}" title="Delete"><i data-lucide="trash-2"></i></button>
    </div>`).join('') : '<p class="muted">No documents yet.</p>';
  $('#recentList').innerHTML = html;
  $('#recentList2').innerHTML = html;
  createIcons({ icons, root: $('#hub') });
}

$('#hub').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  if (open) return openDoc(open.dataset.open);
  const del = e.target.closest('[data-del]');
  if (del) {
    const body = await dialog('Delete document?', '<p>This permanently removes the document from this device.</p>', { okText: 'Delete' });
    if (!body) return;
    await deleteDoc(del.dataset.del);
    if (del.dataset.del === state.doc?.id) {
      state.doc = null;
      const docs = await listDocs();
      if (docs[0]) loadIntoEditor(await getDoc(docs[0].id)); else await newDocument('blank');
      openHub();
    }
    renderRecent();
    return;
  }
  const nav = e.target.closest('[data-bs]');
  if (nav) {
    $$('[data-bs]').forEach((b) => b.classList.toggle('active', b === nav));
    $$('[data-bs-panel]').forEach((p) => p.classList.toggle('active', p.dataset.bsPanel === nav.dataset.bs));
  }
});

async function openHub() {
  await persist();
  await renderRecent();
  $('#hub').classList.remove('hidden');
}
function closeHub() { $('#hub').classList.add('hidden'); }

// ---------- Keyboard ----------

const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes('Mac');

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') {
    if (!$('#hub').classList.contains('hidden')) return closeHub();
    if (document.body.classList.contains('focus-mode')) return toggleFocus();
    if (state.painter) return togglePainter();
    closeMenus();
    return;
  }
  if (!mod) return;
  const k = e.key.toLowerCase();
  const map = {
    s: () => exportAs('docx'), o: () => run('openFile'), p: () => run('print'), f: () => openFind(false),
    h: () => openFind(true), k: linkDialog, ']': () => stepFont(1), '[': () => stepFont(-1),
    ',': () => commands.subscript(), '.': () => commands.superscript(), n: e.altKey ? () => newDocument('blank') : null,
  };
  if (e.shiftKey || (e.altKey && k !== 'n')) return;
  const fn = map[k];
  if (fn) { e.preventDefault(); fn(); }
});

// ---------- Misc ----------

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
  $('#installBtn').classList.remove('hidden');
});

window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('resize', scheduleLayout);
new ResizeObserver(scheduleLayout).observe($('#editor'));

if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $('#dictateBtn').classList.add('hidden');

// ---------- Boot ----------

async function boot() {
  createIcons({ icons });
  buildPalettes();

  const small = window.matchMedia('(max-width: 760px)').matches;
  setLayout(small ? 'web' : 'print');
  if (!small) setZoom(+(localStorage.getItem('dw-zoom') || 100));

  let doc = null;
  try {
    const last = localStorage.getItem('dw-last');
    if (last) doc = await getDoc(last);
    if (!doc) doc = (await listDocs())[0];
  } catch {}
  if (doc) loadIntoEditor(doc);
  else await newDocument('blank');

  // Files opened from the OS ("Open with Dynoword") on installed desktop apps.
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      for (const handle of params.files || []) openFiles(await handle.getFile());
    });
  }

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
