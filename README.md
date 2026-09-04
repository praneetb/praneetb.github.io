# praneetb.github.io

Personal site for [Praneet Bachheti](https://praneetb.github.io), served by GitHub Pages as a Jekyll user site.

## Public and private

Logged-out visitors see a quiet calling card on `/` — name, role, a short bio, Half Dome, and links to [Resume](/resume/) and [GitHub](https://github.com/praneetb). There is no public navigation to Travel, Media, the bucket list, or Notes.

Sign in (username + password) unlocks a site-wide session. After a successful login, the header gains private navigation and `/space/` becomes the private landing:

- [Your space](/space/)
- [Travel](/travel/) — interactive 3D globe; visited places stay in this browser
- [Media](/media/) — private door to the Jellyfin library (opens in a new tab)
- [Bucket list](/bucket-list/) — New7Wonders plus Half Dome; checks are read-only and come from `_data/bucket.yml`
- [Notes](/notes/) — read-only vault reader (ciphertext only in the repo; no finance notes)

Direct URLs to those private pages show a sign-in prompt when locked. Public visitors never see another browser’s local travel data.

Resume stays public.

## Auth

The gate is client-side for static GitHub Pages. `assets/js/site-admin.js` verifies a salted PBKDF2-SHA256 username digest and decrypts `assets/notes.enc.json` with PBKDF2-SHA256 / AES-GCM. The repo stores only the salted verifier and ciphertext — not a username, password, or plaintext notes. One successful login unlocks admin, private nav, and Notes. Session state lives in `sessionStorage`, or `localStorage` if “Stay signed in on this device” is checked. Sign out clears both.

Travel ships an empty visited-country list; visit flags stay in the browser. Bucket-list completion is committed in `_data/bucket.yml` and rendered as a non-interactive mark — do not toggle it on the site. Do not commit a private travel list or a plaintext vault.

## Publishing notes

Do not commit Markdown from a personal vault. Export from Obsidian, then encrypt:

```bash
node scripts/encrypt-notes.mjs --list /path/to/vault
NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
```

That writes `assets/notes.enc.json`. The publisher skips finance paths (`20-Personal/Finance` and any folder named `Finance` / `finance`), `Private/`, `_staging/`, `.obsidian/`, `.trash/`, `prompts/` (agent-prompt packs) and `*.prompt.md`, `*.secret.md`, `*.base`, workspace/cache junk, and binary/canvas files. Site policy: no finance content on this site, even behind login. The first ship uses a small demo corpus in that encrypted pack; a real vault sync can come later.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```

Then open `http://127.0.0.1:4000`.

GitHub Pages builds from the default branch with the `github-pages` gem. No custom plugins.
