const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

class Goal {
  /**
   * Get the Goals collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Goals-Test" : "Goals";
    return db.collection(collectionName);
  }

  /**
   * Return all goals sorted by priority ascending.
   *
   * Goals predate the priority field, so any without one are backfilled here
   * in their previous (name-ascending) order before sorting — a one-time
   * migration that keeps existing lists looking unchanged on first read.
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    await this.backfillPriorities();
    return collection.find({}).sort({ priority: 1 }).toArray();
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
   * Find a goal by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new goal. Priority is assigned as the total existing goals
   * (appended at end), same scheme as headers and projects.
   * @param {Object} data  { name, steps }
   * @returns {Promise<Object>} Created goal
   */
  static async create(data) {
    const collection = await this.getCollection();
    await this.backfillPriorities();
    const count = await collection.countDocuments();
    const now = new Date().toISOString();

    const goal = {
      name: data.name,
      steps: data.steps,
      priority: count,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(goal);
    return { _id: result.insertedId, ...goal };
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
    const collection = await this.getCollection();
    if (data.priority !== undefined) await this.backfillPriorities();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.steps !== undefined) updates.steps = data.steps;

    if (data.priority !== undefined && data.priority !== current.priority) {
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const count = await collection.countDocuments();

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift goals in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 } },
        );
      } else {
        // Moving down: shift goals in (oldPriority, newPriority] up by -1
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
   * Delete a goal (and shift remaining goal priorities to stay contiguous).
   * Todo tasks created from its steps are untouched — caller decides.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted goal or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const goal = await this.findById(id);
    if (!goal) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift all goals with higher priority down by 1
    if (typeof goal.priority === "number") {
      await collection.updateMany(
        { priority: { $gt: goal.priority } },
        { $inc: { priority: -1 } },
      );
    }

    return goal;
  }
}

module.exports = Goal;
