#!/usr/bin/env node
/**
 * Publish an Obsidian vault as an encrypted notes pack for GitHub Pages.
 *
 *   NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
 *
 * Writes assets/notes.enc.json (ciphertext only). Never pass a password as a
 * committed flag or check the vault into this repo.
 *
 * Skipped: any Private/ folder segment, *.secret.md, .obsidian/, .trash/,
 * *.base, workspace/cache junk, and non-Markdown files.
 */

import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "assets", "notes.enc.json");
const ITER = 600000;
const KEY_LEN = 32;
const IV_LEN = 12;

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", ".smart-env", "node_modules"]);
const SKIP_FILES = new Set([
  "workspace.json",
  "workspace-mobile.json",
  "cache",
  ".DS_Store"
]);

function usage() {
  console.error("Usage: NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs <vault-dir> [outfile]");
  process.exit(1);
}

function blockedSegment(rel) {
  return rel.split(/[/\\]/).filter(Boolean).some(function (part) {
    return part === "Private" || SKIP_DIRS.has(part);
  });
}

function skipFile(rel) {
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (!parts.length || blockedSegment(rel)) {
    return true;
  }
  const base = parts[parts.length - 1];
  if (SKIP_FILES.has(base)) {
    return true;
  }
  if (/\.secret\.md$/i.test(base)) {
    return true;
  }
  if (/\.base$/i.test(base)) {
    return true;
  }
  if (/^(workspace|cache)/i.test(base) && !base.endsWith(".md")) {
    return true;
  }
  return !/\.md$/i.test(base);
}

function titleFrom(rel, body) {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1].trim();
  }
  return path.basename(rel, path.extname(rel));
}

function noteId(rel) {
  return rel
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-|-$/g, "");
}

async function walk(dir, prefix, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (blockedSegment(rel)) {
        continue;
      }
      await walk(path.join(dir, entry.name), rel, files);
    } else if (entry.isFile() && !skipFile(rel)) {
      files.push(rel);
    }
  }
}

async function collect(vault) {
  const files = [];
  await walk(vault, "", files);
  files.sort(function (a, b) {
    return a.localeCompare(b);
  });
  const notes = [];
  const folders = new Set();
  const top = await fs.readdir(vault, { withFileTypes: true });
  top.forEach(function (entry) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && entry.name !== "Private") {
      folders.add(entry.name);
    }
  });
  for (const rel of files) {
    const abs = path.join(vault, rel);
    const body = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    const folder = path.posix.dirname(rel.replace(/\\/g, "/"));
    if (folder && folder !== ".") {
      folders.add(folder.split("/")[0]);
    }
    notes.push({
      id: noteId(rel),
      path: rel.replace(/\\/g, "/"),
      folder: folder === "." ? "" : folder.split("/")[0],
      title: titleFrom(rel, body),
      updated: stat.mtime.toISOString().slice(0, 10),
      body: body.replace(/^\uFEFF/, "")
    });
  }
  return {
    v: 1,
    source: "obsidian",
    readonly: true,
    folders: Array.from(folders).sort(),
    collapsed: ["People", "Archive"].filter(function (name) {
      return folders.has(name);
    }),
    notes: notes
  };
}

function encryptJson(password, payload) {
  const salt = randomBytes(16);
  const iv = randomBytes(IV_LEN);
  const key = pbkdf2Sync(password, salt, ITER, KEY_LEN, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: ITER,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: Buffer.concat([ct, tag]).toString("base64")
  };
}

async function main() {
  const vault = process.argv[2];
  const outfile = path.resolve(process.argv[3] || DEFAULT_OUT);
  const password = process.env.NOTES_PASSWORD || process.env.SITE_PASSWORD;
  if (!vault || !password) {
    usage();
  }
  const payload = await collect(path.resolve(vault));
  const envelope = encryptJson(password, payload);
  await fs.mkdir(path.dirname(outfile), { recursive: true });
  await fs.writeFile(outfile, JSON.stringify(envelope));
  console.log(
    "Wrote " +
      outfile +
      " (" +
      payload.notes.length +
      " notes, " +
      payload.folders.length +
      " folders). Ciphertext only."
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
