const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollection() {
  const db = await getDatabase();
  await db.collection("Calls-Test").deleteMany({});
}

describe("Calls CRUD", () => {
  beforeAll(async () => {
    await connectDB();
    await clearCollection();
  });

  describe("GET /calls (empty)", () => {
    test("returns empty array when no calls exist", async () => {
      await clearCollection();
      const res = await request(app).get("/calls").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  let callId;

  describe("POST /calls", () => {
    test("creates a call with done=false and doneAt=null", async () => {
      const res = await request(app)
        .post("/calls")
        .send({ name: "Grandma", frequency: "biweekly" })
        .expect(201);

      expect(res.body).toHaveProperty("_id");
      expect(res.body.name).toBe("Grandma");
      expect(res.body.frequency).toBe("biweekly");
      expect(res.body.done).toBe(false);
      expect(res.body.doneAt).toBeNull();
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("updatedAt");
      callId = res.body._id;
    });

    test("creates a monthly call", async () => {
      const res = await request(app)
        .post("/calls")
        .send({ name: "Dentist", frequency: "monthly" })
        .expect(201);
      expect(res.body.frequency).toBe("monthly");
    });

    test("rejects missing name", async () => {
      const res = await request(app)
        .post("/calls")
        .send({ frequency: "biweekly" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("rejects empty name", async () => {
      await request(app)
        .post("/calls")
        .send({ name: "  ", frequency: "biweekly" })
        .expect(400);
    });

    test("rejects non-string name", async () => {
      await request(app)
        .post("/calls")
        .send({ name: 42, frequency: "biweekly" })
        .expect(400);
    });

    test("rejects missing frequency", async () => {
      const res = await request(app)
        .post("/calls")
        .send({ name: "Uncle" })
        .expect(400);
      expect(res.body).toHaveProperty("error");
    });

    test("rejects invalid frequency", async () => {
      await request(app)
        .post("/calls")
        .send({ name: "Uncle", frequency: "weekly" })
        .expect(400);
    });

    test("trims whitespace from name", async () => {
      const res = await request(app)
        .post("/calls")
        .send({ name: "  Aunt May  ", frequency: "monthly" })
        .expect(201);
      expect(res.body.name).toBe("Aunt May");
    });
  });

  describe("GET /calls", () => {
    test("returns all calls sorted by createdAt ascending", async () => {
      const res = await request(app).get("/calls").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      expect(res.body[0].name).toBe("Grandma");
      expect(res.body[1].name).toBe("Dentist");
      expect(res.body[2].name).toBe("Aunt May");
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].createdAt >= res.body[i - 1].createdAt).toBe(true);
      }
    });
  });

  describe("PUT /calls/:id", () => {
    test("updates call name", async () => {
      const res = await request(app)
        .put(`/calls/${callId}`)
        .send({ name: "Grandma (mobile)" })
        .expect(200);
      expect(res.body.name).toBe("Grandma (mobile)");
      expect(res.body._id).toBe(callId);
      expect(res.body.frequency).toBe("biweekly"); // untouched
    });

    test("updates call frequency", async () => {
      const res = await request(app)
        .put(`/calls/${callId}`)
        .send({ frequency: "monthly" })
        .expect(200);
      expect(res.body.frequency).toBe("monthly");
    });

    test("setting done=true stamps doneAt with an ISO datetime", async () => {
      const res = await request(app)
        .put(`/calls/${callId}`)
        .send({ done: true })
        .expect(200);
      expect(res.body.done).toBe(true);
      expect(typeof res.body.doneAt).toBe("string");
      expect(new Date(res.body.doneAt).toISOString()).toBe(res.body.doneAt);
    });

    test("setting done=false clears doneAt", async () => {
      const res = await request(app)
        .put(`/calls/${callId}`)
        .send({ done: false })
        .expect(200);
      expect(res.body.done).toBe(false);
      expect(res.body.doneAt).toBeNull();
    });

    test("rejects empty name", async () => {
      await request(app).put(`/calls/${callId}`).send({ name: "" }).expect(400);
    });

    test("rejects invalid frequency", async () => {
      await request(app)
        .put(`/calls/${callId}`)
        .send({ frequency: "daily" })
        .expect(400);
    });

    test("rejects non-boolean done", async () => {
      await request(app)
        .put(`/calls/${callId}`)
        .send({ done: "yes" })
        .expect(400);
    });

    test("returns 404 for unknown id", async () => {
      await request(app)
        .put("/calls/507f1f77bcf86cd799439011")
        .send({ name: "Ghost" })
        .expect(404);
    });

    test("returns 500 for a malformed ObjectId", async () => {
      // Invalid ObjectIds throw in the model and hit the controller's
      // catch block (same behavior as the other resources).
      const res = await request(app)
        .put("/calls/not-a-valid-id")
        .send({ name: "Ghost" })
        .expect(500);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("DELETE /calls/:id", () => {
    test("deletes a call", async () => {
      const res = await request(app).delete(`/calls/${callId}`).expect(200);
      expect(res.body.deleted).toBe(callId);
    });

    test("returns 404 when deleting again", async () => {
      await request(app).delete(`/calls/${callId}`).expect(404);
    });

    test("returns 500 for a malformed ObjectId", async () => {
      const res = await request(app).delete("/calls/not-a-valid-id").expect(500);
      expect(res.body).toHaveProperty("error");
    });
  });
});
