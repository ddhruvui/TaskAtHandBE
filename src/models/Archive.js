const { getDatabase } = require("../config/db");

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
 *      { taskId, taskName, headerId, headerName, fromEcd, toEcd, pushedLater }
 *  - call_result:     a call's outcome for one period, logged by cron step 7
 *      at the period boundary before the reset (dueDate = the reset day)
 *      { callId, callName, frequency, dueDate, completed, doneAt }
 *
 * All events additionally carry { type, at } where `at` is the insertion time.
 * dueDate / plannedFor are "YYYY-MM-DD" UTC calendar-day strings.
 */
class Archive {
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "TaskArchive-Test" : "TaskArchive";
    return db.collection(collectionName);
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
