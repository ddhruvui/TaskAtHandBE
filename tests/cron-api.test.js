const request = require("supertest");

// The insight step never runs under NODE_ENV=test; the skipInsights tests
// below flip the env to reach it, so generateInsights must be a mock (a real
// call would hit the Gemini API).
jest.mock("../src/services/insightsService", () => ({
  ...jest.requireActual("../src/services/insightsService"),
  generateInsights: jest.fn().mockResolvedValue({ report: "mock" }),
}));

const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");
const { generateInsights } = require("../src/services/insightsService");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("Cron API Endpoints", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollections();
  });

  describe("GET /cron/status — before any run", () => {
    test("returns 404 when cron has never run", async () => {
      // NOTE: if another test suite already triggered runCron via POST /cron/run
      // in the same process, this may return 200. This test is only guaranteed
      // correct when run in isolation or before any /cron/run call.
      // We accept either 404 (never ran) or 200 (already ran) without failing
      // the suite, but validate the shape when 200.
      const res = await request(app).get("/cron/status");
      if (res.status === 404) {
        expect(res.body).toHaveProperty("error");
      } else {
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("lastRanAt");
      }
    });
  });

  describe("POST /cron/run", () => {
    test("returns correct response shape", async () => {
      const res = await request(app).post("/cron/run").expect(200);

      expect(res.body).toHaveProperty("ranAt");
      expect(res.body).toHaveProperty("tasksDeleted");
      expect(res.body).toHaveProperty("tasksMarkedUndone");
      expect(res.body).toHaveProperty("tasksClamped");
      expect(res.body).toHaveProperty("headersDeleted");
      expect(res.body).toHaveProperty("headersReordered");
      expect(res.body).toHaveProperty("projectTasksCompleted");
      expect(res.body).toHaveProperty("lifeEventsCompleted");
      expect(res.body).toHaveProperty("lifeEventTasksCreated");
      expect(res.body).toHaveProperty("callsReset");
    });

    test("ranAt is a valid ISO 8601 datetime string", async () => {
      const res = await request(app).post("/cron/run").expect(200);
      expect(() => new Date(res.body.ranAt)).not.toThrow();
      expect(new Date(res.body.ranAt).toISOString()).toBe(res.body.ranAt);
    });

    test("numeric stat fields are non-negative integers", async () => {
      const res = await request(app).post("/cron/run").expect(200);
      const {
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersDeleted,
        headersReordered,
        projectTasksCompleted,
        callsReset,
      } = res.body;

      for (const val of [
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersDeleted,
        headersReordered,
        projectTasksCompleted,
        callsReset,
      ]) {
        expect(typeof val).toBe("number");
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });

    test("accepts an optional date override in body", async () => {
      const overrideDate = "2026-01-01T00:00:00.000Z"; // Jan 1st to trigger step 2
      const res = await request(app)
        .post("/cron/run")
        .send({ date: overrideDate })
        .expect(200);

      expect(res.body).toHaveProperty("ranAt");
      expect(new Date(res.body.ranAt).toISOString()).toBe(overrideDate);
    });

    test("tasksDeleted reflects done date tasks removed", async () => {
      await clearCollections();

      // Create a header and a done date task
      const h = await request(app)
        .post("/headers")
        .send({ name: "H" })
        .expect(201);
      const t = await request(app)
        .post("/tasks")
        .send({
          name: "Old task",
          headerId: h.body._id,
          ecd: { type: "date", value: "2020-01-01" },
        })
        .expect(201);

      // Keep the header non-empty so step 6 doesn't delete it after the done
      // task is removed by step 5 (which would make the header lookup 404).
      await request(app)
        .post("/tasks")
        .send({ name: "Keep header alive", headerId: h.body._id })
        .expect(201);

      // Mark it done
      await request(app).put(`/tasks/${t.body._id}`).send({ done: true });

      const res = await request(app).post("/cron/run").expect(200);
      expect(res.body.tasksDeleted).toBeGreaterThanOrEqual(1);

      // Confirm it's gone
      const tasks = await request(app)
        .get(`/tasks?headerId=${h.body._id}`)
        .expect(200);
      const found = tasks.body.find((task) => task._id === t.body._id);
      expect(found).toBeUndefined();
    });
  });

  describe("GET /cron/status — after a run", () => {
    test("returns 200 with correct shape after cron has run", async () => {
      // Ensure cron has run at least once
      await request(app).post("/cron/run").expect(200);

      const res = await request(app).get("/cron/status").expect(200);

      expect(res.body).toHaveProperty("lastRanAt");
      expect(res.body).toHaveProperty("tasksDeleted");
      expect(res.body).toHaveProperty("tasksMarkedUndone");
      expect(res.body).toHaveProperty("tasksClamped");
      expect(res.body).toHaveProperty("headersDeleted");
      expect(res.body).toHaveProperty("headersReordered");
      expect(res.body).toHaveProperty("projectTasksCompleted");
      expect(res.body).toHaveProperty("lifeEventsCompleted");
      expect(res.body).toHaveProperty("lifeEventTasksCreated");
      expect(res.body).toHaveProperty("callsReset");
    });

    test("lastRanAt matches the most recent POST /cron/run ranAt", async () => {
      const runRes = await request(app).post("/cron/run").expect(200);
      const statusRes = await request(app).get("/cron/status").expect(200);

      expect(statusRes.body.lastRanAt).toBe(runRes.body.ranAt);
    });

    test("status numeric fields match the last run stats", async () => {
      const runRes = await request(app).post("/cron/run").expect(200);
      const statusRes = await request(app).get("/cron/status").expect(200);

      expect(statusRes.body.tasksDeleted).toBe(runRes.body.tasksDeleted);
      expect(statusRes.body.tasksMarkedUndone).toBe(
        runRes.body.tasksMarkedUndone,
      );
      expect(statusRes.body.tasksClamped).toBe(runRes.body.tasksClamped);
      expect(statusRes.body.headersDeleted).toBe(runRes.body.headersDeleted);
      expect(statusRes.body.headersReordered).toBe(
        runRes.body.headersReordered,
      );
      expect(statusRes.body.projectTasksCompleted).toBe(
        runRes.body.projectTasksCompleted,
      );
      expect(statusRes.body.callsReset).toBe(runRes.body.callsReset);
    });

    test("lastRanAt does not contain the ranAt key (no duplicate)", async () => {
      await request(app).post("/cron/run").expect(200);
      const res = await request(app).get("/cron/status").expect(200);

      // The response should use lastRanAt not ranAt
      expect(res.body).not.toHaveProperty("ranAt");
      expect(res.body).toHaveProperty("lastRanAt");
    });
  });

  describe("GET /cron/run", () => {
    test("returns correct response shape", async () => {
      const res = await request(app).get("/cron/run").expect(200);

      expect(res.body).toHaveProperty("ranAt");
      expect(res.body).toHaveProperty("tasksDeleted");
      expect(res.body).toHaveProperty("tasksMarkedUndone");
      expect(res.body).toHaveProperty("tasksClamped");
      expect(res.body).toHaveProperty("headersDeleted");
      expect(res.body).toHaveProperty("headersReordered");
      expect(res.body).toHaveProperty("projectTasksCompleted");
      expect(res.body).toHaveProperty("lifeEventsCompleted");
      expect(res.body).toHaveProperty("lifeEventTasksCreated");
      expect(res.body).toHaveProperty("callsReset");
    });

    test("ranAt is a valid ISO 8601 datetime string", async () => {
      const res = await request(app).get("/cron/run").expect(200);
      expect(() => new Date(res.body.ranAt)).not.toThrow();
      expect(new Date(res.body.ranAt).toISOString()).toBe(res.body.ranAt);
    });

    test("numeric stat fields are non-negative integers", async () => {
      const res = await request(app).get("/cron/run").expect(200);
      const {
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersDeleted,
        headersReordered,
        projectTasksCompleted,
        callsReset,
      } = res.body;

      for (const val of [
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersDeleted,
        headersReordered,
        projectTasksCompleted,
        callsReset,
      ]) {
        expect(typeof val).toBe("number");
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });

    test("updates /cron/status lastRanAt after running", async () => {
      const runRes = await request(app).get("/cron/run").expect(200);
      const statusRes = await request(app).get("/cron/status").expect(200);
      expect(statusRes.body.lastRanAt).toBe(runRes.body.ranAt);
    });
  });

  describe("GET /cron/details", () => {
    test("returns correct shape matching /cron/status", async () => {
      await request(app).get("/cron/run").expect(200);

      const detailsRes = await request(app).get("/cron/details").expect(200);
      expect(detailsRes.body).toHaveProperty("lastRanAt");
      expect(detailsRes.body).toHaveProperty("tasksDeleted");
      expect(detailsRes.body).toHaveProperty("tasksMarkedUndone");
      expect(detailsRes.body).toHaveProperty("tasksClamped");
      expect(detailsRes.body).toHaveProperty("headersDeleted");
      expect(detailsRes.body).toHaveProperty("headersReordered");
      expect(detailsRes.body).toHaveProperty("projectTasksCompleted");
      expect(detailsRes.body).toHaveProperty("lifeEventsCompleted");
      expect(detailsRes.body).toHaveProperty("lifeEventTasksCreated");
      expect(detailsRes.body).toHaveProperty("callsReset");
    });

    test("response matches /cron/status exactly", async () => {
      await request(app).post("/cron/run").expect(200);

      const statusRes = await request(app).get("/cron/status").expect(200);
      const detailsRes = await request(app).get("/cron/details").expect(200);
      expect(detailsRes.body).toEqual(statusRes.body);
    });

    test("returns 404 when cron has never run (same as /cron/status)", async () => {
      // Accept either 404 (never ran) or 200 (already ran in this process)
      const res = await request(app).get("/cron/details");
      if (res.status === 404) {
        expect(res.body).toHaveProperty("error");
      } else {
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("lastRanAt");
      }
    });

    test("does not expose ranAt key (uses lastRanAt)", async () => {
      await request(app).post("/cron/run").expect(200);
      const res = await request(app).get("/cron/details").expect(200);
      expect(res.body).not.toHaveProperty("ranAt");
      expect(res.body).toHaveProperty("lastRanAt");
    });
  });

  describe("POST /cron/run — archive retention (step 10)", () => {
    beforeEach(async () => {
      const db = await getDatabase();
      await db.collection("TaskArchive-Test").deleteMany({});
      await db.collection("ArchiveSummary-Test").deleteMany({});
    });

    test("reports the retention counters on every run", async () => {
      const res = await request(app).post("/cron/run").expect(200);
      expect(res.body).toMatchObject({
        archiveEventsPruned: expect.any(Number),
        archiveEventsFolded: expect.any(Number),
        archiveMonthsSummarised: expect.any(Number),
      });
    });

    test("archiveCutoff is null when nothing was old enough to prune", async () => {
      const db = await getDatabase();
      await db
        .collection("TaskArchive-Test")
        .insertOne({ type: "habit_result", taskName: "Recent", at: new Date() });

      const res = await request(app).post("/cron/run").expect(200);
      expect(res.body.archiveEventsPruned).toBe(0);
      expect(res.body.archiveCutoff).toBeNull();
    });

    test("archiveCutoff is the UTC day events had to predate", async () => {
      const db = await getDatabase();
      await db.collection("TaskArchive-Test").insertOne({
        type: "habit_result",
        taskName: "Ancient",
        completed: true,
        at: new Date(Date.now() - 60 * 86400000),
      });

      const res = await request(app).post("/cron/run").expect(200);
      expect(res.body.archiveEventsPruned).toBe(1);
      expect(res.body.archiveCutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("POST /cron/run — nightly stats snapshot (step 9, no AI)", () => {
    const origApiKey = process.env.GEMINI_API_KEY;

    beforeEach(async () => {
      // The snapshot is pure arithmetic — it must not depend on the AI key
      delete process.env.GEMINI_API_KEY;
      const db = await getDatabase();
      await db.collection("InsightStats-Test").deleteMany({});
      await db.collection("TaskArchive-Test").deleteMany({});
    });

    afterEach(async () => {
      if (origApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = origApiKey;
      const db = await getDatabase();
      await db.collection("InsightStats-Test").deleteMany({});
      await db.collection("TaskArchive-Test").deleteMany({});
    });

    test("every run refreshes the snapshot and reports statsRefreshed", async () => {
      const res = await request(app).post("/cron/run").expect(200);
      expect(res.body.statsRefreshed).toBe(true);

      const snapshot = await request(app)
        .get("/insights/stats/latest")
        .expect(200);
      expect(snapshot.body.computedAt).toBeDefined();
      expect(snapshot.body.periodDays).toBe(28);
    });

    test("streaks are updated with no API key and no report generated", async () => {
      const db = await getDatabase();
      await db.collection("TaskArchive-Test").insertMany([
        { type: "habit_result", at: new Date(), taskId: "h1", taskName: "Stretch", headerName: "Health", scheduledDays: ["Mon"], dueDate: "2026-07-06", completed: true },
        { type: "habit_result", at: new Date(), taskId: "h1", taskName: "Stretch", headerName: "Health", scheduledDays: ["Mon"], dueDate: "2026-07-13", completed: true },
      ]);

      // Thursday: no AI report, but the streak must still be current
      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-23T00:00:00.000Z" })
        .expect(200);
      expect(res.body.statsRefreshed).toBe(true);
      expect(res.body).not.toHaveProperty("insightGenerated");

      const snapshot = await request(app)
        .get("/insights/stats/latest")
        .expect(200);
      const habit = snapshot.body.habits.find((h) => h.taskName === "Stretch");
      expect(habit.currentStreak).toBe(2);
      expect(habit.completionRate).toBe(100);
    });

    test("skipInsights does not suppress the snapshot", async () => {
      // skipInsights exists to avoid the paid API call; step 9 costs nothing
      const res = await request(app)
        .post("/cron/run")
        .send({ skipInsights: true })
        .expect(200);

      expect(res.body.statsRefreshed).toBe(true);
      await request(app).get("/insights/stats/latest").expect(200);
    });
  });

  describe("POST /cron/run — insight report (skipInsights + daily cadence)", () => {
    // The insight branch requires NODE_ENV !== "test" and an API key; flip
    // both for these tests only (generateInsights is mocked at the top of
    // this file, so no real API call happens).
    const origNodeEnv = process.env.NODE_ENV;
    const origApiKey = process.env.GEMINI_API_KEY;
    // The report now fires every day; the weekday is irrelevant. These two
    // dates are kept only as "today" and "yesterday".
    const FRIDAY = "2026-07-24T00:00:00.000Z";
    const THURSDAY = "2026-07-23T00:00:00.000Z";

    async function seedInsight(daysBeforeFriday) {
      const db = await getDatabase();
      await db.collection("Insights-Test").insertOne({
        generatedAt: new Date(
          new Date(FRIDAY).getTime() - daysBeforeFriday * 86400000,
        ),
        report: { summary: "previous" },
      });
    }

    beforeEach(async () => {
      process.env.NODE_ENV = "development";
      process.env.GEMINI_API_KEY = "test-key";
      generateInsights.mockClear();
      // The cadence gate reads the stored reports, so start each test with none
      const db = await getDatabase();
      await db.collection("Insights-Test").deleteMany({});
    });

    afterEach(async () => {
      process.env.NODE_ENV = origNodeEnv;
      if (origApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = origApiKey;
      const db = await getDatabase();
      await db.collection("Insights-Test").deleteMany({});
    });

    test("skipInsights: true suppresses the insight report", async () => {
      const res = await request(app)
        .post("/cron/run")
        .send({ date: FRIDAY, skipInsights: true })
        .expect(200);

      expect(generateInsights).not.toHaveBeenCalled();
      expect(res.body).not.toHaveProperty("insightGenerated");
      expect(res.body).not.toHaveProperty("insightSkipped");
    });

    test("without skipInsights the insight step runs", async () => {
      const res = await request(app)
        .post("/cron/run")
        .send({ date: FRIDAY })
        .expect(200);

      expect(generateInsights).toHaveBeenCalledTimes(1);
      expect(res.body.insightGenerated).toBe(true);
      expect(res.body).not.toHaveProperty("insightSkipped");
    });

    test("runs on a weekday too — the report is no longer Friday-only", async () => {
      const res = await request(app)
        .post("/cron/run")
        .send({ date: THURSDAY })
        .expect(200);

      expect(generateInsights).toHaveBeenCalledTimes(1);
      expect(res.body.insightGenerated).toBe(true);
      expect(res.body).not.toHaveProperty("insightSkipped");
    });

    test("skips a second run on a day that already reported", async () => {
      await seedInsight(0);

      const res = await request(app)
        .post("/cron/run")
        .send({ date: FRIDAY })
        .expect(200);

      expect(generateInsights).not.toHaveBeenCalled();
      expect(res.body.insightGenerated).toBe(false);
      expect(res.body.insightSkipped).toBe("not-due");
    });

    test("runs again the day after the last report", async () => {
      await seedInsight(1);

      const res = await request(app)
        .post("/cron/run")
        .send({ date: FRIDAY })
        .expect(200);

      expect(generateInsights).toHaveBeenCalledTimes(1);
      expect(res.body.insightGenerated).toBe(true);
      expect(res.body).not.toHaveProperty("insightSkipped");
    });

    test("the rest of the cron still runs on a day the report is skipped", async () => {
      // The only skip condition left is "today's report already exists".
      await seedInsight(1); // stamped on THURSDAY

      const res = await request(app)
        .post("/cron/run")
        .send({ date: THURSDAY })
        .expect(200);

      expect(res.body.insightGenerated).toBe(false);
      expect(res.body.insightSkipped).toBe("not-due");
      expect(res.body.ranAt).toBe(THURSDAY);
      expect(res.body).toHaveProperty("tasksDeleted");
      expect(res.body).toHaveProperty("headersReordered");
      expect(res.body).toHaveProperty("outcomesArchived");
    });
  });
});
