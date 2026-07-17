const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("TaskArchive-Test").deleteMany({});
  await db.collection("Insights-Test").deleteMany({});
}

async function seedArchive(events) {
  const db = await getDatabase();
  const at = new Date();
  await db
    .collection("TaskArchive-Test")
    .insertMany(events.map((e) => ({ at, ...e })));
}

async function seedInsight(doc) {
  const db = await getDatabase();
  await db.collection("Insights-Test").insertOne(doc);
}

describe("Insights", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("GET /insights/stats — computed stats", () => {
    // 2026-07-06 is a Monday, so 07-07 = Tue, 07-08 = Wed, 07-09 = Thu
    const habitEvents = [
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed", "Thu"], dueDate: "2026-07-06", completed: true },
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed", "Thu"], dueDate: "2026-07-07", completed: false },
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed", "Thu"], dueDate: "2026-07-08", completed: true },
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed", "Thu"], dueDate: "2026-07-09", completed: true },
    ];

    test("aggregates habit completion rate, streaks, and missed-by-weekday", async () => {
      await seedArchive(habitEvents);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.periodDays).toBe(28);
      expect(res.body.eventCount).toBe(4);
      expect(res.body.habits).toHaveLength(1);

      const habit = res.body.habits[0];
      expect(habit.taskName).toBe("Meditate");
      expect(habit.scheduled).toBe(4);
      expect(habit.completed).toBe(3);
      expect(habit.completionRate).toBe(75);
      expect(habit.currentStreak).toBe(2); // Wed + Thu, broken by Tue miss
      expect(habit.longestStreak).toBe(2);
      expect(habit.missedByDow).toEqual({ Tue: 1 });
    });

    test("aggregates recurring task_result events into scheduled/completed counts", async () => {
      await seedArchive([
        { type: "task_result", taskId: "r1", taskName: "Pay rent", headerName: "Bills", ecdType: "day_of_month", dueDate: "2026-07-01", completed: true },
        { type: "task_result", taskId: "r1", taskName: "Pay rent", headerName: "Bills", ecdType: "day_of_month", dueDate: "2026-07-08", completed: false },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.recurringTasks).toHaveLength(1);
      const task = res.body.recurringTasks[0];
      expect(task.scheduled).toBe(2);
      expect(task.completed).toBe(1);
      expect(task.completionRate).toBe(50);
    });

    test("aggregates call_result events into per-person rates and miss streaks", async () => {
      await seedArchive([
        { type: "call_result", callId: "c1", callName: "Grandma", frequency: "biweekly", dueDate: "2026-06-15", completed: true, doneAt: "2026-06-10T12:00:00.000Z" },
        { type: "call_result", callId: "c1", callName: "Grandma", frequency: "biweekly", dueDate: "2026-06-30", completed: false, doneAt: null },
        { type: "call_result", callId: "c1", callName: "Grandma", frequency: "biweekly", dueDate: "2026-07-15", completed: false, doneAt: null },
        { type: "call_result", callId: "c2", callName: "Dentist", frequency: "monthly", dueDate: "2026-06-30", completed: true, doneAt: "2026-06-28T09:00:00.000Z" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.calls).toHaveLength(2);

      const grandma = res.body.calls.find((c) => c.callName === "Grandma");
      expect(grandma.frequency).toBe("biweekly");
      expect(grandma.scheduled).toBe(3);
      expect(grandma.completed).toBe(1);
      expect(grandma.completionRate).toBe(33);
      expect(grandma.currentMissStreak).toBe(2); // missed 06-30 and 07-15
      expect(grandma.recentResults).toEqual([
        { dueDate: "2026-06-15", completed: true },
        { dueDate: "2026-06-30", completed: false },
        { dueDate: "2026-07-15", completed: false },
      ]);

      const dentist = res.body.calls.find((c) => c.callName === "Dentist");
      expect(dentist.frequency).toBe("monthly");
      expect(dentist.completionRate).toBe(100);
      expect(dentist.currentMissStreak).toBe(0);

      // Calls have no header and must not leak into the per-header rollup
      expect(res.body.byHeader).toEqual({});
    });

    test("returns an empty calls array when there are no call_result events", async () => {
      await seedArchive(habitEvents);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.calls).toEqual([]);
    });

    test("computes one-time task slippage from plannedFor vs doneAt", async () => {
      await seedArchive([
        { type: "task_completed", taskId: "t1", taskName: "Ship report", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-08T00:00:00Z" },
        { type: "task_completed", taskId: "t2", taskName: "No plan", headerName: "Work", plannedFor: null, doneAt: "2026-07-08T00:00:00Z" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.oneTimeTasks.completedCount).toBe(2);
      expect(res.body.oneTimeTasks.avgSlippageDays).toBe(2); // only t1 counts
      const shipped = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "Ship report",
      );
      expect(shipped.slippageDays).toBe(2);
      const noPlan = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "No plan",
      );
      expect(noPlan.slippageDays).toBeNull();
    });

    test("counts reschedules and pushedLater per task, most-rescheduled first", async () => {
      await seedArchive([
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Work", pushedLater: true },
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Work", pushedLater: false },
        { type: "task_rescheduled", taskId: "t2", taskName: "Once", headerName: "Work", pushedLater: false },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.reschedules).toHaveLength(2);
      expect(res.body.reschedules[0].taskName).toBe("Dodger");
      expect(res.body.reschedules[0].total).toBe(2);
      expect(res.body.reschedules[0].pushedLater).toBe(1);
      expect(res.body.reschedules[1].taskName).toBe("Once");
    });

    test("rolls up completed/missed/reschedules per header", async () => {
      await seedArchive([
        ...habitEvents,
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Health", pushedLater: true },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.byHeader.Health).toEqual({
        completed: 3,
        missed: 1,
        reschedules: 1,
      });
    });

    test("respects the days query param", async () => {
      await seedArchive(habitEvents);
      const res = await request(app).get("/insights/stats?days=7").expect(200);
      expect(res.body.periodDays).toBe(7);
    });
  });

  describe("GET /insights/latest", () => {
    test("returns 404 when no report has been generated", async () => {
      const res = await request(app).get("/insights/latest").expect(404);
      expect(res.body.error).toBeDefined();
    });

    test("returns the most recent report", async () => {
      await seedInsight({
        generatedAt: new Date("2026-07-01T00:00:00Z"),
        periodDays: 28,
        report: { summary: "older" },
      });
      await seedInsight({
        generatedAt: new Date("2026-07-09T00:00:00Z"),
        periodDays: 28,
        report: { summary: "newer" },
      });

      const res = await request(app).get("/insights/latest").expect(200);
      expect(res.body.report.summary).toBe("newer");
    });
  });

  describe("GET /insights/history", () => {
    beforeEach(async () => {
      await seedInsight({ generatedAt: new Date("2026-07-01T00:00:00Z"), report: { summary: "first" } });
      await seedInsight({ generatedAt: new Date("2026-07-05T00:00:00Z"), report: { summary: "second" } });
      await seedInsight({ generatedAt: new Date("2026-07-09T00:00:00Z"), report: { summary: "third" } });
    });

    test("returns reports newest first", async () => {
      const res = await request(app).get("/insights/history").expect(200);
      expect(res.body.map((r) => r.report.summary)).toEqual([
        "third",
        "second",
        "first",
      ]);
    });

    test("respects the limit param", async () => {
      const res = await request(app)
        .get("/insights/history?limit=2")
        .expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].report.summary).toBe("third");
    });

    test("falls back to the default limit for invalid values", async () => {
      const res = await request(app)
        .get("/insights/history?limit=abc")
        .expect(200);
      expect(res.body).toHaveLength(3);
    });
  });

  describe("POST /insights/generate", () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = savedKey;
    });

    test("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const res = await request(app).post("/insights/generate").expect(503);
      expect(res.body.error).toContain("ANTHROPIC_API_KEY");
    });

    test("returns 404 when the archive is empty (no API call is made)", async () => {
      process.env.ANTHROPIC_API_KEY = "test-dummy-key";
      const res = await request(app).post("/insights/generate").expect(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("Insight model", () => {
    test("save persists a report and returns it with an _id", async () => {
      const Insight = require("../src/models/Insight");
      const stored = await Insight.save({
        generatedAt: new Date("2026-07-10T00:00:00Z"),
        periodDays: 28,
        model: "test-model",
        stats: {},
        report: { summary: "saved directly" },
      });
      expect(stored._id).toBeDefined();

      const latest = await Insight.latest();
      expect(latest.report.summary).toBe("saved directly");
      expect(latest.model).toBe("test-model");
    });
  });
});
