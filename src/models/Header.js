const OrderedModel = require("./OrderedModel");

/** Escape a string for safe use inside a RegExp (header names are free text). */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A section of the todo list. Headers are the one ordered collection with no
 * timestamps — `saveUpdates(..., { stamp: false })` below is what keeps it
 * that way.
 *
 * Priority contiguity, the move arithmetic and the delete gap-close are all
 * inherited from `OrderedModel`.
 */
class Header extends OrderedModel {
  static collectionName = "Headers";

  /**
   * Find the header belonging to a long-term project, if one exists.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  static async findByProject(projectId) {
    const collection = await this.getCollection();
    return collection.findOne({ projectId });
  }

  /**
   * Create a new header. Priority is assigned as total existing headers
   * (appended at end); a caller that passes `projectId` should follow up with
   * `applyProjectHeaderOrder()` to move it into the project block.
   *
   * Creating with a `projectId` that already has a header is idempotent — the
   * existing header is returned instead of a duplicate, so two clients racing
   * to mirror the same project task cannot end up with two headers.
   *
   * @param {Object} data  { name, projectId? }
   * @returns {Promise<{header: Object, created: boolean}>}
   */
  static async create(data) {
    const collection = await this.getCollection();
    const projectId = data.projectId || null;

    if (projectId) {
      const existing = await this.findByProject(projectId);
      if (existing) return { header: existing, created: false };

      // Adopt a pre-`projectId` header that matches the project by name (the
      // old identity rule) instead of creating a duplicate alongside it.
      const legacy = await collection.findOne({
        projectId: null,
        name: { $regex: `^${escapeRegex(data.name)}$`, $options: "i" },
      });
      if (legacy) {
        await collection.updateOne({ _id: legacy._id }, { $set: { projectId } });
        return { header: { ...legacy, projectId }, created: false };
      }
    }

    const header = await this.insert({
      name: data.name,
      priority: await this.nextPriority(),
      projectId,
    });
    return { header, created: true };
  }

  /**
   * Update a header's name and/or priority.
   * When priority changes all affected headers are shifted to keep contiguous order.
   * @param {string} id
   * @param {Object} data  { name?, priority? }
   * @returns {Promise<Object|null>} Updated header or null if not found
   */
  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;

    const priority = await this.resolvePriorityChange(id, current, data.priority);
    if (priority !== undefined) updates.priority = priority;

    // Headers carry no createdAt/updatedAt — nothing to stamp.
    return this.saveUpdates(id, updates, current, { stamp: false });
  }
}

module.exports = Header;
