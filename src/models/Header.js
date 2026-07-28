const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

/** Escape a string for safe use inside a RegExp (header names are free text). */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class Header {
  /**
   * Get the Headers collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Headers-Test" : "Headers";
    return db.collection(collectionName);
  }

  /**
   * Return all headers sorted by priority ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a header by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

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

    const count = await collection.countDocuments();

    const header = {
      name: data.name,
      priority: count,
      projectId,
    };

    const result = await collection.insertOne(header);
    return { header: { _id: result.insertedId, ...header }, created: true };
  }

  /**
   * Update a header's name and/or priority.
   * When priority changes all affected headers are shifted to keep contiguous order.
   * @param {string} id
   * @param {Object} data  { name?, priority? }
   * @returns {Promise<Object|null>} Updated header or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};

    if (data.name !== undefined) {
      updates.name = data.name;
    }

    if (data.priority !== undefined && data.priority !== current.priority) {
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const count = await collection.countDocuments();

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift headers in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 } },
        );
      } else {
        // Moving down: shift headers in (oldPriority, newPriority] up by -1
        await collection.updateMany(
          {
            priority: { $gt: oldPriority, $lte: newPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: -1 } },
        );
      }

      updates.priority = newPriority;
    }

    if (Object.keys(updates).length === 0) return current;

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );
    return result;
  }

  /**
   * Delete a header (and shift remaining header priorities).
   * Does NOT delete tasks — caller is responsible for cascading task deletion.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted header or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const header = await this.findById(id);
    if (!header) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift all headers with higher priority down by 1
    await collection.updateMany(
      { priority: { $gt: header.priority } },
      { $inc: { priority: -1 } },
    );

    return header;
  }
}

module.exports = Header;
