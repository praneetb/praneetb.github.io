(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function isUnlocked() {
    var api = admin();
    if (api) {
      return api.isUnlocked();
    }
    try {
      return sessionStorage.getItem("rose.gate.unlocked") === "rose.gate.unlocked";
    } catch (err) {
      return false;
    }
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
      var lockBtn = el("rose-lock");
      if (lockBtn) {
        lockBtn.addEventListener("click", onLock);
      }
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

  function onLock() {
    var api = admin();
    if (api) {
      api.lock();
    } else {
      try {
        sessionStorage.removeItem("rose.gate.unlocked");
      } catch (err) {
        // Ignore storage errors when locking.
      }
    }
    showLock(false);
  }

  async function onSubmit(event) {
    event.preventDefault();
    var api = admin();
    if (!api) {
      stayLocked("This gate is not configured yet.");
      return;
    }
    if (!api.isConfigured()) {
      showLock(true);
      return;
    }
    var input = el("rose-password");
    var password = input ? input.value : "";
    var result = await api.tryUnlock(password);
    if (result.unconfigured) {
      showLock(true);
      return;
    }
    if (!result.ok) {
      stayLocked("That password is not correct.");
      return;
    }
    if (input) {
      input.value = "";
    }
    showDashboard();
  }

  function init() {
    var api = admin();
    var configured = api ? api.isConfigured() : false;
    if (!configured) {
      showLock(true);
      return;
    }

    if (isUnlocked()) {
      showDashboard();
    } else {
      showLock(false);
    }

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
