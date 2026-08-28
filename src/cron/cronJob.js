const { ObjectId } = require("mongodb");
const Archive = require("../models/Archive");
const { applyProjectHeaderOrder } = require("../services/headerOrder");
const { getCollections: openCollections } = require("../utils/collections");
const {
  DOW_NAMES,
  daysInMonth,
  parseSlashDate,
  dayOfWeekName,
  utcDayString,
  utcToday,
  daysAgo,
} = require("../utils/dates");
const {
  groupBy,
  orderDoneLast,
  ascendingBy,
  priorityBulkOps,
} = require("../utils/ordering");

/**
 * How long raw `TaskArchive` events are kept before step 10 folds them into
 * `ArchiveSummary` and deletes them. Overridable with `ARCHIVE_RETENTION_DAYS`,
 * but never below the insights window.
 */
const DEFAULT_ARCHIVE_RETENTION_DAYS = 30;

// ─── ECD scheduling helpers ───────────────────────────────────────────────────
//
// Calendar arithmetic itself lives in `utils/dates`; what stays here is the
// part that knows what an ECD *means* — which one is due today, and when its
// next occurrence is.

/**
 * Resolve stored `day_of_month` values against a specific month, clamping any
 * day the month is too short for onto its last day (so "the 31st" fires on
 * Feb 28 and is still the 31st in March).
 *
 * This is deliberately computed on read: an earlier version clamped
 * `ecd.value` in the database on the 1st of each month, which permanently
 * rewrote "the 31st" to 28 after the first February it survived.
 *
 * @param {number[]} values
 * @param {number} year
 * @param {number} month  1-indexed
 * @returns {{days: number[], clamped: boolean}}
 */
function effectiveDaysOfMonth(values, year, month) {
  const maxDay = daysInMonth(year, month);
  let clamped = false;
  const days = values.map((v) => {
    if (v > maxDay) clamped = true;
    return Math.min(v, maxDay);
  });
  return { days, clamped };
}

/**
 * Resolve a `day_of_year` value against a specific year, clamping Feb 29 to
 * Feb 28 in non-leap years. Like `effectiveDaysOfMonth`, the stored value is
 * left alone so the Feb 29 intent survives.
 * @returns {{day: number, clamped: boolean}}
 */
function effectiveDayOfYear(day, month, year) {
  const maxDay = daysInMonth(year, month);
  return { day: Math.min(day, maxDay), clamped: day > maxDay };
}

/**
 * The timestamp of the next occurrence of a `day_of_year` ECD, on or after
 * today — the same "next upcoming" semantics `day_of_week` and `day_of_month`
 * use. The stored year is ignored: it records the last occurrence the cron
 * rolled over, not the next one, so reading it directly pinned every yearly
 * task to a past date (and therefore to the top of its header) for the whole
 * year between anniversaries.
 */
function nextDayOfYearTimestamp(value, today) {
  const { day, month } = parseSlashDate(value);
  const todayTs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  for (let year = today.getUTCFullYear(); ; year++) {
    const ts = Date.UTC(
      year,
      month - 1,
      effectiveDayOfYear(day, month, year).day,
    );
    if (ts >= todayTs) return ts;
  }
}

/**
 * Compute the "next upcoming" Date (UTC midnight) for a task ECD, used for sorting.
 * Tasks with null ECD get Infinity for sort purposes.
 * @param {Object|null} ecd
 * @param {Date} today  – local midnight on which the cron runs
 * @returns {number}  Unix timestamp for sorting (lower = sooner)
 */
function nextEcdTimestamp(ecd, today) {
  if (!ecd) return Infinity;

  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1; // 1-indexed
  const todayDate = today.getUTCDate();
  const todayDow = dayOfWeekName(today); // e.g. "Mon"

  switch (ecd.type) {
    case "date": {
      const [y, m, d] = ecd.value.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    }

    case "day_of_week": {
      const todayIdx = DOW_NAMES.indexOf(todayDow);
      let minDiff = 8;
      for (const day of ecd.value) {
        const idx = DOW_NAMES.indexOf(day);
        let diff = idx - todayIdx;
        if (diff < 0) diff += 7;
        if (diff < minDiff) minDiff = diff;
      }
      const next = new Date(today);
      next.setUTCDate(todayDate + minDiff);
      return next.getTime();
    }

    case "day_of_month": {
      const nm = todayMonth === 12 ? 1 : todayMonth + 1;
      const ny = todayMonth === 12 ? todayYear + 1 : todayYear;
      // Both months are clamped: "the 31st" is due Feb 28, not March 3.
      const thisMonth = effectiveDaysOfMonth(
        ecd.value,
        todayYear,
        todayMonth,
      ).days;
      const nextMonth = effectiveDaysOfMonth(ecd.value, ny, nm).days;

      let minTs = Infinity;
      for (let i = 0; i < ecd.value.length; i++) {
        const ts =
          thisMonth[i] >= todayDate
            ? Date.UTC(todayYear, todayMonth - 1, thisMonth[i])
            : Date.UTC(ny, nm - 1, nextMonth[i]);
        if (ts < minTs) minTs = ts;
      }
      return minTs;
    }

    case "day_of_year":
      return nextDayOfYearTimestamp(ecd.value, today);

    default:
      return Infinity;
  }
}

