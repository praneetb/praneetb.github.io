(function () {
  "use strict";

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

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
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

  function durationMin(start, end) {
    if (!start || !end) {
      return null;
    }
    var ms = new Date(end).getTime() - new Date(start).getTime();
    if (!isFinite(ms) || ms <= 0) {
      return null;
    }
    return Math.max(1, Math.round(ms / 60000));
  }

  function formatDateLabel(iso) {
    if (!iso) {
      return "";
    }
    var parts = String(iso).split("-");
    if (parts.length !== 3) {
      return iso;
    }
    var months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    var m = months[Number(parts[1]) - 1] || parts[1];
    return m + " " + Number(parts[2]) + ", " + parts[0];
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

  function vitalCard(opts) {
    var status = opts.status || { text: "", tone: "#8a837a" };
    return (
      '<article class="scrapbook-card vital-card" data-kind="' +
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
      status.text +
      "</p>" +
      iconSvg(opts.kind) +
      "</article>"
    );
  }

  function latestDay(snapshot) {
    var days = (snapshot && snapshot.days) || [];
    if (!days.length) {
      return null;
    }
    var asOf = snapshot.as_of;
    var i;
    for (i = days.length - 1; i >= 0; i -= 1) {
      if (days[i] && days[i].date === asOf) {
        return days[i];
      }
    }
    return days[days.length - 1];
  }

  function collectWorkouts(snapshot, limit) {
    var days = (snapshot && snapshot.days) || [];
    var out = [];
    var i;
    var j;
    for (i = days.length - 1; i >= 0; i -= 1) {
      var day = days[i];
      var workouts = (day && day.workouts) || [];
      for (j = workouts.length - 1; j >= 0; j -= 1) {
        out.push({ day: day.date, workout: workouts[j] });
        if (out.length >= limit) {
          return out;
        }
      }
    }
    return out;
  }

  function renderCards(snapshot) {
    var host = el("health-cards");
    if (!host) {
      return;
    }
    var day = latestDay(snapshot) || {};
    var summary = snapshot.summary || {};
    var recovery =
      (day.recovery && day.recovery.recovery_score != null
        ? day.recovery.recovery_score
        : summary.latest_recovery && summary.latest_recovery.recovery_score) || null;
    var strain =
      day.cycle_strain && day.cycle_strain.strain != null ? day.cycle_strain.strain : null;
    var sleep =
      (day.sleep && day.sleep.sleep_performance_percentage != null
        ? day.sleep.sleep_performance_percentage
        : summary.latest_sleep && summary.latest_sleep.sleep_performance_percentage) || null;
    var hrv =
      (day.recovery && day.recovery.hrv_rmssd_milli != null
        ? day.recovery.hrv_rmssd_milli
        : summary.latest_recovery && summary.latest_recovery.hrv_rmssd_milli) || null;
    var rhr =
      (day.recovery && day.recovery.resting_heart_rate != null
        ? day.recovery.resting_heart_rate
        : summary.latest_recovery && summary.latest_recovery.resting_heart_rate) || null;

    host.innerHTML =
      vitalCard({
        kind: "recovery",
        label: "Recovery",
        value: recovery == null ? "—" : fmtInt(recovery) + "<small>%</small>",
        status: recoveryStatus(recovery)
      }) +
      vitalCard({
        kind: "strain",
        label: "Strain",
        value: strain == null ? "—" : fmt1(strain),
        status: strainStatus(strain)
      }) +
      vitalCard({
        kind: "sleep",
        label: "Sleep",
        value: sleep == null ? "—" : fmtInt(sleep) + "<small>%</small>",
        status: sleepStatus(sleep)
      }) +
      vitalCard({
        kind: "hr",
        label: "HRV · RHR",
        value:
          (hrv == null ? "—" : fmtInt(hrv) + "<small>ms</small>") +
          " · " +
          (rhr == null ? "—" : fmtInt(rhr) + "<small> bpm</small>"),
        status: hrStatus(hrv, rhr)
      });
  }

  function renderWorkouts(snapshot) {
    var host = el("health-workouts");
    if (!host) {
      return;
    }
    var rows = collectWorkouts(snapshot, 4);
    if (!rows.length) {
      host.innerHTML =
        '<article class="scrapbook-card workout-chip"><h3>Workouts</h3><p class="workout-empty">No scored workouts in this window yet.</p></article>';
      return;
    }
    host.innerHTML = rows
      .map(function (row) {
        var w = row.workout || {};
        var mins = durationMin(w.start, w.end);
        var name = sportName(w.sport_id);
        var slug = sportSlug(w.sport_id);
        var metaBits = [];
        if (mins != null) {
          metaBits.push(mins + " min");
        }
        metaBits.push(formatDateLabel(row.day));
        if (w.average_heart_rate != null) {
          metaBits.push("Avg HR " + fmtInt(w.average_heart_rate) + " bpm");
        }
        if (w.max_heart_rate != null) {
          metaBits.push("Max " + fmtInt(w.max_heart_rate));
        }
        return (
          '<article class="scrapbook-card workout-chip" data-sport="' +
          slug +
          '">' +
          '<div class="washi washi-dots" aria-hidden="true"></div>' +
          "<h3>" +
          name +
          "</h3>" +
          '<p class="workout-meta">' +
          metaBits.join(" · ") +
          "</p>" +
          '<p class="workout-strain">Strain ' +
          (w.strain == null ? "—" : fmt1(w.strain)) +
          "</p>" +
          "</article>"
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

  function renderSparklines(snapshot) {
    var host = el("health-sparklines");
    if (!host) {
      return;
    }
    var days = ((snapshot && snapshot.days) || []).slice();
    days.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    var windowDays = days.slice(-30);
    var recovery = seriesFromDays(windowDays, function (d) {
      return d.recovery && d.recovery.recovery_score;
    });
    var sleep = seriesFromDays(windowDays, function (d) {
      return d.sleep && d.sleep.sleep_performance_percentage;
    });
    var strain = seriesFromDays(windowDays, function (d) {
      return d.cycle_strain && d.cycle_strain.strain;
    });
    var first = windowDays[0] && windowDays[0].date;
    var last = windowDays[windowDays.length - 1] && windowDays[windowDays.length - 1].date;
    var rangeLabel =
      first && last ? formatDateLabel(first) + " → " + formatDateLabel(last) : "";

    host.innerHTML =
      '<div class="spark-block"><div class="spark-label"><span>Recovery</span><span>' +
      rangeLabel +
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
      "</div>";
  }

  function render(snapshot) {
    var asof = el("health-asof");
    if (asof) {
      asof.textContent = snapshot.as_of
        ? "as of " + formatDateLabel(snapshot.as_of)
        : "";
    }
    renderCards(snapshot);
    renderWorkouts(snapshot);
    renderSparklines(snapshot);
    setStatus("");
  }

  function load() {
    var gate = admin();
    if (!gate || !gate.isUnlocked()) {
      setStatus("");
      return;
    }
    var snapshot = typeof gate.getHealth === "function" ? gate.getHealth() : null;
    if (!snapshot) {
      setStatus("Sign in again to decrypt this pulse pack on this device.");
      if (typeof gate.requestSignIn === "function") {
        // Soft nudge only once per visit.
        if (!load._asked) {
          load._asked = true;
          gate.requestSignIn();
        }
      }
      return;
    }
    render(snapshot);
  }

  function init() {
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
