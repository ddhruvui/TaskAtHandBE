const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
  await db.collection("Calls-Test").deleteMany({});
  await db.collection("Projects-Test").deleteMany({});
  await db.collection("LifeEvents-Test").deleteMany({});
  await db.collection("TaskArchive-Test").deleteMany({});
}

async function getCallResultEvents() {
  const db = await getDatabase();
  return db
    .collection("TaskArchive-Test")
    .find({ type: "call_result" })
    .toArray();
}

async function createHeader(name, projectId) {
  const res = await request(app)
    .post("/headers")
    .send(projectId ? { name, projectId } : { name });
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

async function getHeaders() {
  const res = await request(app).get("/headers");
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

async function createLifeEvent(data) {
  const res = await request(app).post("/lifeevents").send(data);
  return res.body;
}

async function getLifeEvent(id) {
  const res = await request(app).get("/lifeevents");
  return res.body.find((e) => e._id === id);
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

  describe("Step 4 — Delete done date/no-ecd tasks", () => {
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

  describe("Step 4 — Long-term project task sync", () => {
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

      // Keep the header non-empty so step 6 doesn't delete it after the done
      // todo task is removed by step 5.
      await createTask({ name: "keep header alive", headerId: h._id });

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
          notes: "",
          date: null,
          done: false,
          todoTaskId: null,
        },
        {
          name: "get data from EODHD",
          notes: "",
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

  describe("Step 2 — Mark undone: day_of_week", () => {
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

  describe("Step 3 — Mark undone: day_of_month", () => {
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

  describe("Step 1 — Mark undone: day_of_year (daily check)", () => {
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

    test("treats Feb 29 as due on Feb 28 of a non-leap year without rewriting the day", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "Leap day task",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "29/2/2024" }, // 2024 was a leap year
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // Run cron on Feb 28 2026 (non-leap year)
      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-28" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      // Only the year advances — the Feb 29 intent is preserved for leap years
      expect(updated.ecd.value).toBe("29/2/2026");
      expect(updated.done).toBe(false);
      expect(res.body.tasksClamped).toBeGreaterThanOrEqual(1);
    });

    test("keeps firing on Feb 29 in a leap year after a non-leap-year clamp", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "Leap day task",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "29/2/2026" }, // clamped-year run above
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // 2028 is a leap year — Feb 29 exists and the task is due on it
      await request(app)
        .post("/cron/run")
        .send({ date: "2028-02-29" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toBe("29/2/2028");
      expect(updated.done).toBe(false);
    });
  });

  describe("day_of_month values survive short months", () => {
    test("a task set to the 31st is due on the last day of a short month", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "DOM 30/31",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [15, 30, 31] },
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // Feb 28th 2026 — Feb has 28 days, so 30 and 31 resolve to the 28th
      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-02-28" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.done).toBe(false);
      expect(res.body.tasksClamped).toBeGreaterThanOrEqual(1);
    });

    test("the stored value is never rewritten, so the 31st is still the 31st in a long month", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "DOM 30/31",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [15, 30, 31] },
      });

      // A February the task lives through must not degrade its value
      for (const date of ["2026-02-01", "2026-02-28", "2026-03-01"]) {
        await request(app).post("/cron/run").send({ date }).expect(200);
      }

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.ecd.value).toEqual([15, 30, 31]);
    });

    test("is not due on a day that only a clamp would match in a longer month", async () => {
      const h = await createHeader("H");
      const t = await createTask({
        name: "DOM 31",
        headerId: h._id,
        ecd: { type: "day_of_month", value: [31] },
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      // March 30th — March has 31 days, so the 31st has not arrived yet
      await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-30" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const updated = tasks.find((task) => task._id === t._id);
      expect(updated.done).toBe(true); // stays done
      expect(updated.ecd.value).toEqual([31]);
    });
  });

  describe("Step 5 — Delete empty headers & re-assert header order", () => {
    test("deletes a header with no tasks, keeps headers that have tasks", async () => {
      const withTasks = await createHeader("HasTasks");
      const empty = await createHeader("Empty");

      await createTask({ name: "T", headerId: withTasks._id });

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.headersDeleted).toBe(1);

      const headers = await getHeaders();
      const ids = headers.map((h) => h._id);
      expect(ids).toContain(withTasks._id);
      expect(ids).not.toContain(empty._id);
    });

    test("rearranges surviving header priorities to stay contiguous (0..n-1)", async () => {
      // priorities on create: A=0, B=1, C=2. B is empty and gets deleted.
      const a = await createHeader("A");
      const b = await createHeader("B");
      const c = await createHeader("C");

      await createTask({ name: "TA", headerId: a._id });
      await createTask({ name: "TC", headerId: c._id });

      await request(app).post("/cron/run").send({}).expect(200);

      const headers = await getHeaders();
      const byId = Object.fromEntries(headers.map((h) => [h._id, h.priority]));
      expect(byId[b._id]).toBeUndefined();
      // A keeps 0, C collapses from 2 → 1 so priorities remain 0..n-1
      expect(byId[a._id]).toBe(0);
      expect(byId[c._id]).toBe(1);
      expect(headers.map((h) => h.priority).sort()).toEqual([0, 1]);
    });

    test("deletes a header emptied by step 5 done-date-task deletion", async () => {
      const h = await createHeader("SoonEmpty");
      const t = await createTask({
        name: "Done date task",
        headerId: h._id,
        ecd: { type: "date", value: "2026-01-01" },
      });
      await request(app).put(`/tasks/${t._id}`).send({ done: true });

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2026-03-08" })
        .expect(200);

      expect(res.body.tasksDeleted).toBeGreaterThanOrEqual(1);
      expect(res.body.headersDeleted).toBe(1);

      const headers = await getHeaders();
      expect(headers.map((hd) => hd._id)).not.toContain(h._id);
    });

    test("no empty headers → headersDeleted is 0 and priorities untouched", async () => {
      const a = await createHeader("A");
      const b = await createHeader("B");
      await createTask({ name: "TA", headerId: a._id });
      await createTask({ name: "TB", headerId: b._id });

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.headersDeleted).toBe(0);

      const headers = await getHeaders();
      const byId = Object.fromEntries(headers.map((h) => [h._id, h.priority]));
      expect(byId[a._id]).toBe(0);
      expect(byId[b._id]).toBe(1);
    });

    test("re-asserts the project header block after deleting an empty header", async () => {
      // Projects in priority order: P1, P2
      const p1 = await createProject({ name: "P1" });
      const p2 = await createProject({ name: "P2" });

      const daily = await createHeader("Daily");
      const hp1 = await createHeader("P1", p1._id);
      const hp2 = await createHeader("P2", p2._id);
      const misc = await createHeader("Misc");

      await createTask({ name: "T", headerId: hp1._id });
      await createTask({ name: "T", headerId: hp2._id });
      await createTask({ name: "T", headerId: misc._id });
      // `daily` is left empty, so the cron deletes it

      const res = await request(app).post("/cron/run").send({}).expect(200);
      expect(res.body.headersDeleted).toBe(1);

      // Plain re-numbering would leave [P1, P2, Misc]; the block rule puts the
      // surviving top non-project header back at slot 0 in the same run, so
      // the next project action has nothing left to reshuffle.
      const headers = await getHeaders();
      expect(headers.map((h) => h.name)).toEqual(["Misc", "P1", "P2"]);
      expect(headers.map((h) => h.priority)).toEqual([0, 1, 2]);
      expect(headers.find((h) => h.name === "P1").projectId).toBe(p1._id);
    });

    test("unlinks a header whose project was deleted outside the cron", async () => {
      const p1 = await createProject({ name: "P1" });
      const hp1 = await createHeader("P1", p1._id);
      await createTask({ name: "T", headerId: hp1._id });

      const db = await getDatabase();
      await db
        .collection("Projects-Test")
        .deleteMany({ _id: { $exists: true } });

      await request(app).post("/cron/run").send({}).expect(200);

      const headers = await getHeaders();
      expect(headers.find((h) => h._id === hp1._id).projectId).toBeNull();
    });

    test("normalizes a pre-projectId header with no matching project to projectId: null", async () => {
      const db = await getDatabase();
      const inserted = await db
        .collection("Headers-Test")
        .insertOne({ name: "Legacy", priority: 0 });
      await createTask({ name: "T", headerId: inserted.insertedId.toString() });

      await request(app).post("/cron/run").send({}).expect(200);

      const headers = await getHeaders();
      expect(headers[0]).toHaveProperty("projectId", null);
    });

    test("backfills projectId on a pre-existing header that matches a project by name", async () => {
      const legacy = await createHeader("Automated Stock Market");
      await createTask({ name: "T", headerId: legacy._id });
      const project = await createProject({ name: "Automated Stock Market" });

      await request(app).post("/cron/run").send({}).expect(200);

      const headers = await getHeaders();
      expect(headers.find((h) => h._id === legacy._id).projectId).toBe(
        project._id,
      );
    });
  });

  describe("Step 6 — Add due life events to the todo", () => {
    test("creates a linked date task under a new Events header on the event's day", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(1);

      const headers = await getHeaders();
      expect(headers).toHaveLength(1);
      expect(headers[0].name).toBe("Events");

      const tasks = await getTasksForHeader(headers[0]._id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe("Wife's birthday");
      expect(tasks[0].ecd).toEqual({ type: "date", value: "2027-03-07" });
      expect(tasks[0].done).toBe(false);

      const updated = await getLifeEvent(event._id);
      expect(updated.todoTaskId).toBe(tasks[0]._id);
      expect(updated.done).toBe(false);
      expect(updated.lastAddedYear).toBe(2027);
    });

    test("reuses an existing Events header case-insensitively and sorts the task by ECD", async () => {
      const h = await createHeader("events");
      await createTask({ name: "keep header alive", headerId: h._id });
      await createLifeEvent({ name: "Wife's birthday", date: "7/3" });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);

      const headers = await getHeaders();
      expect(headers).toHaveLength(1);
      expect(headers[0].name).toBe("events");

      // The dated birthday task sorts above the no-ECD keep-alive in step 7
      const tasks = await getTasksForHeader(h._id);
      expect(tasks.map((t) => t.name)).toEqual([
        "Wife's birthday",
        "keep header alive",
      ]);
    });

    test("does nothing on a non-matching day", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-08" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(0);

      expect(await getHeaders()).toHaveLength(0);
      const updated = await getLifeEvent(event._id);
      expect(updated.todoTaskId).toBeNull();
    });

    test("a same-day rerun does not create a duplicate", async () => {
      await createLifeEvent({ name: "Wife's birthday", date: "7/3" });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      const rerun = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      expect(rerun.body.lifeEventTasksCreated).toBe(0);

      const headers = await getHeaders();
      const tasks = await getTasksForHeader(headers[0]._id);
      expect(tasks).toHaveLength(1);
    });

    test("a same-day rerun after the task was completed and cleaned up cannot re-add it", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      const created = await getLifeEvent(event._id);
      await request(app)
        .put(`/tasks/${created.todoTaskId}`)
        .send({ done: true })
        .expect(200);

      // Rerun on the same day: step 4 deletes the done task and completes the
      // event; step 6 must not re-add it (lastAddedYear is already 2027).
      const rerun = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      expect(rerun.body.lifeEventsCompleted).toBe(1);
      expect(rerun.body.lifeEventTasksCreated).toBe(0);

      const completed = await getLifeEvent(event._id);
      expect(completed.done).toBe(true);
      expect(completed.todoTaskId).toBeNull();
      expect(completed.lastAddedYear).toBe(2027);
    });

    test("marks the event done (kept, link cleared) when the cron deletes its done todo task", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      const created = await getLifeEvent(event._id);
      await request(app)
        .put(`/tasks/${created.todoTaskId}`)
        .send({ done: true })
        .expect(200);

      const nextDay = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-08" })
        .expect(200);
      expect(nextDay.body.lifeEventsCompleted).toBe(1);

      const completed = await getLifeEvent(event._id);
      expect(completed).toBeDefined(); // never deleted from Life Events
      expect(completed.done).toBe(true);
      expect(completed.todoTaskId).toBeNull();
    });

    test("next anniversary resets done and links a fresh task", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      const created = await getLifeEvent(event._id);
      await request(app)
        .put(`/tasks/${created.todoTaskId}`)
        .send({ done: true })
        .expect(200);
      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-08" })
        .expect(200);

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2028-03-07" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(1);

      const next = await getLifeEvent(event._id);
      expect(next.done).toBe(false);
      expect(next.lastAddedYear).toBe(2028);
      expect(next.todoTaskId).not.toBeNull();

      const headers = await getHeaders();
      const tasks = await getTasksForHeader(headers[0]._id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]._id).toBe(next.todoTaskId);
      expect(tasks[0].ecd).toEqual({ type: "date", value: "2028-03-07" });
    });

    test("an event whose linked task is still pending is skipped next year", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);

      // Task never completed — a year later no second task is stacked
      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2028-03-07" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(0);

      const headers = await getHeaders();
      const tasks = await getTasksForHeader(headers[0]._id);
      expect(tasks).toHaveLength(1);

      const updated = await getLifeEvent(event._id);
      expect(updated.lastAddedYear).toBe(2027);
    });

    test("a malformed todoTaskId is treated as no link instead of crashing the run", async () => {
      const event = await createLifeEvent({
        name: "Wife's birthday",
        date: "7/3",
      });
      await request(app)
        .put(`/lifeevents/${event._id}`)
        .send({ todoTaskId: "not-an-objectid" })
        .expect(200);

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2027-03-07" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(1);

      const updated = await getLifeEvent(event._id);
      expect(updated.todoTaskId).not.toBe("not-an-objectid");
    });

    test("a Feb 29 event fires on Feb 28 in non-leap years", async () => {
      const event = await createLifeEvent({
        name: "Leap anniversary",
        date: "29/2",
      });

      const res = await request(app)
        .post("/cron/run")
        .send({ date: "2027-02-28" })
        .expect(200);
      expect(res.body.lifeEventTasksCreated).toBe(1);

      const headers = await getHeaders();
      const tasks = await getTasksForHeader(headers[0]._id);
      expect(tasks[0].ecd).toEqual({ type: "date", value: "2027-02-28" });

      const updated = await getLifeEvent(event._id);
      expect(updated.lastAddedYear).toBe(2027);
    });
  });

  describe("Step 7 — Reorder priorities per header", () => {
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

    test("a day_of_year task sorts by its next anniversary, not its stored year", async () => {
      const h = await createHeader("H");

      // Cron runs as 2026-07-15. The yearly task's anniversary (Jan 1) has
      // already passed this year, so its next occurrence is 2027-01-01 —
      // later than the August date task, not "the past" pinned to the top.
      const yearly = await createTask({
        name: "Yearly-passed",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "1/1/2026" },
      });
      const soon = await createTask({
        name: "Soon-date",
        headerId: h._id,
        ecd: { type: "date", value: "2026-08-01" },
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-15" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const orderedIds = tasks
        .sort((x, y) => x.priority - y.priority)
        .map((t) => t._id);
      expect(orderedIds).toEqual([soon._id, yearly._id]);
    });

    test("a day_of_year task due later this year sorts before a later date task", async () => {
      const h = await createHeader("H");

      const yearly = await createTask({
        name: "Yearly-upcoming",
        headerId: h._id,
        ecd: { type: "day_of_year", value: "20/7/2025" },
      });
      const later = await createTask({
        name: "Later-date",
        headerId: h._id,
        ecd: { type: "date", value: "2026-09-01" },
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-15" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const orderedIds = tasks
        .sort((x, y) => x.priority - y.priority)
        .map((t) => t._id);
      expect(orderedIds).toEqual([yearly._id, later._id]);
    });

    test("tasks due the same day keep their existing relative order (stable sort)", async () => {
      const h = await createHeader("H");
      const first = await createTask({
        name: "First",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });
      const second = await createTask({
        name: "Second",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });
      const third = await createTask({
        name: "Third",
        headerId: h._id,
        ecd: { type: "date", value: "2026-07-20" },
      });

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-15" })
        .expect(200);

      const tasks = await getTasksForHeader(h._id);
      const orderedIds = tasks
        .sort((x, y) => x.priority - y.priority)
        .map((t) => t._id);
      expect(orderedIds).toEqual([first._id, second._id, third._id]);
    });

    test("does not stamp updatedAt when it only changes priority", async () => {
      const h = await createHeader("H");
      const late = await createTask({
        name: "Late",
        headerId: h._id,
        ecd: { type: "date", value: "2026-12-31" },
      });
      const early = await createTask({
        name: "Early",
        headerId: h._id,
        ecd: { type: "date", value: "2026-08-01" },
      });

      const before = await getTasksForHeader(h._id);
      const earlyBefore = before.find((t) => t._id === early._id).updatedAt;

      await request(app)
        .post("/cron/run")
        .send({ date: "2026-07-15" })
        .expect(200);

      const after = await getTasksForHeader(h._id);
      const earlyAfter = after.find((t) => t._id === early._id);
      expect(earlyAfter.priority).toBeLessThan(
        after.find((t) => t._id === late._id).priority,
      );
      expect(earlyAfter.updatedAt).toBe(earlyBefore);
    });
  });

  describe("Step 8 — Reset calls at period boundaries", () => {
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

  // The daily run only happens if something actually fires it. On Vercel no
  // in-process timer survives between requests, so scheduleCron must decline
  // rather than log a schedule that will never run — the platform cron
  // (vercel.json -> crons -> GET /cron/run) is the trigger there.
  describe("scheduleCron — where the daily run comes from", () => {
    const { scheduleCron, isServerless } = require("../src/cron/cronJob");

    afterEach(() => {
      delete process.env.VERCEL;
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      // A registered schedule is a live timer; leaving one behind would hold
      // the Jest worker open.
      for (const task of require("node-cron").getTasks().values()) {
        task.destroy();
      }
    });

    test("registers an in-process schedule on a long-lived server", () => {
      expect(isServerless()).toBe(false);
      expect(scheduleCron()).toBe(true);
      expect(require("node-cron").getTasks().size).toBe(1);
    });

    test("declines on Vercel", () => {
      process.env.VERCEL = "1";
      expect(isServerless()).toBe(true);
      expect(scheduleCron()).toBe(false);
    });

    test("declines on Lambda", () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = "taskathand";
      expect(isServerless()).toBe(true);
      expect(scheduleCron()).toBe(false);
    });
  });
});