// ─── Collection helpers ───────────────────────────────────────────────────────

/** The three collections a run touches directly, in one database round trip. */
async function getCollections() {
  const [tasksCol, headersCol, callsCol] = await openCollections(
    "Tasks",
    "Headers",
    "Calls",
  );
  return { tasksCol, headersCol, callsCol };
}

/** Build a headerId → headerName map for archive denormalization */
async function getHeaderNameMap(headersCol) {
  const headers = await headersCol.find({}).toArray();
  const map = {};
  for (const h of headers) map[h._id.toString()] = h.name;
  return map;
}

// ─── Cron Steps ───────────────────────────────────────────────────────────────

/**
 * Step 0 — Archive yesterday's recurring-task outcomes (runs before any reset).
 * A task scheduled for day X is reset to undone at X 00:00 and completed during
 * X, so its outcome is only knowable at the following midnight. Idempotent:
 * tasks already archived for that dueDate are skipped, so manual cron runs
 * don't double-log.
 * @returns {Promise<number>} Number of outcome events logged
 */
async function step0ArchiveYesterdayResults(tasksCol, headerNames, today) {
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yDow = dayOfWeekName(yesterday);
  const yDom = yesterday.getUTCDate();
  const yMonth = yesterday.getUTCMonth() + 1;
  const dueDate = utcDayString(yesterday);

  // Idempotency guard: skip tasks already archived for this dueDate
  const alreadyLogged = await Archive.loggedIdsFor(
    ["habit_result", "task_result"],
    dueDate,
    "taskId",
  );

  const events = [];
  const baseFields = (task) => ({
    taskId: task._id.toString(),
    taskName: task.name,
    headerId: task.headerId,
    headerName: headerNames[task.headerId] || null,
    dueDate,
    completed: task.done === true,
    doneAt: task.doneAt || null,
  });

  // Habits: day_of_week tasks scheduled yesterday
  const habits = await tasksCol
    .find({ "ecd.type": "day_of_week", "ecd.value": yDow })
    .toArray();
  for (const task of habits) {
    if (alreadyLogged.has(task._id.toString())) continue;
    events.push({
      type: "habit_result",
      ...baseFields(task),
      scheduledDays: task.ecd.value,
    });
  }

  // Recurring tasks: day_of_month due yesterday. Values are resolved against
  // yesterday's month, so a task set to the 31st is picked up on Feb 28.
  const yYear = yesterday.getUTCFullYear();
  const monthly = await tasksCol.find({ "ecd.type": "day_of_month" }).toArray();
  for (const task of monthly) {
    const { days } = effectiveDaysOfMonth(task.ecd.value, yYear, yMonth);
    if (!days.includes(yDom)) continue;
    if (alreadyLogged.has(task._id.toString())) continue;
    events.push({
      type: "task_result",
      ...baseFields(task),
      ecdType: "day_of_month",
      ecdValue: task.ecd.value,
    });
  }

  // Recurring tasks: day_of_year due yesterday (match day/month, any year;
  // a Feb 29 task counts as due on Feb 28 of a non-leap year)
  const yearly = await tasksCol.find({ "ecd.type": "day_of_year" }).toArray();
  for (const task of yearly) {
    const { day, month } = parseSlashDate(task.ecd.value);
    if (month !== yMonth) continue;
    if (effectiveDayOfYear(day, month, yYear).day !== yDom) continue;
    if (alreadyLogged.has(task._id.toString())) continue;
    events.push({
      type: "task_result",
      ...baseFields(task),
      ecdType: "day_of_year",
      ecdValue: task.ecd.value,
    });
  }

  await Archive.logMany(events);
  return events.length;
}

