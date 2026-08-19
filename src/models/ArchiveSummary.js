const BaseModel = require("./BaseModel");
const { utcDayString } = require("../utils/dates");
const { bucket } = require("../utils/stats");

/**
 * The permanent half of the task history.
 *
 * `TaskArchive` is append-only and grew forever; only the last few weeks were
 * ever read. Cron step 10 now folds events older than the retention window
 * into this collection — **one document per calendar month** — and then
 * deletes the raw events. Per-day detail ages out; the monthly totals stay
 * for good, at a few hundred bytes a month.
 *
 * Shape:
 * ```
 * {
 *   month: "2026-07",              // UTC calendar month, the document key
 *   days: ["2026-07-01", ...],     // source days already folded in (idempotency)
 *   eventCount: 412,
 *   habits:    [{ taskName, headerName, scheduled, completed }],
 *   recurring: [{ taskName, headerName, ecdType, scheduled, completed }],
 *   calls:     [{ callName, frequency, scheduled, completed }],
 *   oneTimeTasks: { completed, onTime, late },
 *   reschedules:  { total, pushedLater, pushedLaterNoReason },
 *   deletions:    { count, withReason },
 *   byHeader:  [{ headerName, completed, missed, reschedules, deleted }],
 *   firstAt, lastAt, updatedAt
 * }
 * ```
 *
 * Counters live in **arrays keyed by name**, not objects: task and call names
 * are free text and may contain `.`, which Mongo will not accept in a field
 * name. Folding is a read-modify-write of the single month document, which is
 * safe because only the cron writes here, one run at a time.
 */

/** A fresh, empty month. */
function emptySummary(month) {
  return {
    month,
    days: [],
    eventCount: 0,
    habits: [],
    recurring: [],
    calls: [],
    oneTimeTasks: { completed: 0, onTime: 0, late: 0 },
    reschedules: { total: 0, pushedLater: 0, pushedLaterNoReason: 0 },
    deletions: { count: 0, withReason: 0 },
    byHeader: [],
    firstAt: null,
    lastAt: null,
  };
}

/** Find-or-append an entry in one of the name-keyed arrays. */
function entry(list, keyField, keyValue, create) {
  let found = list.find((item) => item[keyField] === keyValue);
  if (!found) {
    found = { [keyField]: keyValue, ...create() };
    list.push(found);
  }
  return found;
}

/** The `byHeader` bucket for an event, using the same "(no header)" fallback as the live stats. */
function headerEntry(summary, headerName) {
  return entry(summary.byHeader, "headerName", headerName || "(no header)", () => ({
    completed: 0,
    missed: 0,
    reschedules: 0,
    deleted: 0,
  }));
}

/**
 * The UTC calendar month an event belongs to, e.g. "2026-07".
 * @param {Object} event
 * @returns {string}
 */
function monthOf(event) {
  return utcDayString(new Date(event.at)).slice(0, 7);
}

/** The UTC calendar day an event belongs to, e.g. "2026-07-15". */
function dayOf(event) {
  return utcDayString(new Date(event.at));
}

/**
 * Fold a month's worth of expiring events into its summary.
 *
 * **Idempotent by source day.** Every event whose day already appears in
 * `summary.days` is ignored, so a cron run that folded a day but died before
 * deleting the raw events can safely repeat: the second run re-reads the same
 * events, counts nothing twice, and finishes the delete. This is why step 10
 * only ever prunes whole UTC days — a day split across two runs would be
 * counted once and dropped once.
 *
 * Pure: returns a new summary, mutates nothing.
 *
 * @param {Object} summary  The month's current summary (or `emptySummary`)
 * @param {Array} events    Archive events belonging to that month
 * @returns {{summary: Object, folded: number}}  folded = events actually counted
 */
