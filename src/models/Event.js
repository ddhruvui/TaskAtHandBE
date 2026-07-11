const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

class Event {
  /**
   * Get the Events collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Events-Test" : "Events";
    return db.collection(collectionName);
  }

  /**
   * Return all events sorted by name ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ name: 1 }).toArray();
  }

  /**
   * Find an event by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new event template.
   * @param {Object} data  { name, tasks }
   * @returns {Promise<Object>} Created event
   */
  static async create(data) {
    const collection = await this.getCollection();
    const now = new Date().toISOString();

    const event = {
      name: data.name,
      tasks: data.tasks,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(event);
    return { _id: result.insertedId, ...event };
  }

  /**
   * Update an event's name and/or task list.
   * @param {string} id
   * @param {Object} data  { name?, tasks? }
   * @returns {Promise<Object|null>} Updated event or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.tasks !== undefined) updates.tasks = data.tasks;

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
   * Delete an event.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted event or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const event = await this.findById(id);
    if (!event) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });
    return event;
  }
}

module.exports = Event;
