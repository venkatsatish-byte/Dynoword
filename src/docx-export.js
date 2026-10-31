import {
  AlignmentType, BorderStyle, CommentRangeEnd, CommentRangeStart, CommentReference, Document,
  ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, LevelFormat, PageBreak, PageNumber,
  PageOrientation, Packer, Paragraph, ShadingType, Tab, Table, TableCell, TableRow, TabStopType, TextRun, WidthType,
} from 'docx';
import { PAGE_SIZES, MARGINS } from './page.js';

const TWIP_PER_IN = 1440;
const tw = (inches) => Math.round(inches * TWIP_PER_IN);
const BORDER_SIDES = {
  bottom: ['bottom'], top: ['top'], topbottom: ['top', 'bottom'], left: ['left'], box: ['top', 'bottom', 'left', 'right'],
};
const TAB_TYPES = { left: TabStopType.LEFT, center: TabStopType.CENTER, right: TabStopType.RIGHT };
const PX_PER_IN = 96;

const ALIGN = {
  left: AlignmentType.LEFT, center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
};
const HEADINGS = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function toHex(color) {
  if (!color) return undefined;
  color = color.trim();
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return h.slice(0, 6).toUpperCase();
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    return m[1].split(',').slice(0, 3)
      .map((n) => Math.round(parseFloat(n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = color;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle.slice(1).toUpperCase() : undefined;
}

function toHalfPoints(size) {
  if (!size) return undefined;
  const n = parseFloat(size);
  if (Number.isNaN(n)) return undefined;
  if (size.endsWith('px')) return Math.round(n * 0.75 * 2);
  if (size.endsWith('em') || size.endsWith('rem')) return Math.round(n * 11 * 2);
  return Math.round(n * 2);
}

function cleanFont(family) {
  if (!family) return undefined;
  return family.split(',')[0].replace(/["']/g, '').trim() || undefined;
}

function dataUrlToBytes(src) {
  const [head, data] = src.split(',');
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
  return { bytes, mime };
}

/** Loads an image, converting anything a .docx can't embed (SVG, WebP, remote URLs) to PNG. */
async function loadImage(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const w = img.naturalWidth || 300;
  const h = img.naturalHeight || 200;
  if (src.startsWith('data:')) {
    const { bytes, mime } = dataUrlToBytes(src);
    const type = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' }[mime];
    if (type) return { bytes, type, w, h };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png', w, h };
}

class Converter {
  constructor(settings) {
    this.settings = settings;
    this.images = new Map();
    this.comments = [];
    this.numberingInstance = 0;
    const size = PAGE_SIZES[settings.pageSize] || PAGE_SIZES.letter;
    const m = MARGINS[settings.margins] || MARGINS.normal;
    const pageW = settings.orientation === 'landscape' ? size.h : size.w;
    this.contentWidthPx = ((pageW - m.left - m.right) / (settings.columns || 1)) * PX_PER_IN;
  }

  async preloadImages(json) {
    const srcs = [];
    const walk = (n) => {
      if (n.type === 'image' && n.attrs?.src) srcs.push(n.attrs.src);
      (n.content || []).forEach(walk);
    };
    walk(json);
    await Promise.all(srcs.map(async (src) => {
      try { this.images.set(src, await loadImage(src)); } catch (e) { console.warn('Image skipped', e); }
    }));
  }

  runs(nodes = [], extra = {}) {
    const out = [];
    let openComments = new Map();
    nodes.forEach((node, idx) => {
      if (node.type === 'hardBreak') { out.push(new TextRun({ break: 1, ...extra })); return; }
      if (node.type === 'tab') { out.push(new TextRun({ children: [new Tab()], ...extra })); return; }
      if (node.type === 'image') { const r = this.imageRun(node); if (r) out.push(r); return; }
      if (node.type !== 'text') return;

      const opts = { text: node.text, ...extra };
      let link = null;
      let comment = null;
      (node.marks || []).forEach((mark) => {
        const a = mark.attrs || {};
        switch (mark.type) {
          case 'bold': opts.bold = true; break;
          case 'italic': opts.italics = true; break;
          case 'underline': opts.underline = {}; break;
          case 'strike': opts.strike = true; break;
          case 'subscript': opts.subScript = true; break;
          case 'superscript': opts.superScript = true; break;
          case 'code': opts.font = 'Courier New'; opts.shading = { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' }; break;
          case 'highlight': opts.shading = { type: ShadingType.CLEAR, fill: toHex(a.color) || 'FFFF00', color: 'auto' }; break;
          case 'textStyle':
            if (a.color) opts.color = toHex(a.color);
            if (a.fontFamily) opts.font = cleanFont(a.fontFamily);
            if (a.fontSize) opts.size = toHalfPoints(a.fontSize);
            break;
          case 'link': link = a.href; break;
          case 'comment': comment = a; break;
          default: break;
        }
      });

      if (comment) {
        const prev = nodes[idx - 1]?.marks?.find((m) => m.type === 'comment')?.attrs?.id;
        if (prev !== comment.id || !openComments.has(comment.id)) {
          const cid = this.comments.length;
          this.comments.push({
            id: cid, author: comment.author || 'Me', date: comment.date ? new Date(comment.date) : new Date(),
            children: [new Paragraph({ children: [new TextRun(comment.text || '')] })],
          });
          openComments.set(comment.id, cid);
          out.push(new CommentRangeStart(cid));
        }
      }

      if (link) {
        out.push(new ExternalHyperlink({ link, children: [new TextRun({ ...opts, style: 'Hyperlink' })] }));
      } else {
        out.push(new TextRun(opts));
      }

      if (comment) {
        const next = nodes[idx + 1]?.marks?.find((m) => m.type === 'comment')?.attrs?.id;
        if (next !== comment.id) {
          const cid = openComments.get(comment.id);
          out.push(new CommentRangeEnd(cid));
          out.push(new TextRun({ children: [new CommentReference(cid)] }));
          openComments.delete(comment.id);
        }
      }
    });
    return out;
  }

  imageRun(node) {
    const img = this.images.get(node.attrs.src);
    if (!img) return null;
    let width = Number(node.attrs.width) || img.w;
    let height = Number(node.attrs.height) || (img.h * width) / img.w;
    if (width > this.contentWidthPx) {
      height = (height * this.contentWidthPx) / width;
      width = this.contentWidthPx;
    }
    return new ImageRun({
      type: img.type, data: img.bytes,
      transformation: { width: Math.round(width), height: Math.round(height) },
      altText: node.attrs.alt ? { name: node.attrs.alt, description: node.attrs.alt, title: node.attrs.alt } : undefined,
    });
  }

  paraOpts(node) {
    const a = node.attrs || {};
    const opts = {};
    if (a.textAlign && ALIGN[a.textAlign]) opts.alignment = ALIGN[a.textAlign];
    const spacing = {};
    if (a.lineHeight) spacing.line = Math.round(parseFloat(a.lineHeight) * 240);
    if (a.spaceBefore != null) spacing.before = Math.round(a.spaceBefore * 20);
    if (a.spaceAfter != null) spacing.after = Math.round(a.spaceAfter * 20);
    if (Object.keys(spacing).length) opts.spacing = spacing;
    const indent = {};
    if (a.leftIndent) indent.left = tw(a.leftIndent);
    if (a.rightIndent) indent.right = tw(a.rightIndent);
    if (a.firstLine > 0) indent.firstLine = tw(a.firstLine);
    if (a.firstLine < 0) indent.hanging = tw(-a.firstLine);
    if (Object.keys(indent).length) opts.indent = indent;
    if (a.border && BORDER_SIDES[a.border]) {
      opts.border = Object.fromEntries(BORDER_SIDES[a.border].map((side) => [side, {
        style: BorderStyle.SINGLE, size: a.border === 'left' ? 18 : 6, color: 'auto', space: a.border === 'left' ? 6 : 2,
      }]));
    }
    if (a.shading) opts.shading = { type: ShadingType.CLEAR, fill: toHex(a.shading), color: 'auto' };
    if (a.tabStops?.length) {
      opts.tabStops = a.tabStops.map((t) => ({ type: TAB_TYPES[t.align] || TabStopType.LEFT, position: tw(t.pos) }));
    }
    return opts;
  }

  blocks(nodes = [], ctx = {}) {
    return nodes.flatMap((n) => this.block(n, ctx));
  }

  block(node, ctx) {
    const a = node.attrs || {};
    switch (node.type) {
      case 'paragraph':
        return [new Paragraph({ ...this.paraOpts(node), ...ctx.para, children: this.runs(node.content) })];
      case 'heading':
        return [new Paragraph({
          ...this.paraOpts(node), ...ctx.para,
          heading: a.docStyle === 'title' ? HeadingLevel.TITLE : HEADINGS[a.level] || HeadingLevel.HEADING_1,
          children: this.runs(node.content),
        })];
      case 'blockquote':
        return this.blocks(node.content, {
          ...ctx,
          para: {
            ...ctx.para,
            indent: { left: 720 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'BFBFBF', space: 12 } },
          },
        });
      case 'codeBlock': {
        const text = (node.content || []).map((t) => t.text).join('');
        return text.split('\n').map((line) => new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
          spacing: { after: 0, line: 240 },
          children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
        }));
      }
      case 'horizontalRule':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 1 } }, children: [] })];
      case 'pageBreak':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'image':
        return [new Paragraph({ ...ctx.para, children: [this.imageRun(node)].filter(Boolean) })];
      case 'bulletList':
        return this.list(node, ctx, 'bullets');
      case 'orderedList':
        return this.list(node, ctx, 'numbers');
      case 'taskList':
        return this.list(node, ctx, 'tasks');
      case 'table':
        return [this.table(node)];
      default:
        return node.content ? this.blocks(node.content, ctx) : [];
    }
  }

  list(node, ctx, kind) {
    const level = (ctx.listLevel ?? -1) + 1;
    const instance = kind === 'numbers' && level === 0 ? ++this.numberingInstance : ctx.instance;
    const out = [];
    (node.content || []).forEach((item) => {
      (item.content || []).forEach((child, i) => {
        if (['bulletList', 'orderedList', 'taskList'].includes(child.type)) {
          out.push(...this.block(child, { ...ctx, listLevel: level, instance: instance ?? this.numberingInstance }));
        } else if (i === 0 && child.type === 'paragraph') {
          const prefix = kind === 'tasks' ? [new TextRun(item.attrs?.checked ? '☒ ' : '☐ ')] : [];
          const para = { ...this.paraOpts(child), children: [...prefix, ...this.runs(child.content)] };
          if (kind === 'tasks') para.indent = { left: 360 + level * 360 };
          else para.numbering = { reference: kind, level: Math.min(level, 8), instance: kind === 'numbers' ? instance : undefined };
          out.push(new Paragraph(para));
        } else {
          out.push(...this.block(child, { ...ctx, para: { indent: { left: 720 * (level + 1) } } }));
        }
      });
    });
    return out;
  }

  table(node) {
    const rows = node.content || [];
    const cols = (rows[0]?.content || []).reduce((n, c) => n + (c.attrs?.colspan || 1), 0) || 1;
    const totalTwips = Math.round((this.contentWidthPx / PX_PER_IN) * TWIP_PER_IN);
    const colW = Math.floor(totalTwips / cols);
    return new Table({
      width: { size: totalTwips, type: WidthType.DXA },
      columnWidths: Array(cols).fill(colW),
      rows: rows.map((row) => new TableRow({
        tableHeader: row.content?.every((c) => c.type === 'tableHeader') || undefined,
        children: (row.content || []).map((cell) => {
          const children = this.blocks(cell.content);
          return new TableCell({
            columnSpan: cell.attrs?.colspan > 1 ? cell.attrs.colspan : undefined,
            rowSpan: cell.attrs?.rowspan > 1 ? cell.attrs.rowspan : undefined,
            width: { size: colW * (cell.attrs?.colspan || 1), type: WidthType.DXA },
            shading: cell.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: 'E6F4F1', color: 'auto' } : undefined,
            children: children.length ? children : [new Paragraph('')],
          });
        }),
      })),
    });
  }
}

