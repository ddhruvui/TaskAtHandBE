const BaseModel = require("./BaseModel");
const { shiftsOverlap } = require("../utils/oncall");

/**
 * An on-call shift: `{ date, start, end, type, note, createdAt, updatedAt }`.
 *
 * `date` is the "YYYY-MM-DD" day the shift starts, `start`/`end` are "HH:mm"
 * in the user's local time (an end at or before the start runs past midnight;
 * "24:00" means the end of `date`), and `type` is "primary" or "secondary".
 *
 * **On-call is recorded separately and never affects tasks.** Nothing in the
 * cron, archive, stats or insights reads this collection — the only thing the
 * cron does with it is step 12, which deletes shifts that have ended (see
 * `pruneBefore`). Unlike `Vacations`, these rows are disposable: no rule is
 * ever re-derived from a past shift.
 */
class OnCall extends BaseModel {
  static collectionName = "OnCalls";

  /** Chronological, then by start time — the order both clients list them in. */
  static sortBy = { date: 1, start: 1 };

  /**
   * Shifts whose `date` is on or after a day, chronological.
   * @param {string} fromDate  "YYYY-MM-DD"
   * @returns {Promise<Array>}
   */
  static async findFrom(fromDate) {
    const collection = await this.getCollection();
    return collection
      .find({ date: { $gte: fromDate } })
      .sort(this.sortBy)
      .toArray();
  }

  /**
   * Create a shift.
   * @param {Object} data  { date, start, end, type, note }
   * @returns {Promise<Object>}
   */
  static async create(data) {
    return this.insert({
      date: data.date,
      start: data.start,
      end: data.end,
      type: data.type || "primary",
      note: data.note || "",
      ...this.timestamps(),
    });
  }

  /**
   * Apply a partial update.
   * @param {string} id
   * @param {Object} updates  validated fields only (see `definedFields`)
   * @returns {Promise<Object|null>}
   */
  static async update(id, updates) {
    const current = await this.findById(id);
    if (!current) return null;
    return this.saveUpdates(id, { ...updates }, current);
  }

  /**
   * Stored shifts that would share a minute with `shift`, ignoring one id.
   * The type does not matter — you cannot be on call twice at once.
   * @param {{date: string, start: string, end: string}} shift
   * @param {string} [excludeId]  The row being edited
   * @returns {Promise<Array>}
   */
  static async overlapping(shift, excludeId) {
    const all = await this.findAll();
    return all.filter(
      (other) =>
        String(other._id) !== String(excludeId) && shiftsOverlap(shift, other),
    );
  }

  /**
   * Delete every shift dated before a day — cron step 12.
   * @param {string} date  "YYYY-MM-DD"; rows with an earlier `date` go
   * @returns {Promise<number>} shifts deleted
   */
  static async pruneBefore(date) {
    const collection = await this.getCollection();
    const result = await collection.deleteMany({ date: { $lt: date } });
    return result.deletedCount;
  }
}

module.exports = OnCall;
