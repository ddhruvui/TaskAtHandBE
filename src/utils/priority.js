const { toObjectId } = require("./documents");

/**
 * Priority contiguity is the invariant the whole app leans on: within a scope
 * — the whole collection for headers, goals, projects and life events, one
 * header for tasks — priorities are always exactly `0..n-1`, with no holes and
 * no duplicates.
 *
 * Keeping it true means the same three moves, which five models had written
 * out by hand with only the noun in the comment changed:
 *
 *   - append:      a new document takes priority `n` (or is inserted mid-list)
 *   - move:        the documents between the old and new slot slide one place
 *   - close a gap: everything after a removed document moves up one
 *
 * `scope` is the Mongo filter that defines "the list": `{}` for a whole
 * collection, `{ headerId }` for one header's tasks.
 *
 * `stamp` exists because tasks record `updatedAt` on every shifted neighbour
 * and headers/goals/projects/life events deliberately do not — priority is
 * system-managed there, and stamping it would make "recently edited" mean
 * "something else moved".
 */

/** Build the `$inc`/`$set` update a shift applies. */
function shiftUpdate(delta, stamp) {
  const update = { $inc: { priority: delta } };
  if (stamp) update.$set = { updatedAt: new Date() };
  return update;
}

/**
 * The priority a new document appended to the end of a scope gets: the number
 * of documents already in it.
 * @param {Collection} collection
 * @param {Object} [scope]
 * @returns {Promise<number>}
 */
function nextPriority(collection, scope = {}) {
  return collection.countDocuments(scope);
}

/**
 * The size of a priority scope — the count a move is range-checked against.
 * @param {Collection} collection
 * @param {Object} [scope]
 * @returns {Promise<number>}
 */
function scopeSize(collection, scope = {}) {
  return collection.countDocuments(scope);
}

/**
 * Reject a target priority outside `0..count-1`. Thrown as a plain Error whose
 * message the controllers match on to answer 400 instead of 500 — the wording
 * is part of the API contract.
 * @param {number} priority
 * @param {number} count  Scope size, including the document being moved
 */
function assertPriorityInRange(priority, count) {
  if (priority < 0 || priority >= count) {
    throw new Error(`Priority must be between 0 and ${count - 1}`);
  }
}

/**
 * Shift every document matching `filter` by `delta`.
 * @returns {Promise<number>} documents shifted
 */
async function shiftBy(collection, filter, delta, { stamp = false } = {}) {
  const result = await collection.updateMany(
    filter,
    shiftUpdate(delta, stamp),
  );
  return result.modifiedCount;
}

/**
 * Slide the documents a move steps over, so the list stays contiguous.
 *
 * Moving up (`to < from`) pushes the block `[to, from)` down by one; moving
 * down pushes `(from, to]` up by one. The moved document is excluded — its own
 * new priority belongs to the caller's `$set`. A no-op move writes nothing.
 *
 * @param {Collection} collection
 * @param {Object} params
 * @param {string} params.id     The document being moved
 * @param {number} params.from   Its current priority
 * @param {number} params.to     Its target priority
 * @param {Object} [params.scope]
 * @param {boolean} [params.stamp]
 * @returns {Promise<number>} neighbours shifted
 */
function shiftForMove(collection, { id, from, to, scope = {}, stamp = false }) {
  if (to === from) return Promise.resolve(0);
  const movingUp = to < from;
  return shiftBy(
    collection,
    {
      ...scope,
      priority: movingUp ? { $gte: to, $lt: from } : { $gt: from, $lte: to },
      _id: { $ne: toObjectId(id) },
    },
    movingUp ? 1 : -1,
    { stamp },
  );
}

/**
 * Close the hole a removed document left behind: everything below it moves up
 * one place.
 * @param {Collection} collection
 * @param {number} priority  The removed document's priority
 * @param {Object} [options]
 * @returns {Promise<number>} documents shifted
 */
function closeGap(collection, priority, { scope = {}, stamp = false } = {}) {
  return shiftBy(
    collection,
    { ...scope, priority: { $gt: priority } },
    -1,
    { stamp },
  );
}

/**
 * Open a slot in the middle of a list by pushing a selected block down one —
 * used when a new task is inserted above the done ones rather than appended.
 * @param {Collection} collection
 * @param {Object} filter  The documents that must make room
 * @param {Object} [options]
 * @returns {Promise<number>} documents shifted
 */
function openSlot(collection, filter, { stamp = false } = {}) {
  return shiftBy(collection, filter, 1, { stamp });
}

/**
 * A complete priority move: range-check the target against the current list
 * size, slide the neighbours out of the way, and hand back the priority the
 * caller should write onto the document itself.
 *
 * This is the whole of what `update()` did by hand in five models.
 *
 * @param {Collection} collection
 * @param {Object} params  Same shape as `shiftForMove`
 * @returns {Promise<number>} the new priority
 * @throws {Error} "Priority must be between 0 and n-1" when out of range
 */
async function movePriority(collection, { id, from, to, scope = {}, stamp = false }) {
  const count = await scopeSize(collection, scope);
  assertPriorityInRange(to, count);
  await shiftForMove(collection, { id, from, to, scope, stamp });
  return to;
}

module.exports = {
  nextPriority,
  scopeSize,
  shiftForMove,
  movePriority,
  closeGap,
  openSlot,
};
