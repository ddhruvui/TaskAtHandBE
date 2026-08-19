const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("TaskArchive-Test").deleteMany({});
  await db.collection("Insights-Test").deleteMany({});
  await db.collection("InsightStats-Test").deleteMany({});
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
      expect(res.body.oneTimeTasks.lateCount).toBe(1);
      expect(res.body.oneTimeTasks.onTimeCount).toBe(0);
      const shipped = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "Ship report",
      );
      expect(shipped.slippageDays).toBe(2);
      expect(shipped.onTime).toBe(false);
      const noPlan = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "No plan",
      );
      expect(noPlan.slippageDays).toBeNull();
      // No planned date to be early or late against — neither counted
      expect(noPlan.onTime).toBeNull();
    });

    test("reports zero slippage for a task completed on its scheduled date, whatever the time of day", async () => {
      await seedArchive([
        // Late-evening completion on the scheduled day: the day-boundary diff
        // must stay 0 rather than rounding the part-day up to a full day slip
        { type: "task_completed", taskId: "t1", taskName: "Evening finish", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-06T23:59:00Z" },
        { type: "task_completed", taskId: "t2", taskName: "Midday finish", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-06T12:30:00Z" },
        { type: "task_completed", taskId: "t3", taskName: "Morning finish", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-06T07:15:00Z" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      for (const name of ["Evening finish", "Midday finish", "Morning finish"]) {
        const task = res.body.oneTimeTasks.recent.find(
          (t) => t.taskName === name,
        );
        expect(task.slippageDays).toBe(0);
        expect(task.onTime).toBe(true);
      }
      expect(res.body.oneTimeTasks.avgSlippageDays).toBe(0);
      expect(res.body.oneTimeTasks.onTimeCount).toBe(3);
      expect(res.body.oneTimeTasks.lateCount).toBe(0);
    });

    test("counts slippage in whole days across a boundary and keeps an early finish out of the average", async () => {
      await seedArchive([
        // 07-07T00:30 is 1 calendar day past 07-06, not 0 as a raw-ms round would give
        { type: "task_completed", taskId: "t1", taskName: "Just past midnight", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-07T00:30:00Z" },
        { type: "task_completed", taskId: "t2", taskName: "Done early", headerName: "Work", plannedFor: "2026-07-06", doneAt: "2026-07-04T18:00:00Z" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      const late = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "Just past midnight",
      );
      expect(late.slippageDays).toBe(1);
      expect(late.onTime).toBe(false);
      const early = res.body.oneTimeTasks.recent.find(
        (t) => t.taskName === "Done early",
      );
      // The per-task figure keeps the "2 days early" detail...
      expect(early.slippageDays).toBe(-2);
      expect(early.onTime).toBe(true);
      // ...but early counts as 0 slip in the average, so it can't cancel out
      // the late task and report the pair as ahead of schedule.
      expect(res.body.oneTimeTasks.avgSlippageDays).toBe(0.5);
      expect(res.body.oneTimeTasks.onTimeCount).toBe(1);
      expect(res.body.oneTimeTasks.lateCount).toBe(1);
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

    test("splits pushed-later postpones by reason and collects stated reasons", async () => {
      await seedArchive([
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Work", pushedLater: true, reason: "blocked on vendor" },
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Work", pushedLater: true, reason: null },
        { type: "task_rescheduled", taskId: "t1", taskName: "Dodger", headerName: "Work", pushedLater: false, reason: "moved up" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      const dodger = res.body.reschedules[0];
      expect(dodger.pushedLater).toBe(2);
      expect(dodger.pushedLaterWithReason).toBe(1);
      expect(dodger.pushedLaterNoReason).toBe(1);
      expect(dodger.reasons).toEqual(["blocked on vendor"]);
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
        deleted: 0,
      });
    });

    test("aggregates task_deleted events into deletions and per-header counts", async () => {
      await seedArchive([
        { type: "task_deleted", taskId: "d1", taskName: "Learn cello", headerName: "Hobbies", ecdType: "date", reason: "too big, kept putting it off" },
        { type: "task_deleted", taskId: "d2", taskName: "Old idea", headerName: "Hobbies", ecdType: null, reason: null },
        { type: "task_deleted", taskId: "d3", taskName: "Duplicate", headerName: "Work", ecdType: "day_of_week", reason: "no longer needed" },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.deletions.count).toBe(3);
      expect(res.body.deletions.withReason).toBe(2);
      expect(res.body.deletions.recent).toHaveLength(3);
      const cello = res.body.deletions.recent.find(
        (d) => d.taskName === "Learn cello",
      );
      expect(cello).toEqual({
        taskName: "Learn cello",
        headerName: "Hobbies",
        ecdType: "date",
        reason: "too big, kept putting it off",
      });
      expect(res.body.byHeader.Hobbies.deleted).toBe(2);
      expect(res.body.byHeader.Work.deleted).toBe(1);
    });

    test("returns an empty deletions rollup when there are no task_deleted events", async () => {
      await seedArchive(habitEvents);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.deletions).toEqual({
        count: 0,
        withReason: 0,
        recent: [],
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
    const savedKey = process.env.GEMINI_API_KEY;

    afterEach(() => {
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
    });

    test("defaults to a Flash model and honours the GEMINI_MODEL override", () => {
      const {
        insightModel,
        DEFAULT_INSIGHT_MODEL,
      } = require("../src/services/insightsService");
      const original = process.env.GEMINI_MODEL;
      delete process.env.GEMINI_MODEL;

      try {
        // Pro carries no free-tier quota (2.5-pro 404s for new users,
        // 3.1-pro-preview 429s on the first call), so the default must be Flash.
        expect(insightModel()).toBe(DEFAULT_INSIGHT_MODEL);
        expect(DEFAULT_INSIGHT_MODEL).toContain("flash");

        // Read per call, so a restart is enough to move to Pro once billed.
        process.env.GEMINI_MODEL = "gemini-3.1-pro-preview";
        expect(insightModel()).toBe("gemini-3.1-pro-preview");
      } finally {
        if (original === undefined) delete process.env.GEMINI_MODEL;
        else process.env.GEMINI_MODEL = original;
      }
    });

    test("returns 503 when GEMINI_API_KEY is not configured", async () => {
      delete process.env.GEMINI_API_KEY;
      const res = await request(app).post("/insights/generate").expect(503);
      expect(res.body.error).toContain("GEMINI_API_KEY");
    });

    test("returns 404 when the archive is empty (no API call is made)", async () => {
      process.env.GEMINI_API_KEY = "test-dummy-key";
      const res = await request(app).post("/insights/generate").expect(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("GET /insights/stats/latest — nightly snapshot (no AI)", () => {
    const {
      refreshStatsSnapshot,
    } = require("../src/services/insightsService");

    // 2026-07-06 is a Monday, so 07-07 = Tue, 07-08 = Wed
    const streakEvents = [
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed"], dueDate: "2026-07-06", completed: false },
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed"], dueDate: "2026-07-07", completed: true },
      { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed"], dueDate: "2026-07-08", completed: true },
    ];

    test("returns 404 before the cron has ever written one", async () => {
      const res = await request(app).get("/insights/stats/latest").expect(404);
      expect(res.body.error).toBeDefined();
    });

    test("stores streaks without any Gemini key configured", async () => {
      const savedKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        await seedArchive(streakEvents);
        await refreshStatsSnapshot();

        const res = await request(app).get("/insights/stats/latest").expect(200);
        expect(res.body.computedAt).toBeDefined();
        expect(res.body.periodDays).toBe(28);
        expect(res.body.eventCount).toBe(3);
        expect(res.body.habits).toHaveLength(1);
        expect(res.body.habits[0].currentStreak).toBe(2);
        expect(res.body.habits[0].completionRate).toBe(67);
      } finally {
        if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = savedKey;
      }
    });

    test("matches what the live stats endpoint computes", async () => {
      await seedArchive(streakEvents);
      await refreshStatsSnapshot();

      const live = await request(app).get("/insights/stats").expect(200);
      const snapshot = await request(app)
        .get("/insights/stats/latest")
        .expect(200);

      const { computedAt, ...stored } = snapshot.body;
      expect(computedAt).toBeDefined();
      expect(stored).toEqual(live.body);
    });

    test("a later refresh overwrites the snapshot rather than stacking", async () => {
      await seedArchive(streakEvents);
      await refreshStatsSnapshot();

      // The habit is missed the next day — the streak must drop, not persist
      await seedArchive([
        { type: "habit_result", taskId: "h1", taskName: "Meditate", headerName: "Health", scheduledDays: ["Mon", "Tue", "Wed"], dueDate: "2026-07-13", completed: false },
      ]);
      await refreshStatsSnapshot();

      const db = await getDatabase();
      expect(await db.collection("InsightStats-Test").countDocuments()).toBe(1);

      const res = await request(app).get("/insights/stats/latest").expect(200);
      expect(res.body.eventCount).toBe(4);
      expect(res.body.habits[0].currentStreak).toBe(0);
    });

    test("records an empty archive instead of leaving stale numbers behind", async () => {
      await seedArchive(streakEvents);
      await refreshStatsSnapshot();

      const db = await getDatabase();
      await db.collection("TaskArchive-Test").deleteMany({});
      await refreshStatsSnapshot();

      const res = await request(app).get("/insights/stats/latest").expect(200);
      expect(res.body.eventCount).toBe(0);
      expect(res.body.habits).toEqual([]);
    });
  });

  describe("isInsightDue — weekly cadence (Fridays)", () => {
    const {
      isInsightDue,
      INSIGHT_DAY_OF_WEEK,
    } = require("../src/services/insightsService");
    // 2026-07-24 is a Friday, so 07-23 = Thu and 07-25 = Sat
    const FRIDAY = new Date("2026-07-24T00:00:00Z");

    test("the report day is Friday", () => {
      expect(INSIGHT_DAY_OF_WEEK).toBe(5);
      expect(FRIDAY.getUTCDay()).toBe(5);
    });

    test("is due on a Friday with no report yet", async () => {
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
    });

    test("is not due on any other day of the week", async () => {
      for (let offset = 1; offset <= 6; offset++) {
        const day = new Date(FRIDAY.getTime() + offset * 86400000);
        await expect(isInsightDue(day)).resolves.toBe(false);
      }
    });

    test("is not due on a Friday a report was already generated on", async () => {
      // A second cron run the same Friday must not spend another API call
      await seedInsight({
        generatedAt: new Date("2026-07-24T00:05:00Z"),
        report: {},
      });
      await expect(
        isInsightDue(new Date("2026-07-24T23:30:00Z")),
      ).resolves.toBe(false);
    });

    test("is due again on the next Friday", async () => {
      await seedInsight({
        generatedAt: new Date("2026-07-17T00:05:00Z"),
        report: {},
      });
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
    });

    test("an off-day manual report does not consume the Friday run", async () => {
      // POST /insights/generate on Wednesday — Friday's analysis still runs
      await seedInsight({
        generatedAt: new Date("2026-07-22T15:00:00Z"),
        report: {},
      });
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
    });

    test("measures against the newest report, ignoring older ones", async () => {
      await seedInsight({
        generatedAt: new Date("2026-06-26T00:05:00Z"),
        report: {},
      });
      await seedInsight({
        generatedAt: new Date("2026-07-24T00:05:00Z"),
        report: {},
      });
      await expect(isInsightDue(FRIDAY)).resolves.toBe(false);
    });

    test("is due when the stored report has no generatedAt", async () => {
      await seedInsight({ report: {} });
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
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
