const Archive = require("../models/Archive");
const Insight = require("../models/Insight");
const InsightStats = require("../models/InsightStats");
const {
  computeStats,
  generateInsights,
  DEFAULT_PERIOD_DAYS,
} = require("../services/insightsService");

function parsePeriodDays(req) {
  const days = parseInt(req.query.days, 10);
  if (Number.isInteger(days) && days > 0 && days <= 365) return days;
  return DEFAULT_PERIOD_DAYS;
}

/**
 * GET /archive?days=28&type=habit_result
 * Raw archive events for the period, oldest first.
 */
const getArchive = async (req, res) => {
  try {
    const days = parsePeriodDays(req);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const events = await Archive.findByRange(from, to, req.query.type);
    res.json(events);
  } catch (error) {
    console.error("Error fetching archive:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch archive", message: error.message });
  }
};

/**
 * GET /insights/stats?days=28
 * Exact computed stats (no AI): habit rates, streaks, slippage, reschedules.
 */
const getStats = async (req, res) => {
  try {
    const days = parsePeriodDays(req);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const events = await Archive.findByRange(from, to);
    res.json({ periodDays: days, eventCount: events.length, ...computeStats(events) });
  } catch (error) {
    console.error("Error computing stats:", error);
    res
      .status(500)
      .json({ error: "Failed to compute stats", message: error.message });
  }
};

/**
 * GET /insights/stats/latest
 * The cron's nightly stats snapshot (no AI). Same shape as GET /insights/stats
 * plus `computedAt` — use it when you want the numbers the last cron run saw
 * rather than paying to recompute them.
 */
const getStatsSnapshot = async (req, res) => {
  try {
    const snapshot = await InsightStats.latest();
    if (!snapshot) {
      return res.status(404).json({
        error:
          "No stats snapshot yet — it is written by the nightly cron run",
      });
    }
    res.json({
      computedAt: snapshot.computedAt,
      periodDays: snapshot.periodDays,
      eventCount: snapshot.eventCount,
      ...snapshot.stats,
    });
  } catch (error) {
    console.error("Error fetching stats snapshot:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch stats snapshot", message: error.message });
  }
};

/**
 * GET /insights/latest
 * Most recent stored AI report.
 */
const getLatest = async (req, res) => {
  try {
    const latest = await Insight.latest();
    if (!latest) {
      return res.status(404).json({ error: "No insight report generated yet" });
    }
    res.json(latest);
  } catch (error) {
    console.error("Error fetching latest insight:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch insight", message: error.message });
  }
};

/**
 * GET /insights/history?limit=14
 * Recent stored reports, newest first.
 */
const getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10);
    const insights = await Insight.list(
      Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 14,
    );
    res.json(insights);
  } catch (error) {
    console.error("Error fetching insight history:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch history", message: error.message });
  }
};

/**
 * POST /insights/generate
 * Generate a fresh AI report on demand.
 */
const generate = async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res
        .status(503)
        .json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    }
    const days =
      req.body && Number.isInteger(req.body.days) && req.body.days > 0
        ? Math.min(req.body.days, 365)
        : DEFAULT_PERIOD_DAYS;
    const insight = await generateInsights({ periodDays: days });
    if (!insight) {
      return res.status(404).json({
        error:
          "No archive data to analyze yet — complete some tasks and let the nightly cron run first",
      });
    }
    res.status(201).json(insight);
  } catch (error) {
    console.error("Error generating insights:", error);
    res
      .status(500)
      .json({ error: "Failed to generate insights", message: error.message });
  }
};

module.exports = {
  getArchive,
  getStats,
  getStatsSnapshot,
  getLatest,
  getHistory,
  generate,
};
