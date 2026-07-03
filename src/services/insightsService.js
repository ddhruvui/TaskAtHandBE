const Archive = require("../models/Archive");
const Insight = require("../models/Insight");

const DEFAULT_PERIOD_DAYS = 28;

// ─── Stats (exact math, computed in JS — the model interprets, never counts) ──

/**
 * Compute per-habit and per-task statistics from archive events.
 * @param {Array} events  Archive events, oldest first
 * @returns {Object}
 */
function computeStats(events) {
  const habits = {};
  const recurringTasks = {};
  const completedTasks = [];
  const reschedulesByTask = {};
  const byHeader = {};

  const headerBucket = (name) => {
    const key = name || "(no header)";
    if (!byHeader[key]) {
      byHeader[key] = { completed: 0, missed: 0, reschedules: 0 };
    }
    return byHeader[key];
  };

  for (const e of events) {
    switch (e.type) {
      case "habit_result": {
        const key = e.taskId || e.taskName;
        if (!habits[key]) {
          habits[key] = {
            taskName: e.taskName,
            headerName: e.headerName,
            scheduledDays: e.scheduledDays,
            results: [], // { dueDate, completed } oldest first
          };
        }
        habits[key].taskName = e.taskName;
        habits[key].results.push({
          dueDate: e.dueDate,
          completed: e.completed,
        });
        const bucket = headerBucket(e.headerName);
        if (e.completed) bucket.completed++;
        else bucket.missed++;
        break;
      }
      case "task_result": {
        const key = e.taskId || e.taskName;
        if (!recurringTasks[key]) {
          recurringTasks[key] = {
            taskName: e.taskName,
            headerName: e.headerName,
            ecdType: e.ecdType,
            scheduled: 0,
            completed: 0,
          };
        }
        recurringTasks[key].scheduled++;
        if (e.completed) recurringTasks[key].completed++;
        const bucket = headerBucket(e.headerName);
        if (e.completed) bucket.completed++;
        else bucket.missed++;
        break;
      }
      case "task_completed": {
        let slippageDays = null;
        if (e.plannedFor && e.doneAt) {
          const planned = Date.parse(`${e.plannedFor}T00:00:00Z`);
          const done = Date.parse(e.doneAt);
          slippageDays = Math.round((done - planned) / 86400000);
        }
        completedTasks.push({
          taskName: e.taskName,
          headerName: e.headerName,
          plannedFor: e.plannedFor,
          doneAt: e.doneAt,
          slippageDays,
        });
        headerBucket(e.headerName).completed++;
        break;
      }
      case "task_rescheduled": {
        const key = e.taskId || e.taskName;
        if (!reschedulesByTask[key]) {
          reschedulesByTask[key] = {
            taskName: e.taskName,
            headerName: e.headerName,
            total: 0,
            pushedLater: 0,
          };
        }
        reschedulesByTask[key].taskName = e.taskName;
        reschedulesByTask[key].total++;
        if (e.pushedLater) reschedulesByTask[key].pushedLater++;
        headerBucket(e.headerName).reschedules++;
        break;
      }
    }
  }

  // Finalize habit metrics: rate, streaks, misses by weekday
  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const habitStats = Object.values(habits).map((h) => {
    const results = h.results.sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : 1,
    );
    const scheduled = results.length;
    const completed = results.filter((r) => r.completed).length;

    let currentStreak = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i].completed) break;
      currentStreak++;
    }
    let longestStreak = 0;
    let run = 0;
    for (const r of results) {
      run = r.completed ? run + 1 : 0;
      if (run > longestStreak) longestStreak = run;
    }

    const missedByDow = {};
    for (const r of results) {
      if (r.completed) continue;
      const dow = DOW_NAMES[new Date(`${r.dueDate}T00:00:00Z`).getUTCDay()];
      missedByDow[dow] = (missedByDow[dow] || 0) + 1;
    }

    return {
      taskName: h.taskName,
      headerName: h.headerName,
      scheduledDays: h.scheduledDays,
      scheduled,
      completed,
      completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
      currentStreak,
      longestStreak,
      missedByDow,
      recentResults: results.slice(-14),
    };
  });

  const slippages = completedTasks
    .map((t) => t.slippageDays)
    .filter((s) => s !== null);

  return {
    habits: habitStats,
    recurringTasks: Object.values(recurringTasks).map((t) => ({
      ...t,
      completionRate: t.scheduled
        ? Math.round((t.completed / t.scheduled) * 100)
        : 0,
    })),
    oneTimeTasks: {
      completedCount: completedTasks.length,
      avgSlippageDays: slippages.length
        ? Math.round(
            (slippages.reduce((a, b) => a + b, 0) / slippages.length) * 10,
          ) / 10
        : null,
      recent: completedTasks.slice(-20),
    },
    reschedules: Object.values(reschedulesByTask).sort(
      (a, b) => b.total - a.total,
    ),
    byHeader,
  };
}

