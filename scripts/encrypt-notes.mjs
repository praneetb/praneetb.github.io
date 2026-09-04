#!/usr/bin/env node
/**
 * Publish an Obsidian vault as an encrypted notes pack for GitHub Pages.
 *
 *   NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs /path/to/vault
 *   node scripts/encrypt-notes.mjs --list /path/to/vault
 *
 * Writes assets/notes.enc.json (ciphertext only). Never pass a password as a
 * committed flag or check the vault into this repo.
 *
 * Each note keeps its full relative path and parent folder path (empty at the
 * vault root). `folders` is every intermediate prefix, so a note at
 * `10-Work/Projects/People/x.md` contributes `10-Work`, `10-Work/Projects`,
 * and `10-Work/Projects/People`.
 *
 * Site policy: no finance content on this site. The publisher must skip
 * finance paths even for a private pack.
 *
 * Skipped:
 *   - any folder named Finance / finance, including 20-Personal/Finance
 *   - any folder named Archive / archive, including 90-Archive and N-Archive
 *   - Private/, _staging/, .obsidian/, .trash/
 *   - prompts/ (treated as agent-prompt packs) and *.prompt.md
 *   - _system/, _templates/, .claude/ (not shown on the web reader)
 *   - *.secret.md, *.base, workspace/cache junk
 *   - binary, canvas, and other non-Markdown (trivial canvases are not shipped)
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

const SKIP_DIRS = new Set([
  ".obsidian",
  ".trash",
  ".git",
  ".cursor",
  ".claude",
  ".smart-env",
  "node_modules",
  "_staging",
  "_system",
  "_templates",
  "private",
  "finance",
  "archive",
  "90-archive",
  "prompts"
]);

const SKIP_FILES = new Set([
  "workspace.json",
  "workspace-mobile.json",
  "cache",
  ".DS_Store"
]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
  ".mp3",
  ".wav",
  ".m4a",
  ".mp4",
  ".mov",
  ".zip",
  ".7z",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".excalidraw",
  ".canvas",
  ".base"
]);

function usage() {
  console.error("Usage: NOTES_PASSWORD='…' node scripts/encrypt-notes.mjs <vault-dir> [outfile]");
  console.error("       node scripts/encrypt-notes.mjs --list <vault-dir>");
  process.exit(1);
}

function partsOf(rel) {
  return String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
}

function blockedSegment(rel) {
  var parts = partsOf(rel);
  var lower = parts.map(function (part) {
    return part.toLowerCase();
  });
  var i;
  if (!parts.length) {
    return true;
  }
  for (i = 0; i < lower.length; i += 1) {
    if (SKIP_DIRS.has(lower[i])) {
      return true;
    }
    if (/^\d+-archive$/.test(lower[i])) {
      return true;
    }
  }
  for (i = 0; i < lower.length - 1; i += 1) {
    if (lower[i] === "20-personal" && lower[i + 1] === "finance") {
      return true;
    }
  }
  return false;
}

function looksLikeAgentPrompt(rel) {
  var parts = partsOf(rel);
  var base = parts[parts.length - 1] || "";
  var lower = parts.map(function (part) {
    return part.toLowerCase();
  });
  if (lower.indexOf("prompts") !== -1) {
    return true;
  }
  if (/\.prompt\.md$/i.test(base)) {
    return true;
  }
  if (/^(skill|agents|system)\.md$/i.test(base) && lower.some(function (part) {
    return part === ".cursor" || part === "cursor" || part === "agent";
  })) {
    return true;
  }
  return false;
}

function skipFile(rel) {
  var parts = partsOf(rel);
  if (!parts.length || blockedSegment(rel) || looksLikeAgentPrompt(rel)) {
    return true;
  }
  var base = parts[parts.length - 1];
  var ext = path.extname(base).toLowerCase();
  if (SKIP_FILES.has(base)) {
    return true;
  }
  if (/\.secret\.md$/i.test(base)) {
    return true;
  }
  if (BINARY_EXT.has(ext)) {
    return true;
  }
  if (/^(workspace|cache)/i.test(base) && !base.endsWith(".md")) {
    return true;
  }
  return ext !== ".md";
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

function folderPathOf(rel) {
  const folder = path.posix.dirname(String(rel || "").replace(/\\/g, "/"));
  return folder === "." ? "" : folder;
}

function addFolderPrefixes(folders, folderPath) {
  const parts = partsOf(folderPath);
  let acc = "";
  let i;
  for (i = 0; i < parts.length; i += 1) {
    acc = acc ? acc + "/" + parts[i] : parts[i];
    if (!blockedSegment(acc)) {
      folders.add(acc);
    }
  }
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
  const topNames = new Set(
    top.filter(function (entry) {
      return entry.isDirectory();
    }).map(function (entry) {
      return entry.name;
    })
  );
  for (const rel of files) {
    const abs = path.join(vault, rel);
    const body = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    const folder = folderPathOf(rel);
    if (folder) {
      addFolderPrefixes(folders, folder);
    }
    notes.push({
      id: noteId(rel),
      path: rel.replace(/\\/g, "/"),
      folder: folder,
      title: titleFrom(rel, body),
      updated: stat.mtime.toISOString().slice(0, 10),
      body: body.replace(/^\uFEFF/, "")
    });
  }
  ["People"].forEach(function (name) {
    if (topNames.has(name) && !blockedSegment(name)) {
      folders.add(name);
    }
  });
  const folderList = Array.from(folders).sort();
  return {
    v: 1,
    source: "obsidian",
    readonly: true,
    folders: folderList,
    collapsed: folderList.filter(function (name) {
      var base = name.split("/").pop();
      return base === "People";
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
  const listOnly = process.argv[2] === "--list";
  const vault = listOnly ? process.argv[3] : process.argv[2];
  const outfile = path.resolve(process.argv[3] || DEFAULT_OUT);
  if (!vault) {
    usage();
  }
  const payload = await collect(path.resolve(vault));
  if (listOnly) {
    payload.notes.forEach(function (note) {
      console.log(note.path);
    });
    console.error(payload.notes.length + " notes, " + payload.folders.length + " folders");
    payload.folders.forEach(function (folder) {
      console.error("  " + folder);
    });
    return;
  }
  const password = process.env.NOTES_PASSWORD || process.env.SITE_PASSWORD;
  if (!password) {
    usage();
  }
  const envelope = encryptJson(password, payload);
  try {
    const existing = JSON.parse(await fs.readFile(outfile, "utf8"));
    if (existing && existing.user) {
      envelope.user = existing.user;
    }
  } catch (err) {
    // First publish can omit the username verifier; site-admin.js treats that as unconfigured.
  }
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

export { addFolderPrefixes, collect, folderPathOf };

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
