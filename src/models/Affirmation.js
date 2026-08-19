const BaseModel = require("./BaseModel");

/**
 * A single short line the user reads daily. No priority, no links — the
 * simplest collection in the app, and the clearest illustration of what
 * `BaseModel` leaves a model to write: its name, its order, and its fields.
 */
class Affirmation extends BaseModel {
  static collectionName = "Affirmations";

  /** Order added — affirmations have no priority of their own. */
  static sortBy = { createdAt: 1 };

  /**
   * Create a new affirmation.
   * @param {Object} data  { name }
   * @returns {Promise<Object>} Created affirmation
   */
  static async create(data) {
    return this.insert({ name: data.name, ...this.timestamps() });
  }

  /**
   * Update an affirmation's name.
   * @param {string} id
   * @param {Object} data  { name }
   * @returns {Promise<Object|null>} Updated affirmation or null if not found
   */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;

    return this.saveUpdates(id, updates, current);
  }
}

module.exports = Affirmation;
