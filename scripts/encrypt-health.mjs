#!/usr/bin/env node
/**
 * Publish a WHOOP / Thekedaar health snapshot as an encrypted pack.
 *
 *   NOTES_PASSWORD='…' node scripts/encrypt-health.mjs /path/to/health_snapshot.json
 *   NOTES_PASSWORD='…' node scripts/encrypt-health.mjs /path/to/health_snapshot.json --out assets/health/snapshot.enc.json
 *
 * Writes assets/health/snapshot.enc.json (ciphertext only). Never pass a
 * password as a committed flag and never check plaintext health JSON into
 * this repo.
 *
 * This envelope must NOT include a `user` verifier — site login stays on
 * notes.enc.json.
 */

import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "assets", "health", "snapshot.enc.json");
const ITER = 600000;
const KEY_LEN = 32;
const IV_LEN = 12;
const ALLOWED_SCHEMAS = new Set([
  "thekedaar_health_snapshot_v1",
  "thekedaar_health_snapshot_v1_1"
]);

function usage() {
  console.error(
    "Usage: NOTES_PASSWORD='…' node scripts/encrypt-health.mjs <snapshot.json> [--out outfile]"
  );
  process.exit(1);
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
  const args = { infile: "", outfile: DEFAULT_OUT };
  const rest = argv.slice(2);
  var i;
  for (i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--out") {
      args.outfile = path.resolve(rest[i + 1] || "");
      i += 1;
    } else if (!args.infile) {
      args.infile = path.resolve(token);
    } else {
      usage();
    }
  }
  return args;
}

async function loadSnapshot(infile) {
  const raw = JSON.parse(await fs.readFile(infile, "utf8"));
  if (!raw || typeof raw !== "object") {
    throw new Error("Snapshot is not a JSON object");
  }
  if (raw.schema && !ALLOWED_SCHEMAS.has(raw.schema)) {
    throw new Error(
      "Unexpected schema " +
        raw.schema +
        " (want one of " +
        Array.from(ALLOWED_SCHEMAS).join(", ") +
        ")"
    );
  }
  if (!raw.as_of || !Array.isArray(raw.days)) {
    throw new Error("Snapshot missing as_of / days");
  }
  return raw;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.infile) {
    usage();
  }
  const password = process.env.NOTES_PASSWORD || process.env.SITE_PASSWORD;
  if (!password) {
    usage();
  }
  const snapshot = await loadSnapshot(args.infile);
  const payload = {
    v: 1,
    kind: "health-snapshot",
    snapshot: snapshot
  };
  const envelope = encryptJson(password, payload);
  if (envelope.user) {
    delete envelope.user;
  }
  await fs.mkdir(path.dirname(args.outfile), { recursive: true });
  await fs.writeFile(args.outfile, JSON.stringify(envelope));
  console.log(
    "Wrote " +
      args.outfile +
      " (as_of " +
      snapshot.as_of +
      ", " +
      snapshot.days.length +
      " days). Ciphertext only; no user verifier; do not commit plaintext health JSON."
  );
}

export { encryptJson, loadSnapshot };

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
