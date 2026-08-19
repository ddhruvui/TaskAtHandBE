/**
 * All date maths in this app is UTC, and it kept being re-derived: the weekday
 * table existed in three files, "how many days in this month" in four, and
 * "parse a D/M[/YYYY] string" in three more (once inline in the cron).
 *
 * Nothing here knows about tasks or life events — it is calendar arithmetic
 * only. The scheduling rules that use it (which ECD is due today, when the
 * next occurrence is) stay in `cron/cronJob.js` where they are documented.
 */

/** Milliseconds in a day — the divisor `daysBetween` and `daysAgo` share. */
const MS_PER_DAY = 86400000;

/** Weekday names in week order, indexed by `Date#getUTCDay()`. */
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The longest a given month can be, ignoring leap years (February is 29).
 * Used for *validating* a recurring D/M date: Feb 29 is a legal thing to ask
 * for, and the schedulers clamp it to Feb 28 in the years it does not exist.
 */
const MAX_DAYS_BY_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Days in a specific month of a specific year (UTC), leap years included.
 * @param {number} year
 * @param {number} month  1-indexed
 * @returns {number}
 */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parse a slash date into numbers. Handles both forms the app stores:
 * "7/3" (a life event, recurring yearly) and "7/3/2006" (a `day_of_year` ECD,
 * whose year records the occurrence already consumed).
 * @param {string} value
 * @returns {{day: number, month: number, year: number|undefined}}
 */
function parseSlashDate(value) {
  const [day, month, year] = value.split("/").map(Number);
  return { day, month, year };
}

/** The UTC weekday name of a Date, e.g. "Mon". */
function dayOfWeekName(date) {
  return DOW_NAMES[date.getUTCDay()];
}

/**
 * A Date as the "YYYY-MM-DD" UTC calendar-day string the archive and `date`
 * ECDs are stored in.
 * @param {Date} date
 * @returns {string}
 */
function utcDayString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Midnight-UTC epoch ms of the calendar day a timestamp falls on.
 *
 * Day counts must snap both sides to a day boundary: comparing a `doneAt`
 * instant against a midnight `plannedFor` made any completion after 12:00 UTC
 * round up to a full day of slip on the very day the task was scheduled.
 * @param {Date|string} value
 * @returns {number} epoch ms, or NaN if unparseable
 */
function utcDayStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NaN;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Today as a UTC-midnight Date. */
function utcToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/**
 * Whole days between two timestamps, both snapped to their calendar day.
 * @param {Date|string} from
 * @param {Date|string} to
 * @returns {number|null} null when either side is unparseable
 */
function daysBetween(from, to) {
  const start = utcDayStart(from);
  const end = utcDayStart(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

/**
 * The start of a look-back window ending at `to`.
 * @param {Date} to
 * @param {number} days
 * @returns {Date}
 */
function daysAgo(to, days) {
  return new Date(to.getTime() - days * MS_PER_DAY);
}

module.exports = {
  DOW_NAMES,
  MAX_DAYS_BY_MONTH,
  daysInMonth,
  parseSlashDate,
  dayOfWeekName,
  utcDayString,
  utcDayStart,
  utcToday,
  daysBetween,
  daysAgo,
};
