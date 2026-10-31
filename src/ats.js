// Résumé checks for applicant tracking systems (ATS), job-description keyword matching,
// and the clean-up used for fixes and the ATS-ready download.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const YEAR = /\b(19|20)\d{2}\b/;
const SYMBOL_BULLET = /^\s*[•●▪■◆◇►▶➤➢✓✔★☆→»·*-]\s+/;
const EMOJI = /\p{Extended_Pictographic}/u;

const SAFE_FONTS = ['arial', 'helvetica', 'verdana', 'georgia', 'times new roman', 'garamond', 'trebuchet ms', 'palatino',
  'tahoma', 'calibri', 'cambria', 'book antiqua', 'courier new', 'sans-serif', 'serif', 'liberation sans', 'liberation serif'];

export const SECTIONS = {
  summary: ['summary', 'professional summary', 'profile', 'professional profile', 'objective', 'career objective', 'about me', 'career summary'],
  experience: ['experience', 'work experience', 'professional experience', 'employment history', 'employment', 'work history',
    'relevant experience', 'career history', 'professional history'],
  education: ['education', 'academic background', 'education and training', 'academic qualifications', 'qualifications'],
  skills: ['skills', 'technical skills', 'core competencies', 'key skills', 'competencies', 'skills and abilities', 'areas of expertise'],
  other: ['certifications', 'certificates', 'licenses and certifications', 'projects', 'awards', 'honors', 'publications',
    'volunteer experience', 'volunteering', 'languages', 'interests', 'references', 'training', 'achievements', 'activities',
    'leadership', 'memberships', 'professional development', 'additional information'],
};
const REQUIRED = { experience: 'Work Experience', education: 'Education', skills: 'Skills' };

const norm = (t) => t.toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ & /g, ' and ');

export function sectionOf(text) {
  const n = norm(text);
  return Object.keys(SECTIONS).find((k) => SECTIONS[k].includes(n)) || null;
}

// A short, all-bold or all-caps paragraph that names a section but isn't styled as a heading.
function looksLikeHeading(node) {
  const text = node.textContent.trim();
  if (!text || text.length > 40 || text.split(/\s+/).length > 5) return false;
  let allBold = true;
  node.forEach((c) => { if (c.isText && !c.marks.some((m) => m.type.name === 'bold')) allBold = false; });
  const caps = /[A-Z]{3}/.test(text) && text === text.toUpperCase();
  return (allBold || caps) && !!sectionOf(text);
}

/**
 * Analyses the document. Returns { score, checks } where each check is
 * { level: 'pass' | 'info' | 'warn' | 'fail', title, detail, fix?, range? }.
 */
