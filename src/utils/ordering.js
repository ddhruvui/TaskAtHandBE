/**
 * The app has exactly one ordering rule, and before this file it was written
 * out three separate times:
 *
 *   **Undone first, done last** — and inside the undone half, sorted by
 *   whatever "soonest" means for that list (next ECD for todo tasks, dated
 *   before undated for project tasks).
 *
 * The three copies were the nightly re-sort (cron step 7), the project task
 * list (`Project.sortProjectTasks`) and the insertion point `Task.create` /
 * `Task.update` compute for a new or un-done task. They are now the same two
 * functions with different comparators.
 *
 * Everything here is stable: `Array.prototype.sort` is required to be, so a
 * manual arrangement within a tie (two tasks due the same day) survives every
 * re-sort. Comparators must therefore return 0 for "equal", never a coin flip.
 */

/**
 * Split a list into its undone and done halves, each in the order it arrived.
 * Both collections that use this store the flag as `done`.
 * @param {Array} items
 * @returns {{undone: Array, done: Array}}
 */
function partitionByDone(items) {
  const undone = [];
  const done = [];
  for (const item of items) {
    if (item.done === true) done.push(item);
    else undone.push(item);
  }
  return { undone, done };
}

/**
 * The ordering rule itself: undone items first (sorted by `compare` when one
 * is given), done items last in their existing order.
 *
 * Done items are deliberately never re-sorted — their order is the order they
 * were finished in, which is what the user sees at the bottom of a header.
 *
 * @param {Array} items
 * @param {(a: any, b: any) => number} [compare]  Applied to the undone half only
 * @returns {Array} a new array; the input is not mutated
 */
function orderDoneLast(items, compare) {
  const { undone, done } = partitionByDone(items);
  if (compare) undone.sort(compare);
  return [...undone, ...done];
}

/**
 * Comparator: ascending by a numeric key.
 *
 * `Infinity` is a legal key and sorts last, which is how a task with no ECD
 * ends up below every scheduled one. Two `Infinity` keys subtract to `NaN`,
 * which `sort` treats as "keep the current order" — the same tie-preserving
 * behaviour the hand-written comparators had.
 *
 * @param {(item: any) => number} key
 * @returns {(a: any, b: any) => number}
 */
function ascendingBy(key) {
  return (a, b) => key(a) - key(b);
}

/**
 * Comparator: items the predicate accepts come first, the rest keep their
 * relative order behind them. Used for "a dated step outranks the undated
 * backlog".
 * @param {(item: any) => boolean} predicate
 * @returns {(a: any, b: any) => number}
 */
function matchingFirst(predicate) {
  return (a, b) => (predicate(a) ? 0 : 1) - (predicate(b) ? 0 : 1);
}

/**
 * Group items by a key, preserving input order inside each group.
 * @param {Array} items
 * @param {(item: any) => any} key
 * @returns {Map<any, Array>}
 */
function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * Which documents in an ordered list are not sitting on their index, i.e. the
 * minimum set of writes that makes priorities contiguous 0..n-1 again.
 * @param {Array} ordered  Documents in their desired order
 * @returns {Array<{_id: any, priority: number}>} only the ones that moved
 */
function priorityChanges(ordered) {
  const changes = [];
  for (let index = 0; index < ordered.length; index++) {
    if (ordered[index].priority !== index) {
      changes.push({ _id: ordered[index]._id, priority: index });
    }
  }
  return changes;
}

/**
 * `priorityChanges` as ready-to-send `bulkWrite` operations.
 * @param {Array} ordered
 * @returns {Array<Object>}
 */
function priorityBulkOps(ordered) {
  return priorityChanges(ordered).map(({ _id, priority }) => ({
    updateOne: { filter: { _id }, update: { $set: { priority } } },
  }));
}

module.exports = {
  orderDoneLast,
  ascendingBy,
  matchingFirst,
  groupBy,
  priorityBulkOps,
};
