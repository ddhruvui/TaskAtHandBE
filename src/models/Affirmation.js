const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

class Affirmation {
  /**
   * Get the Affirmations collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Affirmations-Test" : "Affirmations";
    return db.collection(collectionName);
  }

  /**
   * Return all affirmations sorted by createdAt ascending (order added)
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ createdAt: 1 }).toArray();
  }

  /**
   * Find an affirmation by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new affirmation.
   * @param {Object} data  { name }
   * @returns {Promise<Object>} Created affirmation
   */
  static async create(data) {
    const collection = await this.getCollection();
    const now = new Date().toISOString();

    const affirmation = {
      name: data.name,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(affirmation);
    return { _id: result.insertedId, ...affirmation };
  }

  /**
   * Update an affirmation's name.
   * @param {string} id
   * @param {Object} data  { name }
   * @returns {Promise<Object|null>} Updated affirmation or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;

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
   * Delete an affirmation.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted affirmation or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const affirmation = await this.findById(id);
    if (!affirmation) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });
    return affirmation;
  }
}

module.exports = Affirmation;
