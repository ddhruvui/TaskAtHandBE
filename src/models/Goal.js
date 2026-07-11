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
   * Return all goals sorted by name ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ name: 1 }).toArray();
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
   * Create a new goal.
   * @param {Object} data  { name, steps }
   * @returns {Promise<Object>} Created goal
   */
  static async create(data) {
    const collection = await this.getCollection();
    const now = new Date().toISOString();

    const goal = {
      name: data.name,
      steps: data.steps,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(goal);
    return { _id: result.insertedId, ...goal };
  }

  /**
   * Update a goal's name and/or step list.
   * @param {string} id
   * @param {Object} data  { name?, steps? }
   * @returns {Promise<Object|null>} Updated goal or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.steps !== undefined) updates.steps = data.steps;

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
   * Delete a goal.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted goal or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const goal = await this.findById(id);
    if (!goal) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });
    return goal;
  }
}

module.exports = Goal;
