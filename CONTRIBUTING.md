# Contributing to the SwipeVerse Store

Submissions are pull requests against the catalog files. Every PR runs
automated validation; a maintainer reviews content before merging. Merged
content is live in the store.

## What you can submit

- **A deck** (`catalog/decks.json`) — a fixed story of swipe cards. Plays with
  no AI key, so this is the most valuable content for new players.
- **A reality** (`catalog/realities.json`) — a theme with stat names, colors,
  and an AI `systemInstruction` used to generate decks on the player's own
  AI account.

Author decks in the SwipeVerse editor (visual graph editor or AI Story
Director), playtest them, then use the editor's per-deck **Export** button and
paste the JSON into `catalog/decks.json`.

## Format

Shapes match the app's `types.ts`:

```jsonc
// Deck
{
  "name": "The Android's Gambit",
  "description": "One-sentence synopsis shown in the store.",
  "cards": [
    {
      "prompt": "The scenario text the player reads.",
      "leftChoice":  { "text": "Brief choice", "effects": { "Power": -5, "Wealth": 0, "People": 10, "Knowledge": 0 }, "nextCardIndex": 4 },
      "rightChoice": { "text": "Brief choice", "effects": { "Power": 5, "Wealth": -10, "People": 0, "Knowledge": 5 } }
    }
  ]
}
```

## Content policy

Automated checks (CI will reject):

- Stat effects must be integers within ±50 (aim for ±35; the game clamps).
- `nextCardIndex` jumps must land inside the deck.
- **No external URLs** in decks (`imageUrl`, `soundUrl`) — cards use each
  reality's image set. Reality `imageSet` URLs must be from allowlisted hosts
  (currently `images.unsplash.com`).
- Size limits: decks ≤ 50 cards, prompts ≤ 500 chars, catalog entries ≤ 100 KB.

Human review (maintainer judgment, no appeals process — this is a curated
store):

- No hate speech, harassment, sexual content involving minors, or content
  designed to demean real people or groups.
- `systemInstruction` fields get extra scrutiny: they run against *players'*
  AI accounts, so instructions that try to elicit policy-violating output
  from the player's model are rejected.
- Dark themes, moral dilemmas, and villain protagonists are fine — that's
  half the fun of the genre. The bar is "would a maintainer be comfortable
  shipping this to a stranger's phone."

## License

By submitting, you agree your content is published under the repository's
MIT license.
