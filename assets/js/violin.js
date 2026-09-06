(function () {
  "use strict";

  function readData() {
    var node = document.getElementById("violin-data");
    if (!node) {
      return null;
    }
    try {
      return JSON.parse(node.textContent || "{}");
    } catch (err) {
      return null;
    }
  }

  function uniqueDates(logs) {
    var seen = {};
    var dates = [];
    (logs || []).forEach(function (entry) {
      var day = String((entry && entry.date) || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && !seen[day]) {
        seen[day] = true;
        dates.push(day);
      }
    });
    dates.sort();
    return dates;
  }

  function deriveProgress(logs) {
    var dates = uniqueDates(logs);
    if (!dates.length) {
      return { streak_days: 0, weeks: 0 };
    }
    var first = new Date(dates[0] + "T00:00:00");
    var last = new Date(dates[dates.length - 1] + "T00:00:00");
    var weeks = Math.max(1, Math.ceil((Math.round((last - first) / 86400000) + 1) / 7));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var gap = Math.round((today - last) / 86400000);
    if (gap > 1) {
      return { streak_days: 0, weeks: weeks };
    }
    var have = {};
    dates.forEach(function (day) {
      have[day] = true;
    });
    var cursor = new Date(last);
    var streak = 0;
    while (have[cursor.toISOString().slice(0, 10)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { streak_days: streak, weeks: weeks };
  }

  function queryId() {
    try {
      return new URLSearchParams(location.search).get("id") || "";
    } catch (err) {
      return "";
    }
  }

  function showById(selector, id, attr) {
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) {
      return;
    }
    var found = false;
    Array.prototype.forEach.call(nodes, function (node) {
      var match = node.getAttribute(attr) === id;
      if (match) {
        found = true;
      }
      node.hidden = id ? !match : node !== nodes[0];
    });
    if (id && !found) {
      nodes[0].hidden = false;
    }
  }

  function renderFoyerStats(progress) {
    var weeksNode = document.querySelector("[data-violin-weeks]");
    var streakNode = document.querySelector("[data-violin-streak]");
    var label = document.querySelector(".violin-weeks-label");
    if (weeksNode) {
      weeksNode.textContent = String(progress.weeks);
    }
    if (label) {
      label.textContent = progress.weeks === 1 ? "week" : "weeks";
    }
    if (streakNode) {
      streakNode.textContent = progress.streak_days > 0 ? progress.streak_days + "-day streak" : "No streak yet";
    }
    var homeStreak = document.querySelector("[data-home-violin-streak]");
    if (homeStreak) {
      if (progress.streak_days > 0) {
        homeStreak.hidden = false;
        homeStreak.textContent = progress.streak_days + " day streak";
      } else {
        homeStreak.hidden = true;
      }
    }
  }

  function init() {
    var data = readData() || {};
    var progress = deriveProgress(data.practice_log || []);
    if (!progress.weeks && data.weeks) {
      progress.weeks = data.weeks;
    }
    if (!progress.streak_days && data.streak_days) {
      progress.streak_days = data.streak_days;
    }
    renderFoyerStats(progress);
    showById(".violin-piece-detail", queryId(), "data-piece-id");
    showById(".violin-take[data-recording-id]", queryId(), "data-recording-id");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
