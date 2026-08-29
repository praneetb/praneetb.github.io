(function (global) {
  "use strict";

  // SHA-256 hex digest only. Never store a plaintext password in this repository.
  const PASSWORD_SHA256_HEX =
    "87968969ff9ab03ad208bc716a6aa54b938f6aed679a380916f167fe29ae0cca";
  const ADMIN_KEY = "site.admin";
  const ROSE_KEY = "rose.gate.unlocked";
  const PLACEHOLDERS = new Set([
    "",
    "unset",
    "todo",
    "changeme",
    "placeholder",
    "none"
  ]);

  var listeners = [];

  function isConfigured(hex) {
    var value = String(hex || "").trim();
    if (!value || PLACEHOLDERS.has(value.toLowerCase())) {
      return false;
    }
    return /^[0-9a-f]{64}$/i.test(value);
  }

  async function sha256Hex(text) {
    var encoded = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function hexEqual(left, right) {
    var a = String(left).toLowerCase();
    var b = String(right).toLowerCase();
    if (a.length !== b.length) {
      return false;
    }
    var diff = 0;
    var i;
    for (i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function notify(unlocked) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(unlocked);
      } catch (err) {
        // Listener errors must not break the gate.
      }
    });
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(ADMIN_KEY) === ADMIN_KEY;
    } catch (err) {
      return false;
    }
  }

  function unlock() {
    try {
      sessionStorage.setItem(ADMIN_KEY, ADMIN_KEY);
      sessionStorage.setItem(ROSE_KEY, ROSE_KEY);
    } catch (err) {
      // Unlock still lasts for this visit if sessionStorage is blocked.
    }
    notify(true);
  }

  function lock() {
    try {
      sessionStorage.removeItem(ADMIN_KEY);
      sessionStorage.removeItem(ROSE_KEY);
    } catch (err) {
      // Ignore storage errors when leaving admin.
    }
    notify(false);
  }

  async function tryUnlock(password) {
    if (!isConfigured(PASSWORD_SHA256_HEX)) {
      return { ok: false, unconfigured: true };
    }
    if (!password) {
      return { ok: false };
    }
    var digest = await sha256Hex(password);
    if (!hexEqual(digest, PASSWORD_SHA256_HEX)) {
      return { ok: false };
    }
    unlock();
    return { ok: true };
  }

  function onChange(fn) {
    if (typeof fn === "function") {
      listeners.push(fn);
    }
  }

  global.SiteAdmin = {
    PASSWORD_SHA256_HEX: PASSWORD_SHA256_HEX,
    ADMIN_KEY: ADMIN_KEY,
    isConfigured: function () {
      return isConfigured(PASSWORD_SHA256_HEX);
    },
    sha256Hex: sha256Hex,
    hexEqual: hexEqual,
    isUnlocked: isUnlocked,
    unlock: unlock,
    lock: lock,
    tryUnlock: tryUnlock,
    onChange: onChange
  };
})(window);
