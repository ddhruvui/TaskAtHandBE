const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("LifeEvents-Test").deleteMany({});
}

/**
 * The expected `lastAddedYear` baseline for a "D/M" date, mirroring the
 * server rule: last year while this year's occurrence is still upcoming
 * (today included), this year once it has passed. Tests compute it instead
 * of hardcoding a year so they pass on any real date.
 */
function expectedBaseline(date) {
  const [day, month] = date.split("/").map(Number);
  const now = new Date();
  const year = now.getUTCFullYear();
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const occurrence = Date.UTC(year, month - 1, Math.min(day, maxDay));
  const today = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  return occurrence < today ? year : year - 1;
}

describe("Life Events CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /lifeevents (empty)", () => {
    test("returns empty array when no life events exist", async () => {
      await clearCollection();
      const res = await request(app).get("/lifeevents").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let eventId;
  let secondId;
  let thirdId;

  describe("POST /lifeevents", () => {
    test("creates a life event with defaults applied", async () => {
      const res = await request(app)
        .post("/lifeevents")
        .send({ name: "Wife's birthday", date: "7/3" })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Wife's birthday");
      expect(res.body.date).toBe("7/3");
      expect(res.body.lastAddedYear).toBe(expectedBaseline("7/3"));
      expect(res.body.done).toBe(false);
      expect(res.body.todoTaskId).toBeNull();
      expect(res.body.priority).toBe(0);
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");

      eventId = res.body._id;
    });

    test("appends subsequent life events at the end (contiguous priorities)", async () => {
      const second = await request(app)
        .post("/lifeevents")
        .send({ name: "Anniversary", date: "25/12" })
        .expect(201);
      const third = await request(app)
        .post("/lifeevents")
        .send({ name: "Mom's birthday", date: "1/1" })
        .expect(201);

      expect(second.body.priority).toBe(1);
      expect(third.body.priority).toBe(2);
      secondId = second.body._id;
      thirdId = third.body._id;
    });

    test("trims the name and date", async () => {
      const res = await request(app)
        .post("/lifeevents")
        .send({ name: "  Trimmed  ", date: " 5/6 " })
        .expect(201);
      expect(res.body.name).toBe("Trimmed");
      expect(res.body.date).toBe("5/6");
      await request(app).delete(`/lifeevents/${res.body._id}`).expect(200);
    });

    test("rejects a missing or empty name", async () => {
      await request(app)
        .post("/lifeevents")
        .send({ date: "7/3" })
        .expect(400);
      await request(app)
        .post("/lifeevents")
        .send({ name: "   ", date: "7/3" })
        .expect(400);
    });

    test("rejects invalid dates", async () => {
      const invalid = ["2026-03-07", "7/3/2026", "0/3", "32/1", "7/13", "30/2", "31/4", 7];
      for (const date of invalid) {
        const res = await request(app)
          .post("/lifeevents")
          .send({ name: "Bad date", date })
          .expect(400);
        expect(res.body).toHaveProperty("error");
      }
    });

    test("accepts Feb 29", async () => {
      const res = await request(app)
        .post("/lifeevents")
        .send({ name: "Leap day", date: "29/2" })
        .expect(201);
      expect(res.body.date).toBe("29/2");
      await request(app).delete(`/lifeevents/${res.body._id}`).expect(200);
    });
  });

  describe("GET /lifeevents", () => {
    test("returns all life events sorted by priority", async () => {
      const res = await request(app).get("/lifeevents").expect(200);
      expect(res.body.map((e) => e.name)).toEqual([
        "Wife's birthday",
        "Anniversary",
        "Mom's birthday",
      ]);
      expect(res.body.map((e) => e.priority)).toEqual([0, 1, 2]);
    });
  });

  describe("PUT /lifeevents/:id", () => {
    test("renames a life event without touching date or lastAddedYear", async () => {
      const before = await request(app).get("/lifeevents");
      const baseline = before.body.find((e) => e._id === eventId).lastAddedYear;

      const res = await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ name: "Wife's birthday!" })
        .expect(200);
      expect(res.body.name).toBe("Wife's birthday!");
      expect(res.body.date).toBe("7/3");
      expect(res.body.lastAddedYear).toBe(baseline);
    });

    test("toggles done and sets/clears the todo link", async () => {
      const res = await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ done: true, todoTaskId: "507f1f77bcf86cd799439011" })
        .expect(200);
      expect(res.body.done).toBe(true);
      expect(res.body.todoTaskId).toBe("507f1f77bcf86cd799439011");

      const undone = await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ done: false, todoTaskId: null })
        .expect(200);
      expect(undone.body.done).toBe(false);
      expect(undone.body.todoTaskId).toBeNull();
    });

    test("a date change re-baselines lastAddedYear", async () => {
      const res = await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ date: "8/3" })
        .expect(200);
      expect(res.body.date).toBe("8/3");
      expect(res.body.lastAddedYear).toBe(expectedBaseline("8/3"));

      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ date: "7/3" })
        .expect(200);
    });

    test("a no-op date write does not re-baseline lastAddedYear", async () => {
      const db = await getDatabase();
      const { ObjectId } = require("mongodb");
      await db
        .collection("LifeEvents-Test")
        .updateOne(
          { _id: new ObjectId(eventId) },
          { $set: { lastAddedYear: 1999 } },
        );

      const res = await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ date: "7/3" })
        .expect(200);
      expect(res.body.lastAddedYear).toBe(1999);
    });

    test("rejects invalid updates", async () => {
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ name: "" })
        .expect(400);
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ date: "32/1" })
        .expect(400);
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ done: "yes" })
        .expect(400);
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ todoTaskId: 42 })
        .expect(400);
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ priority: -1 })
        .expect(400);
      await request(app)
        .put(`/lifeevents/${eventId}`)
        .send({ priority: 99 })
        .expect(400);
    });

    test("moves a life event and shifts the others to stay contiguous", async () => {
      // Order: Wife's birthday (0), Anniversary (1), Mom's birthday (2)
      await request(app)
        .put(`/lifeevents/${thirdId}`)
        .send({ priority: 0 })
        .expect(200);

      const res = await request(app).get("/lifeevents").expect(200);
      expect(res.body.map((e) => e.name)).toEqual([
        "Mom's birthday",
        "Wife's birthday!",
        "Anniversary",
      ]);
      expect(res.body.map((e) => e.priority)).toEqual([0, 1, 2]);

      // Move back down
      await request(app)
        .put(`/lifeevents/${thirdId}`)
        .send({ priority: 2 })
        .expect(200);
      const restored = await request(app).get("/lifeevents").expect(200);
      expect(restored.body.map((e) => e.priority)).toEqual([0, 1, 2]);
    });

    test("returns 404 for an unknown id", async () => {
      await request(app)
        .put("/lifeevents/507f1f77bcf86cd799439099")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /lifeevents/:id", () => {
    test("deletes a life event and closes the priority gap", async () => {
      const res = await request(app)
        .delete(`/lifeevents/${secondId}`)
        .expect(200);
      expect(res.body).toEqual({ deleted: secondId });

      const remaining = await request(app).get("/lifeevents").expect(200);
      expect(remaining.body.map((e) => e.name)).toEqual([
        "Wife's birthday!",
        "Mom's birthday",
      ]);
      expect(remaining.body.map((e) => e.priority)).toEqual([0, 1]);
    });

    test("returns 404 for an unknown id", async () => {
      await request(app)
        .delete("/lifeevents/507f1f77bcf86cd799439099")
        .expect(404);
    });
  });
});
