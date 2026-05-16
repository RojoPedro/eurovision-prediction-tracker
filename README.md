# Eurovision Prediction Tracker

Single-page app to track friends' Eurovision ranking predictions and run a live, bottom-up point reveal at the finale.

No backend, no database — everything lives in `localStorage`, with JSON export/import for backups.

## Stack

- Vanilla HTML / CSS / JavaScript
- Tailwind CSS via CDN
- Persisted to the browser's `localStorage`

## Scoring

You only get points for **exact-position** matches.

```
points = (TotalParticipants + 1) − position
```

With 25 participants: 1st = 25 pts, 14th = 12 pts, 25th = 1 pt.

## Tabs

1. **Input Predictions** — add players, fill 25 ranked dropdowns. Once a country is picked, it's disabled in the other slots so duplicates are impossible.
2. **Overview** — side-by-side table of every player's bets (rows = positions, columns = players).
3. **Finale Reveal** — admin panel for the official ranking, then click **Reveal next** to walk from #25 up to #1. The live leaderboard updates with green "+X" pills when a player hits an exact match.

## Backup

Use **Export JSON** in the header to download your state, and **Import JSON** to restore it on another browser.

## Run locally

It's a static site — just open `index.html`, or serve it:

```bash
npx serve .
```

## Editing the country list

The default list is 25 placeholder countries. Open the "Edit the country list" section in tab 1 to customize them (must stay 25 unique entries). Predictions that reference removed countries are cleared automatically.

## Deploy

Static site, deployed on Vercel. No build step.
