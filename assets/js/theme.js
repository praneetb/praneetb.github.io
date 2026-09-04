(function () {
  "use strict";

  var KEY = "site.theme";
  var THEMES = ["summit", "atlas", "cadence"];
  var DEFAULT = "summit";

  function readStored() {
    try {
      var stored = localStorage.getItem(KEY);
      if (THEMES.indexOf(stored) !== -1) {
        return stored;
      }
    } catch (err) {}
    return DEFAULT;
  }

  function currentTheme() {
    var value = document.documentElement.getAttribute("data-theme");
    return THEMES.indexOf(value) !== -1 ? value : readStored();
  }

  function syncButtons(theme) {
    var buttons = document.querySelectorAll("[data-theme-value]");
    for (var i = 0; i < buttons.length; i += 1) {
      var on = buttons[i].getAttribute("data-theme-value") === theme;
      buttons[i].setAttribute("aria-checked", on ? "true" : "false");
    }
  }

  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      return;
    }
    var color = getComputedStyle(document.documentElement).getPropertyValue("--theme-color").trim();
    if (color) {
      meta.setAttribute("content", color);
    }
  }

  function apply(theme) {
    if (THEMES.indexOf(theme) === -1) {
      theme = DEFAULT;
    }
    document.documentElement.setAttribute("data-theme", theme);
    syncButtons(theme);
    syncThemeColor();
    try {
      document.dispatchEvent(new CustomEvent("site:theme", { detail: { theme: theme } }));
    } catch (err) {}
  }

  function set(theme) {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (err) {}
  }

  function focusTheme(theme) {
    var btn = document.querySelector('[data-theme-value="' + theme + '"]');
    if (btn) {
      btn.focus();
    }
  }

  function onKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    var current = currentTheme();
    var index = THEMES.indexOf(current);
    if (event.key === "ArrowLeft") {
      index = (index + THEMES.length - 1) % THEMES.length;
    } else if (event.key === "ArrowRight") {
      index = (index + 1) % THEMES.length;
    } else if (event.key === "Home") {
      index = 0;
    } else {
      index = THEMES.length - 1;
    }
    event.preventDefault();
    set(THEMES[index]);
    focusTheme(THEMES[index]);
  }

  function init() {
    apply(readStored());
    var group = document.querySelector(".theme-switch");
    if (!group) {
      return;
    }
    group.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-theme-value]");
      if (!btn) {
        return;
      }
      set(btn.getAttribute("data-theme-value"));
    });
    group.addEventListener("keydown", onKeydown);
  }

  window.SiteTheme = {
    apply: apply,
    set: set,
    read: readStored
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
