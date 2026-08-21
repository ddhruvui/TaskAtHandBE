const BaseModel = require("./BaseModel");

/**
 * TaskArchive is an append-only event log. Event types:
 *
 *  - habit_result:    a day_of_week task's outcome for one scheduled day
 *      { taskId, taskName, headerId, headerName, scheduledDays, dueDate,
 *        completed, doneAt }
 *  - task_result:     a day_of_month / day_of_year task's outcome for one cycle
 *      { taskId, taskName, headerId, headerName, ecdType, ecdValue, dueDate,
 *        completed, doneAt }
 *  - task_completed:  a one-time (date / no-ECD) task captured before cron deletes it
 *      { taskId, taskName, headerId, headerName, ecdType, plannedFor,
 *        taskCreatedAt, doneAt }
 *  - task_rescheduled: a task's ECD was changed by the user
 *      { taskId, taskName, headerId, headerName, fromEcd, toEcd, pushedLater,
 *        reason, vacationMove }  reason is the user's optional stated cause for
 *        a postpone (null when none was given); a pushedLater reschedule with no
 *        reason is an unexcused procrastination signal. `vacationMove` is set by
 *        the Vacation panel when it moves a task out of a booked trip — such a
 *        move is never procrastination, and the flag is required because a trip
 *        booked in advance is re-dated before any vacation day has arrived.
 *  - task_deleted:    an undone task the user removed, with their stated reason
 *      { taskId, taskName, headerId, headerName, ecdType, ecd, reason,
 *        taskCreatedAt }
 *  - call_result:     a call's outcome for one period, logged by cron step 8
 *      at the period boundary before the reset (dueDate = the reset day)
 *      { callId, callName, frequency, dueDate, completed, doneAt }
 *
 * All events additionally carry { type, at } where `at` is the insertion time.
 * dueDate / plannedFor are "YYYY-MM-DD" UTC calendar-day strings.
 */
class Archive extends BaseModel {
  static collectionName = "TaskArchive";

  /**
   * Create the index every archive read depends on.
   *
   * `findByRange` filters on `at`, and so does the retention prune. Without
   * this the nightly stats snapshot is a full collection scan — invisible at a
   * few hundred documents, and the first thing to degrade as history builds up.
   *
   * `createIndex` is idempotent, so this is safe to call on every boot.
   */
  static async ensureIndexes() {
    const collection = await this.getCollection();
    await collection.createIndex({ at: 1 }, { name: "at_1" });
  }

  /**
   * Insert a single archive event. Never throws — archiving must not break
   * the operation that triggered it.
   * @param {Object} event
   */
  static async log(event) {
    try {
      const collection = await this.getCollection();
      await collection.insertOne({ ...event, at: new Date() });
    } catch (error) {
      console.error("[Archive] Failed to log event:", error.message);
    }
  }

  /**
   * Insert multiple archive events in one write. Never throws.
   * @param {Array<Object>} events
   */
  static async logMany(events) {
    if (!events || events.length === 0) return;
    try {
      const collection = await this.getCollection();
      const at = new Date();
      await collection.insertMany(events.map((e) => ({ ...e, at })));
    } catch (error) {
      console.error("[Archive] Failed to log events:", error.message);
    }
  }

  /**
   * The `task_completed` event for a todo task that is about to be deleted.
   *
   * Both places that delete a completed task build this — cron step 4 for the
   * nightly one-off cleanup, and `Task.deleteByHeader` for a header cascade —
   * and the two copies had to stay identical for the insights maths to work,
   * so there is only one now.
   *
   * @param {Object} task  The task document being removed
   * @param {string|null} headerName  Denormalized so the event survives the header
   * @returns {Object}
   */
  static completionEvent(task, headerName) {
    return {
      type: "task_completed",
      taskId: task._id.toString(),
      taskName: task.name,
      headerId: task.headerId,
      headerName: headerName || null,
      ecdType: task.ecd ? task.ecd.type : null,
      plannedFor: task.ecd && task.ecd.type === "date" ? task.ecd.value : null,
      taskCreatedAt: task.createdAt || null,
      doneAt: task.doneAt || null,
    };
  }

  /**
   * The ids already archived for a due date — the idempotency guard both
   * nightly outcome steps use, so a manual `POST /cron/run` re-run cannot
   * double-log the same day.
   * @param {string|string[]} types  Event type(s) to look for
   * @param {string} dueDate  "YYYY-MM-DD"
   * @param {string} idField  The event field holding the subject's id
   * @returns {Promise<Set<string>>}
   */
  static async loggedIdsFor(types, dueDate, idField) {
    const collection = await this.getCollection();
    const existing = await collection
      .find(
        { type: { $in: [].concat(types) }, dueDate },
        { projection: { [idField]: 1 } },
      )
      .toArray();
    return new Set(existing.map((event) => event[idField]));
  }

  /**
   * How many times each named task was completed, across every raw event of a
   * type — no date window.
   *
   * The raw half of a lifetime total. `ArchiveSummary` holds the folded months
   * and this holds everything since the last prune, and the two are disjoint
   * by construction (step 10 deletes exactly what it folds), so the caller can
   * add them without double-counting.
   *
   * Keyed by **name**, because that is the only identifier the monthly
   * summaries kept — which also means renaming a task splits its lifetime
   * total in two.
   *
   * @param {string} type  Event type, e.g. "habit_result"
   * @returns {Promise<Object<string, number>>}
   */
  static async completedCountsByName(type) {
    const collection = await this.getCollection();
    const rows = await collection
      .aggregate([
        { $match: { type, completed: true } },
        { $group: { _id: "$taskName", count: { $sum: 1 } } },
      ])
      .toArray();
    return Object.fromEntries(
      rows.filter((r) => r._id).map((r) => [r._id, r.count]),
    );
  }

  /**
   * Return events with `at` in [from, to], oldest first.
   * @param {Date} from
   * @param {Date} to
   * @param {string} [type]  Optional event type filter
   * @returns {Promise<Array>}
   */
  static async findByRange(from, to, type) {
    const collection = await this.getCollection();
    const query = { at: { $gte: from, $lte: to } };
    if (type) query.type = type;
    return collection.find(query).sort({ at: 1 }).toArray();
  }
}

module.exports = Archive;
