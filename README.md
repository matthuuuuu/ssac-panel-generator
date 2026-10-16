# SSAC Panel Generator

Browse every MIT Sloan Sports Analytics Conference session since 2007 and generate new panel ideas, built by
Matthew Uchno. Static site: `index.html`, `assets/`, and `data/`. No build step.

- `data/panels.js` and `data/taxonomy.js` come from github.com/dkushnir99/ssac-dashboard (Drew Kushnir's
  scrapers of the public SSAC agenda). Copy them over when that repo refreshes its data.
- `data/trends.js` and `data/ideas.js` are rewritten every morning by `.github/workflows/daily-trends.yml`:
  `scripts/fetch-trends.mjs` reads ESPN and Google News RSS, then `scripts/write-ideas.mjs` drafts
  news-based ideas with Claude through MIT Parley (needs the `PARLEY_API_KEY` repo secret).
- Hosted on Vercel; linked from matthewuchno.com/ssac.

Run locally: `npx serve .` or `python -m http.server`, then open the printed address.

## Where this differs from Drew's repo

Matthew built the site; Drew Kushnir wrote the scrapers and the data. To update it, copy those files again from that repo. Never
copy `data/attendance.csv` or a `panels.js` built with attendance figures: that data is private.
Changes made here that are not in Drew's repo (Oct 13, 2026), so re-apply them after a fresh copy: the tab
icon in `index.html`, no "student project / not an official SSAC site" disclaimers (header and footer,
removed at Matthew's request), the "This week in sports" section and news-weighted generator (`data/trends.js`,
written every morning by `scripts/fetch-trends.mjs` via `.github/workflows/daily-trends.yml` from ESPN and
Google News RSS; headlines and links only), news-written panel ideas (`data/ideas.js`, drafted each morning by
`scripts/write-ideas.mjs` with Claude via MIT Parley; needs the `PARLEY_API_KEY` GitHub repo secret; the site
adds lineups and archive facts itself), and the archive's year chart following the filters (`archiveMatches({ ignoreYear })`,
`updateYearChart()` in `assets/app.js`, and the year-chart rules (`.ytrack`, `.yghost`, `.ybar.on`) in
`assets/style.css`: fixed-height track so bar heights are exactly proportional, all bars ink, selected year red).
