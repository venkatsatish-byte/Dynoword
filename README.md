# Dynoword

An independent, open-source word processor that runs in any modern browser and installs like a native app on
**Windows, macOS, iPhone, iPad and Android**. Works offline; documents are stored privately on the device.

## Features

**Home** – cut/copy/paste, format painter, 15 fonts, font sizes, grow/shrink, bold, italic, underline,
strikethrough, sub/superscript, text colour, highlight colour, change case, clear formatting, bullets,
numbering, checklists, multi-level indent/outdent, alignment (left/center/right/justify), line spacing,
style gallery (Normal, Title, Heading 1–3, Quote, Code), find & replace (match case, replace all).

**Insert** – page breaks, tables (grid picker), pictures (file, paste or drag-and-drop, resizable), horizontal
lines, links, comments, header, footer, page numbers, date & time, symbols, code blocks.

**Layout** – margins (normal / narrow / moderate / wide), portrait / landscape, Letter / Legal / A4 / A5,
1–3 columns.

**Review** – spelling check toggle, word count, read aloud, dictation (where the browser supports it),
comments pane with resolve.

**View** – print layout with page markers, web layout, focus mode, navigation pane (heading outline),
zoom (50–200 %, pinch-to-zoom on touch screens, fit page width), dark mode.

**Table tools** – insert/delete rows and columns, merge/split cells, header row, resizable columns.

**Files** – autosave, recent documents, templates (letter, resume, report, meeting notes).
Open **.docx**, .html, .md, .txt. Save a copy as **.docx** (with styles, lists, tables, images,
comments, header/footer and page numbers), **PDF** (print), .html, .md, .txt. Share via the
iOS/Android/Windows share sheet. When installed on Windows/ChromeOS, Dynoword can be the app that
opens .docx files.

Standard keyboard shortcuts (Ctrl on Windows/Linux, ⌘ on Mac/iPad): B/I/U, Z/Y, F/H, K, S, O, P,
L/E/R/J, Ctrl+Enter for page break, Ctrl+Alt+1–3 for headings, Ctrl+]/[ for font size.

## Install on a device

| Device | How |
| --- | --- |
| Windows / Mac (Edge or Chrome) | Open the site → click **Install** in the address bar |
| iPhone / iPad (Safari) | Share → **Add to Home Screen** |
| Android (Chrome) | ⋮ menu → **Install app** |

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run preview
```

Built with [Tiptap](https://tiptap.dev) (ProseMirror), [docx](https://docx.js.org) for Word export,
[mammoth](https://github.com/mwilliamson/mammoth.js) for Word import, and [Lucide](https://lucide.dev) icons.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes `dist/` to GitHub Pages.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

## Licence and notices

Dynoword is released under the [MIT licence](LICENSE). Its name, logo, colour scheme and interface are
original to this project.

Dynoword is an independent project. It is not affiliated with, endorsed by or sponsored by Microsoft,
Apple, Google or any other software vendor. It reads and writes the open, standardised Office Open XML
(.docx, ECMA-376 / ISO/IEC 29500) format for interoperability only. All trademarks belong to their owners.

Dynoword does not bundle any proprietary fonts. Font choices are generic families or common names that use
whatever matching font is already installed on the device.

### Third-party open-source components

| Package | Licence |
| --- | --- |
| [Tiptap](https://github.com/ueberdosis/tiptap) / [ProseMirror](https://prosemirror.net) | MIT |
| [docx](https://github.com/dolanmiu/docx) | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause |
| [Lucide icons](https://lucide.dev) | ISC |
| [Vite](https://vitejs.dev) (build only) | MIT |
