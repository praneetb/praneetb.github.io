#!/usr/bin/env node
/**
 * Bake Obsidian violin notes into _data/violin.yml.
 *
 *   node scripts/bake-violin.mjs /path/to/obsidian-vault
 *   node scripts/bake-violin.mjs --list /path/to/obsidian-vault
 *
 * Reads:
 *   30-Knowledge/Interests/Violin/Violin.md
 *   30-Knowledge/Interests/Violin/Pieces/
 *   30-Knowledge/Interests/Violin/Practice-Log/
 *   30-Knowledge/Interests/Violin/Recordings/
 *   30-Knowledge/Interests/Violin/Teacher-Notes/
 *
 * Never invents practice sessions, recordings, or teacher notes.
 * If Pieces is empty, writes 2–3 placeholder piece names (marked
 * placeholder: true). Private lists stay [] when those folders are empty.
 *
 * Does not write assets/notes.enc.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_data", "violin.yml");

const VAULT_ROOT = "30-Knowledge/Interests/Violin";
const PATHS = {
  moc: `${VAULT_ROOT}/Violin.md`,
  pieces: `${VAULT_ROOT}/Pieces`,
  practice_log: `${VAULT_ROOT}/Practice-Log`,
  recordings: `${VAULT_ROOT}/Recordings`,
  teacher_notes: `${VAULT_ROOT}/Teacher-Notes`
};

const PLACEHOLDER_PIECES = [
  {
    id: "meditation",
    placeholder: true,
    title: "Méditation",
    subtitle: "Massenet",
    full_title: "Méditation from Thaïs",
    composer: "Jules Massenet",
    composer_short: "Massenet",
    status: "polishing",
    key: "D-flat Major",
    difficulty: "Level 6–7 (Advanced)",
    icon: "fleur",
    why_i_like_it:
      "A serene, intimate monologue of a piece—lyrical, tender, and deeply expressive. It invites both vulnerability and control, with every phrase revealing something new.",
    image: "/assets/images/violin/piece.jpg",
    vault_path: `${VAULT_ROOT}/Pieces/Meditation.md`
  },
  {
    id: "ave-maria",
    placeholder: true,
    title: "Ave Maria",
    subtitle: "Bach / Gounod",
    full_title: "Ave Maria",
    composer: "Bach / Gounod",
    composer_short: "Bach / Gounod",
    status: "learning",
    key: "",
    difficulty: "",
    icon: "note",
    why_i_like_it: "",
    image: "/assets/images/violin/piece.jpg",
    vault_path: `${VAULT_ROOT}/Pieces/Ave-Maria.md`
  },
  {
    id: "simple-gifts",
    placeholder: true,
    title: "Simple Gifts",
    subtitle: "Trad. arr.",
    full_title: "Simple Gifts",
    composer: "Traditional, arranged",
    composer_short: "Trad. arr.",
    status: "ready",
    key: "",
    difficulty: "",
    icon: "star",
    why_i_like_it: "",
    image: "/assets/images/violin/piece.jpg",
    vault_path: `${VAULT_ROOT}/Pieces/Simple-Gifts.md`
  }
];

function usage() {
  console.error("Usage: node scripts/bake-violin.mjs /path/to/obsidian-vault");
  console.error("       node scripts/bake-violin.mjs --list /path/to/obsidian-vault");
  process.exit(1);
}

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function parseFrontmatter(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: text.trim() };
  }
  const data = {};
  match[1].split(/\r?\n/).forEach(function (line) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      return;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) {
      data[key] = value;
    }
  });
  return { data: data, body: match[2].trim() };
}

function firstHeading(body) {
  const match = String(body || "").match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function section(body, heading) {
  const re = new RegExp("^##\\s+" + heading + "\\s*$", "im");
  const start = String(body || "").search(re);
  if (start === -1) {
    return "";
  }
  const after = String(body || "").slice(start).split(/\r?\n/).slice(1);
  const lines = [];
  for (let i = 0; i < after.length; i += 1) {
    if (/^##\s+/.test(after[i])) {
      break;
    }
    lines.push(after[i]);
  }
  return lines.join("\n").trim();
}

function yamlQuote(value) {
  const text = String(value == null ? "" : value);
  if (text === "") {
    return '""';
  }
  if (/[:#{}[\],&*?|><%!@`]/.test(text) || /^(true|false|null|yes|no)$/i.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function yamlBlock(value, indent) {
  const text = String(value || "").trim();
  if (!text) {
    return '""';
  }
  if (!text.includes("\n") && text.length < 90) {
    return yamlQuote(text);
  }
  const pad = " ".repeat(indent);
  return (
    ">-\n" +
    text
      .split(/\n/)
      .map(function (line) {
        return pad + line;
      })
      .join("\n")
  );
}

async function listMarkdown(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name) || entry.name.startsWith(".")) {
      continue;
    }
    files.push(path.join(dir, entry.name));
  }
  files.sort();
  return files;
}

async function readNote(file) {
  const raw = await fs.readFile(file, "utf8");
  const parsed = parseFrontmatter(raw);
  parsed.file = file;
  parsed.name = path.basename(file, path.extname(file));
  return parsed;
}

function pieceFromNote(note, vaultDir) {
  const title = note.data.title || firstHeading(note.body) || note.name;
  const composer = note.data.composer || note.data.composer_short || "";
  const why =
    note.data.why_i_like_it ||
    note.data.why ||
    section(note.body, "Why I like it") ||
    section(note.body, "Why I like this") ||
    "";
  return {
    id: note.data.id || slug(title) || slug(note.name),
    placeholder: false,
    title: title,
    subtitle: note.data.subtitle || composer,
    full_title: note.data.full_title || title,
    composer: composer,
    composer_short: note.data.composer_short || composer,
    status: (note.data.status || "").toLowerCase() || "learning",
    key: note.data.key || "",
    difficulty: note.data.difficulty || "",
    icon: note.data.icon || "note",
    why_i_like_it: why,
    image: note.data.image || "/assets/images/violin/piece.jpg",
    vault_path: path.relative(vaultDir, note.file).split(path.sep).join("/")
  };
}

function logFromNote(note, vaultDir) {
  const date = note.data.date || note.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  if (!date) {
    return null;
  }
  return {
    date: date,
    minutes: Number(note.data.minutes || note.data.mins || 0) || 0,
    piece: note.data.piece || note.data.title || firstHeading(note.body) || "",
    note: note.data.note || note.data.focus || firstHeading(note.body) || "",
    vault_path: path.relative(vaultDir, note.file).split(path.sep).join("/")
  };
}

function recordingFromNote(note, vaultDir) {
  const date = note.data.date || note.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  return {
    id: note.data.id || slug(note.name),
    date: date,
    title: note.data.title || firstHeading(note.body) || note.name,
    duration: note.data.duration || "",
    piece: note.data.piece || "",
    piece_id: note.data.piece_id || "",
    minutes: Number(note.data.minutes || 0) || 0,
    focus: note.data.focus || note.data.note || section(note.body, "Focus") || "",
    audio: note.data.audio || "",
    vault_path: path.relative(vaultDir, note.file).split(path.sep).join("/")
  };
}

function teacherFromNote(note, vaultDir) {
  const date = note.data.date || note.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  return {
    date: date,
    from: note.data.from || "teacher",
    body: note.data.body || note.data.note || note.body || "",
    vault_path: path.relative(vaultDir, note.file).split(path.sep).join("/")
  };
}

export function deriveProgress(logs) {
  const dates = Array.from(
    new Set(
      (logs || [])
        .map(function (entry) {
          return String(entry.date || "").slice(0, 10);
        })
        .filter(function (value) {
          return /^\d{4}-\d{2}-\d{2}$/.test(value);
        })
    )
  ).sort();
  if (!dates.length) {
    return { streak_days: 0, weeks: 0 };
  }
  const first = new Date(dates[0] + "T00:00:00");
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  const spanDays = Math.round((last - first) / 86400000) + 1;
  const weeks = Math.max(1, Math.ceil(spanDays / 7));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latest = new Date(dates[dates.length - 1] + "T00:00:00");
  const gap = Math.round((today - latest) / 86400000);
  if (gap > 1) {
    return { streak_days: 0, weeks: weeks };
  }
  const have = new Set(dates);
  let cursor = new Date(latest);
  let streak = 0;
  while (have.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak_days: streak, weeks: weeks };
}

function renderYaml(data) {
  const lines = [];
  lines.push("# Violin section — baked site data.");
  lines.push("# Source of truth: Obsidian vault path");
  lines.push("#   30-Knowledge/Interests/Violin/");
  lines.push("#     Violin.md              (MOC)");
  lines.push("#     Pieces/                (public piece notes)");
  lines.push("#     Practice-Log/          (private sessions)");
  lines.push("#     Recordings/            (private audio + take notes)");
  lines.push("#     Teacher-Notes/         (private teacher feedback)");
  lines.push("#");
  lines.push("# Bake (does not invent logs, recordings, or teacher notes):");
  lines.push("#   node scripts/bake-violin.mjs /path/to/obsidian-vault");
  lines.push("#");
  lines.push("# When those vault folders are empty, practice_log / recordings /");
  lines.push("# teacher_notes stay []. Streak and weeks are derived only from");
  lines.push("# Practice-Log dates. Piece names may be 2–3 placeholders, marked");
  lines.push("# placeholder: true, until real Pieces notes exist.");
  lines.push("#");
  lines.push("# Do not invent practice sessions, recordings, or teacher notes.");
  lines.push("");
  lines.push("vault:");
  lines.push("  root: " + VAULT_ROOT);
  lines.push("  moc: " + PATHS.moc);
  lines.push("  pieces: " + PATHS.pieces);
  lines.push("  practice_log: " + PATHS.practice_log);
  lines.push("  recordings: " + PATHS.recordings);
  lines.push("  teacher_notes: " + PATHS.teacher_notes);
  lines.push("");
  lines.push("baked_from: " + yamlQuote(data.baked_from));
  lines.push("baked_note: " + yamlBlock(data.baked_note, 2));
  lines.push("");
  lines.push("hero:");
  lines.push("  title: Violin");
  lines.push("  kicker: Learning in public.");
  lines.push("  lede: A public record of learning violin with intention, patience, and a little music along the way.");
  lines.push("  image: /assets/images/violin/hero.jpg");
  lines.push("  image_alt: Close view of a violin being played, warm wood and bow in motion.");
  lines.push("  image_credit: Wikimedia Commons, public-domain / CC stills — see assets/images/violin/CREDITS.txt");
  lines.push("");
  lines.push("story:");
  lines.push("  title: Violin — Learning in public");
  lines.push("  lede: Daily practice. Small wins. Real progress.");
  lines.push("  cta: Watch story");
  lines.push("  image: /assets/images/violin/story.jpg");
  lines.push("");
  lines.push("# Derived only from practice_log[].date. Zero when the log is empty.");
  lines.push("streak_days: " + data.streak_days);
  lines.push("weeks: " + data.weeks);
  lines.push("");
  lines.push("pieces:");
  data.pieces.forEach(function (piece) {
    lines.push("  - id: " + piece.id);
    lines.push("    placeholder: " + (piece.placeholder ? "true" : "false"));
    lines.push("    title: " + yamlQuote(piece.title));
    lines.push("    subtitle: " + yamlQuote(piece.subtitle));
    lines.push("    full_title: " + yamlQuote(piece.full_title));
    lines.push("    composer: " + yamlQuote(piece.composer));
    lines.push("    composer_short: " + yamlQuote(piece.composer_short));
    lines.push("    status: " + yamlQuote(piece.status));
    lines.push("    key: " + yamlQuote(piece.key));
    lines.push("    difficulty: " + yamlQuote(piece.difficulty));
    lines.push("    icon: " + yamlQuote(piece.icon));
    lines.push("    why_i_like_it: " + yamlBlock(piece.why_i_like_it, 6));
    lines.push("    image: " + yamlQuote(piece.image));
    lines.push("    vault_path: " + yamlQuote(piece.vault_path));
    lines.push("");
  });
  lines.push("# Private. Empty until Practice-Log notes are baked from the vault.");
  if (!data.practice_log.length) {
    lines.push("practice_log: []");
  } else {
    lines.push("practice_log:");
    data.practice_log.forEach(function (entry) {
      lines.push("  - date: " + yamlQuote(entry.date));
      lines.push("    minutes: " + entry.minutes);
      lines.push("    piece: " + yamlQuote(entry.piece));
      lines.push("    note: " + yamlQuote(entry.note));
      lines.push("    vault_path: " + yamlQuote(entry.vault_path));
    });
  }
  lines.push("");
  lines.push("# Private. Empty until Recordings notes (and audio) are baked from the vault.");
  if (!data.recordings.length) {
    lines.push("recordings: []");
  } else {
    lines.push("recordings:");
    data.recordings.forEach(function (entry) {
      lines.push("  - id: " + yamlQuote(entry.id));
      lines.push("    date: " + yamlQuote(entry.date));
      lines.push("    title: " + yamlQuote(entry.title));
      lines.push("    duration: " + yamlQuote(entry.duration));
      lines.push("    piece: " + yamlQuote(entry.piece));
      lines.push("    piece_id: " + yamlQuote(entry.piece_id));
      lines.push("    minutes: " + entry.minutes);
      lines.push("    focus: " + yamlBlock(entry.focus, 6));
      lines.push("    audio: " + yamlQuote(entry.audio));
      lines.push("    vault_path: " + yamlQuote(entry.vault_path));
    });
  }
  lines.push("");
  lines.push("# Private. Empty until Teacher-Notes are baked from the vault.");
  if (!data.teacher_notes.length) {
    lines.push("teacher_notes: []");
  } else {
    lines.push("teacher_notes:");
    data.teacher_notes.forEach(function (entry) {
      lines.push("  - date: " + yamlQuote(entry.date));
      lines.push("    from: " + yamlQuote(entry.from));
      lines.push("    body: " + yamlBlock(entry.body, 6));
      lines.push("    vault_path: " + yamlQuote(entry.vault_path));
    });
  }
  lines.push("");
  return lines.join("\n");
}

async function bake(vaultDir) {
  const piecesDir = path.join(vaultDir, PATHS.pieces);
  const logDir = path.join(vaultDir, PATHS.practice_log);
  const recDir = path.join(vaultDir, PATHS.recordings);
  const notesDir = path.join(vaultDir, PATHS.teacher_notes);
  const mocPath = path.join(vaultDir, PATHS.moc);

  const pieceFiles = await listMarkdown(piecesDir);
  const logFiles = await listMarkdown(logDir);
  const recFiles = await listMarkdown(recDir);
  const noteFiles = await listMarkdown(notesDir);
  let mocExists = false;
  try {
    await fs.access(mocPath);
    mocExists = true;
  } catch (err) {
    mocExists = false;
  }

  const pieces = [];
  for (const file of pieceFiles) {
    pieces.push(pieceFromNote(await readNote(file), vaultDir));
  }

  const practice_log = [];
  for (const file of logFiles) {
    const entry = logFromNote(await readNote(file), vaultDir);
    if (entry) {
      practice_log.push(entry);
    }
  }
  practice_log.sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  const recordings = [];
  for (const file of recFiles) {
    recordings.push(recordingFromNote(await readNote(file), vaultDir));
  }

  const teacher_notes = [];
  for (const file of noteFiles) {
    teacher_notes.push(teacherFromNote(await readNote(file), vaultDir));
  }

  const progress = deriveProgress(practice_log);
  const usedPlaceholders = pieces.length === 0;
  return {
    pieces: usedPlaceholders ? PLACEHOLDER_PIECES : pieces,
    practice_log: practice_log,
    recordings: recordings,
    teacher_notes: teacher_notes,
    streak_days: progress.streak_days,
    weeks: progress.weeks,
    baked_from: usedPlaceholders ? "empty-vault" : "vault",
    baked_note: usedPlaceholders
      ? "Vault folders were empty or missing Pieces notes. Private lists are empty. Three public piece names are placeholders until Pieces notes are baked."
      : "Baked from " +
        VAULT_ROOT +
        (mocExists ? " (MOC present)" : " (MOC missing)") +
        ".",
    counts: {
      pieces: pieces.length,
      practice_log: practice_log.length,
      recordings: recordings.length,
      teacher_notes: teacher_notes.length,
      moc: mocExists
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args[0] === "--list";
  const vaultDir = path.resolve(listOnly ? args[1] : args[0] || "");
  if (!vaultDir || vaultDir === process.cwd()) {
    usage();
  }
  const data = await bake(vaultDir);
  if (listOnly) {
    console.log(JSON.stringify({ vault: PATHS, counts: data.counts, progress: { streak_days: data.streak_days, weeks: data.weeks } }, null, 2));
    return;
  }
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, renderYaml(data));
  console.log("Wrote " + path.relative(ROOT, OUT));
  console.log(
    "pieces=" +
      data.pieces.length +
      (data.baked_from === "empty-vault" ? " (placeholders)" : "") +
      " logs=" +
      data.practice_log.length +
      " recordings=" +
      data.recordings.length +
      " teacher_notes=" +
      data.teacher_notes.length +
      " streak=" +
      data.streak_days +
      " weeks=" +
      data.weeks
  );
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
if (isMain) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
