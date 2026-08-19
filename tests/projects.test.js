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
          notes: "",
          date: "2026-08-01",
          done: false,
          todoTaskId: null,
        },
        {
          name: "get data from Nasdaq",
          notes: "",
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

    test("sorts dated undone tasks above undated ones on create (stable within each group)", async () => {
      const res = await request(app)
        .post("/projects")
        .send({
          name: "Dated First",
          tasks: [
            { name: "A undated" },
            { name: "B dated", date: "2026-09-01" },
            { name: "C done dated", done: true, date: "2026-08-01" },
            { name: "D dated", date: "2026-08-20" },
          ],
        })
        .expect(201);
      // Dated undone first in input order (not date order), then undated
      // undone, then done at the bottom.
      expect(res.body.tasks.map((t) => t.name)).toEqual([
        "B dated",
        "D dated",
        "A undated",
        "C done dated",
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

    test("persists task notes and defaults missing notes to empty string", async () => {
      const res = await request(app)
        .post("/projects")
        .send({
          name: "With Notes",
          tasks: [
            { name: "step with notes", notes: "use the v2 API key" },
            { name: "step without notes" },
          ],
        })
        .expect(201);
      expect(res.body.tasks[0].notes).toBe("use the v2 API key");
      expect(res.body.tasks[1].notes).toBe("");
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

    test("rejects tasks with non-string notes", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: [{ name: "A", notes: 42 }] })
        .expect(400);
    });

    test("rejects tasks with a non-string todoTaskId", async () => {
      await request(app)
        .post("/projects")
        .send({ name: "Bad tasks", tasks: [{ name: "A", todoTaskId: 7 }] })
        .expect(400);
    });

    test("normalizes a blank todoTaskId to null", async () => {
      const res = await request(app)
        .post("/projects")
        .send({
          name: "Blank links",
          tasks: [
            { name: "A", todoTaskId: "" },
            { name: "B", todoTaskId: "   " },
            { name: "C", todoTaskId: null },
          ],
        })
        .expect(201);

      expect(res.body.tasks.map((t) => t.todoTaskId)).toEqual([
        null,
        null,
        null,
      ]);

      // Later tests in this suite count the projects created above.
      await request(app).delete(`/projects/${res.body._id}`).expect(200);
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

    test("replaces tasks wholesale (dated first, links, done → bottom)", async () => {
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
            { name: "deploy to cpu" },
            { name: "get data from Nasdaq", date: "2026-08-15" },
          ],
        })
        .expect(200);
      expect(res.body.tasks).toEqual([
        {
          name: "get data from Nasdaq",
          notes: "",
          date: "2026-08-15",
          done: false,
          todoTaskId: null,
        },
        {
          name: "deploy to cpu",
          notes: "",
          date: null,
          done: false,
          todoTaskId: null,
        },
        {
          name: "get data from EODHD",
          notes: "",
          date: "2026-08-01",
          done: true,
          todoTaskId: "507f1f77bcf86cd799439011",
        },
      ]);
    });

    test("updates task notes wholesale", async () => {
      const res = await request(app)
        .put(`/projects/${projectId}`)
        .send({
          tasks: [{ name: "get data from Nasdaq", notes: "prefer the REST feed" }],
        })
        .expect(200);
      expect(res.body.tasks[0].notes).toBe("prefer the REST feed");
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

    test("normalizes a blank todoTaskId to null on update", async () => {
      const created = await request(app)
        .post("/projects")
        .send({ name: "Relink", tasks: [{ name: "A", todoTaskId: "abc123" }] })
        .expect(201);

      const res = await request(app)
        .put(`/projects/${created.body._id}`)
        .send({ tasks: [{ name: "A", todoTaskId: "  " }] })
        .expect(200);

      expect(res.body.tasks[0].todoTaskId).toBeNull();

      // Later tests in this suite count the projects created earlier.
      await request(app).delete(`/projects/${created.body._id}`).expect(200);
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

  describe("Project ↔ todo header ordering (server-owned)", () => {
    async function clearHeaders() {
      const db = await getDatabase();
      await db.collection("Headers-Test").deleteMany({});
      await db.collection("Tasks-Test").deleteMany({});
      await db.collection("Projects-Test").deleteMany({});
    }

    const headerNames = async () => {
      const res = await request(app).get("/headers").expect(200);
      return res.body.map((h) => h.name);
    };

    const createProject = async (name) =>
      (await request(app).post("/projects").send({ name }).expect(201)).body;

    const createProjectHeader = async (name, projectId) =>
      (await request(app).post("/headers").send({ name, projectId })).body;

    beforeEach(clearHeaders);

    test("a new project header is placed in the project block, not at the bottom", async () => {
      const p1 = await createProject("P1");
      const p2 = await createProject("P2");

      await request(app).post("/headers").send({ name: "Daily" }).expect(201);
      await request(app).post("/headers").send({ name: "Misc" }).expect(201);
      await createProjectHeader("P2", p2._id);
      await createProjectHeader("P1", p1._id);

      // Top non-project header keeps slot 0; project headers follow in the
      // projects' own order; the rest fill in after.
      expect(await headerNames()).toEqual(["Daily", "P1", "P2", "Misc"]);
    });

    test("the block starts at 0 when there is no non-project header", async () => {
      const p1 = await createProject("P1");
      const p2 = await createProject("P2");
      await createProjectHeader("P2", p2._id);
      await createProjectHeader("P1", p1._id);

      expect(await headerNames()).toEqual(["P1", "P2"]);
    });

    test("creating a header for a project that already has one is idempotent", async () => {
      const p1 = await createProject("P1");
      const first = await request(app)
        .post("/headers")
        .send({ name: "P1", projectId: p1._id })
        .expect(201);
      const again = await request(app)
        .post("/headers")
        .send({ name: "P1", projectId: p1._id })
        .expect(200);

      expect(again.body._id).toBe(first.body._id);
      expect(await headerNames()).toEqual(["P1"]);
    });

    test("adopts a pre-projectId header that matches the project by name", async () => {
      const legacy = await request(app)
        .post("/headers")
        .send({ name: "Automated Stock Market" })
        .expect(201);
      const project = await createProject("Automated Stock Market");

      const res = await request(app)
        .post("/headers")
        .send({ name: "Automated Stock Market", projectId: project._id })
        .expect(200);

      expect(res.body._id).toBe(legacy.body._id);
      expect(res.body.projectId).toBe(project._id);
      expect(await headerNames()).toEqual(["Automated Stock Market"]);
    });

    test("moving a project re-orders the todo headers", async () => {
      const p1 = await createProject("P1");
      const p2 = await createProject("P2");
      await request(app).post("/headers").send({ name: "Daily" }).expect(201);
      await createProjectHeader("P1", p1._id);
      await createProjectHeader("P2", p2._id);
      expect(await headerNames()).toEqual(["Daily", "P1", "P2"]);

      await request(app)
        .put(`/projects/${p2._id}`)
        .send({ priority: 0 })
        .expect(200);

      expect(await headerNames()).toEqual(["Daily", "P2", "P1"]);
    });

    test("renaming a project renames its todo header", async () => {
      const p1 = await createProject("P1");
      await createProjectHeader("P1", p1._id);

      await request(app)
        .put(`/projects/${p1._id}`)
        .send({ name: "Renamed" })
        .expect(200);

      expect(await headerNames()).toEqual(["Renamed"]);
    });

    test("deleting a project unlinks its header and closes the block", async () => {
      const p1 = await createProject("P1");
      const p2 = await createProject("P2");
      await request(app).post("/headers").send({ name: "Daily" }).expect(201);
      const h1 = await createProjectHeader("P1", p1._id);
      await createProjectHeader("P2", p2._id);

      const res = await request(app)
        .delete(`/projects/${p1._id}`)
        .expect(200);
      expect(res.body.headersUnlinked).toBe(1);

      const headers = (await request(app).get("/headers")).body;
      // The header survives (its tasks are still the user's), but it leaves
      // the project block and the remaining project header moves up.
      expect(headers.find((h) => h._id === h1._id).projectId).toBeNull();
      expect(headers.map((h) => h.name)).toEqual(["Daily", "P2", "P1"]);
    });

    test("rejects a malformed projectId", async () => {
      const res = await request(app)
        .post("/headers")
        .send({ name: "P", projectId: "not-an-id" })
        .expect(400);
      expect(res.body.error).toMatch(/projectId/);
    });
  });
});
