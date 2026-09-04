# praneetb.github.io

Personal site for [Praneet Bachheti](https://praneetb.github.io), served by GitHub Pages as a Jekyll user site.

## Public and private

Logged-out visitors see a quiet calling card on `/` — name, role, a short bio, Half Dome, and links to [Resume](/resume/) and [GitHub](https://github.com/praneetb). There is no public navigation to Travel, Bar, Patents, Media, the bucket list, Notes, or Manya.

Sign in (username + password) unlocks a site-wide session. After a successful login, the header gains private navigation and `/space/` becomes the private landing:

- [Your space](/space/)
- [Travel](/travel/) — cockpit globe and visited countries in this browser; Seven Wonders live on the bucket list
- [Bar](/bar/) — private three-tab bar (Whiskey / Wine / Beer) with Premium / Core / Everyday shelves from `_data/whiskey.yml`, `_data/wine.yml`, and `_data/beer.yml`; search the active tab, hover lift, pour into the matching glass, tasting notes, and star ratings in this browser. `/whiskey/` redirects to `/bar/?tab=whiskey`
- [Patents](/patents/) — private plaque wall of issued patents and one abandoned application; Summit / Atlas / Cadence restyle the wall and metal
- [Media](/media/) — private door to the Jellyfin library (opens in a new tab)
- [Bucket list](/bucket-list/) — Polaroid wall split into Collected and Still ahead; each band groups Seven Wonders and Heights from `_data/bucket.yml` (read-only completion)
- [Notes](/notes/) — read-only vault reader (ciphertext only in the repo; no finance notes)
- [Manya](/manya/) — private family hub; [School](/manya/school/), [report cards](/manya/school/reports/) (age-cartoon cards; PDFs open in a page viewer from an encrypted pack keyed by Drive file ids in `_data/manya_reports.yml`), and [SAT / PSAT](/manya/school/sat-psat/) (titles and dates; same on-page viewer from `sat-psat.enc.json`; no scores listed)

Direct URLs to those private pages show a sign-in prompt when locked. Public visitors never see another browser’s local travel data.

Resume stays public.

## Auth

The gate is client-side for static GitHub Pages. `assets/js/site-admin.js` verifies a salted PBKDF2-SHA256 username digest and decrypts `assets/notes.enc.json` with PBKDF2-SHA256 / AES-GCM. The same password also decrypts `assets/manya/reports.enc.json` and `assets/manya/sat-psat.enc.json` (no `user` verifier on those envelopes). Notes stay in `sessionStorage` / `localStorage`; report PDFs are stored only in IndexedDB (keyed by Drive file id) and are cleared on sign-out. The repo stores ciphertext — not a username, password, plaintext notes, or raw PDFs. One successful login unlocks admin, private nav, Notes, and the report viewers.

Travel ships an empty visited-country list; visit flags stay in the browser. Bucket-list items carry a `category` (`wonders` or `heights`) and a `completed` flag in `_data/bucket.yml`. The page splits those into Collected / Still ahead bands and renders Done/Open seals as non-interactive marks — do not toggle them on the site. Do not commit a private travel list or a plaintext vault.

## Publishing notes

Do not commit Markdown from a personal vault. Export from Obsidian, then encrypt:

```bash
node scripts/encrypt-notes.mjs --list /path/to/vault
NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
```

That writes `assets/notes.enc.json`. The publisher skips finance paths (`20-Personal/Finance` and any folder named `Finance` / `finance`), `Private/`, `_staging/`, `.obsidian/`, `.trash/`, `prompts/` (agent-prompt packs) and `*.prompt.md`, `*.secret.md`, `*.base`, workspace/cache junk, and binary/canvas files. Site policy: no finance content on this site, even behind login. The first ship uses a small demo corpus in that encrypted pack; a real vault sync can come later.

## Publishing Manya report cards

Do not commit plaintext PDFs. Keep Drive as the source of truth, then encrypt a local folder of the same files. Ids must match `file_id` in `_data/manya_reports.yml`.

```bash
NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs /path/to/pdf-folder
NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs /path/to/pdf-folder --map map.json
node scripts/encrypt-manya-reports.mjs --list /path/to/pdf-folder --map map.json
```

`map.json` is `filename → Drive file id`, or `{ "reports": [ { "id", "filename", "title" } ] }`. A `map.json` / `manifest.json` in the folder is picked up automatically. That writes `assets/manya/reports.enc.json` (ciphertext only, no login `user` field).

For SAT / PSAT score reports, use the same publisher with `--kind sat-psat` and ids from `_data/manya_sat_psat.yml`. College Board filenames listed there are recognized without a map file.

```bash
NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs /path/to/sat-folder --kind sat-psat
node scripts/encrypt-manya-reports.mjs --list /path/to/sat-folder --kind sat-psat
```

That writes `assets/manya/sat-psat.enc.json`. Do not commit plaintext PDFs. A missing sat-psat pack is OK: the page still offers View report, and the viewer says the file is not in the pack yet.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```

Then open `http://127.0.0.1:4000`.

GitHub Pages builds from the default branch with the `github-pages` gem. No custom plugins.
