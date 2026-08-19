const { ObjectId } = require("mongodb");

/**
 * The four one-line reads and writes every model repeated verbatim: look a
 * document up by its string id, list a collection in a fixed order, apply a
 * `$set`, remove a row.
 *
 * They all take the collection as their first argument rather than living on a
 * base class, so the cron and the services — which work with raw collection
 * handles, not models — can use exactly the same primitives.
 */

/**
 * Convert a string id to an ObjectId. Throws on a malformed id, which the
 * controllers turn into a 500 (the pre-existing contract for a bad id).
 * @param {string} id
 * @returns {ObjectId}
 */
function toObjectId(id) {
  return new ObjectId(id);
}

/**
 * Find one document by its string `_id`.
 * @param {Collection} collection
 * @param {string} id
 * @returns {Promise<Object|null>} null when it does not exist — models never throw for a miss
 */
function findById(collection, id) {
  return collection.findOne({ _id: toObjectId(id) });
}

/**
 * Every document in a collection, in a fixed sort order.
 * @param {Collection} collection
 * @param {Object} sort  Mongo sort spec, e.g. { priority: 1 }
 * @returns {Promise<Array>}
 */
function findAllSorted(collection, sort) {
  return collection.find({}).sort(sort).toArray();
}

/**
 * Apply a `$set` to one document and return the document as it is *after* the
 * write — the shape every `update()` responds with.
 * @param {Collection} collection
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
function updateById(collection, id, updates) {
  return collection.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/**
 * Remove one document by its string `_id`.
 * @param {Collection} collection
 * @param {string} id
 * @returns {Promise<Object>} Mongo delete result
 */
function deleteById(collection, id) {
  return collection.deleteOne({ _id: toObjectId(id) });
}

module.exports = {
  toObjectId,
  findById,
  findAllSorted,
  updateById,
  deleteById,
};
