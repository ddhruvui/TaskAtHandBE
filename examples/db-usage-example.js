/**
 * Example: How to use the database with prod/test switching
 *
 * The USE_TEST_DB environment variable controls which collections to use:
 * - USE_TEST_DB=false → Uses production collections ('Headers', 'Tasks')
 * - USE_TEST_DB=true  → Uses test collections ('Headers-Test', 'Tasks-Test')
 */

const { getDatabase } = require("../src/config/db");

async function exampleUsage() {
  try {
    const db = await getDatabase();

    // Collection names are controlled by USE_TEST_DB
    const useTestDB = process.env.USE_TEST_DB === "true";
    const headersCollection = db.collection(
      useTestDB ? "Headers-Test" : "Headers",
    );
    const tasksCollection = db.collection(useTestDB ? "Tasks-Test" : "Tasks");

    // Fetch all headers sorted by priority
    const headers = await headersCollection
      .find({})
      .sort({ priority: 1 })
      .toArray();
    console.log("Headers:", headers);

    // Fetch all tasks for the first header
    if (headers.length > 0) {
      const headerId = headers[0]._id.toString();
      const tasks = await tasksCollection
        .find({ headerId })
        .sort({ priority: 1 })
        .toArray();
      console.log(`Tasks for header "${headers[0].name}":`, tasks);
    }
  } catch (error) {
    console.error("Database operation failed:", error);
  }
}

// To switch between prod and test:
// 1. Edit .env file and change USE_TEST_DB value
// 2. Or set it when running: USE_TEST_DB=true node examples/db-usage-example.js

// Uncomment to run:
// exampleUsage();

module.exports = { exampleUsage };
