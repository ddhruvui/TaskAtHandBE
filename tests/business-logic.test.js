const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("Header Priority Logic", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollections();
  });

  test("headers are appended at the end on insert", async () => {
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);
    const c = await request(app)
      .post("/headers")
      .send({ name: "C" })
      .expect(201);

    expect(a.body.priority).toBe(0);
    expect(b.body.priority).toBe(1);
    expect(c.body.priority).toBe(2);
  });

  test("deleting a header shifts remaining priorities down", async () => {
    await clearCollections();
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);
    const c = await request(app)
      .post("/headers")
      .send({ name: "C" })
      .expect(201);

    // Delete the middle header (priority 1)
    await request(app).delete(`/headers/${b.body._id}`).expect(200);

    const all = await request(app).get("/headers").expect(200);
    expect(all.body.length).toBe(2);
    expect(all.body[0].priority).toBe(0);
    expect(all.body[1].priority).toBe(1);
    expect(all.body[0]._id).toBe(a.body._id);
    expect(all.body[1]._id).toBe(c.body._id);
  });

  test("updating header priority maintains contiguous order (move down: 0→2)", async () => {
    await clearCollections();
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);
    const c = await request(app)
      .post("/headers")
      .send({ name: "C" })
      .expect(201);

    // Move A (priority 0) to priority 2
    await request(app)
      .put(`/headers/${a.body._id}`)
      .send({ priority: 2 })
      .expect(200);

    const all = await request(app).get("/headers").expect(200);
    expect(all.body.map((h) => h.name)).toEqual(["B", "C", "A"]);
    expect(all.body.map((h) => h.priority)).toEqual([0, 1, 2]);
  });

  test("updating header priority maintains contiguous order (move up: 2→0)", async () => {
    await clearCollections();
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);
    const c = await request(app)
      .post("/headers")
      .send({ name: "C" })
      .expect(201);

    // Move C (priority 2) to priority 0
    await request(app)
      .put(`/headers/${c.body._id}`)
      .send({ priority: 0 })
      .expect(200);

    const all = await request(app).get("/headers").expect(200);
    expect(all.body.map((h) => h.name)).toEqual(["C", "A", "B"]);
    expect(all.body.map((h) => h.priority)).toEqual([0, 1, 2]);
  });

  test("updating name and priority together applies both changes", async () => {
    await clearCollections();
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);

    const res = await request(app)
      .put(`/headers/${a.body._id}`)
      .send({ name: "A-renamed", priority: 1 })
      .expect(200);

    expect(res.body.name).toBe("A-renamed");
    expect(res.body.priority).toBe(1);

    const all = await request(app).get("/headers").expect(200);
    expect(all.body.map((h) => h.priority)).toEqual([0, 1]);
  });

  test("PUT with empty body returns current header unchanged", async () => {
    await clearCollections();
    const created = await request(app)
      .post("/headers")
      .send({ name: "Stable" })
      .expect(201);

    const res = await request(app)
      .put(`/headers/${created.body._id}`)
      .send({})
      .expect(200);

    expect(res.body.name).toBe("Stable");
    expect(res.body.priority).toBe(created.body.priority);
  });

  test("PUT with same priority value is a no-op (no shifting)", async () => {
    await clearCollections();
    const a = await request(app)
      .post("/headers")
      .send({ name: "A" })
      .expect(201);
    const b = await request(app)
      .post("/headers")
      .send({ name: "B" })
      .expect(201);

    // Send priority 0 to header already at priority 0
    const res = await request(app)
      .put(`/headers/${a.body._id}`)
      .send({ priority: 0 })
      .expect(200);

    expect(res.body.priority).toBe(0);

    const all = await request(app).get("/headers").expect(200);
    expect(all.body.map((h) => h.priority)).toEqual([0, 1]);
    expect(all.body.map((h) => h.name)).toEqual(["A", "B"]);
  });
});

describe("Task Priority: Insertion Logic", () => {
  let headerId;

  beforeAll(async () => {
    await connectDB();
    await clearCollections();
    const res = await request(app).post("/headers").send({ name: "H" });
    headerId = res.body._id;
  });

  test("new tasks are inserted before the first done task", async () => {
    // Create an undone task then mark it done
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    await request(app).put(`/tasks/${t1.body._id}`).send({ done: true });

    // Add a new task — it should be inserted before the done task
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);
    expect(t2.body.priority).toBe(0); // before the done task

    const tasks = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const undone = tasks.body.filter((t) => !t.done);
    const done = tasks.body.filter((t) => t.done);

    // All undone priorities should be lower than all done priorities
    const maxUndonePriority = Math.max(...undone.map((t) => t.priority));
    const minDonePriority = Math.min(...done.map((t) => t.priority));
    expect(maxUndonePriority).toBeLessThan(minDonePriority);
  });
});

