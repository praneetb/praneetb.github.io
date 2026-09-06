#!/usr/bin/env node
/**
 * Bake Obsidian patent note into site YAML.
 *
 *   node scripts/bake-patents.mjs /path/to/obsidian-vault
 *   node scripts/bake-patents.mjs --list /path/to/obsidian-vault
 *   node scripts/bake-patents.mjs --check
 *
 * Reads (daily sync path, sibling of bake-violin):
 *   10-Work/Reference/Patents.md
 *
 * LOCKED list (same six as live /patents/ plaques): five Cisco issued +
 * one abandoned Aruba/HPE. Do not add or invent patents. Formal titles,
 * numbers, dates, assignees, and status come only from that note.
 * Editorial problem / punch / stuck lines are keyed by patent id and
 * applied only when that id is already in the locked set.
 *
 * Writes:
 *   _data/plaques.yml   (/patents/ cards + home tile)
 *   _data/patents.yml   (resume list)
 *   _data/issued.yml    (issued grants only)
 *
 * Does not write assets/notes.enc.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT_NOTE = "10-Work/Reference/Patents.md";
const NOTE_CANDIDATES = [
  VAULT_NOTE,
  "10-Work/Reference/patents.md",
  "Reference/Patents.md"
];

const OUT = {
  plaques: path.join(ROOT, "_data", "plaques.yml"),
  patents: path.join(ROOT, "_data", "patents.yml"),
  issued: path.join(ROOT, "_data", "issued.yml")
};

const INVENTOR = "Praneet Bachheti";

/**
 * Editorial copy for known vault ids only. Not a patent list — the vault
 * note is the source of truth for what exists.
 */
const OPINIONS = {
  US6901079B1: {
    problem: "Point-to-point sessions shared the pipe, and the loud ones ruined it for everyone.",
    punch: "Per-session QoS so each PPP session gets what it actually needs.",
    roast: "Fairness is a policy, not a prayer.",
    stuck: "Made broadband feel less like a shouting match and more like a schedule.",
    finish: "gold"
  },
  US7068645B1: {
    problem: "Tunnels were pipes, but every pipe was treated like it deserved the same pressure.",
    punch: "Different service levels for flows inside tunnels—finally.",
    roast: "Not every packet is going to the same party.",
    stuck: "Let tunnels carry voice, video, and email without pretending they're equal.",
    finish: "brass"
  },
  US7107360B1: {
    problem: "Every private network wanted out, but the Internet wasn't ready for that many addresses.",
    punch: "NAT hides the crowd behind one public face.",
    roast: "Your home router's overachieving cousin.",
    stuck: "Saved IPv4 exhaustion and became the quiet backbone of every home and office gateway.",
    finish: "gold"
  },
  US7586940B1: {
    problem: "NAT works great—until you have to forward packets back through the gateway.",
    punch: "Stateful forwarding rules so replies actually find their way home.",
    roast: "Because \"it worked in my lab\" isn't a forwarding strategy.",
    stuck: "Made NAT stateful and reliable at scale, not just a one-way trick.",
    finish: "steel"
  },
  US7986703B2: {
    problem: "One trick needed another trick, and then another, and the code started to show it.",
    punch: "Refined the NAT continuation so the tricks could keep stacking cleanly.",
    roast: "The software equivalent of \"I'll fix it in the next commit, I swear.\"",
    stuck: "Kept the house of NAT cards standing a little longer.",
    finish: "gold"
  },
  US20140204763A1: {
    problem: "Data knew where it wanted to go, but the network kept guessing the best route.",
    punch: "Smarter routing decisions before the packets leave the building.",
    roast: "Routing by vibes is not a product strategy.",
    stuck: "Application 2014, not issued — an idea that ran into the real world.",
    finish: "application"
  }
};

