#!/usr/bin/env node
/**
 * Bake public-home peeks into _data/home.yml.
 *
 *   node scripts/bake-home.mjs /path/to/obsidian-vault
 *   node scripts/bake-home.mjs --from-site
 *   node scripts/bake-home.mjs --list /path/to/obsidian-vault
 *
 * Reads (daily sync path), when present:
 *   20-Personal/Travel/Countries Visited.md
 *   30-Knowledge/Recipes/  (named cocktail notes)
 *   30-Knowledge/Recipes/Kombucha & Salgam.md
 *   10-Work/Reference/Patents.md
 *   20-Personal/Bucket List.md
 *
 * Vault wins when the note exists and parses to real items.
 * Otherwise the matching live site _data file is used.
 * Never invents countries, recipes, patents, or bucket items.
 * Does not write assets/notes.enc.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_data", "home.yml");

const PATHS = {
  travel: "20-Personal/Travel/Countries Visited.md",
  recipes: "30-Knowledge/Recipes",
  fermentation: "30-Knowledge/Recipes/Kombucha & Salgam.md",
  patents: "10-Work/Reference/Patents.md",
  bucket: "20-Personal/Bucket List.md"
};

const TRAVEL_PEEK = ["India", "United States of America", "Italy", "Thailand", "Indonesia"];
const TRAVEL_SHORT = {
  "United States of America": "USA",
  "United Arab Emirates": "UAE"
};

const COCKTAIL_NOTES = [
  ["Old Fashioned", /old\s*fashioned/i],
  ["Mai Tai", /mai\s*tai/i],
  ["Rum Buck", /rum\s*buck/i],
  ["Long Island Iced Tea", /long\s*island/i],
  ["Sloe Gin Fizz", /sloe\s*gin\s*fizz/i]
];

function usage() {
  console.error("Usage: node scripts/bake-home.mjs /path/to/obsidian-vault");
  console.error("       node scripts/bake-home.mjs --from-site");
  console.error("       node scripts/bake-home.mjs --list /path/to/obsidian-vault");
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

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
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
  return entries
    .filter(function (entry) {
      return entry.isFile() && /\.md$/i.test(entry.name) && !entry.name.startsWith(".");
    })
    .map(function (entry) {
      return entry.name;
    })
    .sort();
}

function stripFrontmatter(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .trim();
}

function section(body, heading) {
  const re = new RegExp("^(#{2,3})\\s+" + heading + "\\s*$", "im");
  const match = String(body || "").match(re);
  if (!match) {
    return "";
  }
  const level = match[1].length;
  const start = match.index + match[0].length;
  const after = String(body || "").slice(start).split(/\r?\n/);
  const lines = [];
  const stop = new RegExp("^#{2," + level + "}\\s+");
  for (let i = 0; i < after.length; i += 1) {
    if (stop.test(after[i])) {
      break;
    }
    lines.push(after[i]);
  }
  return lines.join("\n").trim();
}

function bullets(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(function (line) {
      const match = line.match(/^\s*-\s+(.+?)\s*$/);
      return match ? match[1].replace(/\[\[|\]\]/g, "").replace(/\s+—.*$/, "").trim() : "";
    })
    .filter(Boolean)
    .filter(function (item) {
      return !/^_.*_$/.test(item) && !/^none\b/i.test(item);
    });
}

function displayCountry(name) {
  return TRAVEL_SHORT[name] || name;
}

function travelPeek(names) {
  const have = new Set(names);
  return TRAVEL_PEEK.filter(function (name) {
    return have.has(name);
  }).map(displayCountry);
}

function parseSimpleYamlList(raw, key) {
  const block = String(raw || "").split(new RegExp("^" + key + ":\\s*$", "m"))[1] || "";
  const items = [];
  let current = null;
  block.split(/\r?\n/).forEach(function (line) {
    if (/^[a-zA-Z]/.test(line)) {
      return;
    }
    const start = line.match(/^\s+-\s+(?:id:\s+)?(.+?)\s*$/);
    if (start && line.trim().startsWith("- ")) {
      if (current) {
        items.push(current);
      }
      current = { _first: start[1].replace(/^"|"$/g, "") };
      const named = line.match(/^\s+-\s+([a-z_]+):\s+(.+?)\s*$/);
      if (named) {
        current[named[1]] = named[2].replace(/^"|"$/g, "");
      }
      return;
    }
    const field = line.match(/^\s{2,}([a-z_]+):\s*(.*)$/);
    if (field && current) {
      current[field[1]] = field[2].replace(/^"|"$/g, "");
    }
  });
  if (current) {
    items.push(current);
  }
  return items;
}

function parseTravelYaml(raw) {
  const names = [];
  String(raw || "")
    .split(/\r?\n/)
    .forEach(function (line) {
      const match = line.match(/^\s+name:\s+(.+?)\s*$/);
      if (match) {
        names.push(match[1].replace(/^"|"$/g, ""));
      }
    });
  return names;
}

function parseCocktailYaml(raw) {
  return parseSimpleYamlList(raw, "items")
    .map(function (item) {
      return item.name || "";
    })
    .filter(Boolean);
}

function parseFermentYaml(raw) {
  const items = parseSimpleYamlList(raw, "items");
  const kombucha = items.find(function (item) {
    return item.id === "kombucha" || /kombucha/i.test(item.name || "");
  }) || items[0] || {};
  const ingredients = [];
  const block = String(raw || "").split(/- id: kombucha[\s\S]*?ingredients:\n/)[1] || "";
  block.split(/\r?\n/).forEach(function (line) {
    if (/^\s+-\s+amount:/.test(line)) {
      ingredients.push(line.replace(/^\s+-\s+amount:\s+/, "").trim());
    } else if (ingredients.length && /^\s+name:/.test(line)) {
      const amount = ingredients.pop();
      ingredients.push(amount + " " + line.replace(/^\s+name:\s+/, "").trim());
    } else if (/^\s+[a-z]+:/.test(line) && !/^\s+(amount|name|icon):/.test(line)) {
      if (line.match(/^\s{0,2}[a-z]/)) {
        return;
      }
    }
  });
  const clean = [];
  const kombuchaBlock = String(raw || "").split(/- id: kombucha\n/)[1] || "";
  const stop = kombuchaBlock.split(/\n  - id:/)[0] || kombuchaBlock;
  const pairs = [];
  let amount = "";
  stop.split(/\r?\n/).forEach(function (line) {
    const amt = line.match(/^\s+-\s+amount:\s+(.+?)\s*$/);
    const name = line.match(/^\s+name:\s+(.+?)\s*$/);
    if (amt) {
      amount = amt[1];
    } else if (name && amount) {
      pairs.push(amount + " " + name[1]);
      amount = "";
    }
  });
  return {
    title: kombucha.name || "Kombucha",
    peek: kombucha.subtitle || kombucha.meta || "Weekly brew · SCOBY",
    recipe: pairs,
    note: /Aniket Gawade/.test(raw) ? "Introduced by Aniket Gawade" : ""
  };
}

function parsePlaquesYaml(raw) {
  const items = parseSimpleYamlList(raw, "items");
  return items
    .map(function (item) {
      return {
        number: item.number || "",
        status: item.status || "issued"
      };
    })
    .filter(function (item) {
      return item.number;
    });
}

function parseBucketYaml(raw) {
  const items = parseSimpleYamlList(raw, "items");
  const done = items.find(function (item) {
    return item.id === "half-dome" || /half\s*dome/i.test(item.title || "");
  });
  const todo = items.find(function (item) {
    return item.id === "great-wall" || /great\s*wall/i.test(item.title || "");
  });
  return {
    done: done
      ? {
          id: done.id || "half-dome",
          title: done.title || "Half Dome",
          caption: done.caption || done.title || "Half Dome",
          photo: done.photo || "/assets/images/bucket/half-dome.jpg"
        }
      : null,
    todo: todo
      ? {
          id: todo.id || "great-wall",
          title: todo.title || "Great Wall of China",
          caption: todo.caption || todo.title || "Great Wall of China",
          photo: todo.photo || "/assets/images/bucket/great-wall.jpg"
        }
      : null
  };
}

function parseTravelNote(raw) {
  const body = stripFrontmatter(raw);
  const visited = section(body, "Visited") || body;
  return bullets(visited)
    .map(function (name) {
      return name.replace(/\s+\(.*\)$/, "");
    })
    .filter(Boolean);
}

function parseCocktailNotes(filenames) {
  return COCKTAIL_NOTES.filter(function (pair) {
    return filenames.some(function (name) {
      return pair[1].test(name);
    });
  }).map(function (pair) {
    return pair[0];
  });
}

function parseFermentNote(raw) {
  const body = stripFrontmatter(raw);
  const recipe = bullets(section(body, "Kombucha recipe"));
  const weekly = /almost every week|every week|weekly/i.test(body);
  return {
    title: "Kombucha",
    peek: weekly ? "Weekly brew · SCOBY" : "Kombucha · SCOBY",
    recipe: recipe,
    note: /Aniket Gawade/.test(body) ? "Introduced by Aniket Gawade" : ""
  };
}

function parsePatentTable(block, status) {
  return String(block || "")
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return /^\|/.test(line) && !/^\|\s*-+/.test(line) && !/^\|\s*Number\s*\|/i.test(line);
    })
    .map(function (line) {
      const cells = line.split("|").map(function (cell) {
        return cell.trim();
      }).filter(Boolean);
      const number = (cells[0] || "")
        .replace(/\s+B[12]$/i, "")
        .replace(/\s+A1$/i, "");
      return number ? { number: number, status: status } : null;
    })
    .filter(Boolean);
}

function parsePatentsNote(raw) {
  const body = stripFrontmatter(raw);
  const issued = parsePatentTable(section(body, "Issued"), "issued");
  const applications = parsePatentTable(section(body, "Applications"), "application");
  return issued.concat(applications);
}

function parseBucketNote(raw) {
  const body = stripFrontmatter(raw);
  const heights = section(body, "Heights");
  const wonders = section(body, "Seven Wonders");
  function firstBulletAfter(text, heading) {
    const chunk = section(text, heading) || "";
    return bullets(chunk)[0] || "";
  }
  const doneLine = firstBulletAfter(heights, "Done") || bullets(section(body, "Done"))[0] || "";
  const todoLine = firstBulletAfter(wonders, "Open") || bullets(section(body, "Open"))[0] || "";
  const doneTitle = doneLine.replace(/\s+·.*$/, "").trim();
  const todoTitle = todoLine.replace(/\s+—.*$/, "").replace(/\s+·.*$/, "").trim();
  return {
    done: doneTitle
      ? {
          id: /half\s*dome/i.test(doneTitle) ? "half-dome" : doneTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          title: doneTitle,
          caption: doneLine || doneTitle,
          photo: /half\s*dome/i.test(doneTitle) ? "/assets/images/bucket/half-dome.jpg" : ""
        }
      : null,
    todo: todoTitle
      ? {
          id: /great\s*wall/i.test(todoTitle) ? "great-wall" : todoTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          title: todoTitle,
          caption: todoTitle,
          photo: /great\s*wall/i.test(todoTitle) ? "/assets/images/bucket/great-wall.jpg" : ""
        }
      : null
  };
}

async function loadSite() {
  const [travel, cocktails, fermentation, plaques, bucket] = await Promise.all([
    readText(path.join(ROOT, "_data", "travel.yml")),
    readText(path.join(ROOT, "_data", "cocktails.yml")),
    readText(path.join(ROOT, "_data", "fermentation.yml")),
    readText(path.join(ROOT, "_data", "plaques.yml")),
    readText(path.join(ROOT, "_data", "bucket.yml"))
  ]);
  return {
    travel: parseTravelYaml(travel),
    cocktails: parseCocktailYaml(cocktails),
    fermentation: parseFermentYaml(fermentation),
    patents: parsePlaquesYaml(plaques),
    bucket: parseBucketYaml(bucket)
  };
}

async function loadVault(vaultDir) {
  const travelRaw = await readText(path.join(vaultDir, PATHS.travel));
  const fermentRaw = await readText(path.join(vaultDir, PATHS.fermentation));
  const patentsRaw = await readText(path.join(vaultDir, PATHS.patents));
  const bucketRaw = await readText(path.join(vaultDir, PATHS.bucket));
  const recipeFiles = await listMarkdown(path.join(vaultDir, PATHS.recipes));
  return {
    travel: travelRaw ? parseTravelNote(travelRaw) : [],
    cocktails: parseCocktailNotes(recipeFiles),
    fermentation: fermentRaw ? parseFermentNote(fermentRaw) : null,
    patents: patentsRaw ? parsePatentsNote(patentsRaw) : [],
    bucket: bucketRaw ? parseBucketNote(bucketRaw) : null,
    present: {
      travel: Boolean(travelRaw),
      recipes: recipeFiles.length > 0,
      fermentation: Boolean(fermentRaw),
      patents: Boolean(patentsRaw),
      bucket: Boolean(bucketRaw)
    }
  };
}

function hasItems(value) {
  if (!value) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value.done && value.todo) {
    return Boolean(value.done.title && value.todo.title);
  }
  if (value.title || value.peek) {
    return true;
  }
  return false;
}

function pick(vaultItems, siteItems, present) {
  if (present && hasItems(vaultItems)) {
    return { value: vaultItems, source: "vault" };
  }
  return { value: siteItems, source: "site" };
}

function render(data) {
  const lines = [];
  lines.push("# Public home peeks. Baked by scripts/bake-home.mjs.");
  lines.push("# Vault is source of truth when the note exists. Otherwise the live site");
  lines.push("# _data files below. Do not invent countries, recipes, patents, or bucket items.");
  lines.push("#");
  lines.push("# Daily sync:");
  lines.push("#   node scripts/bake-home.mjs /path/to/obsidian-vault");
  lines.push("#   node scripts/bake-home.mjs --from-site");
  lines.push("#   node scripts/bake-home.mjs --list /path/to/obsidian-vault");
  lines.push("#");
  lines.push("# Does not write assets/notes.enc.json.");
  lines.push("");
  lines.push("vault:");
  lines.push("  travel: " + PATHS.travel);
  lines.push("  recipes: " + PATHS.recipes);
  lines.push("  fermentation: " + PATHS.fermentation);
  lines.push("  patents: " + PATHS.patents);
  lines.push("  bucket: " + PATHS.bucket);
  lines.push("");
  lines.push("baked_from: " + yamlQuote(data.baked_from));
  lines.push("baked_note: " + yamlBlock(data.baked_note, 2));
  lines.push("");
  lines.push("sources:");
  lines.push("  travel: " + data.sources.travel);
  lines.push("  bar: site");
  lines.push("  cocktails: " + data.sources.cocktails);
  lines.push("  fermentation: " + data.sources.fermentation);
  lines.push("  patents: " + data.sources.patents);
  lines.push("  bucket: " + data.sources.bucket);
  lines.push("");
  lines.push("travel:");
  lines.push("  peek:");
  data.travel.peek.forEach(function (name) {
    lines.push("    - " + yamlQuote(name));
  });
  lines.push("  count: " + data.travel.count);
  lines.push("");
  lines.push("bar:");
  lines.push("  peek:");
  lines.push("    - Whiskey");
  lines.push("    - Wine");
  lines.push("    - Beer");
  lines.push("    - Tequila");
  lines.push("");
  lines.push("cocktails:");
  lines.push("  peek:");
  data.cocktails.peek.forEach(function (name) {
    lines.push("    - " + yamlQuote(name));
  });
  lines.push("");
  lines.push("fermentation:");
  lines.push("  title: " + yamlQuote(data.fermentation.title));
  lines.push("  peek: " + yamlQuote(data.fermentation.peek));
  if ((data.fermentation.recipe || []).length) {
    lines.push("  recipe:");
    data.fermentation.recipe.forEach(function (item) {
      lines.push("    - " + yamlQuote(item));
    });
  } else {
    lines.push("  recipe: []");
  }
  lines.push("  note: " + yamlQuote(data.fermentation.note || ""));
  lines.push("");
  lines.push("patents:");
  lines.push("  issued: " + data.patents.issued);
  lines.push("  applications: " + data.patents.applications);
  lines.push("  items:");
  data.patents.items.forEach(function (item) {
    lines.push("    - number: " + yamlQuote(item.number));
    lines.push("      status: " + yamlQuote(item.status));
  });
  lines.push("");
  lines.push("bucket:");
  lines.push("  done:");
  lines.push("    id: " + yamlQuote(data.bucket.done.id));
  lines.push("    title: " + yamlQuote(data.bucket.done.title));
  lines.push("    caption: " + yamlQuote(data.bucket.done.caption));
  lines.push("    photo: " + yamlQuote(data.bucket.done.photo));
  lines.push("  todo:");
  lines.push("    id: " + yamlQuote(data.bucket.todo.id));
  lines.push("    title: " + yamlQuote(data.bucket.todo.title));
  lines.push("    caption: " + yamlQuote(data.bucket.todo.caption));
  lines.push("    photo: " + yamlQuote(data.bucket.todo.photo));
  lines.push("");
  return lines.join("\n");
}

async function bake(vaultDir, fromSite) {
  const site = await loadSite();
  const vault = vaultDir && !fromSite ? await loadVault(vaultDir) : { present: {} };
  const travel = pick(vault.travel, site.travel, vault.present && vault.present.travel);
  const cocktails = pick(vault.cocktails, site.cocktails, vault.present && vault.present.recipes);
  const fermentation = pick(vault.fermentation, site.fermentation, vault.present && vault.present.fermentation);
  const patents = pick(vault.patents, site.patents, vault.present && vault.present.patents);
  const bucket = pick(vault.bucket, site.bucket, vault.present && vault.present.bucket);

  const travelNames = travel.value || [];
  const ferment = fermentation.value || { title: "Kombucha", peek: "Weekly brew · SCOBY", recipe: [], note: "" };
  const patentItems = patents.value || [];
  const bucketValue = bucket.value || { done: null, todo: null };

  if (!travelNames.length) {
    throw new Error("No travel countries from vault or _data/travel.yml");
  }
  if (!(cocktails.value || []).length) {
    throw new Error("No cocktail names from vault or _data/cocktails.yml");
  }
  if (!patentItems.length) {
    throw new Error("No patents from vault or _data/plaques.yml");
  }
  if (!bucketValue.done || !bucketValue.todo) {
    throw new Error("Need Half Dome + Great Wall from vault or _data/bucket.yml");
  }

  const sources = {
    travel: travel.source,
    cocktails: cocktails.source,
    fermentation: fermentation.source,
    patents: patents.source,
    bucket: bucket.source
  };
  const vaultCount = Object.values(sources).filter(function (src) {
    return src === "vault";
  }).length;

  return {
    baked_from: fromSite ? "site" : vaultCount ? "vault" : "site",
    baked_note: fromSite
      ? "Baked from live site _data because --from-site was passed."
      : vaultCount
        ? "Vault notes used where present; missing notes fell back to live site _data."
        : "Vault notes were missing. Peeks baked from live site _data.",
    sources: sources,
    travel: {
      peek: travelPeek(travelNames),
      count: travelNames.length
    },
    cocktails: {
      peek: cocktails.value
    },
    fermentation: {
      title: ferment.title || "Kombucha",
      peek: /weekly/i.test(ferment.peek || "") ? "Weekly brew · SCOBY" : ferment.peek || "Weekly brew · SCOBY",
      recipe: ferment.recipe || [],
      note: ferment.note || ""
    },
    patents: {
      issued: patentItems.filter(function (item) {
        return item.status === "issued";
      }).length,
      applications: patentItems.filter(function (item) {
        return item.status !== "issued";
      }).length,
      items: patentItems
    },
    bucket: bucketValue
  };
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args[0] === "--list";
  const fromSite = args[0] === "--from-site";
  const vaultDir = fromSite ? "" : path.resolve(listOnly ? args[1] : args[0] || "");
  if (!fromSite && (!vaultDir || vaultDir === process.cwd())) {
    usage();
  }
  if (!fromSite) {
    try {
      await fs.access(vaultDir);
    } catch (err) {
      console.error("Vault path not found: " + vaultDir);
      process.exit(1);
    }
  }
  const data = await bake(fromSite ? "" : vaultDir, fromSite);
  if (listOnly) {
    console.log(
      JSON.stringify(
        {
          vault: PATHS,
          sources: data.sources,
          travel: data.travel,
          cocktails: data.cocktails,
          fermentation: data.fermentation,
          patents: { issued: data.patents.issued, applications: data.patents.applications, numbers: data.patents.items.map(function (item) { return item.number; }) },
          bucket: { done: data.bucket.done.title, todo: data.bucket.todo.title }
        },
        null,
        2
      )
    );
    return;
  }
  await fs.writeFile(OUT, render(data));
  console.log(
    "Wrote _data/home.yml from " +
      data.baked_from +
      " (travel=" +
      data.sources.travel +
      ", cocktails=" +
      data.sources.cocktails +
      ", fermentation=" +
      data.sources.fermentation +
      ", patents=" +
      data.sources.patents +
      ", bucket=" +
      data.sources.bucket +
      ")"
  );
}

main().catch(function (err) {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
