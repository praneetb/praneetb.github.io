(function (global) {
  "use strict";

  const ADMIN_KEY = "site.admin";
  const NOTES_KEY = "site.notes";
  const REPORTS_READY_KEY = "site.manyaReports";
  const REPORTS_DB_NAME = "site.manyaReports";
  const REPORTS_STORE = "pdfs";
  const REPORTS_DB_VERSION = 1;
  const LEGACY_ROSE_KEY = "rose.gate.unlocked";
  const LEGACY_LEDGER_KEY = "rose.ledger";

  var listeners = [];
  var notesEnvelopePromise = null;
  var reportsEnvelopePromise = null;
  var satPsatEnvelopePromise = null;
  var signInHandler = null;
  var reportsIndex = {};
  var reportsBlobs = {};
  var reportsUrls = {};
  var reportsHydratePromise = null;

  function notify(unlocked) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(unlocked);
      } catch (err) {
        // Listener errors must not break the gate.
      }
    });
  }

  function assetUrl(name) {
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].src || "";
      if (src.indexOf("site-admin.js") !== -1) {
        return new URL("../" + name, src).href;
      }
    }
    return "/assets/" + name;
  }

  function b64ToBytes(value) {
    var binary = atob(String(value || ""));
    var bytes = new Uint8Array(binary.length);
    var i;
    for (i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function b64ToBlob(value, mime) {
    var bytes = b64ToBytes(value);
    return new Blob([bytes], { type: mime || "application/pdf" });
  }

  function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    var diff = 0;
    var i;
    for (i = 0; i < a.length; i += 1) {
      diff |= a[i] ^ b[i];
    }
    return diff === 0;
  }

  function normalizeUsername(value) {
    return String(value || "").normalize("NFKC").trim().toLowerCase();
  }

  function loadJson(url) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("missing");
      }
      return response.json();
    });
  }

  function loadNotesEnvelope() {
    if (!notesEnvelopePromise) {
      notesEnvelopePromise = loadJson(assetUrl("notes.enc.json"));
    }
    return notesEnvelopePromise;
  }

  function loadReportsEnvelope() {
    if (!reportsEnvelopePromise) {
      reportsEnvelopePromise = loadJson(assetUrl("manya/reports.enc.json"));
    }
    return reportsEnvelopePromise;
  }

  function loadSatPsatEnvelope() {
    if (!satPsatEnvelopePromise) {
      satPsatEnvelopePromise = loadJson(assetUrl("manya/sat-psat.enc.json")).then(
        function (envelope) {
          return envelope;
        },
        function () {
          satPsatEnvelopePromise = Promise.resolve(null);
          return null;
        }
      );
    }
    return satPsatEnvelopePromise;
  }

  async function deriveAesKey(password, envelope) {
    var salt = b64ToBytes(envelope.salt);
    var material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: envelope.iter,
        salt: salt
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function verifyUsername(username, envelope) {
    var spec = envelope && envelope.user;
    if (!spec || spec.kdf !== "PBKDF2-SHA256" || !spec.iter || !spec.salt || !spec.hash) {
      return false;
    }
    var salt = b64ToBytes(spec.salt);
    var expected = b64ToBytes(spec.hash);
    var material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(normalizeUsername(username)),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    var bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: spec.iter,
        salt: salt
      },
      material,
      expected.length * 8
    );
    return timingSafeEqual(new Uint8Array(bits), expected);
  }

  async function decryptEnvelope(password, envelope) {
    if (!envelope || envelope.kdf !== "PBKDF2-SHA256" || !envelope.iter || !envelope.salt || !envelope.iv || !envelope.ct) {
      var err = new Error("unconfigured");
      err.name = "UnconfiguredError";
      throw err;
    }
    var key = await deriveAesKey(password, envelope);
    var iv = b64ToBytes(envelope.iv);
    var ct = b64ToBytes(envelope.ct);
    var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function emptyNotes() {
    return { v: 1, source: "obsidian", readonly: true, folders: [], collapsed: [], notes: [] };
  }

  async function decryptNotes(password) {
    var envelope = await loadNotesEnvelope();
    if (!envelope) {
      return emptyNotes();
    }
    var pack = await decryptEnvelope(password, envelope);
    if (!pack || !Array.isArray(pack.notes)) {
      return emptyNotes();
    }
    return pack;
  }

  function acceptedReportKind(kind) {
    return kind === "manya-reports" || kind === "manya-sat-psat";
  }

  async function decryptReportPack(password, envelope) {
    if (!envelope) {
      return null;
    }
    var pack = await decryptEnvelope(password, envelope);
    if (!pack || !Array.isArray(pack.reports)) {
      return null;
    }
    if (pack.kind && !acceptedReportKind(pack.kind)) {
      return null;
    }
    return pack;
  }

  async function decryptReports(password) {
    return decryptReportPack(password, await loadReportsEnvelope());
  }

  async function decryptSatPsat(password) {
    return decryptReportPack(password, await loadSatPsatEnvelope());
  }

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageRemove(store, key) {
    try {
      store.removeItem(key);
    } catch (err) {
      // Ignore storage errors when leaving a session.
    }
  }

  function storageSet(store, key, value) {
    store.setItem(key, value);
  }

  function isUnlocked() {
    return storageGet(ADMIN_KEY) === ADMIN_KEY;
  }

  function clearLegacyRose(store) {
    storageRemove(store, LEGACY_ROSE_KEY);
    storageRemove(store, LEGACY_LEDGER_KEY);
  }

  function getNotes() {
    var raw = storageGet(NOTES_KEY);
    if (!raw) {
      return emptyNotes();
    }
    try {
      var pack = JSON.parse(raw);
      if (!pack || !Array.isArray(pack.notes)) {
        return emptyNotes();
      }
      return pack;
    } catch (err) {
      return emptyNotes();
    }
  }

  function revokeReportUrls() {
    Object.keys(reportsUrls).forEach(function (id) {
      try {
        URL.revokeObjectURL(reportsUrls[id]);
      } catch (err) {
        // Revoke is best-effort.
      }
    });
    reportsUrls = {};
  }

  function resetReportsMemory() {
    revokeReportUrls();
    reportsIndex = {};
    reportsBlobs = {};
  }

  function rememberReport(row) {
    if (!row || !row.id) {
      return;
    }
    reportsIndex[row.id] = {
      id: row.id,
      filename: row.filename || row.id + ".pdf",
      title: row.title || row.filename || "Report",
      mime: row.mime || "application/pdf"
    };
    if (row.blob) {
      reportsBlobs[row.id] = row.blob;
    }
  }

  function mergePack(pack) {
    ((pack && pack.reports) || []).forEach(function (report) {
      if (!report || !report.id || !report.pdf_b64) {
        return;
      }
      rememberReport({
        id: String(report.id),
        filename: report.filename,
        title: report.title,
        mime: report.mime,
        blob: b64ToBlob(report.pdf_b64, report.mime || "application/pdf")
      });
    });
  }

  function indexFromPacks(packs) {
    resetReportsMemory();
    (packs || []).forEach(mergePack);
  }

  function openReportsDb() {
    if (!global.indexedDB) {
      return Promise.reject(new Error("no-idb"));
    }
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(REPORTS_DB_NAME, REPORTS_DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(REPORTS_STORE)) {
          db.createObjectStore(REPORTS_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("idb"));
      };
    });
  }

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  async function writeReportsToIdb() {
    var db = await openReportsDb();
    try {
      var tx = db.transaction(REPORTS_STORE, "readwrite");
      var store = tx.objectStore(REPORTS_STORE);
      store.clear();
      Object.keys(reportsIndex).forEach(function (id) {
        var meta = reportsIndex[id];
        var blob = reportsBlobs[id];
        if (!blob) {
          return;
        }
        store.put({
          id: id,
          filename: meta.filename,
          title: meta.title,
          mime: meta.mime,
          blob: blob
        });
      });
      await new Promise(function (resolve, reject) {
        tx.oncomplete = resolve;
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error("abort"));
        };
      });
    } finally {
      try {
        db.close();
      } catch (err) {
        // Ignore close errors.
      }
    }
  }

  async function clearReportsIdb() {
    if (!global.indexedDB) {
      return;
    }
    try {
      var db = await openReportsDb();
      try {
        var tx = db.transaction(REPORTS_STORE, "readwrite");
        tx.objectStore(REPORTS_STORE).clear();
        await new Promise(function (resolve, reject) {
          tx.oncomplete = resolve;
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      } finally {
        db.close();
      }
    } catch (err) {
      // Private mode or missing IDB should not break sign-out.
    }
  }

  async function hydrateReportsFromIdb() {
    var db = await openReportsDb();
    try {
      var tx = db.transaction(REPORTS_STORE, "readonly");
      var rows = await idbRequest(tx.objectStore(REPORTS_STORE).getAll());
      resetReportsMemory();
      (rows || []).forEach(function (row) {
        rememberReport(row);
      });
    } finally {
      db.close();
    }
  }

  async function mergeReportsFromIdb() {
    var db = await openReportsDb();
    try {
      var tx = db.transaction(REPORTS_STORE, "readonly");
      var rows = await idbRequest(tx.objectStore(REPORTS_STORE).getAll());
      (rows || []).forEach(function (row) {
        if (row && row.id && !reportsIndex[row.id]) {
          rememberReport(row);
        }
      });
    } finally {
      db.close();
    }
  }

  function persistReportsReady(persist) {
    try {
      storageSet(sessionStorage, REPORTS_READY_KEY, "1");
    } catch (err) {
      // Session flag is optional; IDB is the cache.
    }
    if (persist) {
      try {
        storageSet(localStorage, REPORTS_READY_KEY, "1");
      } catch (err) {
        // Persistent flag is optional.
      }
    } else {
      storageRemove(localStorage, REPORTS_READY_KEY);
    }
  }

  function clearReportsReady() {
    storageRemove(sessionStorage, REPORTS_READY_KEY);
    storageRemove(localStorage, REPORTS_READY_KEY);
  }

  async function clearReportsCache() {
    resetReportsMemory();
    clearReportsReady();
    reportsHydratePromise = null;
    await clearReportsIdb();
  }

  async function tryDecryptNamedPack(password, decryptFn, resetFn) {
    try {
      return await decryptFn(password);
    } catch (err) {
      if (resetFn && err && err.message === "missing") {
        resetFn();
      }
      return null;
    }
  }

  async function cacheManyaReports(password) {
    try {
      var reportsPack = await tryDecryptNamedPack(password, decryptReports, function () {
        reportsEnvelopePromise = null;
      });
      var satPack = await tryDecryptNamedPack(password, decryptSatPsat, function () {
        satPsatEnvelopePromise = null;
      });
      if (!reportsPack && !satPack) {
        await clearReportsCache();
        return false;
      }
      indexFromPacks([reportsPack, satPack]);
      if (!reportsPack || !satPack) {
        try {
          // Keep the other pack's existing IDB blobs if this unlock only
          // decrypted one envelope (SAT failure must not wipe school reports).
          await mergeReportsFromIdb();
        } catch (err) {
          // Memory still has whichever pack decrypted.
        }
      }
      try {
        await writeReportsToIdb();
        // Drop in-memory blobs after a successful IDB write so PDFs are not
        // kept twice. The small index stays in memory.
        reportsBlobs = {};
      } catch (err) {
        // Memory-only fallback for this visit; never write PDFs to localStorage.
      }
      return Object.keys(reportsIndex).length > 0;
    } catch (err) {
      resetReportsMemory();
      return false;
    }
  }

  function ensureReportsHydrated() {
    if (reportsHydratePromise) {
      return reportsHydratePromise;
    }
    reportsHydratePromise = (async function () {
      if (!isUnlocked()) {
        await clearReportsCache();
        return;
      }
      if (Object.keys(reportsIndex).length) {
        return;
      }
      try {
        await hydrateReportsFromIdb();
      } catch (err) {
        reportsIndex = {};
      }
    })();
    return reportsHydratePromise;
  }

  function hasManyaReports() {
    return isUnlocked() && Object.keys(reportsIndex).length > 0;
  }

  function needsManyaReportsUnlock() {
    return isUnlocked() && Object.keys(reportsIndex).length === 0;
  }

  async function needsManyaReport(id) {
    var key = String(id || "");
    if (!isUnlocked() || !key) {
      return false;
    }
    var blob = await getManyaReportBlob(key);
    return !blob;
  }

  function getManyaReportMeta(id) {
    var key = String(id || "");
    return reportsIndex[key] || null;
  }

  async function getManyaReportBlob(id) {
    var key = String(id || "");
    await ensureReportsHydrated();
    if (!isUnlocked() || !key) {
      return null;
    }
    if (reportsBlobs[key]) {
      return reportsBlobs[key];
    }
    try {
      var db = await openReportsDb();
      try {
        var tx = db.transaction(REPORTS_STORE, "readonly");
        var row = await idbRequest(tx.objectStore(REPORTS_STORE).get(key));
        if (row && row.blob) {
          rememberReport(row);
          return row.blob;
        }
      } finally {
        db.close();
      }
    } catch (err) {
      return reportsBlobs[key] || null;
    }
    return null;
  }

  async function getManyaReportUrl(id) {
    var key = String(id || "");
    if (reportsUrls[key]) {
      return reportsUrls[key];
    }
    var blob = await getManyaReportBlob(key);
    if (!blob) {
      return null;
    }
    reportsUrls[key] = URL.createObjectURL(blob);
    return reportsUrls[key];
  }

  function persistUnlock(notes, persist) {
    var notesPayload = JSON.stringify(notes || emptyNotes());
    try {
      storageSet(sessionStorage, ADMIN_KEY, ADMIN_KEY);
      storageSet(sessionStorage, NOTES_KEY, notesPayload);
      clearLegacyRose(sessionStorage);
    } catch (err) {
      try {
        storageSet(sessionStorage, ADMIN_KEY, ADMIN_KEY);
      } catch (ignored) {
        // Unlock still lasts for this visit if sessionStorage is blocked.
      }
    }
    if (persist) {
      try {
        storageSet(localStorage, ADMIN_KEY, ADMIN_KEY);
        storageSet(localStorage, NOTES_KEY, notesPayload);
        clearLegacyRose(localStorage);
      } catch (err) {
        // Session still works if persistent storage is blocked.
      }
    } else {
      storageRemove(localStorage, ADMIN_KEY);
      storageRemove(localStorage, NOTES_KEY);
      clearLegacyRose(localStorage);
    }
    persistReportsReady(persist);
    try {
      document.documentElement.classList.add("is-signed-in");
    } catch (err) {
      // Class toggle is cosmetic for gated pages.
    }
    notify(true);
  }

  function lock() {
    storageRemove(sessionStorage, ADMIN_KEY);
    storageRemove(sessionStorage, NOTES_KEY);
    clearLegacyRose(sessionStorage);
    storageRemove(localStorage, ADMIN_KEY);
    storageRemove(localStorage, NOTES_KEY);
    clearLegacyRose(localStorage);
    clearReportsReady();
    resetReportsMemory();
    reportsHydratePromise = null;
    clearReportsIdb();
    try {
      document.documentElement.classList.remove("is-signed-in");
    } catch (err) {
      // Class toggle is cosmetic for gated pages.
    }
    notify(false);
  }

  function forgetNotesEnvelope() {
    notesEnvelopePromise = null;
    reportsEnvelopePromise = null;
    satPsatEnvelopePromise = null;
  }

  function isUnconfiguredError(err) {
    return !!(err && (err.name === "UnconfiguredError" || err.message === "missing"));
  }

  async function tryUnlock(username, password, persist) {
    if (!username || !password) {
      return { ok: false };
    }
    try {
      var envelope = await loadNotesEnvelope();
      if (!envelope || !envelope.user) {
        forgetNotesEnvelope();
        var missing = new Error("unconfigured");
        missing.name = "UnconfiguredError";
        throw missing;
      }
      var userOk = await verifyUsername(username, envelope);
      var notes = emptyNotes();
      var decryptOk = false;
      try {
        notes = await decryptNotes(password);
        decryptOk = !!(notes && Array.isArray(notes.notes));
      } catch (err) {
        if (isUnconfiguredError(err)) {
          forgetNotesEnvelope();
          return { ok: false, unconfigured: true };
        }
        decryptOk = false;
      }
      if (!userOk || !decryptOk) {
        return { ok: false };
      }
      await cacheManyaReports(password);
      reportsHydratePromise = Promise.resolve();
      persistUnlock(notes, persist);
      return { ok: true, notes: notes };
    } catch (err) {
      forgetNotesEnvelope();
      if (isUnconfiguredError(err)) {
        return { ok: false, unconfigured: true };
      }
      return { ok: false };
    }
  }

  function onChange(fn) {
    if (typeof fn === "function") {
      listeners.push(fn);
    }
  }

  function requestSignIn() {
    if (typeof signInHandler === "function") {
      signInHandler();
      return;
    }
    document.dispatchEvent(new CustomEvent("site:signin"));
  }

  function setSignInHandler(fn) {
    signInHandler = typeof fn === "function" ? fn : null;
  }

  ensureReportsHydrated();

  global.SiteAdmin = {
    ADMIN_KEY: ADMIN_KEY,
    isConfigured: function () {
      return true;
    },
    isUnlocked: isUnlocked,
    getNotes: getNotes,
    lock: lock,
    tryUnlock: tryUnlock,
    onChange: onChange,
    requestSignIn: requestSignIn,
    setSignInHandler: setSignInHandler,
    getManyaReportBlob: getManyaReportBlob,
    getManyaReportUrl: getManyaReportUrl,
    getManyaReportMeta: getManyaReportMeta,
    hasManyaReports: hasManyaReports,
    needsManyaReportsUnlock: needsManyaReportsUnlock,
    needsManyaReport: needsManyaReport,
    awaitReportsReady: ensureReportsHydrated
  };
})(window);
