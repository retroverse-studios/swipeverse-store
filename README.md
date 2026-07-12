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

## Go-live scope (decided 2026-07-11)

Design decisions for the wiring work — recorded so they aren't relitigated:

- **Ownership stays explicit.** The app's home screen shows only content the
  player has added (browser storage is the source of truth); the store is the
  browsing surface and "Add" is the deliberate crossing. No auto-merging of
  remote catalog metadata into the home screen. Discovery hook instead: a
  small "New from the store" shelf on the app menu (metadata teaser →
  tap-through to the store).
- **No offline ration needed.** Decks are ~15 KB of text against ~5 MB of
  browser storage — players can keep dozens to hundreds offline. "Light PWA"
  constrains the app bundle (3 default realities), not user additions.
  Deleting the default realities is already supported in the app (guarded so
  the last one can't be deleted; editor Reset All restores them).
- **Sections & tags.** Catalog entries gain a `category` (`game` |
  `education`) and optional tags; the store UI gets an **Education** section.
  Educational content is deliberately-distributed (instructors share
  `?play=` deep links; see the app README), not shipped with the app.
- **Art palette.** The 20 non-bundled themed art sets (from the swipeverse-art
  repo) are served from this site for community decks; the app's editor art
  picker gains a store-palette source, and the validator allowlists this host.
- **Creator Guide.** A player-facing page on this site: build in the app's
  editor → ⚖ Analyze (playability check) → Export → submit via PR here — plus
  the educator recipe (host the JSON, hand out a `?play=` link). Linked from
  the app's editor and About panel.

## Deferred — revisit post-launch (decided 2026-07-12)

Popularity signals and voting were assessed and deliberately skipped for
launch (a curated catalog of ~30 decks doesn't need ranking yet). When the
community grows, the designs on the table:

1. **"Most added" counting** — the store is static Pages and can't count,
   so this needs a tiny Cloudflare Worker (we're already on Cloudflare):
   the app pings `/add?deck=X` on library-add, Worker increments KV and
   serves an aggregated `popular.json` for a "most added this week" shelf.
   No accounts, no PII, ~50 lines. Vote-stuffing possible, stakes near zero.
   Build this one first — it's invisible UX with honest data.
2. **Voting** — GitHub 👍 reactions on one discussion/issue per deck,
   counts fetched via the public API. Reactions-only = **no free text**, so
   no NSFW/abuse moderation burden (the reason free-text feedback is
   permanently out of scope). Costs voters a GitHub login; only worth it
   once volume exists.

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
