/**
 * Vacation is a **lens on history, not a pause button**: the cron still resets
 * habits, still deletes done one-offs, still reorders priorities while the
 * user is away. What changes is how the archive is *read* afterwards — a day
 * inside a vacation range is not a day the user failed.
 *
 * Nothing is ever written onto an archive event (`TaskArchive` is append-only,
 * and a vacation can be corrected after the fact). Every rule below is derived
 * at read time from the stored ranges, which is why `Vacations` documents are
 * kept forever: they are the only record that makes the past re-derivable.
 *
 * The same rules run in two places and must agree — `insightsService.computeStats`
 * for the live window, and `ArchiveSummary.foldEvents` for months being pruned
 * out of it. That is the reason this arithmetic lives here rather than in
 * either caller.
 */

const { daysInMonth } = require("./dates");

/** Milliseconds in a day. */
const MS_PER_DAY = 86400000;

/**
 * How much of a call period must be vacation before the period stops counting.
 *
 * Calls are the one signal measured over a *period* rather than a day: a
 * two-day trip must not excuse a whole fortnight of not ringing someone. At
 * 80% a biweekly period needs ~12 of its 14 days away, a monthly one ~25 of 31.
 */
const CALL_EXEMPTION_THRESHOLD = 0.8;

/**
 * "YYYY-MM-DD" → whole days since the epoch.
 *
 * Parsed by component rather than via `new Date(string)` so the value can
 * never shift a day across timezones — the same rule the clients follow.
 * @param {string} day
 * @returns {number}
 */
function dayNumber(day) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / MS_PER_DAY;
}

