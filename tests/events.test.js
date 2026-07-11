const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("Events-Test").deleteMany({});
}

describe("Events CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /events (empty)", () => {
    test("returns empty array when no events exist", async () => {
      await clearCollection();
      const res = await request(app).get("/events").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let eventId;

  describe("POST /events", () => {
    test("creates an event with a task list", async () => {
      const res = await request(app)
        .post("/events")
        .send({
          name: "Burger Night",
          tasks: ["Procure onion", "Procure bun", "Procure patty"],
        })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Burger Night");
      expect(res.body.tasks).toEqual([
        "Procure onion",
        "Procure bun",
        "Procure patty",
      ]);
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
      eventId = res.body._id;
    });

    test("rejects missing name", async () => {
      await request(app)
        .post("/events")
        .send({ tasks: ["A"] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app)
        .post("/events")
        .send({ name: "  ", tasks: ["A"] })
        .expect(400);
    });

    test("rejects missing tasks", async () => {
      await request(app)
        .post("/events")
        .send({ name: "No tasks" })
        .expect(400);
    });

    test("rejects empty tasks array", async () => {
      await request(app)
        .post("/events")
        .send({ name: "No tasks", tasks: [] })
        .expect(400);
    });

    test("rejects tasks containing empty strings", async () => {
      await request(app)
        .post("/events")
        .send({ name: "Bad tasks", tasks: ["Fine", "  "] })
        .expect(400);
    });

    test("trims whitespace from name and tasks", async () => {
      const res = await request(app)
        .post("/events")
        .send({ name: "  Trimmed  ", tasks: ["  Task A  "] })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
      expect(res.body.tasks).toEqual(["Task A"]);
    });
  });

  describe("GET /events", () => {
    test("returns all events sorted by name ascending", async () => {
      const res = await request(app).get("/events").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      for (let i = 1; i < res.body.length; i++) {
        expect(
          res.body[i].name.localeCompare(res.body[i - 1].name),
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("PUT /events/:id", () => {
    test("updates event name", async () => {
      const res = await request(app)
        .put(`/events/${eventId}`)
        .send({ name: "Taco Night" })
        .expect(200);
      expect(res.body.name).toBe("Taco Night");
      expect(res.body.tasks).toEqual([
        "Procure onion",
        "Procure bun",
        "Procure patty",
      ]);
    });

    test("updates event tasks", async () => {
      const res = await request(app)
        .put(`/events/${eventId}`)
        .send({ tasks: ["Procure tortilla", "Procure salsa"] })
        .expect(200);
      expect(res.body.name).toBe("Taco Night");
      expect(res.body.tasks).toEqual(["Procure tortilla", "Procure salsa"]);
    });

    test("rejects empty tasks array", async () => {
      await request(app)
        .put(`/events/${eventId}`)
        .send({ tasks: [] })
        .expect(400);
    });

    test("rejects empty name", async () => {
      await request(app)
        .put(`/events/${eventId}`)
        .send({ name: "" })
        .expect(400);
    });

    test("returns 404 for unknown id", async () => {
      await request(app)
        .put("/events/507f1f77bcf86cd799439011")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /events/:id", () => {
    test("deletes an event", async () => {
      const res = await request(app).delete(`/events/${eventId}`).expect(200);
      expect(res.body.deleted).toBe(eventId);
    });

    test("returns 404 when deleting again", async () => {
      await request(app).delete(`/events/${eventId}`).expect(404);
    });
  });
});
