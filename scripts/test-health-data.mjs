import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../assets/js/health-data.js");

function snapshot() {
  return {
    schema: "thekedaar_health_snapshot_v1_1",
    as_of: "2026-09-06",
    summary: {
      hr_zones_window: {
        z0_minutes: 12,
        z1_minutes: 80,
        z2_minutes: 140,
        z3_minutes: 40,
        z4_minutes: 10,
        z5_minutes: 2
      }
    },
    days: [
      {
        date: "2026-09-04",
        recovery: { recovery_score: 70, hrv_rmssd_milli: 50, resting_heart_rate: 55 },
        cycle_strain: { strain: 8.2 },
        sleep: {
          sleep_performance_percentage: 80,
          sleep_consistency_percentage: 88,
          total_sleep_time_milli: 7.5 * 3600000
        },
        hr_zones: { z1_minutes: 10, z2_minutes: 20, z3_minutes: 5, z4_minutes: 0, z5_minutes: 0 },
        workouts: [
          {
            sport_id: 0,
            start: "2026-09-04T14:00:00Z",
            end: "2026-09-04T14:50:00Z",
            strain: 9.1,
            average_heart_rate: 130,
            max_heart_rate: 150,
            hr_zones: { z1_minutes: 10, z2_minutes: 20, z3_minutes: 5, z4_minutes: 0, z5_minutes: 0 }
          }
        ]
      },
      {
        date: "2026-09-05",
        recovery: { recovery_score: 60, hrv_rmssd_milli: 44, resting_heart_rate: 58 },
        cycle_strain: { strain: 4.1 },
        sleep: { sleep_performance_percentage: 72 },
        hr_zones: null,
        workouts: [
          {
            sport_id: 123,
            start: "2026-09-05T16:00:00Z",
            end: "2026-09-05T16:38:00Z",
            strain: 6.2,
            average_heart_rate: 118,
            max_heart_rate: 142
          }
        ]
      },
      {
        date: "2026-09-06",
        recovery: { recovery_score: 47, hrv_rmssd_milli: 46, resting_heart_rate: 61 },
        cycle_strain: { strain: 4.0 },
        sleep: {
          sleep_performance_percentage: 76,
          sleep_consistency_percentage: 84,
          stage_summary: {
            total_light_sleep_time_milli: 3 * 3600000,
            total_slow_wave_sleep_time_milli: 90 * 60000,
            total_rem_sleep_time_milli: 80 * 60000
          }
        },
        hr_zones: { z1_minutes: 8, z2_minutes: 37, z3_minutes: 11, z4_minutes: 3, z5_minutes: 0 },
        workouts: [
          {
            sport_id: 0,
            start: "2026-09-06T13:00:00Z",
            end: "2026-09-06T13:59:48Z",
            strain: 10.2,
            average_heart_rate: 134,
            max_heart_rate: 158,
            hr_zones: {
              z0_minutes: 1,
              z1_minutes: 8,
              z2_minutes: 37,
              z3_minutes: 11,
              z4_minutes: 3,
              z5_minutes: 0,
              source_milli: 3600000
            }
          }
        ]
      }
    ]
  };
}

const pack = snapshot();
const now = new Date(2026, 8, 6);

assert.equal(H.extractHrZones(null), null);
assert.equal(H.extractHrZones({ hr_zones: null }), null);
assert.equal(H.extractHrZones({}), null);
assert.equal(H.workoutHrZones({ strain: 4 }), null);
assert.deepEqual(H.extractHrZones({ hr_zones: { z1_minutes: 8, z2_minutes: 37 } }), {
  z1_minutes: 8,
  z2_minutes: 37
});
assert.equal(H.extractHrZones({ hr_zones: { z1_minutes: 8 } }).z2_minutes, undefined);

const zSep6 = H.workoutHrZones(pack.days[2].workouts[0]);
assert.equal(zSep6.z2_minutes, 37);
assert.equal(zSep6.z5_minutes, 0);
assert.equal(zSep6.z0_minutes, 1);
assert.equal(zSep6.source_milli, 3600000);

assert.equal(H.dayHrZones(pack.days[1]), null);
assert.equal(H.dayHrZones(pack.days[2]).z2_minutes, 37);

const week = H.daysInRange(pack, "2026-09-06", "week");
assert.equal(week.length, 3);
const weekZones = H.rangeHrZones(week, pack.summary, "week");
assert.equal(weekZones.z2_minutes, 57);
assert.equal(weekZones.z1_minutes, 18);

const monthZones = H.rangeHrZones([], pack.summary, "month");
assert.equal(monthZones.z2_minutes, 140);

assert.equal(H.rangeHrZones([pack.days[1]], pack.summary, "day"), null);
assert.equal(H.rangeHrZones([pack.days[1]], pack.summary, "week"), null);

const rows = H.zoneRows(zSep6);
assert.equal(rows.rows[0].id, "z0");
assert.equal(rows.rows[0].label, "Below Z1");
assert.equal(rows.rows.find(function (r) { return r.id === "z2"; }).minutes, 37);
assert.ok(rows.rows.find(function (r) { return r.id === "z2"; }).percent > 50);
assert.equal(H.dominantZone(zSep6).id, "z2");

const partial = H.zoneRows({ z1_minutes: 10, z2_minutes: 20 });
assert.equal(partial.rows.find(function (r) { return r.id === "z3"; }).minutes, null);
assert.equal(partial.rows.find(function (r) { return r.id === "z3"; }).percent, null);
assert.ok(partial.rows.every(function (r) { return r.id !== "z0"; }));

assert.equal(H.defaultSelectedDate(pack, now), "2026-09-06");
assert.equal(H.clampPickerDate("2026-01-01", now), "2026-08-08");
assert.equal(H.rangeDates("2026-09-06", "day").length, 1);
assert.equal(H.rangeDates("2026-09-06", "week").length, 7);
assert.equal(H.rangeDates("2026-09-06", "month").length, 30);
assert.equal(H.pickerDates(now).length, 30);

const sleep = H.rangeSleep(week);
assert.ok(sleep.performance > 70);
assert.ok(sleep.durationMilli > 0);
assert.ok(sleep.stages.light > 0);

const recovery = H.rangeRecovery([pack.days[2]]);
assert.equal(recovery.hrv, 46);
assert.equal(recovery.rhr, 61);

const totals = H.rangeActivityTotals(week);
assert.equal(totals.count, 3);
assert.ok(totals.durationMs > 0);

assert.equal(H.formatPickerDate("2026-09-06"), "Sun Sep 6");
assert.equal(
  H.sleepDurationMilli({
    stage_summary: {
      total_light_sleep_time_milli: 3 * 3600000,
      total_slow_wave_sleep_time_milli: 90 * 60000,
      total_rem_sleep_time_milli: 80 * 60000
    }
  }),
  3 * 3600000 + 90 * 60000 + 80 * 60000
);

console.log("health-data tests passed");
