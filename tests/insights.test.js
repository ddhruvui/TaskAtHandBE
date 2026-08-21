const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("TaskArchive-Test").deleteMany({});
  await db.collection("Insights-Test").deleteMany({});
  await db.collection("InsightStats-Test").deleteMany({});
  await db.collection("ArchiveSummary-Test").deleteMany({});
  await db.collection("Vacations-Test").deleteMany({});
}

async function seedVacation(startDate, endDate) {
  const db = await getDatabase();
  await db
    .collection("Vacations-Test")
    .insertOne({ startDate, endDate, note: "" });
}

/** A UTC day string relative to today — vacation rules are measured against the real clock. */
function dayUtc(offsetDays = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed", "Thu"],
        dueDate: "2026-07-06",
        completed: true,
      },
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed", "Thu"],
        dueDate: "2026-07-07",
        completed: false,
      },
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed", "Thu"],
        dueDate: "2026-07-08",
        completed: true,
      },
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed", "Thu"],
        dueDate: "2026-07-09",
        completed: true,
      },
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
        {
          type: "task_result",
          taskId: "r1",
          taskName: "Pay rent",
          headerName: "Bills",
          ecdType: "day_of_month",
          dueDate: "2026-07-01",
          completed: true,
        },
        {
          type: "task_result",
          taskId: "r1",
          taskName: "Pay rent",
          headerName: "Bills",
          ecdType: "day_of_month",
          dueDate: "2026-07-08",
          completed: false,
        },
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
        {
          type: "call_result",
          callId: "c1",
          callName: "Grandma",
          frequency: "biweekly",
          dueDate: "2026-06-15",
          completed: true,
          doneAt: "2026-06-10T12:00:00.000Z",
        },
        {
          type: "call_result",
          callId: "c1",
          callName: "Grandma",
          frequency: "biweekly",
          dueDate: "2026-06-30",
          completed: false,
          doneAt: null,
        },
        {
          type: "call_result",
          callId: "c1",
          callName: "Grandma",
          frequency: "biweekly",
          dueDate: "2026-07-15",
          completed: false,
          doneAt: null,
        },
        {
          type: "call_result",
          callId: "c2",
          callName: "Dentist",
          frequency: "monthly",
          dueDate: "2026-06-30",
          completed: true,
          doneAt: "2026-06-28T09:00:00.000Z",
        },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.calls).toHaveLength(2);

      const grandma = res.body.calls.find((c) => c.callName === "Grandma");
      expect(grandma.frequency).toBe("biweekly");
      expect(grandma.scheduled).toBe(3);
      expect(grandma.completed).toBe(1);
      expect(grandma.completionRate).toBe(33);
      expect(grandma.currentMissStreak).toBe(2); // missed 06-30 and 07-15
      // `exempt` marks a period a vacation swallowed; none here.
      expect(grandma.recentResults).toEqual([
        { dueDate: "2026-06-15", completed: true, exempt: false },
        { dueDate: "2026-06-30", completed: false, exempt: false },
        { dueDate: "2026-07-15", completed: false, exempt: false },
      ]);
      expect(grandma.exemptPeriods).toBe(0);

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
        {
          type: "task_completed",
          taskId: "t1",
          taskName: "Ship report",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-08T00:00:00Z",
        },
        {
          type: "task_completed",
          taskId: "t2",
          taskName: "No plan",
          headerName: "Work",
          plannedFor: null,
          doneAt: "2026-07-08T00:00:00Z",
        },
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
        {
          type: "task_completed",
          taskId: "t1",
          taskName: "Evening finish",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-06T23:59:00Z",
        },
        {
          type: "task_completed",
          taskId: "t2",
          taskName: "Midday finish",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-06T12:30:00Z",
        },
        {
          type: "task_completed",
          taskId: "t3",
          taskName: "Morning finish",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-06T07:15:00Z",
        },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      for (const name of [
        "Evening finish",
        "Midday finish",
        "Morning finish",
      ]) {
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
        {
          type: "task_completed",
          taskId: "t1",
          taskName: "Just past midnight",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-07T00:30:00Z",
        },
        {
          type: "task_completed",
          taskId: "t2",
          taskName: "Done early",
          headerName: "Work",
          plannedFor: "2026-07-06",
          doneAt: "2026-07-04T18:00:00Z",
        },
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
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Work",
          pushedLater: true,
        },
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Work",
          pushedLater: false,
        },
        {
          type: "task_rescheduled",
          taskId: "t2",
          taskName: "Once",
          headerName: "Work",
          pushedLater: false,
        },
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
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Work",
          pushedLater: true,
          reason: "blocked on vendor",
        },
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Work",
          pushedLater: true,
          reason: null,
        },
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Work",
          pushedLater: false,
          reason: "moved up",
        },
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
        {
          type: "task_rescheduled",
          taskId: "t1",
          taskName: "Dodger",
          headerName: "Health",
          pushedLater: true,
        },
      ]);

      const res = await request(app).get("/insights/stats").expect(200);
      expect(res.body.byHeader.Health).toEqual({
        completed: 3,
        missed: 1,
        paused: 0, // days a vacation excused; none here
        reschedules: 1,
        deleted: 0,
      });
    });

    test("aggregates task_deleted events into deletions and per-header counts", async () => {
      await seedArchive([
        {
          type: "task_deleted",
          taskId: "d1",
          taskName: "Learn cello",
          headerName: "Hobbies",
          ecdType: "date",
          reason: "too big, kept putting it off",
        },
        {
          type: "task_deleted",
          taskId: "d2",
          taskName: "Old idea",
          headerName: "Hobbies",
          ecdType: null,
          reason: null,
        },
        {
          type: "task_deleted",
          taskId: "d3",
          taskName: "Duplicate",
          headerName: "Work",
          ecdType: "day_of_week",
          reason: "no longer needed",
        },
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
        duringVacation: false,
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
        duringVacation: 0,
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
      await seedInsight({
        generatedAt: new Date("2026-07-01T00:00:00Z"),
        report: { summary: "first" },
      });
      await seedInsight({
        generatedAt: new Date("2026-07-05T00:00:00Z"),
        report: { summary: "second" },
      });
      await seedInsight({
        generatedAt: new Date("2026-07-09T00:00:00Z"),
        report: { summary: "third" },
      });
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
    const { refreshStatsSnapshot } = require("../src/services/insightsService");

    // 2026-07-06 is a Monday, so 07-07 = Tue, 07-08 = Wed
    const streakEvents = [
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed"],
        dueDate: "2026-07-06",
        completed: false,
      },
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed"],
        dueDate: "2026-07-07",
        completed: true,
      },
      {
        type: "habit_result",
        taskId: "h1",
        taskName: "Meditate",
        headerName: "Health",
        scheduledDays: ["Mon", "Tue", "Wed"],
        dueDate: "2026-07-08",
        completed: true,
      },
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

        const res = await request(app)
          .get("/insights/stats/latest")
          .expect(200);
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
        {
          type: "habit_result",
          taskId: "h1",
          taskName: "Meditate",
          headerName: "Health",
          scheduledDays: ["Mon", "Tue", "Wed"],
          dueDate: "2026-07-13",
          completed: false,
        },
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

  describe("isInsightDue — daily cadence, once per UTC day", () => {
    const { isInsightDue } = require("../src/services/insightsService");
    // 2026-07-24 is a Friday; the cadence no longer cares which day it is.
    const FRIDAY = new Date("2026-07-24T00:00:00Z");

    test("is due with no report yet", async () => {
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
    });

    test("is due on every day of the week", async () => {
      // The old gate only fired on Fridays; a daily report fires on all seven.
      for (let offset = 0; offset <= 6; offset++) {
        const day = new Date(FRIDAY.getTime() + offset * 86400000);
        await expect(isInsightDue(day)).resolves.toBe(true);
      }
    });

    test("is not due again on a day already reported on", async () => {
      // A second cron run the same day must not spend another API call
      await seedInsight({
        generatedAt: new Date("2026-07-24T00:05:00Z"),
        report: {},
      });
      await expect(
        isInsightDue(new Date("2026-07-24T23:30:00Z")),
      ).resolves.toBe(false);
    });

    test("is due again the very next day", async () => {
      await seedInsight({
        generatedAt: new Date("2026-07-23T00:05:00Z"),
        report: {},
      });
      await expect(isInsightDue(FRIDAY)).resolves.toBe(true);
    });

    test("a manual report consumes that day's scheduled run", async () => {
      // POST /insights/generate at 15:00 → the nightly run passes on it
      await seedInsight({
        generatedAt: new Date("2026-07-24T15:00:00Z"),
        report: {},
      });
      await expect(
        isInsightDue(new Date("2026-07-24T23:59:00Z")),
      ).resolves.toBe(false);
    });

    test("the day boundary is UTC, not local", async () => {
      await seedInsight({
        generatedAt: new Date("2026-07-23T23:50:00Z"),
        report: {},
      });
      // 10 minutes later, but a different UTC day
      await expect(
        isInsightDue(new Date("2026-07-24T00:00:00Z")),
      ).resolves.toBe(true);
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

  describe("Insight retention (cron step 11)", () => {
    const Insight = require("../src/models/Insight");

    async function seedReports(count, startIso = "2026-01-01T00:00:00Z") {
      const base = Date.parse(startIso);
      for (let i = 0; i < count; i++) {
        await seedInsight({
          generatedAt: new Date(base + i * 86400000),
          report: { summary: `report ${i}` },
        });
      }
    }

    async function storedReports() {
      const db = await getDatabase();
      return db
        .collection("Insights-Test")
        .find({})
        .sort({ generatedAt: -1 })
        .toArray();
    }

    beforeEach(async () => {
      const db = await getDatabase();
      await db.collection("Insights-Test").deleteMany({});
    });

    test("MAX_HISTORY is the one source of truth for the history ceiling", () => {
      // The controller caps ?limit= at this value; retention floors at it too.
      expect(Insight.MAX_HISTORY).toBe(100);
    });

    test("pruneToNewest keeps the newest N and deletes the rest", async () => {
      await seedReports(12);

      await expect(Insight.pruneToNewest(5)).resolves.toBe(7);

      const left = await storedReports();
      expect(left).toHaveLength(5);
      expect(left.map((r) => r.report.summary)).toEqual([
        "report 11",
        "report 10",
        "report 9",
        "report 8",
        "report 7",
      ]);
    });

    test("pruning twice deletes nothing the second time", async () => {
      await seedReports(8);
      await Insight.pruneToNewest(3);
      await expect(Insight.pruneToNewest(3)).resolves.toBe(0);
      expect(await storedReports()).toHaveLength(3);
    });

    test("is a no-op while under the window", async () => {
      await seedReports(4);
      await expect(Insight.pruneToNewest(100)).resolves.toBe(0);
      expect(await storedReports()).toHaveLength(4);
    });

    test("is a no-op on an empty collection", async () => {
      await expect(Insight.pruneToNewest(100)).resolves.toBe(0);
    });

    test("a full history window is still servable after a prune", async () => {
      // The point of flooring retention at MAX_HISTORY: ?limit=100 must not
      // come back short because retention trimmed inside the ceiling.
      await seedReports(Insight.MAX_HISTORY + 5);
      await Insight.pruneToNewest(Insight.MAX_HISTORY);

      const res = await request(app)
        .get(`/insights/history?limit=${Insight.MAX_HISTORY}`)
        .expect(200);
      expect(res.body).toHaveLength(Insight.MAX_HISTORY);
    });

    test("a cron run reports how many reports it trimmed", async () => {
      await seedReports(Insight.MAX_HISTORY + 3);

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-08T00:00:00.000Z", skipInsights: true })
        .expect(200);

      expect(res.body.insightReportsPruned).toBe(3);
      expect(await storedReports()).toHaveLength(Insight.MAX_HISTORY);
    });

    test("retention can never be set below the history ceiling", async () => {
      const original = process.env.INSIGHT_RETENTION_COUNT;
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.INSIGHT_RETENTION_COUNT = "5";
      await seedReports(12);

      try {
        const res = await request(app)
          .post("/cron/run")
          .send({ date: "2026-03-08T00:00:00.000Z", skipInsights: true })
          .expect(200);

        // 12 reports is under the 100 floor, so nothing is trimmed at all.
        expect(res.body.insightReportsPruned).toBe(0);
        expect(await storedReports()).toHaveLength(12);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("history ceiling"),
        );
      } finally {
        warn.mockRestore();
        if (original === undefined) delete process.env.INSIGHT_RETENTION_COUNT;
        else process.env.INSIGHT_RETENTION_COUNT = original;
      }
    });

    test("a larger window than the ceiling is honoured", async () => {
      const original = process.env.INSIGHT_RETENTION_COUNT;
      process.env.INSIGHT_RETENTION_COUNT = String(Insight.MAX_HISTORY + 10);
      await seedReports(Insight.MAX_HISTORY + 12);

      try {
        const res = await request(app)
          .post("/cron/run")
          .send({ date: "2026-03-08T00:00:00.000Z", skipInsights: true })
          .expect(200);

        expect(res.body.insightReportsPruned).toBe(2);
        expect(await storedReports()).toHaveLength(Insight.MAX_HISTORY + 10);
      } finally {
        if (original === undefined) delete process.env.INSIGHT_RETENTION_COUNT;
        else process.env.INSIGHT_RETENTION_COUNT = original;
      }
    });
  });

  describe("Vacation — days off are not procrastination", () => {
    /** A habit result for a given day. */
    const habit = (dueDate, completed) => ({
      type: "habit_result",
      taskId: "h1",
      taskName: "Meditate",
      headerName: "Health",
      scheduledDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      dueDate,
      completed,
    });

    describe("Habits", () => {
      test("a missed day on vacation leaves the denominator instead of counting as a miss", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([
          habit(dayUtc(-7), true),
          habit(dayUtc(-6), true),
          habit(dayUtc(-5), false), // away
          habit(dayUtc(-4), false), // away
          habit(dayUtc(-3), false), // away
          habit(dayUtc(-2), true),
          habit(dayUtc(-1), true),
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        const h = res.body.habits[0];
        expect(h.pausedDays).toBe(3);
        expect(h.scheduled).toBe(4); // the 3 paused days are not scheduled days
        expect(h.completed).toBe(4);
        expect(h.completionRate).toBe(100); // not 4/7 = 57%
      });

      test("the streak restarts after the break rather than spanning it", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([
          habit(dayUtc(-8), true),
          habit(dayUtc(-7), true),
          habit(dayUtc(-6), true),
          habit(dayUtc(-5), false), // away
          habit(dayUtc(-4), false), // away
          habit(dayUtc(-3), false), // away
          habit(dayUtc(-2), true),
          habit(dayUtc(-1), true),
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        const h = res.body.habits[0];
        expect(h.currentStreak).toBe(2); // the two days since getting back
        expect(h.longestStreak).toBe(3); // the pre-vacation run is still the best
      });

      test("a habit ticked off on vacation counts and keeps the run alive", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([
          habit(dayUtc(-6), true),
          habit(dayUtc(-5), true), // away, but done anyway
          habit(dayUtc(-4), true), // away, but done anyway
          habit(dayUtc(-3), true), // away, but done anyway
          habit(dayUtc(-2), true),
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        const h = res.body.habits[0];
        expect(h.pausedDays).toBe(0);
        expect(h.scheduled).toBe(5);
        expect(h.currentStreak).toBe(5);
      });

      test("vacation misses are excluded from missedByDow", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([habit(dayUtc(-4), false), habit(dayUtc(-1), false)]);

        const res = await request(app).get("/insights/stats").expect(200);
        const misses = Object.values(res.body.habits[0].missedByDow);
        expect(misses.reduce((a, b) => a + b, 0)).toBe(1); // only the real one
      });

      test("recentResults marks vacation days so the UI can show them as paused", async () => {
        await seedVacation(dayUtc(-4), dayUtc(-4));
        await seedArchive([habit(dayUtc(-5), true), habit(dayUtc(-4), false)]);

        const res = await request(app).get("/insights/stats").expect(200);
        const results = res.body.habits[0].recentResults;
        expect(results[0].vacation).toBe(false);
        expect(results[1].vacation).toBe(true);
      });

      test("a vacation day the user never had scheduled changes nothing", async () => {
        await seedVacation(dayUtc(-20), dayUtc(-18));
        await seedArchive([habit(dayUtc(-2), true), habit(dayUtc(-1), true)]);

        const res = await request(app).get("/insights/stats").expect(200);
        const h = res.body.habits[0];
        expect(h.pausedDays).toBe(0);
        expect(h.currentStreak).toBe(2);
      });
    });

    describe("The display freeze", () => {
      test("while away, the window ends the day before departure", async () => {
        await seedVacation(dayUtc(-2), dayUtc(3)); // currently on vacation
        await seedArchive([
          habit(dayUtc(-4), true),
          habit(dayUtc(-3), true),
          habit(dayUtc(-2), false), // away — not reported yet
          habit(dayUtc(-1), false), // away — not reported yet
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.vacation.onVacation).toBe(true);
        expect(res.body.vacation.frozenAt).toBe(dayUtc(-3));
        expect(res.body.eventCount).toBe(2);
        expect(res.body.habits[0].currentStreak).toBe(2); // undisturbed
      });

      test("a habit done mid-trip is archived now and surfaces once home", async () => {
        await seedVacation(dayUtc(-2), dayUtc(3));
        await seedArchive([habit(dayUtc(-4), true), habit(dayUtc(-1), true)]);

        const frozen = await request(app).get("/insights/stats").expect(200);
        expect(frozen.body.habits[0].completed).toBe(1);

        // End the trip yesterday: the same events are now inside the window.
        const db = await getDatabase();
        await db
          .collection("Vacations-Test")
          .updateOne({}, { $set: { endDate: dayUtc(-1) } });

        const home = await request(app).get("/insights/stats").expect(200);
        expect(home.body.vacation.onVacation).toBe(false);
        expect(home.body.vacation.frozenAt).toBeNull();
        expect(home.body.habits[0].completed).toBe(2);
      });

      test("no vacation means no freeze", async () => {
        await seedArchive([habit(dayUtc(-1), true)]);
        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.vacation.onVacation).toBe(false);
        expect(res.body.vacation.frozenAt).toBeNull();
        expect(res.body.vacation.vacationDaysInWindow).toBe(0);
      });

      test("reports how many vacation days fall inside the window", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([habit(dayUtc(-1), true)]);
        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.vacation.vacationDaysInWindow).toBe(3);
      });

      test("reports a trip that just ended as justReturnedFrom", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-1));
        await seedArchive([habit(dayUtc(-6), true)]);
        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.vacation.justReturnedFrom.days).toBe(5);
      });
    });

    describe("One-time task slippage", () => {
      test("subtracts the days away from a task that outlived a trip", async () => {
        await seedVacation("2026-08-03", "2026-08-15");
        await seedArchive([
          {
            type: "task_completed",
            taskName: "File taxes",
            headerName: "Admin",
            plannedFor: "2026-08-01",
            doneAt: new Date("2026-08-20T10:00:00Z"),
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        const task = res.body.oneTimeTasks.recent[0];
        expect(task.slippageDays).toBe(19); // raw, kept for reference
        expect(task.adjustedSlippageDays).toBe(6); // Aug 1-2 plus Aug 16-20
        expect(res.body.oneTimeTasks.avgSlippageDays).toBe(6);
      });

      test("a task planned mid-trip behaves as if it were due the day back", async () => {
        await seedVacation("2026-08-03", "2026-08-15");
        await seedArchive([
          {
            type: "task_completed",
            taskName: "Renew passport",
            plannedFor: "2026-08-05",
            doneAt: new Date("2026-08-20T10:00:00Z"),
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.oneTimeTasks.recent[0].adjustedSlippageDays).toBe(4);
      });

      test("a task finished during the trip is on time, not late", async () => {
        await seedVacation("2026-08-03", "2026-08-15");
        await seedArchive([
          {
            type: "task_completed",
            taskName: "Small thing",
            plannedFor: "2026-08-04",
            doneAt: new Date("2026-08-06T10:00:00Z"),
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.oneTimeTasks.onTimeCount).toBe(1);
        expect(res.body.oneTimeTasks.lateCount).toBe(0);
      });

      test("a task unaffected by the trip is still judged late", async () => {
        await seedVacation("2026-08-03", "2026-08-15");
        await seedArchive([
          {
            type: "task_completed",
            taskName: "Unrelated",
            plannedFor: "2026-09-01",
            doneAt: new Date("2026-09-04T10:00:00Z"),
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.oneTimeTasks.lateCount).toBe(1);
        expect(res.body.oneTimeTasks.recent[0].adjustedSlippageDays).toBe(3);
      });
    });

    describe("Calls — only a near-total overlap forgives a period", () => {
      const call = (dueDate, completed) => ({
        type: "call_result",
        callId: "c1",
        callName: "Grandma",
        frequency: "biweekly",
        dueDate,
        completed,
      });

      test("a period almost entirely swallowed by a trip is exempt", async () => {
        await seedVacation("2026-08-01", "2026-08-13");
        await seedArchive([call("2026-08-15", false)]);

        const res = await request(app).get("/insights/stats").expect(200);
        const c = res.body.calls[0];
        expect(c.exemptPeriods).toBe(1);
        expect(c.scheduled).toBe(0);
        expect(c.currentMissStreak).toBe(0);
      });

      test("a short trip does not excuse a whole fortnight", async () => {
        await seedVacation("2026-08-03", "2026-08-05");
        await seedArchive([call("2026-08-15", false)]);

        const res = await request(app).get("/insights/stats").expect(200);
        const c = res.body.calls[0];
        expect(c.exemptPeriods).toBe(0);
        expect(c.scheduled).toBe(1);
        expect(c.currentMissStreak).toBe(1);
      });

      test("an exempt period does not continue a miss streak across it", async () => {
        // A finished trip, not the current one: an active vacation would
        // freeze the window and hide both periods instead.
        await seedVacation("2026-07-15", "2026-07-31");
        await seedArchive([
          call("2026-07-15", false), // real miss, period 1-14 not covered
          call("2026-07-31", false), // exempt, period 15-31 fully covered
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.calls[0].currentMissStreak).toBe(0);
      });
    });

    describe("Reschedules and deletions", () => {
      test("a vacationMove is counted apart from both reason buckets", async () => {
        await seedArchive([
          {
            type: "task_rescheduled",
            taskId: "t1",
            taskName: "Dentist",
            pushedLater: true,
            reason: null,
            vacationMove: true,
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        const r = res.body.reschedules[0];
        expect(r.vacationMoves).toBe(1);
        expect(r.pushedLaterNoReason).toBe(0);
        expect(r.pushedLaterWithReason).toBe(0);
      });

      test("an unflagged postpone is still unexcused procrastination", async () => {
        await seedArchive([
          {
            type: "task_rescheduled",
            taskId: "t1",
            taskName: "Dentist",
            pushedLater: true,
            reason: null,
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.reschedules[0].pushedLaterNoReason).toBe(1);
        expect(res.body.reschedules[0].vacationMoves).toBe(0);
      });

      test("a deletion made on vacation is counted but labelled", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-3));
        await seedArchive([
          {
            type: "task_deleted",
            taskName: "Dropped",
            reason: "not needed",
            // A deletion has no dueDate, so it is judged on when it happened.
            at: new Date(`${dayUtc(-4)}T10:00:00Z`),
          },
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.deletions.count).toBe(1);
        expect(res.body.deletions.duringVacation).toBe(1);
      });
    });

    describe("Lifetime habit totals", () => {
      test("counts every completion still in the raw archive", async () => {
        await seedArchive([
          habit(dayUtc(-3), true),
          habit(dayUtc(-2), true),
          habit(dayUtc(-1), false),
        ]);

        const res = await request(app).get("/insights/stats").expect(200);
        expect(res.body.habits[0].lifetimeCompleted).toBe(2);
      });

      test("adds the permanent monthly summaries to the raw window", async () => {
        const db = await getDatabase();
        await db.collection("ArchiveSummary-Test").insertMany([
          {
            month: "2026-05",
            days: ["2026-05-01"],
            habits: [{ taskName: "Meditate", scheduled: 31, completed: 28 }],
          },
          {
            month: "2026-06",
            days: ["2026-06-01"],
            habits: [{ taskName: "Meditate", scheduled: 30, completed: 25 }],
          },
        ]);
        await seedArchive([habit(dayUtc(-1), true)]);

        const res = await request(app).get("/insights/stats").expect(200);
        // 28 + 25 folded, plus the one still raw — the two sets are disjoint.
        expect(res.body.habits[0].lifetimeCompleted).toBe(54);
      });

      test("is unaffected by the reporting window", async () => {
        // Explicit `at` values: the window filters on insertion time, and
        // seedArchive would otherwise stamp both events as "now".
        await seedArchive([
          {
            ...habit(dayUtc(-3), true),
            at: new Date(`${dayUtc(-3)}T10:00:00Z`),
          },
          {
            ...habit(dayUtc(-2), true),
            at: new Date(`${dayUtc(-2)}T10:00:00Z`),
          },
        ]);

        const res = await request(app)
          .get("/insights/stats?days=1")
          .expect(200);
        expect(res.body.habits).toHaveLength(0); // outside the 1-day window
        const full = await request(app).get("/insights/stats").expect(200);
        expect(full.body.habits[0].lifetimeCompleted).toBe(2);
      });
    });

    describe("The AI report is skipped entirely while away", () => {
      const { isInsightDue } = require("../src/services/insightsService");

      test("isInsightDue is false on a vacation day", async () => {
        await seedVacation(dayUtc(-1), dayUtc(1));
        expect(await isInsightDue(new Date())).toBe(false);
      });

      test("isInsightDue is true again once home", async () => {
        await seedVacation(dayUtc(-5), dayUtc(-1));
        expect(await isInsightDue(new Date())).toBe(true);
      });

      test("POST /insights/generate refuses with 409 while away", async () => {
        await seedVacation(dayUtc(-1), dayUtc(1));
        await seedArchive([habit(dayUtc(-5), true)]);

        const res = await request(app).post("/insights/generate").send({});
        // Without an API key the key check answers first; with one, the
        // vacation gate does. Either way no report is written.
        expect([409, 503]).toContain(res.status);
        expect(res.body.error).toBeDefined();
      });
    });

    describe("The nightly snapshot inherits the freeze", () => {
      const {
        refreshStatsSnapshot,
      } = require("../src/services/insightsService");

      test("stores as-of-departure numbers while the user is away", async () => {
        await seedVacation(dayUtc(-2), dayUtc(3));
        await seedArchive([
          habit(dayUtc(-4), true),
          habit(dayUtc(-3), true),
          habit(dayUtc(-1), false), // away
        ]);

        await refreshStatsSnapshot();
        const res = await request(app)
          .get("/insights/stats/latest")
          .expect(200);
        expect(res.body.eventCount).toBe(2);
        expect(res.body.vacation.frozenAt).toBe(dayUtc(-3));
        expect(res.body.habits[0].currentStreak).toBe(2);
      });
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
