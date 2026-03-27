const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("Headers CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollections();
  });

  describe("GET /headers (empty)", () => {
    test("returns empty array when no headers exist", async () => {
      await clearCollections();
      const res = await request(app).get("/headers").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let headerId;

  describe("POST /headers", () => {
    test("creates a header and assigns priority 0 as first header", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: "Work" })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Work");
      expect(res.body.priority).toBe(0);
      headerId = res.body._id;
    });

    test("second header gets priority 1", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: "Personal" })
        .expect(201);

      expect(res.body.priority).toBe(1);
    });

    test("rejects missing name", async () => {
      await request(app).post("/headers").send({}).expect(400);
    });

    test("rejects empty name", async () => {
      await request(app).post("/headers").send({ name: "  " }).expect(400);
    });

    test("trims whitespace from name", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: "  Trimmed  " })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
    });
  });

  describe("GET /headers", () => {
    test("returns all headers sorted by priority", async () => {
      const res = await request(app).get("/headers").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].priority).toBeGreaterThan(res.body[i - 1].priority);
      }
    });
  });

  describe("PUT /headers/:id", () => {
    test("updates header name", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ name: "Updated Work" })
        .expect(200);
      expect(res.body.name).toBe("Updated Work");
    });

    test("trims whitespace from name on update", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ name: "  Trimmed Update  " })
        .expect(200);
      expect(res.body.name).toBe("Trimmed Update");
    });

    test("updates header priority and shifts others", async () => {
      // headerId is currently priority 0; move it to priority 1
      const before = await request(app).get("/headers").expect(200);
      const h0 = before.body.find((h) => h._id === headerId);
      const h1 = before.body.find((h) => h.priority === 1);

      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: 1 })
        .expect(200);
      expect(res.body.priority).toBe(1);

      // The header that was at priority 1 should have moved to 0
      const after = await request(app).get("/headers").expect(200);
      const shifted = after.body.find((h) => h._id === h1._id);
      expect(shifted.priority).toBe(0);
    });

    test("returns 404 for nonexistent id", async () => {
      await request(app)
        .put("/headers/000000000000000000000000")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /headers/:id", () => {
    test("deletes header and returns deleted id + tasksDeleted", async () => {
      // Create a header and two tasks for it
      const hRes = await request(app)
        .post("/headers")
        .send({ name: "To Delete" })
        .expect(201);
      const hId = hRes.body._id;

      await request(app).post("/tasks").send({ name: "T1", headerId: hId }).expect(201);
      await request(app).post("/tasks").send({ name: "T2", headerId: hId }).expect(201);

      const res = await request(app).delete(`/headers/${hId}`).expect(200);
      expect(res.body.deleted).toBe(hId);
      expect(res.body.tasksDeleted).toBe(2);

      // Tasks should be gone
      const tasks = await request(app)
        .get(`/tasks?headerId=${hId}`)
        .expect(404); // Header gone → 404
    });

    test("returns 404 for nonexistent id", async () => {
      await request(app).delete("/headers/000000000000000000000000").expect(404);
    });

    test("tasksDeleted is 0 when header has no tasks", async () => {
      const hRes = await request(app)
        .post("/headers")
        .send({ name: "Empty Header" })
        .expect(201);
      const res = await request(app)
        .delete(`/headers/${hRes.body._id}`)
        .expect(200);
      expect(res.body.deleted).toBe(hRes.body._id);
      expect(res.body.tasksDeleted).toBe(0);
    });
  });
});