export function analyze(doc, settings, { pageCount = 1 } = {}) {
  const checks = [];
  const add = (level, title, detail, extra = {}) => checks.push({ level, title, detail, ...extra });
  const text = doc.textBetween(0, doc.content.size, '\n', ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const headerText = `${settings.header || ''}\n${settings.footer || ''}`;

  const found = {};
  const fakeHeadings = [];
  const odd = [];
  let tables = 0;
  let images = 0;
  let comments = 0;
  let symbolBullets = null;
  let emoji = null;
  let smallFont = null;
  const fonts = new Set();
  let firstBlock = null;

  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === 'table') { tables++; return false; }
    if (name === 'image') { images++; return false; }
    if (node.isTextblock) {
      const t = node.textContent.trim();
      if (t && !firstBlock) firstBlock = { node, pos };
      if (name === 'heading' && node.attrs.docStyle !== 'title') {
        const sec = sectionOf(t);
        if (sec) found[sec] = true;
        else if (node.attrs.level <= 2 && t && firstBlock?.pos !== pos) odd.push({ text: t, pos });
      } else if (name === 'paragraph' && looksLikeHeading(node)) {
        found[sectionOf(t)] = true;
        fakeHeadings.push(t);
      }
      if (!symbolBullets && name === 'paragraph' && SYMBOL_BULLET.test(t)) symbolBullets = { from: pos + 1, to: pos + node.nodeSize - 1 };
      if (!emoji && EMOJI.test(t)) emoji = { from: pos + 1, to: pos + node.nodeSize - 1 };
    }
    if (node.isText) {
      node.marks.forEach((m) => {
        if (m.type.name === 'comment') comments++;
        if (m.type.name === 'textStyle') {
          if (m.attrs.fontFamily) fonts.add(m.attrs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
          const size = parseFloat(m.attrs.fontSize);
          if (!smallFont && size && size < 10) smallFont = { from: pos, to: pos + node.nodeSize };
        }
      });
    }
    return true;
  });

  // Contact details
  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const contactInHeader = EMAIL.test(headerText) || PHONE.test(headerText);
  if (contactInHeader) {
    add('fail', 'Contact details are in the header or footer', 'Many ATS skip headers and footers, so your email or phone may be lost. Move them into the document body.', { fix: 'moveHeader' });
  } else if (headerText.trim()) {
    add('info', 'Text in the header or footer', 'Some ATS ignore headers and footers. Keep anything important in the body.', { fix: 'moveHeader' });
  }
  if (hasEmail) add('pass', 'Email address found', 'Recruiters and ATS can read your email address.');
  else if (!EMAIL.test(headerText)) add('fail', 'No email address', 'Add your email address near your name at the top.');
  if (hasPhone) add('pass', 'Phone number found', 'Your phone number is in the document body.');
  else if (!PHONE.test(headerText)) add('warn', 'No phone number', 'Add a phone number near your name at the top.');

  // Name at the top
  if (firstBlock) {
    const t = firstBlock.node.textContent.trim();
    if (t.split(/\s+/).length <= 5 && !EMAIL.test(t) && !sectionOf(t)) add('pass', 'Name at the top', `“${t}” is the first line.`);
    else add('warn', 'Start with your name', 'Put your full name alone on the first line, then your contact details.', { range: { from: firstBlock.pos + 1, to: firstBlock.pos + firstBlock.node.nodeSize - 1 } });
  }

  // Sections and headings
  Object.entries(REQUIRED).forEach(([key, label]) => {
    if (found[key]) add('pass', `${label} section`, 'Found a standard section heading.');
    else add('warn', `No “${label}” section`, `ATS look for standard section names. Add a heading such as “${label}”.`);
  });
  if (found.summary) add('pass', 'Summary section', 'A short summary helps recruiters and keyword matching.');
  if (fakeHeadings.length) {
    add('warn', `${fakeHeadings.length} section title${fakeHeadings.length > 1 ? 's' : ''} not styled as headings`,
      'Bold or capitalised text that names a section should use a heading style so ATS can split your résumé into sections.',
      { fix: 'headings', texts: fakeHeadings });
  }
  odd.slice(0, 3).forEach((h) => add('info', `Uncommon section name: “${h.text}”`,
    'ATS recognise standard names best, e.g. Summary, Work Experience, Education, Skills, Certifications, Projects.',
    { range: { from: h.pos + 1, to: h.pos + 1 + h.text.length } }));
  if (found.experience && !YEAR.test(text)) add('warn', 'No dates found', 'Add start and end dates (e.g. “Jan 2021 – Present”) to each job and qualification.');

  // Layout that ATS struggle with
  if (tables) add('warn', `${tables} table${tables > 1 ? 's' : ''}`, 'ATS often read tables out of order or skip them. Convert them to plain lines.', { fix: 'tables' });
  if ((settings.columns || 1) > 1) add('fail', `${settings.columns}-column layout`, 'Multi-column text is often read across columns and scrambled. Use one column.', { fix: 'columns' });
  if (images) add('warn', `${images} image${images > 1 ? 's' : ''}`, 'ATS can’t read text inside images, logos or photos, and some reject photos. Remove them.', { fix: 'images' });
  if (!tables && (settings.columns || 1) === 1 && !images) add('pass', 'Simple layout', 'Single column with no tables or images — easy for ATS to read.');

  // Typography
  const odds = [...fonts].filter((f) => !SAFE_FONTS.includes(f.toLowerCase()));
  if (odds.length) add('warn', `Uncommon font: ${odds.join(', ')}`, 'Stick to widely available fonts such as Arial, Georgia or Times New Roman.', { fix: 'fonts' });
  else add('pass', 'Standard fonts', 'All text uses widely available fonts.');
  if (smallFont) add('warn', 'Text smaller than 10 pt', 'Very small text can be misread. Use 10–12 pt for body text.', { range: smallFont, fix: 'smallFonts' });
  if (symbolBullets) add('info', 'Typed bullet symbols', 'Use the Bullets button instead of typing symbols like • or ➤ so ATS see a real list.', { range: symbolBullets });
  if (emoji) add('warn', 'Emoji or icons in text', 'ATS may turn icons into garbage characters. Replace them with words.', { range: emoji });

  // Clean-up
  if (comments) add('warn', 'Comments in the document', 'Remove review comments before sending.', { fix: 'comments' });
  if (settings.pageColor) add('info', 'Page colour', 'Coloured pages print poorly and some ATS previews show them oddly.', { fix: 'pageColor' });

  // Length
  if (words < 150) add('warn', `Short résumé (${words} words)`, 'Most effective résumés have 300–800 words. Add achievements with numbers.');
  else if (words > 1100 || pageCount > 2) add('warn', `Long résumé (${words} words, ${pageCount} pages)`, 'Keep it to one or two pages; focus on the last 10–15 years.');
  else add('pass', `Good length (${words} words)`, 'Between one and two pages.');

  const cost = { fail: 15, warn: 7, info: 2, pass: 0 };
  const score = Math.max(0, 100 - checks.reduce((n, c) => n + cost[c.level], 0));
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { score, checks };
}

