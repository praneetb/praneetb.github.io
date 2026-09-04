#!/usr/bin/env node
/**
 * Build a static trivia table for /travel/.
 *
 *   node scripts/build-country-trivia.mjs
 *
 * Fetches structural fields from public country datasets (mledoze/countries
 * for languages, capital, currencies, and area; dr5hn countries-states-cities
 * for population and extra fallbacks), then merges hand-curated funFact and
 * alsoKnownFor from scripts/country-trivia-overlay.json.
 *
 * Writes assets/js/country-trivia.js. GitHub Pages loads that file; the live
 * APIs are not called at page load. REST Countries v3 is deprecated (v5 needs
 * an API key), so this script uses equivalent public dumps instead.
 *
 * Overlay keys are ISO 3166-1 alpha-2, matching assets/js/travel-data.js.
 * Optional overlay fields (capital, languages, currency, population, area,
 * continent, funFact, alsoKnownFor) override generated values.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRAVEL_DATA = path.join(ROOT, "assets", "js", "travel-data.js");
const OVERLAY_PATH = path.join(ROOT, "scripts", "country-trivia-overlay.json");
const OUT_PATH = path.join(ROOT, "assets", "js", "country-trivia.js");

const MLEDOZE_URL =
  "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json";
const DR5HN_URL =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json";

const CONTINENT_GROUPS = {
  Africa:
    "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW",
  Asia:
    "AE AF AM AZ BD BH BN BT CN CY GE ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MV MY NP OM PH PK QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
  Europe:
    "AD AL AT BA BE BG BY CH CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK",
  "North America":
    "AG BB BS BZ CA CR CU DM DO GD GL GT HN HT JM KN LC MX NI PA SV TT US VC",
  "South America": "AR BO BR CL CO EC GY PE PY SR UY VE",
  Oceania: "AU FJ FM KI MH NR NZ PG PW SB TO TV VU WS"
};

function continentByCode() {
  const map = {};
  Object.keys(CONTINENT_GROUPS).forEach(function (name) {
    CONTINENT_GROUPS[name].split(" ").forEach(function (code) {
      if (code) {
        map[code] = name;
      }
    });
  });
  return map;
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map(function (word) {
      if (!word) {
        return word;
      }
      if (word === word.toUpperCase() && word.length <= 3) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function joinList(items) {
  const list = (items || []).map(function (item) {
    return String(item || "").trim();
  }).filter(Boolean);
  if (!list.length) {
    return "";
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return list[0] + " & " + list[1];
  }
  return list.slice(0, -1).join(", ") + " & " + list[list.length - 1];
}

function formatPopulation(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }
  if (value >= 1e9) {
    const scaled = value / 1e9;
    const rounded = scaled >= 10 ? String(Math.round(scaled)) : (Math.round(scaled * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return "~" + rounded + " billion";
  }
  if (value >= 1e6) {
    const scaled = value / 1e6;
    const rounded = scaled >= 10 ? String(Math.round(scaled)) : (Math.round(scaled * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return "~" + rounded + " million";
  }
  return Math.round(value).toLocaleString("en-US");
}

function formatArea(km2) {
  const value = Number(km2);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  if (value >= 1e6) {
    const scaled = value / 1e6;
    const rounded = scaled >= 10 ? String(Math.round(scaled)) : (Math.round(scaled * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return rounded + " million km²";
  }
  if (value >= 100) {
    return Math.round(value).toLocaleString("en-US") + " km²";
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded) + " km²";
}

function formatLanguages(languages) {
  if (!languages || typeof languages !== "object") {
    return "";
  }
  const names = Object.keys(languages)
    .sort()
    .map(function (key) {
      return languages[key];
    })
    .filter(Boolean);
  if (names.length >= 8) {
    return names.length + " official languages";
  }
  return joinList(names.slice(0, 3));
}

function formatCurrency(currencies, fallback) {
  if (currencies && typeof currencies === "object") {
    const codes = Object.keys(currencies);
    if (codes.length) {
      const first = currencies[codes[0]] || {};
      const name = titleCase(first.name || "");
      const symbol = String(first.symbol || "").trim();
      if (name && symbol && symbol !== name) {
        return name + " (" + symbol + ")";
      }
      return name || symbol;
    }
  }
  if (fallback && fallback.currency_name) {
    const name = titleCase(fallback.currency_name);
    const symbol = String(fallback.currency_symbol || "").trim();
    if (name && symbol && symbol !== name) {
      return name + " (" + symbol + ")";
    }
    return name || symbol;
  }
  return "";
}

function parseIsoCodes(source) {
  const match = source.match(/global\.ISO_COUNTRY_NAMES = \{([\s\S]*?)\n  \};/);
  if (!match) {
    throw new Error("Could not parse ISO_COUNTRY_NAMES from travel-data.js");
  }
  const codes = [];
  const re = /^\s{4}([A-Z]{2}):/gm;
  let item;
  while ((item = re.exec(match[1]))) {
    codes.push(item[1]);
  }
  if (!codes.length) {
    throw new Error("No ISO codes found in travel-data.js");
  }
  return codes;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch " + url + " (" + response.status + ")");
  }
  return response.json();
}

function fallbackFunFact(name, subregion, continent) {
  if (subregion) {
    return name + " is a country in " + subregion + ".";
  }
  if (continent) {
    return name + " is in " + continent + ".";
  }
  return "";
}

async function main() {
  const [travelSource, overlayRaw, mledoze, dr5hn] = await Promise.all([
    readFile(TRAVEL_DATA, "utf8"),
    readFile(OVERLAY_PATH, "utf8"),
    fetchJson(MLEDOZE_URL),
    fetchJson(DR5HN_URL)
  ]);
  const codes = parseIsoCodes(travelSource);
  const overlay = JSON.parse(overlayRaw);
  const continents = continentByCode();
  const byMledoze = {};
  mledoze.forEach(function (row) {
    if (row && row.cca2) {
      byMledoze[String(row.cca2).toUpperCase()] = row;
    }
  });
  const byDr5hn = {};
  dr5hn.forEach(function (row) {
    if (row && row.iso2) {
      byDr5hn[String(row.iso2).toUpperCase()] = row;
    }
  });

  const trivia = {};
  const missing = [];
  let withFunFact = 0;
  let withKnownFor = 0;
  let overlayFunFact = 0;
  let fullSeven = 0;

  codes.forEach(function (code) {
    const geo = byMledoze[code] || {};
    const extra = byDr5hn[code] || {};
    const custom = overlay[code] || {};
    const name =
      (geo.name && geo.name.common) || extra.name || code;
    const capital = Array.isArray(geo.capital) && geo.capital.length
      ? joinList(geo.capital.slice(0, 3))
      : String(extra.capital || "").trim();
    const areaRaw = geo.area > 0 ? geo.area : extra.area_sq_km;
    const entry = {
      capital: capital,
      languages: formatLanguages(geo.languages),
      currency: formatCurrency(geo.currencies, extra),
      population: extra.population ? formatPopulation(extra.population) : "",
      area: formatArea(areaRaw),
      continent: continents[code] || extra.region || "",
      funFact: "",
      alsoKnownFor: []
    };

    Object.keys(custom).forEach(function (key) {
      if (key === "alsoKnownFor" && Array.isArray(custom[key])) {
        entry.alsoKnownFor = custom[key].map(function (tag) {
          return String(tag || "").trim();
        }).filter(Boolean);
        return;
      }
      if (custom[key] != null && String(custom[key]).trim()) {
        entry[key] = typeof custom[key] === "string" ? custom[key].trim() : custom[key];
      }
    });

    if (!entry.funFact) {
      entry.funFact = fallbackFunFact(name, extra.subregion || geo.subregion, entry.continent);
    }
    if (!entry.alsoKnownFor.length) {
      const tags = [extra.subregion || geo.subregion, entry.continent].filter(Boolean);
      entry.alsoKnownFor = tags.filter(function (tag, index) {
        return tags.indexOf(tag) === index;
      }).slice(0, 3);
    }

    const rows = [
      entry.capital,
      entry.languages,
      entry.currency,
      entry.population,
      entry.area,
      entry.funFact,
      entry.continent
    ];
    const filled = rows.filter(Boolean).length;
    if (filled < 5) {
      missing.push(code + " (" + filled + " fields)");
    }
    if (entry.funFact) {
      withFunFact += 1;
    }
    if (entry.alsoKnownFor.length) {
      withKnownFor += 1;
    }
    if (custom.funFact) {
      overlayFunFact += 1;
    }
    if (filled === 7) {
      fullSeven += 1;
    }

    trivia[code] = {
      capital: entry.capital,
      languages: entry.languages,
      currency: entry.currency,
      population: entry.population,
      area: entry.area,
      continent: entry.continent,
      funFact: entry.funFact,
      alsoKnownFor: entry.alsoKnownFor
    };
  });

  const overlayKeys = Object.keys(overlay);
  overlayKeys.forEach(function (key) {
    if (codes.indexOf(key) === -1) {
      console.warn("Overlay has unused ISO code:", key);
    }
  });

  const banner = [
    "/* Generated by scripts/build-country-trivia.mjs — do not edit by hand. */",
    "/* Regenerated: " + new Date().toISOString().slice(0, 10) + " */",
    "/* Coverage: " + codes.length + " ISO codes, " + fullSeven + " with all 7 trivia fields, " + overlayFunFact + " curated fun facts. */"
  ].join("\n");

  const body =
    banner +
    "\n(function (global) {\n  \"use strict\";\n  global.COUNTRY_TRIVIA = " +
    JSON.stringify(trivia, null, 2).replace(/^/gm, "  ").trim() +
    ";\n})(window);\n";

  await writeFile(OUT_PATH, body, "utf8");
  console.log("Wrote " + path.relative(ROOT, OUT_PATH));
  console.log(
    "ISO codes:",
    codes.length,
    "| overlay:",
    overlayKeys.length,
    "| full 7-row:",
    fullSeven,
    "| curated fun facts:",
    overlayFunFact,
    "| any fun fact:",
    withFunFact,
    "| alsoKnownFor:",
    withKnownFor
  );
  if (missing.length) {
    console.log("Sparse entries:", missing.join(", "));
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
