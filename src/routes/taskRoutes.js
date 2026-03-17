const express = require("express");
const router = express.Router();
const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskCount,
} = require("../controllers/taskController");

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks sorted by priority
 * @access  Public
 */
router.get("/", getAllTasks);

/**
 * @route   GET /api/tasks/count
 * @desc    Get count of tasks
 * @access  Public
 */
router.get("/count", getTaskCount);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get a single task by ID
 * @access  Public
 */
router.get("/:id", getTaskById);

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Public
 * @body    { name: string, notes?: string, done?: boolean }
 */
router.post("/", createTask);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update a task
 * @access  Public
 * @body    { name?: string, notes?: string, priority?: number, done?: boolean }
 */
router.put("/:id", updateTask);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete a task and reorder priorities
 * @access  Public
 */
router.delete("/:id", deleteTask);

module.exports = router;
