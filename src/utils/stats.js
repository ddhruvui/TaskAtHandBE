/**
 * The arithmetic the insights service does over archive events. It is all
 * small, and it was all written at least twice — habits and calls compute the
 * same completion rate and the same trailing streak from the same
 * `{ dueDate, completed }` shape, and four different rollups open their
 * accumulator with the same `if (!store[key]) store[key] = {...}`.
 *
 * Keeping it here (and not in the service) is also what lets the numbers be
 * unit-tested without an archive to read from.
 */

/**
 * Get or create an accumulator bucket in a plain-object store.
 * @param {Object} store
 * @param {string} key
 * @param {() => Object} create  Called only the first time the key is seen
 * @returns {Object} the bucket
 */
function bucket(store, key, create) {
  if (!store[key]) store[key] = create();
  return store[key];
}

/** Comparator: oldest `dueDate` first. Dates are "YYYY-MM-DD", so a string compare is enough. */
function byDueDate(a, b) {
  return a.dueDate < b.dueDate ? -1 : 1;
}

/**
 * A percentage, rounded, with the empty case reported as 0 rather than NaN.
 * @param {number} completed
 * @param {number} scheduled
 * @returns {number} 0–100
 */
function completionRate(completed, scheduled) {
  return scheduled ? Math.round((completed / scheduled) * 100) : 0;
}

/**
 * How many entries at the **end** of a list satisfy a predicate — a streak
 * that is still running. Habits count trailing completions; calls count
 * trailing misses.
 * @param {Array} items  Oldest first
 * @param {(item: any) => boolean} matches
 * @returns {number}
 */
function trailingStreak(items, matches) {
  let streak = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (!matches(items[i])) break;
    streak++;
  }
  return streak;
}

/**
 * The longest unbroken run satisfying a predicate anywhere in the list.
 * @param {Array} items
 * @param {(item: any) => boolean} matches
 * @returns {number}
 */
function longestRun(items, matches) {
  let longest = 0;
  let run = 0;
  for (const item of items) {
    run = matches(item) ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * Mean of a list of numbers, rounded to one decimal.
 * @param {number[]} values
 * @returns {number|null} null for an empty list — "no data" is not zero
 */
function average(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Count how many entries satisfy a predicate.
 * @param {Array} items
 * @param {(item: any) => boolean} matches
 * @returns {number}
 */
function countWhere(items, matches) {
  let count = 0;
  for (const item of items) if (matches(item)) count++;
  return count;
}

module.exports = {
  bucket,
  byDueDate,
  completionRate,
  trailingStreak,
  longestRun,
  average,
  countWhere,
};
