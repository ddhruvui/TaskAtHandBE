const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

const VALID_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Validate an ECD object.
 * Returns null if ecd is null/undefined (optional field).
 * Throws on invalid structure.
 */
function validateEcd(ecd) {
  if (ecd === null || ecd === undefined) return null;

  if (typeof ecd !== "object" || Array.isArray(ecd)) {
    throw new Error("ecd must be an object with 'type' and 'value'");
  }

  const { type, value } = ecd;
  const validTypes = ["date", "day_of_week", "day_of_month", "day_of_year"];

  if (!validTypes.includes(type)) {
    throw new Error(`ecd.type must be one of: ${validTypes.join(", ")}`);
  }

  switch (type) {
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(
          'ecd.value for type "date" must be a YYYY-MM-DD string',
        );
      }
      break;
    }
    case "day_of_week": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          'ecd.value for type "day_of_week" must be a non-empty array',
        );
      }
      const invalid = value.filter((d) => !VALID_DOW.includes(d));
      if (invalid.length > 0) {
        throw new Error(
          `ecd.value contains invalid day(s): ${invalid.join(", ")}. Allowed: ${VALID_DOW.join(", ")}`,
        );
      }
      break;
    }
    case "day_of_month": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          'ecd.value for type "day_of_month" must be a non-empty array',
        );
      }
      const invalid = value.filter(
        (d) => !Number.isInteger(d) || d < 1 || d > 31,
      );
      if (invalid.length > 0) {
        throw new Error(
          'ecd.value for type "day_of_month" must contain integers between 1 and 31',
        );
      }
      break;
    }
    case "day_of_year": {
      if (
        typeof value !== "string" ||
        !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
      ) {
        throw new Error(
          'ecd.value for type "day_of_year" must be a D/M/YYYY string',
        );
      }
      break;
    }
  }

  return ecd;
}

class Task {
  /**
   * Get the Tasks collection for the current environment
   * @returns {Promise<Collection>}
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Tasks-Test" : "Tasks";
    return db.collection(collectionName);
  }

  /**
   * Return all tasks for a header, sorted by priority ascending
   * @param {string} headerId
   * @returns {Promise<Array>}
   */
  static async findByHeader(headerId) {
    const collection = await this.getCollection();
    return collection.find({ headerId }).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a task by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new task. Priority is assigned just before the first done task in the header.
   * All existing done tasks in the header are shifted down by 1.
   * @param {Object} data  { name, notes?, headerId, ecd? }
   * @returns {Promise<Object>} Created task
   */
  static async create(data) {
    const collection = await this.getCollection();

    const ecd = validateEcd(data.ecd);

    // Count undone tasks in this header to find insertion point
    const undoneCount = await collection.countDocuments({
      headerId: data.headerId,
      done: false,
    });

    // Shift all done tasks in this header down by 1
    await collection.updateMany(
      { headerId: data.headerId, done: true },
      { $inc: { priority: 1 }, $set: { updatedAt: new Date() } },
    );

    const now = new Date();
    const task = {
      name: data.name,
      notes: data.notes || "",
      headerId: data.headerId,
      priority: undoneCount,
      ecd: ecd || null,
      done: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(task);
    return { _id: result.insertedId, ...task };
  }

  /**
   * Update a task. Handles:
   *   - Field edits (name, notes, ecd)
   *   - done toggle (priority reorder within header)
   *   - Manual priority change (shift affected tasks in same header)
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object|null>} Updated task or null
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = { updatedAt: new Date() };

    // Field updates
    if (data.name !== undefined) updates.name = data.name;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.ecd !== undefined) {
      updates.ecd = validateEcd(data.ecd);
    }

    // Handle done toggle
    if (data.done !== undefined && data.done !== current.done) {
      if (data.done === true) {
        // Marking done: move to last position in header
        const totalInHeader = await collection.countDocuments({
          headerId: current.headerId,
        });
        const oldPriority = current.priority;
        const newPriority = totalInHeader - 1;

        // Shift all tasks in header with priority in (oldPriority, newPriority] up by -1
        await collection.updateMany(
          {
            headerId: current.headerId,
            priority: { $gt: oldPriority, $lte: newPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: -1 }, $set: { updatedAt: new Date() } },
        );

        updates.priority = newPriority;
        updates.done = true;
      } else {
        // Marking not done: move to just before first done task in header
        const undoneCount = await collection.countDocuments({
          headerId: current.headerId,
          done: false,
        });
        const insertPos = undoneCount; // first done task sits here
        const oldPriority = current.priority;

        // Shift tasks in header with priority in [insertPos, oldPriority) down by 1
        if (insertPos < oldPriority) {
          await collection.updateMany(
            {
              headerId: current.headerId,
              priority: { $gte: insertPos, $lt: oldPriority },
              _id: { $ne: new ObjectId(id) },
            },
            { $inc: { priority: 1 }, $set: { updatedAt: new Date() } },
          );
        }

        updates.priority = insertPos;
        updates.done = false;
      }
    } else if (
      data.priority !== undefined &&
      data.priority !== current.priority
    ) {
      // Manual priority reorder (no done toggle)
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const totalInHeader = await collection.countDocuments({
        headerId: current.headerId,
      });

      if (newPriority < 0 || newPriority >= totalInHeader) {
        throw new Error(`Priority must be between 0 and ${totalInHeader - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift tasks in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            headerId: current.headerId,
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 }, $set: { updatedAt: new Date() } },
        );
      } else {
        // Moving down: shift tasks in (oldPriority, newPriority] up by -1
        await collection.updateMany(
          {
            headerId: current.headerId,
            priority: { $gt: oldPriority, $lte: newPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: -1 }, $set: { updatedAt: new Date() } },
        );
      }

      updates.priority = newPriority;
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );
    return result;
  }

  /**
   * Delete a task by id. Shifts remaining tasks in the same header to keep priorities contiguous.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted task or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const task = await this.findById(id);
    if (!task) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift tasks in same header with higher priority up by -1
    await collection.updateMany(
      { headerId: task.headerId, priority: { $gt: task.priority } },
      { $inc: { priority: -1 }, $set: { updatedAt: new Date() } },
    );

    return task;
  }

  /**
   * Delete all tasks belonging to a specific header (used on header delete).
   * @param {string} headerId
   * @returns {Promise<number>} Number of tasks deleted
   */
  static async deleteByHeader(headerId) {
    const collection = await this.getCollection();
    const result = await collection.deleteMany({ headerId });
    return result.deletedCount;
  }
}

module.exports = { Task, validateEcd };
