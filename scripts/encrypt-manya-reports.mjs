#!/usr/bin/env node
/**
 * Publish Manya report-card PDFs as an encrypted pack for GitHub Pages.
 *
 *   NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs /path/to/pdf-folder
 *   NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs /path/to/pdf-folder --map map.json
 *   node scripts/encrypt-manya-reports.mjs --list /path/to/pdf-folder
 *
 * Writes assets/manya/reports.enc.json (ciphertext only). Never pass a
 * password as a committed flag and never check raw PDFs into this repo.
 *
 * Drive remains the source of truth for the original files. Stable ids are
 * the Google Drive file ids from `_data/manya_reports.yml`. This envelope
 * must NOT include a `user` verifier — site login stays on notes.enc.json.
 *
 * Mapping (first match wins):
 *   1. --map JSON, or map.json / manifest.json in the folder
 *      { "Manya-KG.pdf": "<file_id>" }
 *      or { "reports": [ { "id", "filename", "title"? } ] }
 *      or [ { "id", "filename", "title"? } ]
 *   2. Filename contains a Drive file_id from manya_reports.yml
 *   3. Unique title / "title-note" slug match against the YAML catalog
 */

import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "assets", "manya", "reports.enc.json");
const DEFAULT_YML = path.join(ROOT, "_data", "manya_reports.yml");
const ITER = 600000;
const KEY_LEN = 32;
const IV_LEN = 12;

function usage() {
  console.error(
    "Usage: NOTES_PASSWORD='…' node scripts/encrypt-manya-reports.mjs <pdf-dir> [--map map.json] [outfile]"
  );
  console.error("       node scripts/encrypt-manya-reports.mjs --list <pdf-dir> [--map map.json]");
  process.exit(1);
}

function unquote(value) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).replace(/\\"/g, '"');
  }
  return text;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseReportsYml(text) {
  const items = [];
  let current = null;
  String(text || "")
    .split(/\r?\n/)
    .forEach(function (line) {
      const title = line.match(/^\s+-\s+title:\s*(.*)$/);
      if (title) {
        if (current && current.file_id) {
          items.push(current);
        }
        current = { title: unquote(title[1]) };
        return;
      }
      if (!current) {
        return;
      }
      const fileId = line.match(/^\s+file_id:\s*(.*)$/);
      if (fileId) {
        current.file_id = unquote(fileId[1]);
        return;
      }
      const note = line.match(/^\s+note:\s*(.*)$/);
      if (note) {
        current.note = unquote(note[1]);
      }
    });
  if (current && current.file_id) {
    items.push(current);
  }
  return items;
}

function catalogEntry(item) {
  const title = item.title || "";
  const note = item.note || "";
  const label = note ? title + " · " + note : title;
  return {
    id: item.file_id || item.id,
    title: label || title,
    shortTitle: title,
    note: note,
    slugs: [
      slugify(title),
      slugify(label),
      slugify((title + " " + note).trim()),
      slugify(title + "-" + note)
    ].filter(Boolean)
  };
}

async function loadCatalog(ymlPath) {
  try {
    const text = await fs.readFile(ymlPath, "utf8");
    return parseReportsYml(text).map(catalogEntry).filter(function (item) {
      return !!item.id;
    });
  } catch (err) {
    return [];
  }
}

function parseMapJson(raw) {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map(function (row) {
        if (!row) {
          return null;
        }
        if (typeof row === "string") {
          return null;
        }
        return {
          id: String(row.id || row.file_id || ""),
          filename: String(row.filename || row.file || ""),
          title: row.title ? String(row.title) : ""
        };
      })
      .filter(function (row) {
        return row && row.id && row.filename;
      });
  }
  if (raw.reports && Array.isArray(raw.reports)) {
    return parseMapJson(raw.reports);
  }
  return Object.keys(raw)
    .filter(function (key) {
      return key !== "v" && key !== "kind";
    })
    .map(function (filename) {
      const value = raw[filename];
      if (value && typeof value === "object") {
        return {
          id: String(value.id || value.file_id || ""),
          filename: String(value.filename || filename),
          title: value.title ? String(value.title) : ""
        };
      }
      return {
        id: String(value || ""),
        filename: filename,
        title: ""
      };
    })
    .filter(function (row) {
      return row.id && row.filename;
    });
}

async function loadMapFile(mapPath) {
  if (!mapPath) {
    return [];
  }
  const raw = JSON.parse(await fs.readFile(mapPath, "utf8"));
  return parseMapJson(raw);
}

async function findDefaultMap(dir) {
  const names = ["map.json", "manifest.json", "reports.map.json", "ids.json"];
  var i;
  for (i = 0; i < names.length; i += 1) {
    const candidate = path.join(dir, names[i]);
    try {
      await fs.access(candidate);
      return candidate;
    } catch (err) {
      // Try the next conventional name.
    }
  }
  return "";
}

async function listPdfs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(function (entry) {
      return entry.isFile() && /\.pdf$/i.test(entry.name);
    })
    .map(function (entry) {
      return entry.name;
    })
    .sort(function (a, b) {
      return a.localeCompare(b);
    });
}

function mapLookup(mappings, filename) {
  var i;
  for (i = 0; i < mappings.length; i += 1) {
    if (mappings[i].filename === filename) {
      return mappings[i];
    }
  }
  const base = filename.toLowerCase();
  for (i = 0; i < mappings.length; i += 1) {
    if (String(mappings[i].filename || "").toLowerCase() === base) {
      return mappings[i];
    }
  }
  return null;
}

function catalogById(catalog, id) {
  var i;
  for (i = 0; i < catalog.length; i += 1) {
    if (catalog[i].id === id) {
      return catalog[i];
    }
  }
  return null;
}

