const Office = require("../models/Office");
const { ObjectId } = require("mongodb");

/** Returns true for a valid 24-hex-char MongoDB ObjectId string */
const isValidObjectId = (id) =>
  ObjectId.isValid(id) && String(new ObjectId(id)) === id;

/**
 * Get all tasks
 * @route GET /api/office
 */
const getAllTasks = async (req, res) => {
  try {
    const tasks = await Office.findAll();
    res.json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tasks",
      message: error.message,
    });
  }
};

/**
 * Get a single task by ID
 * @route GET /api/office/:id
 */
const getTaskById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID format",
      });
    }
    const task = await Office.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch task",
      message: error.message,
    });
  }
};

/**
 * Create a new task
 * @route POST /api/office
 */
const createTask = async (req, res) => {
  try {
    const { name, notes, done, ecd } = req.body;

    // Validation for name - must be a non-empty string
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Task name must be a non-empty string",
      });
    }

    // Convert and validate done field
    let doneValue = false;
    if (done !== undefined && done !== null) {
      if (typeof done === "boolean") {
        doneValue = done;
      } else if (typeof done === "string") {
        doneValue = done.toLowerCase() === "true";
      } else if (typeof done === "number") {
        doneValue = done !== 0;
      } else {
        doneValue = Boolean(done);
      }
    }

    const taskData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecd: ecd || null,
    };

    const newTask = await Office.create(taskData);

    res.status(201).json({
      success: true,
      data: newTask,
      message: "Task created successfully",
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create task",
      message: error.message,
    });
  }
};

/**
 * Update a task
 * @route PUT /api/office/:id
 */
const updateTask = async (req, res) => {
  try {
    const { name, notes, priority, done } = req.body;
    const updateData = {};

    // Only include fields that are provided
    if (name !== undefined) updateData.name = name.trim();
    if (notes !== undefined) updateData.notes = notes;
    if (priority !== undefined) {
      // Validate priority is a non-negative integer
      const priorityNum = parseInt(priority);
      if (isNaN(priorityNum) || priorityNum < 0) {
        return res.status(400).json({
          success: false,
          error: "Priority must be a non-negative integer",
        });
      }
      updateData.priority = priorityNum;
    }
    if (done !== undefined) updateData.done = done;

    // Validate at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID format",
      });
    }

    const updatedTask = await Office.update(req.params.id, updateData);

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    res.json({
      success: true,
      data: updatedTask,
      message: "Task updated successfully",
    });
  } catch (error) {
    // Handle specific known validation errors (no need to log these)
    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    console.error("Error updating task:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update task",
      message: error.message,
    });
  }
};

/**
 * Delete a task
 * @route DELETE /api/office/:id
 */
const deleteTask = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID format",
      });
    }
    const success = await Office.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    res.json({
      success: true,
      message: "Task deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete task",
      message: error.message,
    });
  }
};

/**
 * Get task count
 * @route GET /api/office/count
 */
const getTaskCount = async (req, res) => {
  try {
    const count = await Office.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting task count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get task count",
      message: error.message,
    });
  }
};

/**
 * Delete all done tasks (for cron job)
 * @route DELETE /api/office/chron
 */
const deleteAllDoneTasks = async (req, res) => {
  try {
    const result = await Office.deleteAllDone();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      movedCount: result.movedCount,
      message: `Successfully deleted ${result.deletedCount} done task(s) and moved ${result.movedCount} overdue task(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error deleting done tasks:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete done tasks",
      message: error.message,
    });
  }
};

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskCount,
  deleteAllDoneTasks,
};
