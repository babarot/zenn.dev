#!/usr/bin/env node
// Checks articles/*.md before they reach Zenn. The front matter rules mirror
// the validators in zenn-cli (the ones its preview reports); the rest guard
// what Zenn cannot undo for us: a published article losing its file or URL.
//
// Usage: node tools/check-articles.js [articles/<slug>.md ...]

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const ARTICLES = "articles";
const BASE_REF = "origin/main";
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const errors = [];
const warnings = [];
const error = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// The front matter here is flat: quoted or bare scalars, booleans and one-line
// arrays. Anything else is reported rather than guessed at.
function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const raw of m[1].split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    if (line === "") continue;
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) throw new Error(`cannot parse front matter line: ${raw}`);
    fm[kv[1]] = parseValue(kv[2]);
  }
  return { fm, body: text.slice(m[0].length) };
}

function parseValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "" || v === "null") return null;
  if (v.startsWith("[") || v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'")) return v.slice(1, -1);
  return v;
}

function checkFrontMatter(file, fm) {
  const { title, emoji, type, topics, published, published_at } = fm;
  if (typeof title !== "string" || title === "") error(file, "title is missing");
  else if (title.length > 70) error(file, "title is longer than 70 characters");

  if (typeof emoji !== "string" || emoji === "") error(file, "emoji is missing");
  else {
    const graphemes = [...new Intl.Segmenter().segment(emoji)];
    if (graphemes.length !== 1 || !/\p{Extended_Pictographic}/u.test(emoji)) {
      error(file, "emoji must be a single emoji");
    }
  }

  if (type !== "tech" && type !== "idea") error(file, 'type must be "tech" or "idea"');

  if (!Array.isArray(topics) || topics.length === 0) error(file, "topics must be a non-empty array");
  else {
    if (topics.length > 5) error(file, "topics can have at most 5 entries");
    for (const t of topics) {
      if (typeof t !== "string" || t === "") error(file, "topics must all be strings");
      else if (t.length > 18) error(file, `topic "${t}" is longer than 18 characters`);
      else if (/[ -/:-@[-`{-~]/.test(t)) error(file, `topic "${t}" has a symbol or space`);
    }
  }

  if (typeof published !== "boolean") error(file, "published must be true or false, unquoted");

  if (published_at != null) {
    const s = String(published_at);
    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(s) || isNaN(Date.parse(s.replace(" ", "T")))) {
      error(file, 'published_at must be "YYYY-MM-DD" or "YYYY-MM-DD hh:mm"');
    } else if (Date.parse(s.replace(" ", "T")) > Date.now() && published !== true) {
      error(file, "a future published_at needs published: true");
    }
  }

  if ("tags" in fm) error(file, "use topics, not tags");
  for (const key of ["slug", "medium"]) {
    if (key in fm) error(file, `"${key}" is an Obsidian key; the slug is the file name`);
  }
}

function checkBody(file, body) {
  for (const [, src] of body.matchAll(/!\[[^\]]*\]\((\/images\/[^)\s]+)/g)) {
    const path = src.slice(1);
    if (!existsSync(path)) {
      error(file, `image ${src} does not exist`);
      continue;
    }
    if (!IMAGE_EXTS.some((ext) => path.toLowerCase().endsWith(ext))) {
      error(file, `image ${src} is not one of ${IMAGE_EXTS.join(" ")}`);
    }
    if (statSync(path).size > IMAGE_MAX_BYTES) error(file, `image ${src} is larger than 3MB`);
  }
  for (const [, src] of body.matchAll(/!\[[^\]]*\]\(((?:\.\.?\/|\/\/)?images\/[^)\s]+)/g)) {
    error(file, `image ${src} must be an absolute path from /images/`);
  }
  if (/!\[\[[^\]]+\]\]/.test(body)) error(file, "Obsidian image embed ![[...]] does not render on Zenn");
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// A published article whose file disappears (deleted or renamed) stays on Zenn
// at its old URL, frozen, and can no longer be edited from this repository.
function checkPublishedAgainstBase() {
  let names;
  try {
    names = git("ls-tree", "--name-only", `${BASE_REF}:${ARTICLES}`).split("\n").filter((n) => n.endsWith(".md"));
  } catch {
    warn(BASE_REF, "not found; skipped the check for removed or unpublished articles");
    return;
  }
  for (const name of names) {
    const file = join(ARTICLES, name);
    let before;
    try {
      before = parseFrontMatter(git("show", `${BASE_REF}:${file}`))?.fm;
    } catch {
      continue;
    }
    if (before?.published !== true) continue;
    if (!existsSync(file)) {
      error(file, `published on ${BASE_REF} but its file is gone; keep the file and slug of a published article`);
      continue;
    }
    try {
      const now = parseFrontMatter(readFileSync(file, "utf8"))?.fm;
      if (now?.published === false) warn(file, "published on Zenn; published: false will unpublish it");
    } catch {
      // reported by the per-file check
    }
  }
}

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(ARTICLES).filter((n) => n.endsWith(".md")).map((n) => join(ARTICLES, n));

for (const file of files) {
  const slug = basename(file, ".md");
  if (!/^[0-9a-z_-]{12,50}$/.test(slug)) {
    error(file, "the file name (slug) must be 12-50 characters of a-z, 0-9, - and _");
  }
  let parsed;
  try {
    parsed = parseFrontMatter(readFileSync(file, "utf8"));
  } catch (e) {
    error(file, e.message);
    continue;
  }
  if (!parsed) {
    error(file, "no front matter");
    continue;
  }
  checkFrontMatter(file, parsed.fm);
  checkBody(file, parsed.body);
}
if (process.argv.length <= 2) checkPublishedAgainstBase();

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length > 0) process.exit(1);
console.log(`ok: ${files.length} articles`);
