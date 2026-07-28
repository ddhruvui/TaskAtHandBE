const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("Goals-Test").deleteMany({});
}

describe("Goals CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /goals (empty)", () => {
    test("returns empty array when no goals exist", async () => {
      await clearCollection();
      const res = await request(app).get("/goals").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let goalId;

  describe("POST /goals", () => {
    test("creates a goal with a step list", async () => {
      const res = await request(app)
        .post("/goals")
        .send({
          name: "Improve Health",
          steps: [
            { name: "Wake up at 6", status: "under_progress" },
            { name: "Have 1 fruit a day" },
          ],
        })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Improve Health");
      expect(res.body.steps).toEqual([
        { name: "Wake up at 6", status: "under_progress" },
        { name: "Have 1 fruit a day", status: "pending" },
      ]);
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
      // First goal in an empty collection sits at the top
      expect(res.body.priority).toBe(0);
      goalId = res.body._id;
    });

    test("creates a goal without steps (defaults to empty list)", async () => {
      const res = await request(app)
        .post("/goals")
        .send({ name: "Better Finances" })
        .expect(201);
      expect(res.body.steps).toEqual([]);
      // Appended at the end, same scheme as headers and projects
      expect(res.body.priority).toBe(1);
    });

    test("rejects missing name", async () => {
      await request(app)
        .post("/goals")
        .send({ steps: [{ name: "A" }] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app)
        .post("/goals")
        .send({ name: "  ", steps: [{ name: "A" }] })
        .expect(400);
    });

    test("rejects steps that are not an array", async () => {
      await request(app)
        .post("/goals")
        .send({ name: "Bad steps", steps: "Wake up at 6" })
        .expect(400);
    });

    test("rejects steps that are plain strings", async () => {
      await request(app)
        .post("/goals")
        .send({ name: "Bad steps", steps: ["Wake up at 6"] })
        .expect(400);
    });

    test("rejects steps with empty names", async () => {
      await request(app)
        .post("/goals")
        .send({ name: "Bad steps", steps: [{ name: "  " }] })
        .expect(400);
    });

    test("rejects steps with an invalid status", async () => {
      await request(app)
        .post("/goals")
        .send({
          name: "Bad steps",
          steps: [{ name: "Wake up at 6", status: "done" }],
        })
        .expect(400);
    });

    test("normalizes legacy statuses (achieved, active) to under_progress", async () => {
      const res = await request(app)
        .post("/goals")
        .send({
          name: "Legacy",
          steps: [
            { name: "Wake up at 6", status: "achieved" },
            { name: "Have 1 fruit a day", status: "active" },
          ],
        })
        .expect(201);
      expect(res.body.steps).toEqual([
        { name: "Wake up at 6", status: "under_progress" },
        { name: "Have 1 fruit a day", status: "under_progress" },
      ]);
      await request(app).delete(`/goals/${res.body._id}`).expect(200);
    });

    test("trims whitespace from name and step names", async () => {
      const res = await request(app)
        .post("/goals")
        .send({ name: "  Trimmed  ", steps: [{ name: "  Step A  " }] })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
      expect(res.body.steps).toEqual([{ name: "Step A", status: "pending" }]);
    });
  });

  describe("GET /goals", () => {
    test("returns all goals sorted by priority ascending (creation order)", async () => {
      const res = await request(app).get("/goals").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      // New goals append at the end, so priority order is creation order;
      // "Legacy" was created and deleted in between, closing its gap.
      expect(res.body.map((g) => g.name)).toEqual([
        "Improve Health",
        "Better Finances",
        "Trimmed",
      ]);
      expect(res.body.map((g) => g.priority)).toEqual([0, 1, 2]);
    });
  });

  describe("PUT /goals/:id", () => {
    test("updates goal name", async () => {
      const res = await request(app)
        .put(`/goals/${goalId}`)
        .send({ name: "Get Healthy" })
        .expect(200);
      expect(res.body.name).toBe("Get Healthy");
      expect(res.body.steps).toEqual([
        { name: "Wake up at 6", status: "under_progress" },
        { name: "Have 1 fruit a day", status: "pending" },
      ]);
    });

    test("updates goal steps (replace wholesale, e.g. status change)", async () => {
      const res = await request(app)
        .put(`/goals/${goalId}`)
        .send({
          steps: [
            { name: "Wake up at 6", status: "pending" },
            { name: "Have 1 fruit a day", status: "under_progress" },
            { name: "Exercise 10 min", status: "pending" },
          ],
        })
        .expect(200);
      expect(res.body.name).toBe("Get Healthy");
      expect(res.body.steps).toEqual([
        { name: "Wake up at 6", status: "pending" },
        { name: "Have 1 fruit a day", status: "under_progress" },
        { name: "Exercise 10 min", status: "pending" },
      ]);
    });

    test("allows clearing steps with an empty array", async () => {
      const res = await request(app)
        .put(`/goals/${goalId}`)
        .send({ steps: [] })
        .expect(200);
      expect(res.body.steps).toEqual([]);
    });

    test("rejects steps with an invalid status", async () => {
      await request(app)
        .put(`/goals/${goalId}`)
        .send({ steps: [{ name: "Wake up at 6", status: "started" }] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app).put(`/goals/${goalId}`).send({ name: "" }).expect(400);
    });

    test("returns 404 for unknown id", async () => {
      await request(app)
        .put("/goals/507f1f77bcf86cd799439011")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /goals/:id", () => {
    test("deletes a goal", async () => {
      const res = await request(app).delete(`/goals/${goalId}`).expect(200);
      expect(res.body.deleted).toBe(goalId);
    });

    test("returns 404 when deleting again", async () => {
      await request(app).delete(`/goals/${goalId}`).expect(404);
    });
  });

  describe("Goal priority ordering", () => {
    let ids;

    /** Fresh A/B/C at priorities 0/1/2. */
    async function seedThree() {
      await clearCollection();
      ids = [];
      for (const name of ["A", "B", "C"]) {
        const res = await request(app).post("/goals").send({ name }).expect(201);
        ids.push(res.body._id);
      }
    }

    async function order() {
      const res = await request(app).get("/goals").expect(200);
      return res.body.map((g) => `${g.name}:${g.priority}`);
    }

    beforeEach(seedThree);

    test("moves a goal up and shifts the displaced one down", async () => {
      await request(app)
        .put(`/goals/${ids[2]}`)
        .send({ priority: 0 })
        .expect(200);
      expect(await order()).toEqual(["C:0", "A:1", "B:2"]);
    });

    test("moves a goal down and shifts the displaced ones up", async () => {
      await request(app)
        .put(`/goals/${ids[0]}`)
        .send({ priority: 2 })
        .expect(200);
      expect(await order()).toEqual(["B:0", "C:1", "A:2"]);
    });

    test("moving to the same priority is a no-op", async () => {
      await request(app)
        .put(`/goals/${ids[1]}`)
        .send({ priority: 1 })
        .expect(200);
      expect(await order()).toEqual(["A:0", "B:1", "C:2"]);
    });

    test("updates name and priority together", async () => {
      const res = await request(app)
        .put(`/goals/${ids[0]}`)
        .send({ name: "A renamed", priority: 1 })
        .expect(200);
      expect(res.body.name).toBe("A renamed");
      expect(res.body.priority).toBe(1);
      expect(await order()).toEqual(["B:0", "A renamed:1", "C:2"]);
    });

    test("rejects a priority beyond the last goal", async () => {
      await request(app)
        .put(`/goals/${ids[0]}`)
        .send({ priority: 99 })
        .expect(400);
      expect(await order()).toEqual(["A:0", "B:1", "C:2"]);
    });

    test("rejects a negative priority", async () => {
      await request(app)
        .put(`/goals/${ids[0]}`)
        .send({ priority: -1 })
        .expect(400);
    });

    test("rejects a non-integer priority", async () => {
      await request(app)
        .put(`/goals/${ids[0]}`)
        .send({ priority: 1.5 })
        .expect(400);
    });

    test("closes the gap when a middle goal is deleted", async () => {
      await request(app).delete(`/goals/${ids[1]}`).expect(200);
      expect(await order()).toEqual(["A:0", "C:1"]);
    });

    test("backfills priorities for goals stored before the field existed", async () => {
      // Simulate legacy documents: drop the field entirely
      const db = await getDatabase();
      await db
        .collection("Goals-Test")
        .updateMany({}, { $unset: { priority: "" } });

      // First read assigns contiguous priorities in name order, so the list
      // looks exactly as it did under the old name-ascending sort
      expect(await order()).toEqual(["A:0", "B:1", "C:2"]);

      // ...and the backfilled values persist, so moves work straight after
      await request(app)
        .put(`/goals/${ids[2]}`)
        .send({ priority: 0 })
        .expect(200);
      expect(await order()).toEqual(["C:0", "A:1", "B:2"]);
    });
  });
});
