(function () {
  "use strict";

  var COUNTRY_KEY = "travel.countries.v1";
  var FLAG_CDN = "https://flagcdn.com/w80/";
  var EARTH_TEX = "https://cdn.jsdelivr.net/npm/three-globe@2.44.1/example/img/earth-blue-marble.jpg";
  var EARTH_BUMP = "https://cdn.jsdelivr.net/npm/three-globe@2.44.1/example/img/earth-topology.png";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var globe = null;
  var dragging = false;
  var flyTimer = null;
  var selectedId = null;
  var editingId = null;
  var searchQuery = "";
  var sortMode = "name";

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
      return { countries: [] };
    }
    try {
      var data = JSON.parse(node.textContent || "{}");
      return {
        countries: Array.isArray(data.countries) ? data.countries : []
      };
    } catch (err) {
      return { countries: [] };
    }
  }

  function parseMonth(raw) {
    var value = parseInt(String(raw == null ? "" : raw).trim(), 10);
    return value >= 1 && value <= 12 ? value : 0;
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
    var month = parseMonth(raw.month);
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
    if (month) {
      entry.month = month;
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

  function visibleCountries() {
    if (isAdmin()) {
      return readCountryStore();
    }
    return publicPayload().countries.map(function (row) {
      return normalizeEntry(row, true);
    }).filter(Boolean);
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

  function formatVisit(entry) {
    if (!entry) {
      return "";
    }
    var year = entry.year || "";
    var month = parseMonth(entry.month);
    if (month && year) {
      return MONTHS[month - 1] + " " + year;
    }
    return year;
  }

  function visitStamp(entry) {
    var year = parseInt(entry && entry.year ? entry.year : "0", 10) || 0;
    var month = parseMonth(entry && entry.month);
    return year * 100 + month;
  }

  function matchesQuery(entry, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) {
      return true;
    }
    return (
      entry.name.toLowerCase().indexOf(q) !== -1 ||
      (entry.code && entry.code.toLowerCase() === q) ||
      formatVisit(entry).toLowerCase().indexOf(q) !== -1
    );
  }

  function sortedVisible() {
    return visibleCountries()
      .filter(function (entry) {
        return matchesQuery(entry, searchQuery);
      })
      .sort(function (a, b) {
        if (sortMode === "recent") {
          return visitStamp(b) - visitStamp(a) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }

  function unusedCountries() {
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
      rows.push({ code: code, name: table[code] });
    });
    rows.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return rows;
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

  function markerElement(d) {
    var wrap = document.createElement("div");
    wrap.className = "globe-marker globe-flag-wrap";
    wrap.title = d.name;
    if (d.selected) {
      wrap.classList.add("is-selected");
    }
    var img = document.createElement("img");
    img.className = "globe-flag";
    img.src = flagUrl(d.code);
    img.alt = "";
    var needle = document.createElement("span");
    needle.className = "globe-pin-needle";
    needle.setAttribute("aria-hidden", "true");
    wrap.appendChild(img);
    wrap.appendChild(needle);
    wrap.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });
    wrap.addEventListener("click", function (event) {
      event.stopPropagation();
      selectPlace(d.id, true);
    });
    return wrap;
  }

  function markerData() {
    return visibleCountries()
      .map(function (entry) {
        var loc = locationForCountry(entry);
        if (!loc || !entry.code) {
          return null;
        }
        return {
          id: entry.id,
          name: entry.name,
          code: entry.code,
          lat: loc.lat,
          lng: loc.lng,
          selected: selectedId === entry.id
        };
      })
      .filter(Boolean);
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
    globe.pointOfView({ lat: Number(lat), lng: Number(lng), altitude: 1.45 }, 1100);
    flyTimer = setTimeout(function () {
      if (!dragging) {
        controls.autoRotate = true;
      }
    }, 1300);
  }

  function selectPlace(id, doFly) {
    selectedId = id;
    renderCountryList();
    updateGlobeMarkers();
    if (!doFly) {
      return;
    }
    var entry = visibleCountries().filter(function (item) {
      return item.id === id;
    })[0];
    var loc = locationForCountry(entry);
    if (loc) {
      flyTo(loc.lat, loc.lng);
    }
  }

  function renderStat(list) {
    var num = el("travel-stat-num");
    if (num) {
      num.textContent = String(list.length);
    }
  }

  function renderAddSelect() {
    var select = el("travel-add-select");
    if (!select) {
      return;
    }
    var previous = select.value;
    select.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select a country...";
    select.appendChild(blank);
    unusedCountries().forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.code;
      option.textContent = item.name;
      select.appendChild(option);
    });
    if (previous && !visibleCountries().some(function (item) { return item.code === previous; })) {
      select.value = previous;
    }
  }

  function renderCountryList() {
    var root = el("travel-country-list");
    var empty = el("travel-country-empty");
    if (!root) {
      return;
    }
    var all = visibleCountries();
    var list = sortedVisible();
    root.replaceChildren();
    if (empty) {
      if (!all.length) {
        empty.hidden = false;
        empty.textContent = "Nothing recorded yet.";
      } else if (!list.length) {
        empty.hidden = false;
        empty.textContent = "No countries match that search.";
      } else {
        empty.hidden = true;
      }
    }
    list.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "travel-country-row";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      if (selectedId === entry.id) {
        row.classList.add("is-selected");
      }
      row.setAttribute("aria-pressed", selectedId === entry.id ? "true" : "false");
      if (entry.code) {
        var flag = document.createElement("img");
        flag.src = flagUrl(entry.code);
        flag.alt = "";
        row.appendChild(flag);
      } else {
        var spacer = document.createElement("span");
        row.appendChild(spacer);
      }
      var name = document.createElement("span");
      name.className = "travel-country-name";
      name.textContent = entry.name;
      row.appendChild(name);
      var date = document.createElement("span");
      date.className = "travel-country-date";
      date.textContent = formatVisit(entry);
      row.appendChild(date);
      if (isAdmin()) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "travel-remove";
        remove.setAttribute("aria-label", "Remove " + entry.name);
        remove.textContent = "×";
        remove.addEventListener("click", function (event) {
          event.stopPropagation();
          removeCountry(entry);
        });
        row.appendChild(remove);
      } else {
        var gap = document.createElement("span");
        row.appendChild(gap);
      }
      var go = document.createElement("span");
      go.className = "travel-row-go";
      go.setAttribute("aria-hidden", "true");
      go.textContent = "›";
      row.appendChild(go);
      row.addEventListener("click", function () {
        selectPlace(entry.id, true);
      });
      row.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPlace(entry.id, true);
        }
      });
      if (isAdmin()) {
        row.addEventListener("dblclick", function (event) {
          event.preventDefault();
          openEditor(entry);
        });
      }
      root.appendChild(row);
    });
  }

  function renderBackup(list) {
    var exportBox = el("travel-export");
    if (exportBox) {
      exportBox.value = JSON.stringify({ countries: list }, null, 2);
    }
  }

  function renderAll() {
    var list = visibleCountries();
    renderStat(list);
    renderCountryList();
    renderAddSelect();
    renderBackup(isAdmin() ? readCountryStore() : []);
    updateGlobeMarkers();
  }

  function applyMode() {
    var addForm = el("travel-add-form");
    var backupOpen = el("travel-backup-open");
    var adminMode = isAdmin();
    document.body.classList.toggle("travel-is-admin", adminMode);
    if (addForm) {
      addForm.hidden = !adminMode;
    }
    if (backupOpen) {
      backupOpen.hidden = !adminMode;
    }
    if (!adminMode) {
      closeEditor();
      closeBackup();
    }
    setStatus("");
    renderAll();
  }

  function fillForm(entry) {
    el("travel-edit-id").value = entry && entry.id ? entry.id : "";
    el("travel-name").value = entry && entry.name ? entry.name : "";
    el("travel-code").value = entry && entry.code ? entry.code : "";
    el("travel-year").value = entry && entry.year ? entry.year : "";
    el("travel-notes").value = entry && entry.notes ? entry.notes : "";
    el("travel-month").value = entry && entry.month ? String(entry.month) : "";
    var nameLabel = el("travel-edit-name");
    if (nameLabel) {
      nameLabel.textContent = entry && entry.name ? entry.name : "";
    }
    editingId = entry ? entry.id : null;
    setEditorStatus("");
  }

  function openDialog(node) {
    if (!node) {
      return;
    }
    if (typeof node.showModal === "function") {
      node.showModal();
    } else {
      node.setAttribute("open", "open");
    }
  }

  function closeDialog(node) {
    if (!node) {
      return;
    }
    if (typeof node.close === "function" && node.open) {
      node.close();
    } else {
      node.removeAttribute("open");
    }
  }

  function openEditor(entry) {
    fillForm(entry || null);
    openDialog(el("travel-editor"));
  }

  function closeEditor() {
    editingId = null;
    closeDialog(el("travel-editor"));
  }

  function openBackup() {
    renderBackup(isAdmin() ? readCountryStore() : []);
    openDialog(el("travel-backup"));
  }

  function closeBackup() {
    closeDialog(el("travel-backup"));
  }

  function closeFilterMenu() {
    var menu = el("travel-filter-menu");
    var btn = el("travel-filter-btn");
    if (menu) {
      menu.hidden = true;
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function toggleFilterMenu() {
    var menu = el("travel-filter-menu");
    var btn = el("travel-filter-btn");
    if (!menu) {
      return;
    }
    menu.hidden = !menu.hidden;
    if (btn) {
      btn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    }
  }

  function markSortButtons() {
    document.querySelectorAll("[data-sort]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-sort") === sortMode);
    });
  }

  function nowStamp() {
    var now = new Date();
    return {
      year: String(now.getFullYear()),
      month: now.getMonth() + 1
    };
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
        month: raw.month,
        notes: raw.notes,
        code: raw.code
      },
      !!(editingId || raw.id)
    );
    if (!entry) {
      setEditorStatus("A country name is required.", true);
      setStatus("A country name is required.", true);
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
      var message = "That country is already on the list.";
      if (editingId) {
        setEditorStatus(message, true);
      } else {
        setStatus(message, true);
      }
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
    selectPlace(entry.id, true);
    renderAll();
  }

  function addSelectedCountry() {
    var select = el("travel-add-select");
    if (!select || !select.value) {
      setStatus("Choose a country to add.", true);
      return;
    }
    var code = select.value;
    var table = names();
    var stamp = nowStamp();
    saveCountry({
      id: "",
      name: table[code] || code,
      code: code,
      year: stamp.year,
      month: stamp.month,
      notes: ""
    });
  }

  function removeCountry(entry) {
    if (!isAdmin()) {
      return;
    }
    var next = readCountryStore().filter(function (item) {
      return item.id !== entry.id;
    });
    writeCountryStore(next);
    if (selectedId === entry.id) {
      selectedId = null;
    }
    setStatus("Removed " + entry.name + ".");
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
    return {
      countries: rows.map(function (row) {
        return normalizeEntry(row, false);
      }).filter(Boolean)
    };
  }

  function applyImport(text) {
    if (!isAdmin()) {
      return;
    }
    try {
      var incoming = parseImport(text);
      writeCountryStore(incoming.countries);
      editingId = null;
      selectedId = null;
      renderAll();
      setStatus(
        incoming.countries.length
          ? "Imported " + incoming.countries.length + (incoming.countries.length === 1 ? " country." : " countries.")
          : "Imported an empty list."
      );
      closeBackup();
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
      resizeGlobe();
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
      .atmosphereColor("#8fb7c8")
      .atmosphereAltitude(0.18)
      .htmlElementsData([])
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlAltitude(0.018)
      .htmlElement(markerElement)
      .htmlTransitionDuration(0);

    globe.pointOfView({ lat: 16, lng: 28, altitude: 1.55 }, 0);

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
    });
    controls.addEventListener("end", function () {
      dragging = false;
      controls.autoRotate = true;
    });

    box.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
      },
      { passive: false }
    );

    resizeGlobe();
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(resizeGlobe).observe(box);
    }
    window.addEventListener("resize", resizeGlobe);
    updateGlobeMarkers();
  }

  function resizeGlobe() {
    if (!globe) {
      return;
    }
    var box = el("travel-globe");
    if (!box) {
      return;
    }
    var width = box.clientWidth;
    var height = box.clientHeight;
    if (width < 8 || height < 8) {
      return;
    }
    globe.width(width);
    globe.height(height);
  }

  function onSave(event) {
    event.preventDefault();
    saveCountry({
      id: el("travel-edit-id").value,
      name: el("travel-name").value,
      year: el("travel-year").value,
      month: el("travel-month").value,
      notes: el("travel-notes").value,
      code: el("travel-code").value
    });
  }

  function startView() {
    applyMode();
    initGlobe();
    requestAnimationFrame(function () {
      resizeGlobe();
    });
  }

  function init() {
    var addForm = el("travel-add-form");
    var form = el("travel-editor-form");
    var cancel = el("travel-cancel-edit");
    var importFile = el("travel-import-file");
    var importBtn = el("travel-import-btn");
    var downloadBtn = el("travel-download");
    var dialog = el("travel-editor");
    var search = el("travel-search");
    var filterBtn = el("travel-filter-btn");
    var backupOpen = el("travel-backup-open");

    if (document.documentElement.classList.contains("is-signed-in") || isAdmin()) {
      startView();
    }

    if (addForm) {
      addForm.addEventListener("submit", function (event) {
        event.preventDefault();
        addSelectedCountry();
      });
    }
    if (form) {
      form.addEventListener("submit", onSave);
    }
    if (cancel) {
      cancel.addEventListener("click", closeEditor);
    }
    if (dialog) {
      dialog.addEventListener("close", function () {
        editingId = null;
      });
    }
    if (search) {
      search.addEventListener("input", function () {
        searchQuery = search.value;
        renderCountryList();
      });
    }
    if (filterBtn) {
      filterBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleFilterMenu();
      });
    }
    document.querySelectorAll("[data-sort]").forEach(function (button) {
      button.addEventListener("click", function () {
        sortMode = button.getAttribute("data-sort") || "name";
        markSortButtons();
        renderCountryList();
        closeFilterMenu();
      });
    });
    if (backupOpen) {
      backupOpen.addEventListener("click", function () {
        closeFilterMenu();
        openBackup();
      });
    }
    document.addEventListener("click", function (event) {
      var tools = event.target.closest(".travel-tools");
      if (!tools) {
        closeFilterMenu();
      }
    });
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
          [el("travel-export").value || JSON.stringify({ countries: [] }, null, 2)],
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
          startView();
        } else {
          applyMode();
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
