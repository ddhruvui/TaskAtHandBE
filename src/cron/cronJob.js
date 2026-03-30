const { getDatabase } = require("../config/db");

// ─── Date / Day helpers ───────────────────────────────────────────────────────

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Returns number of days in a given month (1-indexed) of a given year (UTC) */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Returns true if the year is a leap year */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Parse a D/M/YYYY string into { day, month, year } numbers.
 * e.g. "7/3/2006" → { day: 7, month: 3, year: 2006 }
 */
function parseDayOfYear(str) {
  const [d, m, y] = str.split("/").map(Number);
  return { day: d, month: m, year: y };
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
  const todayDow = DOW_NAMES[today.getUTCDay()]; // e.g. "Mon"

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
      let minTs = Infinity;
      for (const dom of ecd.value) {
        let ts;
        if (dom >= todayDate) {
          ts = Date.UTC(todayYear, todayMonth - 1, dom);
        } else {
          // next month
          const nm = todayMonth === 12 ? 1 : todayMonth + 1;
          const ny = todayMonth === 12 ? todayYear + 1 : todayYear;
          const clamped = Math.min(dom, daysInMonth(ny, nm));
          ts = Date.UTC(ny, nm - 1, clamped);
        }
        if (ts < minTs) minTs = ts;
      }
      return minTs;
    }

    case "day_of_year": {
      const { day, month, year } = parseDayOfYear(ecd.value);
      return Date.UTC(year, month - 1, day);
    }

    default:
      return Infinity;
  }
}

// ─── Collection helpers ───────────────────────────────────────────────────────

async function getCollections() {
  const db = await getDatabase();
  const useTestDB = process.env.USE_TEST_DB === "true";
  const tasksCol = db.collection(useTestDB ? "Tasks-Test" : "Tasks");
  const headersCol = db.collection(useTestDB ? "Headers-Test" : "Headers");
  return { tasksCol, headersCol };
}

// ─── Cron Steps ───────────────────────────────────────────────────────────────

/**
 * Step 1 — Clamp day_of_month values (runs on the 1st of every month).
 * @returns {Promise<number>} Number of tasks whose values were clamped
 */
async function step1ClampDayOfMonth(tasksCol, today) {
  if (today.getUTCDate() !== 1) return 0;

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const maxDay = daysInMonth(year, month);

  const tasks = await tasksCol.find({ "ecd.type": "day_of_month" }).toArray();

  let tasksClamped = 0;
  for (const task of tasks) {
    const clamped = task.ecd.value.map((v) => Math.min(v, maxDay));
    const changed = clamped.some((v, i) => v !== task.ecd.value[i]);
    if (changed) {
      await tasksCol.updateOne(
        { _id: task._id },
        { $set: { "ecd.value": clamped, updatedAt: new Date() } },
      );
      tasksClamped++;
    }
  }
  return tasksClamped;
}

/**
 * Step 2 — Mark undone: day_of_year (runs daily).
 * - If today's month/day matches a task's ECD month/day and the ECD year is
 *   in the past, the task is marked undone and the year is advanced to today.
 * - On Feb 28 of a non-leap year, any task with Feb 29 of a past year is
 *   clamped to Feb 28 of the current year and marked undone.
 * @returns {Promise<{clamped: number, markedUndone: number}>}
 */
async function step2IncrementDayOfYear(tasksCol, today) {
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1; // 1-indexed
  const todayDate = today.getUTCDate();

  const tasks = await tasksCol.find({ "ecd.type": "day_of_year" }).toArray();

  let clamped = 0;
  let markedUndone = 0;
  for (const task of tasks) {
    const { day, month, year } = parseDayOfYear(task.ecd.value);

    // Skip tasks already set to the current year or a future year
    if (year >= todayYear) continue;

    let finalDay = day;
    let shouldUpdate = false;

    // Case 1: Feb 28 of a non-leap year — clamp past Feb 29 tasks
    if (
      todayMonth === 2 &&
      todayDate === 28 &&
      !isLeapYear(todayYear) &&
      month === 2 &&
      day === 29
    ) {
      finalDay = 28;
      shouldUpdate = true;
      clamped++;
    }

    // Case 2: Today's month/day matches the task's scheduled month/day
    if (month === todayMonth && day === todayDate) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const newValue = `${finalDay}/${month}/${todayYear}`;
      await tasksCol.updateOne(
        { _id: task._id },
        {
          $set: {
            "ecd.value": newValue,
            done: false,
            updatedAt: new Date(),
          },
        },
      );
      if (task.done) markedUndone++;
    }
  }
  return { clamped, markedUndone };
}

/**
 * Step 3 — Mark undone: day_of_week
 * @returns {Promise<number>} Number of tasks marked undone
 */
