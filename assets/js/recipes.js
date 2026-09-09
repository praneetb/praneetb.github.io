(function () {
  "use strict";

  var chip = "all";
  var query = "";

  function $(id) {
    return document.getElementById(id);
  }

  function allowedChip(value) {
    return !!document.querySelector('[data-filter="' + value + '"]');
  }

  function cards() {
    return document.querySelectorAll("[data-recipe-card]");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    var nextChip = params.get("chip");
    var nextQuery = params.get("q");
    if (nextChip && allowedChip(nextChip)) {
      chip = nextChip;
    }
    if (nextQuery) {
      query = nextQuery;
      var input = $("recipe-browse-search");
      if (input) {
        input.value = nextQuery;
      }
    }
  }

  function matches(card) {
    var cardChip = card.getAttribute("data-chip") || "";
    if (chip !== "all" && cardChip !== chip) {
      return false;
    }
    var needle = normalize(query);
    if (!needle) {
      return true;
    }
    return normalize(card.getAttribute("data-search") || card.textContent).indexOf(needle) !== -1;
  }

  function apply() {
    var visibleLetters = {};
    var shown = 0;
    var list = cards();
    for (var i = 0; i < list.length; i += 1) {
      var card = list[i];
      var on = matches(card);
      card.hidden = !on;
      if (on) {
        shown += 1;
        visibleLetters[card.getAttribute("data-letter")] = true;
      }
    }

    var empty = $("recipe-browse-empty");
    if (empty) {
      empty.hidden = shown > 0;
    }

    var chipButtons = document.querySelectorAll("[data-filter]");
    for (var c = 0; c < chipButtons.length; c += 1) {
      var active = chipButtons[c].getAttribute("data-filter") === chip;
      chipButtons[c].classList.toggle("is-active", active);
      chipButtons[c].setAttribute("aria-pressed", active ? "true" : "false");
    }

    var letters = document.querySelectorAll("[data-az]");
    for (var a = 0; a < letters.length; a += 1) {
      var node = letters[a];
      var live = !!visibleLetters[node.getAttribute("data-az")];
      node.classList.toggle("is-live", live);
      if (live) {
        node.removeAttribute("aria-disabled");
        if (node.tagName === "A") {
          node.setAttribute("tabindex", "0");
        }
      } else {
        node.setAttribute("aria-disabled", "true");
        if (node.tagName === "A") {
          node.setAttribute("tabindex", "-1");
        }
      }
    }
  }

  function bind() {
    var chips = document.querySelector(".food-browse-chips");
    if (chips) {
      chips.addEventListener("click", function (event) {
        var button = event.target.closest("[data-filter]");
        if (!button) {
          return;
        }
        chip = button.getAttribute("data-filter") || "all";
        apply();
      });
    }

    var search = $("recipe-browse-search");
    if (search) {
      search.addEventListener("input", function () {
        query = search.value;
        apply();
      });
    }

    var az = document.querySelector(".food-az");
    if (az) {
      az.addEventListener("click", function (event) {
        var link = event.target.closest("[data-az]");
        if (!link || !link.classList.contains("is-live")) {
          event.preventDefault();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      var key = event.key;
      var meta = event.metaKey || event.ctrlKey;
      if (!meta || (key !== "k" && key !== "K") || event.altKey) {
        return;
      }
      if (!search) {
        return;
      }
      event.preventDefault();
      search.focus();
    });
  }

  readParams();
  bind();
  apply();
})();
