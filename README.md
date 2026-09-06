# praneetb.github.io

Personal site for [Praneet Bachheti](https://praneetb.github.io), served by GitHub Pages as a Jekyll user site.

## Public and private

Logged-out visitors see the public home on `/` — a cream-paper scrapbook spread (handwritten greeting, overlapping Polaroids, pictured peeks, torn notes) with vault-backed peeks for Travel, Cocktails, Fermentation, Patents, Bucket, Bar, and Violin. There is no Half Dome hero banner and no people photos. Tile peeks stay vault-backed via `_data/home.yml` (`scripts/bake-home.mjs`). Travel uses a credited Venice sunset still; the one violin Polaroid is an instrument-only painting (fiddle + bow, no person) with the practice-room / vault-log line on the caption. Cocktails, Bar, Patents, and Bucket carry credited stills (no faces). Media, Notes, and Manya are not shown on the public home, even as locked tiles.

Public panel links — Travel, Bar, Cocktails, Fermentation, Patents, Bucket, Violin — stay in the header for everyone, signed out or signed in. Media, Notes, Manya, and Space are gated extras that appear only after login; they never replace the public panels.

These pages are public and read-only for guests (Sign in stays in the header):

- [Travel](/travel/) — cockpit globe and visited countries from `_data/travel.yml` (baked from vault `20-Personal/Travel/Countries Visited.md`); Seven Wonders live on the bucket list
- [Bar](/bar/) — four-tab bar (Whiskey / Wine / Beer / Tequila) with Premium / Core / Everyday shelves from `_data/whiskey.yml`, `_data/wine.yml`, `_data/beer.yml`, and `_data/tequila.yml`; search, hover lift, pour, and tasting notes. Star ratings stay signed-in only. `/whiskey/` redirects to `/bar/?tab=whiskey`
- [Cocktails](/cocktails/) — vault recipes from `_data/cocktails.yml` (`30-Knowledge/Recipes/`); search and Stirred / Shaken / Built filters; short-pour video when present; visitor notes stay in localStorage
- [Fermentation](/fermentation/) — vault set from `_data/fermentation.yml` (kombucha, salgam, sourdough starter, sourdough bread); search and All / Drinks / Bread / Logs; short video when present
- [Patents](/patents/) — spicy Problem → punch → why it stuck cards from `_data/plaques.yml`, baked from vault `10-Work/Reference/Patents.md` (five Cisco grants and one abandoned Aruba/HPE application). Formal titles stay in the fine print. Summit / Atlas / Cadence restyle the lab-notebook page.
- [Bucket list](/bucket-list/) — Polaroid wall split into Collected and Still ahead; each band groups Seven Wonders and Heights from `_data/bucket.yml` (read-only completion)
- [Violin](/violin/) — public foyer and piece detail from `_data/violin.yml`, baked from the daily sync path `30-Knowledge/Interests/Violin/` (`Violin MOC.md`, `Pieces`, `Practice-Log`, `Recordings`, `Teacher-Notes`). Pieces, logs, recordings, and teacher notes stay empty while that tree is stubs only. The public home links one Polaroid here (practice room / vault log lives on the caption); it does not invent practice counts.

Sign in (username + password) unlocks a site-wide session. After a successful login from `/`, the browser goes to `/space/`. The wordmark then points at `/space/`; the public home can still be opened directly. Signed-in chrome keeps those public panels and adds private navigation:

- [Your space](/space/) — hub for the public rooms plus Media, Violin, Notes, and Manya
- [Media](/media/) — private door to the Jellyfin library (opens in a new tab)
- [Violin practice](/violin/practice/) — gated practice room and recording detail; Media stays, Violin is a sibling tile
- [Notes](/notes/) — read-only vault reader (ciphertext only in the repo; no finance notes)
- [Manya](/manya/) — private family hub; [School](/manya/school/), [report cards](/manya/school/reports/) (age-cartoon cards; PDFs open in a page viewer from an encrypted pack keyed by Drive file ids in `_data/manya_reports.yml`), and [SAT / PSAT](/manya/school/sat-psat/) (titles and dates; same on-page viewer from `sat-psat.enc.json`; no scores listed)

Direct URLs to Media, Notes, Manya, and Space show a sign-in prompt when locked. The visited-country list is site data, not a per-browser stash.

Resume stays public.

## Visitor diary

The guestbook on `/` is a slim footer band. It stays moderated. The public list is only `_data/guestbook.yml` (`id`, `name`, `message`, `date`). Incoming notes never appear until someone merges an entry there. The footer also shows live counts from travel, bar, cocktails, fermentation, patents, and the bucket list.

The form POSTs to `guestbook_form_endpoint` in `_config.yml` (Formspree URL, or Web3Forms with `guestbook_form_access_key`). If that value is empty, the diary UI still renders and shows **Diary intake not configured**.

Moderation path:

1. A visitor submits name + message (honeypot field is ignored).
2. Formspree / Web3Forms emails Praneet.
3. Praneet asks Thekedaar, or merges an entry into `_data/guestbook.yml` and publishes.

Signed-in, `/space/` and the home diary show an admin strip: approve via the Formspree inbox / ask Thekedaar to publish. Local draft approvals are not enough — `guestbook.yml` is the source of truth.

Set this when the Formspree form exists:

```yaml
guestbook_form_endpoint: https://formspree.io/f/xxxxxxxx
```

## Auth

The gate is client-side for static GitHub Pages. `assets/js/site-admin.js` verifies a salted PBKDF2-SHA256 username digest and decrypts `assets/notes.enc.json` with PBKDF2-SHA256 / AES-GCM. The same password also decrypts `assets/manya/reports.enc.json` and `assets/manya/sat-psat.enc.json` (no `user` verifier on those envelopes). Notes stay in `sessionStorage` / `localStorage`; report PDFs are stored only in IndexedDB (keyed by Drive file id) and are cleared on sign-out. The repo stores ciphertext — not a username, password, plaintext notes, or raw PDFs. One successful login unlocks admin, private nav, Notes, and the report viewers.

Travel reads the visited set from `_data/travel.yml` — the same 18 names as the vault note, with ISO codes. Do not invent countries or restore an on-site add-country control. Bucket-list items carry a `category` (`wonders` or `heights`) and a `completed` flag in `_data/bucket.yml`. The page splits those into Collected / Still ahead bands and renders Done/Open seals as non-interactive marks — do not toggle them on the site. Do not commit a plaintext vault.

## Publishing notes

Do not commit Markdown from a personal vault. Export from Obsidian, then encrypt:

```bash
node scripts/encrypt-notes.mjs --list /path/to/vault
NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
```

That writes `assets/notes.enc.json`. The publisher skips finance paths (`20-Personal/Finance` and any folder named `Finance` / `finance`), `Private/`, `_staging/`, `.obsidian/`, `.trash/`, `prompts/` (agent-prompt packs) and `*.prompt.md`, `*.secret.md`, `*.base`, workspace/cache junk, and binary/canvas files. Site policy: no finance content on this site, even behind login. The first ship uses a small demo corpus in that encrypted pack; a real vault sync can come later.

Violin public/private room data is separate site YAML, not the encrypted notes pack:

```bash
node scripts/bake-violin.mjs /path/to/vault
```

That writes `_data/violin.yml` from `30-Knowledge/Interests/Violin/` (`Violin MOC.md` plus the four folders). Empty folders and stub notes bake to `[]`. Streak and weeks are derived only from Practice-Log dates. Do not invent repertoire or sessions. Do not change `assets/notes.enc.json` for this bake.

Home tile peeks are a separate bake. Vault notes win when present; otherwise the live site `_data` files are used. Do not invent countries, recipes, patents, or bucket items.

```bash
node scripts/bake-home.mjs /path/to/vault
node scripts/bake-home.mjs --from-site
```

That writes `_data/home.yml` from:

- `20-Personal/Travel/Countries Visited.md`
- `30-Knowledge/Recipes/` (named cocktail notes)
- `30-Knowledge/Recipes/Kombucha & Salgam.md`
- `10-Work/Reference/Patents.md`
- `20-Personal/Bucket List.md`

Missing vault notes fall back to `_data/travel.yml`, `cocktails.yml`, `fermentation.yml`, `plaques.yml`, and `bucket.yml`. Bar peek stays Whiskey · Wine · Beer · Tequila, now with a credited bottle-shelf still on the public home. Do not change `assets/notes.enc.json` for this bake.

Patents page data is a separate bake from the same vault export. The list is locked: the same six live `/patents/` plaques (five Cisco issued + one abandoned Aruba/HPE). Do not add or invent patents.

```bash
node scripts/bake-patents.mjs /path/to/vault
node scripts/bake-patents.mjs --list /path/to/vault
node scripts/bake-patents.mjs --check
```

That reads `10-Work/Reference/Patents.md` only and writes `_data/plaques.yml`, `_data/patents.yml`, and `_data/issued.yml`. Formal titles, numbers, dates, assignees, and status come only from that note. Editorial problem / punch / stuck lines live in `scripts/bake-patents.mjs`, keyed by patent id, and are applied only when that id is already in the locked set. Bucket list is a different vault note (`20-Personal/Bucket List.md`) and is not a patents source. Do not change `assets/notes.enc.json` for this bake.

Daily sync path (same vault root as violin / home peeks):

```bash
node scripts/bake-violin.mjs /path/to/vault
node scripts/bake-home.mjs /path/to/vault
node scripts/bake-patents.mjs /path/to/vault
```

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
