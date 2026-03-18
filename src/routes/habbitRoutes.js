const express = require("express");
const router = express.Router();
const {
  getAllHabbits,
  getHabbitById,
  createHabbit,
  updateHabbit,
  deleteHabbit,
  getHabbitCount,
  deleteAllDoneHabbits,
} = require("../controllers/habbitController");

/**
 * @route   GET /api/habbits
 * @desc    Get all habbits sorted by priority
 * @access  Public
 */
router.get("/", getAllHabbits);

/**
 * @route   GET /api/habbits/count
 * @desc    Get count of habbits
 * @access  Public
 */
router.get("/count", getHabbitCount);

/**
 * @route   DELETE /api/habbits/chron
 * @desc    Delete all done habbits (for cron job cleanup)
 * @access  Public
 */
router.delete("/chron", deleteAllDoneHabbits);

/**
 * @route   GET /api/habbits/:id
 * @desc    Get a single habbit by ID
 * @access  Public
 */
router.get("/:id", getHabbitById);

/**
 * @route   POST /api/habbits
 * @desc    Create a new habbit
 * @access  Public
 * @body    { name: string, notes?: string, done?: boolean }
 */
router.post("/", createHabbit);

/**
 * @route   PUT /api/habbits/:id
 * @desc    Update a habbit
 * @access  Public
 * @body    { name?: string, notes?: string, priority?: number, done?: boolean }
 */
router.put("/:id", updateHabbit);

/**
 * @route   DELETE /api/habbits/:id
 * @desc    Delete a habbit and reorder priorities
 * @access  Public
 */
router.delete("/:id", deleteHabbit);

module.exports = router;
