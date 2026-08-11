const { getDatabase, closeConnection } = require("../src/config/db");

// Set test environment variables
process.env.USE_TEST_DB = "true";
process.env.NODE_ENV = "test";

/* Every suite opens its own connection to the shared (often free-tier) Atlas
 * cluster, which intermittently rejects connects with retryable errors
 * (SystemOverloadedError) or is just slow. Without a retry, one slow connect
 * blows the hook timeout and fails the whole suite. */
const CONNECT_ATTEMPTS = 5;
const SETUP_TIMEOUT_MS = 90000;

async function getDatabaseWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      return await getDatabase();
    } catch (error) {
      lastError = error;
      // Reconnect from scratch; backoff grows 1s, 2s, 4s, 8s
      await closeConnection().catch(() => {});
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 2 ** (attempt - 1)),
      );
    }
  }
  throw lastError;
}

/**
 * Cleanup test database before all tests (only once at the start)
 */
beforeAll(async () => {
  const db = await getDatabaseWithRetry();

  const testCollections = [
    "Headers-Test",
    "Tasks-Test",
    "Events-Test",
    "LifeEvents-Test",
    "Affirmations-Test",
    "Goals-Test",
    "Projects-Test",
    "Calls-Test",
    "TaskArchive-Test",
    "Insights-Test",
    "InsightStats-Test",
  ];

  await Promise.all(
    testCollections.map((col) => db.collection(col).deleteMany({})),
  );

  console.log(
    `Test collections wiped clean (before tests start): ${testCollections.join(", ")}`,
  );
}, SETUP_TIMEOUT_MS);

/**
 * Close database connection after all tests. A failed close must not fail
 * the suite — the connection dies with the worker process anyway.
 */
afterAll(async () => {
  await closeConnection().catch(() => {});
});
