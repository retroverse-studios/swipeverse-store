/**
 * Validates the store catalog against structure and content policy.
 * Runs in CI on every PR; run locally with: node scripts/validate.mjs
 * Exits non-zero on any violation.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAT_NAMES = ["Power", "Wealth", "People", "Knowledge"];
const ARCHETYPES = ["petitioner", "crisis", "opportunity", "faction", "advisor", "chain", "judgement", "gamble", "terminal"];
const CATEGORIES = ["game", "education"];

function checkCategory(entry, where) {
    if (entry.category === undefined) fail(`${where}: category is required ("game" or "education")`);
    else if (!CATEGORIES.includes(entry.category)) fail(`${where}: unknown category "${entry.category}"`);
}
const MAX_EFFECT = 50;
const MAX_CARDS = 50;
const MAX_PROMPT_CHARS = 500;
const MAX_ENTRY_BYTES = 100 * 1024;
const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com"];

const errors = [];
const fail = (msg) => errors.push(msg);

// The store's own art palette is the one allowed external host for deck media
const ALLOWED_MEDIA_PREFIXES = ["https://store.swipeverse.app/art/"];

function checkNoUrl(value, where) {
    if (typeof value !== "string") return;
    if (ALLOWED_MEDIA_PREFIXES.some(p => value.startsWith(p))) return;
    if (/^(https?:)?\/\//i.test(value)) {
        fail(`${where}: external URLs are not allowed in decks ("${value.slice(0, 60)}...") — use the store art palette (${ALLOWED_MEDIA_PREFIXES[0]}...)`);
    }
    // Embedded images bypass URL rules and can't be text-moderated — reject.
    if (/^(data|blob|javascript):/i.test(value.trim())) {
        fail(`${where}: data:/blob: URIs are not allowed — use bundled archetype art or the store asset palette`);
    }
}

function checkAllowlistedUrl(value, where) {
    try {
        const host = new URL(value).hostname;
        if (!ALLOWED_IMAGE_HOSTS.includes(host)) {
            fail(`${where}: host "${host}" is not on the image allowlist (${ALLOWED_IMAGE_HOSTS.join(", ")})`);
        }
    } catch {
        fail(`${where}: not a valid URL ("${String(value).slice(0, 60)}")`);
    }
}

function checkChoice(choice, deckSize, where) {
    if (!choice || typeof choice !== "object") return fail(`${where}: missing choice`);
    if (typeof choice.text !== "string" || choice.text.trim() === "") fail(`${where}: choice text is required`);
    for (const stat of STAT_NAMES) {
        const value = choice.effects?.[stat];
        if (value === undefined) continue;
        if (!Number.isInteger(value)) fail(`${where}: effect ${stat} must be an integer (got ${JSON.stringify(value)})`);
        else if (Math.abs(value) > MAX_EFFECT) fail(`${where}: effect ${stat} exceeds ±${MAX_EFFECT} (got ${value})`);
    }
    const unknownStats = Object.keys(choice.effects ?? {}).filter(k => !STAT_NAMES.includes(k));
    if (unknownStats.length > 0) fail(`${where}: unknown stat(s): ${unknownStats.join(", ")}`);
    if (choice.nextCardIndex !== undefined) {
        if (!Number.isInteger(choice.nextCardIndex) || choice.nextCardIndex < 0 || choice.nextCardIndex >= deckSize) {
            fail(`${where}: nextCardIndex ${choice.nextCardIndex} is outside 0-${deckSize - 1}`);
        }
    }
    checkNoUrl(choice.soundUrl, `${where}.soundUrl`);
}

function checkDeck(deck, where) {
    if (JSON.stringify(deck).length > MAX_ENTRY_BYTES) fail(`${where}: entry exceeds ${MAX_ENTRY_BYTES / 1024} KB`);
    if (typeof deck.name !== "string" || !deck.name.trim()) fail(`${where}: name is required`);
    if (typeof deck.description !== "string" || !deck.description.trim()) fail(`${where}: description is required`);
    if (deck.source !== undefined) fail(`${where}: remove the "source" field (reserved for the app)`);
    if (deck.series !== undefined) {
        if (typeof deck.series?.name !== "string" || !deck.series.name.trim()) fail(`${where}: series.name must be a non-empty string`);
        if (!Number.isInteger(deck.series?.part) || deck.series.part < 1) fail(`${where}: series.part must be an integer >= 1`);
    }
    if (!Array.isArray(deck.cards) || deck.cards.length === 0) return fail(`${where}: cards array is required`);
    if (deck.cards.length > MAX_CARDS) fail(`${where}: ${deck.cards.length} cards exceeds the ${MAX_CARDS}-card limit`);
    deck.cards.forEach((card, i) => {
        const cw = `${where}.cards[${i}]`;
        if (typeof card.prompt !== "string" || !card.prompt.trim()) fail(`${cw}: prompt is required`);
        else if (card.prompt.length > MAX_PROMPT_CHARS) fail(`${cw}: prompt exceeds ${MAX_PROMPT_CHARS} chars`);
        if (card.archetype !== undefined && !ARCHETYPES.includes(card.archetype)) {
            fail(`${cw}: unknown archetype "${card.archetype}" (allowed: ${ARCHETYPES.join(", ")})`);
        }
        checkNoUrl(card.imageUrl, `${cw}.imageUrl`);
        checkChoice(card.leftChoice, deck.cards.length, `${cw}.leftChoice`);
        checkChoice(card.rightChoice, deck.cards.length, `${cw}.rightChoice`);
    });
}

function checkReality(reality, where) {
    if (JSON.stringify(reality).length > MAX_ENTRY_BYTES) fail(`${where}: entry exceeds ${MAX_ENTRY_BYTES / 1024} KB`);
    if (typeof reality.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(reality.id)) fail(`${where}: id must be kebab-case`);
    for (const field of ["name", "description", "systemInstruction", "font"]) {
        if (typeof reality[field] !== "string" || !reality[field].trim()) fail(`${where}: ${field} is required`);
    }
    for (const record of ["statNames", "statIconNames"]) {
        for (const stat of STAT_NAMES) {
            if (typeof reality[record]?.[stat] !== "string") fail(`${where}: ${record}.${stat} is required`);
        }
    }
    for (const key of ["primary", "secondary", "background", "accent"]) {
        if (typeof reality.colors?.[key] !== "string") fail(`${where}: colors.${key} is required`);
    }
    (reality.imageSet ?? []).forEach((url, i) => checkAllowlistedUrl(url, `${where}.imageSet[${i}]`));
    if (reality.deck !== undefined) checkDeck(reality.deck, `${where}.deck`);
    checkNoUrl(reality.deckUrl, `${where}.deckUrl`);
}

function loadArray(file) {
    const data = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    if (!Array.isArray(data)) {
        fail(`${file}: top level must be an array`);
        return [];
    }
    return data;
}

const decks = loadArray("catalog/decks.json");
decks.forEach((deck, i) => {
    checkDeck(deck, `decks.json[${i}] "${deck?.name ?? "?"}"`);
    checkCategory(deck, `decks.json[${i}] "${deck?.name ?? "?"}"`);
});
const deckNames = decks.map(d => d?.name?.toLowerCase());
new Set(deckNames.filter((n, i) => deckNames.indexOf(n) !== i)).forEach(n => fail(`decks.json: duplicate deck name "${n}"`));

const realities = loadArray("catalog/realities.json");
realities.forEach((reality, i) => {
    checkReality(reality, `realities.json[${i}] "${reality?.id ?? "?"}"`);
    checkCategory(reality, `realities.json[${i}] "${reality?.id ?? "?"}"`);
});
const realityIds = realities.map(r => r?.id);
new Set(realityIds.filter((id, i) => realityIds.indexOf(id) !== i)).forEach(id => fail(`realities.json: duplicate reality id "${id}"`));

if (errors.length > 0) {
    console.error(`Catalog validation FAILED (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
}
console.log(`Catalog OK: ${decks.length} deck(s), ${realities.length} reality/realities.`);
