(function () {
  "use strict";

  var COUNTRY_KEY = "travel.countries.v1";
  var WONDER_KEY = "travel.wonders.v1";
  var FLAG_CDN = "https://flagcdn.com/w80/";
  var EARTH_TEX = "https://cdn.jsdelivr.net/npm/three-globe@2.44.1/example/img/earth-blue-marble.jpg";
  var EARTH_BUMP = "https://cdn.jsdelivr.net/npm/three-globe@2.44.1/example/img/earth-topology.png";

  var globe = null;
  var dragging = false;
  var flyTimer = null;
  var selected = { type: null, id: null };
  var editingId = null;

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function isAdmin() {
    var api = admin();
    return !!(api && api.isUnlocked());
  }

  function newId() {
    if (globalThis.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function publicPayload() {
    var node = el("travel-public-data");
    if (!node) {
      return { countries: [], wonders: [] };
    }
    try {
      var data = JSON.parse(node.textContent || "{}");
      return {
        countries: Array.isArray(data.countries) ? data.countries : [],
        wonders: Array.isArray(data.wonders) ? data.wonders : []
      };
    } catch (err) {
      return { countries: [], wonders: [] };
    }
  }

  function normalizeEntry(raw, keepId) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    var name = String(raw.name || "").trim();
    if (!name) {
      return null;
    }
    var year = String(raw.year == null ? "" : raw.year).trim();
    if (year && !/^\d{4}$/.test(year)) {
      year = "";
    }
    var notes = String(raw.notes || "").trim();
    var code = String(raw.code || "").trim().toUpperCase();
    if (code && !/^[A-Z]{2}$/.test(code)) {
      code = "";
    }
    var resolved = resolveCountry(name, code);
    if (!code && resolved) {
      code = resolved.code;
    }
    if (resolved && resolved.name && name.toLowerCase() === code.toLowerCase()) {
      name = resolved.name;
    }
    var entry = { name: name };
    if (keepId && raw.id) {
      entry.id = String(raw.id);
    } else {
      entry.id = newId();
    }
    if (year) {
      entry.year = year;
    }
    if (notes) {
      entry.notes = notes;
    }
    if (code) {
      entry.code = code;
    }
    return entry;
  }

  function readCountryStore() {
    try {
      var raw = localStorage.getItem(COUNTRY_KEY);
      if (!raw) {
        return [];
      }
      var data = JSON.parse(raw);
      var rows = Array.isArray(data)
        ? data
        : data && Array.isArray(data.countries)
          ? data.countries
          : [];
      return rows.map(function (row) {
        return normalizeEntry(row, true);
      }).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function writeCountryStore(list) {
    localStorage.setItem(COUNTRY_KEY, JSON.stringify({ countries: list }));
  }

  function readWonderStore() {
    try {
      var raw = localStorage.getItem(WONDER_KEY);
      if (!raw) {
        return [];
      }
      var data = JSON.parse(raw);
      var rows = Array.isArray(data)
        ? data
        : data && Array.isArray(data.visited)
          ? data.visited
          : [];
      return rows.map(function (id) {
        return String(id);
      }).filter(function (id) {
        return wonderById(id);
      });
    } catch (err) {
      return [];
    }
  }

  function writeWonderStore(ids) {
    localStorage.setItem(WONDER_KEY, JSON.stringify({ visited: ids }));
  }

  function catalogWonders() {
    return window.TRAVEL_WONDERS || [];
  }

  function wonderById(id) {
    return catalogWonders().filter(function (item) {
      return item.id === id;
    })[0] || null;
  }

  function visibleCountries() {
    if (isAdmin()) {
      return readCountryStore();
    }
    return publicPayload().countries.map(function (row) {
      return normalizeEntry(row, true);
    }).filter(Boolean);
  }

  function visibleWonderIds() {
    if (isAdmin()) {
      return readWonderStore();
    }
    return publicPayload().wonders.map(String).filter(function (id) {
      return wonderById(id);
    });
  }

  function names() {
    return window.ISO_COUNTRY_NAMES || {};
  }

  function aliases() {
    return window.ISO_COUNTRY_ALIASES || {};
  }

  function centroids() {
    return window.ISO_CENTROIDS || {};
  }

  function assetUrl(path) {
    var base = String(window.TRAVEL_BASE || "").replace(/\/$/, "");
    if (!path) {
      return path;
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return base + path;
  }

  function flagUrl(code) {
    return FLAG_CDN + String(code).toLowerCase() + ".png";
  }

  function resolveCountry(name, code) {
    var iso = String(code || "").trim().toUpperCase();
    var label = String(name || "").trim();
    var table = names();
    if (iso && table[iso]) {
      return { code: iso, name: table[iso] };
    }
    if (!label) {
      return iso ? { code: iso, name: label } : null;
    }
    if (/^[A-Za-z]{2}$/.test(label) && table[label.toUpperCase()]) {
      iso = label.toUpperCase();
      return { code: iso, name: table[iso] };
    }
    var key = label.toLowerCase().replace(/[.’']/g, "");
    var alias = aliases()[key];
    if (alias && table[alias]) {
      return { code: alias, name: table[alias] };
    }
    var match = null;
    Object.keys(table).forEach(function (item) {
      if (table[item].toLowerCase() === label.toLowerCase()) {
        match = { code: item, name: table[item] };
      }
    });
    return match;
  }

  function locationForCountry(entry) {
    if (!entry) {
      return null;
    }
    if (entry.lat != null && entry.lng != null) {
      return { lat: Number(entry.lat), lng: Number(entry.lng) };
    }
    var code = entry.code && centroids()[entry.code] ? entry.code : "";
    if (!code) {
      var resolved = resolveCountry(entry.name, entry.code);
      code = resolved && centroids()[resolved.code] ? resolved.code : "";
    }
    if (!code) {
      return null;
    }
    return { lat: centroids()[code][1], lng: centroids()[code][0] };
  }

  function searchCountries(query) {
    var q = String(query || "").trim().toLowerCase();
    var used = {};
    visibleCountries().forEach(function (item) {
      if (item.code) {
        used[item.code] = true;
      }
    });
    var table = names();
    var rows = [];
    Object.keys(table).forEach(function (code) {
      if (used[code] || !centroids()[code]) {
        return;
      }
      var title = table[code];
      if (
        !q ||
        title.toLowerCase().indexOf(q) !== -1 ||
        code.toLowerCase() === q ||
        aliases()[q] === code
      ) {
        rows.push({ code: code, name: title });
      }
    });
    rows.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return rows.slice(0, 40);
  }

  function setStatus(message, isError) {
    var status = el("travel-status");
    if (!status) {
      return;
    }
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("travel-status-error", !!isError);
  }

  function setEditorStatus(message, isError) {
    var status = el("travel-editor-status");
    if (!status) {
      return;
    }
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("travel-status-error", !!isError);
  }

  function setGlobeStatus(mode) {
    var live = el("travel-globe-live");
    if (!live) {
      return;
    }
    var paused = mode === "paused";
    live.classList.toggle("is-paused", paused);
    var text = paused ? "Paused" : "Slowly rotating";
    var label = live.querySelector("[data-globe-state]");
    if (label) {
      label.textContent = text;
    } else {
      live.innerHTML = '<i aria-hidden="true"></i> <span data-globe-state>' + text + "</span>";
    }
  }

  function monumentSvg(kind) {
    var paths = {
      wall: '<path d="M3 16V9h2v2h3V9h2v2h3V9h2v2h3V9h2v7H3zm1-9h2V5h2v2h4V5h2v2h4V5h2v2"/>',
      facade: '<path d="M4 18V8l8-5 8 5v10H4zm4-2h3v-4h2v4h3V9.4L12 6.6 8 9.4V16z"/>',
      arena: '<path d="M4 10c0-4 3.6-7 8-7s8 3 8 7v7c0 1.4-3.6 3-8 3s-8-1.6-8-3v-7zm2.2 0C6.2 7.4 8.8 6 12 6s5.8 1.4 5.8 4-2.6 4-5.8 4-5.8-1.4-5.8-4z"/>',
      pyramid: '<path d="M12 4l9 15H3L12 4zm0 5.2L7.8 16h8.4L12 9.2z"/>',
      mountain: '<path d="M3 18l6.2-9 3.1 4.4L15 8.5 21 18H3zm8.4-3.3L9.2 12 6.4 16h11.3l-2.8-4.3-2.2 2.3-1.3-1.3z"/>',
      dome: '<path d="M6 18v-2.2C6 11.2 8.6 8 12 8s6 3.2 6 7.8V18H6zm6-12.5c.8 0 1.4-.6 1.4-1.3S12.8 3 12 3s-1.4.5-1.4 1.2.6 1.3 1.4 1.3z"/>',
      statue: '<path d="M11 8V4h2v4h6v2h-6v3.2L17 21h-2.2L12 14.6 9.2 21H7l4-7.8V10H5V8h6z"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (paths[kind] || paths.dome) + "</svg>";
  }

  function markerElement(d) {
    var wrap = document.createElement("div");
    wrap.className = "globe-marker globe-marker-" + d.kind;
    wrap.title = d.name;
    if (d.kind === "country") {
      wrap.classList.add("globe-flag-wrap");
      if (d.selected) {
        wrap.classList.add("is-selected");
      }
      var img = document.createElement("img");
      img.className = "globe-flag";
      img.src = flagUrl(d.code);
      img.alt = "";
      wrap.appendChild(img);
    } else {
      wrap.className += " globe-wonder";
      if (d.selected) {
        wrap.classList.add("is-selected");
      }
      wrap.innerHTML = monumentSvg(d.icon);
    }
    wrap.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });
    wrap.addEventListener("click", function (event) {
      event.stopPropagation();
      selectPlace(d.kind, d.id, true);
    });
    return wrap;
  }

  function markerData() {
    var items = [];
    visibleCountries().forEach(function (entry) {
      var loc = locationForCountry(entry);
      if (!loc || !entry.code) {
        return;
      }
      items.push({
        kind: "country",
        id: entry.id,
        name: entry.name,
        code: entry.code,
        lat: loc.lat,
        lng: loc.lng,
        selected: selected.type === "country" && selected.id === entry.id
      });
    });
    visibleWonderIds().forEach(function (id) {
      var wonder = wonderById(id);
      if (!wonder) {
        return;
      }
      items.push({
        kind: "wonder",
        id: wonder.id,
        name: wonder.name,
        icon: wonder.icon,
        lat: wonder.lat,
        lng: wonder.lng,
        selected: selected.type === "wonder" && selected.id === wonder.id
      });
    });
    return items;
  }

  function updateGlobeMarkers() {
    if (!globe) {
      return;
    }
    globe.htmlElementsData(markerData());
  }

  function flyTo(lat, lng) {
    if (!globe || lat == null || lng == null) {
      return;
    }
    clearTimeout(flyTimer);
    var controls = globe.controls();
    controls.autoRotate = false;
    setGlobeStatus("paused");
    globe.pointOfView({ lat: Number(lat), lng: Number(lng), altitude: 1.55 }, 1100);
    flyTimer = setTimeout(function () {
      if (!dragging) {
        controls.autoRotate = true;
        setGlobeStatus("rotating");
      }
    }, 1300);
  }

  function selectPlace(type, id, doFly) {
    selected = { type: type, id: id };
    renderCountryGrid();
    renderWonderList();
    updateGlobeMarkers();
    if (!doFly) {
      return;
    }
    if (type === "country") {
      var entry = visibleCountries().filter(function (item) {
        return item.id === id;
      })[0];
      var loc = locationForCountry(entry);
      if (loc) {
        flyTo(loc.lat, loc.lng);
      }
      return;
    }
    var wonder = wonderById(id);
    if (wonder) {
      flyTo(wonder.lat, wonder.lng);
    }
  }

  function renderStat(list) {
    var num = el("travel-stat-num");
    var label = el("travel-stat-label");
    if (num) {
      num.textContent = String(list.length);
    }
    if (label) {
      label.textContent = list.length === 1 ? "country visited." : "countries visited.";
    }
  }

  function renderCountryGrid() {
    var root = el("travel-country-grid");
    var empty = el("travel-country-empty");
    if (!root) {
      return;
    }
    var list = visibleCountries();
    root.replaceChildren();
    if (empty) {
      empty.hidden = list.length > 0;
    }
    list
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .forEach(function (entry) {
        var card = document.createElement("div");
        card.className = "travel-country-card";
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        if (selected.type === "country" && selected.id === entry.id) {
          card.classList.add("is-selected");
        }
        card.setAttribute("aria-pressed", selected.type === "country" && selected.id === entry.id ? "true" : "false");
        if (entry.code) {
          var flag = document.createElement("img");
          flag.src = flagUrl(entry.code);
          flag.alt = "";
          card.appendChild(flag);
        }
        var name = document.createElement("span");
        name.className = "travel-country-name";
        name.textContent = entry.name;
        card.appendChild(name);
        card.addEventListener("click", function () {
          selectPlace("country", entry.id, true);
        });
        card.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPlace("country", entry.id, true);
          }
        });
        if (isAdmin()) {
          card.addEventListener("dblclick", function (event) {
            event.preventDefault();
            openEditor(entry);
          });
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "travel-remove";
          remove.setAttribute("aria-label", "Remove " + entry.name);
          remove.textContent = "×";
          remove.addEventListener("click", function (event) {
            event.stopPropagation();
            removeCountry(entry);
          });
          card.appendChild(remove);
        }
        root.appendChild(card);
      });
  }

  function renderWonderList() {
    var root = el("travel-wonder-list");
    var count = el("travel-wonder-count");
    var visited = {};
    visibleWonderIds().forEach(function (id) {
      visited[id] = true;
    });
    if (count) {
      count.textContent = Object.keys(visited).length + " of 7 visited.";
    }
    if (!root) {
      return;
    }
    root.replaceChildren();
    catalogWonders().forEach(function (wonder) {
      var card = document.createElement("div");
      card.className = "travel-wonder-card";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      if (selected.type === "wonder" && selected.id === wonder.id) {
        card.classList.add("is-selected");
      }
      var img = document.createElement("img");
      img.src = assetUrl(wonder.photo);
      img.alt = "";
      img.addEventListener("error", function () {
        var fallback = document.createElement("span");
        fallback.className = "travel-wonder-fallback";
        fallback.innerHTML = monumentSvg(wonder.icon);
        if (img.parentNode) {
          img.parentNode.replaceChild(fallback, img);
        }
      });
      var copy = document.createElement("div");
      var title = document.createElement("h3");
      title.textContent = wonder.name;
      var meta = document.createElement("p");
      meta.textContent = wonder.country;
      copy.appendChild(title);
      copy.appendChild(meta);
      var box = document.createElement("button");
      box.type = "button";
      box.className = "travel-visit";
      box.setAttribute("aria-label", "Mark " + wonder.name + " visited");
      box.setAttribute("aria-pressed", visited[wonder.id] ? "true" : "false");
      box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12.5l4.2 4.2L19 7"></path></svg>';
      if (!isAdmin()) {
        box.disabled = true;
      }
      box.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleWonder(wonder.id);
        selectPlace("wonder", wonder.id, true);
      });
      card.appendChild(img);
      card.appendChild(copy);
      card.appendChild(box);
      card.addEventListener("click", function () {
        selectPlace("wonder", wonder.id, true);
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPlace("wonder", wonder.id, true);
        }
      });
      root.appendChild(card);
    });
  }

  function renderBackup(list) {
    var exportBox = el("travel-export");
    if (exportBox) {
      exportBox.value = JSON.stringify(
        {
          countries: list,
          wonders: isAdmin() ? readWonderStore() : []
        },
        null,
        2
      );
    }
  }

  function renderAll() {
    var list = visibleCountries();
    renderStat(list);
    renderCountryGrid();
    renderWonderList();
    renderBackup(isAdmin() ? readCountryStore() : []);
    updateGlobeMarkers();
  }

  function applyMode() {
    var addBtn = el("travel-add-open");
    var backup = el("travel-backup");
    var adminMode = isAdmin();
    document.body.classList.toggle("travel-is-admin", adminMode);
    if (addBtn) {
      addBtn.hidden = !adminMode;
    }
    if (backup) {
      backup.hidden = !adminMode;
    }
    if (!adminMode) {
      closeEditor();
    }
    setStatus("");
    renderAll();
  }

  function fillForm(entry) {
    el("travel-edit-id").value = entry && entry.id ? entry.id : "";
    el("travel-name").value = entry && entry.name ? entry.name : "";
    el("travel-year").value = entry && entry.year ? entry.year : "";
    el("travel-notes").value = entry && entry.notes ? entry.notes : "";
    el("travel-code").value = entry && entry.code ? entry.code : "";
    el("travel-editor-title").textContent = entry ? "Edit country" : "Add a country";
    el("travel-save").textContent = entry ? "Save changes" : "Add country";
    editingId = entry ? entry.id : null;
    renderAddResults(el("travel-name").value);
    setEditorStatus("");
  }

  function openEditor(entry) {
    var dialog = el("travel-editor");
    fillForm(entry || null);
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
    el("travel-name").focus();
  }

  function closeEditor() {
    var dialog = el("travel-editor");
    editingId = null;
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function renderAddResults(query) {
    var root = el("travel-add-results");
    if (!root) {
      return;
    }
    root.replaceChildren();
    if (editingId) {
      return;
    }
    searchCountries(query).forEach(function (item) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "travel-add-option";
      var img = document.createElement("img");
      img.src = flagUrl(item.code);
      img.alt = "";
      var label = document.createElement("span");
      label.textContent = item.name;
      option.appendChild(img);
      option.appendChild(label);
      option.addEventListener("click", function () {
        el("travel-name").value = item.name;
        el("travel-code").value = item.code;
        saveCountry({
          id: "",
          name: item.name,
          year: el("travel-year").value,
          notes: el("travel-notes").value,
          code: item.code
        });
      });
      root.appendChild(option);
    });
  }

  function saveCountry(raw) {
    if (!isAdmin()) {
      return;
    }
    var entry = normalizeEntry(
      {
        id: editingId || raw.id,
        name: raw.name,
        year: raw.year,
        notes: raw.notes,
        code: raw.code
      },
      !!(editingId || raw.id)
    );
    if (!entry) {
      setEditorStatus("A country name is required.", true);
      return;
    }
    var list = readCountryStore();
    var duplicate = list.some(function (item) {
      if (item.id === entry.id) {
        return false;
      }
      return (
        (entry.code && item.code === entry.code) ||
        item.name.toLowerCase() === entry.name.toLowerCase()
      );
    });
    if (duplicate) {
      setEditorStatus("That country is already on the list.", true);
      return;
    }
    if (editingId) {
      list = list.map(function (item) {
        return item.id === editingId ? entry : item;
      });
    } else {
      list.push(entry);
    }
    writeCountryStore(list);
    closeEditor();
    setStatus(entry.name + " saved in this browser.");
    selectPlace("country", entry.id, true);
    renderAll();
  }

  function removeCountry(entry) {
    if (!isAdmin()) {
      return;
    }
    var next = readCountryStore().filter(function (item) {
      return item.id !== entry.id;
    });
    writeCountryStore(next);
    if (selected.type === "country" && selected.id === entry.id) {
      selected = { type: null, id: null };
    }
    setStatus("Removed " + entry.name + ".");
    renderAll();
  }

  function toggleWonder(id) {
    if (!isAdmin() || !wonderById(id)) {
      return;
    }
    var ids = readWonderStore();
    var index = ids.indexOf(id);
    if (index >= 0) {
      ids.splice(index, 1);
    } else {
      ids.push(id);
    }
    writeWonderStore(ids);
    renderAll();
  }

  function parseImport(text) {
    var data = JSON.parse(text);
    var rows = Array.isArray(data)
      ? data
      : data && Array.isArray(data.countries)
        ? data.countries
        : null;
    if (!rows) {
      throw new Error("Need a JSON object with a countries array.");
    }
    var countries = rows.map(function (row) {
      return normalizeEntry(row, false);
    }).filter(Boolean);
    var wonders = [];
    if (data && Array.isArray(data.wonders)) {
      wonders = data.wonders.map(String).filter(function (id) {
        return wonderById(id);
      });
    }
    return { countries: countries, wonders: wonders };
  }

  function applyImport(text) {
    if (!isAdmin()) {
      return;
    }
    try {
      var incoming = parseImport(text);
      writeCountryStore(incoming.countries);
      if (incoming.wonders.length || /"wonders"\s*:/.test(text)) {
        writeWonderStore(incoming.wonders);
      }
      editingId = null;
      selected = { type: null, id: null };
      renderAll();
      setStatus(
        incoming.countries.length
          ? "Imported " + incoming.countries.length + (incoming.countries.length === 1 ? " country." : " countries.")
          : "Imported an empty list."
      );
    } catch (err) {
      setStatus("Import failed. Use a JSON countries list.", true);
    }
  }

  function initGlobe() {
    var box = el("travel-globe");
    if (!box) {
      return;
    }
    if (globe) {
      updateGlobeMarkers();
      return;
    }
    if (typeof Globe !== "function") {
      box.textContent = "The globe could not load. Check the network and refresh.";
      return;
    }
    globe = Globe({
      animateIn: true,
      rendererConfig: { antialias: true, alpha: true }
    })(box)
      .globeImageUrl(EARTH_TEX)
      .bumpImageUrl(EARTH_BUMP)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#7eafcf")
      .atmosphereAltitude(0.2)
      .htmlElementsData([])
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlAltitude(0.018)
      .htmlElement(markerElement)
      .htmlTransitionDuration(0);

    globe.pointOfView({ lat: 16, lng: 28, altitude: 2.2 }, 0);

    var controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.42;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.7;
    controls.minDistance = 130;
    controls.maxDistance = 460;

    controls.addEventListener("start", function () {
      dragging = true;
      controls.autoRotate = false;
      setGlobeStatus("paused");
    });
    controls.addEventListener("end", function () {
      dragging = false;
      controls.autoRotate = true;
      setGlobeStatus("rotating");
    });

    box.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
      },
      { passive: false }
    );

    function resize() {
      globe.width(box.clientWidth);
      globe.height(box.clientHeight);
    }
    resize();
    window.addEventListener("resize", resize);
    updateGlobeMarkers();
  }

  function onSave(event) {
    event.preventDefault();
    saveCountry({
      id: el("travel-edit-id").value,
      name: el("travel-name").value,
      year: el("travel-year").value,
      notes: el("travel-notes").value,
      code: el("travel-code").value
    });
  }

  function startPrivateView() {
    applyMode();
    initGlobe();
  }

  function init() {
    var addBtn = el("travel-add-open");
    var form = el("travel-editor-form");
    var cancel = el("travel-cancel-edit");
    var nameInput = el("travel-name");
    var importFile = el("travel-import-file");
    var importBtn = el("travel-import-btn");
    var downloadBtn = el("travel-download");
    var dialog = el("travel-editor");

    if (isAdmin()) {
      startPrivateView();
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        openEditor(null);
      });
    }
    if (form) {
      form.addEventListener("submit", onSave);
    }
    if (cancel) {
      cancel.addEventListener("click", closeEditor);
    }
    if (nameInput) {
      nameInput.addEventListener("input", function () {
        if (!editingId) {
          var resolved = resolveCountry(nameInput.value, "");
          if (resolved) {
            el("travel-code").value = resolved.code;
          }
        }
        renderAddResults(nameInput.value);
      });
    }
    if (dialog) {
      dialog.addEventListener("close", function () {
        editingId = null;
      });
    }
    if (importFile) {
      importFile.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file || !isAdmin()) {
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          applyImport(String(reader.result || ""));
        };
        reader.readAsText(file);
      });
    }
    if (importBtn) {
      importBtn.addEventListener("click", function () {
        applyImport(el("travel-import").value);
      });
    }
    if (downloadBtn) {
      downloadBtn.addEventListener("click", function () {
        if (!isAdmin()) {
          return;
        }
        var blob = new Blob(
          [el("travel-export").value || JSON.stringify({ countries: [], wonders: [] }, null, 2)],
          { type: "application/json" }
        );
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "travel-private.json";
        link.click();
        URL.revokeObjectURL(url);
      });
    }

    var api = admin();
    if (api && typeof api.onChange === "function") {
      api.onChange(function (unlocked) {
        if (unlocked) {
          startPrivateView();
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
