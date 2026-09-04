(function () {
  "use strict";

  var RATE_KEY = "site.whiskey.ratings";
  var POUR_MS = 1450;
  var catalog = { shelves: [], bottles: [] };
  var ratings = {};
  var sortMode = "shelf";
  var selectedId = "";
  var pourTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function loadCatalog() {
    var node = $("whiskey-data");
    if (!node) {
      return;
    }
    try {
      catalog = JSON.parse(node.textContent || "{}");
    } catch (err) {
      catalog = { shelves: [], bottles: [] };
    }
    catalog.bottles = catalog.bottles || [];
    catalog.shelves = catalog.shelves || [];
  }

  function loadRatings() {
    try {
      ratings = JSON.parse(localStorage.getItem(RATE_KEY) || "{}") || {};
    } catch (err) {
      ratings = {};
    }
  }

  function saveRatings() {
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify(ratings));
    } catch (err) {}
  }

  function bottleById(id) {
    return catalog.bottles.find(function (item) {
      return item.id === id;
    });
  }

  function slotEl(id) {
    return document.querySelector('.whiskey-slot[data-id="' + id + '"]');
  }

  function query() {
    var input = $("whiskey-search");
    return input ? String(input.value || "").trim().toLowerCase() : "";
  }

  function matches(bottle, q) {
    if (!q) {
      return true;
    }
    var hay = [bottle.name, bottle.brand, bottle.region, bottle.type, bottle.occasion]
      .concat(bottle.tags || [])
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function orderedIds(shelfId) {
    var list = catalog.bottles.filter(function (item) {
      return item.shelf === shelfId;
    });
    if (sortMode === "rating") {
      list = list.slice().sort(function (a, b) {
        var ra = ratings[a.id] || 0;
        var rb = ratings[b.id] || 0;
        if (ra === 0 && rb === 0) {
          return 0;
        }
        if (ra === 0) {
          return 1;
        }
        if (rb === 0) {
          return -1;
        }
        return rb - ra;
      });
    }
    return list.map(function (item) {
      return item.id;
    });
  }

  function paintShelfStars(id) {
    var mark = document.querySelector('[data-stars-for="' + id + '"]');
    var value = ratings[id] || 0;
    if (!mark) {
      return;
    }
    if (!value) {
      mark.hidden = true;
      mark.textContent = "";
      return;
    }
    mark.hidden = false;
    mark.textContent = "★★★★★".slice(0, value);
  }

  function applyFilterAndSort() {
    var q = query();
    var shown = 0;
    catalog.shelves.forEach(function (shelf) {
      var section = document.querySelector('.whiskey-shelf[data-shelf="' + shelf.id + '"]');
      var row = document.querySelector('[data-shelf-row="' + shelf.id + '"]');
      if (!section || !row) {
        return;
      }
      var visible = 0;
      orderedIds(shelf.id).forEach(function (id) {
        var slot = slotEl(id);
        var bottle = bottleById(id);
        if (!slot || !bottle) {
          return;
        }
        row.appendChild(slot);
        var on = matches(bottle, q);
        slot.hidden = !on;
        if (on) {
          visible += 1;
          shown += 1;
        }
      });
      section.hidden = visible === 0;
    });
    var empty = $("whiskey-empty");
    if (empty) {
      empty.hidden = shown !== 0;
    }
  }

  function clearSelection() {
    selectedId = "";
    if (pourTimer) {
      clearTimeout(pourTimer);
      pourTimer = null;
    }
    document.querySelectorAll(".whiskey-slot.is-selected, .whiskey-slot.is-pouring").forEach(function (slot) {
      slot.classList.remove("is-selected", "is-pouring");
      var btn = slot.querySelector(".whiskey-bottle");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.querySelectorAll(".whiskey-shelf.is-pouring").forEach(function (shelf) {
      shelf.classList.remove("is-pouring");
    });
    var panel = $("whiskey-detail");
    if (panel) {
      panel.hidden = true;
    }
  }

  function renderStars(id) {
    var wrap = $("whiskey-rate-stars");
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
        if (sortMode === "rating") {
          applyFilterAndSort();
        }
      });
      wrap.appendChild(btn);
    }
  }

  function showDetail(id) {
    var bottle = bottleById(id);
    var panel = $("whiskey-detail");
    if (!bottle || !panel) {
      return;
    }
    $("whiskey-detail-brand").textContent = bottle.brand || "";
    $("whiskey-detail-name").textContent = bottle.name || "";
    var bits = [];
    if (bottle.region) {
      bits.push(bottle.region);
    }
    if (bottle.type) {
      bits.push(bottle.type);
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
    $("whiskey-detail-meta").textContent = bits.join(" · ");
    $("whiskey-detail-tags").textContent = (bottle.tags || []).join(" · ");
    $("whiskey-detail-nose").textContent = bottle.nose || "";
    $("whiskey-detail-palate").textContent = bottle.palate || "";
    $("whiskey-detail-finish").textContent = bottle.finish || "";
    renderStars(id);
    panel.hidden = false;
  }

  function selectBottle(id) {
    var slot = slotEl(id);
    if (!slot) {
      return;
    }
    if (selectedId === id) {
      clearSelection();
      return;
    }
    document.querySelectorAll(".whiskey-slot.is-selected, .whiskey-slot.is-pouring").forEach(function (node) {
      node.classList.remove("is-selected", "is-pouring");
      var btn = node.querySelector(".whiskey-bottle");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.querySelectorAll(".whiskey-shelf.is-pouring").forEach(function (shelf) {
      shelf.classList.remove("is-pouring");
    });
    selectedId = id;
    var shelf = slot.closest(".whiskey-shelf");
    slot.classList.add("is-selected", "is-pouring");
    if (shelf) {
      shelf.classList.add("is-pouring");
    }
    var button = slot.querySelector(".whiskey-bottle");
    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
    if (pourTimer) {
      clearTimeout(pourTimer);
    }
    if (reducedMotion()) {
      showDetail(id);
      return;
    }
    $("whiskey-detail").hidden = true;
    pourTimer = setTimeout(function () {
      showDetail(id);
    }, POUR_MS);
  }

  function bindSlots() {
    document.querySelectorAll(".whiskey-slot").forEach(function (slot) {
      var id = slot.getAttribute("data-id");
      var button = slot.querySelector(".whiskey-bottle");
      if (!button) {
        return;
      }
      button.addEventListener("click", function () {
        selectBottle(id);
      });
      paintShelfStars(id);
    });
    document.querySelectorAll(".whiskey-shelf").forEach(function (shelf) {
      shelf.addEventListener("mouseenter", function () {
        shelf.classList.add("is-hovering");
      });
      shelf.addEventListener("mouseleave", function () {
        shelf.classList.remove("is-hovering");
      });
    });
  }

  function init() {
    loadCatalog();
    loadRatings();
    bindSlots();
    applyFilterAndSort();

    var search = $("whiskey-search");
    if (search) {
      search.addEventListener("input", applyFilterAndSort);
    }

    document.querySelectorAll("[data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sortMode = btn.getAttribute("data-sort") || "shelf";
        document.querySelectorAll("[data-sort]").forEach(function (other) {
          other.classList.toggle("is-active", other === btn);
        });
        applyFilterAndSort();
      });
    });

    var close = $("whiskey-detail-close");
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
