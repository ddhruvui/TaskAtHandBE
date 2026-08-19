const BaseModel = require("./BaseModel");
const Archive = require("./Archive");
const { isDateString } = require("../utils/validate");
const {
  nextPriority,
  scopeSize,
  shiftForMove,
  movePriority,
  closeGap,
  openSlot,
} = require("../utils/priority");

const VALID_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Validate an ECD object.
 * Returns null if ecd is null/undefined (optional field).
 * Throws on invalid structure.
 */
function validateEcd(ecd) {
  if (ecd === null || ecd === undefined) return null;

  if (typeof ecd !== "object" || Array.isArray(ecd)) {
    throw new Error("ecd must be an object with 'type' and 'value'");
  }

  const { type, value } = ecd;
  const validTypes = ["date", "day_of_week", "day_of_month", "day_of_year"];

  if (!validTypes.includes(type)) {
    throw new Error(`ecd.type must be one of: ${validTypes.join(", ")}`);
  }

  switch (type) {
    case "date": {
      if (!isDateString(value)) {
        throw new Error(
          'ecd.value for type "date" must be a YYYY-MM-DD string',
        );
      }
      break;
    }
    case "day_of_week": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          'ecd.value for type "day_of_week" must be a non-empty array',
        );
      }
      const invalid = value.filter((d) => !VALID_DOW.includes(d));
      if (invalid.length > 0) {
        throw new Error(
          `ecd.value contains invalid day(s): ${invalid.join(", ")}. Allowed: ${VALID_DOW.join(", ")}`,
        );
      }
      break;
    }
    case "day_of_month": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          'ecd.value for type "day_of_month" must be a non-empty array',
        );
      }
      const invalid = value.filter(
        (d) => !Number.isInteger(d) || d < 1 || d > 31,
      );
      if (invalid.length > 0) {
        throw new Error(
          'ecd.value for type "day_of_month" must contain integers between 1 and 31',
        );
      }
      break;
    }
    case "day_of_year": {
      if (
        typeof value !== "string" ||
        !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
      ) {
        throw new Error(
          'ecd.value for type "day_of_year" must be a D/M/YYYY string',
        );
      }
      break;
    }
  }

  return ecd;
}

/**
 * True when an ECD change moves a one-time date further into the future —
 * the classic "push it to later" reschedule.
 */
function isPushedLater(fromEcd, toEcd) {
  if (!fromEcd || !toEcd) return false;
  if (fromEcd.type !== "date" || toEcd.type !== "date") return false;
  return toEcd.value > fromEcd.value; // YYYY-MM-DD compares lexicographically
}

/**
 * A todo item. Tasks are the one collection whose priorities are contiguous
 * **per header** rather than collection-wide, so they use `utils/priority`
 * directly with a `{ headerId }` scope instead of extending `OrderedModel`.
 *
 * They are also the one collection that stamps `updatedAt` on the neighbours a
 * move shifts (`stamp: true` below): a task's timestamp is user-facing, and the
 * clients use it to decide what changed.
 */
class Task extends BaseModel {
  static collectionName = "Tasks";
  static sortBy = { priority: 1 };

  /** Tasks store real Dates, not the ISO strings the other collections use. */
  static stamp() {
    return new Date();
  }

  /** The priority scope a task belongs to: its header. */
  static scopeOf(headerId) {
    return { headerId };
  }

