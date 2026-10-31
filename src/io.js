// Import from and export to common file formats.

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function textToHtml(text) {
  return text.split(/\r?\n\r?\n/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');
}

function mdInline(s) {
  return escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`)
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
}

export function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let list = null;
  let para = [];
  let code = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line)) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    let m;
    if (/^```/.test(line)) { flushPara(); closeList(); code = []; }
    else if ((m = line.match(/^(#{1,6})\s+(.*)/))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)/i))) {
      flushPara(); if (list !== 'ul data-type="taskList"') { closeList(); out.push('<ul data-type="taskList">'); list = 'ul data-type="taskList"'; }
      out.push(`<li data-type="taskItem" data-checked="${m[1].toLowerCase() === 'x'}"><p>${mdInline(m[2])}</p></li>`);
    }
    else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) { flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li><p>${mdInline(m[1])}</p></li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li><p>${mdInline(m[1])}</p></li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { flushPara(); closeList(); out.push(`<blockquote><p>${mdInline(m[1])}</p></blockquote>`); }
    else if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); closeList(); out.push('<hr>'); }
    else if (!line.trim()) { flushPara(); closeList(); }
    else { closeList(); para.push(line.trim()); }
  }
  flushPara(); closeList();
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return out.join('').replace(/<\/ul data-type="taskList">/g, '</ul>');
}

export function htmlToMarkdown(html) {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const inline = (el) => Array.from(el.childNodes).map((n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return '';
    const t = inline(n);
    switch (n.tagName) {
      case 'STRONG': case 'B': return t.trim() ? `**${t}**` : t;
      case 'EM': case 'I': return t.trim() ? `*${t}*` : t;
      case 'S': case 'DEL': return `~~${t}~~`;
      case 'CODE': return `\`${t}\``;
      case 'A': return `[${t}](${n.getAttribute('href')})`;
      case 'IMG': return `![${n.getAttribute('alt') || ''}](${n.getAttribute('src')})`;
      case 'BR': return '  \n';
      default: return t;
    }
  }).join('');
  const block = (el, depth = 0) => Array.from(el.children).map((n) => {
    switch (n.tagName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        return `${'#'.repeat(+n.tagName[1])} ${inline(n)}`;
      case 'UL': case 'OL':
        return Array.from(n.children).map((li, i) => {
          const pad = '  '.repeat(depth);
          const task = li.dataset.type === 'taskItem';
          const marker = n.tagName === 'OL' ? `${i + 1}.` : task ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}]` : '-';
          const first = li.querySelector(':scope > p, :scope > div > p');
          const nested = Array.from(li.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul')).map((l) => block({ children: [l] }, depth + 1)).join('\n');
          return `${pad}${marker} ${first ? inline(first) : inline(li)}${nested ? `\n${nested}` : ''}`;
        }).join('\n');
      case 'BLOCKQUOTE': return block(n).split('\n').map((l) => `> ${l}`).join('\n');
      case 'PRE': return `\`\`\`\n${n.textContent}\n\`\`\``;
      case 'HR': return '---';
      case 'TABLE': {
        const rows = Array.from(n.querySelectorAll('tr')).map((tr) => `| ${Array.from(tr.children).map((c) => inline(c).replace(/\|/g, '\\|').trim()).join(' | ')} |`);
        if (rows.length) rows.splice(1, 0, `|${' --- |'.repeat(n.querySelector('tr').children.length)}`);
        return rows.join('\n');
      }
      case 'DIV': return n.dataset.pageBreak !== undefined ? '\n---\n' : block(n, depth);
      default: return inline(n);
    }
  }).filter((s) => s !== '').join('\n\n');
  return `${block(root)}\n`;
}

export async function readFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'docx') {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        styleMap: [
          "p[style-name='Title'] => h1.doc-title:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Intense Quote'] => blockquote > p:fresh",
          'u => u',
          'strike => s',
          "r[style-name='Hyperlink'] => ",
        ],
      },
    );
    // Word tab characters arrive as \t; turn them into tab nodes so their stops still line up.
    return { name, html: result.value.replace(/\t/g, '<span data-tab></span>') };
  }
  const text = await file.text();
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return { name: doc.title || name, html: doc.body.innerHTML };
  }
  if (ext === 'md' || ext === 'markdown') return { name, html: markdownToHtml(text) };
  return { name, html: textToHtml(text) };
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function safeFilename(title) {
  return (title || 'Document').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 100) || 'Document';
}

export function standaloneHtml(title, bodyHtml, settings) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12pt;line-height:1.35;max-width:6.5in;margin:1in auto;padding:0 16px;color:#222;column-count:${settings.columns || 1};tab-size:0.5in;background:${settings.pageColor || '#fff'}}
.tab{white-space:pre}
p{margin:0 0 8pt}h1,h2,h3{color:#0f5e57;font-weight:700}h1.doc-title{font-size:28pt;font-weight:600;color:#1e293b}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 8px;vertical-align:top}th{background:#e6f4f1}
blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:12px;color:#555;font-style:italic}
pre{background:#f2f2f2;padding:8px;font-family:ui-monospace,Menlo,'Courier New',monospace}img{max-width:100%}
.page-break{break-after:page}ul[data-type=taskList]{list-style:none;padding-left:4px}
ul[data-type=taskList] li{display:flex;gap:6px}.comment-mark{background:#fff3c4}
</style></head><body>
${settings.header ? `<header style="text-align:center;color:#666">${escapeHtml(settings.header)}</header>` : ''}
${bodyHtml}
${settings.footer ? `<footer style="text-align:center;color:#666">${escapeHtml(settings.footer)}</footer>` : ''}
</body></html>`;
}
