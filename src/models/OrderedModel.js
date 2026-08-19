const BaseModel = require("./BaseModel");
const {
  nextPriority,
  movePriority,
  closeGap,
} = require("../utils/priority");

/**
 * A collection the user can reorder: headers, goals, projects and life events.
 *
 * They all keep the same invariant — priorities are contiguous `0..n-1` over
 * the whole collection — and all four had the identical thirty lines of
 * shift-the-neighbours arithmetic pasted into `update()` with only the noun in
 * the comments changed. That arithmetic now lives once in `utils/priority`,
 * and this class is the two-method interface the models actually use.
 *
 * Tasks are ordered the same way but *scoped to a header*, so they use
 * `utils/priority` directly with a `{ headerId }` scope instead of extending
 * this class.
 */
class OrderedModel extends BaseModel {
  static sortBy = { priority: 1 };

  /**
   * The priority a new document appended to the end of the list gets.
   * @returns {Promise<number>}
   */
  static async nextPriority() {
    return nextPriority(await this.getCollection());
  }

  /**
   * Turn a requested priority into the one to store, sliding the documents in
   * between out of the way first.
   *
   * @param {string} id       The document being moved
   * @param {Object} current  The document as stored now
   * @param {number|undefined} requested
   * @returns {Promise<number|undefined>} undefined when nothing moved
   * @throws {Error} "Priority must be between 0 and n-1" when out of range
   */
  static async resolvePriorityChange(id, current, requested) {
    if (requested === undefined || requested === current.priority) {
      return undefined;
    }
    return movePriority(await this.getCollection(), {
      id,
      from: current.priority,
      to: requested,
    });
  }

  /**
   * Delete a document and close the hole it left, so the remaining priorities
   * stay contiguous. A document with no numeric priority (a legacy goal saved
   * before the field existed) is removed without shifting anything.
   * @param {string} id
   * @returns {Promise<Object|null>} the deleted document, or null
   */
  static async delete(id) {
    const doc = await super.delete(id);
    if (doc && typeof doc.priority === "number") {
      await closeGap(await this.getCollection(), doc.priority);
    }
    return doc;
  }
}

module.exports = OrderedModel;
