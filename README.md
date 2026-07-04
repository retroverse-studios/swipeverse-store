# SwipeVerse Store

The community content catalog for [SwipeVerse](https://github.com/retroverse-studios/swipeverse)
— a static, PR-curated store with no backend.

**A RetroVerse Studios project.**

## How it works

The catalog is plain JSON served as static files (GitHub Pages). The SwipeVerse
app fetches it at runtime; players' additions are copied into their local
collection and play offline from then on.

```
catalog/realities.json   Reality[]  — themes with AI instructions (need a player AI key)
catalog/decks.json       Deck[]     — fixed stories, playable with no AI key
```

The file shapes match the app's `types.ts` (`Reality`, `Deck`). The app's
`services/apiService.ts` points here once hosting is live.

## Hosting

Intended home: **`store.swipeverse.app`** (CNAME to GitHub Pages on this repo).
The catalog deploys independently of the app — content updates never require an
app release. Until DNS is set up, the raw GitHub Pages URL works identically.

- App: `https://swipeverse.app` (the game, PWA)
- Catalog: `https://store.swipeverse.app/catalog/decks.json` etc.

## Submitting content

Open a PR adding your reality or deck to the catalog files — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the content policy and format. CI
validates every PR (`scripts/validate.mjs`); a maintainer reviews and merges.
Merged = published.

## Validation

```bash
node scripts/validate.mjs
```

Checks structure (card shape, stat effects within ±50, branch jumps in range)
and content policy (no external URLs except allowlisted image hosts, size
limits). The same checks run in CI on every PR.