async function step3MarkUndoneDayOfWeek(tasksCol, today) {
  const todayDow = DOW_NAMES[today.getUTCDay()];

  const result = await tasksCol.updateMany(
    { "ecd.type": "day_of_week", "ecd.value": todayDow, done: true },
    { $set: { done: false, updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Step 4 — Mark undone: day_of_month
 * @returns {Promise<number>} Number of tasks marked undone
 */
async function step4MarkUndoneDayOfMonth(tasksCol, today) {
  const todayDate = today.getUTCDate();

  const result = await tasksCol.updateMany(
    { "ecd.type": "day_of_month", "ecd.value": todayDate, done: true },
    { $set: { done: false, updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Step 5 — Delete completed date tasks and completed no-ECD tasks
 * @returns {Promise<number>} Number of tasks deleted
 */
async function step5DeleteDoneDateTasks(tasksCol) {
  const tasks = await tasksCol
    .find({
      done: true,
      $or: [{ "ecd.type": "date" }, { ecd: null }, { ecd: { $exists: false } }],
    })
    .toArray();

  if (tasks.length === 0) return 0;

  const ids = tasks.map((t) => t._id);
  const result = await tasksCol.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
}

/**
 * Step 6 — Reorder priorities per header
 * @returns {Promise<number>} Number of headers whose tasks were reordered
 */
async function step6ReorderPriorities(tasksCol, headersCol, today) {
  const headers = await headersCol.find({}).toArray();

  let headersReordered = 0;
  for (const header of headers) {
    const headerId = header._id.toString();
    const tasks = await tasksCol
      .find({ headerId })
      .sort({ priority: 1 })
      .toArray();

    if (tasks.length === 0) continue;

    const undone = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);

    // Sort undone by next upcoming ECD timestamp ascending
    undone.sort(
      (a, b) => nextEcdTimestamp(a.ecd, today) - nextEcdTimestamp(b.ecd, today),
    );

    const ordered = [...undone, ...done];

    const bulkOps = [];
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].priority !== i) {
        bulkOps.push({
          updateOne: {
            filter: { _id: ordered[i]._id },
            update: { $set: { priority: i, updatedAt: new Date() } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await tasksCol.bulkWrite(bulkOps);
      headersReordered++;
    }
  }
  return headersReordered;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

/** Persisted result of the most recent cron run (in-memory). */
let lastRun = null;

/**
 * Run the full cron sequence.
 * @param {Date} [now]  Override for testing (defaults to current local midnight)
 * @returns {Promise<Object>} Stats about what the run did
 */
async function runCron(now) {
  const today = now || new Date();
  // Normalise to UTC midnight for timezone-independent operations
  today.setUTCHours(0, 0, 0, 0);

  console.log(`[Cron] Running at ${today.toISOString()}`);

  const { tasksCol, headersCol } = await getCollections();

  const tasksClamped1 = await step1ClampDayOfMonth(tasksCol, today);
  const { clamped: tasksClamped2, markedUndone: markedUndone2 } =
    await step2IncrementDayOfYear(tasksCol, today);
  const markedUndone3 = await step3MarkUndoneDayOfWeek(tasksCol, today);
  const markedUndone4 = await step4MarkUndoneDayOfMonth(tasksCol, today);
  const tasksDeleted = await step5DeleteDoneDateTasks(tasksCol);
  const headersReordered = await step6ReorderPriorities(
    tasksCol,
    headersCol,
    today,
  );

  const stats = {
    ranAt: today.toISOString(),
    tasksDeleted,
    tasksMarkedUndone: markedUndone2 + markedUndone3 + markedUndone4,
    tasksClamped: tasksClamped1 + tasksClamped2,
    headersReordered,
  };

  lastRun = stats;
  console.log("[Cron] Done", stats);
  return stats;
}

/** Return the stats from the last cron run, or null if it has never run. */
function getLastRun() {
  return lastRun;
}

/**
 * Schedule the cron job to run every day at midnight using setInterval or node-cron if available.
 * This function should only be called in production (non-test) mode.
 */
function scheduleCron() {
  try {
    const cron = require("node-cron");
    cron.schedule("0 0 * * *", () => runCron(), { timezone: "system" });
    console.log("[Cron] Scheduled daily at midnight via node-cron");
  } catch (_err) {
    // node-cron not installed — fall back to a simple interval check
    const MS_PER_MINUTE = 60000;
    let lastRan = null;

    setInterval(() => {
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);

      if (!lastRan || lastRan < todayMidnight) {
        if (now.getHours() === 0) {
          lastRan = todayMidnight;
          runCron(new Date(todayMidnight));
        }
      }
    }, MS_PER_MINUTE);

    console.log(
      "[Cron] Scheduled via interval fallback (install node-cron for precision)",
    );
  }
}

module.exports = { runCron, scheduleCron, getLastRun };
