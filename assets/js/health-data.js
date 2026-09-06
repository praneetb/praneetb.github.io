(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HealthData = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ZONE_DEFS = [
    { key: "z0_minutes", id: "z0", label: "Below Z1", short: "Z0", tone: "#b8b0a6" },
    { key: "z1_minutes", id: "z1", label: "Very Light", short: "Z1", tone: "#8b7ec8" },
    { key: "z2_minutes", id: "z2", label: "Light", short: "Z2", tone: "#5aae7a" },
    { key: "z3_minutes", id: "z3", label: "Moderate", short: "Z3", tone: "#d4b04a" },
    { key: "z4_minutes", id: "z4", label: "Hard", short: "Z4", tone: "#e07a3d" },
    { key: "z5_minutes", id: "z5", label: "Maximum", short: "Z5", tone: "#d45454" }
  ];

  var ZONE_KEYS = ZONE_DEFS.map(function (z) {
    return z.key;
  });

  var PICKER_DAYS = 30;
  var WEEK_DAYS = 7;
  var MONTH_DAYS = 30;

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function ymdLocal(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseYmd(ymd) {
    var parts = String(ymd || "").split("-");
    if (parts.length !== 3) {
      return null;
    }
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!y || !m || !d) {
      return null;
    }
    return new Date(y, m - 1, d);
  }

  function addDays(ymd, n) {
    var date = parseYmd(ymd);
    if (!date) {
      return "";
    }
    date.setDate(date.getDate() + n);
    return ymdLocal(date);
  }

  function todayYmd(now) {
    return ymdLocal(now || new Date());
  }

  function calendarWindow(endYmd, count) {
    var out = [];
    var i;
    for (i = count - 1; i >= 0; i -= 1) {
      out.push(addDays(endYmd, -i));
    }
    return out;
  }

  function pickerDates(now) {
    return calendarWindow(todayYmd(now), PICKER_DAYS);
  }

  function rangeDates(endYmd, mode) {
    if (mode === "week") {
      return calendarWindow(endYmd, WEEK_DAYS);
    }
    if (mode === "month") {
      return calendarWindow(endYmd, MONTH_DAYS);
    }
    return [endYmd];
  }

  function indexDays(snapshot) {
    var map = {};
    var days = (snapshot && snapshot.days) || [];
    var i;
    for (i = 0; i < days.length; i += 1) {
      var day = days[i];
      if (day && day.date) {
        map[day.date] = day;
      }
    }
    return map;
  }

  function availableDates(snapshot) {
    return Object.keys(indexDays(snapshot)).sort();
  }

  function dayByDate(snapshot, ymd) {
    return indexDays(snapshot)[ymd] || null;
  }

  function daysInRange(snapshot, endYmd, mode) {
    var dates = rangeDates(endYmd, mode);
    var idx = indexDays(snapshot);
    var out = [];
    var i;
    for (i = 0; i < dates.length; i += 1) {
      if (idx[dates[i]]) {
        out.push(idx[dates[i]]);
      }
    }
    return out;
  }

  function defaultSelectedDate(snapshot, now) {
    var today = todayYmd(now);
    var window = pickerDates(now);
    var inWindow = {};
    var i;
    for (i = 0; i < window.length; i += 1) {
      inWindow[window[i]] = true;
    }
    if (dayByDate(snapshot, today)) {
      return today;
    }
    var asOf = snapshot && snapshot.as_of;
    if (asOf && inWindow[asOf] && dayByDate(snapshot, asOf)) {
      return asOf;
    }
    var dates = availableDates(snapshot);
    for (i = dates.length - 1; i >= 0; i -= 1) {
      if (inWindow[dates[i]]) {
        return dates[i];
      }
    }
    return asOf || today;
  }

  function clampPickerDate(ymd, now) {
    var window = pickerDates(now);
    if (!ymd) {
      return window[window.length - 1];
    }
    if (ymd < window[0]) {
      return window[0];
    }
    if (ymd > window[window.length - 1]) {
      return window[window.length - 1];
    }
    return ymd;
  }

  function firstNumber(obj, keys) {
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var value = obj && obj[keys[i]];
      if (value != null && isFinite(Number(value))) {
        return Number(value);
      }
    }
    return null;
  }

  function readZoneMap(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    var out = {};
    var found = false;
    var i;
    for (i = 0; i < ZONE_KEYS.length; i += 1) {
      var key = ZONE_KEYS[i];
      if (raw[key] != null && isFinite(Number(raw[key]))) {
        out[key] = Number(raw[key]);
        found = true;
      }
    }
    if (raw.source_milli != null && isFinite(Number(raw.source_milli))) {
      out.source_milli = Number(raw.source_milli);
    }
    return found ? out : null;
  }

  function readZoneDurations(raw) {
    if (raw == null) {
      return null;
    }
    if (Array.isArray(raw)) {
      var mapped = {};
      var i;
      var any = false;
      for (i = 0; i < ZONE_KEYS.length && i < raw.length; i += 1) {
        if (raw[i] != null && isFinite(Number(raw[i]))) {
          mapped[ZONE_KEYS[i]] = Number(raw[i]) >= 1000 ? Number(raw[i]) / 60000 : Number(raw[i]);
          any = true;
        }
      }
      return any ? mapped : null;
    }
    if (typeof raw !== "object") {
      return null;
    }
    var milliKeys = [
      ["z0_minutes", ["zone_zero_milli", "z0_milli"]],
      ["z1_minutes", ["zone_one_milli", "z1_milli"]],
      ["z2_minutes", ["zone_two_milli", "z2_milli"]],
      ["z3_minutes", ["zone_three_milli", "z3_milli"]],
      ["z4_minutes", ["zone_four_milli", "z4_milli"]],
      ["z5_minutes", ["zone_five_milli", "z5_milli"]]
    ];
    var out = {};
    var found = false;
    var j;
    for (j = 0; j < milliKeys.length; j += 1) {
      var milli = firstNumber(raw, milliKeys[j][1]);
      if (milli != null) {
        out[milliKeys[j][0]] = milli / 60000;
        found = true;
      }
    }
    return found ? out : null;
  }

  function extractHrZones(container) {
    if (container == null) {
      return null;
    }
    if (typeof container !== "object") {
      return null;
    }
    return (
      readZoneMap(container.hr_zones) ||
      readZoneMap(container.zones) ||
      readZoneDurations(container.zone_durations) ||
      readZoneMap(container)
    );
  }

  function sumHrZones(list) {
    var acc = {};
    var found = false;
    var i;
    var j;
    for (i = 0; i < (list || []).length; i += 1) {
      var zones = list[i];
      if (!zones) {
        continue;
      }
      for (j = 0; j < ZONE_KEYS.length; j += 1) {
        var key = ZONE_KEYS[j];
        if (zones[key] != null && isFinite(Number(zones[key]))) {
          acc[key] = (acc[key] || 0) + Number(zones[key]);
          found = true;
        }
      }
    }
    return found ? acc : null;
  }

  function workoutHrZones(workout) {
    return extractHrZones(workout);
  }

  function dayHrZones(day) {
    if (!day) {
      return null;
    }
    var direct = extractHrZones(day.hr_zones != null ? { hr_zones: day.hr_zones } : day);
    if (direct) {
      return direct;
    }
    var fromWorkouts = [];
    var workouts = day.workouts || [];
    var i;
    for (i = 0; i < workouts.length; i += 1) {
      fromWorkouts.push(workoutHrZones(workouts[i]));
    }
    return sumHrZones(fromWorkouts);
  }

  function rangeHrZones(days, summary, mode) {
    var fromWorkouts = [];
    var fromDays = [];
    var i;
    var j;
    for (i = 0; i < (days || []).length; i += 1) {
      var day = days[i];
      var dayDirect = day && day.hr_zones != null ? extractHrZones({ hr_zones: day.hr_zones }) : null;
      if (dayDirect) {
        fromDays.push(dayDirect);
      }
      var workouts = (day && day.workouts) || [];
      for (j = 0; j < workouts.length; j += 1) {
        fromWorkouts.push(workoutHrZones(workouts[j]));
      }
    }
    var summedWorkouts = sumHrZones(fromWorkouts);
    if (summedWorkouts) {
      return summedWorkouts;
    }
    var summedDays = sumHrZones(fromDays);
    if (summedDays) {
      return summedDays;
    }
    if (mode === "month" && summary && summary.hr_zones_window != null) {
      return extractHrZones({ hr_zones: summary.hr_zones_window }) || extractHrZones(summary.hr_zones_window);
    }
    return null;
  }

  function zoneRows(zones) {
    if (!zones) {
      return null;
    }
    var rows = [];
    var total = 0;
    var i;
    for (i = 0; i < ZONE_DEFS.length; i += 1) {
      var zone = ZONE_DEFS[i];
      if (zone.id === "z0" && zones[zone.key] == null) {
        continue;
      }
      if (zones[zone.key] != null && isFinite(Number(zones[zone.key]))) {
        total += Number(zones[zone.key]);
      }
    }
    for (i = 0; i < ZONE_DEFS.length; i += 1) {
      var item = ZONE_DEFS[i];
      if (item.id === "z0" && zones[item.key] == null) {
        continue;
      }
      var minutes = zones[item.key] != null && isFinite(Number(zones[item.key])) ? Number(zones[item.key]) : null;
      rows.push({
        id: item.id,
        key: item.key,
        label: item.id === "z0" ? "Below Z1" : item.label,
        short: item.short,
        tone: item.tone,
        minutes: minutes,
        percent: minutes == null || total <= 0 ? null : (minutes / total) * 100
      });
    }
    return rows.length ? { rows: rows, total: total } : null;
  }

  function dominantZone(zones) {
    var table = zoneRows(zones);
    if (!table) {
      return null;
    }
    var best = null;
    var i;
    for (i = 0; i < table.rows.length; i += 1) {
      var row = table.rows[i];
      if (row.id === "z0" || row.minutes == null) {
        continue;
      }
      if (!best || row.minutes > best.minutes) {
        best = row;
      }
    }
    return best && best.minutes > 0 ? best : null;
  }

  function average(values) {
    var sum = 0;
    var count = 0;
    var i;
    for (i = 0; i < (values || []).length; i += 1) {
      if (values[i] != null && isFinite(Number(values[i]))) {
        sum += Number(values[i]);
        count += 1;
      }
    }
    return count ? sum / count : null;
  }

  function pickDays(days, getter) {
    var values = [];
    var i;
    for (i = 0; i < (days || []).length; i += 1) {
      values.push(getter(days[i]));
    }
    return values;
  }

  function sleepOf(day) {
    return (day && day.sleep) || {};
  }

  function recoveryOf(day) {
    return (day && day.recovery) || {};
  }

  function sleepDurationMilli(sleep) {
    if (!sleep) {
      return null;
    }
    var nested = sleep.stage_summary || (sleep.score && sleep.score.stage_summary) || {};
    var direct = firstNumber(sleep, [
      "total_sleep_time_milli",
      "sleep_time_milli",
      "total_sleep_milli",
      "duration_milli"
    ]);
    if (direct != null) {
      return direct;
    }
    var staged = sumStageMilli(nested);
    if (staged != null) {
      return staged;
    }
    return firstNumber(sleep, ["total_in_bed_time_milli"]) || firstNumber(nested, ["total_in_bed_time_milli"]);
  }

  function sumStageMilli(summary) {
    if (!summary) {
      return null;
    }
    var light = firstNumber(summary, ["total_light_sleep_time_milli", "light_sleep_time_milli"]);
    var sws = firstNumber(summary, ["total_slow_wave_sleep_time_milli", "total_sws_time_milli", "sws_time_milli"]);
    var rem = firstNumber(summary, ["total_rem_sleep_time_milli", "rem_sleep_time_milli"]);
    if (light == null && sws == null && rem == null) {
      return null;
    }
    return (light || 0) + (sws || 0) + (rem || 0);
  }

  function sleepStages(sleep) {
    if (!sleep) {
      return null;
    }
    var nested = sleep.stage_summary || (sleep.score && sleep.score.stage_summary) || sleep;
    var stages = {
      light: firstNumber(nested, ["total_light_sleep_time_milli", "light_sleep_time_milli"]),
      sws: firstNumber(nested, ["total_slow_wave_sleep_time_milli", "total_sws_time_milli", "sws_time_milli"]),
      rem: firstNumber(nested, ["total_rem_sleep_time_milli", "rem_sleep_time_milli"]),
      awake: firstNumber(nested, ["total_awake_time_milli", "awake_time_milli"])
    };
    if (stages.light == null && stages.sws == null && stages.rem == null && stages.awake == null) {
      return null;
    }
    return stages;
  }

  function sleepPerformance(sleep) {
    return firstNumber(sleep || {}, [
      "sleep_performance_percentage",
      "performance_percentage"
    ]);
  }

  function sleepConsistency(sleep) {
    return firstNumber(sleep || {}, [
      "sleep_consistency_percentage",
      "consistency_percentage"
    ]);
  }

  function rangeSleep(days) {
    return {
      performance: average(
        pickDays(days, function (day) {
          return sleepPerformance(sleepOf(day));
        })
      ),
      consistency: average(
        pickDays(days, function (day) {
          return sleepConsistency(sleepOf(day));
        })
      ),
      durationMilli: average(
        pickDays(days, function (day) {
          return sleepDurationMilli(sleepOf(day));
        })
      ),
      stages: averageStages(days)
    };
  }

  function averageStages(days) {
    var collected = pickDays(days, function (day) {
      return sleepStages(sleepOf(day));
    }).filter(Boolean);
    if (!collected.length) {
      return null;
    }
    return {
      light: average(
        collected.map(function (s) {
          return s.light;
        })
      ),
      sws: average(
        collected.map(function (s) {
          return s.sws;
        })
      ),
      rem: average(
        collected.map(function (s) {
          return s.rem;
        })
      ),
      awake: average(
        collected.map(function (s) {
          return s.awake;
        })
      )
    };
  }

  function rangeRecovery(days) {
    return {
      recovery: average(
        pickDays(days, function (day) {
          return firstNumber(recoveryOf(day), ["recovery_score"]);
        })
      ),
      hrv: average(
        pickDays(days, function (day) {
          return firstNumber(recoveryOf(day), ["hrv_rmssd_milli"]);
        })
      ),
      rhr: average(
        pickDays(days, function (day) {
          return firstNumber(recoveryOf(day), ["resting_heart_rate"]);
        })
      )
    };
  }

  function rangeStrain(days) {
    return average(
      pickDays(days, function (day) {
        return day && day.cycle_strain ? firstNumber(day.cycle_strain, ["strain"]) : null;
      })
    );
  }

  function workoutsInRange(days) {
    var out = [];
    var i;
    var j;
    for (i = 0; i < (days || []).length; i += 1) {
      var day = days[i];
      var workouts = (day && day.workouts) || [];
      for (j = 0; j < workouts.length; j += 1) {
        out.push({ day: day.date, workout: workouts[j], index: j });
      }
    }
    return out;
  }

  function durationMs(start, end) {
    if (!start || !end) {
      return null;
    }
    var ms = new Date(end).getTime() - new Date(start).getTime();
    if (!isFinite(ms) || ms <= 0) {
      return null;
    }
    return ms;
  }

  function rangeActivityTotals(days) {
    var rows = workoutsInRange(days);
    var duration = 0;
    var durationCount = 0;
    var strainValues = [];
    var avgHr = [];
    var maxHr = [];
    var i;
    for (i = 0; i < rows.length; i += 1) {
      var workout = rows[i].workout || {};
      var ms = durationMs(workout.start, workout.end);
      if (ms != null) {
        duration += ms;
        durationCount += 1;
      }
      if (workout.strain != null && isFinite(Number(workout.strain))) {
        strainValues.push(Number(workout.strain));
      }
      if (workout.average_heart_rate != null && isFinite(Number(workout.average_heart_rate))) {
        avgHr.push(Number(workout.average_heart_rate));
      }
      if (workout.max_heart_rate != null && isFinite(Number(workout.max_heart_rate))) {
        maxHr.push(Number(workout.max_heart_rate));
      }
    }
    return {
      count: rows.length,
      durationMs: durationCount ? duration : null,
      strain: average(strainValues),
      averageHeartRate: average(avgHr),
      maxHeartRate: maxHr.length ? Math.max.apply(null, maxHr) : null,
      workouts: rows
    };
  }

  function weekdayShort(ymd) {
    var date = parseYmd(ymd);
    if (!date) {
      return "";
    }
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  }

  function monthShort(ymd) {
    var date = parseYmd(ymd);
    if (!date) {
      return "";
    }
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      date.getMonth()
    ];
  }

  function formatPickerDate(ymd) {
    var date = parseYmd(ymd);
    if (!date) {
      return "";
    }
    return weekdayShort(ymd) + " " + monthShort(ymd) + " " + date.getDate();
  }

  function formatLongDate(ymd) {
    var date = parseYmd(ymd);
    if (!date) {
      return "";
    }
    return monthShort(ymd) + " " + date.getDate() + ", " + date.getFullYear();
  }

  function timezoneStamp(now) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(
        now || new Date()
      );
      var i;
      for (i = 0; i < parts.length; i += 1) {
        if (parts[i].type === "timeZoneName") {
          return parts[i].value;
        }
      }
    } catch (err) {}
    return "";
  }

  return {
    ZONE_DEFS: ZONE_DEFS,
    ZONE_KEYS: ZONE_KEYS,
    PICKER_DAYS: PICKER_DAYS,
    ymdLocal: ymdLocal,
    parseYmd: parseYmd,
    addDays: addDays,
    todayYmd: todayYmd,
    calendarWindow: calendarWindow,
    pickerDates: pickerDates,
    rangeDates: rangeDates,
    indexDays: indexDays,
    availableDates: availableDates,
    dayByDate: dayByDate,
    daysInRange: daysInRange,
    defaultSelectedDate: defaultSelectedDate,
    clampPickerDate: clampPickerDate,
    extractHrZones: extractHrZones,
    sumHrZones: sumHrZones,
    workoutHrZones: workoutHrZones,
    dayHrZones: dayHrZones,
    rangeHrZones: rangeHrZones,
    zoneRows: zoneRows,
    dominantZone: dominantZone,
    average: average,
    firstNumber: firstNumber,
    sleepDurationMilli: sleepDurationMilli,
    sleepStages: sleepStages,
    sleepPerformance: sleepPerformance,
    sleepConsistency: sleepConsistency,
    rangeSleep: rangeSleep,
    rangeRecovery: rangeRecovery,
    rangeStrain: rangeStrain,
    workoutsInRange: workoutsInRange,
    rangeActivityTotals: rangeActivityTotals,
    durationMs: durationMs,
    weekdayShort: weekdayShort,
    monthShort: monthShort,
    formatPickerDate: formatPickerDate,
    formatLongDate: formatLongDate,
    timezoneStamp: timezoneStamp
  };
});
