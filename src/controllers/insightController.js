const Archive = require("../models/Archive");
const { ArchiveSummary } = require("../models/ArchiveSummary");
const Insight = require("../models/Insight");
const InsightStats = require("../models/InsightStats");
const {
  computeStats,
  generateInsights,
  DEFAULT_PERIOD_DAYS,
} = require("../services/insightsService");
const { daysAgo } = require("../utils/dates");
const { route, requireFound } = require("../utils/http");

/** The `?days=` window, clamped to something sane. */
function parsePeriodDays(req) {
  const days = parseInt(req.query.days, 10);
  if (Number.isInteger(days) && days > 0 && days <= 365) return days;
  return DEFAULT_PERIOD_DAYS;
}

/**
 * The archive events for the requested window, with the window itself — both
 * archive reads need the same three lines of date arithmetic.
 * @returns {Promise<{days: number, events: Array}>}
 */
async function readPeriod(req, type) {
  const days = parsePeriodDays(req);
  const to = new Date();
  const events = await Archive.findByRange(daysAgo(to, days), to, type);
  return { days, events };
}

/**
 * GET /archive?days=28&type=habit_result
 * Raw archive events for the period, oldest first.
 */
const getArchive = route(
  { action: "fetching archive", failure: "Failed to fetch archive" },
  async (req, res) => {
    const { events } = await readPeriod(req, req.query.type);
    res.json(events);
  },
);

/**
 * GET /archive/summary
 * The permanent monthly roll-ups, oldest month first. Cron step 10 writes
 * these as raw events age out of the retention window, so this is the only
 * place history older than `ARCHIVE_RETENTION_DAYS` still exists.
 */
const getArchiveSummary = route(
  {
    action: "fetching archive summary",
    failure: "Failed to fetch archive summary",
  },
  async (req, res) => {
    res.json(await ArchiveSummary.findAll());
  },
);

/**
 * GET /insights/stats?days=28
 * Exact computed stats (no AI): habit rates, streaks, slippage, reschedules.
 */
const getStats = route(
  { action: "computing stats", failure: "Failed to compute stats" },
  async (req, res) => {
    const { days, events } = await readPeriod(req);
    res.json({
      periodDays: days,
      eventCount: events.length,
      ...computeStats(events),
    });
  },
);

/**
 * GET /insights/stats/latest
 * The cron's nightly stats snapshot (no AI). Same shape as GET /insights/stats
 * plus `computedAt` — use it when you want the numbers the last cron run saw
 * rather than paying to recompute them.
 */
const getStatsSnapshot = route(
  {
    action: "fetching stats snapshot",
    failure: "Failed to fetch stats snapshot",
  },
  async (req, res) => {
    const snapshot = requireFound(
      await InsightStats.latest(),
      "No stats snapshot yet — it is written by the nightly cron run",
    );
    res.json({
      computedAt: snapshot.computedAt,
      periodDays: snapshot.periodDays,
      eventCount: snapshot.eventCount,
      ...snapshot.stats,
    });
  },
);

/**
 * GET /insights/latest
 * Most recent stored AI report.
 */
const getLatest = route(
  { action: "fetching latest insight", failure: "Failed to fetch insight" },
  async (req, res) => {
    const latest = await Insight.latest();
    res.json(requireFound(latest, "No insight report generated yet"));
  },
);

/**
 * GET /insights/history?limit=14
 * Recent stored reports, newest first.
 */
const getHistory = route(
  { action: "fetching insight history", failure: "Failed to fetch history" },
  async (req, res) => {
    const limit = parseInt(req.query.limit, 10);
    const insights = await Insight.list(
      Number.isInteger(limit) && limit > 0 && limit <= Insight.MAX_HISTORY
        ? limit
        : 14,
    );
    res.json(insights);
  },
);

/**
 * POST /insights/generate
 * Generate a fresh AI report on demand.
 */
const generate = route(
  { action: "generating insights", failure: "Failed to generate insights" },
  async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(503)
        .json({ error: "GEMINI_API_KEY is not configured on the server" });
    }
    const days =
      req.body && Number.isInteger(req.body.days) && req.body.days > 0
        ? Math.min(req.body.days, 365)
        : DEFAULT_PERIOD_DAYS;

    const insight = requireFound(
      await generateInsights({ periodDays: days }),
      "No archive data to analyze yet — complete some tasks and let the nightly cron run first",
    );
    res.status(201).json(insight);
  },
);

module.exports = {
  getArchive,
  getArchiveSummary,
  getStats,
  getStatsSnapshot,
  getLatest,
  getHistory,
  generate,
};
