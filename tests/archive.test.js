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
});
