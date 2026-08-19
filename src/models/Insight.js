const BaseModel = require("./BaseModel");

/**
 * Stored AI insight reports.
 * Shape: { generatedAt, periodDays, stats, report }
 * where `report` is the structured output returned by the model.
 */
class Insight extends BaseModel {
  static collectionName = "Insights";

  /** Newest first — every read of this collection wants the latest report. */
  static sortBy = { generatedAt: -1 };

  /**
   * Store a freshly generated report.
   * @param {Object} doc
   * @returns {Promise<Object>}
   */
  static async save(doc) {
    return this.insert(doc);
  }

  /** Most recent report, or null */
  static async latest() {
    const collection = await this.getCollection();
    return collection.find({}).sort(this.sortBy).limit(1).next();
  }

  /** Recent reports, newest first */
  static async list(limit = 14) {
    const collection = await this.getCollection();
    return collection.find({}).sort(this.sortBy).limit(limit).toArray();
  }
}

module.exports = Insight;