function foldEvents(summary, events) {
  const next = JSON.parse(JSON.stringify(summary));
  const seenDays = new Set(next.days);

  const fresh = events.filter((event) => !seenDays.has(dayOf(event)));
  if (fresh.length === 0) return { summary: next, folded: 0 };

  for (const event of fresh) {
    next.eventCount++;
    const at = new Date(event.at).toISOString();
    if (!next.firstAt || at < next.firstAt) next.firstAt = at;
    if (!next.lastAt || at > next.lastAt) next.lastAt = at;

    switch (event.type) {
      case "habit_result": {
        const habit = entry(next.habits, "taskName", event.taskName, () => ({
          headerName: event.headerName || null,
          scheduled: 0,
          completed: 0,
        }));
        habit.scheduled++;
        if (event.completed) habit.completed++;
        const header = headerEntry(next, event.headerName);
        if (event.completed) header.completed++;
        else header.missed++;
        break;
      }
      case "task_result": {
        const task = entry(next.recurring, "taskName", event.taskName, () => ({
          headerName: event.headerName || null,
          ecdType: event.ecdType || null,
          scheduled: 0,
          completed: 0,
        }));
        task.scheduled++;
        if (event.completed) task.completed++;
        const header = headerEntry(next, event.headerName);
        if (event.completed) header.completed++;
        else header.missed++;
        break;
      }
      case "task_completed": {
        next.oneTimeTasks.completed++;
        // Same on-time rule as the live stats: finished on or before the
        // planned day is a win, only a later completion is late.
        if (event.plannedFor && event.doneAt) {
          const planned = event.plannedFor;
          const done = utcDayString(new Date(event.doneAt));
          if (done <= planned) next.oneTimeTasks.onTime++;
          else next.oneTimeTasks.late++;
        }
        headerEntry(next, event.headerName).completed++;
        break;
      }
      case "call_result": {
        const call = entry(next.calls, "callName", event.callName, () => ({
          frequency: event.frequency || null,
          scheduled: 0,
          completed: 0,
        }));
        call.scheduled++;
        if (event.completed) call.completed++;
        // Calls have no header — deliberately not counted in byHeader
        break;
      }
      case "task_rescheduled": {
        next.reschedules.total++;
        if (event.pushedLater) {
          next.reschedules.pushedLater++;
          if (!event.reason) next.reschedules.pushedLaterNoReason++;
        }
        headerEntry(next, event.headerName).reschedules++;
        break;
      }
      case "task_deleted": {
        next.deletions.count++;
        if (event.reason) next.deletions.withReason++;
        headerEntry(next, event.headerName).deleted++;
        break;
      }
    }
  }

  next.days = [...new Set([...next.days, ...fresh.map(dayOf)])].sort();
  return { summary: next, folded: fresh.length };
}

class ArchiveSummary extends BaseModel {
  static collectionName = "ArchiveSummary";

  /** Oldest month first — the order a history view reads them in. */
  static sortBy = { month: 1 };

  /**
   * One document per month is the whole invariant here, and `save()` upserts
   * on `month` — a unique index makes a duplicate impossible rather than
   * merely unlikely. Idempotent, so it is safe to call on every boot.
   */
  static async ensureIndexes() {
    const collection = await this.getCollection();
    await collection.createIndex(
      { month: 1 },
      { name: "month_1", unique: true },
    );
  }

  /**
   * The stored summary for a month, or a blank one.
   * @param {string} month  "YYYY-MM"
   * @returns {Promise<Object>}
   */
  static async forMonth(month) {
    const collection = await this.getCollection();
    const stored = await collection.findOne({ month });
    return stored || emptySummary(month);
  }

  /**
   * Write a month's summary, replacing whatever was there.
   * @param {Object} summary
   * @returns {Promise<Object>} the stored document
   */
  static async save(summary) {
    const collection = await this.getCollection();
    const doc = { ...summary, updatedAt: this.stamp() };
    delete doc._id;
    await collection.replaceOne({ month: doc.month }, doc, { upsert: true });
    return doc;
  }

  /**
   * Fold a batch of expiring events into their months and persist the result.
   * Events are grouped by month so a batch spanning a month boundary is
   * handled in one pass.
   * @param {Array} events
   * @returns {Promise<{monthsTouched: number, eventsFolded: number}>}
   */
  static async foldAll(events) {
    if (events.length === 0) return { monthsTouched: 0, eventsFolded: 0 };

    const byMonth = {};
    for (const event of events) {
      bucket(byMonth, monthOf(event), () => []).push(event);
    }

    let monthsTouched = 0;
    let eventsFolded = 0;
    for (const [month, monthEvents] of Object.entries(byMonth)) {
      const current = await this.forMonth(month);
      const { summary, folded } = foldEvents(current, monthEvents);
      if (folded === 0) continue; // already folded by an earlier run
      await this.save(summary);
      monthsTouched++;
      eventsFolded += folded;
    }
    return { monthsTouched, eventsFolded };
  }
}

module.exports = { ArchiveSummary, foldEvents, emptySummary };
