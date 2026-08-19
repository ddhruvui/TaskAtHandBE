const OrderedModel = require("./OrderedModel");

/**
 * A long-term goal and the habits ("steps") that get the user there, one at a
 * time. Ordered like headers and projects, with one wrinkle: goals predate the
 * priority field, so `backfillPriorities()` gives legacy rows one before any
 * ordering decision is made.
 */
class Goal extends OrderedModel {
  static collectionName = "Goals";

  /**
   * Return all goals sorted by priority ascending.
   *
   * Goals predate the priority field, so any without one are backfilled here
   * in their previous (name-ascending) order before sorting — a one-time
   * migration that keeps existing lists looking unchanged on first read.
   * @returns {Promise<Array>}
   */
  static async findAll() {
    await this.backfillPriorities();
    return super.findAll();
  }

  /**
   * Give every goal a contiguous 0..n-1 priority. Goals that already have one
   * keep their relative order; legacy goals are appended in name order. No-ops
   * once every goal has a numeric priority (the common case).
   * @returns {Promise<void>}
   */
  static async backfillPriorities() {
    const collection = await this.getCollection();
    const missing = await collection.countDocuments({
      priority: { $not: { $type: "number" } },
    });
    if (missing === 0) return;

    const all = await collection
      .find({})
      .sort({ priority: 1, name: 1 })
      .toArray();
    await Promise.all(
      all.map((goal, index) =>
        goal.priority === index
          ? null
          : collection.updateOne(
              { _id: goal._id },
              { $set: { priority: index } },
            ),
      ),
    );
  }

  /**
   * Create a new goal. Priority is assigned as the total existing goals
   * (appended at end), same scheme as headers and projects.
   * @param {Object} data  { name, steps }
   * @returns {Promise<Object>} Created goal
   */
  static async create(data) {
    await this.backfillPriorities();
    return this.insert({
      name: data.name,
      steps: data.steps,
      priority: await this.nextPriority(),
      ...this.timestamps(),
    });
  }

  /**
   * Update a goal's name, step list and/or priority.
   * Steps are replaced wholesale (add/rename/reorder/remove/status changes).
   * When priority changes all affected goals are shifted to keep contiguous
   * order, same as headers and projects.
   * @param {string} id
   * @param {Object} data  { name?, steps?, priority? }
   * @returns {Promise<Object|null>} Updated goal or null if not found
   */
  static async update(id, data) {
    // A move is only meaningful once every goal has a priority to move past.
    if (data.priority !== undefined) await this.backfillPriorities();

    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.steps !== undefined) updates.steps = data.steps;

    const priority = await this.resolvePriorityChange(id, current, data.priority);
    if (priority !== undefined) updates.priority = priority;

    return this.saveUpdates(id, updates, current);
  }
}

module.exports = Goal;
