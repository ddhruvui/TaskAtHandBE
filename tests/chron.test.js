const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

async function createHeader(name) {
  const res = await request(app).post("/headers").send({ name });
  return res.body;
}

async function createTask(data) {
  const res = await request(app).post("/tasks").send(data);
  return res.body;
}

async function getTasksForHeader(headerId) {
  const res = await request(app).get(`/tasks?headerId=${headerId}`);
  return res.body;
}

describe("Cron Job", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("Step 5 — Delete done date/no-ecd tasks", () => {
    test("deletes done date tasks and leaves undone date tasks", async () => {
      const h = await createHeader("H");
      const t1 = await createTask({
        name: "Done date task",
        headerId: h._id,
        ecd: { type: "date", value: "2026-01-01" },
      });
      const t2 = await createTask({
        name: "Undone date task",
        headerId: h._id,
        ecd: { type: "date", value: "2026-04-01" },
      });
      const t3 = await createTask({
        name: "Undone no-ecd task",
        headerId: h._id,
      });

      // Mark t1 done
      await request(app).put(`/tasks/${t1._id}`).send({ done: true });

      // Run cron
      await request(app).post("/cron/run").send({}).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const ids = tasks.map((t) => t._id);

      expect(ids).not.toContain(t1._id); // deleted (done date task)
      expect(ids).toContain(t2._id); // kept (undone date task)
      expect(ids).toContain(t3._id); // kept (undone no-ecd task)
    });

    test("deletes done no-ecd tasks", async () => {
      const h = await createHeader("H");
      const doneNoEcd = await createTask({
        name: "Done no-ecd",
        headerId: h._id,
      });
      const undoneNoEcd = await createTask({
        name: "Undone no-ecd",
        headerId: h._id,
      });

      await request(app).put(`/tasks/${doneNoEcd._id}`).send({ done: true });

      await request(app).post("/cron/run").send({}).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const ids = tasks.map((t) => t._id);

      expect(ids).not.toContain(doneNoEcd._id); // deleted
      expect(ids).toContain(undoneNoEcd._id); // kept
    });

    test("does not delete done recurring tasks (dow, dom, doy)", async () => {
      const h = await createHeader("H");

      const dow = await createTask({
        name: "Done dow task",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Mon"] },
      });
      const dom = await createTask({
        name: "Done dom task",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [1] },
      });
      const doy = await createTask({
        name: "Done doy task",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "1/1/2030" },
      });

      // Mark all done
      for (const t of [dow, dom, doy]) {
        await request(app).put(`/tasks/${t._id}`).send({ done: true });
      }

      await request(app).post("/cron/run").send({}).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const ids = tasks.map((t) => t._id);

      expect(ids).toContain(dow._id);
      expect(ids).toContain(dom._id);
      expect(ids).toContain(doy._id);
    });
  });

  describe("Step 3 — Mark undone: day_of_week", () => {
    test("marks done day_of_week tasks undone when today's day matches", async () => {
      const h = await createHeader("H");
      const today = new Date();
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        today.getUTCDay()
      ];

      const t = await createTask({
        name: "DOW task",
        headerId: h._id,
        ecd: { type: "day_of_week", value: [dow] },
      });

      // Mark done
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // Run cron with today's date
      const todayStr = today.toISOString().split("T")[0];
      await request(app).post("/cron/run").send({ date: todayStr }).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.done).toBe(false);
    });

    test("does not affect day_of_week tasks whose day does not match", async () => {
      const h = await createHeader("H");
      const today = new Date();
      const todayIdx = today.getUTCDay();
      // Pick a day that is NOT today
      const otherDow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        (todayIdx + 1) % 7
      ];

      const t = await createTask({
        name: "DOW other day",
        headerId: h._id,
        ecd: { type: "day_of_week", value: [otherDow] },
      });

      // Mark done
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      const todayStr = today.toISOString().split("T")[0];
      await request(app).post("/cron/run").send({ date: todayStr }).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.done).toBe(true); // stays done
    });
  });

  describe("Step 4 — Mark undone: day_of_month", () => {
    test("marks done day_of_month tasks undone when today's date matches", async () => {
      const h = await createHeader("H");
      const today = new Date();
      const todayDate = today.getUTCDate();

      const t = await createTask({
        name: "DOM task",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [todayDate] },
      });

      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      const todayStr = today.toISOString().split("T")[0];
      await request(app).post("/cron/run").send({ date: todayStr }).expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.done).toBe(false);
    });
  });

  describe("Step 2 — Mark undone: day_of_year (daily check)", () => {
    test("updates year and marks undone when today matches task month/day", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "Annual task",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "7/3/2025" },
      });

      // Mark done
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // Run cron on the matching day in the next year
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-07" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toBe("7/3/2026");
      expect(updated.done).toBe(false);
    });

    test("does not update task when today does not match task month/day", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "Annual task other day",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "7/3/2025" },
      });

      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // Run cron on a different day
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-08" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toBe("7/3/2025"); // unchanged
      expect(updated.done).toBe(true); // stays done
    });

    test("clamps Feb 29 to Feb 28 on Feb 28 of a non-leap year", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "Leap day task",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "29/2/2024" }, // 2024 was a leap year
      });

      // Run cron on Feb 28 2026 (non-leap year)
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-28" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toBe("28/2/2026"); // clamped
      expect(updated.done).toBe(false);
    });
  });

  describe("Step 1 — Clamp day_of_month on 1st of month", () => {
    test("clamps values exceeding days in that month on the 1st", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "DOM 30/31",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [15, 30, 31] },
      });

      // Feb 1st — Feb has 28 days in 2026
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-01" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      // 15 is fine, 30→28, 31→28
      expect(updated.ecd.value).toEqual([15, 28, 28]);
    });

    test("does NOT clamp on non-1st of month", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "DOM 31",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [31] },
      });

      // Feb 15th — should NOT clamp
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-15" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toEqual([31]); // unchanged
    });
  });

  describe("Step 6 — Reorder priorities per header", () => {
    test("undone tasks are sorted before done tasks after cron", async () => {
      const h = await createHeader("H");

      const t1 = await createTask({
        name: "T1",
        headerId: h._id,
        ecd: { type: "date", value: "2026-12-31" },
      });
      const t2 = await createTask({
        name: "T2",
        headerId: h._id,
        ecd: { type: "date", value: "2026-06-01" },
      });
      const t3 = await createTask({
        name: "T3",
        headerId: h._id,
        ecd: { type: "date", value: "2026-04-01" },
      });

      // Mark t1 done (but it's a date task — will be deleted by step 5)
      // Keep t2 and t3 undone

      // Run cron (no done date tasks, just reorder)
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-26" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);

      // T3 (sooner date) should have lower priority than T2
      const after3 = tasks.find((t) => t._id === t3._id);
      const after2 = tasks.find((t) => t._id === t2._id);
      expect(after3.priority).toBeLessThan(after2.priority);
    });
  });
});
