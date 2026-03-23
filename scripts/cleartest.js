const { getDatabase, closeConnection } = require("../src/config/db");

process.env.USE_TEST_DB = "true";
process.env.NODE_ENV = "test";

const testCollections = [
  "Office-Test",
  "Habbit-Test",
  "Todo-Test",
  "Dream-Test",
  "WorkOnDream-Test",
  "Events-Test",
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
