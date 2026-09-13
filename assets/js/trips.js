(function () {
  "use strict";

  var PREVIEW_KEY = "site.trips.preview";

  function api() {
    return window.SiteAdmin || null;
  }

  function isUnlocked() {
    return !!(api() && api().isUnlocked());
  }

  function readPreview() {
    try {
      var raw = sessionStorage.getItem(PREVIEW_KEY) || localStorage.getItem(PREVIEW_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writePreview(map) {
    var payload = JSON.stringify(map || {});
    try {
      sessionStorage.setItem(PREVIEW_KEY, payload);
    } catch (err) {
      // Preview is optional.
    }
    try {
      if (localStorage.getItem("site.admin") === "site.admin") {
        localStorage.setItem(PREVIEW_KEY, payload);
      }
    } catch (err) {
      // Persistent preview is optional.
    }
  }

  function publishedFlag(node) {
    return !!(node && node.getAttribute("data-published") === "true");
  }

  function applyIndex() {
    var unlocked = isUnlocked();
    var cards = document.querySelectorAll("[data-trip-card]");
    var visible = 0;
    cards.forEach(function (card) {
      var published = card.getAttribute("data-public") === "true";
      var show = published || unlocked;
      card.hidden = !show;
      if (show) {
        visible += 1;
      }
    });
    var empty = document.getElementById("trips-empty");
    if (empty) {
      empty.hidden = visible > 0;
      empty.classList.toggle("is-shown", visible === 0);
      empty.textContent = unlocked
        ? "No trips in the scrapbook yet."
        : "No public trips in the scrapbook yet.";
    }
  }

  function applyPrivacy() {
    var unlocked = isUnlocked();
    var preview = readPreview();
    document.querySelectorAll("[data-trip-privacy]").forEach(function (panel) {
      var id = panel.getAttribute("data-trip-privacy");
      var published = publishedFlag(panel);
      var previewPublic = Object.prototype.hasOwnProperty.call(preview, id)
        ? preview[id] === true
        : published;
      var switchEl = panel.querySelector("[data-trip-toggle]");
      panel.hidden = !unlocked;
      if (switchEl) {
        switchEl.setAttribute("aria-checked", previewPublic ? "true" : "false");
      }
      var live = panel.querySelector("[data-trip-live]");
      if (live) {
        live.textContent = published ? "yes" : "no";
      }
      var root = panel.closest("[data-trip-card], .trip-detail");
      var badge = root ? root.querySelector("[data-trip-badge]") : null;
      if (badge) {
        badge.textContent = previewPublic ? "Public (preview)" : published ? "Public" : "Private";
        badge.classList.toggle("is-private", !previewPublic && !published);
      }
      if (root && root.hasAttribute("data-trip-card")) {
        root.classList.toggle("is-private", !previewPublic && !published);
      }
    });
  }

  function onToggle(event) {
    var button = event.target.closest("[data-trip-toggle]");
    if (!button || !isUnlocked()) {
      return;
    }
    var id = button.getAttribute("data-trip-toggle");
    var preview = readPreview();
    preview[id] = button.getAttribute("aria-checked") !== "true";
    writePreview(preview);
    applyPrivacy();
  }

  function init() {
    applyIndex();
    applyPrivacy();
    document.addEventListener("click", onToggle);
    if (api() && typeof api().onChange === "function") {
      api().onChange(function () {
        applyIndex();
        applyPrivacy();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
