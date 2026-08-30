# praneetb.github.io

Personal site for [Praneet Bachheti](https://praneetb.github.io), served by GitHub Pages as a Jekyll user site.

## Pages

- Home — travel-magazine cover (Half Dome) and editorial spreads
- [Resume](/resume/) — experience, skills, education, patents
- [Travel](/travel/) — interactive 3D globe and the New7Wonders catalog (`_data/travel.yml` stays empty)
- [Bucket list](/bucket-list/) — things to do (`_data/bucket.yml`)
- [Song](/song/) — today’s pick (`_data/today_song.yml`); favorites stay in this browser

Travel and the bucket list ship empty. Do not invent countries or items, and do not commit a private travel list or song favorites.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```

Then open `http://127.0.0.1:4000`.

GitHub Pages builds from the default branch with the `github-pages` gem. No custom plugins.
