import assert from "node:assert/strict";
import test from "node:test";
import {
  nextOccurrenceDate,
  normalizeRecurrence,
  shiftDate,
} from "../app/recurrence.ts";

test("daily recurrence advances from completion when the task is overdue", () => {
  const rule = normalizeRecurrence({ type: "daily" }, "2026-07-01");
  assert.ok(rule);
  assert.equal(nextOccurrenceDate("2026-07-01", rule, "2026-07-10"), "2026-07-11");
});

test("weekday recurrence skips Saturday and Sunday", () => {
  const rule = normalizeRecurrence({ type: "weekdays" }, "2026-07-24");
  assert.ok(rule);
  assert.equal(nextOccurrenceDate("2026-07-24", rule, "2026-07-24"), "2026-07-27");
});

test("monthly recurrence retains the original calendar day across short months", () => {
  const rule = normalizeRecurrence({ type: "monthly" }, "2024-01-31");
  assert.ok(rule);
  const february = nextOccurrenceDate("2024-01-31", rule, "2024-01-31");
  assert.equal(february, "2024-02-29");
  assert.equal(nextOccurrenceDate(february, rule, february), "2024-03-31");
});

test("custom intervals and multi-day task ranges advance together", () => {
  const rule = normalizeRecurrence(
    { type: "custom", interval: 2, unit: "week" },
    "2026-07-31",
  );
  assert.ok(rule);
  const nextDue = nextOccurrenceDate("2026-07-31", rule, "2026-07-31");
  assert.equal(nextDue, "2026-08-14");
  assert.equal(shiftDate("2026-07-29", "2026-07-31", nextDue), "2026-08-12");
});
