(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function showUnlocked() {
    var gate = el("admin-gate");
    var panel = el("admin-panel");
    if (gate) {
      gate.hidden = true;
    }
    if (panel) {
      panel.hidden = false;
    }
  }

  function showLocked(unconfigured) {
    var gate = el("admin-gate");
    var panel = el("admin-panel");
    var form = el("admin-gate-form");
    var status = el("admin-gate-status");
    var error = el("admin-gate-error");
    if (panel) {
      panel.hidden = true;
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

  function init() {
    var api = window.SiteAdmin;
    if (!api || !api.isConfigured()) {
      showLocked(true);
      return;
    }

    if (api.isUnlocked()) {
      showUnlocked();
    } else {
      showLocked(false);
    }

    var form = el("admin-gate-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = el("admin-password");
        var error = el("admin-gate-error");
        var button = form.querySelector("button[type='submit']");
        if (button) {
          button.disabled = true;
          button.textContent = "Unlocking…";
        }
        api.tryUnlock(input ? input.value : "").then(function (result) {
          if (button) {
            button.disabled = false;
            button.textContent = "Unlock";
          }
          if (result.unconfigured) {
            showLocked(true);
            return;
          }
          if (!result.ok) {
            if (error) {
              error.hidden = false;
              error.textContent = "That password is not correct.";
            }
            if (input) {
              input.value = "";
              input.focus();
            }
            return;
          }
          if (input) {
            input.value = "";
          }
          showUnlocked();
        });
      });
    }

    var lockBtn = el("admin-lock");
    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        api.lock();
        showLocked(false);
      });
    }
    if (typeof api.onChange === "function") {
      api.onChange(function (unlocked) {
        if (unlocked) {
          showUnlocked();
        } else {
          showLocked(false);
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
