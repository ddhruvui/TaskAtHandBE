const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
  await db.collection("TaskArchive-Test").deleteMany({});
}

async function createHeader(name) {
  const res = await request(app).post("/headers").send({ name });
  return res.body;
}

async function createTask(data) {
  const res = await request(app).post("/tasks").send(data);
  return res.body;
}

describe("doneAt lifecycle", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  test("a new task is created with doneAt null", async () => {
    const h = await createHeader("H");
    const t = await createTask({ name: "Fresh", headerId: h._id });
    expect(t.doneAt).toBeNull();
  });

  test("marking done sets doneAt to a current timestamp", async () => {
    const h = await createHeader("H");
    const t = await createTask({ name: "Finish me", headerId: h._id });

    const before = Date.now();
    const res = await request(app)
      .put(`/tasks/${t._id}`)
      .send({ done: true })
      .expect(200);

    expect(res.body.done).toBe(true);
    const doneAt = new Date(res.body.doneAt);
    expect(Number.isNaN(doneAt.getTime())).toBe(false);
    expect(doneAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(doneAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("marking undone clears doneAt back to null", async () => {
    const h = await createHeader("H");
    const t = await createTask({ name: "Toggle", headerId: h._id });

    await request(app).put(`/tasks/${t._id}`).send({ done: true });
    const res = await request(app)
      .put(`/tasks/${t._id}`)
      .send({ done: false })
      .expect(200);

    expect(res.body.done).toBe(false);
    expect(res.body.doneAt).toBeNull();
  });

  test("re-sending done=true does not move doneAt", async () => {
    const h = await createHeader("H");
    const t = await createTask({ name: "Idempotent", headerId: h._id });

    const first = await request(app)
      .put(`/tasks/${t._id}`)
      .send({ done: true });
    const second = await request(app)
      .put(`/tasks/${t._id}`)
      .send({ done: true });

    expect(second.body.doneAt).toBe(first.body.doneAt);
  });

  test("cron day_of_week reset clears doneAt", async () => {
    const h = await createHeader("H");
    // 2026-03-09 is a Monday
    const t = await createTask({
      name: "Weekly habit",
      headerId: h._id,
      ecd: { type: "day_of_week", value: ["Mon"] },
    });
    await request(app).put(`/tasks/${t._id}`).send({ done: true });

    await request(app)
      .post("/cron/run")
      .send({ date: "2026-03-09" })
      .expect(200);

    const res = await request(app).get(`/tasks?headerId=${h._id}`);
    const task = res.body.find((x) => x._id === t._id);
    expect(task.done).toBe(false);
    expect(task.doneAt).toBeNull();
  });

  test("cron day_of_year reset clears doneAt", async () => {
    const h = await createHeader("H");
    const t = await createTask({
      name: "Annual",
      headerId: h._id,
      ecd: { type: "day_of_year", value: "9/3/2025" },
    });
    await request(app).put(`/tasks/${t._id}`).send({ done: true });

    await request(app)
      .post("/cron/run")
      .send({ date: "2026-03-09" })
      .expect(200);

    const res = await request(app).get(`/tasks?headerId=${h._id}`);
    const task = res.body.find((x) => x._id === t._id);
    expect(task.done).toBe(false);
    expect(task.doneAt).toBeNull();
    expect(task.ecd.value).toBe("9/3/2026");
  });
});
