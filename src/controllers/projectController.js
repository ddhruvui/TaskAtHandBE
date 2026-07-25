const { Project, sortProjectTasks } = require("../models/Project");

/**
 * Validate and normalize a project task list.
 * Tasks are { name, notes, date, done, todoTaskId } objects:
 *   - name: required non-empty string (trimmed)
 *   - notes: free-text string (default "") — mirrored onto the linked todo
 *     task by the client (an empty note falls back to a "Step towards …"
 *     default there)
 *   - date: "YYYY-MM-DD" string or null (default null) — when set, the
 *     client mirrors the task into the todo under a header named after the
 *     project
 *   - done: boolean (default false)
 *   - todoTaskId: string _id of the linked todo task or null (default null)
 * The list is re-sorted so undone tasks come before done tasks (stable).
 * Returns the normalized tasks or throws a validation Error.
 */
function validateTasks(tasks) {
  if (!Array.isArray(tasks)) {
    throw new Error(
      "tasks must be an array of { name, notes, date, done, todoTaskId } objects",
    );
  }
  const normalized = tasks.map((task) => {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      throw new Error("Each task must be an object with a name");
    }
    if (typeof task.name !== "string" || task.name.trim() === "") {
      throw new Error("Each task name must be a non-empty string");
    }
    const notes = task.notes === undefined ? "" : task.notes;
    if (typeof notes !== "string") {
      throw new Error("Task notes must be a string");
    }
    let date = task.date === undefined ? null : task.date;
    if (date !== null) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Task date must be a YYYY-MM-DD string or null");
      }
    }
    const done = task.done === undefined ? false : task.done;
    if (typeof done !== "boolean") {
      throw new Error("Task done must be a boolean");
    }
    let todoTaskId = task.todoTaskId === undefined ? null : task.todoTaskId;
    if (todoTaskId !== null && typeof todoTaskId !== "string") {
      throw new Error("Task todoTaskId must be a string or null");
    }
    if (todoTaskId !== null && todoTaskId.trim() === "") todoTaskId = null;
    return { name: task.name.trim(), notes, date, done, todoTaskId };
  });
  return sortProjectTasks(normalized);
}

/**
 * GET /projects
 * Returns all projects sorted by priority ascending
 */
const getAllProjects = async (req, res) => {
  try {
    const projects = await Project.findAll();
    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch projects", message: error.message });
  }
};

/**
 * POST /projects
 * Creates a new long-term project with a name and a list of tasks (steps
 * toward the project, e.g. "get data from EODHD"). Tasks are optional and
 * default to an empty list. Priority is auto-assigned (appended at end).
 */
const createProject = async (req, res) => {
  try {
    const { name, tasks } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Project name must be a non-empty string" });
    }

    let normalizedTasks;
    try {
      normalizedTasks = tasks === undefined ? [] : validateTasks(tasks);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const project = await Project.create({
      name: name.trim(),
      tasks: normalizedTasks,
    });
    res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    res
      .status(500)
      .json({ error: "Failed to create project", message: error.message });
  }
};

/**
 * PUT /projects/:id
 * Updates a project's name, task list and/or priority. Tasks are replaced
 * wholesale, which covers adding, renaming, reordering, removing, date and
 * done changes; done tasks always end up at the bottom of the list.
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tasks, priority } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Project name must be a non-empty string" });
    }

    if (
      priority !== undefined &&
      (!Number.isInteger(priority) || priority < 0)
    ) {
      return res
        .status(400)
        .json({ error: "Priority must be a non-negative integer" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (priority !== undefined) updates.priority = priority;
    if (tasks !== undefined) {
      try {
        updates.tasks = validateTasks(tasks);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    }

    const updated = await Project.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating project:", error);
    if (error.message.startsWith("Priority must be")) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to update project", message: error.message });
  }
};

/**
 * DELETE /projects/:id
 * Deletes a project (and shifts remaining project priorities). Tasks already
 * added to the todo from its dated tasks are untouched.
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Project.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting project:", error);
    res
      .status(500)
      .json({ error: "Failed to delete project", message: error.message });
  }
};

module.exports = {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
};
