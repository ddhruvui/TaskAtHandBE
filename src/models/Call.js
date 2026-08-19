const BaseModel = require("./BaseModel");

/**
 * A person the user has committed to phoning on a cadence. `done` is the
 * "called this period" checkmark, which cron step 8 clears at each period
 * boundary (the 15th for biweekly, month end for everyone).
 */
class Call extends BaseModel {
  static collectionName = "Calls";

  /** Order added — calls have no priority of their own. */
  static sortBy = { createdAt: 1 };

  /**
   * Create a new call.
   * @param {Object} data  { name, frequency }
   * @returns {Promise<Object>} Created call
   */
  static async create(data) {
    return this.insert({
      name: data.name,
      frequency: data.frequency,
      done: false,
      doneAt: null,
      ...this.timestamps(),
    });
  }

  /**
   * Update a call's name, frequency, and/or done state.
   * When done flips to true, doneAt is set to now (ISO); when done is set to
   * false, doneAt is cleared (mirrors Task doneAt semantics).
   * @param {string} id
   * @param {Object} data  { name?, frequency?, done? }
   * @returns {Promise<Object|null>} Updated call or null if not found
   */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.frequency !== undefined) updates.frequency = data.frequency;
    if (data.done !== undefined) {
      updates.done = data.done;
      updates.doneAt = data.done === true ? this.stamp() : null;
    }

    return this.saveUpdates(id, updates, current);
  }
}

module.exports = Call;
