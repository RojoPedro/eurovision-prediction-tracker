# Eurovision Prediction Tracker

Single-page app to track friends' Eurovision ranking predictions and run a live, bottom-up point reveal at the finale.

**Shared state** lives in **Netlify Blobs** (KV-style store) behind a Netlify Function — so every save is a single KV write, never a Git commit, never a redeploy.

## Stack

- Vanilla HTML / CSS / JavaScript (Tailwind via CDN, SortableJS via CDN for drag-and-drop)
- One Netlify Function (`netlify/functions/state.js`) that proxies `/api/state` to a Netlify Blobs store
- Optimistic-concurrency writes via ETag (`onlyIfMatch`) — safe for multiple admins editing at the same time

## Scoring

Points are awarded **per revealed position**, based on how close each player's guess was.

- **Max per reveal** scales linearly with the *actual* rank: 15 pts at #1 → 5 pts at #25.
- **Quadratic falloff with distance**: `points = max × (1 − distance/5)²`, 0 beyond 5 off.
  - d=0 → 100% · d=1 → 64% · d=2 → 36% · d=3 → 16% · d=4 → 4% · d≥5 → 0%
- Country not picked at all by the player → 0 pts.

Example: Italia rivelata al #3 (max 15). Guess #3 → 15. Guess #5 → 5. Guess #8 → 0.

## Tabs

1. **Input Predictions** — add/edit players, 25 ranked dropdowns (no duplicates), drag-handle `⋮⋮` per row for touch + mouse reorder, 🎲 Randomize remaining, empty-slot highlight.
2. **Overview** — hidden by default behind a Show/Hide toggle to avoid spoilers; reveals a side-by-side table.
3. **Finale Reveal** — admin actual-results panel + bottom-up "Reveal #N ▼" button. Revealed rows stack top-down, most recent on top. Each row lists every player's guess and points earned. Auto-polls every 4 s.

## Deploy (Netlify)

1. Push to GitHub.
2. On Netlify dashboard: **Add new site → Import an existing project → GitHub → eurovision-prediction-tracker**.
3. Netlify auto-detects `netlify.toml` — just click Deploy. No env vars required.

Netlify Blobs is zero-config in functions — auth is auto-injected at runtime.

## Local dev

```bash
npm install
npx netlify dev
# → http://localhost:8888
```

`netlify dev` boots the static site, the function at `/api/state`, and a local Blobs sandbox automatically.

## Backup

**Export JSON** in the header downloads the current shared state. **Import JSON** uploads a backup back to the Blob (replaces everything — confirm prompt).
