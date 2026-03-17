/**
 * Example: How to use the database with prod/test switching
 *
 * The USE_TEST_DB environment variable controls which database to use:
 * - USE_TEST_DB=false → Uses production databases (e.g., 'Office')
 * - USE_TEST_DB=true → Uses test databases (e.g., 'Office-Test')
 */

const { getDatabase } = require("../src/config/db");

async function exampleUsage() {
  try {
    // Get database instance - automatically switches based on USE_TEST_DB
    const officeDB = await getDatabase("Office");

    // Access collections
    const tasksCollection = officeDB.collection("tasks");
    const usersCollection = officeDB.collection("users");

    // Perform database operations
    const tasks = await tasksCollection.find({}).toArray();
    console.log("Tasks:", tasks);

    // Insert a document
    const result = await tasksCollection.insertOne({
      title: "Example Task",
      completed: false,
      createdAt: new Date(),
    });
    console.log("Inserted task:", result.insertedId);

    // You can work with multiple databases
    const analyticsDB = await getDatabase("Analytics");
    const logsCollection = analyticsDB.collection("logs");
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
