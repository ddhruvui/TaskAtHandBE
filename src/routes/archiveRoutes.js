const express = require("express");
const router = express.Router();
const { getArchive } = require("../controllers/insightController");

/**
 * @openapi
 * /archive:
 *   get:
 *     tags: [Archive]
 *     summary: Raw task-history events (habit results, completions, reschedules)
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 28
 *         description: How many days back to fetch
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [habit_result, task_result, task_completed, task_rescheduled]
 *         description: Optional event type filter
 *     responses:
 *       200:
 *         description: Array of archive events, oldest first
 */
router.get("/", getArchive);

module.exports = router;
