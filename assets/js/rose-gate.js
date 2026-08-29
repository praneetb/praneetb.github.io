(function () {
  "use strict";

  // SHA-256 hex digest only. Never store a plaintext password in this repository.
  const ROSE_PASSWORD_SHA256_HEX = "8008acfa5ceb750f4415ada831575bbfa9d989fefaffe17bc9cbc6da564f8d69";

  const SESSION_KEY = "rose.gate.unlocked";
  const PLACEHOLDERS = new Set([
    "",
    "unset",
    "todo",
    "changeme",
    "placeholder",
    "none"
  ]);

  function isConfigured(hex) {
    const value = String(hex || "").trim();
    if (!value || PLACEHOLDERS.has(value.toLowerCase())) {
      return false;
    }
    return /^[0-9a-f]{64}$/i.test(value);
  }

  async function sha256Hex(text) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function hexEqual(left, right) {
    const a = String(left).toLowerCase();
    const b = String(right).toLowerCase();
    if (a.length !== b.length) {
      return false;
    }
    var diff = 0;
    for (var i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function showDashboard() {
    var gate = el("rose-gate");
    var root = el("rose-dashboard-root");
    var template = el("rose-dashboard-template");
    if (!root || !template) {
      return;
    }
    if (!root.dataset.ready) {
      root.appendChild(template.content.cloneNode(true));
      root.dataset.ready = "1";
    }
    root.hidden = false;
    if (gate) {
      gate.hidden = true;
    }
  }

  function showLock(unconfigured) {
    var gate = el("rose-gate");
    var form = el("rose-gate-form");
    var status = el("rose-gate-status");
    var error = el("rose-gate-error");
    var root = el("rose-dashboard-root");
    if (root) {
      root.hidden = true;
      root.replaceChildren();
      delete root.dataset.ready;
    }
    if (gate) {
      gate.hidden = false;
    }
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    if (unconfigured) {
      if (status) {
        status.textContent = "This gate is not configured yet.";
      }
      if (form) {
        form.hidden = true;
      }
      return;
    }
    if (status) {
      status.textContent = "Enter the password to continue.";
    }
    if (form) {
      form.hidden = false;
    }
  }

  function stayLocked(message) {
    var error = el("rose-gate-error");
    var input = el("rose-password");
    var root = el("rose-dashboard-root");
    if (root) {
      root.hidden = true;
    }
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!isConfigured(ROSE_PASSWORD_SHA256_HEX)) {
      showLock(true);
      return;
    }
    var input = el("rose-password");
    var password = input ? input.value : "";
    if (!password) {
      stayLocked("That password is not correct.");
      return;
    }
    var digest = await sha256Hex(password);
    if (!hexEqual(digest, ROSE_PASSWORD_SHA256_HEX)) {
      stayLocked("That password is not correct.");
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, SESSION_KEY);
    } catch (err) {
      // Unlock still lasts for this visit if sessionStorage is blocked.
    }
    showDashboard();
  }

  function init() {
    var configured = isConfigured(ROSE_PASSWORD_SHA256_HEX);
    if (!configured) {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (err) {
        // Ignore storage errors on the unconfigured lock screen.
      }
      showLock(true);
      return;
    }

    var unlocked = false;
    try {
      unlocked = sessionStorage.getItem(SESSION_KEY) === SESSION_KEY;
    } catch (err) {
      unlocked = false;
    }

    if (unlocked) {
      showDashboard();
      return;
    }

    showLock(false);
    var form = el("rose-gate-form");
    if (form) {
      form.addEventListener("submit", onSubmit);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
