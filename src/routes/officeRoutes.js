const express = require("express");
const router = express.Router();
const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskCount,
  deleteAllDoneTasks,
} = require("../controllers/officeController");

/**
 * @route   GET /api/office
 * @desc    Get all tasks sorted by priority
 * @access  Public
 */
router.get("/", getAllTasks);

/**
 * @route   GET /api/office/count
 * @desc    Get count of tasks
 * @access  Public
 */
router.get("/count", getTaskCount);

/**
 * @route   DELETE /api/office/chron
 * @desc    Delete all done tasks (for cron job cleanup)
 * @access  Public
 */
router.delete("/chron", deleteAllDoneTasks);

/**
 * @route   GET /api/office/:id
 * @desc    Get a single task by ID
 * @access  Public
 */
router.get("/:id", getTaskById);

/**
 * @route   POST /api/office
 * @desc    Create a new task
 * @access  Public
 * @body    { name: string, notes?: string, done?: boolean }
 */
router.post("/", createTask);

/**
 * @route   PUT /api/office/:id
 * @desc    Update a task
 * @access  Public
 * @body    { name?: string, notes?: string, priority?: number, done?: boolean }
 */
router.put("/:id", updateTask);

/**
 * @route   DELETE /api/office/:id
 * @desc    Delete a task and reorder priorities
 * @access  Public
 */
router.delete("/:id", deleteTask);

module.exports = router;
