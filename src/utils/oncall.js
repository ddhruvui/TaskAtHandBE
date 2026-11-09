const { dayNumber, dayString } = require("./vacation");

/**
 * On-call shift arithmetic.
 *
 * A shift is `{ date, start, end, type }`: the "YYYY-MM-DD" day it starts on
 * and two "HH:mm" wall-clock times in the user's own timezone. An `end` at or
 * before `start` means the shift runs past midnight into the next day
 * ("22:00"–"06:00"), and "24:00" is accepted as an end meaning midnight at the
 * close of `date` — "9-24" is a natural way to say "until the end of the day".
 *
 * On-call is a record, not a rule: nothing here is read by the cron (beyond
 * pruning), the archive, the stats or the insights. It never changes a task.
 */

const MINUTES_PER_DAY = 24 * 60;

/** The two shift types. Primary is the default and by far the common case. */
const SHIFT_TYPES = ["primary", "secondary"];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Minutes since midnight for an "HH:mm" start time, or null when malformed.
 * @param {any} value
 * @returns {number|null}
 */
function startMinutes(value) {
  if (typeof value !== "string") return null;
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Minutes since midnight for an "HH:mm" end time — the same as a start, plus
 * "24:00" (1440), which a start may not use.
 * @param {any} value
 * @returns {number|null}
 */
function endMinutes(value) {
  if (value === "24:00") return MINUTES_PER_DAY;
  return startMinutes(value);
}

/**
 * How long a shift lasts, in minutes. An end at or before the start wraps to
 * the next day; start === end is not a shift and returns 0.
 * @param {{start: string, end: string}} shift
 * @returns {number}
 */
function shiftMinutes(shift) {
  const start = startMinutes(shift.start);
  const end = endMinutes(shift.end);
  if (start === null || end === null || start === end) return 0;
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

/**
 * The shift as an absolute [from, to) interval in minutes since the epoch day
 * — a shared axis that makes overnight shifts compare like any other.
 * @param {{date: string, start: string, end: string}} shift
 * @returns {{from: number, to: number}}
 */
function shiftInterval(shift) {
  const from = dayNumber(shift.date) * MINUTES_PER_DAY + startMinutes(shift.start);
  return { from, to: from + shiftMinutes(shift) };
}

/**
 * Whether two shifts share any minute. Back-to-back shifts (one ends at 22:00,
 * the next starts at 22:00) do not overlap.
 */
function shiftsOverlap(a, b) {
  const x = shiftInterval(a);
  const y = shiftInterval(b);
  return x.from < y.to && y.from < x.to;
}

/**
 * The oldest `date` a shift may have and still be kept: yesterday.
 *
 * The cron runs on UTC days but shifts are in the user's local time, and an
 * overnight shift that started yesterday may still be running. Keeping
 * yesterday's rows means nothing is ever pruned while it could be in progress;
 * the clients hide a shift the moment its end passes on their own clock.
 *
 * @param {string} today  "YYYY-MM-DD"
 * @returns {string} "YYYY-MM-DD"
 */
function oldestKeptDate(today) {
  return dayString(dayNumber(today) - 1);
}

module.exports = {
  MINUTES_PER_DAY,
  SHIFT_TYPES,
  startMinutes,
  endMinutes,
  shiftMinutes,
  shiftInterval,
  shiftsOverlap,
  oldestKeptDate,
};
