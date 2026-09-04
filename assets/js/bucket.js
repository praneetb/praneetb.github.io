(function () {
  "use strict";

  var KEY = "bucket.completed.v1";

  function catalog() {
    var node = document.getElementById("bucket-catalog");
    if (!node) {
      return [];
    }
    try {
      var data = JSON.parse(node.textContent || "{}");
      return Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      return [];
    }
  }

  function knownIds(items) {
    return items.map(function (item) {
      return String(item.id || "");
    }).filter(Boolean);
  }

  function writeCompleted(ids) {
    localStorage.setItem(KEY, JSON.stringify({ completed: ids }));
  }

  function readCompleted(items) {
    var allowed = {};
    knownIds(items).forEach(function (id) {
      allowed[id] = true;
    });
    try {
      var raw = localStorage.getItem(KEY);
      if (raw !== null) {
        var data = JSON.parse(raw);
        var rows = Array.isArray(data)
          ? data
          : data && Array.isArray(data.completed)
            ? data.completed
            : [];
        return rows.map(String).filter(function (id) {
          return allowed[id];
        });
      }
    } catch (err) {
      // Fall through to first-visit seed.
    }
    var seeded = items.filter(function (item) {
      return item && item.defaultCompleted;
    }).map(function (item) {
      return String(item.id);
    }).filter(function (id) {
      return allowed[id];
    });
    writeCompleted(seeded);
    return seeded;
  }

  function setCardState(card, done) {
    if (!card) {
      return;
    }
    card.classList.toggle("is-done", done);
    var box = card.querySelector("[data-bucket-check]");
    if (box) {
      box.checked = done;
    }
  }

  function renderProgress(doneCount, total) {
    var node = document.getElementById("bucket-progress");
    if (!node) {
      return;
    }
    node.textContent = doneCount + " of " + total + " completed · saved on this device";
  }

  function init() {
    var items = catalog();
    if (!items.length) {
      return;
    }
    var completed = {};
    readCompleted(items).forEach(function (id) {
      completed[id] = true;
    });

    items.forEach(function (item) {
      var id = String(item.id || "");
      var card = document.querySelector('[data-bucket-id="' + id + '"]');
      setCardState(card, !!completed[id]);
    });

    renderProgress(Object.keys(completed).length, items.length);

    document.addEventListener("change", function (event) {
      var input = event.target.closest("[data-bucket-check]");
      if (!input) {
        return;
      }
      var id = String(input.getAttribute("data-bucket-check") || "");
      if (!id) {
        return;
      }
      var current = {};
      readCompleted(items).forEach(function (existing) {
        current[existing] = true;
      });
      if (input.checked) {
        current[id] = true;
      } else {
        delete current[id];
      }
      var ids = Object.keys(current);
      writeCompleted(ids);
      setCardState(input.closest(".bucket-card"), input.checked);
      renderProgress(ids.length, items.length);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