/**
 * Step 1 — Mark undone: day_of_year (runs daily).
 * A task is due today when its stored month/day resolves to today — Feb 29
 * resolves to Feb 28 in a non-leap year. The stored day is never rewritten
 * (so a Feb 29 task stays a Feb 29 task); only the year is advanced, which is
 * what marks the occurrence as consumed for the rest of the year.
 * @returns {Promise<{clamped: number, markedUndone: number}>}
 */
async function step1IncrementDayOfYear(tasksCol, today) {
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1; // 1-indexed
  const todayDate = today.getUTCDate();

  const tasks = await tasksCol.find({ "ecd.type": "day_of_year" }).toArray();

  let clamped = 0;
  let markedUndone = 0;
  for (const task of tasks) {
    const { day, month, year } = parseSlashDate(task.ecd.value);

    // Skip tasks already set to the current year or a future year
    if (year >= todayYear) continue;
    if (month !== todayMonth) continue;

    const effective = effectiveDayOfYear(day, month, todayYear);
    if (effective.day !== todayDate) continue;
    if (effective.clamped) clamped++;

    await tasksCol.updateOne(
      { _id: task._id },
      {
        $set: {
          "ecd.value": `${day}/${month}/${todayYear}`,
          done: false,
          doneAt: null,
          updatedAt: new Date(),
        },
      },
    );
    if (task.done) markedUndone++;
  }
  return { clamped, markedUndone };
}

/**
 * Step 2 — Mark undone: day_of_week
 * @returns {Promise<number>} Number of tasks marked undone
 */
