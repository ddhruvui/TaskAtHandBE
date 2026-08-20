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

  /**
   * The most reports `GET /insights/history` will ever return.
   *
   * This doubles as the retention floor: a report older than the newest
   * `MAX_HISTORY` is unreachable through the API, and trimming below this
   * would make the endpoint's own ceiling unservable. One constant, both
   * jobs — the cap used to be a literal in the controller.
   */
  static MAX_HISTORY = 100;

  /** Recent reports, newest first */
  static async list(limit = 14) {
    const collection = await this.getCollection();
    return collection.find({}).sort(this.sortBy).limit(limit).toArray();
  }

  /**
   * Delete everything but the newest `keep` reports.
   *
   * Reports are narrative, not data: the numbers they are built from live in
   * `TaskArchive` and permanently in `ArchiveSummary`, so an aged-out report
   * loses a piece of writing, not a fact. That is why these are pruned
   * outright rather than rolled up the way archive events are.
   *
   * @param {number} keep
   * @returns {Promise<number>} reports deleted
   */
  static async pruneToNewest(keep) {
    const collection = await this.getCollection();
    // Only the overflow is read — one document a day once the window is full.
    const doomed = await collection
      .find({}, { projection: { _id: 1 } })
      .sort(this.sortBy)
      .skip(keep)
      .toArray();
    if (doomed.length === 0) return 0;

    const result = await collection.deleteMany({
      _id: { $in: doomed.map((report) => report._id) },
    });
    return result.deletedCount;
  }
}

module.exports = Insight;
