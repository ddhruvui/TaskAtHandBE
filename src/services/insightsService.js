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
  const deletedTasks = [];
  const byHeader = {};
  const callsByPerson = {};

  const headerBucket = (name) => {
    const key = name || "(no header)";
    if (!byHeader[key]) {
      byHeader[key] = { completed: 0, missed: 0, reschedules: 0, deleted: 0 };
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
      case "call_result": {
        const key = e.callId || e.callName;
        if (!callsByPerson[key]) {
          callsByPerson[key] = {
            callName: e.callName,
            frequency: e.frequency,
            results: [], // { dueDate, completed } oldest first
          };
        }
        callsByPerson[key].callName = e.callName;
        callsByPerson[key].frequency = e.frequency;
        callsByPerson[key].results.push({
          dueDate: e.dueDate,
          completed: e.completed,
        });
        // Calls have no header — deliberately not counted in byHeader
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
            // Postpones split by whether the user justified them: no-reason
            // pushes are unexcused procrastination, reasons are for the AI to judge.
            pushedLaterWithReason: 0,
            pushedLaterNoReason: 0,
            reasons: [],
          };
        }
        const bucket = reschedulesByTask[key];
        bucket.taskName = e.taskName;
        bucket.total++;
        if (e.pushedLater) {
          bucket.pushedLater++;
          if (e.reason) {
            bucket.pushedLaterWithReason++;
            bucket.reasons.push(e.reason);
          } else {
            bucket.pushedLaterNoReason++;
          }
        }
        headerBucket(e.headerName).reschedules++;
        break;
      }
      case "task_deleted": {
        deletedTasks.push({
          taskName: e.taskName,
          headerName: e.headerName || null,
          ecdType: e.ecdType || null,
          reason: e.reason || null,
        });
        headerBucket(e.headerName).deleted++;
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

  // Finalize call metrics: rate and current miss streak per person
  const callStats = Object.values(callsByPerson).map((c) => {
    const results = c.results.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const scheduled = results.length;
    const completed = results.filter((r) => r.completed).length;

    let currentMissStreak = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].completed) break;
      currentMissStreak++;
    }

    return {
      callName: c.callName,
      frequency: c.frequency,
      scheduled,
      completed,
      completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
      currentMissStreak,
      recentResults: results.slice(-8),
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
    deletions: {
      count: deletedTasks.length,
      withReason: deletedTasks.filter((d) => d.reason).length,
      recent: deletedTasks.slice(-20),
    },
    byHeader,
    calls: callStats,
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
        "Tasks showing avoidance (repeated reschedules, chronic misses) and the likely cause. Weigh postpone reasons: a pushed-later reschedule with no stated reason is procrastination, while a genuinely valid reason (blocked/dependency, illness, a real emergency) is a legitimate deferral — don't flag it.",
    },
    deletionInsights: {
      type: "array",
      items: { type: "string" },
      description:
        "Patterns among tasks the user manually deleted while still undone, read through their stated reasons: recurring abandonment, over-committing, scope-cutting, or headers where tasks are frequently dropped. Distinguish healthy pruning (genuinely no longer needed) from avoidance (too big, ran out of time, kept putting off). Empty array if no tasks were deleted this period.",
    },
    callReminders: {
      type: "array",
      items: { type: "string" },
      description:
        "People the user should call: not yet called this period (with how soon the period resets), repeat-miss patterns across periods, and brief acknowledgment of consistent callers. Empty array if the user has no calls set up.",
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
    "deletionInsights",
    "callReminders",
    "suggestions",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a personal productivity coach analyzing task-completion data from the user's todo app (TaskAtHand).

Definitions:
- "Habits" are tasks scheduled on days of the week (day_of_week). They reset daily and their hit/miss history is the core signal.
- Everything else (one-time dated tasks, day_of_month, day_of_year) are "tasks".
- "Calls" are people the user must phone on a cadence: "biweekly" means twice a month (periods 1st–14th and 15th–month-end), "monthly" means once a month. The called checkmark resets at each period boundary; a call_result with completed=false means that person was NOT called that period. currentCalls shows the live status for the current period.
- A reschedule that pushes a date later (a "postpone") is a procrastination signal, especially when repeated on the same task. When the user postpones they may attach a reason: for each rescheduled task, precomputedStats.reschedules gives pushedLater, pushedLaterNoReason, pushedLaterWithReason and the stated reasons[]. A pushed-later reschedule with NO reason is procrastination for sure. One WITH a reason must be judged: accept genuinely valid causes (blocked by a dependency, illness, a real higher-priority emergency, plans changed for a legitimate reason) as legitimate deferrals and do NOT flag them; treat weak excuses ("didn't feel like it", "too big", "ran out of time", "kept putting it off") as avoidance, same as an unexcused postpone.
- A "deletion" (task_deleted event) is a task the user removed *while it was still not done*, each carrying the user's stated reason. It represents an abandoned intention, not a completed one — treat the reason as the primary signal for WHY it was dropped. precomputedStats.deletions has the counts; the reasons live on the raw task_deleted events and byHeader.deleted counts them per header.

Rules:
- All numbers you cite must come from the provided precomputed stats — never recount from raw events. Use raw events only for patterns and context.
- Be direct and specific: name the task, the day pattern, the number. No generic advice ("try to be more consistent") — every suggestion must name a concrete task and a concrete change.
- The user's goal is to stop procrastinating. Diagnose WHY a task is slipping (too big, wrong day, wrong header, competing habits) and prescribe the smallest change that would fix it.
- For deletions: read each reason and separate healthy pruning ("no longer needed", "duplicate", priorities genuinely changed) from avoidance ("too big", "ran out of time", "kept putting it off"). Name the task and quote/paraphrase its reason. Flag repeat abandonment of the same intention or a header where tasks are frequently dropped. If there were no deletions, return an empty deletionInsights array.
- For postpones (pushed-later reschedules): call out tasks with pushedLaterNoReason > 0 as unexcused procrastination by name and count. For pushedLaterWithReason, quote/paraphrase the stated reason and say whether you accept it as valid (and therefore don't count it against the user) or read it as an excuse. Repeated no-reason postpones of the same task are a strong avoidance signal.
- If a previous report is provided, follow up on its suggestions: acknowledge what improved, call out ignored suggestions (repeatedly ignored advice is itself an avoidance signal), and don't repeat advice verbatim.
- With sparse data (first days of tracking), say so honestly and limit conclusions to what the data supports.
- For calls: flag people not yet called as their period end approaches (biweekly periods end on the 14th and the last day of the month; monthly on the last day), and call out repeat misses across periods by name. If there are no calls set up, return an empty callReminders array.
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

  // Live call status for the current period (archive only has past boundaries)
  const Call = require("../models/Call");
  const currentCalls = (await Call.findAll()).map((c) => ({
    name: c.name,
    frequency: c.frequency,
    done: c.done,
    doneAt: c.doneAt,
  }));

  // Cap raw events so the prompt stays small; stats carry the exact totals
  const recentEvents = events.slice(-300).map(({ _id, ...rest }) => rest);

  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
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
          currentCalls,
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
