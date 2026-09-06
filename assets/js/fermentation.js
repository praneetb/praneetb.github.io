(function () {
  "use strict";

  var data = { filters: [], items: [] };
  var activeId = "";
  var kindFilter = "all";
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
    var node = $("fermentation-data");
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

  function findItem(id) {
    for (var i = 0; i < data.items.length; i += 1) {
      if (data.items[i].id === id) {
        return data.items[i];
      }
    }
    return data.items[0] || null;
  }

  function videoSources(item) {
    var raw = item && item.video;
    if (!raw) {
      return [];
    }
    if (typeof raw === "string") {
      return raw.trim() ? [raw.trim()] : [];
    }
    if (Object.prototype.toString.call(raw) === "[object Array]") {
      return raw.filter(function (src) {
        return src && String(src).trim();
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

  function hasLog(item) {
    return !!(item && item.log && (item.log.date || item.log.text));
  }

  function matches(item) {
    if (kindFilter === "logs" && !hasLog(item)) {
      return false;
    }
    if (kindFilter !== "all" && kindFilter !== "logs" && item.kind !== kindFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    var hay = [
      item.name,
      item.subtitle,
      item.meta,
      item.lede,
      item.note,
      item.kind,
      hasLog(item) ? (item.log.date || "") + " " + (item.log.text || "") : ""
    ]
      .concat((item.ingredients || []).map(function (line) {
        return (line.amount || "") + " " + (line.name || "");
      }))
      .concat(item.tools || [])
      .concat(item.steps || [])
      .concat((item.schedule || []).map(function (row) {
        return (row.title || "") + " " + (row.body || "");
      }))
      .join(" ")
      .toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function requestedId() {
    var params = new URLSearchParams(location.search);
    var fromQuery = params.get("item") || params.get("id");
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
    url.searchParams.set("item", id);
    url.hash = "";
    if (replace) {
      history.replaceState({ item: id }, "", url);
    } else {
      history.pushState({ item: id }, "", url);
    }
  }

  function renderList() {
    var buttons = document.querySelectorAll("[data-ferm].ferm-item");
    var visible = 0;
    for (var i = 0; i < buttons.length; i += 1) {
      var id = buttons[i].getAttribute("data-ferm");
      var item = findItem(id);
      var show = !!(item && matches(item));
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
    var empty = $("ferm-empty");
    if (empty) {
      empty.hidden = visible > 0;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showBlock(id, on) {
    var node = $(id);
    if (node) {
      node.hidden = !on;
    }
  }

  function setText(id, value) {
    var node = $(id);
    if (node) {
      node.textContent = value || "";
    }
  }

  function renderMedia(item) {
    var frame = $("ferm-video");
    var player = $("ferm-player");
    var poster = $("ferm-poster");
    var empty = $("ferm-video-empty");
    var tag = $("ferm-video-tag");
    var sources = videoSources(item);
    var posterSrc = item.poster ? withBase(String(item.poster).trim()) : "";
    var tagText = (item.video_tag || "").trim();

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
      tag.hidden = true;
      tag.textContent = "";
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
      if (tag && tagText) {
        tag.textContent = tagText;
        tag.hidden = false;
      }
      player.load();
      return;
    }

    if (posterSrc && poster) {
      poster.src = posterSrc;
      poster.alt = item.name || "";
      poster.hidden = false;
    }
    if (empty) {
      empty.hidden = false;
    }
  }

  function filled(list) {
    if (!list || !list.length) {
      return [];
    }
    return list.filter(function (row) {
      if (typeof row === "string") {
        return !!row.trim();
      }
      return !!(row && ((row.body && String(row.body).trim()) || (row.name && String(row.name).trim())));
    });
  }

  function renderDetail(item) {
    if (!item) {
      return;
    }
    setText("ferm-name", item.name);
    setText("ferm-meta", item.meta || item.subtitle || "");
    var lede = $("ferm-lede");
    if (lede) {
      lede.textContent = item.lede || "";
      lede.hidden = !item.lede;
    }

    var ingredients = filled(item.ingredients);
    showBlock("ferm-ingredients-block", ingredients.length > 0);
    var ingredientList = $("ferm-ingredients");
    if (ingredientList) {
      ingredientList.innerHTML = ingredients.map(function (line) {
        var icon = line.icon ? " data-icon=\"" + escapeHtml(line.icon) + "\"" : "";
        return "<li" + icon + "><span>" + escapeHtml(line.amount || "") + "</span> " + escapeHtml(line.name || "") + "</li>";
      }).join("");
    }

    var tools = (item.tools || []).filter(function (tool) {
      return tool && String(tool).trim();
    });
    showBlock("ferm-tools-block", tools.length > 0);
    var toolList = $("ferm-tools");
    if (toolList) {
      toolList.innerHTML = tools.map(function (tool) {
        return "<li>" + escapeHtml(tool) + "</li>";
      }).join("");
    }

    var schedule = filled(item.schedule);
    showBlock("ferm-schedule-block", schedule.length > 0);
    var scheduleList = $("ferm-schedule");
    if (scheduleList) {
      scheduleList.innerHTML = schedule.map(function (row) {
        return "<li><strong>" + escapeHtml(row.title || "") + "</strong> " + escapeHtml(row.body || "") + "</li>";
      }).join("");
    }

    var steps = (item.steps || []).filter(function (step) {
      return step && String(step).trim();
    });
    showBlock("ferm-steps-block", steps.length > 0);
    var stepList = $("ferm-steps");
    if (stepList) {
      stepList.innerHTML = steps.map(function (step) {
        return "<li>" + escapeHtml(step) + "</li>";
      }).join("");
    }

    showBlock("ferm-log-block", hasLog(item));
    var log = $("ferm-log");
    if (log) {
      if (hasLog(item)) {
        log.innerHTML = "<time>" + escapeHtml(item.log.date || "") + "</time> " + escapeHtml(item.log.text || "");
      } else {
        log.textContent = "";
      }
    }

    showBlock("ferm-note-block", !!(item.note && String(item.note).trim()));
    setText("ferm-note", item.note || "");
    renderMedia(item);
  }

  function selectItem(id, push) {
    var item = findItem(id);
    if (!item) {
      return;
    }
    activeId = item.id;
    renderList();
    renderDetail(item);
    syncUrl(item.id, !push);
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
    kindFilter = next || "all";
    var chips = document.querySelectorAll("[data-filter]");
    for (var i = 0; i < chips.length; i += 1) {
      var on = chips[i].getAttribute("data-filter") === kindFilter;
      chips[i].classList.toggle("is-active", on);
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    renderList();
    var current = findItem(activeId);
    if (!current || !matches(current)) {
      var fallback = firstVisibleId();
      if (fallback) {
        selectItem(fallback, false);
      }
    }
  }

  function markShortcut() {
    var key = document.querySelector(".ferm-search-key");
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
    var item = findItem(start) || data.items[0];
    activeId = item.id;
    renderList();
    renderDetail(item);
    syncUrl(item.id, true);

    var list = $("ferm-list");
    if (list) {
      list.addEventListener("click", function (event) {
        var button = event.target.closest("[data-ferm].ferm-item");
        if (button) {
          selectItem(button.getAttribute("data-ferm"), true);
        }
      });
    }

    var chips = document.querySelector(".ferm-filters");
    if (chips) {
      chips.addEventListener("click", function (event) {
        var chip = event.target.closest("[data-filter]");
        if (chip) {
          applyFilter(chip.getAttribute("data-filter"));
        }
      });
    }

    var search = $("ferm-search");
    if (search) {
      search.addEventListener("input", function () {
        query = (search.value || "").trim().toLowerCase();
        applyFilter(kindFilter);
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
        var next = findItem(id);
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
