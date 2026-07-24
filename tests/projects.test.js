const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("Projects-Test").deleteMany({});
}

describe("Projects CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /projects (empty)", () => {
    test("returns empty array when no projects exist", async () => {
      await clearCollection();
      const res = await request(app).get("/projects").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let projectId;
  let secondId;
  let thirdId;

  describe("POST /projects", () => {
    test("creates a project with a task list (defaults applied)", async () => {
      const res = await request(app)
        .post("/projects")
        .send({
          name: "Automated Stock Market",
          tasks: [
            { name: "get data from EODHD", date: "2026-08-01" },
            { name: "get data from Nasdaq" },
          ],
        })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Automated Stock Market");
      expect(res.body.priority).toBe(0);
      expect(res.body.tasks).toEqual([
        {
          name: "get data from EODHD",
          date: "2026-08-01",
          done: false,
          todoTaskId: null,
        },
        {
          name: "get data from Nasdaq",
          date: null,
          done: false,
          todoTaskId: null,
        },
      ]);
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
      projectId = res.body._id;
    });

    test("creates a project without tasks (defaults to empty list)", async () => {
      const res = await request(app)
        .post("/projects")
        .send({ name: "Home Renovation" })
        .expect(201);
      expect(res.body.tasks).toEqual([]);
      expect(res.body.priority).toBe(1);
      secondId = res.body._id;
    });

    test("appends priorities contiguously", async () => {
      const res = await request(app)
        .post("/projects")
        .send({ name: "Write a Book" })
        .expect(201);
      expect(res.body.priority).toBe(2);
      thirdId = res.body._id;
    });

    test("sorts done tasks to the bottom on create", async () => {
      const res = await request(app)
        .post("/projects")
        .send({
          name: "Sorted",
          tasks: [
            { name: "A done", done: true },
            { name: "B undone" },
            { name: "C done", done: true },
          ],
        })
        .expect(201);
      expect(res.body.tasks.map((t) => t.name)).toEqual([
        "B undone",
        "A done",
        "C done",
      ]);
      await request(app).delete(`/projects/${res.body._id}`).expect(200);
    });

    test("trims whitespace from name and task names", async () => {
      const res = await request(app)
        .post("/projects")
        .send({ name: "  Trimmed  ", tasks: [{ name: "  Task A  " }] })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
      expect(res.body.tasks[0].name).toBe("Task A");
      await request(app).delete(`/projects/${res.body._id}`).expect(200);
    });

    test("rejects missing name", async () => {
      await request(app)
        .post("/projects")
        .send({ tasks: [{ name: "A" }] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app).post("/projects").send({ name: "  " }).expect(400);
    });

    test("rejects tasks that are not an array", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: "get data" })
        .expect(400);
    });

    test("rejects tasks that are plain strings", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: ["get data"] })
        .expect(400);
    });

    test("rejects tasks with empty names", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: [{ name: "  " }] })
        .expect(400);
    });

    test("rejects tasks with an invalid date format", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: [{ name: "A", date: "1/8/2026" }] })
        .expect(400);
    });

    test("rejects tasks with a non-boolean done", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: [{ name: "A", done: "yes" }] })
        .expect(400);
    });
  });

  describe("GET /projects", () => {
    test("returns all projects sorted by priority ascending", async () => {
      const res = await request(app).get("/projects").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      expect(res.body.map((p) => p.priority)).toEqual([0, 1, 2]);
      expect(res.body.map((p) => p.name)).toEqual([
        "Automated Stock Market",
        "Home Renovation",
        "Write a Book",
      ]);
    });
  });

  describe("PUT /projects/:id", () => {
    test("updates project name", async () => {
      const res = await request(app)
        .put(`/projects/${projectId}`)
        .send({ name: "Automated Stock Market v2" })
        .expect(200);
      expect(res.body.name).toBe("Automated Stock Market v2");
      expect(res.body.tasks.length).toBe(2);
    });

    test("replaces tasks wholesale (dates, links, done → bottom)", async () => {
      const res = await request(app)
        .put(`/projects/${projectId}`)
        .send({
          tasks: [
            {
              name: "get data from EODHD",
              date: "2026-08-01",
              done: true,
              todoTaskId: "507f1f77bcf86cd799439011",
            },
            { name: "get data from Nasdaq", date: "2026-08-15" },
            { name: "deploy to cpu" },
          ],
        })
        .expect(200);
      expect(res.body.tasks).toEqual([
        {
          name: "get data from Nasdaq",
          date: "2026-08-15",
          done: false,
          todoTaskId: null,
        },
        { name: "deploy to cpu", date: null, done: false, todoTaskId: null },
        {
          name: "get data from EODHD",
          date: "2026-08-01",
          done: true,
          todoTaskId: "507f1f77bcf86cd799439011",
        },
      ]);
    });

    test("allows clearing a task date with null", async () => {
      const res = await request(app)
        .put(`/projects/${projectId}`)
        .send({
          tasks: [{ name: "get data from Nasdaq", date: null }],
        })
        .expect(200);
      expect(res.body.tasks[0].date).toBeNull();
    });

    test("allows clearing tasks with an empty array", async () => {
      const res = await request(app)
        .put(`/projects/${projectId}`)
        .send({ tasks: [] })
        .expect(200);
      expect(res.body.tasks).toEqual([]);
    });

    test("moves a project up and shifts others (priority contiguity)", async () => {
      await request(app)
        .put(`/projects/${thirdId}`)
        .send({ priority: 0 })
        .expect(200);

      const res = await request(app).get("/projects").expect(200);
      expect(res.body.map((p) => p._id)).toEqual([
        thirdId,
        projectId,
        secondId,
      ]);
      expect(res.body.map((p) => p.priority)).toEqual([0, 1, 2]);
    });

    test("moves a project down and shifts others", async () => {
      await request(app)
        .put(`/projects/${thirdId}`)
        .send({ priority: 2 })
        .expect(200);

      const res = await request(app).get("/projects").expect(200);
      expect(res.body.map((p) => p._id)).toEqual([
        projectId,
        secondId,
        thirdId,
      ]);
      expect(res.body.map((p) => p.priority)).toEqual([0, 1, 2]);
    });

    test("rejects an out-of-range priority", async () => {
      await request(app)
        .put(`/projects/${projectId}`)
        .send({ priority: 99 })
        .expect(400);
    });

    test("rejects a negative priority", async () => {
      await request(app)
        .put(`/projects/${projectId}`)
        .send({ priority: -1 })
        .expect(400);
    });

    test("rejects tasks with an invalid date", async () => {
      await request(app)
        .put(`/projects/${projectId}`)
        .send({ tasks: [{ name: "A", date: "2026/08/01" }] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app)
        .put(`/projects/${projectId}`)
        .send({ name: "" })
        .expect(400);
    });

    test("returns 404 for unknown id", async () => {
      await request(app)
        .put("/projects/507f1f77bcf86cd799439011")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /projects/:id", () => {
    test("deletes a project and shifts remaining priorities", async () => {
      const res = await request(app)
        .delete(`/projects/${projectId}`)
        .expect(200);
      expect(res.body.deleted).toBe(projectId);

      const list = await request(app).get("/projects").expect(200);
      expect(list.body.map((p) => p._id)).toEqual([secondId, thirdId]);
      expect(list.body.map((p) => p.priority)).toEqual([0, 1]);
    });

    test("returns 404 when deleting again", async () => {
      await request(app).delete(`/projects/${projectId}`).expect(404);
    });
  });
});
