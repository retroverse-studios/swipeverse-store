/**
 * Art set intake: validate a dropped set, install it into art/, update the
 * index — and optionally commit + push (publish).
 *
 * Usage:
 *   1. Copy a processed set into  drop/<set-name>/  with the standard layout
 *      (9 archetype scenes + back.webp + badges/{power,wealth,people,knowledge}.webp).
 *   2. node scripts/ingest-art.mjs                 # ingest every set in drop/
 *      node scripts/ingest-art.mjs cybersecurity   # ingest specific set(s)
 *      Flags: --publish  git add+commit+push after a successful install
 *             --force    replace an already-published set of the same name
 *
 * Hard failures (set is left in drop/, nothing installed): bad set name,
 * missing/extra files, files that aren't real WEBP. Warnings (installed
 * anyway, review before publishing): unusual dimensions vs. the published
 * sets, suspicious file sizes. macOS junk (._*, .DS_Store) is deleted
 * silently. After installing, the script updates art/index.json and greps
 * the site copy for set-count claims that may need a manual bump.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DROP_DIR = join(ROOT, "drop");
const ART_DIR = join(ROOT, "art");
const INDEX_PATH = join(ART_DIR, "index.json");

const SCENES = ["petitioner", "crisis", "opportunity", "faction", "advisor", "chain", "judgement", "gamble", "terminal"];
const BADGES = ["power", "wealth", "people", "knowledge"];
const TOP_FILES = [...SCENES.map(s => `${s}.webp`), "back.webp"];
const BADGE_FILES = BADGES.map(b => `${b}.webp`);
// App-bundled set names — a store set with the same name would shadow confusingly.
const RESERVED = ["base", "cyberpunk", "mystical", "space"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/** Minimal WEBP header parse: returns {width, height} or null if not WEBP. */
function webpDims(path) {
    const buf = readFileSync(path);
    if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
    const fourcc = buf.toString("ascii", 12, 16);
    if (fourcc === "VP8 ") {
        if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === "VP8L") {
        if (buf[20] !== 0x2f) return null;
        const b = [buf[21], buf[22], buf[23], buf[24]];
        return {
            width: 1 + (((b[1] & 0x3f) << 8) | b[0]),
            height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)),
        };
    }
    if (fourcc === "VP8X") {
        return {
            width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
            height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
        };
    }
    return null;
}

/** Dimensions of a published set's files, used as the reference norm. */
function referenceDims(index) {
    const ref = index.sets.find(s => existsSync(join(ART_DIR, s, "petitioner.webp")));
    if (!ref) return null;
    return {
        set: ref,
        scene: webpDims(join(ART_DIR, ref, "petitioner.webp")),
        back: webpDims(join(ART_DIR, ref, "back.webp")),
        badge: webpDims(join(ART_DIR, ref, "badges", "power.webp")),
    };
}

function cleanJunk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (entry.startsWith("._") || entry === ".DS_Store") { unlinkSync(path); continue; }
        if (statSync(path).isDirectory()) cleanJunk(path);
    }
}

function validateSet(name, dir, ref) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`${name}: set name must be kebab-case (lowercase letters, digits, hyphens)`);
    if (RESERVED.includes(name)) fail(`${name}: name collides with an app-bundled set (${RESERVED.join(", ")})`);

    const top = readdirSync(dir).filter(f => f !== "badges");
    const badgeDir = join(dir, "badges");
    const badges = existsSync(badgeDir) ? readdirSync(badgeDir) : null;

    for (const f of TOP_FILES) if (!top.includes(f)) fail(`${name}: missing ${f}`);
    for (const f of top) if (!TOP_FILES.includes(f)) fail(`${name}: unexpected file "${f}" (allowed: ${TOP_FILES.join(", ")}, badges/)`);
    if (badges === null) fail(`${name}: missing badges/ directory`);
    else {
        for (const f of BADGE_FILES) if (!badges.includes(f)) fail(`${name}: missing badges/${f}`);
        for (const f of badges) if (!BADGE_FILES.includes(f)) fail(`${name}: unexpected file "badges/${f}"`);
    }
    if (errors.length > 0) return;

    const checkFile = (rel, kind) => {
        const path = join(dir, rel);
        const size = statSync(path).size;
        const dims = webpDims(path);
        if (!dims) return fail(`${name}/${rel}: not a valid WEBP file`);
        if (size > MAX_FILE_BYTES) warn(`${name}/${rel}: ${(size / 1024).toFixed(0)} KB is unusually large (published sets are mostly < 300 KB)`);
        if (ref?.[kind] && (dims.width !== ref[kind].width || dims.height !== ref[kind].height)) {
            warn(`${name}/${rel}: ${dims.width}x${dims.height} differs from the published norm ${ref[kind].width}x${ref[kind].height} (reference: ${ref.set})`);
        }
    };
    for (const scene of SCENES) checkFile(`${scene}.webp`, "scene");
    checkFile("back.webp", "back");
    for (const badge of BADGES) checkFile(join("badges", `${badge}.webp`), "badge");
}