// ---------- Keyword matching ----------

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each either etc few for from further had has have having he
her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our
ours out over own same she should so some such than that the their them then there these they this those through to too under
until up very was we were what when where which while who whom why will with within without would you your yours
able ability across activities hire hiring hired seeks additional advantage applicant applicants apply based benefits best candidate candidates company
day days degree desired duties eg environment equal etc excellent experience experienced familiarity first full great help ideal
include includes including job join knowledge least level like looking may must new nice one opportunity part per plus position
preferred proven provide related required requirement requirements responsibilities responsible role salary seeking several
skill skills strong success successful team teams time understanding us using well work working year years`.split(/\s+/));

const tokenize = (t) => (t.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]/g) || []).map((w) => w.replace(/\.$/, ''));
const stem = (w) => (w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);

/** Extracts the most significant keywords and two-word phrases from a job description. */
export function extractKeywords(jd, limit = 30) {
  const tokens = tokenize(jd);
  const counts = new Map();
  const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
  tokens.forEach((w, i) => {
    if (STOP.has(w) || /^\d+$/.test(w) || w.length < 2) return;
    bump(w);
    const next = tokens[i + 1];
    if (next && !STOP.has(next) && !/^\d+$/.test(next) && next.length > 1) bump(`${w} ${next}`);
  });
  const phrases = [...counts].filter(([k, n]) => k.includes(' ') && n >= 2);
  // Keep a single word only if it also appears outside the phrases already listed.
  const inPhrases = new Map();
  phrases.forEach(([k, n]) => k.split(' ').forEach((w) => inPhrases.set(w, (inPhrases.get(w) || 0) + n)));
  const singles = [...counts].filter(([k, n]) => !k.includes(' ') && n > (inPhrases.get(k) || 0));
  return [...phrases, ...singles]
    .sort((a, b) => b[1] - a[1] + (b[0].includes(' ') ? 0.5 : 0) - (a[0].includes(' ') ? 0.5 : 0))
    .slice(0, limit)
    .map(([k]) => k);
}

/** Compares résumé text with a job description. */
export function matchKeywords(resumeText, jd) {
  const keywords = extractKeywords(jd);
  const have = new Set(tokenize(resumeText).map(stem));
  const resumeNorm = ` ${tokenize(resumeText).map(stem).join(' ')} `;
  const matched = [];
  const missing = [];
  keywords.forEach((k) => {
    const parts = k.split(' ').map(stem);
    const ok = parts.length > 1 ? resumeNorm.includes(` ${parts.join(' ')} `) : have.has(parts[0]);
    (ok ? matched : missing).push(k);
  });
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  return { score, matched, missing };
}

// ---------- Clean-up transforms (JSON) ----------

const textNode = (text) => ({ type: 'text', text });

function inlineOf(block) {
  if (block.type === 'paragraph' || block.type === 'heading') return block.content || [];
  return (block.content || []).flatMap((c, i) => (i ? [textNode(' '), ...inlineOf(c)] : inlineOf(c)));
}

function tableToParagraphs(table) {
  return (table.content || []).map((row) => {
    const cells = (row.content || []).map((cell) => (cell.content || []).flatMap((b, i) => (i ? [textNode(' '), ...inlineOf(b)] : inlineOf(b))));
    const content = cells.filter((c) => c.length).flatMap((c, i) => (i ? [textNode(' | '), ...c] : c));
    return { type: 'paragraph', content: content.length ? content : undefined };
  });
}

function mapMarks(node, fn) {
  if (node.marks) {
    node.marks = node.marks.map(fn).filter(Boolean);
    if (!node.marks.length) delete node.marks;
  }
}

/**
 * Applies the named fixes to a copy of the document JSON.
 * fixes: Set of 'tables' | 'images' | 'headings' | 'fonts' | 'smallFonts' | 'comments' | 'formatting' | 'tasks'.
 * headingTexts: texts of paragraphs to turn into headings (for 'headings').
 */
export function cleanJson(json, fixes, { headingTexts = [] } = {}) {
  const walk = (node) => {
    if (!node.content) return node;
    node.content = node.content.flatMap((child) => {
      if (fixes.has('tables') && child.type === 'table') return tableToParagraphs(child);
      if (fixes.has('images') && child.type === 'image') return [];
      if (fixes.has('tasks') && child.type === 'taskList') {
        return [{ type: 'bulletList', content: (child.content || []).map((it) => ({ type: 'listItem', content: it.content })) }];
      }
      if (fixes.has('headings') && child.type === 'paragraph') {
        const t = (child.content || []).map((c) => c.text || '').join('').trim();
        if (headingTexts.includes(t)) {
          const content = child.content.map((c) => ({ ...c, marks: c.marks?.filter((m) => m.type !== 'bold') }));
          return [{ type: 'heading', attrs: { level: 2 }, content }];
        }
      }
      if (fixes.has('formatting') && child.attrs) {
        child.attrs = { ...child.attrs, shading: null, border: null };
      }
      mapMarks(child, (m) => {
        if (fixes.has('comments') && m.type === 'comment') return null;
        if (m.type === 'textStyle' && (fixes.has('fonts') || fixes.has('smallFonts'))) {
          const a = { ...m.attrs };
          if (fixes.has('fonts')) a.fontFamily = null;
          if (fixes.has('smallFonts') && parseFloat(a.fontSize) < 10) a.fontSize = '10pt';
          return Object.values(a).some((v) => v != null) ? { ...m, attrs: a } : null;
        }
        return m;
      });
      return [walk(child)];
    });
    return node;
  };
  return walk(structuredClone(json));
}

const isNameBlock = (block) => {
  const t = (block?.content || []).map((c) => c.text || '').join('').trim();
  return !!t && t.split(/\s+/).length <= 5 && !EMAIL.test(t) && !PHONE.test(t) && !sectionOf(t);
};

/** Inserts paragraphs right after the name line (or at the very top if there is none). */
export function insertAfterName(json, paragraphs) {
  if (!paragraphs.length) return json;
  json.content.splice(isNameBlock(json.content?.[0]) ? 1 : 0, 0, ...paragraphs);
  return json;
}

/** Paragraphs for header/footer text, to place at the top of the body. */
export function headerParagraphs(settings) {
  return [settings.header, settings.footer]
    .filter((t) => t && t.trim())
    .flatMap((t) => t.split('\n'))
    .filter((l) => l.trim())
    .map((l) => ({ type: 'paragraph', content: [textNode(l.trim())] }));
}

/** Builds the ATS-ready copy used for download: one column, no tables, images, comments or decoration. */
export function atsDocument(json, settings, headingTexts) {
  const clean = cleanJson(json, new Set(['tables', 'images', 'tasks', 'headings', 'fonts', 'smallFonts', 'comments', 'formatting']), { headingTexts });
  insertAfterName(clean, headerParagraphs(settings));
  return {
    json: clean,
    settings: { ...settings, columns: 1, header: '', footer: '', pageColor: null, pageNumbers: false },
  };
}