describe("Task Priority: Done/Undone Toggle", () => {
  let headerId;

  beforeEach(async () => {
    const db = await getDatabase();
    await db.collection("Headers-Test").deleteMany({});
    await db.collection("Tasks-Test").deleteMany({});
    const res = await request(app).post("/headers").send({ name: "H" });
    headerId = res.body._id;
  });

  test("marking a task done moves it to last priority", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId })
      .expect(201);

    // Mark middle task (T2) done
    const res = await request(app)
      .put(`/tasks/${t2.body._id}`)
      .send({ done: true })
      .expect(200);
    expect(res.body.done).toBe(true);
    expect(res.body.priority).toBe(2); // last position

    const all = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const t1After = all.body.find((t) => t._id === t1.body._id);
    const t3After = all.body.find((t) => t._id === t3.body._id);

    // T1 was before T2 so unchanged
    expect(t1After.priority).toBe(0);
    // T3 was after T2 so shifts up by 1 (priority decreases)
    expect(t3After.priority).toBe(1);
  });

  test("marking a task undone moves it just before first done task", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId })
      .expect(201);

    // Mark all done
    await request(app).put(`/tasks/${t1.body._id}`).send({ done: true });
    await request(app).put(`/tasks/${t2.body._id}`).send({ done: true });
    await request(app).put(`/tasks/${t3.body._id}`).send({ done: true });

    // Unmark t2 — should move to just before first done task (priority 0 since no undone tasks)
    const res = await request(app)
      .put(`/tasks/${t2.body._id}`)
      .send({ done: false })
      .expect(200);
    expect(res.body.done).toBe(false);

    const all = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const undone = all.body.filter((t) => !t.done);
    const done = all.body.filter((t) => t.done);

    expect(undone.length).toBe(1);
    expect(done.length).toBe(2);

    const maxUndonePri = Math.max(...undone.map((t) => t.priority));
    const minDonePri = Math.min(...done.map((t) => t.priority));
    expect(maxUndonePri).toBeLessThan(minDonePri);
  });

  test("priorities remain contiguous after done/undone toggles", async () => {
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post("/tasks")
        .send({ name: `T${i}`, headerId });
    }

    const all = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const ids = all.body.map((t) => t._id);

    // Mark tasks 1 and 3 done
    await request(app).put(`/tasks/${ids[0]}`).send({ done: true });
    await request(app).put(`/tasks/${ids[2]}`).send({ done: true });

    const after = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const priorities = after.body.map((t) => t.priority).sort((a, b) => a - b);

    // Priorities must be contiguous 0..n-1
    expect(priorities).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("Task Priority: Manual Reorder", () => {
  let headerId;

  beforeAll(async () => {
    await connectDB();
    await clearCollections();
    const res = await request(app).post("/headers").send({ name: "H" });
    headerId = res.body._id;
  });

  test("manually reordering task shifts affected tasks correctly", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId })
      .expect(201);

    // Move T1 (priority 0) to priority 2
    await request(app)
      .put(`/tasks/${t1.body._id}`)
      .send({ priority: 2 })
      .expect(200);

    const all = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const after1 = all.body.find((t) => t._id === t1.body._id);
    const after2 = all.body.find((t) => t._id === t2.body._id);
    const after3 = all.body.find((t) => t._id === t3.body._id);

    expect(after1.priority).toBe(2);
    expect(after2.priority).toBe(0);
    expect(after3.priority).toBe(1);
  });

  test("deleting a task reorders remaining task priorities", async () => {
    await clearCollections();
    const h = await request(app)
      .post("/headers")
      .send({ name: "H2" })
      .expect(201);
    const hId = h.body._id;

    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId: hId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId: hId })
      .expect(201);
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId: hId })
      .expect(201);

    // Delete T2 (middle)
    await request(app).delete(`/tasks/${t2.body._id}`).expect(200);

    const after = await request(app).get(`/tasks?headerId=${hId}`).expect(200);
    const priorities = after.body.map((t) => t.priority).sort((a, b) => a - b);
    expect(priorities).toEqual([0, 1]);
  });

  test("manually reordering task shifts affected tasks correctly (move up: 2→0)", async () => {
    await clearCollections();
    const h = await request(app)
      .post("/headers")
      .send({ name: "H3" })
      .expect(201);
    const hId = h.body._id;

    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId: hId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId: hId })
      .expect(201);
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId: hId })
      .expect(201);

    // Move T3 (priority 2) up to priority 0
    await request(app)
      .put(`/tasks/${t3.body._id}`)
      .send({ priority: 0 })
      .expect(200);

    const all = await request(app).get(`/tasks?headerId=${hId}`).expect(200);
    const after1 = all.body.find((t) => t._id === t1.body._id);
    const after2 = all.body.find((t) => t._id === t2.body._id);
    const after3 = all.body.find((t) => t._id === t3.body._id);

    expect(after3.priority).toBe(0);
    expect(after1.priority).toBe(1);
    expect(after2.priority).toBe(2);
  });
});

