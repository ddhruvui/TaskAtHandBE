const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("Affirmations-Test").deleteMany({});
}

describe("Affirmations CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /affirmations (empty)", () => {
    test("returns empty array when no affirmations exist", async () => {
      await clearCollection();
      const res = await request(app).get("/affirmations").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let affirmationId;

  describe("POST /affirmations", () => {
    test("creates an affirmation", async () => {
      const res = await request(app)
        .post("/affirmations")
        .send({ name: "Thank you blessing" })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Thank you blessing");
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
      affirmationId = res.body._id;
    });

    test("rejects missing name", async () => {
      await request(app).post("/affirmations").send({}).expect(400);
    });

    test("rejects empty name", async () => {
      await request(app).post("/affirmations").send({ name: "  " }).expect(400);
    });

    test("rejects non-string name", async () => {
      await request(app).post("/affirmations").send({ name: 42 }).expect(400);
    });

    test("trims whitespace from name", async () => {
      const res = await request(app)
        .post("/affirmations")
        .send({ name: "  I am at peace  " })
        .expect(201);
      expect(res.body.name).toBe("I am at peace");
    });
  });

  describe("GET /affirmations", () => {
    test("returns all affirmations sorted by createdAt ascending", async () => {
      const res = await request(app).get("/affirmations").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe("Thank you blessing");
      expect(res.body[1].name).toBe("I am at peace");
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].createdAt >= res.body[i - 1].createdAt).toBe(true);
      }
    });
  });

  describe("PUT /affirmations/:id", () => {
    test("updates affirmation name", async () => {
      const res = await request(app)
        .put(`/affirmations/${affirmationId}`)
        .send({ name: "Gratitude every day" })
        .expect(200);
      expect(res.body.name).toBe("Gratitude every day");
      expect(res.body._id).toBe(affirmationId);
    });

    test("rejects empty name", async () => {
      await request(app)
        .put(`/affirmations/${affirmationId}`)
        .send({ name: "" })
        .expect(400);
    });

    test("returns 404 for unknown id", async () => {
      await request(app)
        .put("/affirmations/507f1f77bcf86cd799439011")
        .send({ name: "Ghost" })
        .expect(404);
    });
  });

  describe("DELETE /affirmations/:id", () => {
    test("deletes an affirmation", async () => {
      const res = await request(app)
        .delete(`/affirmations/${affirmationId}`)
        .expect(200);
      expect(res.body.deleted).toBe(affirmationId);
    });

    test("returns 404 when deleting again", async () => {
      await request(app).delete(`/affirmations/${affirmationId}`).expect(404);
    });
  });
});
