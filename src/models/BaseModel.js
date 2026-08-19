const { getCollection } = require("../utils/collections");
const {
  findAllSorted,
  findById,
  updateById,
  deleteById,
} = require("../utils/documents");

/**
 * What every model in this app was writing out for itself: resolve its
 * collection (with the `-Test` switch), read a row by id, list the collection
 * in its natural order, apply a `$set`, delete a row, stamp `updatedAt`.
 *
 * A model supplies two things and inherits the rest:
 *
 *     class Affirmation extends BaseModel {
 *       static collectionName = "Affirmations";
 *       static sortBy = { createdAt: 1 };
 *     }
 *
 * Everything domain-specific — priority contiguity, archive logging, the
 * project/header link, ECD validation — stays in the model that owns it.
 * `BaseModel` is deliberately only the plumbing.
 *
 * Timestamps: most collections store `createdAt`/`updatedAt` as ISO strings,
 * while Tasks store Date objects and Headers have no timestamps at all. That
 * is a stored-data difference, not a preference, so `stamp()` is overridable
 * and `saveUpdates()` can skip stamping entirely.
 */
class BaseModel {
  /** Logical collection name, e.g. "Tasks". Every subclass sets this. */
  static collectionName = null;

  /** Sort applied by `findAll()`. */
  static sortBy = { _id: 1 };

  /**
   * The collection for the current environment.
   * @returns {Promise<Collection>}
   */
  static getCollection() {
    return getCollection(this.collectionName);
  }

  /**
   * Every document, in `sortBy` order.
   * @returns {Promise<Array>}
   */
  static async findAll() {
    return findAllSorted(await this.getCollection(), this.sortBy);
  }

  /**
   * One document by its string `_id`.
   * @param {string} id
   * @returns {Promise<Object|null>} null when it does not exist
   */
  static async findById(id) {
    return findById(await this.getCollection(), id);
  }

  /**
   * Insert a document and return it with the id Mongo assigned.
   * @param {Object} doc
   * @returns {Promise<Object>}
   */
  static async insert(doc) {
    const collection = await this.getCollection();
    const result = await collection.insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  /**
   * Apply a `$set` and return the document as it is after the write.
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object|null>}
   */
  static async applyUpdate(id, updates) {
    return updateById(await this.getCollection(), id, updates);
  }

  /**
   * Remove one document. Callers that keep a list contiguous are responsible
   * for closing the gap (see `utils/priority`).
   * @param {string} id
   */
  static async removeById(id) {
    return deleteById(await this.getCollection(), id);
  }

  /**
   * Delete a document and return the version that was removed — the shape
   * every `delete()` responds with. Returns null when it never existed, which
   * is how the controllers answer 404 without the model throwing.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async delete(id) {
    const doc = await this.findById(id);
    if (!doc) return null;
    await this.removeById(id);
    return doc;
  }

  /** The value written to `createdAt`/`updatedAt`. ISO string by default. */
  static stamp() {
    return new Date().toISOString();
  }

  /** `{ createdAt, updatedAt }` for a document being created. */
  static timestamps() {
    const now = this.stamp();
    return { createdAt: now, updatedAt: now };
  }

  /**
   * Finish an `update()`: a request that changed nothing returns the document
   * untouched (and does *not* bump `updatedAt`), anything else is written with
   * a fresh stamp.
   * @param {string} id
   * @param {Object} updates
   * @param {Object} current  The document as it was read at the start
   * @param {Object} [options]
   * @param {boolean} [options.stamp=true]  False for collections without timestamps
   * @returns {Promise<Object|null>}
   */
  static async saveUpdates(id, updates, current, { stamp = true } = {}) {
    if (Object.keys(updates).length === 0) return current;
    if (stamp) updates.updatedAt = this.stamp();
    return this.applyUpdate(id, updates);
  }
}

module.exports = BaseModel;
