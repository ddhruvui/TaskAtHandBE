const { getDatabase } = require("../config/db");

/**
 * Every collection in this app has a `-Test` twin that `USE_TEST_DB=true`
 * switches the whole process onto (see `tests/setup.js`). That switch used to
 * be copy-pasted into all eleven models and the cron, which meant adding a
 * collection was three edits in three files and forgetting one silently wrote
 * test data into the real collection.
 *
 * The env var is read on every call, never cached at require time — the test
 * setup sets it after the models are already loaded.
 */

/**
 * The physical collection name for a logical one, in the current environment.
 * @param {string} name  Logical name, e.g. "Tasks"
 * @returns {string} "Tasks" or "Tasks-Test"
 */
function collectionName(name) {
  return process.env.USE_TEST_DB === "true" ? `${name}-Test` : name;
}

/**
 * The live handle for a logical collection name.
 * @param {string} name  Logical name, e.g. "Tasks"
 * @returns {Promise<Collection>}
 */
async function getCollection(name) {
  const db = await getDatabase();
  return db.collection(collectionName(name));
}

/**
 * Handles for several logical collections in one round trip — the cron needs
 * three of them per run and would otherwise await the same database three
 * times.
 * @param {...string} names
 * @returns {Promise<Collection[]>} in the order the names were given
 */
async function getCollections(...names) {
  const db = await getDatabase();
  return names.map((name) => db.collection(collectionName(name)));
}

module.exports = { collectionName, getCollection, getCollections };