function numberingConfig() {
  const bullets = ['•', '◦', '▪'];
  const numFmt = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const levels = (fn) => Array.from({ length: 9 }, (_, l) => ({
    level: l,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
    ...fn(l),
  }));
  return [
    { reference: 'bullets', levels: levels((l) => ({ format: LevelFormat.BULLET, text: bullets[l % 3] })) },
    { reference: 'numbers', levels: levels((l) => ({ format: numFmt[l % 3], text: `%${l + 1}.` })) },
  ];
}

function textParagraphs(text) {
  return (text || '').split('\n').map((line) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(line)] }));
}

export async function exportDocx(json, settings) {
  const conv = new Converter(settings);
  await conv.preloadImages(json);
  const children = conv.blocks(json.content);

  const size = PAGE_SIZES[settings.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[settings.margins] || MARGINS.normal;
  const landscape = settings.orientation === 'landscape';

  const footerChildren = settings.footer ? textParagraphs(settings.footer) : [];
  if (settings.pageNumbers) {
    footerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
    }));
  }

  const doc = new Document({
    creator: 'Dynoword',
    background: settings.pageColor ? { color: toHex(settings.pageColor) } : undefined,
    title: settings.title || 'Document',
    comments: { children: conv.comments },
    numbering: { config: numberingConfig() },
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 24 }, paragraph: { spacing: { after: 160, line: 324 } } },
        title: { run: { font: 'Arial', size: 56, color: '1E293B' }, paragraph: { spacing: { after: 160 } } },
        heading1: { run: { font: 'Arial', size: 32, bold: true, color: '0F5E57' }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading2: { run: { font: 'Arial', size: 28, bold: true, color: '0F5E57' }, paragraph: { spacing: { before: 280, after: 80 } } },
        heading3: { run: { font: 'Arial', size: 24, bold: true, color: '0F766E' }, paragraph: { spacing: { before: 240, after: 80 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: tw(size.w), height: tw(size.h), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: tw(m.top), bottom: tw(m.bottom), left: tw(m.left), right: tw(m.right) },
        },
        column: settings.columns > 1 ? { count: settings.columns, space: 720 } : undefined,
      },
      headers: settings.header ? { default: new Header({ children: textParagraphs(settings.header) }) } : undefined,
      footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
      children: children.length ? children : [new Paragraph('')],
    }],
  });
  return Packer.toBlob(doc);
}
