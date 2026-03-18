const express = require("express");
const router = express.Router();
const {
  getAllTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodoCount,
  deleteAllDoneTodos,
} = require("../controllers/todoController");

/**
 * @route   GET /api/todos
 * @desc    Get all todos sorted by priority
 * @access  Public
 */
router.get("/", getAllTodos);

/**
 * @route   GET /api/todos/count
 * @desc    Get count of todos
 * @access  Public
 */
router.get("/count", getTodoCount);

/**
 * @route   DELETE /api/todos/chron
 * @desc    Delete all done todos (for cron job cleanup)
 * @access  Public
 */
router.delete("/chron", deleteAllDoneTodos);

/**
 * @route   GET /api/todos/:id
 * @desc    Get a single todo by ID
 * @access  Public
 */
router.get("/:id", getTodoById);

/**
 * @route   POST /api/todos
 * @desc    Create a new todo
 * @access  Public
 * @body    { name: string, notes?: string, done?: boolean }
 */
router.post("/", createTodo);

/**
 * @route   PUT /api/todos/:id
 * @desc    Update a todo
 * @access  Public
 * @body    { name?: string, notes?: string, priority?: number, done?: boolean }
 */
router.put("/:id", updateTodo);

/**
 * @route   DELETE /api/todos/:id
 * @desc    Delete a todo and reorder priorities
 * @access  Public
 */
router.delete("/:id", deleteTodo);

module.exports = router;
