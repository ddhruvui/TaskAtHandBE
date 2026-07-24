const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
  await db.collection("Calls-Test").deleteMany({});
  await db.collection("Projects-Test").deleteMany({});
  await db.collection("TaskArchive-Test").deleteMany({});
}

async function getCallResultEvents() {
  const db = await getDatabase();
  return db
    .collection("TaskArchive-Test")
    .find({ type: "call_result" })
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

async function getTasksForHeader(headerId) {
  const res = await request(app).get(`/tasks?headerId=${headerId}`);
  return res.body;
}

async function createCall(data) {
  const res = await request(app).post("/calls").send(data);
  return res.body;
}

async function createProject(data) {
  const res = await request(app).post("/projects").send(data);
  return res.body;
}

async function getProject(id) {
  const res = await request(app).get("/projects");
  return res.body.find((p) => p._id === id);
}

async function getCalls() {
  const res = await request(app).get("/calls");
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

  describe("Step 5 — Long-term project task sync", () => {
    test("marks a linked project task done (link cleared, date kept, moved to bottom) when its done todo task is deleted", async () => {
      const h = await createHeader("Automated Stock Market");
      const todoTask = await createTask({
        name: "get data from EODHD",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-01" },
      });
      const project = await createProject({
        name: "Automated Stock Market",
        tasks: [
          {
            name: "get data from EODHD",
            date: "2026-07-01",
            todoTaskId: todoTask._id,
          },
          { name: "get data from Nasdaq" },
        ],
      });

      await request(app).put(`/tasks/${todoTask._id}`).send({ done: true });

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.projectTasksCompleted).toBe(1);

      // Todo task is gone from the todo…
      const tasks = await getTasksForHeader(h._id);
      expect(tasks.map((t) => t._id)).not.toContain(todoTask._id);

      // …but retained in the project as done, at the bottom
      const updated = await getProject(project._id);
      expect(updated.tasks).toEqual([
        {
          name: "get data from Nasdaq",
          date: null,
          done: false,
          todoTaskId: null,
        },
        {
          name: "get data from EODHD",
          date: "2026-07-01",
          done: true,
          todoTaskId: null,
        },
      ]);
    });

    test("leaves project tasks alone when the linked todo task is not done", async () => {
      const h = await createHeader("Automated Stock Market");
      const todoTask = await createTask({
        name: "get data from EODHD",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-01" },
      });
      const project = await createProject({
        name: "Automated Stock Market",
        tasks: [
          {
            name: "get data from EODHD",
            date: "2026-07-01",
            todoTaskId: todoTask._id,
          },
        ],
      });

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.projectTasksCompleted).toBe(0);

      const tasks = await getTasksForHeader(h._id);
      expect(tasks.map((t) => t._id)).toContain(todoTask._id);

      const updated = await getProject(project._id);
      expect(updated.tasks[0].done).toBe(false);
      expect(updated.tasks[0].todoTaskId).toBe(todoTask._id);
    });

    test("does not touch unlinked project tasks when other done tasks are deleted", async () => {
      const h = await createHeader("H");
      const unrelated = await createTask({
        name: "Unrelated done task",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-01" },
      });
      await request(app).put(`/tasks/${unrelated._id}`).send({ done: true });

      const project = await createProject({
        name: "Automated Stock Market",
        tasks: [{ name: "get data from EODHD", date: "2026-07-01" }],
      });

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.tasksDeleted).toBeGreaterThanOrEqual(1);
      expect(res.body.projectTasksCompleted).toBe(0);

      const updated = await getProject(project._id);
      expect(updated.tasks[0].done).toBe(false);
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

    test("undone tasks are ordered by soonest upcoming ECD across all types, null ECD last", async () => {
      const h = await createHeader("H");

      // Cron runs as 2026-07-15 (a Wednesday). Next due dates:
      //   E date 2026-07-16      → Jul 16 (soonest)
      //   B day_of_week ["Fri"]  → Jul 17
      //   C day_of_month [20]    → Jul 20
      //   A date 2026-08-01      → Aug 1
      //   F day_of_month [10]    → Aug 10 (the 10th already passed → next month)
      //   D no ECD               → Infinity (last)
      const a = await createTask({
        name: "A-later-date",
        headerId: h._id,
        ecd: { type: "date", value: "2026-08-01" },
      });
      const b = await createTask({
        name: "B-friday",
        headerId: h._id,
        ecd: { type: "day_of_week", value: ["Fri"] },
      });
      const c = await createTask({
        name: "C-dom20",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [20] },
      });
      const d = await createTask({ name: "D-no-ecd", headerId: h._id });
      const e = await createTask({
        name: "E-soon-date",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-16" },
      });
      const f = await createTask({
        name: "F-dom10-next-month",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [10] },
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-15" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const orderedIds = tasks
        .sort((x, y) => x.priority - y.priority)
        .map((t) => t._id);
      expect(orderedIds).toEqual([e._id, b._id, c._id, a._id, f._id, d._id]);
    });
  });

  describe("Step 7 — Reset calls at period boundaries", () => {
    async function seedDoneCalls() {
      const biweekly = await createCall({
        name: "Grandma",
        frequency: "biweekly",
      });
      const monthly = await createCall({
        name: "Dentist",
        frequency: "monthly",
      });
      await request(app).put(`/calls/${biweekly._id}`).send({ done: true });
      await request(app).put(`/calls/${monthly._id}`).send({ done: true });
      return { biweekly, monthly };
    }

    test("resets done biweekly calls on the 15th, monthly untouched", async () => {
      const { biweekly, monthly } = await seedDoneCalls();

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-15" })
        .expect(200);
      expect(res.body.callsReset).toBe(1);

      const calls = await getCalls();
      const bw = calls.find((c) => c._id === biweekly._id);
      const mo = calls.find((c) => c._id === monthly._id);

      expect(bw.done).toBe(false);
      expect(bw.doneAt).toBeNull();
      expect(mo.done).toBe(true); // monthly untouched on the 15th
      expect(mo.doneAt).not.toBeNull();
    });

    test("resets ALL done calls on the last day of the month", async () => {
      const { biweekly, monthly } = await seedDoneCalls();

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-31" })
        .expect(200);
      expect(res.body.callsReset).toBe(2);

      const calls = await getCalls();
      const bw = calls.find((c) => c._id === biweekly._id);
      const mo = calls.find((c) => c._id === monthly._id);

      expect(bw.done).toBe(false);
      expect(bw.doneAt).toBeNull();
      expect(mo.done).toBe(false);
      expect(mo.doneAt).toBeNull();
    });

    test("treats Feb 28 as the last day of a non-leap February", async () => {
      const { biweekly, monthly } = await seedDoneCalls();

      // 2026 is not a leap year, so Feb 28 is the last day
      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-28" })
        .expect(200);
      expect(res.body.callsReset).toBe(2);

      const calls = await getCalls();
      const bw = calls.find((c) => c._id === biweekly._id);
      const mo = calls.find((c) => c._id === monthly._id);

      expect(bw.done).toBe(false);
      expect(mo.done).toBe(false);
    });

    test("does not reset any calls mid-month", async () => {
      const { biweekly, monthly } = await seedDoneCalls();

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-10" })
        .expect(200);
      expect(res.body.callsReset).toBe(0);

      const calls = await getCalls();
      const bw = calls.find((c) => c._id === biweekly._id);
      const mo = calls.find((c) => c._id === monthly._id);

      expect(bw.done).toBe(true);
      expect(bw.doneAt).not.toBeNull();
      expect(mo.done).toBe(true);
      expect(mo.doneAt).not.toBeNull();
    });

    test("leaves undone calls untouched on the 15th", async () => {
      const undoneBiweekly = await createCall({
        name: "Cousin",
        frequency: "biweekly",
      });
      const undoneMonthly = await createCall({
        name: "Plumber",
        frequency: "monthly",
      });

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-15" })
        .expect(200);
      expect(res.body.callsReset).toBe(0);

      const calls = await getCalls();
      const bw = calls.find((c) => c._id === undoneBiweekly._id);
      const mo = calls.find((c) => c._id === undoneMonthly._id);

      expect(bw.done).toBe(false);
      expect(bw.doneAt).toBeNull();
      expect(bw.updatedAt).toBe(undoneBiweekly.updatedAt); // never written
      expect(mo.done).toBe(false);
      expect(mo.doneAt).toBeNull();
      expect(mo.updatedAt).toBe(undoneMonthly.updatedAt); // never written
    });

    test("archives call_result for due biweekly calls (done and missed) on the 15th", async () => {
      const done = await createCall({ name: "Grandma", frequency: "biweekly" });
      const missed = await createCall({ name: "Cousin", frequency: "biweekly" });
      const monthly = await createCall({
        name: "Dentist",
        frequency: "monthly",
      });
      await request(app).put(`/calls/${done._id}`).send({ done: true });

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-15" })
        .expect(200);

      const events = await getCallResultEvents();
      expect(events).toHaveLength(2); // monthly not due on the 15th

      const doneEvent = events.find((e) => e.callId === done._id);
      expect(doneEvent).toMatchObject({
        type: "call_result",
        callName: "Grandma",
        frequency: "biweekly",
        dueDate: "2026-03-15",
        completed: true,
      });
      expect(doneEvent.doneAt).not.toBeNull();

      const missedEvent = events.find((e) => e.callId === missed._id);
      expect(missedEvent).toMatchObject({
        type: "call_result",
        callName: "Cousin",
        frequency: "biweekly",
        dueDate: "2026-03-15",
        completed: false,
        doneAt: null,
      });

      expect(events.find((e) => e.callId === monthly._id)).toBeUndefined();
    });

    test("archives call_result for ALL calls on the last day of the month", async () => {
      const { biweekly, monthly } = await seedDoneCalls();

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-31" })
        .expect(200);

      const events = await getCallResultEvents();
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.callId).sort()).toEqual(
        [biweekly._id, monthly._id].sort(),
      );
      expect(events.every((e) => e.dueDate === "2026-03-31")).toBe(true);
      expect(events.every((e) => e.completed === true)).toBe(true);
    });

    test("does not double-log call_result when cron re-runs for the same date", async () => {
      await seedDoneCalls();

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-15" })
        .expect(200);
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-15" })
        .expect(200);

      const events = await getCallResultEvents();
      expect(events).toHaveLength(1); // biweekly only, logged once
    });

    test("logs no call_result mid-month", async () => {
      await seedDoneCalls();

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-10" })
        .expect(200);

      expect(await getCallResultEvents()).toHaveLength(0);
    });
  });
});
