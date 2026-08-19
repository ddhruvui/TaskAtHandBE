const BaseModel = require("./BaseModel");

/**
 * A reusable checklist ("Trip packing") the user can stamp into the todo.
 * `tasks` is a plain list of task names; the todo tasks created from it are
 * independent copies, which is why deleting an event never touches them.
 */
class Event extends BaseModel {
  static collectionName = "Events";
  static sortBy = { name: 1 };

  /**
   * Create a new event template.
   * @param {Object} data  { name, tasks }
   * @returns {Promise<Object>} Created event
   */
  static async create(data) {
    return this.insert({
      name: data.name,
      tasks: data.tasks,
      ...this.timestamps(),
    });
  }

  /**
   * Update an event's name and/or task list.
   * @param {string} id
   * @param {Object} data  { name?, tasks? }
   * @returns {Promise<Object|null>} Updated event or null if not found
   */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.tasks !== undefined) updates.tasks = data.tasks;

    return this.saveUpdates(id, updates, current);
  }
}

module.exports = Event;
