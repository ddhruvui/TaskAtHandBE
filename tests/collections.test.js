const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("Collection Isolation", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollections();
  });

  test("Headers and Tasks are stored in separate collections", async () => {
    const db = await getDatabase();

    const h = await request(app)
      .post("/headers")
      .send({ name: "Work" })
      .expect(201);
    const t = await request(app)
      .post("/tasks")
      .send({ name: "Task 1", headerId: h.body._id })
      .expect(201);

    const headerCount = await db.collection("Headers-Test").countDocuments();
    const taskCount = await db.collection("Tasks-Test").countDocuments();

    expect(headerCount).toBeGreaterThanOrEqual(1);
    expect(taskCount).toBeGreaterThanOrEqual(1);

    // The header _id should not exist in Tasks-Test
    const { ObjectId } = require("mongodb");
    const headerInTasksCol = await db
      .collection("Tasks-Test")
      .findOne({ _id: new ObjectId(h.body._id) });
    expect(headerInTasksCol).toBeNull();

    // The task _id should not exist in Headers-Test
    const taskInHeadersCol = await db
      .collection("Headers-Test")
      .findOne({ _id: new ObjectId(t.body._id) });
    expect(taskInHeadersCol).toBeNull();
  });

  test("deleting a header cascades to delete its tasks", async () => {
    await clearCollections();
    const db = await getDatabase();

    const h = await request(app)
      .post("/headers")
      .send({ name: "H1" })
      .expect(201);
    await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId: h.body._id });
    await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId: h.body._id });

    const tasksBeforeDelete = await db
      .collection("Tasks-Test")
      .countDocuments({ headerId: h.body._id });
    expect(tasksBeforeDelete).toBe(2);

    const res = await request(app).delete(`/headers/${h.body._id}`).expect(200);
    expect(res.body.tasksDeleted).toBe(2);

    const tasksAfterDelete = await db
      .collection("Tasks-Test")
      .countDocuments({ headerId: h.body._id });
    expect(tasksAfterDelete).toBe(0);
  });

  test("tasks from different headers are isolated in priority", async () => {
    await clearCollections();

    const h1 = await request(app)
      .post("/headers")
      .send({ name: "H1" })
      .expect(201);
    const h2 = await request(app)
      .post("/headers")
      .send({ name: "H2" })
      .expect(201);

    await request(app)
      .post("/tasks")
      .send({ name: "H1-T1", headerId: h1.body._id });
    await request(app)
      .post("/tasks")
      .send({ name: "H1-T2", headerId: h1.body._id });
    await request(app)
      .post("/tasks")
      .send({ name: "H2-T1", headerId: h2.body._id });

    const h1Tasks = await request(app)
      .get(`/tasks?headerId=${h1.body._id}`)
      .expect(200);
    const h2Tasks = await request(app)
      .get(`/tasks?headerId=${h2.body._id}`)
      .expect(200);

    // H1 has 2 tasks with priorities 0 and 1
    expect(h1Tasks.body.length).toBe(2);
    expect(h1Tasks.body.map((t) => t.priority)).toEqual([0, 1]);

    // H2 has 1 task with priority 0 — independent of H1
    expect(h2Tasks.body.length).toBe(1);
    expect(h2Tasks.body[0].priority).toBe(0);
  });

  test("GET /tasks only returns tasks for the specified headerId", async () => {
    await clearCollections();

    const h1 = await request(app)
      .post("/headers")
      .send({ name: "H1" })
      .expect(201);
    const h2 = await request(app)
      .post("/headers")
      .send({ name: "H2" })
      .expect(201);

    await request(app)
      .post("/tasks")
      .send({ name: "H1-Task", headerId: h1.body._id });
    await request(app)
      .post("/tasks")
      .send({ name: "H2-Task", headerId: h2.body._id });

    const h1Tasks = await request(app)
      .get(`/tasks?headerId=${h1.body._id}`)
      .expect(200);
    expect(h1Tasks.body.every((t) => t.headerId === h1.body._id)).toBe(true);

    const h2Tasks = await request(app)
      .get(`/tasks?headerId=${h2.body._id}`)
      .expect(200);
    expect(h2Tasks.body.every((t) => t.headerId === h2.body._id)).toBe(true);
  });
});
