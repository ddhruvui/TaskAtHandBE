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
      goalId = res.body._id;
    });

    test("creates a goal without steps (defaults to empty list)", async () => {
      const res = await request(app)
        .post("/goals")
        .send({ name: "Better Finances" })
        .expect(201);
      expect(res.body.steps).toEqual([]);
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
    test("returns all goals sorted by name ascending", async () => {
      const res = await request(app).get("/goals").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      for (let i = 1; i < res.body.length; i++) {
        expect(
          res.body[i].name.localeCompare(res.body[i - 1].name),
        ).toBeGreaterThanOrEqual(0);
      }
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
});
