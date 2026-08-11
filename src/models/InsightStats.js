const { getDatabase } = require("../config/db");

/**
 * The nightly snapshot of exact archive stats — habit streaks and completion
 * rates, on-time vs late tasks, reschedules, per-header rollups, calls.
 *
 * This is the AI-free half of insights: the cron refreshes it every night so
 * streaks stay current, while the coaching narrative in `Insights` is only
 * written once a week. A single document is kept (`key: "latest"`) and
 * overwritten in place — history lives in `TaskArchive`, which the snapshot is
 * derived from and can always be recomputed against.
 *
 * Shape: { key: "latest", computedAt, periodDays, eventCount, stats }
 */
class InsightStats {
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "InsightStats-Test" : "InsightStats";
    return db.collection(collectionName);
  }

  /** Overwrite the snapshot and return it */
  static async save({ computedAt, periodDays, eventCount, stats }) {
    const collection = await this.getCollection();
    const doc = { key: "latest", computedAt, periodDays, eventCount, stats };
    await collection.replaceOne({ key: "latest" }, doc, { upsert: true });
    return doc;
  }

  /** The stored snapshot, or null if the cron has never refreshed it */
  static async latest() {
    const collection = await this.getCollection();
    return collection.findOne({ key: "latest" });
  }
}

module.exports = InsightStats;
