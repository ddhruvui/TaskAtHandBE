const Todo = require("../models/Todo");

/**
 * Get all todos
 * @route GET /api/todos
 */
const getAllTodos = async (req, res) => {
  try {
    const todos = await Todo.findAll();
    res.json({
      success: true,
      count: todos.length,
      data: todos,
    });
  } catch (error) {
    console.error("Error fetching todos:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch todos",
      message: error.message,
    });
  }
};

/**
 * Get a single todo by ID
 * @route GET /api/todos/:id
 */
const getTodoById = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        error: "Todo not found",
      });
    }

    res.json({
      success: true,
      data: todo,
    });
  } catch (error) {
    console.error("Error fetching todo:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch todo",
      message: error.message,
    });
  }
};

/**
 * Create a new todo
 * @route POST /api/todos
 */
const createTodo = async (req, res) => {
  try {
    const { name, notes, done, ecd } = req.body;

    // Validation for name - must be a non-empty string
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Todo name must be a non-empty string",
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

    const todoData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecd: ecd || null,
    };

    const newTodo = await Todo.create(todoData);

    res.status(201).json({
      success: true,
      data: newTodo,
      message: "Todo created successfully",
    });
  } catch (error) {
    console.error("Error creating todo:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create todo",
      message: error.message,
    });
  }
};

/**
 * Update a todo
 * @route PUT /api/todos/:id
 */
const updateTodo = async (req, res) => {
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

    const updatedTodo = await Todo.update(req.params.id, updateData);

    if (!updatedTodo) {
      return res.status(404).json({
        success: false,
        error: "Todo not found",
      });
    }

    res.json({
      success: true,
      data: updatedTodo,
      message: "Todo updated successfully",
    });
  } catch (error) {
    console.error("Error updating todo:", error);

    // Handle specific errors
    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (
      error.message.includes("Not done task cannot have priority") ||
      error.message.includes("Done task cannot have priority less than")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update todo",
      message: error.message,
    });
  }
};

/**
 * Delete a todo
 * @route DELETE /api/todos/:id
 */
const deleteTodo = async (req, res) => {
  try {
    const success = await Todo.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Todo not found",
      });
    }

    res.json({
      success: true,
      message: "Todo deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting todo:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete todo",
      message: error.message,
    });
  }
};

/**
 * Get todo count
 * @route GET /api/todos/count
 */
const getTodoCount = async (req, res) => {
  try {
    const count = await Todo.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting todo count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get todo count",
      message: error.message,
    });
  }
};

/**
 * Delete all done todos (for cron job)
 * @route DELETE /api/todos/chron
 */
const deleteAllDoneTodos = async (req, res) => {
  try {
    const result = await Todo.deleteAllDone();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      movedCount: result.movedCount,
      message: `Successfully deleted ${result.deletedCount} done todo(s) and moved ${result.movedCount} overdue todo(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error deleting done todos:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete done todos",
      message: error.message,
    });
  }
};

module.exports = {
  getAllTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodoCount,
  deleteAllDoneTodos,
};
