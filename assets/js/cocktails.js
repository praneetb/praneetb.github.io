(function () {
  "use strict";

  var NOTES_KEY = "site.cocktailNotes";
  var data = { filters: [], items: [] };
  var activeId = "";
  var methodFilter = "all";
  var query = "";

  function $(id) {
    return document.getElementById(id);
  }

  function withBase(path) {
    if (!path) {
      return "";
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    var base = (document.documentElement.getAttribute("data-baseurl") || "").replace(/\/$/, "");
    return path.charAt(0) === "/" ? base + path : path;
  }

  function readData() {
    var node = $("cocktails-data");
    if (!node) {
      return;
    }
    try {
      data = JSON.parse(node.textContent || "{}");
    } catch (err) {
      data = { filters: [], items: [] };
    }
    if (!data.items) {
      data.items = [];
    }
  }

  function findDrink(id) {
    for (var i = 0; i < data.items.length; i += 1) {
      if (data.items[i].id === id) {
        return data.items[i];
      }
    }
    return data.items[0] || null;
  }

  function readNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  function writeNote(id, value) {
    var all = readNotes();
    if (value) {
      all[id] = value;
    } else {
      delete all[id];
    }
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    } catch (err) {}
  }

  function videoSources(drink) {
    var raw = drink && drink.video;
    if (!raw) {
      return [];
    }
    if (typeof raw === "string") {
      return raw.trim() ? [raw.trim()] : [];
    }
    if (Object.prototype.toString.call(raw) === "[object Array]") {
      return raw.filter(function (item) {
        return item && String(item).trim();
      });
    }
    return [];
  }

  function sourceType(src) {
    if (/\.webm(\?|$)/i.test(src)) {
      return "video/webm";
    }
    if (/\.ogg(\?|$)/i.test(src) || /\.ogv(\?|$)/i.test(src)) {
      return "video/ogg";
    }
    return "video/mp4";
  }

  function matches(drink) {
    if (methodFilter !== "all" && drink.method !== methodFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    var hay = [drink.name, drink.method, drink.subtitle, drink.glass, drink.method_text, drink.source]
      .concat(drink.tags || [])
      .concat((drink.ingredients || []).map(function (line) {
        return (line.amount || "") + " " + (line.name || "");
      }))
      .join(" ")
      .toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function requestedId() {
    var params = new URLSearchParams(location.search);
    var fromQuery = params.get("drink") || params.get("id");
    if (fromQuery) {
      return fromQuery;
    }
    if (location.hash && location.hash.length > 1) {
      return decodeURIComponent(location.hash.slice(1));
    }
    return "";
  }

  function syncUrl(id, replace) {
    var url = new URL(location.href);
    url.searchParams.set("drink", id);
    url.hash = "";
    if (replace) {
      history.replaceState({ drink: id }, "", url);
    } else {
      history.pushState({ drink: id }, "", url);
    }
  }

  function renderList() {
    var buttons = document.querySelectorAll("[data-cocktail]");
    var visible = 0;
    for (var i = 0; i < buttons.length; i += 1) {
      var id = buttons[i].getAttribute("data-cocktail");
      var drink = findDrink(id);
      var show = !!(drink && matches(drink));
      var row = buttons[i].closest("li");
      if (row) {
        row.hidden = !show;
      }
      buttons[i].classList.toggle("is-active", id === activeId);
      buttons[i].setAttribute("aria-current", id === activeId ? "true" : "false");
      if (show) {
        visible += 1;
      }
    }
    var empty = $("cocktails-empty");
    if (empty) {
      empty.hidden = visible > 0;
    }
  }

  function fillList(id, html) {
    var node = $(id);
    if (node) {
      node.innerHTML = html;
    }
  }

  function setText(id, value) {
    var node = $(id);
    if (node) {
      node.textContent = value || "";
    }
  }

  function renderMedia(drink) {
    var frame = $("cocktails-video");
    var player = $("cocktails-player");
    var poster = $("cocktails-poster");
    var empty = $("cocktails-video-empty");
    var tag = $("cocktails-video-tag");
    var play = $("cocktails-play");
    var sources = videoSources(drink);
    var posterSrc = drink.poster ? withBase(String(drink.poster).trim()) : "";

    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.innerHTML = "";
      player.hidden = true;
    }
    if (poster) {
      poster.hidden = true;
      poster.removeAttribute("src");
    }
    if (empty) {
      empty.hidden = true;
    }
    if (tag) {
      tag.hidden = false;
    }
    if (frame) {
      frame.setAttribute("data-empty", sources.length ? "false" : "true");
    }

    if (sources.length && player) {
      sources.forEach(function (src) {
        var node = document.createElement("source");
        node.src = withBase(src);
        node.type = sourceType(src);
        player.appendChild(node);
      });
      if (posterSrc) {
        player.setAttribute("poster", posterSrc);
      } else {
        player.removeAttribute("poster");
      }
      player.hidden = false;
      player.load();
      if (play) {
        play.disabled = false;
      }
      return;
    }

    if (posterSrc && poster) {
      poster.src = posterSrc;
      poster.alt = drink.name || "";
      poster.hidden = false;
    }
    if (empty) {
      empty.hidden = false;
    }
    if (play) {
      play.disabled = true;
    }
  }

  function renderDetail(drink) {
    if (!drink) {
      return;
    }
    setText("cocktails-name", drink.name);
    setText("cocktails-glass-text", drink.glass);
    setText("cocktails-method", drink.method_text || (drink.steps || []).join(" "));
    setText("cocktails-source-text", drink.source || "Obsidian Recipes");
    fillList(
      "cocktails-ingredients",
      (drink.ingredients || []).map(function (line) {
        return "<li><span>" + escapeHtml(line.amount || "") + "</span> " + escapeHtml(line.name || "") + "</li>";
      }).join("")
    );
    renderMedia(drink);
    var notes = $("cocktail-notes");
    if (notes) {
      notes.value = readNotes()[drink.id] || "";
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function selectDrink(id, push) {
    var drink = findDrink(id);
    if (!drink) {
      return;
    }
    activeId = drink.id;
    renderList();
    renderDetail(drink);
    syncUrl(drink.id, !push);
  }

  function firstVisibleId() {
    for (var i = 0; i < data.items.length; i += 1) {
      if (matches(data.items[i])) {
        return data.items[i].id;
      }
    }
    return "";
  }

  function applyFilter(next) {
    methodFilter = next || "all";
    var chips = document.querySelectorAll("[data-filter]");
    for (var i = 0; i < chips.length; i += 1) {
      var on = chips[i].getAttribute("data-filter") === methodFilter;
      chips[i].classList.toggle("is-active", on);
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    renderList();
    var current = findDrink(activeId);
    if (!current || !matches(current)) {
      var fallback = firstVisibleId();
      if (fallback) {
        selectDrink(fallback, false);
      }
    }
  }

  function markShortcut() {
    var key = document.querySelector(".cocktails-search-key");
    if (!key) {
      return;
    }
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    key.textContent = mac ? "⌘K" : "Ctrl K";
  }

  function init() {
    readData();
    if (!data.items.length) {
      return;
    }
    markShortcut();
    var start = requestedId();
    var drink = findDrink(start) || data.items[0];
    activeId = drink.id;
    renderList();
    renderDetail(drink);
    syncUrl(drink.id, true);

    var list = $("cocktails-list");
    if (list) {
      list.addEventListener("click", function (event) {
        var button = event.target.closest("[data-cocktail]");
        if (button) {
          selectDrink(button.getAttribute("data-cocktail"), true);
        }
      });
    }

    var chips = document.querySelector(".cocktails-filters");
    if (chips) {
      chips.addEventListener("click", function (event) {
        var chip = event.target.closest("[data-filter]");
        if (chip) {
          applyFilter(chip.getAttribute("data-filter"));
        }
      });
    }

    var search = $("cocktails-search");
    if (search) {
      search.addEventListener("input", function () {
        query = (search.value || "").trim().toLowerCase();
        applyFilter(methodFilter);
      });
    }

    var notes = $("cocktail-notes");
    if (notes) {
      notes.addEventListener("input", function () {
        if (activeId) {
          writeNote(activeId, notes.value.trim());
        }
      });
    }

    var play = $("cocktails-play");
    var player = $("cocktails-player");
    if (play && player) {
      play.addEventListener("click", function () {
        if (play.disabled) {
          return;
        }
        player.hidden = false;
        player.play();
      });
    }

    document.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!search) {
          return;
        }
        event.preventDefault();
        search.focus();
      }
    });

    window.addEventListener("popstate", function () {
      var id = requestedId();
      if (id && id !== activeId) {
        var next = findDrink(id);
        if (next) {
          activeId = next.id;
          renderList();
          renderDetail(next);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