// ─── AI report generation ─────────────────────────────────────────────────────

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "2-3 sentence overall assessment of the period, leading with the most important takeaway",
    },
    habitsOnTrack: {
      type: "array",
      items: { type: "string" },
      description: "Habits going well, each with the evidence (rate/streak)",
    },
    habitsSlipping: {
      type: "array",
      items: { type: "string" },
      description:
        "Habits being missed, each with the pattern (which days, trend)",
    },
    taskInsights: {
      type: "array",
      items: { type: "string" },
      description:
        "Observations about one-time and recurring tasks: slippage, neglected headers, wins",
    },
    procrastinationFlags: {
      type: "array",
      items: { type: "string" },
      description:
        "Tasks showing avoidance (repeated reschedules, chronic misses) and the likely cause",
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
      description:
        "2-4 specific, small, actionable changes for tomorrow/this week. Reference prior suggestions' outcomes when known.",
    },
  },
  required: [
    "summary",
    "habitsOnTrack",
    "habitsSlipping",
    "taskInsights",
    "procrastinationFlags",
    "suggestions",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a personal productivity coach analyzing task-completion data from the user's todo app (TaskAtHand).

Definitions:
- "Habits" are tasks scheduled on days of the week (day_of_week). They reset daily and their hit/miss history is the core signal.
- Everything else (one-time dated tasks, day_of_month, day_of_year) are "tasks".
- A reschedule that pushes a date later is a procrastination signal, especially when repeated on the same task.

Rules:
- All numbers you cite must come from the provided precomputed stats — never recount from raw events. Use raw events only for patterns and context.
- Be direct and specific: name the task, the day pattern, the number. No generic advice ("try to be more consistent") — every suggestion must name a concrete task and a concrete change.
- The user's goal is to stop procrastinating. Diagnose WHY a task is slipping (too big, wrong day, wrong header, competing habits) and prescribe the smallest change that would fix it.
- If a previous report is provided, follow up on its suggestions: acknowledge what improved, call out ignored suggestions (repeatedly ignored advice is itself an avoidance signal), and don't repeat advice verbatim.
- With sparse data (first days of tracking), say so honestly and limit conclusions to what the data supports.
- Keep every list item to one or two sentences.`;

/**
 * Generate and persist a daily insight report from the archive.
 * @param {Object} [options]
 * @param {number} [options.periodDays=28]  How far back to analyze
 * @returns {Promise<Object|null>} The stored insight, or null if there is no data
 */
async function generateInsights({ periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 86400000);
  const events = await Archive.findByRange(from, to);

  if (events.length === 0) {
    console.log("[Insights] No archive events yet — skipping generation");
    return null;
  }

  const stats = computeStats(events);
  const previous = await Insight.latest();

  // Cap raw events so the prompt stays small; stats carry the exact totals
  const recentEvents = events.slice(-300).map(({ _id, ...rest }) => rest);

  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          today: to.toISOString().slice(0, 10),
          periodDays,
          precomputedStats: stats,
          recentEvents,
          previousReport: previous
            ? {
                generatedAt: previous.generatedAt,
                report: previous.report,
              }
            : null,
        }),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error(`No text block in model response (stop_reason: ${response.stop_reason})`);
  }
  const report = JSON.parse(textBlock.text);

  const stored = await Insight.save({
    generatedAt: new Date(),
    periodDays,
    model: response.model,
    stats,
    report,
  });

  console.log("[Insights] Report generated and stored");
  return stored;
}

module.exports = { computeStats, generateInsights, DEFAULT_PERIOD_DAYS };
