(function (global) {
  "use strict";

  const ADMIN_KEY = "site.admin";
  const ROSE_KEY = "rose.gate.unlocked";
  const LEDGER_KEY = "rose.ledger";

  var listeners = [];
  var envelopePromise = null;

  function notify(unlocked) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(unlocked);
      } catch (err) {
        // Listener errors must not break the gate.
      }
    });
  }

  function envelopeUrl() {
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].src || "";
      if (src.indexOf("site-admin.js") !== -1) {
        return new URL("../rose.enc.json", src).href;
      }
    }
    return "/assets/rose.enc.json";
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

  function loadEnvelope() {
    if (!envelopePromise) {
      envelopePromise = fetch(envelopeUrl(), { credentials: "same-origin" }).then(function (response) {
        if (!response.ok) {
          throw new Error("missing");
        }
        return response.json();
      });
    }
    return envelopePromise;
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

  async function decryptEnvelope(password) {
    var envelope = await loadEnvelope();
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

  function readStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function isUnlocked() {
    return readStorage(ADMIN_KEY) === ADMIN_KEY;
  }

  function getLedger() {
    var raw = readStorage(LEDGER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function persistUnlock(ledger) {
    try {
      sessionStorage.setItem(ADMIN_KEY, ADMIN_KEY);
      sessionStorage.setItem(ROSE_KEY, ROSE_KEY);
      sessionStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch (err) {
      try {
        sessionStorage.setItem(ADMIN_KEY, ADMIN_KEY);
        sessionStorage.setItem(ROSE_KEY, ROSE_KEY);
      } catch (ignored) {
        // Unlock still lasts for this visit if sessionStorage is blocked.
      }
    }
    notify(true);
  }

  function lock() {
    try {
      sessionStorage.removeItem(ADMIN_KEY);
      sessionStorage.removeItem(ROSE_KEY);
      sessionStorage.removeItem(LEDGER_KEY);
    } catch (err) {
      // Ignore storage errors when leaving admin.
    }
    notify(false);
  }

  async function tryUnlock(password) {
    if (!password) {
      return { ok: false };
    }
    try {
      var ledger = await decryptEnvelope(password);
      if (!ledger || typeof ledger !== "object") {
        return { ok: false };
      }
      persistUnlock(ledger);
      return { ok: true, ledger: ledger };
    } catch (err) {
      if (err && (err.name === "UnconfiguredError" || err.message === "missing")) {
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

  global.SiteAdmin = {
    ADMIN_KEY: ADMIN_KEY,
    isConfigured: function () {
      return true;
    },
    isUnlocked: isUnlocked,
    getLedger: getLedger,
    lock: lock,
    tryUnlock: tryUnlock,
    onChange: onChange
  };
})(window);
