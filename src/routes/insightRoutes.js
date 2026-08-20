const express = require("express");
const router = express.Router();
const {
  getStats,
  getStatsSnapshot,
  getLatest,
  getHistory,
  generate,
} = require("../controllers/insightController");

/**
 * @openapi
 * /insights/stats:
 *   get:
 *     tags: [Insights]
 *     summary: Exact computed stats over the archive (no AI)
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 28
 *         description: How many days back to analyze
 *     responses:
 *       200:
 *         description: Habit rates, streaks, task slippage, reschedule counts
 */
router.get("/stats", getStats);

/**
 * @openapi
 * /insights/stats/latest:
 *   get:
 *     tags: [Insights]
 *     summary: The cron's nightly stats snapshot (no AI)
 *     description: >
 *       Same shape as /insights/stats plus `computedAt`, refreshed by every
 *       nightly cron run; it is the AI-free half of insights.
 *     responses:
 *       200:
 *         description: Stored habit rates, streaks, task slippage, reschedule counts
 *       404:
 *         description: The cron has not written a snapshot yet
 */
router.get("/stats/latest", getStatsSnapshot);

/**
 * @openapi
 * /insights/latest:
 *   get:
 *     tags: [Insights]
 *     summary: Most recent AI insight report
 *     responses:
 *       200:
 *         description: Latest stored report
 *       404:
 *         description: No report generated yet
 */
router.get("/latest", getLatest);

/**
 * @openapi
 * /insights/history:
 *   get:
 *     tags: [Insights]
 *     summary: Recent AI insight reports, newest first
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 14
 *     responses:
 *       200:
 *         description: Array of stored reports
 */
router.get("/history", getHistory);

/**
 * @openapi
 * /insights/generate:
 *   post:
 *     tags: [Insights]
 *     summary: Generate a fresh AI insight report now
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 description: Analysis window in days (default 28)
 *     responses:
 *       201:
 *         description: The generated report
 *       404:
 *         description: No archive data to analyze yet
 *       503:
 *         description: API key not configured
 */
router.post("/generate", generate);

module.exports = router;
