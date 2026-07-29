const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

/** Returns number of days in a given month (1-indexed), leap-friendly (Feb = 29). */
const MAX_DAYS_BY_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parse a "D/M" life-event date into { day, month } numbers.
 * e.g. "7/3" → { day: 7, month: 3 }
 */
function parseLifeEventDate(str) {
  const [d, m] = str.split("/").map(Number);
  return { day: d, month: m };
}

/**
 * The `lastAddedYear` baseline for a life event whose date was just set:
 * the year of the occurrence that is already consumed. If this year's
 * occurrence is still upcoming (today counts as upcoming), that's last year's
 * — so the cron fires on the day; if it already passed, it's this year's — so
 * the cron waits for the next anniversary. Feb 29 resolves to Feb 28 in
 * non-leap years, same as `day_of_year` ECDs.
 * @param {string} date  "D/M"
 * @param {Date} today   UTC midnight
 * @returns {number}
 */
function baselineLastAddedYear(date, today) {
  const { day, month } = parseLifeEventDate(date);
  const year = today.getUTCFullYear();
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const occurrence = Date.UTC(year, month - 1, Math.min(day, maxDay));
  const todayTs = Date.UTC(year, today.getUTCMonth(), today.getUTCDate());
  return occurrence < todayTs ? year : year - 1;
}

class LifeEvent {
  /**
   * Get the LifeEvents collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "LifeEvents-Test" : "LifeEvents";
    return db.collection(collectionName);
  }

  /**
   * Return all life events sorted by priority ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a life event by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new life event. Priority is assigned as total existing life
   * events (appended at end), same scheme as projects.
   * @param {Object} data  { name, date, lastAddedYear }
   * @returns {Promise<Object>} Created life event
   */
  static async create(data) {
    const collection = await this.getCollection();
    const count = await collection.countDocuments();
    const now = new Date().toISOString();

    const lifeEvent = {
      name: data.name,
      date: data.date,
      lastAddedYear: data.lastAddedYear,
      done: false,
      todoTaskId: null,
      priority: count,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(lifeEvent);
    return { _id: result.insertedId, ...lifeEvent };
  }

  /**
   * Update a life event's name, date, done state, todo link and/or priority.
   * When priority changes all affected life events are shifted to keep
   * contiguous order, same as projects.
   * @param {string} id
   * @param {Object} data  { name?, date?, lastAddedYear?, done?, todoTaskId?, priority? }
   * @returns {Promise<Object|null>} Updated life event or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.date !== undefined) updates.date = data.date;
    if (data.lastAddedYear !== undefined)
      updates.lastAddedYear = data.lastAddedYear;
    if (data.done !== undefined) updates.done = data.done;
    if (data.todoTaskId !== undefined) updates.todoTaskId = data.todoTaskId;

    if (data.priority !== undefined && data.priority !== current.priority) {
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const count = await collection.countDocuments();

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift life events in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 } },
        );
      } else {
        // Moving down: shift life events in (oldPriority, newPriority] up by -1
        await collection.updateMany(
          {
            priority: { $gt: oldPriority, $lte: newPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: -1 } },
        );
      }

      updates.priority = newPriority;
    }

    if (Object.keys(updates).length === 0) return current;

    updates.updatedAt = new Date().toISOString();

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );
    return result;
  }

  /**
   * Delete a life event (and shift remaining life event priorities).
   * The todo task created from it (if any) is untouched — caller decides.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted life event or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const lifeEvent = await this.findById(id);
    if (!lifeEvent) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift all life events with higher priority down by 1
    await collection.updateMany(
      { priority: { $gt: lifeEvent.priority } },
      { $inc: { priority: -1 } },
    );

    return lifeEvent;
  }

  /**
   * Mark life events done when their linked todo tasks are deleted by the
   * cron (done date-task cleanup). The link is consumed: todoTaskId is
   * cleared and done flips true; the event itself is never deleted — it fires
   * again on its next anniversary.
   * @param {string[]} todoTaskIds  _ids (strings) of deleted todo tasks
   * @returns {Promise<number>} Number of life events marked done
   */
  static async completeByTodoIds(todoTaskIds) {
    if (!todoTaskIds || todoTaskIds.length === 0) return 0;
    const collection = await this.getCollection();

    const result = await collection.updateMany(
      { todoTaskId: { $in: todoTaskIds } },
      {
        $set: {
          done: true,
          todoTaskId: null,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    return result.modifiedCount;
  }
}

module.exports = { LifeEvent, parseLifeEventDate, baselineLastAddedYear, MAX_DAYS_BY_MONTH };
