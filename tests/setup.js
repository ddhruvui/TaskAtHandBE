const { getDatabase, closeConnection } = require("../src/config/db");

// Set test environment variables
process.env.USE_TEST_DB = "true";
process.env.NODE_ENV = "test";

/**
 * Cleanup test database before all tests (only once at the start)
 */
beforeAll(async () => {
  // Wait a bit for DB connection to be ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Clear all test collections
    const testCollections = [
      "Office-Test",
      "Habbit-Test",
      "Todo-Test",
      "Dream-Test",
      "WorkOnDream-Test",
      "Events-Test",
    ];

    await Promise.all(
      testCollections.map((col) => db.collection(col).deleteMany({})),
    );

    console.log(
      `Test collections wiped clean (before tests start): ${testCollections.join(", ")}`,
    );
  } catch (error) {
    console.error("Error cleaning test collections:", error);
  }
});

/**
 * Close database connection after all tests
 */
afterAll(async () => {
  await closeConnection();
});
