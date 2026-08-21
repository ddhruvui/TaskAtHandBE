const Archive = require("../models/Archive");
const Insight = require("../models/Insight");
const InsightStats = require("../models/InsightStats");
const {
  DOW_NAMES,
  utcDayStart,
  daysBetween,
  daysAgo,
} = require("../utils/dates");
const {
  bucket,
  byDueDate,
  completionRate,
  trailingStreak,
  longestRun,
  average,
  countWhere,
} = require("../utils/stats");
const {
  isVacationDay,
  isPausedResult,
  isVacationEvent,
  isCallPeriodExempt,
  adjustedSlippage,
  activeVacation,
  statsCutoff,
  recentlyEnded,
  vacationDaysBetween,
  vacationLength,
  eventDay,
} = require("../utils/vacation");

const DEFAULT_PERIOD_DAYS = 28;

/**
 * The Gemini model the daily report is written by.
 *
 * **Flash, not Pro, and that is not a preference.** Verified against a live
 * free-tier key on 2026-08-19: `gemini-2.5-pro` 404s ("no longer available to
 * new users") and `gemini-3.1-pro-preview` 429s on the first request — Pro
 * carries no free-tier quota. Flash answers, and honours the JSON schema.
 *
 * A daily call is a rounding error against any tier's limits, so the moment
 * billing is enabled this becomes a one-line switch:
 * `GEMINI_MODEL=gemini-3.1-pro-preview`. Read per call, not at require time,
 * so a restart is enough — no deploy.
 */
const DEFAULT_INSIGHT_MODEL = "gemini-3.7-flash";

function insightModel() {
  return process.env.GEMINI_MODEL || DEFAULT_INSIGHT_MODEL;
}

// ─── Stats (exact math, computed in JS — the model interprets, never counts) ──

/**
 * Compute per-habit and per-task statistics from archive events.
 *
 * Vacation ranges change how days are *read*, never what was recorded. The one
 * rule that drives most of it: a scheduled day that passed inside a vacation
 * and was not done is **paused** — neither a hit nor a miss. It drops out of
 * the completion-rate denominator, out of `missedByDow`, out of the per-header
 * miss count. It does still break a streak, because the user asked for the
 * streak to restart when they get back rather than span the gap.
 *
 * A day inside a vacation that the user *did* tick off is an ordinary win: it
 * counts, and it keeps the run alive. The asymmetry is deliberate — vacation
 * removes the penalty, never the credit.
 *
 * Pure: no database access, so the arithmetic stays unit-testable.
 *
 * @param {Array} events  Archive events, oldest first
 * @param {Object} [options]
 * @param {Array} [options.vacations]  Stored ranges; omitted means "no vacations"
 * @returns {Object}
 */
