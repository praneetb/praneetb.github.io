(function (global) {
  "use strict";

  const ADMIN_KEY = "site.admin";
  const ROSE_KEY = "rose.gate.unlocked";
  const LEDGER_KEY = "rose.ledger";

  var listeners = [];
  var envelopePromise = null;
  var signInHandler = null;

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

  function getLedger() {
    var raw = storageGet(LEDGER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function persistUnlock(ledger, persist) {
    var payload = JSON.stringify(ledger);
    try {
      storageSet(sessionStorage, ADMIN_KEY, ADMIN_KEY);
      storageSet(sessionStorage, ROSE_KEY, ROSE_KEY);
      storageSet(sessionStorage, LEDGER_KEY, payload);
    } catch (err) {
      try {
        storageSet(sessionStorage, ADMIN_KEY, ADMIN_KEY);
        storageSet(sessionStorage, ROSE_KEY, ROSE_KEY);
      } catch (ignored) {
        // Unlock still lasts for this visit if sessionStorage is blocked.
      }
    }
    if (persist) {
      try {
        storageSet(localStorage, ADMIN_KEY, ADMIN_KEY);
        storageSet(localStorage, ROSE_KEY, ROSE_KEY);
        storageSet(localStorage, LEDGER_KEY, payload);
      } catch (err) {
        // Session still works if persistent storage is blocked.
      }
    } else {
      storageRemove(localStorage, ADMIN_KEY);
      storageRemove(localStorage, ROSE_KEY);
      storageRemove(localStorage, LEDGER_KEY);
    }
    try {
      document.documentElement.classList.add("is-signed-in");
    } catch (err) {
      // Class toggle is cosmetic for gated pages.
    }
    notify(true);
  }

  function lock() {
    storageRemove(sessionStorage, ADMIN_KEY);
    storageRemove(sessionStorage, ROSE_KEY);
    storageRemove(sessionStorage, LEDGER_KEY);
    storageRemove(localStorage, ADMIN_KEY);
    storageRemove(localStorage, ROSE_KEY);
    storageRemove(localStorage, LEDGER_KEY);
    try {
      document.documentElement.classList.remove("is-signed-in");
    } catch (err) {
      // Class toggle is cosmetic for gated pages.
    }
    notify(false);
  }

  async function tryUnlock(username, password, persist) {
    if (!username || !password) {
      return { ok: false };
    }
    try {
      var envelope = await loadEnvelope();
      if (!envelope || !envelope.user) {
        var missing = new Error("unconfigured");
        missing.name = "UnconfiguredError";
        throw missing;
      }
      var userOk = await verifyUsername(username, envelope);
      var ledger = null;
      var decryptOk = false;
      try {
        ledger = await decryptEnvelope(password);
        decryptOk = !!(ledger && typeof ledger === "object");
      } catch (err) {
        if (err && (err.name === "UnconfiguredError" || err.message === "missing")) {
          return { ok: false, unconfigured: true };
        }
        decryptOk = false;
      }
      if (!userOk || !decryptOk) {
        return { ok: false };
      }
      persistUnlock(ledger, persist);
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

  global.SiteAdmin = {
    ADMIN_KEY: ADMIN_KEY,
    isConfigured: function () {
      return true;
    },
    isUnlocked: isUnlocked,
    getLedger: getLedger,
    lock: lock,
    tryUnlock: tryUnlock,
    onChange: onChange,
    requestSignIn: requestSignIn,
    setSignInHandler: setSignInHandler
  };
})(window);
