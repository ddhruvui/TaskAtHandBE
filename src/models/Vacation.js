const BaseModel = require("./BaseModel");
const { activeVacation, vacationLength } = require("../utils/vacation");

/**
 * A period the user was (or will be) away, stored as two inclusive
 * "YYYY-MM-DD" UTC days — the day it starts and the day it ends both count as
 * vacation, which is what the user asked for and what every rule in
 * `utils/vacation` assumes.
 *
 * Both ends are mandatory. An open-ended "away since Tuesday" was considered
 * and dropped: with a required end date a trip can be booked months ahead,
 * which is the case that actually needs planning, and coming home early is an
 * edit rather than a different state to carry everywhere.
 *
 * **These documents are never pruned.** They are a few dozen bytes each and
 * they are the only reason the past stays re-derivable: `TaskArchive` events
 * carry no vacation flag, so a range deleted here silently turns a forgiven
 * fortnight back into two weeks of missed habits.
 *
 * Shape: { startDate, endDate, note, createdAt, updatedAt }
 */
class Vacation extends BaseModel {
  static collectionName = "Vacations";

  /** Chronological — the order the panel lists them in. */
  static sortBy = { startDate: 1 };

  /**
   * Create a vacation.
   * @param {Object} data  { startDate, endDate, note }
   * @returns {Promise<Object>} Created vacation
   */
  static async create(data) {
    return this.insert({
      startDate: data.startDate,
      endDate: data.endDate,
      note: data.note || "",
      ...this.timestamps(),
    });
  }

  /**
   * Update a vacation's dates or note.
   * @param {string} id
   * @param {Object} data  { startDate, endDate, note }
   * @returns {Promise<Object|null>} Updated vacation or null if not found
   */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.note !== undefined) updates.note = data.note;

    return this.saveUpdates(id, updates, current);
  }

  /**
   * Every stored range, chronological — what the stats and the fold both read.
   * @returns {Promise<Array>}
   */
  static async ranges() {
    return this.findAll();
  }

  /**
   * The vacation covering a given day, or null.
   * @param {string} day  "YYYY-MM-DD"
   * @returns {Promise<Object|null>}
   */
  static async activeOn(day) {
    return activeVacation(await this.findAll(), day);
  }

  /**
   * Ranges that would overlap [startDate, endDate], ignoring one id.
   *
   * Overlaps are rejected rather than merged: `vacationDaysBetween` sums each
   * range's overlap with a span independently, so two ranges covering the same
   * day would count that day twice and over-forgive slippage.
   *
   * @param {string} startDate
   * @param {string} endDate
   * @param {string} [excludeId]  The row being edited
   * @returns {Promise<Array>}
   */
  static async overlapping(startDate, endDate, excludeId) {
    const all = await this.findAll();
    return all.filter(
      (v) =>
        String(v._id) !== String(excludeId) &&
        v.startDate <= endDate &&
        v.endDate >= startDate,
    );
  }

  /** Whole days a vacation covers, both ends inclusive. */
  static lengthOf(vacation) {
    return vacationLength(vacation);
  }
}

module.exports = Vacation;
