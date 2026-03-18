const { getDatabase } = require("../config/db");

class Office {
  /**
   * Get the tasks collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Use 'Office-Test' collection for tests, 'Office' for production
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Office-Test" : "Office";

    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all tasks sorted by priority
   * @returns {Promise<Array>} Array of tasks
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a task by ID
   * @param {ObjectId} id - Task ID
   * @returns {Promise<Object|null>} Task object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created task
   */
  static async create(taskData) {
    const collection = await this.getCollection();

    // Count undone tasks to insert new task before done tasks
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done tasks down by 1 to make room for the new task
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newTask = {
      name: taskData.name,
      notes: taskData.notes || "",
      priority: undoneCount, // New task gets inserted before done tasks
      done: taskData.done || false,
      ecd: taskData.ecd ? new Date(taskData.ecd) : null, // Expected Completion Date
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newTask);
    return { _id: result.insertedId, ...newTask };
  }

  /**
   * Update a task
   * @param {ObjectId} id - Task ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated task or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentTask = await this.findById(id);
    if (!currentTask) return null;

    const count = await collection.countDocuments();

    // If task is being marked as done and it wasn't done before
    if (updateData.done === true && currentTask.done === false) {
      const oldPriority = currentTask.priority;
      const newPriority = count - 1;

      // Set the task's priority to the last position
      updateData.priority = newPriority;

      // Reduce priority of all tasks with priority greater than the current task
      // (i.e., shift them up in the list)
      await collection.updateMany(
        {
          priority: { $gt: oldPriority },
        },
        { $inc: { priority: -1 } },
      );
    }
    // If task is being marked as undone and it was done before
    else if (updateData.done === false && currentTask.done === true) {
      const oldPriority = currentTask.priority;
      const newPriority = 0;

      // Set the task's priority to the first position
      updateData.priority = newPriority;

      // Increase priority of all tasks with priority less than the current task
      // (i.e., shift them down in the list)
      await collection.updateMany(
        {
          priority: { $lt: oldPriority },
        },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, we need to reorder tasks
    else if (updateData.priority !== undefined) {
      const oldPriority = currentTask.priority;
      const newPriority = updateData.priority;

      // Validate new priority is within bounds
      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Reorder other tasks
      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          // Moving up: shift tasks down
          await collection.updateMany(
            {
              priority: { $gte: newPriority, $lt: oldPriority },
            },
            { $inc: { priority: 1 } },
          );
        } else {
          // Moving down: shift tasks up
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
   * Delete a task and reorder priorities
   * @param {ObjectId} id - Task ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    // Get the task to be deleted
    const task = await this.findById(id);
    if (!task) return false;

    // Delete the task
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      // Reorder priorities: decrement all tasks with priority > deleted task's priority
      await collection.updateMany(
        { priority: { $gt: task.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get task count
   * @returns {Promise<number>} Count of tasks
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Delete all done tasks and reorder priorities
   * Also moves tasks with ECD = today to lowest priority
   * @returns {Promise<Object>} Object containing deletedCount and movedCount
   */
  static async deleteAllDone() {
    const collection = await this.getCollection();

    // Delete all tasks where done is true
    const result = await collection.deleteMany({ done: true });

    // Get all remaining tasks
    const remainingTasks = await collection
      .find({})
      .sort({ priority: 1 })
      .toArray();

    if (remainingTasks.length > 0) {
      // Get today's date as a string in YYYY-MM-DD format (local timezone)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      // Separate tasks: tasks with ecd = today go to the end
      const normalTasks = [];
      const overdueToday = [];

      remainingTasks.forEach((task) => {
        if (task.ecd && !task.done) {
          const taskEcd = new Date(task.ecd);
          const taskEcdStr = taskEcd.toISOString().split("T")[0];

          // Check if ecd is today
          if (taskEcdStr === todayStr) {
            overdueToday.push(task);
          } else {
            normalTasks.push(task);
          }
        } else {
          normalTasks.push(task);
        }
      });

      // Combine: normal tasks first, then tasks with ecd = today
      const reorderedTasks = [...normalTasks, ...overdueToday];

      // Update priorities to be sequential
      const bulkOps = reorderedTasks.map((task, index) => ({
        updateOne: {
          filter: { _id: task._id },
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

module.exports = Office;
