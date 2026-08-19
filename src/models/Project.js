const OrderedModel = require("./OrderedModel");
const { orderDoneLast, matchingFirst } = require("../utils/ordering");

/**
 * Stable sort for a project's task list: undone tasks first with dated ones
 * before undated ones (a dated step is already committed to the todo, so it
 * outranks the undated backlog), done tasks last, relative order preserved
 * within each group — the done/undone barrier is the same one the todo
 * enforces per header, which is why both go through `orderDoneLast`.
 */
function sortProjectTasks(tasks) {
  return orderDoneLast(tasks, matchingFirst((task) => task.date));
}

/**
 * A long-term project and the steps toward it. Its tasks live inside the
 * project document (not the Tasks collection); a step with a date is mirrored
 * into the todo and linked back by `todoTaskId`.
 */
class Project extends OrderedModel {
  static collectionName = "Projects";

  /**
   * Create a new project. Priority is assigned as total existing projects
   * (appended at end), same scheme as headers.
   * @param {Object} data  { name, tasks }
   * @returns {Promise<Object>} Created project
   */
  static async create(data) {
    return this.insert({
      name: data.name,
      tasks: data.tasks,
      priority: await this.nextPriority(),
      ...this.timestamps(),
    });
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
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.tasks !== undefined) updates.tasks = data.tasks;

    const priority = await this.resolvePriorityChange(id, current, data.priority);
    if (priority !== undefined) updates.priority = priority;

    return this.saveUpdates(id, updates, current);
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
            updatedAt: this.stamp(),
          },
        },
      );
    }
    return completed;
  }
}

module.exports = { Project, sortProjectTasks };
