(function () {
  "use strict";

  var RATE_KEY = "site.bar.ratings";
  var LEGACY_RATE_KEY = "site.whiskey.ratings";
  var TAB_IDS = { whiskey: true, wine: true, beer: true };
  var TRANSITION_MS = 520;
  var POUR_MS = 1450;

  var payload = { shelves: [], tabs: [], catalogs: {} };
  var ratings = {};
  var activeTab = "whiskey";
  var selectedKey = "";
  var pourTimer = null;
  var transitioning = false;

  function $(id) {
    return document.getElementById(id);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function loadPayload() {
    var node = $("bar-data");
    if (!node) {
      return;
    }
    try {
      payload = JSON.parse(node.textContent || "{}") || payload;
    } catch (err) {
      payload = { shelves: [], tabs: [], catalogs: {} };
    }
    payload.shelves = payload.shelves || [];
    payload.tabs = payload.tabs || [];
    payload.catalogs = payload.catalogs || {};
  }

  function loadRatings() {
    var current = {};
    var legacy = {};
    try {
      current = JSON.parse(localStorage.getItem(RATE_KEY) || "{}") || {};
    } catch (err) {
      current = {};
    }
    try {
      legacy = JSON.parse(localStorage.getItem(LEGACY_RATE_KEY) || "{}") || {};
    } catch (err) {
      legacy = {};
    }
    ratings = current;
    Object.keys(legacy).forEach(function (id) {
      if (!ratings[id]) {
        ratings[id] = legacy[id];
      }
    });
  }

  function saveRatings() {
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify(ratings));
    } catch (err) {}
  }

  function tabMeta(id) {
    var list = payload.tabs || [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return { id: id, glass: "tumbler", pour: "amber", caption: "" };
  }

  function bottlesFor(tab) {
    return (payload.catalogs && payload.catalogs[tab]) || [];
  }

  function bottleById(tab, id) {
    return bottlesFor(tab).find(function (item) {
      return item.id === id;
    });
  }

  function slotEl(tab, id) {
    return document.querySelector('.bar-pane[data-tab="' + tab + '"] .bar-slot[data-id="' + id + '"]');
  }

  function query() {
    var input = $("bar-search");
    return input ? String(input.value || "").trim().toLowerCase() : "";
  }

  function matches(bottle, q) {
    if (!q) {
      return true;
    }
    var hay = [bottle.name, bottle.brand, bottle.producer, bottle.brewery, bottle.region, bottle.type, bottle.style, bottle.occasion]
      .concat(bottle.tags || [])
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function readTabFromLocation() {
    var params = new URLSearchParams(window.location.search);
    var tab = String(params.get("tab") || "").toLowerCase();
    return TAB_IDS[tab] ? tab : "whiskey";
  }

  function writeTabToLocation(tab) {
    var url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  function applySearch() {
    var q = query();
    var shown = 0;
    var pane = document.querySelector('.bar-pane[data-tab="' + activeTab + '"]');
    if (!pane) {
      return;
    }
    payload.shelves.forEach(function (shelf) {
      var section = pane.querySelector('.bar-shelf[data-shelf="' + shelf.id + '"]');
      if (!section) {
        return;
      }
      var visible = 0;
      section.querySelectorAll(".bar-slot").forEach(function (slot) {
        var bottle = bottleById(activeTab, slot.getAttribute("data-id"));
        var on = !!(bottle && matches(bottle, q));
        slot.hidden = !on;
        if (on) {
          visible += 1;
          shown += 1;
        }
      });
      section.hidden = visible === 0;
    });
    var empty = $("bar-empty");
    if (empty) {
      empty.hidden = shown !== 0;
    }
  }

  function paintShelfStars(id) {
    document.querySelectorAll('[data-stars-for="' + id + '"]').forEach(function (mark) {
      var value = ratings[id] || 0;
      if (!value) {
        mark.hidden = true;
        mark.textContent = "";
        return;
      }
      mark.hidden = false;
      mark.textContent = "★★★★★".slice(0, value);
    });
  }

  function setGlass(tab) {
    var meta = tabMeta(tab);
    var stage = $("bar-glass-stage");
    var caption = $("bar-glass-caption");
    var room = $("bar-room");
    if (room) {
      room.setAttribute("data-pour", meta.pour || "amber");
    }
    if (stage) {
      stage.setAttribute("data-glass", meta.glass || "tumbler");
      stage.setAttribute("data-pour", meta.pour || "amber");
      stage.classList.remove("is-pouring", "is-filled");
      stage.querySelectorAll(".bar-glass").forEach(function (glass) {
        glass.classList.toggle("is-on", glass.getAttribute("data-kind") === (meta.glass || "tumbler"));
      });
    }
    if (caption) {
      caption.textContent = meta.caption || "";
    }
    var stream = $("bar-stage-stream");
    if (stream) {
      stream.classList.remove("is-on");
      stream.style.cssText = "";
    }
  }

  function clearSelection() {
    selectedKey = "";
    if (pourTimer) {
      clearTimeout(pourTimer);
      pourTimer = null;
    }
    document.querySelectorAll(".bar-slot.is-selected, .bar-slot.is-pouring").forEach(function (slot) {
      slot.classList.remove("is-selected", "is-pouring");
      var btn = slot.querySelector(".bar-bottle");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.querySelectorAll(".bar-shelf.is-pouring").forEach(function (shelf) {
      shelf.classList.remove("is-pouring");
    });
    var stage = $("bar-glass-stage");
    if (stage) {
      stage.classList.remove("is-pouring");
    }
    var stream = $("bar-stage-stream");
    if (stream) {
      stream.classList.remove("is-on");
      stream.style.cssText = "";
    }
    var panel = $("bar-detail");
    if (panel) {
      panel.hidden = true;
    }
  }

  function renderStars(id) {
    var wrap = $("bar-rate-stars");
    if (!wrap) {
      return;
    }
    wrap.replaceChildren();
    var current = ratings[id] || 0;
    var i;
    for (i = 1; i <= 5; i += 1) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", current === i ? "true" : "false");
      btn.setAttribute("aria-label", i + " star" + (i === 1 ? "" : "s"));
      btn.dataset.score = String(i);
      btn.className = i <= current ? "is-on" : "";
      btn.textContent = "★";
      btn.addEventListener("click", function (event) {
        var score = Number(event.currentTarget.dataset.score);
        if (ratings[id] === score) {
          delete ratings[id];
        } else {
          ratings[id] = score;
        }
        saveRatings();
        renderStars(id);
        paintShelfStars(id);
      });
      wrap.appendChild(btn);
    }
  }

  function showDetail(tab, id) {
    var bottle = bottleById(tab, id);
    var panel = $("bar-detail");
    if (!bottle || !panel) {
      return;
    }
    $("bar-detail-brand").textContent = bottle.brand || bottle.producer || bottle.brewery || "";
    $("bar-detail-name").textContent = bottle.name || "";
    var bits = [];
    if (bottle.region) {
      bits.push(bottle.region);
    }
    if (bottle.type || bottle.style) {
      bits.push(bottle.type || bottle.style);
    }
    if (bottle.age) {
      bits.push(bottle.age + " years");
    }
    if (bottle.abv) {
      bits.push(bottle.abv + "% ABV");
    }
    if (bottle.occasion) {
      bits.push(bottle.occasion);
    }
    $("bar-detail-meta").textContent = bits.join(" · ");
    $("bar-detail-tags").textContent = (bottle.tags || []).join(" · ");
    $("bar-detail-nose").textContent = bottle.nose || "";
    $("bar-detail-palate").textContent = bottle.palate || "";
    $("bar-detail-finish").textContent = bottle.finish || "";
    renderStars(id);
    panel.hidden = false;
  }

  function aimStream(slot) {
    var stream = $("bar-stage-stream");
    var stage = $("bar-glass-stage");
    var room = $("bar-room");
    var bottle = slot.querySelector(".bar-bottle-img") || slot.querySelector(".bar-bottle");
    if (!stream || !stage || !room || !bottle) {
      return;
    }
    var roomBox = room.getBoundingClientRect();
    var bottleBox = bottle.getBoundingClientRect();
    var glass = stage.querySelector(".bar-glass.is-on") || stage;
    var glassBox = glass.getBoundingClientRect();
    var x1 = bottleBox.left + bottleBox.width * 0.55 - roomBox.left;
    var y1 = bottleBox.top + 12 - roomBox.top;
    var x2 = glassBox.left + glassBox.width * 0.5 - roomBox.left;
    var y2 = glassBox.top + 14 - roomBox.top;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.max(56, Math.hypot(dx, dy));
    var angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    stream.style.left = x1 + "px";
    stream.style.top = y1 + "px";
    stream.style.height = length + "px";
    stream.style.setProperty("--stream-angle", angle + "deg");
    stream.classList.remove("is-on");
    void stream.offsetWidth;
    stream.classList.add("is-on");
  }

  function pourIntoStage(slot) {
    var stage = $("bar-glass-stage");
    if (!stage) {
      return;
    }
    stage.classList.remove("is-pouring", "is-filled");
    void stage.offsetWidth;
    if (reducedMotion()) {
      stage.classList.add("is-filled");
      return;
    }
    aimStream(slot);
    stage.classList.add("is-pouring");
    window.setTimeout(function () {
      if (stage.classList.contains("is-pouring")) {
        stage.classList.add("is-filled");
      }
    }, POUR_MS);
  }

  function selectBottle(tab, id) {
    var slot = slotEl(tab, id);
    var key = tab + ":" + id;
    if (!slot) {
      return;
    }
    if (selectedKey === key) {
      clearSelection();
      return;
    }
    clearSelection();
    selectedKey = key;
    var shelf = slot.closest(".bar-shelf");
    slot.classList.add("is-selected", "is-pouring");
    if (shelf) {
      shelf.classList.add("is-pouring");
    }
    var button = slot.querySelector(".bar-bottle");
    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
    pourIntoStage(slot);
    if (reducedMotion()) {
      showDetail(tab, id);
      return;
    }
    $("bar-detail").hidden = true;
    pourTimer = setTimeout(function () {
      showDetail(tab, id);
    }, POUR_MS);
  }

  function setTab(nextTab, options) {
    options = options || {};
    if (!TAB_IDS[nextTab]) {
      nextTab = "whiskey";
    }
    if (transitioning) {
      return;
    }
    if (!options.instant && nextTab === activeTab) {
      return;
    }

    var previous = activeTab;
    activeTab = nextTab;
    clearSelection();
    if (!options.keepSearch) {
      var search = $("bar-search");
      if (search) {
        search.value = "";
      }
    }

    document.querySelectorAll("[data-tab].bar-tabs button, .bar-tabs [data-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === nextTab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        btn.setAttribute("aria-current", "true");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    setGlass(nextTab);
    if (!options.skipHistory) {
      writeTabToLocation(nextTab);
    }

    var currentPane = document.querySelector('.bar-pane[data-tab="' + previous + '"]');
    var nextPane = document.querySelector('.bar-pane[data-tab="' + nextTab + '"]');
    if (!nextPane) {
      return;
    }

    if (options.instant || reducedMotion() || previous === nextTab) {
      document.querySelectorAll(".bar-pane").forEach(function (pane) {
        var on = pane === nextPane;
        pane.hidden = !on;
        pane.classList.toggle("is-active", on);
        pane.classList.remove("is-leaving", "is-entering");
      });
      applySearch();
      return;
    }

    transitioning = true;
    if (currentPane) {
      currentPane.classList.add("is-leaving");
      currentPane.classList.remove("is-entering", "is-active");
    }

    window.setTimeout(function () {
      document.querySelectorAll(".bar-pane").forEach(function (pane) {
        pane.hidden = pane !== nextPane;
        pane.classList.remove("is-leaving", "is-entering", "is-active");
      });
      nextPane.hidden = false;
      nextPane.classList.add("is-active", "is-entering");
      applySearch();
      window.setTimeout(function () {
        nextPane.classList.remove("is-entering");
        transitioning = false;
      }, TRANSITION_MS);
    }, TRANSITION_MS);
  }

  function bindSlots() {
    document.querySelectorAll(".bar-slot").forEach(function (slot) {
      var id = slot.getAttribute("data-id");
      var tab = slot.getAttribute("data-tab");
      var button = slot.querySelector(".bar-bottle");
      if (!button) {
        return;
      }
      button.addEventListener("click", function () {
        selectBottle(tab, id);
      });
      paintShelfStars(id);
    });
    document.querySelectorAll(".bar-shelf").forEach(function (shelf) {
      shelf.addEventListener("mouseenter", function () {
        shelf.classList.add("is-hovering");
      });
      shelf.addEventListener("mouseleave", function () {
        shelf.classList.remove("is-hovering");
      });
    });
  }

  function init() {
    if (!$("bar-data")) {
      return;
    }
    loadPayload();
    loadRatings();
    bindSlots();
    setTab(readTabFromLocation(), { instant: true, skipHistory: false });

    document.querySelectorAll(".bar-tabs [data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.getAttribute("data-tab"));
      });
    });

    var search = $("bar-search");
    if (search) {
      search.addEventListener("input", applySearch);
      search.addEventListener("search", applySearch);
    }

    var close = $("bar-detail-close");
    if (close) {
      close.addEventListener("click", clearSelection);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        clearSelection();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
