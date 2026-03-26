const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
}

describe("ECD Validation", () => {
  let headerId;

  beforeAll(async () => {
    await connectDB();
    await clearCollections();
    const res = await request(app)
      .post("/headers")
      .send({ name: "ECD Header" });
    headerId = res.body._id;
  });

  describe("type: date", () => {
    test("accepts valid YYYY-MM-DD value", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "date", value: "2026-12-31" },
        })
        .expect(201);
      expect(res.body.ecd).toEqual({ type: "date", value: "2026-12-31" });
    });

    test("rejects non-date string", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "date", value: "not-a-date" },
        })
        .expect(400);
    });

    test("rejects wrong format (D/M/YYYY instead of YYYY-MM-DD)", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "date", value: "25/12/2026" },
        })
        .expect(400);
    });
  });

  describe("type: day_of_week", () => {
    test("accepts valid array of day names", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_week", value: ["Mon", "Wed", "Fri"] },
        })
        .expect(201);
      expect(res.body.ecd.value).toEqual(["Mon", "Wed", "Fri"]);
    });

    test("rejects invalid day names", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_week", value: ["Monday", "Weds"] },
        })
        .expect(400);
    });

    test("rejects empty array", async () => {
      await request(app)
        .post("/tasks")
        .send({ name: "T", headerId, ecd: { type: "day_of_week", value: [] } })
        .expect(400);
    });

    test("rejects non-array value", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_week", value: "Mon" },
        })
        .expect(400);
    });
  });

  describe("type: day_of_month", () => {
    test("accepts valid array of integers 1-31", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_month", value: [1, 15, 31] },
        })
        .expect(201);
      expect(res.body.ecd.value).toEqual([1, 15, 31]);
    });

    test("rejects values out of range", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_month", value: [0, 32] },
        })
        .expect(400);
    });

    test("rejects non-integer values", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_month", value: [1.5, 10] },
        })
        .expect(400);
    });

    test("rejects empty array", async () => {
      await request(app)
        .post("/tasks")
        .send({ name: "T", headerId, ecd: { type: "day_of_month", value: [] } })
        .expect(400);
    });
  });

  describe("type: day_of_year", () => {
    test("accepts valid D/M/YYYY string", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_year", value: "7/3/2006" },
        })
        .expect(201);
      expect(res.body.ecd.value).toBe("7/3/2006");
    });

    test("accepts D/M/YYYY with single-digit day and month", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_year", value: "1/1/2030" },
        })
        .expect(201);
      expect(res.body.ecd.value).toBe("1/1/2030");
    });

    test("rejects YYYY-MM-DD format (wrong format for day_of_year)", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_year", value: "2026-12-31" },
        })
        .expect(400);
    });

    test("rejects non-string value", async () => {
      await request(app)
        .post("/tasks")
        .send({
          name: "T",
          headerId,
          ecd: { type: "day_of_year", value: [7, 3, 2006] },
        })
        .expect(400);
    });
  });

  describe("ecd: null / omitted", () => {
    test("task with no ecd field stores null", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "No ECD", headerId })
        .expect(201);
      expect(res.body.ecd).toBeNull();
    });

    test("task with explicit null ecd stores null", async () => {
      const res = await request(app)
        .post("/tasks")
        .send({ name: "Null ECD", headerId, ecd: null })
        .expect(201);
      expect(res.body.ecd).toBeNull();
    });
  });

  describe("invalid ecd type", () => {
    test("rejects unknown ecd type", async () => {
      await request(app)
        .post("/tasks")
        .send({ name: "T", headerId, ecd: { type: "weekly", value: "Mon" } })
        .expect(400);
    });

    test("rejects ecd as a plain string", async () => {
      await request(app)
        .post("/tasks")
        .send({ name: "T", headerId, ecd: "2026-12-31" })
        .expect(400);
    });
  });
});
