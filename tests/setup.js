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

    // Clear the Office-Test collection
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});

    console.log(
      `Test collection '${collectionName}' wiped clean (before tests start)`,
    );
  } catch (error) {
    console.error("Error cleaning test collection:", error);
  }
});

/**
 * Close database connection after all tests
 */
afterAll(async () => {
  await closeConnection();
});
