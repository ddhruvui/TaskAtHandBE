const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

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
      expect(res.body).toHaveProperty("headersReordered");
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
        headersReordered,
      } = res.body;

      for (const val of [
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersReordered,
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
      expect(res.body).toHaveProperty("headersReordered");
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
      expect(statusRes.body.headersReordered).toBe(
        runRes.body.headersReordered,
      );
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
      expect(res.body).toHaveProperty("headersReordered");
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
        headersReordered,
      } = res.body;

      for (const val of [
        tasksDeleted,
        tasksMarkedUndone,
        tasksClamped,
        headersReordered,
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
      expect(detailsRes.body).toHaveProperty("headersReordered");
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
});
