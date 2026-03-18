const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("API Contract & Response Consistency", () => {
  beforeAll(async () => {
    await connectDB();

    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`API Contract Tests: ${collectionName} collection cleared`);

    // Create some test tasks
    await request(app)
      .post("/api/office")
      .send({ name: "Test Task 1", done: false });
    await request(app)
      .post("/api/office")
      .send({ name: "Test Task 2", done: true });
    await request(app)
      .post("/api/office")
      .send({ name: "Test Task 3", done: false });
  });

  describe("Response Structure Consistency", () => {
    test("POST /api/office should return consistent structure", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Consistency Test" })
        .expect(201);

      // Check response structure
      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("message");

      expect(response.body.success).toBe(true);
      expect(typeof response.body.message).toBe("string");

      // Check data structure
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data).toHaveProperty("name");
      expect(response.body.data).toHaveProperty("notes");
      expect(response.body.data).toHaveProperty("done");
      expect(response.body.data).toHaveProperty("priority");
      expect(response.body.data).toHaveProperty("ecd");
      expect(response.body.data).toHaveProperty("createdAt");
      expect(response.body.data).toHaveProperty("updatedAt");
    });

    test("GET /api/office should return consistent structure", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("count");
      expect(response.body).toHaveProperty("data");

      expect(response.body.success).toBe(true);
      expect(typeof response.body.count).toBe("number");
      expect(Array.isArray(response.body.data)).toBe(true);

      // Check each task has consistent structure
      if (response.body.data.length > 0) {
        response.body.data.forEach((task) => {
          expect(task).toHaveProperty("_id");
          expect(task).toHaveProperty("name");
          expect(task).toHaveProperty("notes");
          expect(task).toHaveProperty("done");
          expect(task).toHaveProperty("priority");
        });
      }
    });

    test("GET /api/office/:id should return consistent structure", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Get by ID test" });

      const taskId = createResponse.body.data._id;

      const response = await request(app)
        .get(`/api/office/${taskId}`)
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("data");

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data._id).toBe(taskId);
    });

    test("PUT /api/office/:id should return consistent structure", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Update test" });

      const taskId = createResponse.body.data._id;

      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Updated name" })
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("message");

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.name).toBe("Updated name");
    });

    test("DELETE /api/office/:id should return consistent structure", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Delete test" });

      const taskId = createResponse.body.data._id;

      const response = await request(app)
        .delete(`/api/office/${taskId}`)
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("message");

      expect(response.body.success).toBe(true);
      expect(typeof response.body.message).toBe("string");
    });
  });

  describe("HTTP Status Codes", () => {
    test("should return 200 for successful GET", async () => {
      await request(app).get("/api/office").expect(200);
    });

    test("should return 201 for successful POST", async () => {
      await request(app)
        .post("/api/office")
        .send({ name: "Status code test" })
        .expect(201);
    });

    test("should return 200 for successful PUT", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "For PUT" });

      await request(app)
        .put(`/api/office/${createResponse.body.data._id}`)
        .send({ name: "Updated" })
        .expect(200);
    });

    test("should return 200 for successful DELETE", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "For DELETE" });

      await request(app)
        .delete(`/api/office/${createResponse.body.data._id}`)
        .expect(200);
    });

    test("should return 400 for invalid request (missing name)", async () => {
      await request(app).post("/api/office").send({}).expect(400);
    });

    test("should return 404 for non-existent task", async () => {
      await request(app).get("/api/office/507f1f77bcf86cd799439011").expect(404);
    });

    test("should return 404 for non-existent route", async () => {
      await request(app).get("/api/nonexistent").expect(404);
    });

    test("should return 500 for invalid ObjectId", async () => {
      await request(app).get("/api/office/invalid-id").expect(500);
    });
  });

  describe("Content-Type Headers", () => {
    test("GET /api/office should return JSON", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    test("POST /api/office should return JSON", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Header test" })
        .expect(201);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    test("PUT /api/office/:id should return JSON", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "For PUT header test" });

      const response = await request(app)
        .put(`/api/office/${createResponse.body.data._id}`)
        .send({ name: "Updated" })
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    test("Error responses should return JSON", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({})
        .expect(400);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    test("404 responses should return JSON", async () => {
      const response = await request(app)
        .get("/api/office/507f1f77bcf86cd799439011")
        .expect(404);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });
  });

  describe("Error Response Format", () => {
    test("400 errors should have consistent format", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty("error");
      expect(typeof response.body.error).toBe("string");
    });

    test("404 errors should have consistent format", async () => {
      const response = await request(app)
        .get("/api/office/507f1f77bcf86cd799439011")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty("error");
      expect(typeof response.body.error).toBe("string");
    });

    test("500 errors should have consistent format", async () => {
      const response = await request(app)
        .get("/api/office/invalid-id")
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Data Type Consistency", () => {
    test("_id should always be a string", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Type test" });

      expect(typeof response.body.data._id).toBe("string");
    });

    test("name should always be a string", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "String test" });

      expect(typeof response.body.data.name).toBe("string");
    });

    test("notes should always be a string", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Notes test", notes: "Test notes" });

      expect(typeof response.body.data.notes).toBe("string");
    });

    test("done should always be a boolean", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Boolean test", done: true });

      expect(typeof response.body.data.done).toBe("boolean");
    });

    test("priority should always be a number", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Priority test" });

      expect(typeof response.body.data.priority).toBe("number");
    });

    test("count in GET all should always be a number", async () => {
      const response = await request(app).get("/api/office");

      expect(typeof response.body.count).toBe("number");
    });

    test("data in GET all should always be an array", async () => {
      const response = await request(app).get("/api/office");

      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("Field Presence Consistency", () => {
    test("All tasks should have required fields", async () => {
      const response = await request(app).get("/api/office").expect(200);

      response.body.data.forEach((task) => {
        // Required fields
        expect(task).toHaveProperty("_id");
        expect(task).toHaveProperty("name");
        expect(task).toHaveProperty("done");
        expect(task).toHaveProperty("priority");

        // These should exist even if null/empty
        expect(task).toHaveProperty("notes");
      });
    });

    test("Created tasks should have timestamp fields", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Timestamp test" })
        .expect(201);

      expect(response.body.data).toHaveProperty("createdAt");
      expect(response.body.data).toHaveProperty("updatedAt");

      // Timestamps should be valid dates
      expect(new Date(response.body.data.createdAt).getTime()).toBeGreaterThan(
        0,
      );
      expect(new Date(response.body.data.updatedAt).getTime()).toBeGreaterThan(
        0,
      );
    });
  });

  describe("Success Flag Consistency", () => {
    test("success should be true for successful operations", async () => {
      const createRes = await request(app)
        .post("/api/office")
        .send({ name: "Success test" });
      expect(createRes.body.success).toBe(true);

      const getRes = await request(app).get("/api/office");
      expect(getRes.body.success).toBe(true);

      const updateRes = await request(app)
        .put(`/api/office/${createRes.body.data._id}`)
        .send({ name: "Updated" });
      expect(updateRes.body.success).toBe(true);

      const deleteRes = await request(app).delete(
        `/api/office/${createRes.body.data._id}`,
      );
      expect(deleteRes.body.success).toBe(true);
    });

    test("success should be false for failed operations", async () => {
      const invalidCreate = await request(app).post("/api/office").send({});
      expect(invalidCreate.body.success).toBe(false);

      const notFound = await request(app).get(
        "/api/office/507f1f77bcf86cd799439011",
      );
      expect(notFound.body.success).toBe(false);

      const invalidId = await request(app).get("/api/office/invalid");
      expect(invalidId.body.success).toBe(false);
    });
  });

  describe("CORS Headers", () => {
    test("should include CORS headers in response", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe("*");
    });

    test("should handle OPTIONS preflight request", async () => {
      const response = await request(app).options("/api/office");

      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-methods"]).toContain("GET");
      expect(response.headers["access-control-allow-methods"]).toContain(
        "POST",
      );
    });
  });
});
