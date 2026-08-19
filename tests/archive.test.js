const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

// Cron run dates (UTC): 2026-03-08 is a Sunday, so "yesterday" is Sat 2026-03-07
const RUN_DATE = "2026-03-08";
const YESTERDAY = "2026-03-07";

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
  await db.collection("TaskArchive-Test").deleteMany({});
  await db.collection("ArchiveSummary-Test").deleteMany({});
}

async function getArchiveEvents(filter = {}) {
  const db = await getDatabase();
  return db
    .collection("TaskArchive-Test")
    .find(filter)
    .sort({ at: 1 })
    .toArray();
}

async function createHeader(name) {
  const res = await request(app).post("/headers").send({ name });
  return res.body;
}

async function createTask(data) {
  const res = await request(app).post("/tasks").send(data);
  return res.body;
}

async function runCron(date = RUN_DATE) {
  return request(app).post("/cron/run").send({ date }).expect(200);
}

describe("TaskArchive event log", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("Cron Step 0 — archive yesterday's outcomes", () => {
    test("logs habit_result with completed=true and doneAt for a done day_of_week task", async () => {
      const h = await createHeader("Health");
      const t = await createTask({
        name: "Meditate",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Sat"] },
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      await runCron();

      const events = await getArchiveEvents({ type: "habit_result" });
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.taskId).toBe(t._id);
      expect(e.taskName).toBe("Meditate");
      expect(e.headerName).toBe("Health");
      expect(e.scheduledDays).toEqual(["Sat"]);
      expect(e.dueDate).toBe(YESTERDAY);
      expect(e.completed).toBe(true);
      expect(e.doneAt).not.toBeNull();
      expect(e.at).toBeInstanceOf(Date);
    });

    test("logs habit_result with completed=false and doneAt=null for a missed day_of_week task", async () => {
      const h = await createHeader("Health");
      const t = await createTask({
        name: "Run",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Sat"] },
      });

      await runCron();

      const events = await getArchiveEvents({ type: "habit_result" });
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe(t._id);
      expect(events[0].completed).toBe(false);
      expect(events[0].doneAt).toBeNull();
    });

    test("does not log habit_result for day_of_week tasks not scheduled yesterday", async () => {
      const h = await createHeader("Health");
      await createTask({
        name: "Weekday-only habit",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Mon", "Wed"] },
      });

      await runCron();

      const events = await getArchiveEvents({ type: "habit_result" });
      expect(events).toHaveLength(0);
    });

    test("logs task_result for a day_of_month task due yesterday", async () => {
      const h = await createHeader("Bills");
      const t = await createTask({
        name: "Pay rent",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [7] },
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      await runCron();

      const events = await getArchiveEvents({ type: "task_result" });
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.taskId).toBe(t._id);
      expect(e.ecdType).toBe("day_of_month");
      expect(e.ecdValue).toEqual([7]);
      expect(e.dueDate).toBe(YESTERDAY);
      expect(e.completed).toBe(true);
    });

    test("logs task_result for a day_of_year task whose month/day matched yesterday (any year)", async () => {
      const h = await createHeader("Annual");
      const t = await createTask({
        name: "Anniversary",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "7/3/2020" },
      });

      await runCron();

      const events = await getArchiveEvents({ type: "task_result" });
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe(t._id);
      expect(events[0].ecdType).toBe("day_of_year");
      expect(events[0].ecdValue).toBe("7/3/2020");
      expect(events[0].completed).toBe(false);
    });

    test("is idempotent — rerunning the cron for the same date does not double-log", async () => {
      const h = await createHeader("Health");
      const habit = await createTask({
        name: "Meditate",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Sat"] },
      });
      const monthly = await createTask({
        name: "Pay rent",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [7] },
      });
      const yearly = await createTask({
        name: "Anniversary",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "7/3/2020" },
      });
      await request(app).put(`/tasks/${habit._id}`).send({ done: true });

      await runCron();
      await runCron();

      for (const taskId of [habit._id, monthly._id, yearly._id]) {
        const events = await getArchiveEvents({ taskId });
        expect(events).toHaveLength(1);
      }
    });
  });

  describe("Cron Step 5 — task_completed archived before deletion", () => {
    test("archives a done date task with plannedFor, taskCreatedAt, and doneAt before deleting it", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Ship report",
        headerId: h._id,
        ecd: { type: "date", value: "2026-03-01" },
      });
      // Keep the header non-empty so step 6 doesn't delete it after the done
      // task is removed by step 5 (the header lookup below would 404).
      await createTask({ name: "keep header alive", headerId: h._id });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      await runCron();

      const events = await getArchiveEvents({ type: "task_completed" });
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.taskId).toBe(t._id);
      expect(e.taskName).toBe("Ship report");
      expect(e.headerName).toBe("Work");
      expect(e.ecdType).toBe("date");
      expect(e.plannedFor).toBe("2026-03-01");
      expect(e.taskCreatedAt).not.toBeNull();
      expect(e.doneAt).not.toBeNull();

      // The task itself is gone
      const tasks = await request(app).get(`/tasks?headerId=${h._id}`);
      expect(tasks.body.map((x) => x._id)).not.toContain(t._id);
    });

    test("archives a done no-ecd task with ecdType=null and plannedFor=null", async () => {
      const h = await createHeader("Misc");
      const t = await createTask({ name: "One-off chore", headerId: h._id });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      await runCron();

      const events = await getArchiveEvents({ type: "task_completed" });
      expect(events).toHaveLength(1);
      expect(events[0].ecdType).toBeNull();
      expect(events[0].plannedFor).toBeNull();
    });
  });

  describe("task_completed — archived on header delete cascade", () => {
    test("archives a header's done tasks before the cascade delete", async () => {
      const h = await createHeader("Work");
      const doneDate = await createTask({
        name: "Ship report",
        headerId: h._id,
        ecd: { type: "date", value: "2026-03-01" },
      });
      const doneHabit = await createTask({
        name: "Weekly review",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Mon"] },
      });
      await createTask({ name: "Still pending", headerId: h._id });
      await request(app).put(`/tasks/${doneDate._id}`).send({ done: true });
      await request(app).put(`/tasks/${doneHabit._id}`).send({ done: true });

      await request(app).delete(`/headers/${h._id}`).expect(200);

      const events = await getArchiveEvents({ type: "task_completed" });
      expect(events.map((e) => e.taskId).sort()).toEqual(
        [doneDate._id, doneHabit._id].sort(),
      );

      const dateEvent = events.find((e) => e.taskId === doneDate._id);
      expect(dateEvent.taskName).toBe("Ship report");
      expect(dateEvent.headerName).toBe("Work");
      expect(dateEvent.ecdType).toBe("date");
      expect(dateEvent.plannedFor).toBe("2026-03-01");
      expect(dateEvent.doneAt).not.toBeNull();

      const habitEvent = events.find((e) => e.taskId === doneHabit._id);
      expect(habitEvent.ecdType).toBe("day_of_week");
      expect(habitEvent.plannedFor).toBeNull();
    });

    test("does not archive undone tasks on a header delete cascade", async () => {
      const h = await createHeader("Misc");
      await createTask({ name: "Undone chore", headerId: h._id });

      await request(app).delete(`/headers/${h._id}`).expect(200);

      const completed = await getArchiveEvents({ type: "task_completed" });
      const deleted = await getArchiveEvents({ type: "task_deleted" });
      expect(completed).toHaveLength(0);
      expect(deleted).toHaveLength(0);
    });
  });

  describe("task_rescheduled — logged on ECD change via PUT /tasks/:id", () => {
    test("logs fromEcd/toEcd with pushedLater=true when a date moves later", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Procrastinated",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-25" } })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.taskId).toBe(t._id);
      expect(e.headerName).toBe("Work");
      expect(e.fromEcd).toEqual({ type: "date", value: "2026-07-20" });
      expect(e.toEcd).toEqual({ type: "date", value: "2026-07-25" });
      expect(e.pushedLater).toBe(true);
    });

    test("pushedLater=false when a date moves earlier", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Moved up",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-15" } })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      expect(events[0].pushedLater).toBe(false);
    });

    test("pushedLater=false when the ECD type changes away from date", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Now recurring",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "day_of_week", value: ["Mon"] } })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      expect(events[0].pushedLater).toBe(false);
      expect(events[0].toEcd).toEqual({ type: "day_of_week", value: ["Mon"] });
    });

    test("does not log when the ECD is unchanged", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Unchanged",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-20" } })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(0);
    });

    test("stores the trimmed postpone reason on the event", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Blocked",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({
          ecd: { type: "date", value: "2026-07-25" },
          reason: "  waiting on the vendor  ",
        })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      expect(events[0].pushedLater).toBe(true);
      expect(events[0].reason).toBe("waiting on the vendor");
    });

    test("stores reason=null when a postpone has no reason", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Silent postpone",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-25" } })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBeNull();
    });

    test("treats a blank/whitespace reason as no reason", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Whitespace reason",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-25" }, reason: "   " })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBeNull();
    });

    test("rejects a non-string reason with 400 and logs nothing", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Bad reason",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .put(`/tasks/${t._id}`)
        .send({ ecd: { type: "date", value: "2026-07-25" }, reason: 42 })
        .expect(400);

      const events = await getArchiveEvents({ type: "task_rescheduled" });
      expect(events).toHaveLength(0);
    });

    test("does not persist reason onto the task document", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "No leak",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      const res = await request(app)
        .put(`/tasks/${t._id}`)
        .send({
          ecd: { type: "date", value: "2026-07-25" },
          reason: "should not be stored on the task",
        })
        .expect(200);

      expect(res.body.reason).toBeUndefined();
    });
  });

  describe("task_deleted — logged on manual delete of an undone task", () => {
    test("logs a task_deleted event with the reason for an undone task", async () => {
      const h = await createHeader("Work");
      const t = await createTask({
        name: "Abandoned",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      const res = await request(app)
        .delete(`/tasks/${t._id}`)
        .send({ reason: "No longer relevant this week" })
        .expect(200);
      expect(res.body).toEqual({ deleted: t._id });

      const events = await getArchiveEvents({ type: "task_deleted" });
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.taskId).toBe(t._id);
      expect(e.taskName).toBe("Abandoned");
      expect(e.headerName).toBe("Work");
      expect(e.ecdType).toBe("date");
      expect(e.ecd).toEqual({ type: "date", value: "2026-07-20" });
      expect(e.reason).toBe("No longer relevant this week");
    });

    test("trims the reason before storing it", async () => {
      const h = await createHeader("Work");
      const t = await createTask({ name: "Trim me", headerId: h._id });

      await request(app)
        .delete(`/tasks/${t._id}`)
        .send({ reason: "  too big  " })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_deleted" });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe("too big");
      expect(events[0].ecdType).toBeNull();
    });

    test("logs task_deleted with reason=null when no reason is provided", async () => {
      const h = await createHeader("Work");
      const t = await createTask({ name: "No reason", headerId: h._id });

      await request(app).delete(`/tasks/${t._id}`).expect(200);

      const events = await getArchiveEvents({ type: "task_deleted" });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBeNull();
    });

    test("does NOT log task_deleted when a done task is deleted", async () => {
      const h = await createHeader("Work");
      const t = await createTask({ name: "Finished", headerId: h._id });
      await request(app).put(`/tasks/${t._id}`).send({ done: true }).expect(200);

      await request(app)
        .delete(`/tasks/${t._id}`)
        .send({ reason: "ignored for done tasks" })
        .expect(200);

      const events = await getArchiveEvents({ type: "task_deleted" });
      expect(events).toHaveLength(0);
    });

    test("rejects a non-string reason with 400", async () => {
      const h = await createHeader("Work");
      const t = await createTask({ name: "Bad reason", headerId: h._id });

      await request(app)
        .delete(`/tasks/${t._id}`)
        .send({ reason: { not: "a string" } })
        .expect(400);

      const events = await getArchiveEvents({ type: "task_deleted" });
      expect(events).toHaveLength(0);
    });
  });

  describe("GET /archive", () => {
    async function seedEvent(doc) {
      const db = await getDatabase();
      await db
        .collection("TaskArchive-Test")
        .insertOne({ at: new Date(), ...doc });
    }

    test("returns events from the period, oldest first", async () => {
      const db = await getDatabase();
      const older = new Date(Date.now() - 2 * 86400000);
      const newer = new Date(Date.now() - 1 * 86400000);
      await db.collection("TaskArchive-Test").insertMany([
        { type: "habit_result", taskName: "B-newer", at: newer },
        { type: "habit_result", taskName: "A-older", at: older },
      ]);

      const res = await request(app).get("/archive").expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].taskName).toBe("A-older");
      expect(res.body[1].taskName).toBe("B-newer");
    });

    test("filters by type", async () => {
      await seedEvent({ type: "habit_result", taskName: "Habit" });
      await seedEvent({ type: "task_completed", taskName: "OneOff" });

      const res = await request(app)
        .get("/archive?type=task_completed")
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].type).toBe("task_completed");
    });

    test("excludes events older than the requested window", async () => {
      const db = await getDatabase();
      await db.collection("TaskArchive-Test").insertMany([
        {
          type: "habit_result",
          taskName: "Ancient",
          at: new Date(Date.now() - 40 * 86400000),
        },
        { type: "habit_result", taskName: "Recent", at: new Date() },
      ]);

      const res = await request(app).get("/archive?days=28").expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].taskName).toBe("Recent");
    });

    test("falls back to the default period for an invalid days param", async () => {
      await seedEvent({ type: "habit_result", taskName: "Recent" });

      const res = await request(app).get("/archive?days=0").expect(200);
      expect(res.body).toHaveLength(1);
    });
  });
  // ─── Retention: summarise, then prune (cron step 10) ──────────────────────
  describe("Archive retention (cron step 10)", () => {
    const DAY = 86400000;

    /** Insert an event stamped `daysOld` days before now (real clock). */
    async function seedAged(daysOld, doc) {
      const db = await getDatabase();
      const at = new Date(Date.now() - daysOld * DAY);
      await db
        .collection("TaskArchive-Test")
        .insertOne({ at, headerName: "Health", ...doc });
      return at;
    }

    async function summaries() {
      const db = await getDatabase();
      return db
        .collection("ArchiveSummary-Test")
        .find({})
        .sort({ month: 1 })
        .toArray();
    }

    /** Step 10 reads the real clock, so any run date exercises it. */
    async function runCron() {
      return request(app)
        .post("/cron/run")
        .send({ date: `${RUN_DATE}T00:00:00.000Z`, skipInsights: true })
        .expect(200);
    }

    beforeEach(clearCollections);

    test("keeps events inside the retention window", async () => {
      await seedAged(5, { type: "habit_result", taskName: "Recent", completed: true });

      const res = await runCron();

      expect(res.body.archiveEventsPruned).toBe(0);
      expect(res.body.archiveCutoff).toBeNull();
      expect(await getArchiveEvents()).toHaveLength(1);
      expect(await summaries()).toHaveLength(0);
    });

    test("folds an expired event into its month and deletes the raw row", async () => {
      const at = await seedAged(45, {
        type: "habit_result",
        taskName: "Meditate",
        completed: true,
      });
      const month = at.toISOString().slice(0, 7);

      const res = await runCron();

      expect(res.body.archiveEventsPruned).toBe(1);
      expect(res.body.archiveEventsFolded).toBe(1);
      expect(res.body.archiveMonthsSummarised).toBe(1);
      expect(res.body.archiveCutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(await getArchiveEvents()).toHaveLength(0);

      const stored = await summaries();
      expect(stored).toHaveLength(1);
      expect(stored[0].month).toBe(month);
      expect(stored[0].eventCount).toBe(1);
      expect(stored[0].habits).toEqual([
        { taskName: "Meditate", headerName: "Health", scheduled: 1, completed: 1 },
      ]);
    });

    test("counts habit hits and misses, and rolls them up per header", async () => {
      await seedAged(40, { type: "habit_result", taskName: "Meditate", completed: true });
      await seedAged(41, { type: "habit_result", taskName: "Meditate", completed: false });
      await seedAged(42, { type: "task_rescheduled", taskName: "Gym", pushedLater: true });

      await runCron();

      const [stored] = await summaries();
      expect(stored.habits[0]).toMatchObject({ scheduled: 2, completed: 1 });
      expect(stored.reschedules).toEqual({
        total: 1,
        pushedLater: 1,
        pushedLaterNoReason: 1,
      });
      expect(stored.byHeader).toEqual([
        { headerName: "Health", completed: 1, missed: 1, reschedules: 1, deleted: 0 },
      ]);
    });

    test("applies the on-time rule to completed one-off tasks", async () => {
      const early = new Date(Date.now() - 50 * DAY);
      const plannedFor = early.toISOString().slice(0, 10);
      await seedAged(50, {
        type: "task_completed",
        taskName: "On the day",
        plannedFor,
        doneAt: early.toISOString(),
      });
      await seedAged(50, {
        type: "task_completed",
        taskName: "Late",
        plannedFor: new Date(Date.now() - 55 * DAY).toISOString().slice(0, 10),
        doneAt: early.toISOString(),
      });

      await runCron();

      const [stored] = await summaries();
      expect(stored.oneTimeTasks).toEqual({ completed: 2, onTime: 1, late: 1 });
    });

    test("a second run neither double-counts nor resurrects anything", async () => {
      await seedAged(45, { type: "habit_result", taskName: "Meditate", completed: true });

      await runCron();
      const second = await runCron();

      expect(second.body.archiveEventsPruned).toBe(0);
      const stored = await summaries();
      expect(stored).toHaveLength(1);
      expect(stored[0].eventCount).toBe(1);
      expect(stored[0].habits[0].scheduled).toBe(1);
    });

    test("re-folding a day already summarised counts it once", async () => {
      // Simulates a run that folded a batch and died before deleting it: the
      // raw events are still there on the next pass.
      const {
        foldEvents,
        emptySummary,
      } = require("../src/models/ArchiveSummary");
      const events = [
        { at: "2026-07-15T01:00:00Z", type: "habit_result", taskName: "M", completed: true },
        { at: "2026-07-15T02:00:00Z", type: "habit_result", taskName: "M", completed: false },
      ];

      const first = foldEvents(emptySummary("2026-07"), events);
      expect(first.folded).toBe(2);
      expect(first.summary.days).toEqual(["2026-07-15"]);

      const second = foldEvents(first.summary, events);
      expect(second.folded).toBe(0);
      expect(second.summary.eventCount).toBe(2);
      expect(second.summary.habits[0].scheduled).toBe(2);
    });

    test("splits a batch across the months it belongs to", async () => {
      const { ArchiveSummary } = require("../src/models/ArchiveSummary");
      await ArchiveSummary.foldAll([
        { at: "2026-06-30T23:00:00Z", type: "habit_result", taskName: "M", completed: true },
        { at: "2026-07-01T01:00:00Z", type: "habit_result", taskName: "M", completed: true },
      ]);

      const stored = await summaries();
      expect(stored.map((s) => s.month)).toEqual(["2026-06", "2026-07"]);
      expect(stored.every((s) => s.eventCount === 1)).toBe(true);
    });

    test("GET /archive/summary returns the months oldest first", async () => {
      const { ArchiveSummary } = require("../src/models/ArchiveSummary");
      await ArchiveSummary.foldAll([
        { at: "2026-07-02T00:00:00Z", type: "habit_result", taskName: "M", completed: true },
        { at: "2026-06-02T00:00:00Z", type: "habit_result", taskName: "M", completed: true },
      ]);

      const res = await request(app).get("/archive/summary").expect(200);
      expect(res.body.map((s) => s.month)).toEqual(["2026-06", "2026-07"]);
    });

    test("GET /archive/summary is an empty array before anything is pruned", async () => {
      const res = await request(app).get("/archive/summary").expect(200);
      expect(res.body).toEqual([]);
    });

    test("retention can never be set inside the insights window", async () => {
      const { DEFAULT_PERIOD_DAYS } = require("../src/services/insightsService");
      const original = process.env.ARCHIVE_RETENTION_DAYS;
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.ARCHIVE_RETENTION_DAYS = "1";

      // 20 days old: inside the 28-day insights window, so it must survive
      // even though the configured retention says 1 day.
      await seedAged(20, { type: "habit_result", taskName: "Recent", completed: true });

      try {
        const res = await runCron();
        expect(res.body.archiveEventsPruned).toBe(0);
        expect(await getArchiveEvents()).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`${DEFAULT_PERIOD_DAYS}-day insights window`),
        );
      } finally {
        warn.mockRestore();
        if (original === undefined) delete process.env.ARCHIVE_RETENTION_DAYS;
        else process.env.ARCHIVE_RETENTION_DAYS = original;
      }
    });

    test("a shorter-than-default but still safe window is honoured", async () => {
      const original = process.env.ARCHIVE_RETENTION_DAYS;
      process.env.ARCHIVE_RETENTION_DAYS = "29";
      await seedAged(40, { type: "habit_result", taskName: "Old", completed: true });
      await seedAged(20, { type: "habit_result", taskName: "Recent", completed: true });

      try {
        const res = await runCron();
        expect(res.body.archiveEventsPruned).toBe(1);
        const left = await getArchiveEvents();
        expect(left.map((e) => e.taskName)).toEqual(["Recent"]);
      } finally {
        if (original === undefined) delete process.env.ARCHIVE_RETENTION_DAYS;
        else process.env.ARCHIVE_RETENTION_DAYS = original;
      }
    });
  });
});