function installSet(name, dir) {
    const dest = join(ART_DIR, name);
    mkdirSync(join(dest, "badges"), { recursive: true });
    for (const f of TOP_FILES) copyFileSync(join(dir, f), join(dest, f));
    for (const f of BADGE_FILES) copyFileSync(join(dir, "badges", f), join(dest, "badges", f));
    rmSync(dir, { recursive: true });
    console.log(`  installed art/${name}/ (drop folder removed)`);
}

function reportCountCopy(index) {
    const hosted = index.sets.length;
    console.log(`\nSet count is now ${hosted} hosted (+${RESERVED.length} bundled = ${hosted + RESERVED.length} total).`);
    console.log("Site copy mentioning set counts (update by hand if stale):");
    for (const file of ["index.html", "README.md", "guide/index.html"]) {
        const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
        lines.forEach((line, i) => {
            if (/\b\d+\s+(themed|hosted|art sets|sets\b)/i.test(line) || /\bsets\s*\(\d+/i.test(line)) {
                console.log(`  ${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
            }
        });
    }
}

// ——— Main ———

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const force = args.includes("--force");
const wanted = args.filter(a => !a.startsWith("--"));

if (!existsSync(DROP_DIR)) mkdirSync(DROP_DIR);
cleanJunk(DROP_DIR);
const dropped = readdirSync(DROP_DIR).filter(f => statSync(join(DROP_DIR, f)).isDirectory());
const targets = wanted.length > 0 ? wanted : dropped;
if (targets.length === 0) {
    console.log(`Nothing to ingest. Copy a set into ${DROP_DIR}/<set-name>/ first.`);
    process.exit(0);
}

const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const ref = referenceDims(index);
const installed = [];

for (const name of targets) {
    const dir = join(DROP_DIR, name);
    console.log(`\n== ${name} ==`);
    if (!existsSync(dir)) { fail(`${name}: no such folder in drop/`); continue; }
    if (index.sets.includes(name) && !force) { fail(`${name}: already published — pass --force to replace it`); continue; }

    const before = errors.length;
    validateSet(name, dir, ref);
    if (errors.length > before) { console.log(`  ✗ failed validation — left in drop/`); continue; }

    installSet(name, dir);
    if (!index.sets.includes(name)) index.sets.push(name);
    installed.push(name);
}

if (installed.length > 0) {
    index.sets.sort();
    index.setInfo ??= {};
    for (const name of installed) {
        if (!index.setInfo[name]) {
            index.setInfo[name] = { title: name[0].toUpperCase() + name.slice(1), hint: "" };
            console.log(`  ⚠ ${name}: added placeholder setInfo — fill in the genre hint (shows in the gallery + editor)`);
        }
    }
    writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
    console.log(`\nUpdated art/index.json (${index.sets.length} sets).`);
    reportCountCopy(index);
}

if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
}
if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
}

if (publish && installed.length > 0) {
    console.log("\nPublishing...");
    execSync(`git add art/index.json ${installed.map(s => `"art/${s}"`).join(" ")}`, { cwd: ROOT, stdio: "inherit" });
    execSync(`git commit -m "Art palette: add ${installed.join(", ")}"`, { cwd: ROOT, stdio: "inherit" });
    execSync("git push", { cwd: ROOT, stdio: "inherit" });
    console.log("Pushed — live on store.swipeverse.app within a minute or two.");
} else if (installed.length > 0) {
    console.log(`\nInstalled but NOT published. Review, then: git add -A art/ && git commit && git push`);
    console.log(`(or rerun with --publish next time)`);
}
