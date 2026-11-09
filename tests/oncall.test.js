const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("OnCalls-Test").deleteMany({});
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

/** Not `async`: callers chain `.expect(...)` on the supertest request itself. */
function createShift(body) {
  return request(app).post("/oncall").send(body);
}

/** A "YYYY-MM-DD" UTC day relative to today. */
function dayUtc(offsetDays = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("On-call shifts", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("POST /oncall", () => {
    test("creates a shift, defaulting type to primary", async () => {
      const date = dayUtc(7);
      const res = await createShift({ date, start: "09:00", end: "22:00" }).expect(
        201,
      );
      expect(res.body._id).toBeDefined();
      expect(res.body).toMatchObject({
        date,
        start: "09:00",
        end: "22:00",
        type: "primary",
        note: "",
      });
      expect(res.body.createdAt).toBeDefined();
    });

    test("accepts a secondary shift", async () => {
      const res = await createShift({
        date: dayUtc(7),
        start: "10:00",
        end: "18:00",
        type: "secondary",
      }).expect(201);
      expect(res.body.type).toBe("secondary");
    });

    test("accepts an overnight shift (end before start)", async () => {
      await createShift({ date: dayUtc(3), start: "22:00", end: "06:00" }).expect(
        201,
      );
    });

    test('accepts "24:00" as an end but not as a start', async () => {
      await createShift({ date: dayUtc(3), start: "09:00", end: "24:00" }).expect(
        201,
      );
      const res = await createShift({
        date: dayUtc(4),
        start: "24:00",
        end: "06:00",
      }).expect(400);
      expect(res.body.error).toMatch(/start/);
    });

    test("accepts yesterday (an overnight shift may still be running)", async () => {
      await createShift({ date: dayUtc(-1), start: "22:00", end: "06:00" }).expect(
        201,
      );
    });

    test.each([
      [{ start: "09:00", end: "22:00" }, /date/],
      [{ date: "11/16", start: "09:00", end: "22:00" }, /date/],
      [{ date: "DATE", start: "9", end: "22:00" }, /start/],
      [{ date: "DATE", start: "09:00" }, /end/],
      [{ date: "DATE", start: "09:00", end: "25:00" }, /end/],
      [{ date: "DATE", start: "09:00", end: "22:00", type: "tertiary" }, /type/],
      [{ date: "DATE", start: "09:00", end: "09:00" }, /differ/],
    ])("rejects %o", async (body, message) => {
      const res = await createShift(
        body.date === "DATE" ? { ...body, date: dayUtc(5) } : body,
      ).expect(400);
      expect(res.body.error).toMatch(message);
    });

    test("rejects a date before yesterday", async () => {
      const res = await createShift({
        date: dayUtc(-2),
        start: "09:00",
        end: "22:00",
      }).expect(400);
      expect(res.body.error).toMatch(/past/);
    });

    test("rejects an overlap, whatever the type", async () => {
      const date = dayUtc(6);
      await createShift({ date, start: "09:00", end: "22:00" }).expect(201);
      const res = await createShift({
        date,
        start: "21:00",
        end: "23:00",
        type: "secondary",
      }).expect(400);
      expect(res.body.error).toMatch(/overlaps/);
    });

    test("rejects an overlap with yesterday's overnight shift", async () => {
      await createShift({ date: dayUtc(5), start: "22:00", end: "06:00" }).expect(
        201,
      );
      await createShift({ date: dayUtc(6), start: "05:00", end: "09:00" }).expect(
        400,
      );
    });

    test("allows back-to-back shifts", async () => {
      const date = dayUtc(6);
      await createShift({ date, start: "09:00", end: "17:00" }).expect(201);
      await createShift({ date, start: "17:00", end: "22:00" }).expect(201);
    });
  });

  describe("GET /oncall", () => {
    test("lists shifts from yesterday onward, by date then start", async () => {
      const db = await getDatabase();
      // Written directly: the API would refuse a date this old.
      await db
        .collection("OnCalls-Test")
        .insertOne({ date: dayUtc(-3), start: "09:00", end: "22:00" });
      await createShift({ date: dayUtc(4), start: "14:00", end: "18:00" });
      await createShift({ date: dayUtc(4), start: "08:00", end: "12:00" });
      await createShift({ date: dayUtc(-1), start: "22:00", end: "06:00" });

      const res = await request(app).get("/oncall").expect(200);
      expect(res.body.map((s) => [s.date, s.start])).toEqual([
        [dayUtc(-1), "22:00"],
        [dayUtc(4), "08:00"],
        [dayUtc(4), "14:00"],
      ]);
    });
  });

  describe("PUT /oncall/:id", () => {
    test("updates only the fields sent", async () => {
      const created = await createShift({
        date: dayUtc(8),
        start: "09:00",
        end: "22:00",
      });
      const res = await request(app)
        .put(`/oncall/${created.body._id}`)
        .send({ type: "secondary" })
        .expect(200);
      expect(res.body).toMatchObject({
        start: "09:00",
        end: "22:00",
        type: "secondary",
      });
    });

    test("validates the resulting shift, not just the fields sent", async () => {
      const created = await createShift({
        date: dayUtc(8),
        start: "09:00",
        end: "22:00",
      });
      const res = await request(app)
        .put(`/oncall/${created.body._id}`)
        .send({ end: "09:00" })
        .expect(400);
      expect(res.body.error).toMatch(/differ/);
    });

    test("does not count the shift as overlapping itself", async () => {
      const created = await createShift({
        date: dayUtc(8),
        start: "09:00",
        end: "22:00",
      });
      await request(app)
        .put(`/oncall/${created.body._id}`)
        .send({ end: "21:00" })
        .expect(200);
    });

    test("404 for a missing or malformed id", async () => {
      await request(app)
        .put("/oncall/507f1f77bcf86cd799439011")
        .send({ type: "primary" })
        .expect(404);
      await request(app).put("/oncall/not-an-id").send({}).expect(404);
    });
  });

  describe("DELETE /oncall/:id", () => {
    test("deletes a shift", async () => {
      const created = await createShift({
        date: dayUtc(8),
        start: "09:00",
        end: "22:00",
      });
      const res = await request(app)
        .delete(`/oncall/${created.body._id}`)
        .expect(200);
      expect(res.body).toEqual({ deleted: created.body._id });
      const list = await request(app).get("/oncall");
      expect(list.body).toHaveLength(0);
    });

    test("404 for a missing id", async () => {
      await request(app).delete("/oncall/507f1f77bcf86cd799439011").expect(404);
    });
  });

  describe("Isolation — on-call never touches tasks", () => {
    test("creating and deleting shifts leaves headers and tasks alone", async () => {
      const header = await request(app).post("/headers").send({ name: "Work" });
      await request(app)
        .post("/tasks")
        .send({ headerId: header.body._id, name: "Ship it" });
      const created = await createShift({
        date: dayUtc(2),
        start: "09:00",
        end: "22:00",
      });
      await request(app).delete(`/oncall/${created.body._id}`);

      const tasks = await request(app).get(`/tasks?headerId=${header.body._id}`);
      expect(tasks.body).toHaveLength(1);
      expect(tasks.body[0].name).toBe("Ship it");
    });
  });
});
