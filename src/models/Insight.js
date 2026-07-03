const { getDatabase } = require("../config/db");

/**
 * Stored AI insight reports.
 * Shape: { generatedAt, periodDays, stats, report }
 * where `report` is the structured output returned by the model.
 */
class Insight {
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Insights-Test" : "Insights";
    return db.collection(collectionName);
  }

  static async save(doc) {
    const collection = await this.getCollection();
    const result = await collection.insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  /** Most recent report, or null */
  static async latest() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ generatedAt: -1 }).limit(1).next();
  }

  /** Recent reports, newest first */
  static async list(limit = 14) {
    const collection = await this.getCollection();
    return collection
      .find({})
      .sort({ generatedAt: -1 })
      .limit(limit)
      .toArray();
  }
}

module.exports = Insight;
