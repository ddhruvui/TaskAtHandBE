const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

class Call {
  /**
   * Get the Calls collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Calls-Test" : "Calls";
    return db.collection(collectionName);
  }

  /**
   * Return all calls sorted by createdAt ascending (order added)
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ createdAt: 1 }).toArray();
  }

  /**
   * Find a call by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new call.
   * @param {Object} data  { name, frequency }
   * @returns {Promise<Object>} Created call
   */
  static async create(data) {
    const collection = await this.getCollection();
    const now = new Date().toISOString();

    const call = {
      name: data.name,
      frequency: data.frequency,
      done: false,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(call);
    return { _id: result.insertedId, ...call };
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
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.frequency !== undefined) updates.frequency = data.frequency;
    if (data.done !== undefined) {
      updates.done = data.done;
      if (data.done === true) {
        updates.doneAt = new Date().toISOString();
      } else {
        updates.doneAt = null;
      }
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
   * Delete a call.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted call or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const call = await this.findById(id);
    if (!call) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });
    return call;
  }
}

module.exports = Call;
