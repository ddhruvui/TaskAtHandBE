const { getDatabase } = require("../config/db");

class Dream {
  /**
   * Get the dreams collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Use 'Dream-Test' collection for tests, 'Dream' for production
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Dream-Test" : "Dream";

    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all dreams sorted by priority
   * @returns {Promise<Array>} Array of dreams
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a dream by ID
   * @param {ObjectId} id - Dream ID
   * @returns {Promise<Object|null>} Dream object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new dream
   * @param {Object} dreamData - Dream data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created dream
   */
  static async create(dreamData) {
    const collection = await this.getCollection();

    // Count undone dreams to insert new dream before done dreams
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done dreams down by 1 to make room for the new dream
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newDream = {
      name: dreamData.name,
      notes: dreamData.notes || "",
      priority: undoneCount, // New dream gets inserted before done dreams
      done: dreamData.done || false,
      ecd: dreamData.ecd ? new Date(dreamData.ecd) : null, // Expected Completion Date
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newDream);
    return { _id: result.insertedId, ...newDream };
  }

  /**
   * Update a dream
   * @param {ObjectId} id - Dream ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated dream or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentDream = await this.findById(id);
    if (!currentDream) return null;

    const count = await collection.countDocuments();

    // If dream is being marked as done and it wasn't done before
    if (updateData.done === true && currentDream.done === false) {
      const oldPriority = currentDream.priority;
      const newPriority = count - 1;

      // Set the dream's priority to the last position
      updateData.priority = newPriority;

      // Reduce priority of all dreams with priority greater than the current dream
      // (i.e., shift them up in the list)
      await collection.updateMany(
        {
          priority: { $gt: oldPriority },
        },
        { $inc: { priority: -1 } },
      );
    }
    // If dream is being marked as undone and it was done before
    else if (updateData.done === false && currentDream.done === true) {
      const oldPriority = currentDream.priority;
      const newPriority = 0;

      // Set the dream's priority to the first position
      updateData.priority = newPriority;

      // Increase priority of all dreams with priority less than the current dream
      // (i.e., shift them down in the list)
      await collection.updateMany(
        {
          priority: { $lt: oldPriority },
        },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, we need to reorder dreams
    else if (updateData.priority !== undefined) {
      const oldPriority = currentDream.priority;
      const newPriority = updateData.priority;

      // Validate new priority is within bounds
      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Reorder other dreams
      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          // Moving up: shift dreams down
          await collection.updateMany(
            {
              priority: { $gte: newPriority, $lt: oldPriority },
            },
            { $inc: { priority: 1 } },
          );
        } else {
          // Moving down: shift dreams up
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
   * Delete a dream and reorder priorities
   * @param {ObjectId} id - Dream ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    // Get the dream to be deleted
    const dream = await this.findById(id);
    if (!dream) return false;

    // Delete the dream
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      // Reorder priorities: decrement all dreams with priority > deleted dream's priority
      await collection.updateMany(
        { priority: { $gt: dream.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get dream count
   * @returns {Promise<number>} Count of dreams
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Delete all done dreams and reorder priorities
   * Also moves dreams with ECD = today to lowest priority
   * @returns {Promise<Object>} Object containing deletedCount and movedCount
   */
  static async deleteAllDone() {
    const collection = await this.getCollection();

    // Delete all dreams where done is true
    const result = await collection.deleteMany({ done: true });

    // Get all remaining dreams
    const remainingDreams = await collection
      .find({})
      .sort({ priority: 1 })
      .toArray();

    if (remainingDreams.length > 0) {
      // Get today's date as a string in YYYY-MM-DD format (local timezone)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      // Separate dreams: dreams with ecd = today go to the end
      const normalDreams = [];
      const overdueToday = [];

      remainingDreams.forEach((dream) => {
        if (dream.ecd && !dream.done) {
          const dreamEcd = new Date(dream.ecd);
          const dreamEcdStr = dreamEcd.toISOString().split("T")[0];

          // Check if ecd is today
          if (dreamEcdStr === todayStr) {
            overdueToday.push(dream);
          } else {
            normalDreams.push(dream);
          }
        } else {
          normalDreams.push(dream);
        }
      });

      // Combine: normal dreams first, then dreams with ecd = today
      const reorderedDreams = [...normalDreams, ...overdueToday];

      // Update priorities to be sequential
      const bulkOps = reorderedDreams.map((dream, index) => ({
        updateOne: {
          filter: { _id: dream._id },
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

module.exports = Dream;