async function step2MarkUndoneDayOfWeek(tasksCol, today) {
  const todayDow = dayOfWeekName(today);

  const result = await tasksCol.updateMany(
    { "ecd.type": "day_of_week", "ecd.value": todayDow, done: true },
    { $set: { done: false, doneAt: null, updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Step 3 — Mark undone: day_of_month.
 * Stored days are resolved against the current month, so a task set to the
 * 31st is due on Feb 28 without its value ever being rewritten.
 * @returns {Promise<{clamped: number, markedUndone: number}>}
 */
async function step3MarkUndoneDayOfMonth(tasksCol, today) {
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1;
  const todayDate = today.getUTCDate();
  const maxDay = daysInMonth(todayYear, todayMonth);

  // Only the month's last day can carry a clamped value; on every other day
  // the stored value must match exactly, which the index can answer directly.
  if (todayDate !== maxDay) {
    const result = await tasksCol.updateMany(
      { "ecd.type": "day_of_month", "ecd.value": todayDate, done: true },
      { $set: { done: false, doneAt: null, updatedAt: new Date() } },
    );
    return { clamped: 0, markedUndone: result.modifiedCount };
  }

  const tasks = await tasksCol.find({ "ecd.type": "day_of_month" }).toArray();

  const dueIds = [];
  let clamped = 0;
  for (const task of tasks) {
    const { days, clamped: wasClamped } = effectiveDaysOfMonth(
      task.ecd.value,
      todayYear,
      todayMonth,
    );
    if (!days.includes(todayDate)) continue;
    if (wasClamped) clamped++;
    if (task.done) dueIds.push(task._id);
  }

  if (dueIds.length === 0) return { clamped, markedUndone: 0 };

  const result = await tasksCol.updateMany(
    { _id: { $in: dueIds } },
    { $set: { done: false, doneAt: null, updatedAt: new Date() } },
  );
  return { clamped, markedUndone: result.modifiedCount };
}

/**
 * Step 4 — Delete completed date tasks and completed no-ECD tasks.
 * Each deleted task is archived first so completion history is preserved.
 * Deleted tasks linked from a long-term project (ProjectTask.todoTaskId)
 * mark that project task done — the todo entry disappears but the project
 * keeps it as a completed step. Deleted tasks linked from a life event
 * (LifeEvent.todoTaskId) mark that life event done the same way — the event
 * itself is never deleted and fires again on its next anniversary.
 * @returns {Promise<{tasksDeleted: number, projectTasksCompleted: number, lifeEventsCompleted: number}>}
 */
async function step4DeleteDoneDateTasks(tasksCol, headerNames) {
  const tasks = await tasksCol
    .find({
      done: true,
      $or: [{ "ecd.type": "date" }, { ecd: null }, { ecd: { $exists: false } }],
    })
    .toArray();

  if (tasks.length === 0)
    return {
      tasksDeleted: 0,
      projectTasksCompleted: 0,
      lifeEventsCompleted: 0,
    };

  await Archive.logMany(
    tasks.map((task) =>
      Archive.completionEvent(task, headerNames[task.headerId]),
    ),
  );

  const ids = tasks.map((t) => t._id);
  const result = await tasksCol.deleteMany({ _id: { $in: ids } });

  const { Project } = require("../models/Project");
  const idStrings = ids.map((id) => id.toString());
  const projectTasksCompleted = await Project.completeTasksByTodoIds(idStrings);

  const { LifeEvent } = require("../models/LifeEvent");
  const lifeEventsCompleted = await LifeEvent.completeByTodoIds(idStrings);

  return {
    tasksDeleted: result.deletedCount,
    projectTasksCompleted,
    lifeEventsCompleted,
  };
}

/**
 * Step 5 — Delete headers with no tasks, then re-assert the header order.
 * Runs after step 4 so headers emptied by task deletion are cleaned up too.
 * Any header without at least one task is deleted (including headers that
 * were always empty).
 *
 * The surviving headers are then re-numbered by `applyProjectHeaderOrder`,
 * which keeps priorities contiguous (0..n-1) *and* keeps project headers in
 * their projects' order. Doing both here is what stops the cron and the
 * clients from drifting apart: plain re-numbering could leave a project
 * header above the todo's top non-project header, and the next project
 * action would then visibly reshuffle the list.
 *
 * @returns {Promise<{headersDeleted: number, headersReprioritized: number}>}
 */
async function step5DeleteEmptyHeaders(tasksCol, headersCol) {
  const headers = await headersCol.find({}).toArray();
  if (headers.length === 0)
    return { headersDeleted: 0, headersReprioritized: 0 };

  // headerId is stored as a string on tasks
  const headerIdsWithTasks = new Set(
    (await tasksCol.distinct("headerId")).map((id) => id.toString()),
  );

  const emptyIds = headers
    .filter((h) => !headerIdsWithTasks.has(h._id.toString()))
    .map((h) => h._id);

  if (emptyIds.length > 0) {
    await headersCol.deleteMany({ _id: { $in: emptyIds } });
  }

  const { headersReordered } = await applyProjectHeaderOrder();
  return {
    headersDeleted: emptyIds.length,
    headersReprioritized: headersReordered,
  };
}

/**
 * Step 6 — Add due life events to the todo.
 *
 * A life event (e.g. "Wife's birthday" on "7/3") is due when its stored
 * day/month resolves to today — Feb 29 resolves to Feb 28 in a non-leap year,
 * same as `day_of_year` ECDs. On its day, a one-time date task named after
 * the event is created under a header named **"Events"** (matched
 * case-insensitively, created at the end of the list otherwise) and linked
 * via `todoTaskId`; `done` is reset for the new occurrence.
 *
 * Idempotency mirrors step 1's year-advance trick: `lastAddedYear` records
 * the last occurrence consumed, and only events still behind the current
 * year fire — so a manual rerun on the same day (even after the task was
 * completed and cleaned up) cannot create a duplicate. An event whose linked
 * task still exists (last year's occurrence never completed) is skipped too:
 * the pending task already represents it in the todo.
 *
 * Runs after step 5 so the header landscape is settled, and before step 7 so
 * the new task is sorted into place by its ECD.
 * @returns {Promise<number>} Number of todo tasks created
 */
async function step6AddDueLifeEvents(tasksCol, headersCol, today) {
  const { LifeEvent } = require("../models/LifeEvent");
  const { Task } = require("../models/Task");

  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1; // 1-indexed
  const todayDate = today.getUTCDate();

  const lifeEvents = await LifeEvent.findAll();

  let tasksCreated = 0;
  let eventsHeaderId = null;

  for (const event of lifeEvents) {
    const { day, month } = parseSlashDate(event.date);

    if (event.lastAddedYear >= todayYear) continue;
    if (month !== todayMonth) continue;
    if (effectiveDayOfYear(day, month, todayYear).day !== todayDate) continue;

    // Last year's task still pending — don't stack a second occurrence.
    // A malformed stored id (PUT accepts any string) counts as no link —
    // it must not throw and take the whole cron run down with it.
    if (event.todoTaskId) {
      let linked = null;
      try {
        linked = await tasksCol.findOne({
          _id: new ObjectId(event.todoTaskId),
        });
      } catch (_err) {
        // invalid ObjectId string — treat as unlinked
      }
      if (linked) continue;
    }

    if (!eventsHeaderId) {
      const existing = await headersCol
        .find({ name: { $regex: "^Events$", $options: "i" } })
        .sort({ priority: 1 })
        .limit(1)
        .toArray();
      if (existing.length > 0) {
        eventsHeaderId = existing[0]._id.toString();
      } else {
        const Header = require("../models/Header");
        const { header } = await Header.create({ name: "Events" });
        eventsHeaderId = header._id.toString();
      }
    }

    const task = await Task.create({
      name: event.name,
      headerId: eventsHeaderId,
      ecd: { type: "date", value: utcDayString(today) },
    });

    await LifeEvent.update(event._id.toString(), {
      todoTaskId: task._id.toString(),
      done: false,
      lastAddedYear: todayYear,
    });
    tasksCreated++;
  }

  return tasksCreated;
}

/**
 * Step 7 — Reorder priorities per header.
 *
 * Undone tasks first, sorted by their next upcoming ECD ascending; then done
 * tasks.
 *
 * Ties (two tasks due the same day) keep their existing relative order —
 * `Array.prototype.sort` is required to be stable, so a manual ordering
 * within a single day survives the nightly re-sort.
 *
 * `updatedAt` is deliberately left alone: priority is a system-managed field,
 * and stamping every task the cron touches would make "recently edited" mean
 * "the cron ran".
 *
 * @returns {Promise<number>} Number of headers whose tasks were reordered
 */
async function step7ReorderPriorities(tasksCol, today) {
  // One pass over the task collection, grouped in memory, instead of a query
  // per header.
  const tasks = await tasksCol.find({}).sort({ priority: 1 }).toArray();
  const byHeader = groupBy(tasks, (task) => task.headerId);

  const bySoonestEcd = ascendingBy((task) => nextEcdTimestamp(task.ecd, today));

  const bulkOps = [];
  let headersReordered = 0;

  for (const headerTasks of byHeader.values()) {
    const ops = priorityBulkOps(orderDoneLast(headerTasks, bySoonestEcd));
    if (ops.length > 0) {
      bulkOps.push(...ops);
      headersReordered++;
    }
  }

  if (bulkOps.length > 0) await tasksCol.bulkWrite(bulkOps);
  return headersReordered;
}

/**
 * Step 8 — Archive call outcomes and reset done calls at period boundaries
 * (independent of tasks/headers).
 * Biweekly calls are due twice per month (periods 1st–14th and 15th–end),
 * monthly calls once; the reset clears the "called" checkmark at each period
 * boundary so the person shows up as due again.
 * - On the 15th (UTC): archive + reset "biweekly" calls.
 * - On the LAST day of the month (UTC): archive + reset ALL calls.
 * - Any other day: no-op.
 * Before resetting, a `call_result` event is archived for EVERY call due at
 * the boundary (completed or missed) so insights can track miss patterns.
 * Idempotent: calls already archived for this dueDate are skipped, so manual
 * cron re-runs don't double-log.
 * @returns {Promise<number>} Number of calls reset
 */
async function step8ResetCalls(callsCol, today) {
  const todayDate = today.getUTCDate();
  const lastDay = daysInMonth(today.getUTCFullYear(), today.getUTCMonth() + 1);

  let dueFilter;
  if (todayDate === 15) {
    dueFilter = { frequency: "biweekly" };
  } else if (todayDate === lastDay) {
    dueFilter = {};
  } else {
    return 0;
  }

  const dueDate = utcDayString(today);
  const dueCalls = await callsCol.find(dueFilter).toArray();

  // Idempotency guard: skip calls already archived for this dueDate
  const alreadyLogged = await Archive.loggedIdsFor(
    "call_result",
    dueDate,
    "callId",
  );

  await Archive.logMany(
    dueCalls
      .filter((call) => !alreadyLogged.has(call._id.toString()))
      .map((call) => ({
        type: "call_result",
        callId: call._id.toString(),
        callName: call.name,
        frequency: call.frequency,
        dueDate,
        completed: call.done === true,
        doneAt: call.doneAt || null,
      })),
  );

  const result = await callsCol.updateMany(
    { ...dueFilter, done: true },
    { $set: { done: false, doneAt: null, updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Step 9 — Refresh the exact stats snapshot (streaks, completion rates,
 * on-time counts, reschedules, calls) from the archive.
 *
 * Runs **every night and needs no AI**: it is arithmetic over `TaskArchive`,
 * so it works without an `GEMINI_API_KEY` and regardless of whether the
 * AI report fires. That is the point — the narrative is a model call away, but
 * a streak must be right the morning after the day it was earned.
 *
 * Runs after step 8 so the day's `call_result` events are already archived,
 * and before the report so the day's prompt and the snapshot agree.
 *
 * A failed snapshot never fails the cron run (same policy as the archive and
 * the AI report).
 * @returns {Promise<boolean>} Whether the snapshot was written
 */
async function step9RefreshStatsSnapshot() {
  try {
    const { refreshStatsSnapshot } = require("../services/insightsService");
    // Deliberately not the run's `today` override: archive events are stamped
    // with their real insertion time (including the ones step 0 just wrote
    // moments ago), so the window has to end at the real now to include them.
    await refreshStatsSnapshot();
    return true;
  } catch (error) {
    console.error("[Cron] Stats snapshot refresh failed:", error.message);
    return false;
  }
}

/**
 * Step 10 — Summarise, then prune the archive.
 *
 * `TaskArchive` is append-only and used to grow without bound, while only the
 * last few weeks were ever read (`DEFAULT_PERIOD_DAYS`). Events older than the
 * retention window are folded into `ArchiveSummary` — one document per
 * calendar month — and then deleted. Monthly totals survive for good; only the
 * per-day detail ages out.
 *
 * Two rules make this safe to re-run:
 *
 *  - **The cutoff is a UTC day boundary**, not "now minus N days", so only
 *    whole days are ever pruned. A day split across two runs would be counted
 *    by one and dropped by the other.
 *  - **The fold is idempotent per source day** (`ArchiveSummary.foldEvents`),
 *    so a run that folded a batch but died before deleting it counts nothing
 *    twice on the next pass.
 *
 * The window can never dip below the insights window: pruning inside it would
 * silently starve the nightly stats snapshot of the events it reads.
 *
 * Like step 9, the cutoff is measured from the **real** today, never from the
 * run's `date` override: archive events are stamped with their real insertion
 * time, so a run pretending to be next year must not treat this week's events
 * as ancient and delete them.
 *
 * @returns {Promise<{eventsPruned: number, eventsFolded: number, monthsTouched: number, cutoff: string|null}>}
 */
async function step10PruneArchive() {
  const { ArchiveSummary } = require("../models/ArchiveSummary");
  const { DEFAULT_PERIOD_DAYS } = require("../services/insightsService");

  const configured = Number.parseInt(process.env.ARCHIVE_RETENTION_DAYS, 10);
  const requested =
    Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_ARCHIVE_RETENTION_DAYS;
  const retentionDays = Math.max(requested, DEFAULT_PERIOD_DAYS);
  if (retentionDays !== requested) {
    console.warn(
      `[Cron] ARCHIVE_RETENTION_DAYS=${requested} is inside the ${DEFAULT_PERIOD_DAYS}-day insights window — using ${retentionDays}`,
    );
  }

  // Real UTC midnight, so the cutoff lands on a day boundary and only complete
  // days ever fall before it.
  const cutoff = daysAgo(utcToday(), retentionDays);

  const archiveCol = await Archive.getCollection();
  const expiring = await archiveCol
    .find({ at: { $lt: cutoff } })
    .sort({ at: 1 })
    .toArray();

  if (expiring.length === 0) {
    return { eventsPruned: 0, eventsFolded: 0, monthsTouched: 0, cutoff: null };
  }

  const { monthsTouched, eventsFolded } =
    await ArchiveSummary.foldAll(expiring);

  const result = await archiveCol.deleteMany({
    _id: { $in: expiring.map((event) => event._id) },
  });

  return {
    eventsPruned: result.deletedCount,
    eventsFolded,
    monthsTouched,
    cutoff: utcDayString(cutoff),
  };
}

/**
 * Step 11 — Trim stored insight reports.
 *
 * The report went from weekly to daily, so `Insights` fills seven times
 * faster — and at ~8 KB a report that is a few MB a year of narrative nobody
 * can read: only the newest `Insight.MAX_HISTORY` are reachable, because that
 * is the ceiling `GET /insights/history` enforces.
 *
 * Unlike the archive there is nothing to roll up first. A report is prose
 * derived from `TaskArchive`, and those numbers survive permanently in
 * `ArchiveSummary`, so an aged-out report costs a piece of writing, not a
 * fact.
 *
 * `INSIGHT_RETENTION_COUNT` can raise the window but never lower it past
 * `MAX_HISTORY` — trimming inside the API's own ceiling would make
 * `?limit=100` unservable.
 *
 * @returns {Promise<number>} reports deleted
 */
async function step11TrimInsightReports() {
  const Insight = require("../models/Insight");

  const configured = Number.parseInt(process.env.INSIGHT_RETENTION_COUNT, 10);
  const requested =
    Number.isInteger(configured) && configured > 0
      ? configured
      : Insight.MAX_HISTORY;
  const keep = Math.max(requested, Insight.MAX_HISTORY);
  if (keep !== requested) {
    console.warn(
      `[Cron] INSIGHT_RETENTION_COUNT=${requested} is below the ${Insight.MAX_HISTORY}-report history ceiling — using ${keep}`,
    );
  }

  return Insight.pruneToNewest(keep);
}

// ─── Main runner ──────────────────────────────────────────────────────────────

/** Persisted result of the most recent cron run (in-memory). */
let lastRun = null;

/**
 * Run the full cron sequence.
 * @param {Date} [now]  Override for testing (defaults to current local midnight)
 * @param {Object} [options]
 * @param {boolean} [options.skipInsights]  Skip the AI insight report (used by e2e runs)
 * @returns {Promise<Object>} Stats about what the run did
 */
async function runCron(now, { skipInsights = false } = {}) {
  const today = now || new Date();
  // Normalise to UTC midnight for timezone-independent operations
  today.setUTCHours(0, 0, 0, 0);

  console.log(`[Cron] Running at ${today.toISOString()}`);

  const { tasksCol, headersCol, callsCol } = await getCollections();
  const headerNames = await getHeaderNameMap(headersCol);

  const outcomesArchived = await step0ArchiveYesterdayResults(
    tasksCol,
    headerNames,
    today,
  );
  const { clamped: clampedDoy, markedUndone: markedUndoneDoy } =
    await step1IncrementDayOfYear(tasksCol, today);
  const markedUndoneDow = await step2MarkUndoneDayOfWeek(tasksCol, today);
  const { clamped: clampedDom, markedUndone: markedUndoneDom } =
    await step3MarkUndoneDayOfMonth(tasksCol, today);
  const { tasksDeleted, projectTasksCompleted, lifeEventsCompleted } =
    await step4DeleteDoneDateTasks(tasksCol, headerNames);
  const { headersDeleted, headersReprioritized } =
    await step5DeleteEmptyHeaders(tasksCol, headersCol);
  const lifeEventTasksCreated = await step6AddDueLifeEvents(
    tasksCol,
    headersCol,
    today,
  );
  const headersReordered = await step7ReorderPriorities(tasksCol, today);
  const callsReset = await step8ResetCalls(callsCol, today);
  const statsRefreshed = await step9RefreshStatsSnapshot();
  const archivePruned = await step10PruneArchive();
  const insightReportsPruned = await step11TrimInsightReports();

  const stats = {
    ranAt: today.toISOString(),
    // Nothing in steps 0–11 behaves differently on a vacation day — vacation
    // is a lens on the history, not a pause button. It is reported because it
    // explains why the AI report below did not run, and why the stats
    // snapshot stopped moving.
    onVacation: Boolean(
      await require("../models/Vacation").activeOn(utcDayString(today)),
    ),
    tasksDeleted,
    tasksMarkedUndone: markedUndoneDoy + markedUndoneDow + markedUndoneDom,
    tasksClamped: clampedDoy + clampedDom,
    headersDeleted,
    headersReprioritized,
    headersReordered,
    projectTasksCompleted,
    lifeEventsCompleted,
    lifeEventTasksCreated,
    outcomesArchived,
    callsReset,
    statsRefreshed,
    archiveEventsPruned: archivePruned.eventsPruned,
    archiveEventsFolded: archivePruned.eventsFolded,
    archiveMonthsSummarised: archivePruned.monthsTouched,
    archiveCutoff: archivePruned.cutoff,
    insightReportsPruned,
  };

  // Generate the AI insight report. It fires once per UTC day, and every run
  // now records *why* it did not — `insightGenerated` and `insightSkipped` are
  // always both present.
  //
  // They used to be omitted entirely on the three pre-conditions below, which
  // made "no report today" and "no report step at all" look identical from
  // `/cron/status`. That silence is the reason a missing API key or a run that
  // never happened could go a month without anyone noticing.
  //
  // Reasons: `opted-out` (the caller passed skipInsights), `test-env`,
  // `no-api-key`, `vacation` (the user is away and none is wanted),
  // `not-due` (today's report already exists), `no-data` (the archive window
  // is empty, so there is nothing to write about) and `error`.
  const insightBlockedBy = skipInsights
    ? "opted-out"
    : process.env.NODE_ENV === "test"
      ? "test-env"
      : !process.env.GEMINI_API_KEY
        ? "no-api-key"
        : null;

  if (insightBlockedBy) {
    stats.insightGenerated = false;
    stats.insightSkipped = insightBlockedBy;
  } else {
    try {
      const {
        generateInsights,
        isInsightDue,
      } = require("../services/insightsService");
      // `isInsightDue` refuses on a vacation day as well as a second run of
      // the same day, so the reason is resolved here — "you are away" and
      // "already written today" are different answers to the user.
      if (stats.onVacation) {
        stats.insightGenerated = false;
        stats.insightSkipped = "vacation";
      } else if (await isInsightDue(today)) {
        const insight = await generateInsights();
        // `generateInsights` runs its own vacation check against the *real*
        // clock, so a run with a `date` override can disagree with the flag
        // above. Trust its answer rather than counting the refusal object as
        // a generated report.
        if (insight && insight.onVacation) {
          stats.insightGenerated = false;
          stats.insightSkipped = "vacation";
        } else if (insight) {
          stats.insightGenerated = true;
        } else {
          // `generateInsights` returns null when the archive window is empty —
          // there is nothing to coach on yet. Named, because "no data" and
          // "the model call blew up" both used to read as a bare false.
          stats.insightGenerated = false;
          stats.insightSkipped = "no-data";
        }
      } else {
        stats.insightGenerated = false;
        stats.insightSkipped = "not-due";
      }
    } catch (error) {
      console.error("[Cron] Insight generation failed:", error.message);
      stats.insightGenerated = false;
      stats.insightSkipped = "error";
      stats.insightError = error.message;
    }
  }

  lastRun = stats;
  console.log("[Cron] Done", stats);
  return stats;
}

/** Return the stats from the last cron run, or null if it has never run. */
function getLastRun() {
  return lastRun;
}

/**
 * Whether this process is a serverless function rather than a long-lived server.
 *
 * This app is deployed to Vercel, where the instance is frozen the moment a
 * response is written and reclaimed shortly after. A timer set for midnight is
 * never reached — neither node-cron nor `setInterval` ticks between requests —
 * so `scheduleCron` cannot work there **and registering one anyway is worse
 * than doing nothing**: it logs "Scheduled daily at UTC midnight" and then
 * nothing ever runs, which is exactly how a month of missing insight reports,
 * archive events and stats snapshots went unnoticed.
 *
 * On a function runtime the daily run has to come from the platform scheduler
 * (`vercel.json` → `crons`), which calls `GET /cron/run`.
 */
function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Schedule the cron job to run every day at midnight using node-cron, or a
 * setInterval fallback. Only called in production (non-test) mode.
 *
 * @returns {boolean} Whether an in-process schedule was actually registered.
 *   `false` on a serverless runtime, where the platform scheduler owns the
 *   daily run — see `isServerless`.
 */
function scheduleCron() {
  if (isServerless()) {
    console.log(
      "[Cron] Serverless runtime detected — in-process scheduling cannot work here. " +
        "The daily run must come from the platform scheduler: vercel.json → crons → GET /cron/run",
    );
    return false;
  }

  try {
    const cron = require("node-cron");
    cron.schedule("0 0 * * *", () => runCron(), { timezone: "Etc/UTC" });
    console.log("[Cron] Scheduled daily at UTC midnight via node-cron");
    return true;
  } catch (_err) {
    // node-cron not installed — fall back to a simple interval check (UTC)
    const MS_PER_MINUTE = 60000;
    let lastRan = null;

    setInterval(() => {
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setUTCHours(0, 0, 0, 0);

      if (!lastRan || lastRan < todayMidnight) {
        if (now.getUTCHours() === 0) {
          lastRan = todayMidnight;
          runCron(new Date(todayMidnight));
        }
      }
    }, MS_PER_MINUTE);

    console.log(
      "[Cron] Scheduled via UTC interval fallback (install node-cron for precision)",
    );
    return true;
  }
}

module.exports = { runCron, scheduleCron, getLastRun, isServerless };
