const { getDatabase } = require("../config/db");

class Habbit {
  /**
   * Get the habbits collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Use 'Habbit-Test' collection for tests, 'Habbit' for production
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Habbit-Test" : "Habbit";

    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all habbits sorted by priority
   * @returns {Promise<Array>} Array of habbits
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a habbit by ID
   * @param {ObjectId} id - Habbit ID
   * @returns {Promise<Object|null>} Habbit object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new habbit
   * @param {Object} habbitData - Habbit data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created habbit
   */
  static async create(habbitData) {
    const collection = await this.getCollection();

    // Count undone habbits to insert new habbit before done habbits
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done habbits down by 1 to make room for the new habbit
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newHabbit = {
      name: habbitData.name,
      notes: habbitData.notes || "",
      priority: undoneCount, // New habbit gets inserted before done habbits
      done: habbitData.done || false,
      ecdDayOfWeek: habbitData.ecdDayOfWeek ?? null, // Day of week: 1 (Mon) – 7 (Sun)
      ecdDayOfMonth: habbitData.ecdDayOfMonth ?? null, // Day of month: 1 – 31
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newHabbit);
    return { _id: result.insertedId, ...newHabbit };
  }

  /**
   * Update a habbit
   * @param {ObjectId} id - Habbit ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated habbit or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentHabbit = await this.findById(id);
    if (!currentHabbit) return null;

    const count = await collection.countDocuments();

    // If habbit is being marked as done and it wasn't done before
    if (updateData.done === true && currentHabbit.done === false) {
      const oldPriority = currentHabbit.priority;
      const newPriority = count - 1;

      // Set the habbit's priority to the last position
      updateData.priority = newPriority;

      // Reduce priority of all habbits with priority greater than the current habbit
      // (i.e., shift them up in the list)
      await collection.updateMany(
        {
          priority: { $gt: oldPriority },
        },
        { $inc: { priority: -1 } },
      );
    }
    // If habbit is being marked as undone and it was done before
    else if (updateData.done === false && currentHabbit.done === true) {
      const oldPriority = currentHabbit.priority;
      const newPriority = 0;

      // Set the habbit's priority to the first position
      updateData.priority = newPriority;

      // Increase priority of all habbits with priority less than the current habbit
      // (i.e., shift them down in the list)
      await collection.updateMany(
        {
          priority: { $lt: oldPriority },
        },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, we need to reorder habbits
    else if (updateData.priority !== undefined) {
      const oldPriority = currentHabbit.priority;
      const newPriority = updateData.priority;

      // Validate new priority is within bounds
      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Reorder other habbits
      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          // Moving up: shift habbits down
          await collection.updateMany(
            {
              priority: { $gte: newPriority, $lt: oldPriority },
            },
            { $inc: { priority: 1 } },
          );
        } else {
          // Moving down: shift habbits up
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
   * Delete a habbit and reorder priorities
   * @param {ObjectId} id - Habbit ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    // Get the habbit to be deleted
    const habbit = await this.findById(id);
    if (!habbit) return false;

    // Delete the habbit
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      // Reorder priorities: decrement all habbits with priority > deleted habbit's priority
      await collection.updateMany(
        { priority: { $gt: habbit.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get habbit count
   * @returns {Promise<number>} Count of habbits
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Mark all done habbits as undone and reorder priorities
   * Also moves habbits with ECD matching today to lowest priority
   * @returns {Promise<Object>} Object containing markedUndoneCount and movedCount
   */
  static async deleteAllDone() {
    const collection = await this.getCollection();

    // Get all done habbits
    const doneHabbits = await collection.find({ done: true }).toArray();
    const markedUndoneCount = doneHabbits.length;

    // Mark all done habbits as undone
    await collection.updateMany({ done: true }, { $set: { done: false } });

    // Get all habbits
    const allHabbits = await collection
      .find({})
      .sort({ priority: 1 })
      .toArray();

    if (allHabbits.length > 0) {
      // Get today's date
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1-7 (Monday-Sunday)
      const todayDayOfMonth = today.getDate(); // 1-31

      // Separate habbits: habbits with ecd matching today go to the end
      const normalHabbits = [];
      const overdueToday = [];

      allHabbits.forEach((habbit) => {
        // Check if ecdDayOfWeek matches today's day of week, or ecdDayOfMonth matches today's date
        // Both fields are stored as arrays (or null), so use .includes() for matching
        const matchesWeek = Array.isArray(habbit.ecdDayOfWeek)
          ? habbit.ecdDayOfWeek.includes(todayDayOfWeek)
          : habbit.ecdDayOfWeek != null &&
            habbit.ecdDayOfWeek === todayDayOfWeek;
        const matchesMonth = Array.isArray(habbit.ecdDayOfMonth)
          ? habbit.ecdDayOfMonth.includes(todayDayOfMonth)
          : habbit.ecdDayOfMonth != null &&
            habbit.ecdDayOfMonth === todayDayOfMonth;
        if (matchesWeek || matchesMonth) {
          overdueToday.push(habbit);
        } else {
          normalHabbits.push(habbit);
        }
      });

      // Combine: normal habbits first, then habbits with ecd matching today
      const reorderedHabbits = [...normalHabbits, ...overdueToday];

      // Update priorities to be sequential
      const bulkOps = reorderedHabbits.map((habbit, index) => ({
        updateOne: {
          filter: { _id: habbit._id },
          update: { $set: { priority: index } },
        },
      }));

      await collection.bulkWrite(bulkOps);

      return {
        markedUndoneCount: markedUndoneCount,
        movedCount: overdueToday.length,
      };
    }

    return { markedUndoneCount: markedUndoneCount, movedCount: 0 };
  }
}

module.exports = Habbit;
