# Eurovision Prediction Tracker

Single-page app to track friends' Eurovision ranking predictions and run a live, bottom-up point reveal at the finale.

**Shared state on GitHub**: every save is committed to `data.json` in this repo via a tiny Vercel serverless function — so everyone with the URL sees the same predictions, live.

## Stack

- Vanilla HTML / CSS / JavaScript (Tailwind via CDN)
- One Vercel serverless function (`api/state.js`) that reads/writes `data.json` through the GitHub API
- No database, no `localStorage` — GitHub is the source of truth

## Scoring

Points are awarded **per revealed position**, based on how close each player's guess was to the actual position of that country.

- **Max points per reveal** scale linearly with the *actual* rank: from **15 pts** at position #1 (most important) down to **5 pts** at position #25.
- **Quadratic falloff with distance**: `points = max × (1 − distance/5)²`, clipped to 0 beyond 5 positions off.
  - distance 0 → 100% of max (exact match)
  - distance 1 → 64%
  - distance 2 → 36%
  - distance 3 → 16%
  - distance 4 → 4%
  - distance 5+ → 0
- If a player never put that country in any of their 25 slots, they get 0.

**Example**: Italia turns out to be #3 (max 15 pts). A player who guessed it at #3 gets 15. At #5 (2 off) → 5 pts. At #8 (5 off) → 0 pts. Didn't pick → 0 pts.

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
