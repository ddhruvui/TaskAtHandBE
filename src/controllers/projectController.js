const { Project, sortProjectTasks } = require("../models/Project");
const {
  applyProjectHeaderOrder,
  renameProjectHeader,
  unlinkProjectHeader,
} = require("../services/headerOrder");
const {
  route,
  requireFound,
  isPriorityRangeError,
} = require("../utils/http");
const {
  requiredString,
  optionalString,
  optionalText,
  optionalBoolean,
  optionalPriority,
  optionalStringOrNull,
  dateStringOrNull,
  requireObject,
  requireArray,
  definedFields,
} = require("../utils/validate");

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
 * The list is re-sorted (stable) so undone tasks come before done tasks,
 * with dated undone tasks before undated ones.
 * Returns the normalized tasks or throws a validation Error.
 */
function validateTasks(tasks) {
  const normalized = requireArray(
    tasks,
    "tasks must be an array of { name, notes, date, done, todoTaskId } objects",
  ).map((task) => {
    requireObject(task, "Each task must be an object with a name");
    const name = requiredString(task.name, "Each task name");
    const notes = optionalText(task.notes, "Task notes") ?? "";
    const date = dateStringOrNull(task.date, "Task date");
    const done = optionalBoolean(task.done, "Task done") ?? false;
    const todoTaskId =
      optionalStringOrNull(task.todoTaskId, "Task todoTaskId") ?? null;

    return {
      name,
      notes,
      date,
      done,
      // A blank link is no link — the clients send "" when they clear one.
      todoTaskId:
        todoTaskId !== null && todoTaskId.trim() === "" ? null : todoTaskId,
    };
  });
  return sortProjectTasks(normalized);
}

/**
 * GET /projects
 * Returns all projects sorted by priority ascending
 */
const getAllProjects = route(
  { action: "fetching projects", failure: "Failed to fetch projects" },
  async (req, res) => {
    res.json(await Project.findAll());
  },
);

/**
 * POST /projects
 * Creates a new long-term project with a name and a list of tasks (steps
 * toward the project, e.g. "get data from EODHD"). Tasks are optional and
 * default to an empty list. Priority is auto-assigned (appended at end).
 */
const createProject = route(
  { action: "creating project", failure: "Failed to create project" },
  async (req, res) => {
    const { tasks } = req.body;
    const name = requiredString(req.body.name, "Project name");
    const project = await Project.create({
      name,
      tasks: tasks === undefined ? [] : validateTasks(tasks),
    });
    res.status(201).json(project);
  },
);

/**
 * PUT /projects/:id
 * Updates a project's name, task list and/or priority. Tasks are replaced
 * wholesale, which covers adding, renaming, reordering, removing, date and
 * done changes; dated undone tasks sort above undated ones and done tasks
 * always end up at the bottom of the list.
 */
const updateProject = route(
  {
    action: "updating project",
    failure: "Failed to update project",
    badRequest: [isPriorityRangeError],
  },
  async (req, res) => {
    const { id } = req.params;
    const { tasks } = req.body;

    const updates = definedFields({
      name: optionalString(req.body.name, "Project name"),
      priority: optionalPriority(req.body.priority),
      tasks: tasks === undefined ? undefined : validateTasks(tasks),
    });

    const updated = requireFound(
      await Project.update(id, updates),
      "Project not found",
    );

    // Cascade to the project's todo header: a rename keeps the header's name
    // in step, a move re-orders the project header block.
    if (updates.name !== undefined) {
      await renameProjectHeader(id, updated.name);
    }
    if (updates.priority !== undefined) {
      await applyProjectHeaderOrder();
    }

    res.json(updated);
  },
);

/**
 * DELETE /projects/:id
 * Deletes a project (and shifts remaining project priorities). Its todo
 * header and the tasks already added from its dated tasks are kept, but the
 * header is unlinked so it stops being ordered with the projects.
 */
const deleteProject = route(
  { action: "deleting project", failure: "Failed to delete project" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Project.delete(id), "Project not found");

    const headersUnlinked = await unlinkProjectHeader(id);
    // Remaining project headers close the gap the unlinked one left behind.
    await applyProjectHeaderOrder();

    res.json({ deleted: id, headersUnlinked });
  },
);

module.exports = {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
};
