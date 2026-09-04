# praneetb.github.io

Personal site for [Praneet Bachheti](https://praneetb.github.io), served by GitHub Pages as a Jekyll user site.

## Public and private

Logged-out visitors see a quiet calling card on `/` — name, role, a short bio, Half Dome, and links to [Resume](/resume/) and [GitHub](https://github.com/praneetb). There is no public navigation to Travel, Song, the bucket list, or Rose.

Sign in (username + password) unlocks a site-wide session. After a successful login, the header gains private navigation and `/space/` becomes the private landing:

- [Your space](/space/)
- [Travel](/travel/) — interactive 3D globe; visited places stay in this browser
- [Song](/song/) — today’s pick; favorites stay in this browser
- [Bucket list](/bucket-list/) — things to do (`_data/bucket.yml`)
- [Rose](/rose/) — private hours ledger (ciphertext only in the repo). This is the only finance surface on the site.
- [Notes](/notes/) — read-only vault reader (ciphertext only in the repo; no finance notes)

Direct URLs to those private pages show a sign-in prompt when locked. Public visitors never see another browser’s local travel or song data.

Resume stays public.

## Auth

The gate is client-side for static GitHub Pages. `assets/js/site-admin.js` verifies a salted PBKDF2-SHA256 username digest and decrypts `assets/rose.enc.json` and `assets/notes.enc.json` with PBKDF2-SHA256 / AES-GCM. The repo stores only the salted verifier and ciphertext — not a username, password, or plaintext notes. One successful login unlocks admin, private nav, Rose, and Notes. Session state lives in `sessionStorage`, or `localStorage` if “Stay signed in on this device” is checked. Sign out clears both.

Travel and the bucket list ship empty. Do not invent countries or items, and do not commit a private travel list, song favorites, or a plaintext vault.

## Publishing notes

Do not commit Markdown from a personal vault. Export from Obsidian, then encrypt:

```bash
node scripts/encrypt-notes.mjs --list /path/to/vault
NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
```

That writes `assets/notes.enc.json`. The publisher skips finance paths (`20-Personal/Finance` and any folder named `Finance` / `finance`), `Private/`, `_staging/`, `.obsidian/`, `.trash/`, `prompts/` (agent-prompt packs) and `*.prompt.md`, `*.secret.md`, `*.base`, workspace/cache junk, and binary/canvas files. Site policy: no finance content on this site even behind login, except the existing Rose ledger. The first ship uses a small demo corpus in that encrypted pack; a real vault sync can come later.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```

Then open `http://127.0.0.1:4000`.

GitHub Pages builds from the default branch with the `github-pages` gem. No custom plugins.
