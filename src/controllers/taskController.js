const { Task } = require("../models/Task");
const Header = require("../models/Header");

/**
 * GET /tasks?headerId=:headerId
 * Returns all tasks for a given header sorted by priority ascending
 */
const getTasksByHeader = async (req, res) => {
  try {
    const { headerId } = req.query;

    if (!headerId) {
      return res
        .status(400)
        .json({ error: "headerId query parameter is required" });
    }

    // Verify header exists
    const header = await Header.findById(headerId).catch(() => null);
    if (!header) {
      return res.status(404).json({ error: "Header not found" });
    }

    const tasks = await Task.findByHeader(headerId);
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch tasks", message: error.message });
  }
};

/**
 * POST /tasks
 * Creates a new task. Priority is assigned just before the first done task.
 */
const createTask = async (req, res) => {
  try {
    const { name, notes, headerId, ecd } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Task name must be a non-empty string" });
    }

    if (!headerId || typeof headerId !== "string") {
      return res.status(400).json({ error: "headerId is required" });
    }

    // Verify header exists
    const header = await Header.findById(headerId).catch(() => null);
    if (!header) {
      return res.status(404).json({ error: "Header not found" });
    }

    const task = await Task.create({
      name: name.trim(),
      notes: notes || "",
      headerId,
      ecd: ecd !== undefined ? ecd : null,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    if (error.message.startsWith("ecd") || error.message.includes("ecd.")) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to create task", message: error.message });
  }
};

/**
 * PUT /tasks/:id
 * Updates a task (fields, done toggle, or manual priority change)
 */
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, notes, ecd, done, priority } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Task name must be a non-empty string" });
    }

    if (done !== undefined && typeof done !== "boolean") {
      return res.status(400).json({ error: "done must be a boolean" });
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
    if (notes !== undefined) updates.notes = notes;
    if (ecd !== undefined) updates.ecd = ecd;
    if (done !== undefined) updates.done = done;
    if (priority !== undefined) updates.priority = priority;

    const updated = await Task.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating task:", error);
    if (
      error.message.startsWith("Priority must be") ||
      error.message.startsWith("ecd") ||
      error.message.includes("ecd.")
    ) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to update task", message: error.message });
  }
};

/**
 * DELETE /tasks/:id
 * Deletes a task and reorders remaining tasks in the same header
 */
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Task.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting task:", error);
    res
      .status(500)
      .json({ error: "Failed to delete task", message: error.message });
  }
};

module.exports = { getTasksByHeader, createTask, updateTask, deleteTask };