/** Whole days since the epoch → "YYYY-MM-DD". */
function dayString(number) {
  return new Date(number * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The day before `day`, as "YYYY-MM-DD". */
function previousDay(day) {
  return dayString(dayNumber(day) - 1);
}

/**
 * Drop anything malformed and sort by start date.
 *
 * Callers pass whatever `GET /vacations` returned, and a half-written range
 * must never silently exempt every day in history.
 * @param {Array} vacations
 * @returns {Array<{startDate: string, endDate: string}>}
 */
function toRanges(vacations) {
  if (!Array.isArray(vacations)) return [];
  return vacations
    .filter(
      (v) =>
        v &&
        typeof v.startDate === "string" &&
        typeof v.endDate === "string" &&
        v.startDate <= v.endDate,
    )
    .map((v) => ({ startDate: v.startDate, endDate: v.endDate }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/**
 * Is this calendar day inside any vacation? Both ends are inclusive — the day
 * a vacation is switched on and the day it is switched off both count.
 * @param {string} day  "YYYY-MM-DD"
 * @param {Array} vacations
 * @returns {boolean}
 */
function isVacationDay(day, vacations) {
  if (!day) return false;
  return toRanges(vacations).some(
    (range) => day >= range.startDate && day <= range.endDate,
  );
}

/**
 * The vacation covering `day`, or null.
 *
 * Searches the caller's own array rather than `toRanges`, because `toRanges`
 * normalizes each entry down to its two dates — running the find over that
 * would return an object with no `_id` or `note`, and the clients match the
 * active vacation against the list by id.
 *
 * @param {Array} vacations
 * @param {string} day  "YYYY-MM-DD"
 * @returns {Object|null} the stored document, untouched
 */
function activeVacation(vacations, day) {
  if (!Array.isArray(vacations)) return null;
  return (
    vacations.find(
      (v) =>
        v &&
        typeof v.startDate === "string" &&
        typeof v.endDate === "string" &&
        v.startDate <= v.endDate &&
        day >= v.startDate &&
        day <= v.endDate,
    ) || null
  );
}

/**
 * How many days in the inclusive span [from, to] are vacation days.
 *
 * Computed as range overlap rather than by walking the days, so a task left
 * undone across a year still costs a handful of comparisons. Ranges are
 * non-overlapping (the controller rejects overlaps), so the sum cannot
 * double-count.
 * @param {string} from  "YYYY-MM-DD"
 * @param {string} to    "YYYY-MM-DD"
 * @param {Array} vacations
 * @returns {number}
 */
function vacationDaysBetween(from, to, vacations) {
  if (!from || !to) return 0;
  const start = dayNumber(from);
  const end = dayNumber(to);
  if (end < start) return 0;

  let total = 0;
  for (const range of toRanges(vacations)) {
    const overlap =
      Math.min(end, dayNumber(range.endDate)) -
      Math.max(start, dayNumber(range.startDate)) +
      1;
    if (overlap > 0) total += overlap;
  }
  return total;
}

/**
 * The number of whole days a vacation covers, both ends inclusive.
 * @param {{startDate: string, endDate: string}} vacation
 * @returns {number}
 */
function vacationLength(vacation) {
  return dayNumber(vacation.endDate) - dayNumber(vacation.startDate) + 1;
}

/**
 * The last day the stats window should include, or null for "include everything".
 *
 * While the user is away the displayed numbers **freeze** at the day before
 * they left, so a streak or a completion rate does not visibly decay over a
 * holiday. It is a display freeze only: anything ticked off mid-trip is still
 * archived and appears the day they are back.
 *
 * @param {Array} vacations
 * @param {string} today  "YYYY-MM-DD"
 * @returns {string|null}
 */
function statsCutoff(vacations, today) {
  const active = activeVacation(vacations, today);
  return active ? previousDay(active.startDate) : null;
}

/**
 * The most recent vacation that has just ended, for the "welcome back" framing
 * on the first report after a trip.
 *
 * A three-day grace window rather than strictly yesterday: the report is
 * written by the nightly cron, and one missed night should not cost the user
 * the only report that helps them restart.
 *
 * @param {Array} vacations
 * @param {string} today  "YYYY-MM-DD"
 * @param {number} [graceDays=3]
 * @returns {{startDate: string, endDate: string, days: number, daysAgo: number}|null}
 */
function recentlyEnded(vacations, today, graceDays = 3) {
  const todayNumber = dayNumber(today);
  let best = null;

  for (const range of toRanges(vacations)) {
    const gap = todayNumber - dayNumber(range.endDate);
    if (gap < 1 || gap > graceDays) continue;
    if (!best || range.endDate > best.endDate) {
      best = { ...range, days: vacationLength(range), daysAgo: gap };
    }
  }
  return best;
}

/**
 * The calendar span a `call_result` covers, from the day cron step 8 archived it.
 *
 * These are the periods the app documents to the user — "biweekly means 1st–14th
 * and 15th–month-end, monthly means once a month" — not the reset mechanics,
 * which are a midnight earlier. For an 80% test that distinction is noise, and
 * the documented span is the one a person can reason about.
 *
 * @param {string} dueDate  "YYYY-MM-DD", the day the period was archived
 * @param {string} frequency  "biweekly" | "monthly"
 * @returns {{start: string, end: string, days: number}}
 */
function callPeriod(dueDate, frequency) {
  const [year, month, date] = dueDate.split("-").map(Number);
  const monthPrefix = dueDate.slice(0, 7);
  const lastDay = daysInMonth(year, month);
  const pad = (n) => String(n).padStart(2, "0");

  // The 15th closes the first half of the month; anything else closes a period
  // that runs to month end (the whole month for a monthly call, the back half
  // for a biweekly one).
  const [start, end] =
    date === 15
      ? [`${monthPrefix}-01`, `${monthPrefix}-14`]
      : frequency === "biweekly"
        ? [`${monthPrefix}-15`, `${monthPrefix}-${pad(lastDay)}`]
        : [`${monthPrefix}-01`, `${monthPrefix}-${pad(lastDay)}`];

  return { start, end, days: dayNumber(end) - dayNumber(start) + 1 };
}

/**
 * Whether a missed call period should be forgiven.
 *
 * Unlike every other signal this is not a per-day test: the period only stops
 * counting when the vacation swallowed essentially all of it.
 * @param {string} dueDate
 * @param {string} frequency
 * @param {Array} vacations
 * @returns {boolean}
 */
function isCallPeriodExempt(dueDate, frequency, vacations) {
  if (!dueDate) return false;
  const period = callPeriod(dueDate, frequency);
  if (period.days <= 0) return false;
  const away = vacationDaysBetween(period.start, period.end, vacations);
  return away / period.days >= CALL_EXEMPTION_THRESHOLD;
}

/**
 * The calendar day an archive event should be judged on.
 *
 * Not every event has a `dueDate`: a reschedule or a deletion only knows when
 * it happened. Getting this wrong is the difference between forgiving a
 * postpone made on holiday and flagging it.
 *
 * @param {Object} event
 * @returns {string|null} "YYYY-MM-DD"
 */
function eventDay(event) {
  switch (event.type) {
    case "habit_result":
    case "task_result":
    case "call_result":
      return event.dueDate || null;
    case "task_completed":
      // Judged on the day it was finished; `plannedFor` drives slippage instead.
      return event.doneAt
        ? new Date(event.doneAt).toISOString().slice(0, 10)
        : event.at
          ? new Date(event.at).toISOString().slice(0, 10)
          : null;
    default:
      return event.at ? new Date(event.at).toISOString().slice(0, 10) : null;
  }
}

/**
 * A scheduled day that passed while the user was away and was not done.
 *
 * The asymmetry is the whole feature: a habit **ticked off** on a vacation day
 * is an ordinary win that keeps its streak running, while an untouched one is
 * neither a hit nor a miss — it is a gap, and the streak restarts after it.
 *
 * @param {Object} event  A habit_result or task_result
 * @param {Array} vacations
 * @returns {boolean}
 */
function isPausedResult(event, vacations) {
  if (event.completed) return false;
  return isVacationDay(event.dueDate, vacations);
}

/**
 * Whether a postpone or deletion happened under vacation cover.
 *
 * Two ways to qualify, and the second is not optional: a trip booked in
 * advance is re-dated *before* it starts, so the event's own timestamp is
 * outside every range. Without the explicit flag the Vacation panel's own
 * re-dating would be logged as procrastination.
 *
 * @param {Object} event
 * @param {Array} vacations
 * @returns {boolean}
 */
function isVacationEvent(event, vacations) {
  if (event.vacationMove === true) return true;
  return isVacationDay(eventDay(event), vacations);
}

/**
 * Slippage with the days the user was away taken out of it.
 *
 * One formula covers both cases people actually hit. A task planned for Aug 1,
 * finished Aug 20, with a trip from Aug 3–15: nineteen raw days late, but only
 * Aug 1–2 and Aug 16–20 were ever actionable, so it is **six** days late. And a
 * task planned for Aug 5 — mid-trip — comes out at four days late, exactly as
 * if its deadline had moved to the day the user got back.
 *
 * @param {string} plannedFor  "YYYY-MM-DD"
 * @param {string} doneDay     "YYYY-MM-DD"
 * @param {number|null} rawSlippageDays
 * @param {Array} vacations
 * @returns {number|null} never less than the raw value's sign allows
 */
function adjustedSlippage(plannedFor, doneDay, rawSlippageDays, vacations) {
  if (rawSlippageDays === null || rawSlippageDays === undefined) return null;
  if (rawSlippageDays <= 0) return rawSlippageDays; // early or on the day
  const away = vacationDaysBetween(plannedFor, doneDay, vacations);
  return Math.max(0, rawSlippageDays - away);
}

module.exports = {
  CALL_EXEMPTION_THRESHOLD,
  dayNumber,
  dayString,
  previousDay,
  toRanges,
  isVacationDay,
  activeVacation,
  vacationDaysBetween,
  vacationLength,
  statsCutoff,
  recentlyEnded,
  callPeriod,
  isCallPeriodExempt,
  eventDay,
  isPausedResult,
  isVacationEvent,
  adjustedSlippage,
};
