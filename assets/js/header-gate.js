(function () {
  "use strict";

  var PRIVATE_LINKS = [
    { path: "/space/", label: "Home", match: /\/space\/?$/ },
    { path: "/travel/", label: "Travel", match: /\/travel\/?$/ },
    { path: "/media/", label: "Media", match: /\/media\/?$/ },
    { path: "/bucket-list/", label: "Bucket list", match: /\/bucket(-list)?\/?$/ },
    { path: "/rose/", label: "Rose", match: /\/rose\/?$/ },
    { path: "/notes/", label: "Notes", match: /\/notes\/?$/ }
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

  function currentPath() {
    return location.pathname.replace(/\/index\.html$/, "/");
  }

  function isHomePath() {
    var base = (document.documentElement.getAttribute("data-baseurl") || "").replace(/\/$/, "");
    var path = currentPath();
    return path === base + "/" || path === base || path === "/";
  }

  function applyChrome() {
    var unlocked = !!(api() && api().isUnlocked());
    var nav = el("site-private-nav");
    var signin = el("site-signin");
    var account = el("site-account");
    var welcome = el("welcome-strip");
    var wordmark = document.querySelector(".wordmark");
    document.documentElement.classList.toggle("is-signed-in", unlocked);
    document.body.classList.toggle("is-signed-in", unlocked);
    document.body.classList.toggle("is-site-admin", unlocked);
    if (nav) {
      nav.replaceChildren();
      if (unlocked) {
        PRIVATE_LINKS.forEach(function (item, index) {
          if (index) {
            var dot = document.createElement("span");
            dot.className = "nav-dot";
            dot.setAttribute("aria-hidden", "true");
            dot.textContent = "·";
            nav.appendChild(dot);
          }
          var link = document.createElement("a");
          link.href = withBase(item.path);
          link.textContent = item.label;
          if (item.match.test(currentPath()) || (item.path === "/space/" && currentPath().indexOf("/space") !== -1)) {
            link.setAttribute("aria-current", "page");
          }
          nav.appendChild(link);
        });
        nav.hidden = false;
      } else {
        nav.hidden = true;
      }
    }
    if (signin) {
      signin.hidden = unlocked;
    }
    if (account) {
      account.hidden = !unlocked;
    }
    if (welcome) {
      welcome.hidden = !unlocked;
    }
    if (wordmark) {
      wordmark.href = withBase(unlocked ? "/space/" : "/");
      if (unlocked && currentPath().indexOf("/space") !== -1) {
        wordmark.setAttribute("aria-current", "page");
      } else if (!unlocked && isHomePath()) {
        wordmark.setAttribute("aria-current", "page");
      } else {
        wordmark.removeAttribute("aria-current");
      }
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
    var user = el("site-admin-username");
    var pass = el("site-admin-password");
    var persist = el("site-admin-persist");
    setError("");
    if (user) {
      user.value = "";
    }
    if (pass) {
      pass.value = "";
    }
    if (persist) {
      persist.checked = false;
    }
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
    if (user) {
      user.focus();
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

  function afterLogin() {
    applyChrome();
    if (isHomePath()) {
      location.replace(withBase("/space/"));
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    var gate = api();
    var user = el("site-admin-username");
    var pass = el("site-admin-password");
    var persist = el("site-admin-persist");
    var form = el("site-admin-form");
    var button = form ? form.querySelector("button[type='submit']") : null;
    if (!gate) {
      setError("Wrong username or password");
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Signing in…";
    }
    gate.tryUnlock(
      user ? user.value : "",
      pass ? pass.value : "",
      !!(persist && persist.checked)
    ).then(function (result) {
      if (button) {
        button.disabled = false;
        button.textContent = "Sign in";
      }
      if (result.unconfigured) {
        setError("Wrong username or password");
        return;
      }
      if (!result.ok) {
        setError("Wrong username or password");
        if (pass) {
          pass.value = "";
          pass.focus();
        }
        return;
      }
      if (user) {
        user.value = "";
      }
      if (pass) {
        pass.value = "";
      }
      setError("");
      closeDialog();
      afterLogin();
    });
  }

  function onSignOut() {
    if (api()) {
      api().lock();
    }
    applyChrome();
    if (!isHomePath()) {
      location.assign(withBase("/"));
    }
  }

  function init() {
    applyChrome();
    var signin = el("site-signin");
    var signout = el("site-signout");
    var form = el("site-admin-form");
    var cancel = el("site-admin-cancel");
    var dialog = el("site-admin-dialog");
    if (signin) {
      signin.addEventListener("click", function () {
        openDialog();
      });
    }
    if (signout) {
      signout.addEventListener("click", onSignOut);
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
    document.addEventListener("click", function (event) {
      var target = event.target.closest("[data-open-signin]");
      if (target) {
        event.preventDefault();
        openDialog();
      }
    });
    document.addEventListener("site:signin", openDialog);
    if (api() && typeof api().setSignInHandler === "function") {
      api().setSignInHandler(openDialog);
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
