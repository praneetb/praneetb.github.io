(function () {
  "use strict";

  var H = window.HealthData;
  var SPORT_NAMES = {
    "-1": "Activity",
    "0": "Running",
    "1": "Cycling",
    "16": "Baseball",
    "17": "Basketball",
    "18": "Rowing",
    "21": "Football",
    "22": "Golf",
    "33": "Swimming",
    "34": "Tennis",
    "39": "Boxing",
    "43": "Pilates",
    "44": "Yoga",
    "45": "Weightlifting",
    "48": "Functional Fitness",
    "52": "Hiking",
    "63": "Walking",
    "64": "Surfing",
    "65": "Elliptical",
    "71": "Rugby",
    "74": "Running",
    "96": "HIIT",
    "97": "Spin",
    "101": "Pickleball",
    "123": "Strength Trainer",
    "126": "Assault Bike",
    "128": "Stretching"
  };

  var state = {
    snapshot: null,
    selectedDate: null,
    range: "day",
    selectedWorkout: null,
    detailFocus: "activity"
  };

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(message) {
    var node = el("health-status");
    if (!node) {
      return;
    }
    node.hidden = !message;
    node.textContent = message || "";
  }

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function fmtInt(n) {
    if (n == null || !isFinite(Number(n))) {
      return "—";
    }
    return String(Math.round(Number(n)));
  }

  function fmt1(n) {
    if (n == null || !isFinite(Number(n))) {
      return "—";
    }
    var v = round1(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function fmtMinutes(n) {
    if (n == null || !isFinite(Number(n))) {
      return "—";
    }
    var rounded = Math.round(Number(n) * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
      return String(Math.round(rounded)) + " min";
    }
    return rounded.toFixed(1) + " min";
  }

  function fmtPercent(n) {
    if (n == null || !isFinite(Number(n))) {
      return "—";
    }
    return String(Math.round(n)) + "%";
  }

  function fmtDuration(ms) {
    if (ms == null || !isFinite(ms) || ms <= 0) {
      return "—";
    }
    var totalMin = Math.round(ms / 60000);
    var hours = Math.floor(totalMin / 60);
    var minutes = totalMin % 60;
    if (hours <= 0) {
      return minutes + "m";
    }
    return hours + "h " + minutes + "m";
  }

  function fmtHms(ms) {
    if (ms == null || !isFinite(ms) || ms <= 0) {
      return "—";
    }
    var total = Math.round(ms / 1000);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;
    return (
      (hours < 10 ? "0" : "") +
      hours +
      ":" +
      (minutes < 10 ? "0" : "") +
      minutes +
      ":" +
      (seconds < 10 ? "0" : "") +
      seconds
    );
  }

  function fmtKm(meters) {
    if (meters == null || !isFinite(Number(meters)) || Number(meters) <= 0) {
      return "";
    }
    var km = Number(meters) / 1000;
    return (Math.round(km * 100) / 100).toFixed(km >= 10 ? 1 : 2) + " km";
  }

  function fmtKcal(kj) {
    if (kj == null || !isFinite(Number(kj)) || Number(kj) <= 0) {
      return "";
    }
    return Math.round(Number(kj) / 4.184) + " kcal";
  }

  function fmtPace(meters, ms) {
    if (!meters || !ms || meters <= 0 || ms <= 0) {
      return "";
    }
    var minPerKm = ms / 60000 / (meters / 1000);
    if (!isFinite(minPerKm) || minPerKm <= 0 || minPerKm > 40) {
      return "";
    }
    var minutes = Math.floor(minPerKm);
    var seconds = Math.round((minPerKm - minutes) * 60);
    if (seconds === 60) {
      minutes += 1;
      seconds = 0;
    }
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds + " /km";
  }

  function sportName(id) {
    var key = String(id);
    return SPORT_NAMES[key] || "Sport " + key;
  }

  function sportSlug(id) {
    return sportName(id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function recoveryStatus(score) {
    if (score == null) {
      return { text: "Waiting on score", tone: "#8a837a" };
    }
    if (score >= 67) {
      return { text: "Good balance", tone: "#3f8f5a" };
    }
    if (score >= 34) {
      return { text: "Take it steady", tone: "#c28a2e" };
    }
    return { text: "Prioritize rest", tone: "#c45c4a" };
  }

  function strainStatus(strain) {
    if (strain == null) {
      return { text: "No strain yet", tone: "#8a837a" };
    }
    if (strain < 8) {
      return { text: "Easy day · Keep it light", tone: "#3f8f5a" };
    }
    if (strain < 14) {
      return { text: "Moderate · Keep it smart", tone: "#c28a2e" };
    }
    return { text: "High · Recover well", tone: "#c45c4a" };
  }

  function sleepStatus(pct) {
    if (pct == null) {
      return { text: "No sleep score", tone: "#8a837a" };
    }
    if (pct >= 85) {
      return { text: "Restorative", tone: "#6a5aa8" };
    }
    if (pct >= 70) {
      return { text: "Solid enough", tone: "#7a6bb0" };
    }
    return { text: "Short on sleep", tone: "#9a6a88" };
  }

  function hrStatus(hrv, rhr) {
    if (hrv == null && rhr == null) {
      return { text: "No signals yet", tone: "#8a837a" };
    }
    return { text: "Balanced signals", tone: "#6a5aa8" };
  }

  function iconSvg(kind) {
    if (kind === "recovery") {
      return '<svg class="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 19c-4-3.4-7-6.1-7-9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.8C19 12.9 16 15.6 12 19z"/><path d="M12 7.2c.6-1.4 1.8-2.2 3.2-2.2"/></svg>';
    }
    if (kind === "strain") {
      return '<svg class="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 16.5 8.2 10l2.4 3.2L14 7.5 19 16.5"/><path d="M4.5 19h15"/></svg>';
    }
    if (kind === "sleep") {
      return '<svg class="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14.5 5.2A6.8 6.8 0 0 0 8 17.4 6.8 6.8 0 0 1 14.5 5.2z"/></svg>';
    }
    return '<svg class="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 19s-6.5-4.2-6.5-9A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 6.5 3c0 4.8-6.5 9-6.5 9z"/></svg>';
  }

  function washiClass(kind) {
    if (kind === "recovery") {
      return "washi-dots";
    }
    if (kind === "strain") {
      return "washi-stripe";
    }
    if (kind === "sleep") {
      return "washi-lilac";
    }
    return "washi-grid";
  }

  function selectedDay() {
    return H.dayByDate(state.snapshot, state.selectedDate);
  }

  function rangeDays() {
    return H.daysInRange(state.snapshot, state.selectedDate, state.range);
  }

  function recoveryDotTone(score) {
    if (score == null) {
      return "#b7b0a6";
    }
    if (score >= 67) {
      return "#5aae7a";
    }
    if (score >= 34) {
      return "#d4b04a";
    }
    return "#d45454";
  }

  function miniSpark(points, stroke) {
    if (!points.length) {
      return "";
    }
    var w = 120;
    var h = 28;
    var pad = 2;
    var min = points[0];
    var max = points[0];
    var i;
    for (i = 1; i < points.length; i += 1) {
      min = Math.min(min, points[i]);
      max = Math.max(max, points[i]);
    }
    if (min === max) {
      max = min + 1;
    }
    var coords = points.map(function (value, index) {
      var x = pad + (points.length === 1 ? (w - pad * 2) / 2 : (index / (points.length - 1)) * (w - pad * 2));
      var y = pad + (1 - (value - min) / (max - min)) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    return (
      '<svg class="vital-spark" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" aria-hidden="true"><polyline fill="none" stroke="' +
      stroke +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' +
      coords.join(" ") +
      '"/></svg>'
    );
  }

  function weekSeries(getter) {
    var dates = H.rangeDates(state.selectedDate, "week");
    var values = [];
    var i;
    for (i = 0; i < dates.length; i += 1) {
      var day = H.dayByDate(state.snapshot, dates[i]);
      var value = getter(day);
      if (value != null && isFinite(Number(value))) {
        values.push(Number(value));
      }
    }
    return values;
  }

  function vitalCard(opts) {
    var status = opts.status || { text: "", tone: "#8a837a" };
    return (
      '<button type="button" class="scrapbook-card vital-card" data-kind="' +
      opts.kind +
      '" data-open-detail="' +
      opts.kind +
      '">' +
      '<div class="washi ' +
      washiClass(opts.kind) +
      '" aria-hidden="true"></div>' +
      '<p class="vital-label">' +
      opts.label +
      "</p>" +
      '<p class="vital-value">' +
      opts.value +
      "</p>" +
      '<p class="vital-status" style="color:' +
      status.tone +
      '"><span class="vital-dot" aria-hidden="true"></span>' +
      esc(status.text) +
      "</p>" +
      (opts.extra || "") +
      iconSvg(opts.kind) +
      "</button>"
    );
  }

  function zoneBar(zones, compact) {
    var table = H.zoneRows(zones);
    if (!table) {
      return "";
    }
    var parts = table.rows
      .filter(function (row) {
        return row.minutes != null && row.minutes > 0;
      })
      .map(function (row) {
        var width = table.total > 0 ? (row.minutes / table.total) * 100 : 0;
        return (
          '<span class="zone-seg" style="width:' +
          width.toFixed(2) +
          "%;background:" +
          row.tone +
          '" title="' +
          esc(row.short + " " + fmtMinutes(row.minutes)) +
          '"></span>'
        );
      });
    if (!parts.length) {
      return compact
        ? ""
        : '<div class="zone-bar zone-bar-empty" aria-hidden="true"></div>';
    }
    return '<div class="zone-bar' + (compact ? " is-compact" : "") + '" aria-hidden="true">' + parts.join("") + "</div>";
  }

  function zoneEmptyState() {
    return (
      '<div class="zone-empty scrapbook-card">' +
      '<p class="zone-empty-kicker">HR zones</p>' +
      "<p>Zones arrive with next Whoop bake</p>" +
      "<p class=\"zone-empty-note\">No zone minutes in this snapshot — nothing invented.</p>" +
      "</div>"
    );
  }

  function zoneTable(zones, caption) {
    var table = H.zoneRows(zones);
    if (!table) {
      return zoneEmptyState();
    }
    var rows = table.rows
      .map(function (row) {
        var width = row.percent == null ? 0 : Math.max(row.percent, row.minutes ? 2 : 0);
        return (
          '<div class="zone-row">' +
          '<span class="zone-swatch" style="background:' +
          row.tone +
          '" aria-hidden="true"></span>' +
          '<span class="zone-name">' +
          esc(row.short) +
          " " +
          esc(row.label) +
          "</span>" +
          '<span class="zone-track"><span class="zone-fill" style="width:' +
          width.toFixed(1) +
          "%;background:" +
          row.tone +
          '"></span></span>' +
          '<span class="zone-min">' +
          esc(fmtMinutes(row.minutes)) +
          "</span>" +
          '<span class="zone-pct">' +
          esc(fmtPercent(row.percent)) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<article class="scrapbook-card zone-card">' +
      '<div class="washi washi-stripe" aria-hidden="true"></div>' +
      "<h3>" +
      esc(caption || "Time in HR zones") +
      "</h3>" +
      '<div class="zone-table">' +
      rows +
      "</div>" +
      '<p class="zone-scale"><span>&lt; 60%</span><span>60–70%</span><span>70–80%</span><span>80–90%</span><span>90%+</span></p>' +
      "</article>"
    );
  }

  function renderPicker() {
    var host = el("health-picker");
    if (!host || !H) {
      return;
    }
    var today = H.todayYmd();
    var dates = H.pickerDates();
    var first = dates[0];
    var last = dates[dates.length - 1];
    var jumps = [
      { offset: 0, label: "Today" },
      { offset: -1, label: "Yesterday" },
      { offset: -2, label: "−2d" }
    ];
    var jumpHtml = jumps
      .map(function (jump, index) {
        var ymd = H.addDays(today, jump.offset);
        var current = ymd === state.selectedDate ? ' aria-current="date"' : "";
        return (
          (index ? '<span aria-hidden="true"> · </span>' : "") +
          '<button type="button" class="picker-jump" data-picker-date="' +
          esc(ymd) +
          '"' +
          current +
          ">" +
          jump.label +
          "</button>"
        );
      })
      .join("");
    var dots = dates
      .map(function (ymd) {
        var day = H.dayByDate(state.snapshot, ymd);
        var available = !!day;
        var score = day && day.recovery ? day.recovery.recovery_score : null;
        var selected = ymd === state.selectedDate;
        return (
          '<button type="button" class="scrub-dot' +
          (selected ? " is-selected" : "") +
          (available ? "" : " is-empty") +
          '" data-picker-date="' +
          esc(ymd) +
          '"' +
          (available ? "" : " disabled") +
          ' style="--dot:' +
          recoveryDotTone(score) +
          '" title="' +
          esc(H.formatPickerDate(ymd)) +
          (available ? "" : " · no snapshot") +
          '" aria-label="' +
          esc(H.formatPickerDate(ymd)) +
          '"' +
          (selected ? ' aria-current="date"' : "") +
          "></button>"
        );
      })
      .join("");

    host.innerHTML =
      '<div class="washi washi-dots" aria-hidden="true"></div>' +
      '<div class="picker-nav">' +
      '<button type="button" class="picker-arrow" data-picker-step="-1" aria-label="Previous day"' +
      (state.selectedDate <= first ? " disabled" : "") +
      ">‹</button>" +
      '<p class="picker-date"><span class="picker-sun" aria-hidden="true">☀</span>' +
      esc(H.formatPickerDate(state.selectedDate)) +
      "</p>" +
      '<button type="button" class="picker-arrow" data-picker-step="1" aria-label="Next day"' +
      (state.selectedDate >= last ? " disabled" : "") +
      ">›</button>" +
      "</div>" +
      '<p class="picker-jumps">' +
      jumpHtml +
      "</p>" +
      '<div class="picker-scrub" role="listbox" aria-label="Available snapshot days">' +
      dots +
      "</div>" +
      '<p class="picker-hint">Tap a dot to jump to that day <span aria-hidden="true">→</span></p>';
  }

  function renderCards() {
    var host = el("health-cards");
    if (!host) {
      return;
    }
    var day = selectedDay() || {};
    var summary = (state.snapshot && state.snapshot.summary) || {};
    var recovery = H.firstNumber(day.recovery || {}, ["recovery_score"]);
    if (recovery == null && (!day.date || day.date === (state.snapshot && state.snapshot.as_of))) {
      recovery = H.firstNumber((summary.latest_recovery || {}), ["recovery_score"]);
    }
    var strain = day.cycle_strain ? H.firstNumber(day.cycle_strain, ["strain"]) : null;
    var sleep = day.sleep || {};
    var sleepPct = H.sleepPerformance(sleep);
    if (sleepPct == null && (!day.date || day.date === (state.snapshot && state.snapshot.as_of))) {
      sleepPct = H.sleepPerformance(summary.latest_sleep || {});
    }
    var sleepMs = H.sleepDurationMilli(sleep);
    var hrv = H.firstNumber(day.recovery || {}, ["hrv_rmssd_milli"]);
    var rhr = H.firstNumber(day.recovery || {}, ["resting_heart_rate"]);
    if (hrv == null && (!day.date || day.date === (state.snapshot && state.snapshot.as_of))) {
      hrv = H.firstNumber(summary.latest_recovery || {}, ["hrv_rmssd_milli"]);
    }
    if (rhr == null && (!day.date || day.date === (state.snapshot && state.snapshot.as_of))) {
      rhr = H.firstNumber(summary.latest_recovery || {}, ["resting_heart_rate"]);
    }

    var recoverySpark = miniSpark(
      weekSeries(function (d) {
        return d && d.recovery ? d.recovery.recovery_score : null;
      }),
      "#4f9a68"
    );
    var dayZones = H.dayHrZones(day);
    var topZone = H.dominantZone(dayZones);
    var strainLink = topZone
      ? '<p class="vital-link">' + esc(topZone.short.replace("Z", "Zone ")) + " →</p>"
      : '<p class="vital-link">Zones →</p>';
    var sleepValue =
      sleepMs != null
        ? esc(fmtDuration(sleepMs))
        : sleepPct == null
          ? "—"
          : fmtInt(sleepPct) + "<small>%</small>";
    var sleepExtra =
      sleepMs != null && sleepPct != null
        ? '<p class="vital-link">Score ' + fmtInt(sleepPct) + " →</p>"
        : '<p class="vital-link">Sleep detail →</p>';

    host.innerHTML =
      vitalCard({
        kind: "recovery",
        label: "Recovery",
        value: recovery == null ? "—" : fmtInt(recovery) + "<small>%</small>",
        status: recoveryStatus(recovery),
        extra: recoverySpark
      }) +
      vitalCard({
        kind: "strain",
        label: "Strain",
        value: strain == null ? "—" : fmt1(strain),
        status: strainStatus(strain),
        extra: strainLink
      }) +
      vitalCard({
        kind: "sleep",
        label: "Sleep",
        value: sleepValue,
        status: sleepStatus(sleepPct),
        extra: sleepExtra
      }) +
      vitalCard({
        kind: "hr",
        label: "HRV · RHR",
        value:
          (hrv == null ? "—" : fmtInt(hrv) + "<small>ms</small>") +
          " · " +
          (rhr == null ? "—" : fmtInt(rhr) + "<small> bpm</small>"),
        status: hrStatus(hrv, rhr),
        extra: '<p class="vital-link">HRV 7-day trend →</p>'
      });
  }

  function workoutMetaBits(row) {
    var w = row.workout || {};
    var ms = H.durationMs(w.start, w.end);
    var bits = [];
    if (ms != null) {
      bits.push(Math.max(1, Math.round(ms / 60000)) + " min");
    }
    var km = fmtKm(w.distance_meter);
    if (km) {
      bits.push(km);
    }
    var pace = fmtPace(w.distance_meter, ms);
    if (pace) {
      bits.push(pace);
    }
    var kcal = fmtKcal(w.kilojoule);
    if (kcal) {
      bits.push(kcal);
    }
    return bits;
  }

  function renderWorkouts() {
    var host = el("health-workouts");
    if (!host) {
      return;
    }
    var day = selectedDay();
    var rows = day ? H.workoutsInRange([day]) : [];
    var title = "☆ Activity for " + H.formatPickerDate(state.selectedDate) + " ☆";
    if (!rows.length) {
      host.innerHTML =
        '<article class="scrapbook-card workout-chip"><h3>' +
        esc(title) +
        '</h3><p class="workout-empty">No scored workouts on this day.</p></article>';
      return;
    }
    host.innerHTML =
      '<h2 class="workout-heading">' +
      esc(title) +
      "</h2>" +
      rows
        .map(function (row) {
          var w = row.workout || {};
          var name = sportName(w.sport_id);
          var slug = sportSlug(w.sport_id);
          var bits = workoutMetaBits(row);
          var zones = H.workoutHrZones(w);
          return (
            '<button type="button" class="scrapbook-card workout-chip" data-sport="' +
            esc(slug) +
            '" data-open-workout="' +
            esc(row.day) +
            ":" +
            row.index +
            '">' +
            '<div class="washi washi-dots" aria-hidden="true"></div>' +
            "<h3>" +
            esc(name) +
            "</h3>" +
            '<p class="workout-meta">' +
            esc(bits.join(" · ") || H.formatLongDate(row.day)) +
            "</p>" +
            '<p class="workout-strain">Strain ' +
            esc(w.strain == null ? "—" : fmt1(w.strain)) +
            "</p>" +
            zoneBar(zones, true) +
            "</button>"
          );
        })
        .join("");
  }

  function seriesFromDays(days, pick) {
    var values = [];
    var i;
    for (i = 0; i < days.length; i += 1) {
      var v = pick(days[i]);
      if (v != null && isFinite(Number(v))) {
        values.push({ date: days[i].date, value: Number(v) });
      }
    }
    return values;
  }

  function sparklineSvg(points, stroke) {
    if (!points.length) {
      return '<p class="workout-empty">No data yet.</p>';
    }
    var w = 280;
    var h = 56;
    var pad = 4;
    var min = points[0].value;
    var max = points[0].value;
    var i;
    for (i = 1; i < points.length; i += 1) {
      min = Math.min(min, points[i].value);
      max = Math.max(max, points[i].value);
    }
    if (min === max) {
      max = min + 1;
    }
    var coords = points.map(function (p, index) {
      var x =
        pad +
        (points.length === 1 ? (w - pad * 2) / 2 : (index / (points.length - 1)) * (w - pad * 2));
      var y = pad + (1 - (p.value - min) / (max - min)) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    return (
      '<svg class="spark-svg" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" role="img" aria-hidden="true">' +
      '<polyline fill="none" stroke="' +
      stroke +
      '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="' +
      coords.join(" ") +
      '"/>' +
      "</svg>"
    );
  }

  function renderSparklines() {
    var host = el("health-sparklines");
    if (!host) {
      return;
    }
    var days = ((state.snapshot && state.snapshot.days) || []).slice();
    days.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    var windowDays = days.slice(-30);
    var recovery = seriesFromDays(windowDays, function (d) {
      return d.recovery && d.recovery.recovery_score;
    });
    var sleep = seriesFromDays(windowDays, function (d) {
      return d.sleep && H.sleepPerformance(d.sleep);
    });
    var strain = seriesFromDays(windowDays, function (d) {
      return d.cycle_strain && d.cycle_strain.strain;
    });
    var hrv = seriesFromDays(windowDays, function (d) {
      return d.recovery && d.recovery.hrv_rmssd_milli;
    });
    var first = windowDays[0] && windowDays[0].date;
    var last = windowDays[windowDays.length - 1] && windowDays[windowDays.length - 1].date;
    var rangeLabel =
      first && last ? H.formatLongDate(first) + " → " + H.formatLongDate(last) : "";

    host.innerHTML =
      '<div class="spark-block"><div class="spark-label"><span>Recovery</span><span>' +
      esc(rangeLabel) +
      "</span></div>" +
      sparklineSvg(recovery, "#4f9a68") +
      "</div>" +
      '<div class="spark-block"><div class="spark-label"><span>Sleep</span><span>' +
      (sleep.length ? sleep.length + " nights" : "") +
      "</span></div>" +
      sparklineSvg(sleep, "#7a63b5") +
      "</div>" +
      '<div class="spark-block"><div class="spark-label"><span>Strain</span><span>' +
      (strain.length ? strain.length + " days" : "") +
      "</span></div>" +
      sparklineSvg(strain, "#d4894a") +
      "</div>" +
      '<div class="spark-block"><div class="spark-label"><span>HRV</span><span>' +
      (hrv.length ? hrv.length + " days" : "") +
      "</span></div>" +
      sparklineSvg(hrv, "#c45c6a") +
      "</div>";
  }

  function rangeLabel() {
    if (state.range === "week") {
      return "7-day week range";
    }
    if (state.range === "month") {
      return "30-day month range";
    }
    return "Selected day";
  }

  function detailZones() {
    var days = rangeDays();
    if (state.range === "day" && state.selectedWorkout && state.selectedWorkout.workout) {
      return H.workoutHrZones(state.selectedWorkout.workout);
    }
    if (state.range === "day") {
      return H.dayHrZones(selectedDay());
    }
    return H.rangeHrZones(days, (state.snapshot && state.snapshot.summary) || {}, state.range);
  }

  function activitySummaryCard() {
    if (state.range === "day" && state.selectedWorkout && state.selectedWorkout.workout) {
      var w = state.selectedWorkout.workout;
      var ms = H.durationMs(w.start, w.end);
      return (
        '<article class="scrapbook-card activity-summary">' +
        '<div class="washi washi-dots" aria-hidden="true"></div>' +
        "<h3>" +
        esc(sportName(w.sport_id)) +
        "</h3>" +
        '<p class="activity-date">' +
        esc(H.formatLongDate(state.selectedWorkout.day)) +
        "</p>" +
        '<div class="activity-metrics">' +
        '<div><p class="metric-kicker">Duration</p><p class="metric-value">' +
        esc(fmtHms(ms)) +
        "</p></div>" +
        '<div><p class="metric-kicker">Strain</p><p class="metric-value">' +
        esc(w.strain == null ? "—" : fmt1(w.strain)) +
        " <small>/ 21</small></p></div>" +
        '<div><p class="metric-kicker">Avg HR</p><p class="metric-value">' +
        esc(w.average_heart_rate == null ? "—" : fmtInt(w.average_heart_rate) + " bpm") +
        "</p></div>" +
        '<div><p class="metric-kicker">Max HR</p><p class="metric-value">' +
        esc(w.max_heart_rate == null ? "—" : fmtInt(w.max_heart_rate) + " bpm") +
        "</p></div>" +
        "</div>" +
        "</article>"
      );
    }
    var totals = H.rangeActivityTotals(rangeDays());
    return (
      '<article class="scrapbook-card activity-summary">' +
      '<div class="washi washi-dots" aria-hidden="true"></div>' +
      "<h3>Activities in range</h3>" +
      '<p class="activity-date">' +
      esc(rangeLabel()) +
      " ending " +
      esc(H.formatPickerDate(state.selectedDate)) +
      "</p>" +
      '<div class="activity-metrics">' +
      "<div><p class=\"metric-kicker\">Workouts</p><p class=\"metric-value\">" +
      totals.count +
      "</p></div>" +
      '<div><p class="metric-kicker">Duration</p><p class="metric-value">' +
      esc(fmtDuration(totals.durationMs)) +
      "</p></div>" +
      '<div><p class="metric-kicker">Avg strain</p><p class="metric-value">' +
      esc(fmt1(totals.strain)) +
      "</p></div>" +
      '<div><p class="metric-kicker">Avg / max HR</p><p class="metric-value">' +
      esc(fmtInt(totals.averageHeartRate)) +
      " / " +
      esc(fmtInt(totals.maxHeartRate)) +
      "</p></div>" +
      "</div>" +
      "</article>"
    );
  }

  function sleepDetailCard(sleep) {
    var stages = sleep.stages;
    var stageHtml = "";
    if (stages) {
      stageHtml =
        '<div class="detail-stages">' +
        '<span>Light ' +
        esc(fmtDuration(stages.light)) +
        "</span>" +
        "<span>SWS " +
        esc(fmtDuration(stages.sws)) +
        "</span>" +
        "<span>REM " +
        esc(fmtDuration(stages.rem)) +
        "</span>" +
        (stages.awake != null ? "<span>Awake " + esc(fmtDuration(stages.awake)) + "</span>" : "") +
        "</div>";
    }
    return (
      '<article class="scrapbook-card detail-panel">' +
      '<div class="washi washi-lilac" aria-hidden="true"></div>' +
      "<h3>Sleep detail</h3>" +
      '<div class="detail-grid">' +
      "<div><p class=\"metric-kicker\">Performance</p><p class=\"metric-value\">" +
      (sleep.performance == null ? "—" : fmtInt(sleep.performance) + "<small>%</small>") +
      " <span class=\"metric-note\">" +
      esc(sleepStatus(sleep.performance).text) +
      "</span></p></div>" +
      "<div><p class=\"metric-kicker\">Consistency</p><p class=\"metric-value\">" +
      (sleep.consistency == null ? "—" : fmtInt(sleep.consistency) + "<small>%</small>") +
      "</p></div>" +
      "<div><p class=\"metric-kicker\">Avg sleep</p><p class=\"metric-value\">" +
      esc(fmtDuration(sleep.durationMilli)) +
      '</p><p class="metric-note">for selected range</p></div>' +
      "</div>" +
      stageHtml +
      "</article>"
    );
  }

  function recoveryDetailCard(recovery) {
    return (
      '<article class="scrapbook-card detail-panel">' +
      '<div class="washi washi-dots" aria-hidden="true"></div>' +
      "<h3>Recovery detail</h3>" +
      '<div class="detail-grid">' +
      "<div><p class=\"metric-kicker\">HRV (RMSSD)</p><p class=\"metric-value\">" +
      (recovery.hrv == null ? "—" : fmtInt(recovery.hrv) + "<small>ms</small>") +
      " <span class=\"metric-note\">" +
      esc(hrStatus(recovery.hrv, recovery.rhr).text) +
      "</span></p></div>" +
      "<div><p class=\"metric-kicker\">RHR</p><p class=\"metric-value\">" +
      (recovery.rhr == null ? "—" : fmtInt(recovery.rhr) + "<small> bpm</small>") +
      "</p></div>" +
      "<div><p class=\"metric-kicker\">Recovery</p><p class=\"metric-value\">" +
      (recovery.recovery == null ? "—" : fmtInt(recovery.recovery) + "<small>%</small>") +
      '</p><p class="metric-note">range averages · ' +
      esc(rangeLabel()) +
      "</p></div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderDetail() {
    var dialog = el("health-detail");
    if (!dialog) {
      return;
    }
    var ranges = ["day", "week", "month"];
    var toggle = ranges
      .map(function (mode) {
        return (
          '<button type="button" class="range-btn" data-range="' +
          mode +
          '"' +
          (state.range === mode ? ' aria-pressed="true"' : ' aria-pressed="false"') +
          ">" +
          (mode === "day" ? "Day" : mode === "week" ? "Week" : "Month") +
          "</button>"
        );
      })
      .join("");
    var crumb =
      state.selectedWorkout && state.range === "day"
        ? "Health › Activities › " + sportName(state.selectedWorkout.workout.sport_id) + " · " + H.monthShort(state.selectedWorkout.day) + " " + H.parseYmd(state.selectedWorkout.day).getDate()
        : "Health › " + rangeLabel() + " · " + H.formatPickerDate(state.selectedDate);
    var sleep = H.rangeSleep(rangeDays());
    var recovery = H.rangeRecovery(rangeDays());
    dialog.innerHTML =
      '<div class="health-detail-sheet">' +
      '<div class="health-detail-bar">' +
      '<p class="health-crumb" id="health-detail-title">' +
      esc(crumb) +
      "</p>" +
      '<div class="range-toggle" role="group" aria-label="Range">' +
      toggle +
      "</div>" +
      '<button type="button" class="health-detail-close" data-close-detail>Close</button>' +
      "</div>" +
      '<p class="range-note">Averages and totals for the selected range ending on the picked day, within the snapshot window. Zones from Whoop when present.</p>' +
      activitySummaryCard() +
      zoneTable(detailZones()) +
      '<div class="detail-split">' +
      sleepDetailCard(sleep) +
      recoveryDetailCard(recovery) +
      "</div>" +
      "</div>";
  }

  function openDetail(focus, workout) {
    state.detailFocus = focus || "activity";
    state.selectedWorkout = workout || null;
    if (focus === "activity" && !workout) {
      state.range = state.range || "day";
    }
    renderDetail();
    var dialog = el("health-detail");
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
  }

  function closeDetail() {
    var dialog = el("health-detail");
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function selectDate(ymd) {
    state.selectedDate = H.clampPickerDate(ymd);
    state.selectedWorkout = null;
    renderAll();
  }

  function findWorkout(token) {
    var parts = String(token || "").split(":");
    if (parts.length < 2) {
      return null;
    }
    var day = H.dayByDate(state.snapshot, parts[0]);
    var index = Number(parts[1]);
    if (!day || !day.workouts || !day.workouts[index]) {
      return null;
    }
    return { day: parts[0], workout: day.workouts[index], index: index };
  }

  function renderAll() {
    var asof = el("health-asof");
    if (asof) {
      asof.textContent = state.snapshot && state.snapshot.as_of
        ? "as of " + H.formatLongDate(state.snapshot.as_of)
        : "";
    }
    var tz = el("health-tz");
    if (tz) {
      var stamp = H.timezoneStamp();
      tz.textContent = stamp
        ? "All times in your local timezone (" + stamp + ")."
        : "All times in your local timezone.";
    }
    renderPicker();
    renderCards();
    renderWorkouts();
    renderSparklines();
    var dialog = el("health-detail");
    if (dialog && dialog.open) {
      renderDetail();
    }
    setStatus("");
  }

  function onAppClick(event) {
    var step = event.target.closest("[data-picker-step]");
    if (step) {
      selectDate(H.addDays(state.selectedDate, Number(step.getAttribute("data-picker-step"))));
      return;
    }
    var jump = event.target.closest("[data-picker-date]");
    if (jump && !jump.disabled) {
      selectDate(jump.getAttribute("data-picker-date"));
      return;
    }
    var workout = event.target.closest("[data-open-workout]");
    if (workout) {
      state.range = "day";
      openDetail("activity", findWorkout(workout.getAttribute("data-open-workout")));
      return;
    }
    var detail = event.target.closest("[data-open-detail]");
    if (detail) {
      state.range = "day";
      openDetail(detail.getAttribute("data-open-detail"), null);
    }
  }

  function onDetailClick(event) {
    if (event.target.closest("[data-close-detail]")) {
      closeDetail();
      return;
    }
    var range = event.target.closest("[data-range]");
    if (range) {
      state.range = range.getAttribute("data-range");
      renderDetail();
    }
  }

  function bind() {
    var app = el("health-app");
    var dialog = el("health-detail");
    if (app) {
      app.addEventListener("click", onAppClick);
    }
    if (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          closeDetail();
          return;
        }
        onDetailClick(event);
      });
    }
  }

  function load() {
    var gate = admin();
    if (!gate || !gate.isUnlocked()) {
      setStatus("");
      return;
    }
    if (!H) {
      setStatus("Health helpers failed to load.");
      return;
    }
    var snapshot = typeof gate.getHealth === "function" ? gate.getHealth() : null;
    if (!snapshot) {
      setStatus("Sign in again to decrypt this pulse pack on this device.");
      if (typeof gate.requestSignIn === "function" && !load._asked) {
        load._asked = true;
        gate.requestSignIn();
      }
      return;
    }
    state.snapshot = snapshot;
    state.selectedDate = H.clampPickerDate(H.defaultSelectedDate(snapshot));
    renderAll();
  }

  function init() {
    bind();
    load();
    var gate = admin();
    if (gate && typeof gate.onChange === "function") {
      gate.onChange(function () {
        load();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
