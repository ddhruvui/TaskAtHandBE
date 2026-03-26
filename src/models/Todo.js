const { getDatabase } = require("../config/db");

class Todo {
  /**
   * Get the todos collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    // Get the TaskAtHand database
    const db = await getDatabase();

    // Use 'Todo-Test' collection for tests, 'Todo' for production
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Todo-Test" : "Todo";

    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all todos sorted by priority
   * @returns {Promise<Array>} Array of todos
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a todo by ID
   * @param {ObjectId} id - Todo ID
   * @returns {Promise<Object|null>} Todo object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new todo
   * @param {Object} todoData - Todo data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created todo
   */
  static async create(todoData) {
    const collection = await this.getCollection();

    // Count undone todos to insert new todo before done todos
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done todos down by 1 to make room for the new todo
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newTodo = {
      name: todoData.name,
      notes: todoData.notes || "",
      priority: undoneCount, // New todo gets inserted before done todos
      done: todoData.done || false,
      ecd: todoData.ecd ? new Date(todoData.ecd) : null, // Expected Completion Date
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newTodo);
    return { _id: result.insertedId, ...newTodo };
  }

  /**
   * Update a todo
   * @param {ObjectId} id - Todo ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated todo or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentTodo = await this.findById(id);
    if (!currentTodo) return null;

    const count = await collection.countDocuments();

    // If todo is being marked as done and it wasn't done before
    if (updateData.done === true && currentTodo.done === false) {
      const oldPriority = currentTodo.priority;
      const newPriority = count - 1;

      // Set the todo's priority to the last position
      updateData.priority = newPriority;

      // Reduce priority of all todos with priority greater than the current todo
      // (i.e., shift them up in the list)
      await collection.updateMany(
        {
          priority: { $gt: oldPriority },
        },
        { $inc: { priority: -1 } },
      );
    }
    // If todo is being marked as undone and it was done before
    else if (updateData.done === false && currentTodo.done === true) {
      const oldPriority = currentTodo.priority;
      const newPriority = 0;

      // Set the todo's priority to the first position
      updateData.priority = newPriority;

      // Increase priority of all todos with priority less than the current todo
      // (i.e., shift them down in the list)
      await collection.updateMany(
        {
          priority: { $lt: oldPriority },
        },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, we need to reorder todos
    else if (updateData.priority !== undefined) {
      const oldPriority = currentTodo.priority;
      const newPriority = updateData.priority;

      // Validate new priority is within bounds
      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Enforce done/not-done boundary:
      // Not done tasks must stay above done tasks (lower priority numbers)
      // Done tasks must stay below not done tasks (higher priority numbers)
      const undoneCount = await collection.countDocuments({ done: false });
      if (!currentTodo.done && newPriority >= undoneCount) {
        throw new Error(
          "Not done task cannot have priority greater than or equal to a done task",
        );
      }
      if (currentTodo.done && newPriority < undoneCount) {
        throw new Error(
          "Done task cannot have priority less than a not done task",
        );
      }

      // Reorder other todos
      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          // Moving up: shift todos down
          await collection.updateMany(
            {
              priority: { $gte: newPriority, $lt: oldPriority },
            },
            { $inc: { priority: 1 } },
          );
        } else {
          // Moving down: shift todos up
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
   * Delete a todo and reorder priorities
   * @param {ObjectId} id - Todo ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    // Get the todo to be deleted
    const todo = await this.findById(id);
    if (!todo) return false;

    // Delete the todo
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      // Reorder priorities: decrement all todos with priority > deleted todo's priority
      await collection.updateMany(
        { priority: { $gt: todo.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get todo count
   * @returns {Promise<number>} Count of todos
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Delete all done todos and reorder priorities
   * Also moves todos with ECD = today to lowest priority
   * @returns {Promise<Object>} Object containing deletedCount and movedCount
   */
  static async deleteAllDone() {
    const collection = await this.getCollection();

    // Delete all todos where done is true
    const result = await collection.deleteMany({ done: true });

    // Get all remaining todos
    const remainingTodos = await collection
      .find({})
      .sort({ priority: 1 })
      .toArray();

    if (remainingTodos.length > 0) {
      // Get today's date as a string in YYYY-MM-DD format (local timezone)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      // Separate todos: todos with ecd = today go to the end
      const normalTodos = [];
      const overdueToday = [];

      remainingTodos.forEach((todo) => {
        if (todo.ecd && !todo.done) {
          const todoEcd = new Date(todo.ecd);
          const todoEcdStr = todoEcd.toISOString().split("T")[0];

          // Check if ecd is today
          if (todoEcdStr === todayStr) {
            overdueToday.push(todo);
          } else {
            normalTodos.push(todo);
          }
        } else {
          normalTodos.push(todo);
        }
      });

      // Combine: normal todos first, then todos with ecd = today
      const reorderedTodos = [...normalTodos, ...overdueToday];

      // Update priorities to be sequential
      const bulkOps = reorderedTodos.map((todo, index) => ({
        updateOne: {
          filter: { _id: todo._id },
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

module.exports = Todo;