  /**
   * Look up the header for a task, tolerating missing/invalid ids.
   * @param {string} headerId
   * @returns {Promise<Object|null>}
   */
  static async getHeaderForTask(headerId) {
    try {
      const Header = require("./Header");
      return await Header.findById(headerId);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Return all tasks for a header, sorted by priority ascending
   * @param {string} headerId
   * @returns {Promise<Array>}
   */
  static async findByHeader(headerId) {
    const collection = await this.getCollection();
    return collection.find(this.scopeOf(headerId)).sort(this.sortBy).toArray();
  }

  /**
   * Create a new task. Priority is assigned just before the first done task in the header.
   * All existing done tasks in the header are shifted down by 1.
   * @param {Object} data  { name, notes?, headerId, ecd? }
   * @returns {Promise<Object>} Created task
   */
  static async create(data) {
    const collection = await this.getCollection();
    const ecd = validateEcd(data.ecd);
    const scope = this.scopeOf(data.headerId);

    // The insertion point is "after every undone task", i.e. where the first
    // done task currently sits — so the done block makes room for it.
    const undoneCount = await nextPriority(collection, { ...scope, done: false });
    await openSlot(collection, { ...scope, done: true }, { stamp: true });

    return this.insert({
      name: data.name,
      notes: data.notes || "",
      headerId: data.headerId,
      priority: undoneCount,
      ecd: ecd || null,
      done: false,
      doneAt: null,
      ...this.timestamps(),
    });
  }

  /**
   * Update a task. Handles:
   *   - Field edits (name, notes, ecd)
   *   - done toggle (priority reorder within header)
   *   - Manual priority change (shift affected tasks in same header)
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object|null>} Updated task or null
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const scope = this.scopeOf(current.headerId);
    const updates = { updatedAt: this.stamp() };

    // Field updates
    if (data.name !== undefined) updates.name = data.name;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.ecd !== undefined) {
      updates.ecd = validateEcd(data.ecd);

      // Archive ECD changes so reschedules (procrastination signal) are visible.
      // A postpone (pushedLater) may carry the user's stated reason: no reason is
      // procrastination for sure, a valid reason is a legitimate deferral (judged
      // by the AI insights). `data.reason` is never written to the task document.
      if (JSON.stringify(updates.ecd) !== JSON.stringify(current.ecd || null)) {
        const header = await this.getHeaderForTask(current.headerId);
        await Archive.log({
          type: "task_rescheduled",
          taskId: current._id.toString(),
          taskName: current.name,
          headerId: current.headerId,
          headerName: header ? header.name : null,
          fromEcd: current.ecd || null,
          toEcd: updates.ecd,
          pushedLater: isPushedLater(current.ecd, updates.ecd),
          reason: data.reason ? data.reason : null,
        });
      }
    }

    // Handle done toggle
    if (data.done !== undefined && data.done !== current.done) {
      // Marking done sends the task to the end of its header; un-doing it
      // brings it back to just before the first done task. Both are the same
      // move, only the target differs — and neither is range-checked, because
      // the target is computed from the header, not sent by the client.
      const to =
        data.done === true
          ? (await scopeSize(collection, scope)) - 1
          : await nextPriority(collection, { ...scope, done: false });

      await shiftForMove(collection, {
        id,
        from: current.priority,
        to,
        scope,
        stamp: true,
      });

      updates.priority = to;
      updates.done = data.done;
      updates.doneAt = data.done === true ? this.stamp() : null;
    } else if (
      data.priority !== undefined &&
      data.priority !== current.priority
    ) {
      // Manual priority reorder (no done toggle) — this one *is* range-checked,
      // the target came from the client.
      updates.priority = await movePriority(collection, {
        id,
        from: current.priority,
        to: data.priority,
        scope,
        stamp: true,
      });
    }

    return this.applyUpdate(id, updates);
  }

  /**
   * Delete a task by id. Shifts remaining tasks in the same header to keep priorities contiguous.
   *
   * When an **undone** task is deleted manually, a `task_deleted` archive event
   * is logged with the user's `reason` so the AI insights can treat abandoned
   * tasks (and why they were dropped) as a signal. Deleting a *done* task logs
   * nothing here — it was already accomplished, and its completion is captured
   * either by cron step 5 (one-off tasks) or by `deleteByHeader` (header
   * cascade, see below).
   * @param {string} id
   * @param {string} [reason]  Why the task was deleted (undone tasks only)
   * @returns {Promise<Object|null>} Deleted task or null
   */
  static async delete(id, reason) {
    const collection = await this.getCollection();
    const task = await this.findById(id);
    if (!task) return null;

    if (!task.done) {
      const header = await this.getHeaderForTask(task.headerId);
      await Archive.log({
        type: "task_deleted",
        taskId: task._id.toString(),
        taskName: task.name,
        headerId: task.headerId,
        headerName: header ? header.name : null,
        ecdType: task.ecd ? task.ecd.type : null,
        ecd: task.ecd || null,
        reason: reason || null,
        taskCreatedAt: task.createdAt || null,
      });
    }

    await this.removeById(id);
    await closeGap(collection, task.priority, {
      scope: this.scopeOf(task.headerId),
      stamp: true,
    });

    return task;
  }

  /**
   * Delete all tasks belonging to a specific header (used on header delete).
   * Done tasks are archived as `task_completed` events first so their
   * completion history is never orphaned when the header disappears (mirrors
   * cron step 5). Undone tasks in a cascade are not archived — a header-wide
   * delete isn't a per-task abandonment signal.
   * @param {string} headerId
   * @returns {Promise<number>} Number of tasks deleted
   */
  static async deleteByHeader(headerId) {
    const collection = await this.getCollection();
    const scope = this.scopeOf(headerId);

    const doneTasks = await collection
      .find({ ...scope, done: true })
      .toArray();
    if (doneTasks.length > 0) {
      const header = await this.getHeaderForTask(headerId);
      const headerName = header ? header.name : null;
      await Archive.logMany(
        doneTasks.map((task) => Archive.completionEvent(task, headerName)),
      );
    }

    const result = await collection.deleteMany(scope);
    return result.deletedCount;
  }
}

module.exports = { Task, validateEcd };