function computeStats(events, { vacations = [] } = {}) {
  const habits = {};
  const recurringTasks = {};
  const completedTasks = [];
  const reschedulesByTask = {};
  const deletedTasks = [];
  const byHeader = {};
  const callsByPerson = {};

  const headerBucket = (name) =>
    bucket(byHeader, name || "(no header)", () => ({
      completed: 0,
      missed: 0,
      paused: 0,
      reschedules: 0,
      deleted: 0,
    }));

  for (const e of events) {
    switch (e.type) {
      case "habit_result": {
        const habit = bucket(habits, e.taskId || e.taskName, () => ({
          taskName: e.taskName,
          headerName: e.headerName,
          scheduledDays: e.scheduledDays,
          results: [], // { dueDate, completed, vacation } oldest first
        }));
        habit.taskName = e.taskName;
        habit.results.push({
          dueDate: e.dueDate,
          completed: e.completed,
          vacation: isVacationDay(e.dueDate, vacations),
        });
        const header = headerBucket(e.headerName);
        if (e.completed) header.completed++;
        else if (isPausedResult(e, vacations)) header.paused++;
        else header.missed++;
        break;
      }
      case "task_result": {
        const recurring = bucket(
          recurringTasks,
          e.taskId || e.taskName,
          () => ({
            taskName: e.taskName,
            headerName: e.headerName,
            ecdType: e.ecdType,
            scheduled: 0,
            completed: 0,
            paused: 0,
          }),
        );
        const paused = isPausedResult(e, vacations);
        // A paused cycle never reached the user, so it is not something they
        // were scheduled to do — it leaves the denominator entirely.
        if (paused) recurring.paused++;
        else recurring.scheduled++;
        if (e.completed) recurring.completed++;
        const header = headerBucket(e.headerName);
        if (e.completed) header.completed++;
        else if (paused) header.paused++;
        else header.missed++;
        break;
      }
      case "task_completed": {
        // Slip is measured in whole calendar days between the date the task
        // was scheduled for (plannedFor — the postponed-to ECD when the user
        // rescheduled it) and the day it was actually done. Done on the
        // scheduled day = 0, whatever time of day it was ticked off; done
        // ahead of it is negative.
        const slippageDays =
          e.plannedFor && e.doneAt
            ? daysBetween(`${e.plannedFor}T00:00:00Z`, e.doneAt)
            : null;
        // ...and then the days the user was away come back out of it, so a
        // task that outlived a holiday is only as late as the days it was
        // actually actionable. This is the number every on-time count uses.
        const adjustedSlippageDays = adjustedSlippage(
          e.plannedFor,
          e.doneAt ? new Date(e.doneAt).toISOString().slice(0, 10) : null,
          slippageDays,
          vacations,
        );
        completedTasks.push({
          taskName: e.taskName,
          headerName: e.headerName,
          plannedFor: e.plannedFor,
          doneAt: e.doneAt,
          slippageDays,
          adjustedSlippageDays,
          // Finishing early or on the day counts as a win, not as slip — only
          // a task that outlived its planned date is late.
          onTime:
            adjustedSlippageDays === null ? null : adjustedSlippageDays <= 0,
        });
        headerBucket(e.headerName).completed++;
        break;
      }
      case "call_result": {
        const person = bucket(callsByPerson, e.callId || e.callName, () => ({
          callName: e.callName,
          frequency: e.frequency,
          results: [], // { dueDate, completed, exempt } oldest first
        }));
        person.callName = e.callName;
        person.frequency = e.frequency;
        person.results.push({
          dueDate: e.dueDate,
          completed: e.completed,
          // Calls are the one signal measured over a period, not a day: a
          // short trip must not excuse a whole fortnight of not ringing
          // someone, so only a near-total overlap forgives the period.
          exempt:
            !e.completed &&
            isCallPeriodExempt(e.dueDate, e.frequency, vacations),
        });
        // Calls have no header — deliberately not counted in byHeader
        break;
      }
      case "task_rescheduled": {
        const rescheduled = bucket(
          reschedulesByTask,
          e.taskId || e.taskName,
          () => ({
            taskName: e.taskName,
            headerName: e.headerName,
            total: 0,
            pushedLater: 0,
            // Postpones split by whether the user justified them: no-reason
            // pushes are unexcused procrastination, reasons are for the AI to judge.
            pushedLaterWithReason: 0,
            pushedLaterNoReason: 0,
            // ...and a third bucket that is neither: moves made because of a
            // vacation. Counted separately so they never reach the AI as
            // avoidance, which is the whole point of the Vacation panel's
            // re-date flow.
            vacationMoves: 0,
            reasons: [],
          }),
        );
        rescheduled.taskName = e.taskName;
        rescheduled.total++;
        if (e.pushedLater) {
          rescheduled.pushedLater++;
          if (isVacationEvent(e, vacations)) {
            rescheduled.vacationMoves++;
          } else if (e.reason) {
            rescheduled.pushedLaterWithReason++;
            rescheduled.reasons.push(e.reason);
          } else {
            rescheduled.pushedLaterNoReason++;
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
          // Still counted — dropping an intention is a real event — but
          // labelled, so the coach does not read a holiday clear-out as
          // avoidance.
          duringVacation: isVacationEvent(e, vacations),
        });
        headerBucket(e.headerName).deleted++;
        break;
      }
    }
  }

  // Finalize habit metrics: rate, streaks, misses by weekday
  const wasCompleted = (result) => result.completed;
  const wasPaused = (result) => result.vacation && !result.completed;
  const habitStats = Object.values(habits).map((h) => {
    const results = h.results.sort(byDueDate);
    const pausedDays = countWhere(results, wasPaused);
    const scheduled = results.length - pausedDays;
    const completed = countWhere(results, wasCompleted);

    const missedByDow = {};
    for (const r of results) {
      if (r.completed || wasPaused(r)) continue;
      const dow = DOW_NAMES[new Date(`${r.dueDate}T00:00:00Z`).getUTCDay()];
      missedByDow[dow] = (missedByDow[dow] || 0) + 1;
    }

    return {
      taskName: h.taskName,
      headerName: h.headerName,
      scheduledDays: h.scheduledDays,
      scheduled,
      completed,
      pausedDays,
      completionRate: completionRate(completed, scheduled),
      // A paused day is not `completed`, so both runs terminate on it without
      // any extra handling — which is exactly the requested behaviour: the
      // streak restarts on return rather than spanning the trip.
      currentStreak: trailingStreak(results, wasCompleted),
      longestStreak: longestRun(results, wasCompleted),
      missedByDow,
      recentResults: results.slice(-14),
    };
  });

  // Finalize call metrics: rate and current miss streak per person
  const callStats = Object.values(callsByPerson).map((c) => {
    const results = c.results.sort(byDueDate);
    const exemptPeriods = countWhere(results, (r) => r.exempt);
    const scheduled = results.length - exemptPeriods;
    const completed = countWhere(results, wasCompleted);

    return {
      callName: c.callName,
      frequency: c.frequency,
      scheduled,
      completed,
      exemptPeriods,
      completionRate: completionRate(completed, scheduled),
      // An exempt period neither continues a miss streak nor counts as one.
      currentMissStreak: trailingStreak(
        results,
        (r) => !r.completed && !r.exempt,
      ),
      recentResults: results.slice(-8),
    };
  });

  // The average measures lateness only: an early finish scores 0 like an
  // on-time one, so a task done three days early can no longer cancel out a
  // task done three days late and report the pair as "no slip".
  const slippages = completedTasks
    .map((t) => t.adjustedSlippageDays)
    .filter((s) => s !== null);
  const lateness = slippages.map((s) => Math.max(0, s));

  return {
    habits: habitStats,
    recurringTasks: Object.values(recurringTasks).map((t) => ({
      ...t,
      completionRate: completionRate(t.completed, t.scheduled),
    })),
    oneTimeTasks: {
      completedCount: completedTasks.length,
      onTimeCount: countWhere(completedTasks, (t) => t.onTime === true),
      lateCount: countWhere(completedTasks, (t) => t.onTime === false),
      avgSlippageDays: average(lateness),
      recent: completedTasks.slice(-20),
    },
    reschedules: Object.values(reschedulesByTask).sort(
      (a, b) => b.total - a.total,
    ),
    deletions: {
      count: deletedTasks.length,
      withReason: countWhere(deletedTasks, (d) => d.reason),
      duringVacation: countWhere(deletedTasks, (d) => d.duringVacation),
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
        "Observations about one-time and recurring tasks: slippage, neglected headers, wins. Tasks finished on or before their planned date are wins, never slippage.",
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
- A one-time task finished **on or before** the date it was planned for is ON TIME — a success. precomputedStats.oneTimeTasks gives onTimeCount, lateCount and avgSlippageDays (days late, where early and on-the-day completions count as 0), and each entry in .recent carries slippageDays (negative = finished early) plus onTime. Only slippageDays > 0 is slippage: never describe a 0 or negative slippageDays as a slip, a delay or a problem, and don't ask the user to fix it. Credit early and on-the-day completions where the data shows them.
- "Calls" are people the user must phone on a cadence: "biweekly" means twice a month (periods 1st–14th and 15th–month-end), "monthly" means once a month. The called checkmark resets at each period boundary; a call_result with completed=false means that person was NOT called that period. currentCalls shows the live status for the current period.
- A reschedule that pushes a date later (a "postpone") is a procrastination signal, especially when repeated on the same task. When the user postpones they may attach a reason: for each rescheduled task, precomputedStats.reschedules gives pushedLater, pushedLaterNoReason, pushedLaterWithReason and the stated reasons[]. A pushed-later reschedule with NO reason is procrastination for sure. One WITH a reason must be judged: accept genuinely valid causes (blocked by a dependency, illness, a real higher-priority emergency, plans changed for a legitimate reason) as legitimate deferrals and do NOT flag them; treat weak excuses ("didn't feel like it", "too big", "ran out of time", "kept putting it off") as avoidance, same as an unexcused postpone.
- A "vacation" is a period the user booked off, inclusive of both its first and last day. Vacation changes how days are READ, not what happened. precomputedStats.vacation gives the current status and how many vacation days fall inside the window; individual entries carry their own markers (habit recentResults[].vacation, calls recentResults[].exempt, reschedules vacationMoves, deletions duringVacation).
- A "deletion" (task_deleted event) is a task the user removed *while it was still not done*, each carrying the user's stated reason. It represents an abandoned intention, not a completed one — treat the reason as the primary signal for WHY it was dropped. precomputedStats.deletions has the counts; the reasons live on the raw task_deleted events and byHeader.deleted counts them per header.

Rules:
- All numbers you cite must come from the provided precomputed stats — never recount from raw events. Use raw events only for patterns and context.
- Be direct and specific: name the task, the day pattern, the number. No generic advice ("try to be more consistent") — every suggestion must name a concrete task and a concrete change.
- The user's goal is to stop procrastinating. Diagnose WHY a task is slipping (too big, wrong day, wrong header, competing habits) and prescribe the smallest change that would fix it.
- For deletions: read each reason and separate healthy pruning ("no longer needed", "duplicate", priorities genuinely changed) from avoidance ("too big", "ran out of time", "kept putting it off"). Name the task and quote/paraphrase its reason. Flag repeat abandonment of the same intention or a header where tasks are frequently dropped. If there were no deletions, return an empty deletionInsights array.
- For postpones (pushed-later reschedules): call out tasks with pushedLaterNoReason > 0 as unexcused procrastination by name and count. vacationMoves are excluded from both reason buckets and must never be treated as postponement. For pushedLaterWithReason, quote/paraphrase the stated reason and say whether you accept it as valid (and therefore don't count it against the user) or read it as an excuse. Repeated no-reason postpones of the same task are a strong avoidance signal.
- This report is generated **daily**, so the previous report (when present) is usually about a day old and its suggestions have had roughly one day to land. Judge them on that horizon: one day is enough to see whether a specific task got done, not enough to call a habit fixed or a pattern broken.
- The analysis window is much longer than the gap between reports, so consecutive reports see nearly the same data. Lead with what actually CHANGED since the previous report — a habit completed or missed yesterday, a task finished or postponed — rather than restating standing totals. If nothing meaningful changed, say so plainly in one line instead of padding.
- If a previous report is provided, follow up on its suggestions: acknowledge what improved, call out ignored suggestions (advice ignored day after day is itself an avoidance signal), and don't repeat advice verbatim.
- With sparse data (first days of tracking), say so honestly and limit conclusions to what the data supports.
- For calls: flag people not yet called as their period end approaches (biweekly periods end on the 14th and the last day of the month; monthly on the last day), and call out repeat misses across periods by name. If there are no calls set up, return an empty callReminders array.

Vacation rules (these override the procrastination rules above):
- NEVER describe anything that happened on a vacation day as procrastination, avoidance, slipping, a miss, or a lapse. The user booked that time off; not working was the plan.
- A habit's paused days are already out of its completion rate and out of missedByDow, and its slippage figures are already vacation-adjusted. Cite the numbers as given — do not "correct" them back, and do not editorialise about the gap.
- A habit's streak restarts after a break by design. Say so neutrally if you mention it ("the streak restarted after your break"), never as a setback or something to feel bad about.
- reschedules.vacationMoves are tasks moved out of a booked trip. They are planning, not postponement — never count them against the user and never include them in procrastinationFlags.
- deletions marked duringVacation may be mentioned, but never read as avoidance.
- calls with exemptPeriods had a period almost entirely swallowed by a trip; those periods do not count as misses. Periods only partly covered DO still count — a short trip is not a reason to skip ringing someone.
- When precomputedStats.vacation.justReturnedFrom is present, the user has just come back from a break of that many days. Open by acknowledging it in one short sentence, then give a RESTART plan: pick the one or two things most worth resuming first and say how to restart them small. Do NOT inventory everything that lapsed, do not judge the break, and do not evaluate whether the previous report's suggestions were followed — they were given before or during a holiday and have not had a fair run.
- When vacation.frozenAt is set the numbers are as of that day, not today.
- Keep every list item to one or two sentences.`;

/**
 * All-time completion counts per habit name.
 *
 * The stats window is 28 days and raw events are pruned at 30, so "how many
 * times have I ever done this" cannot come from the window alone. It is the
 * permanent monthly summaries plus everything not yet folded into them — two
 * disjoint sets, because cron step 10 deletes exactly what it folds.
 *
 * Only habits: a goal step is a `day_of_week` task, and that is what the
 * lifetime figure on the card is about.
 *
 * @returns {Promise<Object<string, number>>} taskName → times completed, ever
 */
async function lifetimeHabitTotals() {
  const { ArchiveSummary } = require("../models/ArchiveSummary");
  const totals = {};

  for (const month of await ArchiveSummary.findAll()) {
    for (const habit of month.habits || []) {
      if (!habit.taskName) continue;
      totals[habit.taskName] =
        (totals[habit.taskName] || 0) + (habit.completed || 0);
    }
  }

  const raw = await Archive.completedCountsByName("habit_result");
  for (const [taskName, count] of Object.entries(raw)) {
    totals[taskName] = (totals[taskName] || 0) + count;
  }

  return totals;
}

/**
 * The full stats payload, vacation rules applied — what `GET /insights/stats`
 * returns and what the nightly snapshot stores. One function so the live
 * numbers and the stored ones can never disagree.
 *
 * Two vacation behaviours meet here:
 *
 *  - **The freeze.** While the user is away the window ends the day before
 *    they left, so a streak or a rate does not visibly decay over a holiday.
 *    It is a display freeze only — anything ticked off mid-trip is archived
 *    as usual and appears the day they are back.
 *  - **The rules.** Once home, the trip's days are inside the window again and
 *    `computeStats` reads them as paused rather than missed.
 *
 * @param {Object} [options]
 * @param {number} [options.periodDays=28]
 * @returns {Promise<Object>} { periodDays, eventCount, vacation, ...stats }
 */
async function buildStats({ periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  const Vacation = require("../models/Vacation");
  const to = new Date();
  const today = to.toISOString().slice(0, 10);

  const vacations = await Vacation.findAll();
  const cutoff = statsCutoff(vacations, today);

  const windowStart = daysAgo(to, periodDays);
  const all = await Archive.findByRange(windowStart, to);
  // The freeze filters on each event's *subject* day, not its insertion time:
  // the outcome of the last day before a trip is written at the following
  // midnight, and filtering by `at` would throw that day away.
  const events = cutoff
    ? all.filter((e) => {
        const day = eventDay(e);
        return !day || day <= cutoff;
      })
    : all;

  const stats = computeStats(events, { vacations });

  const lifetime = await lifetimeHabitTotals();
  stats.habits = stats.habits.map((habit) => ({
    ...habit,
    lifetimeCompleted: lifetime[habit.taskName] || habit.completed,
  }));

  const active = activeVacation(vacations, today);
  const windowFrom = windowStart.toISOString().slice(0, 10);

  return {
    periodDays,
    eventCount: events.length,
    vacation: {
      onVacation: Boolean(active),
      active: active ? { ...active, totalDays: vacationLength(active) } : null,
      // Non-null means the numbers below are as of this day, not today.
      frozenAt: cutoff,
      // Vacation days inside the reported window — what the panel cites when
      // it explains why a denominator shrank.
      vacationDaysInWindow: vacationDaysBetween(
        windowFrom,
        cutoff || today,
        vacations,
      ),
      justReturnedFrom: recentlyEnded(vacations, today),
    },
    ...stats,
  };
}

/**
 * Recompute the exact archive stats (streaks, completion rates, on-time
 * counts, reschedules, calls) and store them as the current snapshot.
 *
 * Pure arithmetic over `TaskArchive` — no model call, no API key — so the
 * cron runs it every night, alongside the AI report but independent of it. `GET /insights/stats` still computes live on request; this is the
 * persisted "as of last night" copy.
 *
 * @param {Object} [options]
 * @param {number} [options.periodDays=28]  How far back to analyze
 * @returns {Promise<Object>} The stored snapshot
 */
async function refreshStatsSnapshot({ periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  const {
    periodDays: days,
    eventCount,
    ...stats
  } = await buildStats({
    periodDays,
  });

  // An empty archive is still a real answer (every streak is 0) — storing it
  // keeps `computedAt` honest instead of leaving yesterday's numbers around.
  //
  // The snapshot inherits the freeze from `buildStats`: while the user is away
  // it stores the same as-of-departure numbers night after night, and resumes
  // moving the day they are back.
  return InsightStats.save({
    computedAt: new Date(),
    periodDays: days,
    eventCount,
    stats,
  });
}

/**
 * Whether the cron's AI analysis is due: **once per calendar day (UTC)**, and
 * never on a vacation day.
 *
 * The report used to be weekly (Fridays only) because every run cost an
 * Anthropic call. On Gemini's free tier a daily call is a rounding error, so
 * the weekday gate is gone — but the once-per-day guard is not. A second cron
 * run on the same day (a manual `POST /cron/run`, a redeploy, a retry) must
 * still not spend a second call.
 *
 * On-demand generation via `POST /insights/generate` deliberately ignores
 * this — it is an explicit user action, not the scheduled spend. It does,
 * however, consume the day: a manual report at noon means the nightly run
 * reports `insightSkipped: "not-due"`.
 *
 * @param {Date} [today]  Override for testing (defaults to now)
 * @returns {Promise<boolean>}
 */
async function isInsightDue(today = new Date()) {
  const day = new Date(today);
  if (Number.isNaN(day.getTime())) return false;

  // Nothing is generated while the user is away. There is no coaching to do on
  // a holiday, the window is frozen so the numbers would not have moved
  // anyway, and a fortnight of "you missed everything" reports is the exact
  // opposite of what a break is for.
  const Vacation = require("../models/Vacation");
  if (await Vacation.activeOn(day.toISOString().slice(0, 10))) return false;

  const previous = await Insight.latest();
  if (!previous || !previous.generatedAt) return true;

  const lastDay = utcDayStart(previous.generatedAt);
  if (Number.isNaN(lastDay)) return true;

  // Already reported today — today's analysis is done
  return lastDay !== utcDayStart(day);
}

/**
 * Generate and persist an insight report from the archive.
 *
 * The exact numbers are computed here in JS (`computeStats`) and handed to the
 * model as `precomputedStats` — the model interprets and coaches, it never
 * counts. Requires `GEMINI_API_KEY`.
 * @param {Object} [options]
 * @param {number} [options.periodDays=28]  How far back to analyze
 * @returns {Promise<Object|null>} The stored insight, `{ onVacation: true }`
 *   when the user is away, or null if there is no data
 */
async function generateInsights({ periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  const to = new Date();
  const today = to.toISOString().slice(0, 10);

  // No report on a vacation day, however it was asked for. The cron gate in
  // `isInsightDue` covers the nightly run; this covers the on-demand endpoint,
  // which deliberately bypasses that gate for everything else.
  const Vacation = require("../models/Vacation");
  if (await Vacation.activeOn(today)) {
    console.log("[Insights] On vacation — skipping generation");
    return { onVacation: true };
  }

  // The same frozen, vacation-aware numbers the panel shows, so the prose and
  // the figures beside it can never tell different stories.
  const {
    periodDays: days,
    eventCount,
    vacation,
    ...stats
  } = await buildStats({ periodDays });

  if (eventCount === 0) {
    console.log("[Insights] No archive events yet — skipping generation");
    return null;
  }

  const events = await Archive.findByRange(daysAgo(to, periodDays), to);
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

  const { GoogleGenAI } = require("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // `response_format` with a schema is Gemini's structured-output mode: the
  // model is constrained to emit JSON matching REPORT_SCHEMA, so the parse
  // below cannot receive prose or a fenced code block.
  const interaction = await client.interactions.create({
    model: insightModel(),
    system_instruction: SYSTEM_PROMPT,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: REPORT_SCHEMA,
    },
    input: JSON.stringify({
      today,
      periodDays: days,
      precomputedStats: { ...stats, vacation },
      currentCalls,
      recentEvents,
      previousReport: previous
        ? {
            generatedAt: previous.generatedAt,
            report: previous.report,
          }
        : null,
    }),
  });

  if (!interaction.output_text) {
    throw new Error(
      `No text output in model response (interaction ${interaction.id || "?"})`,
    );
  }
  const report = JSON.parse(interaction.output_text);

  const stored = await Insight.save({
    generatedAt: new Date(),
    periodDays: days,
    model: interaction.model || insightModel(),
    stats,
    vacation,
    report,
  });

  console.log("[Insights] Report generated and stored");
  return stored;
}

module.exports = {
  computeStats,
  buildStats,
  lifetimeHabitTotals,
  generateInsights,
  refreshStatsSnapshot,
  isInsightDue,
  DEFAULT_PERIOD_DAYS,
  DEFAULT_INSIGHT_MODEL,
  insightModel,
};