function usage() {
  console.error("Usage: node scripts/bake-patents.mjs /path/to/obsidian-vault");
  console.error("       node scripts/bake-patents.mjs --list /path/to/obsidian-vault");
  console.error("       node scripts/bake-patents.mjs --check");
  process.exit(1);
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

function section(body, heading) {
  const re = new RegExp("^##\\s+" + heading + "\\s*$", "im");
  const start = String(body || "").search(re);
  if (start === -1) {
    return "";
  }
  const after = String(body || "")
    .slice(start)
    .split(/\r?\n/)
    .slice(1);
  const lines = [];
  for (let i = 0; i < after.length; i += 1) {
    if (/^##\s+/.test(after[i])) {
      break;
    }
    lines.push(after[i]);
  }
  return lines.join("\n").trim();
}

function patentId(number) {
  return String(number || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseGoogleLinks(body) {
  const links = {};
  const re = /\[([A-Z0-9]+)\]\((https:\/\/patents\.google\.com\/patent\/[A-Z0-9]+(?:\/en)?)\)/g;
  let match;
  while ((match = re.exec(String(body || "")))) {
    links[match[1]] = match[2];
  }
  return links;
}

function splitRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(function (cell) {
      return cell.trim();
    });
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}/.test(line);
}

function parseIsoDate(value) {
  const text = String(value || "");
  const pub = text.match(/Pub(?:lished)?\s+(\d{4}-\d{2}-\d{2})/i);
  if (pub) {
    return pub[1];
  }
  const filed = text.match(/Filed\s+(\d{4}-\d{2}-\d{2})/i);
  if (filed) {
    return filed[1];
  }
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

function parseFiledDate(value) {
  const match = String(value || "").match(/Filed\s+(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : "";
}

function assigneeShort(assignee) {
  const text = String(assignee || "").trim();
  if (/aruba/i.test(text) && /hpe/i.test(text)) {
    return "Aruba/HPE";
  }
  if (/cisco/i.test(text)) {
    return "Cisco";
  }
  return text.replace(/,?\s*Inc\.?$/i, "").replace(/\s*\/\s*/g, "/");
}

function googleUrl(id, links) {
  if (links[id]) {
    return links[id];
  }
  return "https://patents.google.com/patent/" + id + "/en";
}

function parseTable(block, kind, links) {
  const lines = String(block || "")
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  const headers = splitRow(lines[0]).map(function (name) {
    return name.toLowerCase();
  });
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (isSeparator(lines[i]) || !lines[i].includes("|")) {
      continue;
    }
    const cells = splitRow(lines[i]);
    const row = {};
    headers.forEach(function (header, idx) {
      row[header] = cells[idx] || "";
    });
    const number = row.number || "";
    const id = patentId(number);
    if (!id) {
      continue;
    }
    const when = row.issued || row["filed / published"] || row.published || "";
    const vaultStatus = row.status || "";
    const abandoned = kind === "application" || /abandon/i.test(vaultStatus);
    const issued = !abandoned;
    const date = parseIsoDate(when);
    rows.push({
      id: id,
      number: number,
      title: row.title || "",
      assignee: row.assignee || "",
      assignee_short: assigneeShort(row.assignee || ""),
      inventors: row["co-inventors"] || "",
      vault_status: vaultStatus,
      status: abandoned ? "abandoned" : "issued",
      continuation: /continuation/i.test(vaultStatus),
      date: date,
      filed: parseFiledDate(when),
      year: date.slice(0, 4),
      url: googleUrl(id, links),
      kind: issued ? "issued" : "application"
    });
  }
  return rows;
}

export function parsePatentsNote(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const links = parseGoogleLinks(text);
  const issued = parseTable(section(text, "Issued"), "issued", links);
  const applications = parseTable(section(text, "Applications"), "application", links);
  return issued.concat(applications);
}

function withOpinions(row) {
  const opinion = OPINIONS[row.id] || {};
  return Object.assign({}, row, {
    problem: opinion.problem || "",
    punch: opinion.punch || "",
    roast: opinion.roast || "",
    stuck: opinion.stuck || "",
    finish: opinion.finish || (row.status === "abandoned" ? "application" : "gold")
  });
}

function renderPlaques(items) {
  const lines = [];
  lines.push("# Patents page — baked site data.");
  lines.push("# Daily sync path (source of truth):");
  lines.push("#   " + VAULT_NOTE);
  lines.push("#");
  lines.push("# Bake (does not invent patents; does not touch notes.enc.json):");
  lines.push("#   node scripts/bake-patents.mjs /path/to/obsidian-vault");
  lines.push("#");
  lines.push("# LOCKED: same six live /patents/ plaques. Do not add or invent.");
  lines.push("# Formal titles / numbers / dates / assignees / status come from the");
  lines.push("# vault note. Editorial problem / punch / stuck lines are keyed by");
  lines.push("# patent id in scripts/bake-patents.mjs.");
  lines.push("");
  lines.push("inventor: " + yamlQuote(INVENTOR));
  lines.push("vault:");
  lines.push("  note: " + VAULT_NOTE);
  lines.push("items:");
  items.forEach(function (item) {
    lines.push("  - id: " + item.id);
    lines.push("    number: " + yamlQuote(item.number));
    lines.push("    url: " + item.url);
    lines.push("    title: " + yamlQuote(item.title));
    lines.push("    assignee: " + yamlQuote(item.assignee));
    lines.push("    assignee_short: " + yamlQuote(item.assignee_short));
    lines.push("    inventors: " + yamlQuote(item.inventors));
    lines.push("    status: " + item.status);
    lines.push("    vault_status: " + yamlQuote(item.vault_status));
    lines.push("    continuation: " + (item.continuation ? "true" : "false"));
    lines.push("    date: " + yamlQuote(item.date));
    if (item.filed) {
      lines.push("    filed: " + yamlQuote(item.filed));
    }
    lines.push("    year: " + yamlQuote(item.year));
    lines.push("    finish: " + item.finish);
    lines.push("    problem: " + yamlQuote(item.problem));
    lines.push("    punch: " + yamlQuote(item.punch));
    lines.push("    roast: " + yamlQuote(item.roast));
    lines.push("    stuck: " + yamlQuote(item.stuck));
    lines.push("");
  });
  return lines.join("\n");
}

function renderPatents(items) {
  const lines = [];
  lines.push("# Resume patent list — baked from " + VAULT_NOTE);
  lines.push("# Formal titles only. Do not invent entries.");
  lines.push("");
  items.forEach(function (item) {
    lines.push("- title: " + yamlQuote(item.title));
    lines.push("  number: " + yamlQuote(item.number));
    lines.push("  url: " + item.url);
    lines.push("");
  });
  return lines.join("\n");
}

function renderIssued(items) {
  const lines = [];
  lines.push("# Issued U.S. patents only. Inventor on the grants: " + INVENTOR + ".");
  lines.push("# Applications do not appear here. Baked from " + VAULT_NOTE + ".");
  items
    .filter(function (item) {
      return item.status === "issued";
    })
    .forEach(function (item) {
      lines.push("- number: " + yamlQuote(item.number));
      lines.push("  url: " + item.url);
      lines.push("  title: " + yamlQuote(item.title));
      lines.push("  issued: " + yamlQuote(item.date));
      lines.push("  assignee: " + yamlQuote(item.assignee));
      lines.push("");
    });
  return lines.join("\n");
}

async function findNote(vaultDir) {
  for (const rel of NOTE_CANDIDATES) {
    const abs = path.join(vaultDir, rel);
    try {
      await fs.access(abs);
      return { rel: rel, abs: abs };
    } catch (err) {
      // try next
    }
  }
  throw new Error("Vault note not found. Looked for " + NOTE_CANDIDATES.join(", ") + " under " + vaultDir);
}

export async function bake(vaultDir) {
  const found = await findNote(vaultDir);
  const raw = await fs.readFile(found.abs, "utf8");
  const rows = parsePatentsNote(raw).map(withOpinions);
  if (!rows.length) {
    throw new Error("No patents parsed from " + found.rel);
  }
  assertVaultSet(rows);
  return {
    note: found.rel,
    items: rows,
    counts: {
      total: rows.length,
      issued: rows.filter(function (item) {
        return item.status === "issued";
      }).length,
      abandoned: rows.filter(function (item) {
        return item.status === "abandoned";
      }).length
    }
  };
}

async function writeYaml(data) {
  await fs.mkdir(path.dirname(OUT.plaques), { recursive: true });
  await fs.writeFile(OUT.plaques, renderPlaques(data.items));
  await fs.writeFile(OUT.patents, renderPatents(data.items));
  await fs.writeFile(OUT.issued, renderIssued(data.items));
}

// Locked against live /patents/ plaques + vault 10-Work/Reference/Patents.md.
const EXPECTED_IDS = [
  "US6901079B1",
  "US7068645B1",
  "US7107360B1",
  "US7586940B1",
  "US7986703B2",
  "US20140204763A1"
];

export function assertVaultSet(items) {
  const ids = items.map(function (item) {
    return item.id;
  });
  if (ids.length !== EXPECTED_IDS.length) {
    throw new Error("Expected " + EXPECTED_IDS.length + " vault patents, got " + ids.length + ": " + ids.join(", "));
  }
  EXPECTED_IDS.forEach(function (id, index) {
    if (ids[index] !== id) {
      throw new Error("Vault order mismatch at " + (index + 1) + ": expected " + id + ", got " + ids[index]);
    }
  });
}

async function checkBaked() {
  const raw = await fs.readFile(OUT.plaques, "utf8");
  const ids = [...raw.matchAll(/^\s+- id:\s+(\S+)/gm)].map(function (match) {
    return match[1];
  });
  assertVaultSet(ids.map(function (id) {
    return { id: id };
  }));
  console.log("plaques.yml has " + ids.length + " vault entries: " + ids.join(", "));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--check") {
    await checkBaked();
    return;
  }
  const listOnly = args[0] === "--list";
  const vaultDir = path.resolve(listOnly ? args[1] : args[0] || "");
  if (!vaultDir || vaultDir === process.cwd()) {
    usage();
  }
  const data = await bake(vaultDir);
  if (listOnly) {
    console.log(
      JSON.stringify(
        {
          vault: VAULT_NOTE,
          note: data.note,
          counts: data.counts,
          items: data.items.map(function (item) {
            return { id: item.id, number: item.number, title: item.title, status: item.status };
          })
        },
        null,
        2
      )
    );
    return;
  }
  await writeYaml(data);
  console.log("Wrote _data/plaques.yml, _data/patents.yml, _data/issued.yml");
  console.log(
    "items=" +
      data.counts.total +
      " issued=" +
      data.counts.issued +
      " abandoned=" +
      data.counts.abandoned +
      " from " +
      data.note
  );
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
if (isMain) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
