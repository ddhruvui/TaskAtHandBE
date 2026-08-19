const OrderedModel = require("./OrderedModel");
const {
  MAX_DAYS_BY_MONTH,
  daysInMonth,
  parseSlashDate,
} = require("../utils/dates");

/**
 * Parse a "D/M" life-event date into { day, month } numbers.
 * e.g. "7/3" → { day: 7, month: 3 }
 */
function parseLifeEventDate(str) {
  return parseSlashDate(str);
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
  const maxDay = daysInMonth(year, month);
  const occurrence = Date.UTC(year, month - 1, Math.min(day, maxDay));
  const todayTs = Date.UTC(year, today.getUTCMonth(), today.getUTCDate());
  return occurrence < todayTs ? year : year - 1;
}

/**
 * A recurring personal date (a birthday, an anniversary). Cron step 6 turns a
 * due one into a dated todo task once a year and links it via `todoTaskId`;
 * the event itself is never deleted.
 */
class LifeEvent extends OrderedModel {
  static collectionName = "LifeEvents";

  /**
   * Create a new life event. Priority is assigned as total existing life
   * events (appended at end), same scheme as projects.
   * @param {Object} data  { name, date, lastAddedYear }
   * @returns {Promise<Object>} Created life event
   */
  static async create(data) {
    return this.insert({
      name: data.name,
      date: data.date,
      lastAddedYear: data.lastAddedYear,
      done: false,
      todoTaskId: null,
      priority: await this.nextPriority(),
      ...this.timestamps(),
    });
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
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    for (const field of ["name", "date", "lastAddedYear", "done", "todoTaskId"]) {
      if (data[field] !== undefined) updates[field] = data[field];
    }

    const priority = await this.resolvePriorityChange(id, current, data.priority);
    if (priority !== undefined) updates.priority = priority;

    return this.saveUpdates(id, updates, current);
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
          updatedAt: this.stamp(),
        },
      },
    );
    return result.modifiedCount;
  }
}

module.exports = {
  LifeEvent,
  parseLifeEventDate,
  baselineLastAddedYear,
  MAX_DAYS_BY_MONTH,
};
