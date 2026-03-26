const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

class Header {
  /**
   * Get the Headers collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Headers-Test" : "Headers";
    return db.collection(collectionName);
  }

  /**
   * Return all headers sorted by priority ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a header by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new header. Priority is assigned as total existing headers (appended at end).
   * @param {Object} data  { name }
   * @returns {Promise<Object>} Created header
   */
  static async create(data) {
    const collection = await this.getCollection();
    const count = await collection.countDocuments();

    const header = {
      name: data.name,
      priority: count,
    };

    const result = await collection.insertOne(header);
    return { _id: result.insertedId, ...header };
  }

  /**
   * Update a header's name and/or priority.
   * When priority changes all affected headers are shifted to keep contiguous order.
   * @param {string} id
   * @param {Object} data  { name?, priority? }
   * @returns {Promise<Object|null>} Updated header or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};

    if (data.name !== undefined) {
      updates.name = data.name;
    }

    if (data.priority !== undefined && data.priority !== current.priority) {
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const count = await collection.countDocuments();

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift headers in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 } },
        );
      } else {
        // Moving down: shift headers in (oldPriority, newPriority] up by -1
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

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );
    return result;
  }

  /**
   * Delete a header (and shift remaining header priorities).
   * Does NOT delete tasks — caller is responsible for cascading task deletion.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted header or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const header = await this.findById(id);
    if (!header) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift all headers with higher priority down by 1
    await collection.updateMany(
      { priority: { $gt: header.priority } },
      { $inc: { priority: -1 } },
    );

    return header;
  }
}

module.exports = Header;
