(function () {
  "use strict";

  var KEY = "site.theme";
  var THEMES = ["summit", "atlas", "cadence"];
  var NAMES = { summit: "Summit", atlas: "Atlas", cadence: "Cadence" };
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

  function themeName(theme) {
    return NAMES[theme] || NAMES[DEFAULT];
  }

  function menu() {
    return document.getElementById("theme-menu");
  }

  function toggle() {
    return document.getElementById("theme-switch-toggle");
  }

  function isOpen() {
    var node = menu();
    return !!(node && !node.hidden);
  }

  function closeMenu() {
    var node = menu();
    var btn = toggle();
    if (node) {
      node.hidden = true;
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function openMenu() {
    var node = menu();
    var btn = toggle();
    if (node) {
      node.hidden = false;
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
    }
  }

  function setOpen(next) {
    if (next) {
      openMenu();
    } else {
      closeMenu();
    }
  }

  function syncButtons(theme) {
    var buttons = document.querySelectorAll("[data-theme-value]");
    for (var i = 0; i < buttons.length; i += 1) {
      var on = buttons[i].getAttribute("data-theme-value") === theme;
      buttons[i].setAttribute("aria-checked", on ? "true" : "false");
    }
    var btn = toggle();
    var current = document.querySelector(".theme-switch-current");
    var swatch = document.querySelector(".theme-switch-toggle .theme-swatch");
    var name = themeName(theme);
    if (current) {
      current.textContent = name;
    }
    if (swatch) {
      swatch.setAttribute("data-theme-swatch", theme);
    }
    if (btn) {
      btn.setAttribute("aria-label", "Site theme, " + name);
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
    var keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape", "Enter", " "];
    if (keys.indexOf(event.key) === -1) {
      return;
    }
    if (event.key === "Escape") {
      if (isOpen()) {
        event.preventDefault();
        closeMenu();
        var btn = toggle();
        if (btn) {
          btn.focus();
        }
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target === toggle()) {
      event.preventDefault();
      setOpen(!isOpen());
      if (isOpen()) {
        focusTheme(currentTheme());
      }
      return;
    }
    if (event.key === "ArrowDown" && event.target === toggle() && !isOpen()) {
      event.preventDefault();
      openMenu();
      focusTheme(currentTheme());
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    var current = currentTheme();
    var index = THEMES.indexOf(current);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      index = (index + THEMES.length - 1) % THEMES.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      index = (index + 1) % THEMES.length;
    } else if (event.key === "Home") {
      index = 0;
    } else {
      index = THEMES.length - 1;
    }
    event.preventDefault();
    set(THEMES[index]);
    if (isOpen()) {
      focusTheme(THEMES[index]);
    }
  }

  function init() {
    apply(readStored());
    var group = document.querySelector(".theme-switch");
    if (!group) {
      return;
    }
    var btn = toggle();
    if (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!isOpen());
      });
    }
    group.addEventListener("click", function (event) {
      var option = event.target.closest("[data-theme-value]");
      if (!option) {
        return;
      }
      set(option.getAttribute("data-theme-value"));
      closeMenu();
      if (btn) {
        btn.focus();
      }
    });
    group.addEventListener("keydown", onKeydown);
    document.addEventListener("click", function (event) {
      if (!group.contains(event.target)) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
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
