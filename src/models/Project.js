const { getDatabase } = require("../config/db");
const { ObjectId } = require("mongodb");

/**
 * Stable sort for a project's task list: undone tasks first with dated ones
 * before undated ones (a dated step is already committed to the todo, so it
 * outranks the undated backlog), done tasks last, relative order preserved
 * within each group — the done/undone barrier is the same one the todo
 * enforces per header.
 */
function sortProjectTasks(tasks) {
  const dated = tasks.filter((t) => !t.done && t.date);
  const undated = tasks.filter((t) => !t.done && !t.date);
  const done = tasks.filter((t) => t.done);
  return [...dated, ...undated, ...done];
}

class Project {
  /**
   * Get the Projects collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Projects-Test" : "Projects";
    return db.collection(collectionName);
  }

  /**
   * Return all projects sorted by priority ascending
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find a project by its _id
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new project. Priority is assigned as total existing projects
   * (appended at end), same scheme as headers.
   * @param {Object} data  { name, tasks }
   * @returns {Promise<Object>} Created project
   */
  static async create(data) {
    const collection = await this.getCollection();
    const count = await collection.countDocuments();
    const now = new Date().toISOString();

    const project = {
      name: data.name,
      tasks: data.tasks,
      priority: count,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(project);
    return { _id: result.insertedId, ...project };
  }

  /**
   * Update a project's name, task list and/or priority.
   * Tasks are replaced wholesale (add/rename/reorder/remove/done changes).
   * When priority changes all affected projects are shifted to keep
   * contiguous order, same as headers.
   * @param {string} id
   * @param {Object} data  { name?, tasks?, priority? }
   * @returns {Promise<Object|null>} Updated project or null if not found
   */
  static async update(id, data) {
    const collection = await this.getCollection();
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.tasks !== undefined) updates.tasks = data.tasks;

    if (data.priority !== undefined && data.priority !== current.priority) {
      const oldPriority = current.priority;
      const newPriority = data.priority;
      const count = await collection.countDocuments();

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      if (newPriority < oldPriority) {
        // Moving up: shift projects in [newPriority, oldPriority) down by 1
        await collection.updateMany(
          {
            priority: { $gte: newPriority, $lt: oldPriority },
            _id: { $ne: new ObjectId(id) },
          },
          { $inc: { priority: 1 } },
        );
      } else {
        // Moving down: shift projects in (oldPriority, newPriority] up by -1
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

    updates.updatedAt = new Date().toISOString();

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );
    return result;
  }

  /**
   * Delete a project (and shift remaining project priorities).
   * Todo tasks created from its tasks are untouched — caller decides.
   * @param {string} id
   * @returns {Promise<Object|null>} Deleted project or null
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const project = await this.findById(id);
    if (!project) return null;

    await collection.deleteOne({ _id: new ObjectId(id) });

    // Shift all projects with higher priority down by 1
    await collection.updateMany(
      { priority: { $gt: project.priority } },
      { $inc: { priority: -1 } },
    );

    return project;
  }

  /**
   * Mark project tasks done when their linked todo tasks are deleted by the
   * cron (done date/no-ECD cleanup). The link is consumed: todoTaskId is
   * cleared, done flips true, the date stays for the record, and the task
   * list is re-sorted so done tasks sit at the bottom.
   * @param {string[]} todoTaskIds  _ids (strings) of deleted todo tasks
   * @returns {Promise<number>} Number of project tasks marked done
   */
  static async completeTasksByTodoIds(todoTaskIds) {
    if (!todoTaskIds || todoTaskIds.length === 0) return 0;
    const collection = await this.getCollection();
    const idSet = new Set(todoTaskIds);

    const projects = await collection
      .find({ "tasks.todoTaskId": { $in: todoTaskIds } })
      .toArray();

    let completed = 0;
    for (const project of projects) {
      const tasks = project.tasks.map((task) => {
        if (task.todoTaskId && idSet.has(task.todoTaskId)) {
          completed++;
          return { ...task, done: true, todoTaskId: null };
        }
        return task;
      });
      await collection.updateOne(
        { _id: project._id },
        {
          $set: {
            tasks: sortProjectTasks(tasks),
            updatedAt: new Date().toISOString(),
          },
        },
      );
    }
    return completed;
  }
}

module.exports = { Project, sortProjectTasks };
