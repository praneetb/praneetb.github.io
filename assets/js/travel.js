(function () {
  "use strict";

  var STORAGE_KEY = "travel.countries.v1";
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

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
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

  function writeStore(list) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        countries: list
      })
    );
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
    return rows.map(function (row) {
      return normalizeEntry(row, false);
    }).filter(Boolean);
  }

  function project(lon, lat) {
    var x = (Number(lon) + 180) / 360;
    var y = (75 - Number(lat)) / 135;
    return {
      left: Math.min(98, Math.max(2, x * 100)).toFixed(2) + "%",
      top: Math.min(96, Math.max(4, y * 100)).toFixed(2) + "%"
    };
  }

  function clearPrivateDom() {
    var pins = el("travel-pins");
    var root = el("travel-admin-root");
    if (pins) {
      pins.replaceChildren();
      pins.hidden = true;
    }
    if (root) {
      root.hidden = true;
      root.replaceChildren();
      delete root.dataset.ready;
    }
    editingId = null;
  }

  function bindAdminControls() {
    var editor = el("travel-editor");
    var cancel = el("travel-cancel-edit");
    var importFile = el("travel-import-file");
    var importBtn = el("travel-import-btn");
    var downloadBtn = el("travel-download");
    if (editor) {
      editor.addEventListener("submit", onSave);
    }
    if (cancel) {
      cancel.addEventListener("click", onCancelEdit);
    }
    if (importFile) {
      importFile.addEventListener("change", onImportFile);
    }
    if (importBtn) {
      importBtn.addEventListener("click", onImportText);
    }
    if (downloadBtn) {
      downloadBtn.addEventListener("click", onExportDownload);
    }
  }

  function mountAdmin() {
    var root = el("travel-admin-root");
    var template = el("travel-admin-template");
    if (!root || !template) {
      return false;
    }
    if (!root.dataset.ready) {
      root.appendChild(template.content.cloneNode(true));
      root.dataset.ready = "1";
      bindAdminControls();
    }
    root.hidden = false;
    return true;
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

  function fillForm(entry) {
    el("travel-name").value = entry && entry.name ? entry.name : "";
    el("travel-year").value = entry && entry.year ? entry.year : "";
    el("travel-notes").value = entry && entry.notes ? entry.notes : "";
    el("travel-code").value = entry && entry.code ? entry.code : "";
    var save = el("travel-save");
    var cancel = el("travel-cancel-edit");
    if (save) {
      save.textContent = entry ? "Save changes" : "Add country";
    }
    if (cancel) {
      cancel.hidden = !entry;
    }
  }

  function renderPins(list) {
    var pins = el("travel-pins");
    var centroids = window.ISO_CENTROIDS || {};
    if (!pins) {
      return;
    }
    pins.replaceChildren();
    var shown = 0;
    list.forEach(function (entry) {
      if (!entry.code || !centroids[entry.code]) {
        return;
      }
      var point = project(centroids[entry.code][0], centroids[entry.code][1]);
      var pin = document.createElement("span");
      pin.className = "travel-pin";
      pin.style.left = point.left;
      pin.style.top = point.top;
      pin.title = entry.name;
      pin.setAttribute("aria-hidden", "true");
      pins.appendChild(pin);
      shown += 1;
    });
    pins.hidden = shown === 0;
  }

  function renderList(list) {
    var root = el("travel-admin-list");
    if (!root) {
      return;
    }
    root.replaceChildren();
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No countries saved in this browser yet.";
      root.appendChild(empty);
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "place-list";
    list.forEach(function (entry) {
      var li = document.createElement("li");
      var name = document.createElement("p");
      name.className = "place-name";
      name.textContent = entry.name;
      li.appendChild(name);
      var metaBits = [];
      if (entry.year) {
        metaBits.push(entry.year);
      }
      if (entry.code) {
        metaBits.push(entry.code);
      }
      if (entry.notes) {
        metaBits.push(entry.notes);
      }
      if (metaBits.length) {
        var meta = document.createElement("p");
        meta.className = "place-meta";
        meta.textContent = metaBits.join(" · ");
        li.appendChild(meta);
      }
      var actions = document.createElement("p");
      actions.className = "travel-row-actions";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "travel-btn travel-btn-quiet";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        editingId = entry.id;
        fillForm(entry);
        el("travel-name").focus();
        setStatus("Editing " + entry.name + ".");
      });
      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "travel-btn travel-btn-quiet";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm("Remove this country from this browser?")) {
          return;
        }
        var next = readStore().filter(function (item) {
          return item.id !== entry.id;
        });
        writeStore(next);
        if (editingId === entry.id) {
          editingId = null;
          fillForm(null);
        }
        renderAdmin();
        setStatus("Removed " + entry.name + ".");
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      li.appendChild(actions);
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }

  function renderAdmin() {
    var list = readStore();
    var count = el("travel-count");
    if (count) {
      count.hidden = false;
      count.textContent = list.length
        ? list.length + (list.length === 1 ? " country" : " countries") + " in this browser"
        : "No countries in this browser";
    }
    renderPins(list);
    renderList(list);
    var exportBox = el("travel-export");
    if (exportBox) {
      exportBox.value = JSON.stringify({ countries: list }, null, 2);
    }
  }

  function showPublic() {
    var publicLede = el("travel-public-lede");
    var adminLede = el("travel-admin-lede");
    var publicEmpty = el("travel-public-empty");
    var gate = el("travel-gate");
    var unlockBtn = el("travel-unlock");
    var lockBtn = el("travel-lock");
    var count = el("travel-count");
    var mapImg = el("travel-map-img");
    document.body.classList.remove("travel-is-admin");
    clearPrivateDom();
    if (publicLede) {
      publicLede.hidden = false;
    }
    if (adminLede) {
      adminLede.hidden = true;
    }
    if (publicEmpty) {
      publicEmpty.hidden = false;
    }
    if (gate) {
      gate.hidden = true;
    }
    if (unlockBtn) {
      unlockBtn.hidden = false;
    }
    if (lockBtn) {
      lockBtn.hidden = true;
    }
    if (count) {
      count.hidden = true;
      count.textContent = "";
    }
    if (mapImg) {
      mapImg.alt = "Blank outline map of the world";
    }
    setStatus("");
  }

  function showAdmin() {
    var publicLede = el("travel-public-lede");
    var adminLede = el("travel-admin-lede");
    var publicEmpty = el("travel-public-empty");
    var gate = el("travel-gate");
    var unlockBtn = el("travel-unlock");
    var lockBtn = el("travel-lock");
    var mapImg = el("travel-map-img");
    document.body.classList.add("travel-is-admin");
    mountAdmin();
    if (publicLede) {
      publicLede.hidden = true;
    }
    if (adminLede) {
      adminLede.hidden = false;
    }
    if (publicEmpty) {
      publicEmpty.hidden = true;
    }
    if (gate) {
      gate.hidden = true;
    }
    if (unlockBtn) {
      unlockBtn.hidden = true;
    }
    if (lockBtn) {
      lockBtn.hidden = false;
    }
    if (mapImg) {
      mapImg.alt = "Outline map of the world";
    }
    fillForm(null);
    renderAdmin();
  }

  function applyMode() {
    if (isAdmin()) {
      showAdmin();
    } else {
      showPublic();
    }
  }

  function onUnlockSubmit(event) {
    event.preventDefault();
    var api = admin();
    var input = el("travel-password");
    var error = el("travel-gate-error");
    if (!api || !api.isConfigured()) {
      if (error) {
        error.hidden = false;
        error.textContent = "This gate is not configured yet.";
      }
      return;
    }
    api.tryUnlock(input ? input.value : "").then(function (result) {
      if (result.unconfigured) {
        if (error) {
          error.hidden = false;
          error.textContent = "This gate is not configured yet.";
        }
        return;
      }
      if (!result.ok) {
        if (error) {
          error.hidden = false;
          error.textContent = "That password is not correct.";
        }
        if (input) {
          input.value = "";
          input.focus();
        }
        return;
      }
      if (input) {
        input.value = "";
      }
      if (error) {
        error.hidden = true;
        error.textContent = "";
      }
      showAdmin();
    });
  }

  function onSave(event) {
    event.preventDefault();
    if (!isAdmin()) {
      return;
    }
    var entry = normalizeEntry(
      {
        id: editingId,
        name: el("travel-name").value,
        year: el("travel-year").value,
        notes: el("travel-notes").value,
        code: el("travel-code").value
      },
      !!editingId
    );
    if (!entry) {
      setStatus("A country name is required.", true);
      el("travel-name").focus();
      return;
    }
    var list = readStore();
    if (editingId) {
      list = list.map(function (item) {
        return item.id === editingId ? entry : item;
      });
    } else {
      list.push(entry);
    }
    writeStore(list);
    editingId = null;
    fillForm(null);
    renderAdmin();
    setStatus(entry.name + " saved in this browser.");
  }

  function onCancelEdit() {
    editingId = null;
    fillForm(null);
    setStatus("");
  }

  function onImportFile(event) {
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
  }

  function onImportText() {
    applyImport(el("travel-import").value);
  }

  function applyImport(text) {
    if (!isAdmin()) {
      return;
    }
    try {
      var incoming = parseImport(text);
      writeStore(incoming);
      editingId = null;
      fillForm(null);
      renderAdmin();
      setStatus(
        incoming.length
          ? "Imported " + incoming.length + (incoming.length === 1 ? " country." : " countries.")
          : "Imported an empty list."
      );
    } catch (err) {
      setStatus("Import failed. Use a JSON countries list.", true);
    }
  }

  function onExportDownload() {
    if (!isAdmin()) {
      return;
    }
    var blob = new Blob([el("travel-export").value || JSON.stringify({ countries: [] }, null, 2)], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "travel-countries.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function init() {
    applyMode();

    var unlockBtn = el("travel-unlock");
    var lockBtn = el("travel-lock");
    var gate = el("travel-gate");
    var form = el("travel-gate-form");

    if (unlockBtn) {
      unlockBtn.addEventListener("click", function () {
        if (gate) {
          gate.hidden = !gate.hidden;
          if (!gate.hidden) {
            var input = el("travel-password");
            if (input) {
              input.focus();
            }
          }
        }
      });
    }
    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        var api = admin();
        if (api) {
          api.lock();
        }
        showPublic();
      });
    }
    if (form) {
      form.addEventListener("submit", onUnlockSubmit);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
