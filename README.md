# Eurovision Prediction Tracker

Single-page app to track friends' Eurovision ranking predictions and run a live, bottom-up point reveal at the finale.

**Shared state on GitHub**: every save is committed to `data.json` in this repo via a tiny Vercel serverless function — so everyone with the URL sees the same predictions, live.

## Stack

- Vanilla HTML / CSS / JavaScript (Tailwind via CDN)
- One Vercel serverless function (`api/state.js`) that reads/writes `data.json` through the GitHub API
- No database, no `localStorage` — GitHub is the source of truth

## Scoring

You only get points for **exact-position** matches.

```
points = (TotalParticipants + 1) − position
```

With 25 participants: 1st = 25 pts, 14th = 12 pts, 25th = 1 pt.

## Tabs

1. **Input Predictions** — add players, fill 25 ranked dropdowns (no duplicates), with a 🎲 **Randomize remaining** button to auto-fill empty slots.
2. **Overview** — side-by-side table of every player's bets.
3. **Finale Reveal** — admin panel for the official ranking, then click **Reveal next** to walk from #25 up to #1. Includes a 🎬 **Load demo results** button that seeds fake Sanremo-style data (Italy at #1, rest shuffled) so you can test the reveal end-to-end. Auto-polls every 4 s so viewers see updates live.

## Deploy

Static site + serverless API on Vercel. **One env var required**:

| name | value |
|---|---|
| `GITHUB_TOKEN` | a fine-grained PAT with `Contents: Read and write` on this repo |

Optional overrides: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_DATA_PATH`.

```bash
vercel env add GITHUB_TOKEN production
vercel --prod
```

## Run locally

```bash
vercel dev
```

`vercel dev` will load the same env vars and run `api/state.js` on `http://localhost:3000/api/state`. Opening `index.html` directly via `file://` won't work because the API calls need a server.

## Backup

Use **Export JSON** in the header to download the current shared state. **Import JSON** uploads a backup back to GitHub (replaces everything — confirm prompt).
