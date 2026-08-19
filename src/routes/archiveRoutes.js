const express = require("express");
const router = express.Router();
const {
  getArchive,
  getArchiveSummary,
} = require("../controllers/insightController");

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
 *           enum: [habit_result, task_result, task_completed, task_rescheduled, task_deleted, call_result]
 *         description: Optional event type filter
 *     responses:
 *       200:
 *         description: Array of archive events, oldest first
 */
router.get("/", getArchive);

/**
 * @openapi
 * /archive/summary:
 *   get:
 *     tags: [Archive]
 *     summary: Permanent monthly roll-ups of task history
 *     description: >
 *       One document per calendar month, oldest first. Cron step 10 folds raw
 *       events into these as they age past `ARCHIVE_RETENTION_DAYS` (default
 *       30 days) and then deletes them, so this is the only place history
 *       older than the retention window still exists. Per-day detail is not
 *       recoverable from it — only monthly totals.
 *     responses:
 *       200:
 *         description: Array of monthly summaries, oldest month first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ArchiveSummary'
 */
router.get("/summary", getArchiveSummary);

module.exports = router;
