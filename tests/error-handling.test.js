const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("Error Handling", () => {
  let headerId;
  let taskId;

  beforeAll(async () => {
    await connectDB();
    await clearCollections();
    const h = await request(app).post("/headers").send({ name: "H" });
    headerId = h.body._id;
    const t = await request(app).post("/tasks").send({ name: "T", headerId });
    taskId = t.body._id;
  });

  describe("POST /headers", () => {
    test("400 when name is missing", async () => {
      const res = await request(app).post("/headers").send({}).expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when name is empty string", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: "" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when name is a non-string type", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: 123 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("PUT /headers/:id", () => {
    test("404 for nonexistent id", async () => {
      const res = await request(app)
        .put("/headers/000000000000000000000000")
        .send({ name: "Ghost" })
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority is out of range (too large)", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: 9999 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority equals count (exact upper boundary, count=1)", async () => {
      // Only 1 header exists (headerId), so count=1 and valid range is 0..0.
      // priority === count (1) must be rejected.
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: 1 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority equals count+1 (one beyond upper boundary, count+1=2)", async () => {
      // Only 1 header exists (headerId), so count=1 and valid range is 0..0.
      // priority === count+1 (2) must be rejected.
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: 2 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority is negative", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: -1 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority is a non-integer (float)", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: 0.5 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority is a non-integer (string)", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ priority: "high" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when name is empty string", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ name: "" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when name is whitespace-only", async () => {
      const res = await request(app)
        .put(`/headers/${headerId}`)
        .send({ name: "   " })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("DELETE /headers/:id", () => {
    test("404 for nonexistent id", async () => {
      const res = await request(app)
        .delete("/headers/000000000000000000000000")
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("GET /tasks", () => {
    test("400 when headerId query param is missing", async () => {
      const res = await request(app).get("/tasks").expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("404 for nonexistent headerId", async () => {
      const res = await request(app)
        .get("/tasks?headerId=000000000000000000000000")
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("POST /tasks", () => {
    test("400 when name is missing", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ headerId })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when headerId is missing", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "T" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("404 for nonexistent headerId", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "T", headerId: "000000000000000000000000" })
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });

    test("400 for invalid ecd type", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "T", headerId, ecd: { type: "invalid", value: "x" } })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("PUT /tasks/:id", () => {
    test("404 for nonexistent id", async () => {
      const res = await request(app)
        .put("/tasks/000000000000000000000000")
        .send({ name: "Ghost" })
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when done is not a boolean", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ done: "yes" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 for invalid ecd on update", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ ecd: { type: "date", value: "not-valid" } })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("400 when priority is out of range", async () => {
      const res = await request(app)
        .put(`/tasks/${taskId}`)
        .send({ priority: 9999 })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("DELETE /tasks/:id", () => {
    test("404 for nonexistent id", async () => {
      const res = await request(app)
        .delete("/tasks/000000000000000000000000")
        .expect(404);
      expect(res.body).toHaveProperty("error");
    });
  });
});
