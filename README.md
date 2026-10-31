# Dynoword

An independent, open-source word processor that runs in any modern browser and installs like a native app on
**Windows, macOS, iPhone, iPad and Android**. Works offline; documents are stored privately on the device.

**Use it now: https://dynoword.netlify.app/**

## Features

**Home** – cut/copy/paste, format painter, 15 fonts, font sizes, grow/shrink, bold, italic, underline,
strikethrough, sub/superscript, text colour, highlight colour, change case, clear formatting, bullets,
numbering, checklists, multi-level indent/outdent, alignment (left/center/right/justify), line spacing,
style gallery (Normal, Title, Heading 1–3, Quote, Code), find & replace (match case, replace all).

**Insert** – page breaks, tables (grid picker), pictures (file, paste or drag-and-drop, resizable), horizontal
lines, links, comments, header, footer, page numbers, date & time, symbols, code blocks.

**Layout** – margins (normal / narrow / moderate / wide), portrait / landscape, Letter / Legal / A4 / A5,
1–3 columns, page colour, left/right indent and spacing before/after spinners, and a Paragraph dialog
(alignment, indents, first-line or hanging indent, spacing, line spacing, tab stops).

**Ruler** – drag the first-line, hanging, left and right indent markers; click to add left, center or
right tab stops, drag them to move, or drag them off the ruler to remove. Tab characters line up to
custom stops or the default ½-inch stops. Shows inches or centimetres depending on your region.

**Paragraph borders & shading** – bottom, top, top-and-bottom, left bar or box borders, and background
shading colours.

**Review** – spelling check toggle, word count, read aloud, dictation (where the browser supports it),
comments pane with resolve.

**View** – print layout with page markers, web layout, focus mode, navigation pane (heading outline),
zoom (50–200 %, pinch-to-zoom on touch screens, fit page width), dark mode.

**Résumés & ATS** – an ATS résumé template and an **ATS check** pane (Review tab) that scores how
easily applicant tracking systems can read your résumé and flags contact details hidden in headers,
multi-column layouts, tables, images, unstyled section titles, missing standard sections, missing
dates, uncommon fonts, tiny text, emoji and length, with one-click fixes for most. Paste a job
description to see which of its keywords you already use and which are missing. **Download
ATS-ready .docx** saves a clean single-column copy without tables, images or comments, leaving your
document unchanged.

**Table tools** – insert/delete rows and columns, merge/split cells, header row, resizable columns.

**Files** – autosave, recent documents, and a template gallery with live previews: letter, report,
meeting notes, and ten résumé templates (Classic, ATS standard, Modern, Student / entry-level, Software
engineer, Career change, Executive, Academic CV, Designer / creative, Cover letter) — all single-column
layouts that pass the ATS check.
Open **.docx**, .html, .md, .txt. Save a copy as **.docx** (with styles, lists, tables, images,
comments, header/footer and page numbers), **PDF** (print), .html, .md, .txt. Share via the
iOS/Android/Windows share sheet. When installed on Windows/ChromeOS, Dynoword can be the app that
opens .docx files.

Standard keyboard shortcuts (Ctrl on Windows/Linux, ⌘ on Mac/iPad): B/I/U, Z/Y, F/H, K, S, O, P,
L/E/R/J, Ctrl+Enter for page break, Ctrl+Alt+1–3 for headings, Ctrl+]/[ for font size.

## Install on a device

Open **https://dynoword.netlify.app/**, then:

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

The site is hosted on [Netlify](https://www.netlify.com) at https://dynoword.netlify.app/, configured by `netlify.toml`
(build command `npm run build`, publish directory `dist`). Every push to `main` redeploys
automatically, and installed copies of the app update the next time they open online.

To set it up: sign in to Netlify with GitHub → **Add new site → Import an existing project** →
pick this repository. The build settings are read from `netlify.toml`, so just click **Deploy**.

## Free trial and subscription ($5/month)

Dynoword can require sign-in, give a **7-day free trial**, and then charge **$5/month** through Stripe.
After the trial, documents become **read-only** until the person subscribes: they can still open, read,
print, export and share everything, so nobody loses their work.

- Sign-in uses one-time **email links** (Firebase Authentication) — no passwords.
- The trial starts at first sign-in and is recorded on the server (Netlify Blobs), so it follows the
  person across devices and can't be reset by clearing the browser.
- Payment, card updates and cancellation use **Stripe Checkout** and the **Stripe customer portal**.
- Three Netlify Functions in `netlify/functions` check the sign-in token and ask Stripe for the plan:
  `GET /api/account`, `POST /api/checkout`, `POST /api/portal`.
- Subscribers can keep editing offline using their last known plan.

**Billing is off until it is configured** — without the settings below the app stays free for everyone.

### Setting it up

1. **Firebase** (free) — at [console.firebase.google.com](https://console.firebase.google.com):
   1. Create a project.
   2. *Build → Authentication → Get started → Sign-in method → Email/Password*: turn on **Email/Password**
      and **Email link (passwordless sign-in)**.
   3. *Authentication → Settings → Authorized domains*: add `dynoword.netlify.app` (and any custom domain).
   4. *Project settings → General → Your apps → Web app (</>)*: register an app and note its `apiKey`,
      `authDomain`, `projectId` and `appId`.
2. **Stripe** — at [dashboard.stripe.com](https://dashboard.stripe.com) (start in **Test mode**):
   1. *Product catalog → Add product*: “Dynoword”, **recurring, $5.00 USD, monthly**. Copy the **price ID** (`price_…`).
   2. *Developers → API keys*: copy the **secret key** (`sk_test_…`, later `sk_live_…`).
   3. *Settings → Billing → Customer portal*: activate it and allow cancelling and updating payment methods.
3. **Netlify** — *Site configuration → Environment variables*, add (see `.env.example`):

   | Variable | Value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | Firebase `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | Firebase `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | Firebase `projectId` |
   | `VITE_FIREBASE_APP_ID` | Firebase `appId` |
   | `STRIPE_SECRET_KEY` | Stripe secret key (keep private) |
   | `STRIPE_PRICE_ID` | the $5/month price ID |

   Then *Deploys → Trigger deploy*. Netlify Blobs needs no setup.
4. Test with Stripe's test card `4242 4242 4242 4242` (any future date and CVC). When it works, switch
   Stripe to live mode and replace the two Stripe variables with the live values.

Before taking real payments, Stripe asks for business details and a website with terms of service, a
privacy policy and a refund/cancellation policy. Draft pages are included at `/terms`, `/privacy` and
`/refunds` (files in `public/legal/`):

1. Replace every highlighted placeholder — your name or business name, postal address, contact email,
   site address and governing law — and review the wording. They are drafts, not legal advice.
2. In Stripe, open *Settings → Business → Public details* and enter
   `https://dynoword.netlify.app/terms`, `/privacy` and `/refunds`.
   Optionally, under *Settings → Checkout*, require customers to accept your terms.

You are responsible for any sales tax or VAT (Stripe Tax can calculate it).

Run the server-logic tests with `npm test`.

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