function matchByFileId(filename, catalog) {
  var i;
  for (i = 0; i < catalog.length; i += 1) {
    if (catalog[i].id && filename.indexOf(catalog[i].id) !== -1) {
      return catalog[i];
    }
  }
  return null;
}

function uniqueSlugMatch(filename, catalog) {
  const stem = slugify(filename.replace(/\.pdf$/i, ""));
  if (!stem) {
    return null;
  }
  const hits = catalog.filter(function (item) {
    return item.slugs.some(function (slug) {
      return slug && (stem === slug || stem.indexOf(slug) !== -1 || slug.indexOf(stem) !== -1);
    });
  });
  return hits.length === 1 ? hits[0] : null;
}

async function resolveReports(dir, options) {
  const opts = options || {};
  const catalog = opts.catalog || (await loadCatalog(opts.ymlPath || DEFAULT_YML));
  const mapPath = opts.mapPath || (await findDefaultMap(dir));
  const mappings = opts.mappings || (mapPath ? await loadMapFile(mapPath) : []);
  const files = await listPdfs(dir);
  if (!files.length) {
    throw new Error("No PDF files in " + dir);
  }
  const used = new Set();
  const reports = [];
  const unmatched = [];
  var i;
  for (i = 0; i < files.length; i += 1) {
    const filename = files[i];
    const mapped = mapLookup(mappings, filename);
    const byId = matchByFileId(filename, catalog);
    const bySlug = uniqueSlugMatch(filename, catalog);
    const chosen = mapped
      ? { id: mapped.id, title: mapped.title, filename: filename }
      : byId
        ? { id: byId.id, title: byId.title, filename: filename }
        : bySlug
          ? { id: bySlug.id, title: bySlug.title, filename: filename }
          : null;
    if (!chosen || !chosen.id) {
      unmatched.push(filename);
      continue;
    }
    if (used.has(chosen.id)) {
      throw new Error(
        "Duplicate id " + chosen.id + " for " + filename + " (already used in this pack)"
      );
    }
    used.add(chosen.id);
    const catalogHit = catalogById(catalog, chosen.id);
    reports.push({
      id: chosen.id,
      filename: filename,
      title: chosen.title || (catalogHit && catalogHit.title) || filename.replace(/\.pdf$/i, ""),
      mime: "application/pdf"
    });
  }
  if (unmatched.length) {
    throw new Error(
      "Could not map PDF(s) to Drive file ids: " +
        unmatched.join(", ") +
        ". Pass --map map.json (filename → file_id from _data/manya_reports.yml)."
    );
  }
  const order = {};
  catalog.forEach(function (item, index) {
    order[item.id] = index;
  });
  reports.sort(function (a, b) {
    const ia = order.hasOwnProperty(a.id) ? order[a.id] : 9999;
    const ib = order.hasOwnProperty(b.id) ? order[b.id] : 9999;
    if (ia !== ib) {
      return ia - ib;
    }
    return a.filename.localeCompare(b.filename);
  });
  return { reports: reports, mapPath: mapPath, catalog: catalog };
}

async function readPdfBase64(dir, filename) {
  const abs = path.join(dir, filename);
  const buf = await fs.readFile(abs);
  if (buf.length < 5 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error(filename + " is not a PDF");
  }
  return buf.toString("base64");
}

async function buildPayload(dir, options) {
  const resolved = await resolveReports(dir, options);
  const reports = [];
  var i;
  for (i = 0; i < resolved.reports.length; i += 1) {
    const row = resolved.reports[i];
    reports.push({
      id: row.id,
      filename: row.filename,
      title: row.title,
      mime: "application/pdf",
      pdf_b64: await readPdfBase64(dir, row.filename)
    });
  }
  return {
    v: 1,
    kind: "manya-reports",
    reports: reports,
    _meta: { mapPath: resolved.mapPath }
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

function parseArgs(argv) {
  const args = { listOnly: false, dir: "", mapPath: "", outfile: DEFAULT_OUT };
  const rest = argv.slice(2);
  var i;
  for (i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--list") {
      args.listOnly = true;
    } else if (token === "--map") {
      args.mapPath = rest[i + 1] || "";
      i += 1;
    } else if (token === "--out") {
      args.outfile = path.resolve(rest[i + 1] || DEFAULT_OUT);
      i += 1;
    } else if (!args.dir) {
      args.dir = token;
    } else if (args.outfile === DEFAULT_OUT) {
      args.outfile = path.resolve(token);
    } else {
      usage();
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dir) {
    usage();
  }
  const dir = path.resolve(args.dir);
  const built = await buildPayload(dir, { mapPath: args.mapPath || undefined });
  const payload = {
    v: built.v,
    kind: built.kind,
    reports: built.reports
  };
  if (args.listOnly) {
    payload.reports.forEach(function (report) {
      console.log(report.id + "\t" + report.filename + "\t" + report.title);
    });
    console.error(payload.reports.length + " PDF(s) mapped. Ciphertext not written.");
    return;
  }
  const password = process.env.NOTES_PASSWORD || process.env.SITE_PASSWORD;
  if (!password) {
    usage();
  }
  const envelope = encryptJson(password, payload);
  if (envelope.user) {
    delete envelope.user;
  }
  await fs.mkdir(path.dirname(args.outfile), { recursive: true });
  await fs.writeFile(args.outfile, JSON.stringify(envelope));
  console.log(
    "Wrote " +
      args.outfile +
      " (" +
      payload.reports.length +
      " reports). Ciphertext only; no user verifier; do not commit raw PDFs."
  );
}

export { buildPayload, encryptJson, parseReportsYml, resolveReports };

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
