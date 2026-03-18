const { getDatabase } = require("../config/db");

class WorkOnDream {
  /**
   * Get the work on dreams collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Use 'WorkOnDream-Test' collection for tests, 'WorkOnDream' for production
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "WorkOnDream-Test" : "WorkOnDream";

    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all work on dreams sorted by priority
   * @returns {Promise<Array>} Array of work on dreams
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a work on dream by ID
   * @param {ObjectId} id - WorkOnDream ID
   * @returns {Promise<Object|null>} WorkOnDream object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new work on dream
   * @param {Object} workOnDreamData - WorkOnDream data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created work on dream
   */
  static async create(workOnDreamData) {
    const collection = await this.getCollection();

    // Count undone work on dreams to insert new item before done items
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done items down by 1 to make room for the new item
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newWorkOnDream = {
      name: workOnDreamData.name,
      notes: workOnDreamData.notes || "",
      priority: undoneCount, // New item gets inserted before done items
      done: workOnDreamData.done || false,
      ecd: workOnDreamData.ecd ? new Date(workOnDreamData.ecd) : null, // Expected Completion Date
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newWorkOnDream);
    return { _id: result.insertedId, ...newWorkOnDream };
  }

  /**
   * Update a work on dream
   * @param {ObjectId} id - WorkOnDream ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated work on dream or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentWorkOnDream = await this.findById(id);
    if (!currentWorkOnDream) return null;

    const count = await collection.countDocuments();

    // If item is being marked as done and it wasn't done before
    if (updateData.done === true && currentWorkOnDream.done === false) {
      const oldPriority = currentWorkOnDream.priority;
      const newPriority = count - 1;

      // Set the item's priority to the last position
      updateData.priority = newPriority;

      // Reduce priority of all items with priority greater than the current item
      // (i.e., shift them up in the list)
      await collection.updateMany(
        {
          priority: { $gt: oldPriority },
        },
        { $inc: { priority: -1 } },
      );
    }
    // If item is being marked as undone and it was done before
    else if (updateData.done === false && currentWorkOnDream.done === true) {
      const oldPriority = currentWorkOnDream.priority;
      const newPriority = 0;

      // Set the item's priority to the first position
      updateData.priority = newPriority;

      // Increase priority of all items with priority less than the current item
      // (i.e., shift them down in the list)
      await collection.updateMany(
        {
          priority: { $lt: oldPriority },
        },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, we need to reorder items
    else if (updateData.priority !== undefined) {
      const oldPriority = currentWorkOnDream.priority;
      const newPriority = updateData.priority;

      // Validate new priority is within bounds
      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Reorder other items
      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          // Moving up: shift items down
          await collection.updateMany(
            {
              priority: { $gte: newPriority, $lt: oldPriority },
            },
            { $inc: { priority: 1 } },
          );
        } else {
          // Moving down: shift items up
          await collection.updateMany(
            {
              priority: { $gt: oldPriority, $lte: newPriority },
            },
            { $inc: { priority: -1 } },
          );
        }
      }
    }

    const updates = {
      ...updateData,
      updatedAt: new Date(),
    };

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );

    return result;
  }

  /**
   * Delete a work on dream and reorder priorities
   * @param {ObjectId} id - WorkOnDream ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    // Get the item to be deleted
    const workOnDream = await this.findById(id);
    if (!workOnDream) return false;

    // Delete the item
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      // Reorder priorities: decrement all items with priority > deleted item's priority
      await collection.updateMany(
        { priority: { $gt: workOnDream.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get work on dream count
   * @returns {Promise<number>} Count of work on dreams
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Delete all done work on dreams and reorder priorities
   * Also moves items with ECD = today to lowest priority
   * @returns {Promise<Object>} Object containing deletedCount and movedCount
   */
  static async deleteAllDone() {
    const collection = await this.getCollection();

    // Delete all items where done is true
    const result = await collection.deleteMany({ done: true });

    // Get all remaining items
    const remainingItems = await collection
      .find({})
      .sort({ priority: 1 })
      .toArray();

    if (remainingItems.length > 0) {
      // Get today's date as a string in YYYY-MM-DD format
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      // Separate items: items with ecd = today go to the end
      const normalItems = [];
      const overdueToday = [];

      remainingItems.forEach((item) => {
        if (item.ecd && !item.done) {
          const itemEcd = new Date(item.ecd);
          const itemEcdStr = itemEcd.toISOString().split("T")[0];

          // Check if ecd is today
          if (itemEcdStr === todayStr) {
            overdueToday.push(item);
          } else {
            normalItems.push(item);
          }
        } else {
          normalItems.push(item);
        }
      });

      // Combine: normal items first, then items with ecd = today
      const reorderedItems = [...normalItems, ...overdueToday];

      // Update priorities to be sequential
      const bulkOps = reorderedItems.map((item, index) => ({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { priority: index } },
        },
      }));

      await collection.bulkWrite(bulkOps);

      return {
        deletedCount: result.deletedCount,
        movedCount: overdueToday.length,
      };
    }

    return { deletedCount: result.deletedCount, movedCount: 0 };
  }
}

module.exports = WorkOnDream;
