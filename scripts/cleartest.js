const { getDatabase, closeConnection } = require("../src/config/db");

process.env.USE_TEST_DB = "true";
process.env.NODE_ENV = "test";

const testCollections = [
  "Headers-Test",
  "Tasks-Test",
  "Events-Test",
  "LifeEvents-Test",
  "Affirmations-Test",
  "Goals-Test",
  "Projects-Test",
  "Calls-Test",
  "Vacations-Test",
  "TaskArchive-Test",
  "Insights-Test",
  "InsightStats-Test",
  "ArchiveSummary-Test",
];

(async () => {
  try {
    const db = await getDatabase();

    await Promise.all(
      testCollections.map((col) => db.collection(col).deleteMany({})),
    );

    console.log("Cleared test collections:", testCollections.join(", "));
  } catch (error) {
    console.error("Error clearing test collections:", error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
})();