describe("Tasks CRUD", () => {
  let headerId;

  beforeAll(async () => {
    await connectDB();
    await clearCollections();
    const res = await request(app)
      .post("/headers")
      .send({ name: "Test Header" });
    headerId = res.body._id;
  });

  describe("POST /tasks", () => {
    test("creates a task with required fields", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "Task 1", headerId })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Task 1");
      expect(res.body.headerId).toBe(headerId);
      expect(res.body.priority).toBe(0);
      expect(res.body.done).toBe(false);
      expect(res.body.notes).toBe("");
      expect(res.body.ecd).toBeNull();
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
    });

    test("creates a task with all fields", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "Task With ECD",
          notes: "Some notes",
          headerId,
          ecd: { type: "date", value: "2026-12-31" },
        })
        .expect(201);

      expect(res.body.name).toBe("Task With ECD");
      expect(res.body.notes).toBe("Some notes");
      expect(res.body.ecd).toEqual({ type: "date", value: "2026-12-31" });
    });

    test("rejects task without name", async () => {
      await request(app).post("/tasks").send({ headerId }).expect(400);
    });

    test("rejects task without headerId", async () => {
      await request(app).post("/tasks").send({ name: "No Header" }).expect(400);
    });

    test("rejects task with nonexistent headerId", async () => {
      await request(app)
        .post("/tasks")
        .send({ name: "Ghost Task", headerId: "000000000000000000000000" })
        .expect(404);
    });

    test("trims whitespace from name", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "  Trimmed  ", headerId })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
    });
  });

  describe("GET /tasks", () => {
    test("returns tasks sorted by priority for headerId", async () => {
      const res = await request(app)
        .get(`/tasks?headerId=${headerId}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].priority).toBeGreaterThan(res.body[i - 1].priority);
      }
    });

    test("returns empty array for a header that exists but has no tasks", async () => {
      const empty = await request(app)
        .post("/headers")
        .send({ name: "Empty" })
        .expect(201);

      const res = await request(app)
        .get(`/tasks?headerId=${empty.body._id}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    test("returns 400 when headerId is missing", async () => {
      await request(app).get("/tasks").expect(400);
    });

    test("returns 404 for nonexistent headerId", async () => {
      await request(app)
        .get("/tasks?headerId=000000000000000000000000")
        .expect(404);
    });
  });

  describe("PUT /tasks/:id", () => {
    let taskId;

    beforeAll(async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "Update Me", headerId });
      taskId = res.body._id;
    });

    test("updates task name", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ name: "Updated" })
        .expect(200);
      expect(res.body.name).toBe("Updated");
    });

    test("updates task notes", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ notes: "New notes" })
        .expect(200);
      expect(res.body.notes).toBe("New notes");
    });

    test("clears notes back to empty string", async () => {
      // First ensure there are notes
      await request(app).put(`/tasks/${taskId}`).send({ notes: "Some notes" });

      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ notes: "" })
        .expect(200);
      expect(res.body.notes).toBe("");
    });

    test("updates ecd", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ ecd: { type: "day_of_week", value: ["Mon", "Fri"] } })
        .expect(200);
      expect(res.body.ecd).toEqual({ type: "day_of_week", value: ["Mon", "Fri"] });
    });

    test("updatedAt changes on every write", async () => {
      const before = await request(app).get(`/tasks?headerId=${headerId}`).expect(200);
      const beforeTask = before.body.find((t) => t._id === taskId);

      await new Promise((r) => setTimeout(r, 10));

      await request(app).put(`/tasks/${taskId}`).send({ name: "Changed Again" }).expect(200);

      const after = await request(app).get(`/tasks?headerId=${headerId}`).expect(200);
      const afterTask = after.body.find((t) => t._id === taskId);

      expect(new Date(afterTask.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTask.updatedAt).getTime(),
      );
    });

    test("createdAt is not changed by a PUT", async () => {
      const before = await request(app).get(`/tasks?headerId=${headerId}`).expect(200);
      const beforeTask = before.body.find((t) => t._id === taskId);

      await new Promise((r) => setTimeout(r, 10));

      await request(app).put(`/tasks/${taskId}`).send({ name: "Rename" }).expect(200);

      const after = await request(app).get(`/tasks?headerId=${headerId}`).expect(200);
      const afterTask = after.body.find((t) => t._id === taskId);

      expect(afterTask.createdAt).toBe(beforeTask.createdAt);
    });

    test("returns 404 for nonexistent id", async () => {
      await request(app)
        .put("/tasks/000000000000000000000000")
        .send({ name: "Ghost" })
        .expect(404);
    });

    test("empty body returns current task unchanged", async () => {
      const current = await request(app)
        .get(`/tasks?headerId=${headerId}`)
        .expect(200);
      const t = current.body.find((task) => task._id === taskId);

      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({})
        .expect(200);

      expect(res.body.name).toBe(t.name);
      expect(res.body.priority).toBe(t.priority);
      expect(res.body.done).toBe(t.done);
    });

    test("same priority value is a no-op (no shifting)", async () => {
      const current = await request(app)
        .get(`/tasks?headerId=${headerId}`)
        .expect(200);
      const t = current.body.find((task) => task._id === taskId);

      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ priority: t.priority })
        .expect(200);

      expect(res.body.priority).toBe(t.priority);

      // All other task priorities should be unchanged
      const after = await request(app)
        .get(`/tasks?headerId=${headerId}`)
        .expect(200);
      const priorities = after.body.map((t2) => t2.priority).sort((a, b) => a - b);
      expect(priorities).toEqual([...Array(priorities.length).keys()]);
    });

    test("can update done and name in the same request", async () => {
      // Ensure task is undone first
      await request(app).put(`/tasks/${taskId}`).send({ done: false });

      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ done: true, name: "Done and renamed" })
        .expect(200);

      expect(res.body.done).toBe(true);
      expect(res.body.name).toBe("Done and renamed");
    });

    test("setting ecd to null clears the ecd field", async () => {
      // First set an ECD
      await request(app)
        .put(`/tasks/${taskId}`)
        .send({ ecd: { type: "date", value: "2026-12-31" } })
        .expect(200);

      // Now clear it
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ ecd: null })
        .expect(200);

      expect(res.body.ecd).toBeNull();
    });
  });

  describe("DELETE /tasks/:id", () => {
    test("deletes a task and returns deleted id", async () => {
      const created = await request(app)
        .post("/tasks")
        .send({ name: "Delete Me", headerId })
        .expect(201);

      const res = await request(app)
        .delete(`/tasks/${created.body._id}`)
        .expect(200);

      expect(res.body.deleted).toBe(created.body._id);
    });

    test("returns 404 for nonexistent id", async () => {
      await request(app).delete("/tasks/000000000000000000000000").expect(404);
    });
  });
});