describe("Task Priority: Insertion — Edge Cases", () => {
  let headerId;

  beforeEach(async () => {
    const db = await getDatabase();
    await db.collection("Headers-Test").deleteMany({});
    await db.collection("Tasks-Test").deleteMany({});
    const res = await request(app).post("/headers").send({ name: "H" });
    headerId = res.body._id;
  });

  test("new task gets priority 0 when no tasks exist", async () => {
    const t = await request(app)
      .post("/tasks")
      .send({ name: "First", headerId })
      .expect(201);
    expect(t.body.priority).toBe(0);
  });

  test("new task inserts at priority 0 when all existing tasks are done", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);

    // Mark all done
    await request(app).put(`/tasks/${t1.body._id}`).send({ done: true });
    await request(app).put(`/tasks/${t2.body._id}`).send({ done: true });

    // Add a new task — all existing are done, spec says insert at position 0
    const t3 = await request(app)
      .post("/tasks")
      .send({ name: "T3", headerId })
      .expect(201);
    expect(t3.body.priority).toBe(0);

    const tasks = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const undone = tasks.body.filter((t) => !t.done);
    const done = tasks.body.filter((t) => t.done);

    expect(undone.length).toBe(1);
    expect(undone[0].priority).toBe(0);
    const minDonePriority = Math.min(...done.map((t) => t.priority));
    expect(minDonePriority).toBeGreaterThan(0);
  });
});

describe("Task Priority: Done/Undone Toggle — No-ops", () => {
  let headerId;

  beforeEach(async () => {
    const db = await getDatabase();
    await db.collection("Headers-Test").deleteMany({});
    await db.collection("Tasks-Test").deleteMany({});
    const res = await request(app).post("/headers").send({ name: "H" });
    headerId = res.body._id;
  });

  test("sending done:true on already-done task does not shift priorities", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);

    // Mark T1 done (moves to last position)
    await request(app).put(`/tasks/${t1.body._id}`).send({ done: true });

    const before = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const t1Before = before.body.find((t) => t._id === t1.body._id);
    const t2Before = before.body.find((t) => t._id === t2.body._id);

    // Send done:true again — should be a no-op on priorities
    await request(app)
      .put(`/tasks/${t1.body._id}`)
      .send({ done: true })
      .expect(200);

    const after = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const t1After = after.body.find((t) => t._id === t1.body._id);
    const t2After = after.body.find((t) => t._id === t2.body._id);

    expect(t1After.priority).toBe(t1Before.priority);
    expect(t2After.priority).toBe(t2Before.priority);
  });

  test("sending done:false on already-undone task does not shift priorities", async () => {
    const t1 = await request(app)
      .post("/tasks")
      .send({ name: "T1", headerId })
      .expect(201);
    const t2 = await request(app)
      .post("/tasks")
      .send({ name: "T2", headerId })
      .expect(201);

    // Both are undone. Capture current priorities.
    const before = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const t1Before = before.body.find((t) => t._id === t1.body._id);
    const t2Before = before.body.find((t) => t._id === t2.body._id);

    // Send done:false to T1 which is already undone — should be a no-op
    await request(app)
      .put(`/tasks/${t1.body._id}`)
      .send({ done: false })
      .expect(200);

    const after = await request(app)
      .get(`/tasks?headerId=${headerId}`)
      .expect(200);
    const t1After = after.body.find((t) => t._id === t1.body._id);
    const t2After = after.body.find((t) => t._id === t2.body._id);

    expect(t1After.priority).toBe(t1Before.priority);
    expect(t2After.priority).toBe(t2Before.priority);
  });
});
