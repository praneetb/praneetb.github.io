(function () {
  "use strict";

  var PRIVATE_LINKS = [
    { path: "/rose/", label: "Rose", match: /\/rose\/?$/ }
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function api() {
    return window.SiteAdmin || null;
  }

  function withBase(path) {
    var base = (document.documentElement.getAttribute("data-baseurl") || "").replace(/\/$/, "");
    return base + path;
  }

  function lockSvg(open) {
    if (open) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 7.8-1.2"/><rect x="6" y="11" width="12" height="9" rx="1.6"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="6" y="11" width="12" height="9" rx="1.6"/></svg>';
  }

  function applyChrome() {
    var unlocked = !!(api() && api().isUnlocked());
    var mount = el("site-nav-private");
    var button = el("site-admin-toggle");
    document.body.classList.toggle("is-site-admin", unlocked);
    if (mount) {
      mount.replaceChildren();
      if (unlocked) {
        PRIVATE_LINKS.forEach(function (item) {
          var link = document.createElement("a");
          link.href = withBase(item.path);
          link.textContent = item.label;
          if (item.match.test(location.pathname)) {
            link.setAttribute("aria-current", "page");
          }
          mount.appendChild(link);
        });
        mount.hidden = false;
      } else {
        mount.hidden = true;
      }
    }
    if (button) {
      button.innerHTML = lockSvg(unlocked);
      button.classList.toggle("is-unlocked", unlocked);
      button.setAttribute("aria-label", unlocked ? "Lock" : "Unlock");
      button.title = unlocked ? "Lock" : "";
    }
  }

  function setError(message) {
    var error = el("site-admin-error");
    if (!error) {
      return;
    }
    error.hidden = !message;
    error.textContent = message || "";
  }

  function openDialog() {
    var dialog = el("site-admin-dialog");
    var input = el("site-admin-password");
    setError("");
    if (input) {
      input.value = "";
    }
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
    if (input) {
      input.focus();
    }
  }

  function closeDialog() {
    var dialog = el("site-admin-dialog");
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    var gate = api();
    var input = el("site-admin-password");
    var form = el("site-admin-form");
    var button = form ? form.querySelector("button[type='submit']") : null;
    if (!gate) {
      setError("This gate is not configured yet.");
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Unlocking…";
    }
    gate.tryUnlock(input ? input.value : "").then(function (result) {
      if (button) {
        button.disabled = false;
        button.textContent = "Unlock";
      }
      if (result.unconfigured) {
        setError("This gate is not configured yet.");
        return;
      }
      if (!result.ok) {
        setError("That password is not correct.");
        if (input) {
          input.value = "";
          input.focus();
        }
        return;
      }
      if (input) {
        input.value = "";
      }
      setError("");
      closeDialog();
      applyChrome();
    });
  }

  function init() {
    applyChrome();
    var button = el("site-admin-toggle");
    var form = el("site-admin-form");
    var cancel = el("site-admin-cancel");
    var dialog = el("site-admin-dialog");
    if (button) {
      button.addEventListener("click", function () {
        if (api() && api().isUnlocked()) {
          api().lock();
          applyChrome();
          return;
        }
        openDialog();
      });
    }
    if (form) {
      form.addEventListener("submit", onSubmit);
    }
    if (cancel) {
      cancel.addEventListener("click", closeDialog);
    }
    if (dialog) {
      dialog.addEventListener("close", function () {
        setError("");
      });
    }
    if (api() && typeof api().onChange === "function") {
      api().onChange(function () {
        applyChrome();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
