const { Task } = require("../models/Task");
const Header = require("../models/Header");
const {
  route,
  requireFound,
  isPriorityRangeError,
  isEcdError,
} = require("../utils/http");
const {
  ValidationError,
  requiredString,
  optionalString,
  optionalText,
  optionalBoolean,
  optionalPriority,
  definedFields,
} = require("../utils/validate");

/** The header a task is being filed under must exist (and its id be readable). */
async function requireHeader(headerId) {
  return requireFound(
    await Header.findById(headerId).catch(() => null),
    "Header not found",
  );
}

/**
 * GET /tasks?headerId=:headerId
 * Returns all tasks for a given header sorted by priority ascending
 */
const getTasksByHeader = route(
  { action: "fetching tasks", failure: "Failed to fetch tasks" },
  async (req, res) => {
    const { headerId } = req.query;
    if (!headerId) {
      throw new ValidationError("headerId query parameter is required");
    }

    await requireHeader(headerId);
    res.json(await Task.findByHeader(headerId));
  },
);

/**
 * POST /tasks
 * Creates a new task. Priority is assigned just before the first done task.
 */
const createTask = route(
  {
    action: "creating task",
    failure: "Failed to create task",
    badRequest: [isEcdError],
  },
  async (req, res) => {
    const { headerId, notes, ecd } = req.body;
    const name = requiredString(req.body.name, "Task name");

    if (!headerId || typeof headerId !== "string") {
      throw new ValidationError("headerId is required");
    }

    await requireHeader(headerId);

    const task = await Task.create({
      name,
      notes: notes || "",
      headerId,
      ecd: ecd !== undefined ? ecd : null,
    });

    res.status(201).json(task);
  },
);

/**
 * PUT /tasks/:id
 * Updates a task (fields, done toggle, or manual priority change)
 */
const updateTask = route(
  {
    action: "updating task",
    failure: "Failed to update task",
    badRequest: [isPriorityRangeError, isEcdError],
  },
  async (req, res) => {
    const { notes, ecd } = req.body;

    const updates = definedFields({
      name: optionalString(req.body.name, "Task name"),
      done: optionalBoolean(req.body.done, "done"),
      priority: optionalPriority(req.body.priority),
      reason: optionalText(req.body.reason, "reason"),
      vacationMove: optionalBoolean(req.body.vacationMove, "vacationMove"),
      notes,
      ecd,
    });

    // reason is not a task field: it rides along only to annotate the
    // task_rescheduled archive event when an ECD change is a postpone.
    if (updates.reason !== undefined) {
      const trimmed = updates.reason.trim();
      if (trimmed === "") delete updates.reason;
      else updates.reason = trimmed;
    }

    // vacationMove rides along the same way — set by the Vacation panel when
    // it moves a task out of a booked trip, so the resulting postpone is
    // never read as procrastination. Also never stored on the task.

    const updated = await Task.update(req.params.id, updates);
    res.json(requireFound(updated, "Task not found"));
  },
);

/**
 * DELETE /tasks/:id
 * Deletes a task and reorders remaining tasks in the same header
 */
const deleteTask = route(
  { action: "deleting task", failure: "Failed to delete task" },
  async (req, res) => {
    const { id } = req.params;
    const reason = optionalText((req.body || {}).reason, "reason");

    requireFound(
      await Task.delete(id, reason ? reason.trim() : undefined),
      "Task not found",
    );
    res.json({ deleted: id });
  },
);

module.exports = { getTasksByHeader, createTask, updateTask, deleteTask };
