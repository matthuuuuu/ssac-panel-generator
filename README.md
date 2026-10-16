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
