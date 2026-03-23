const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Error Handling & Robustness", () => {
  beforeAll(async () => {
    await connectDB();

    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Error Handling Tests: ${collectionName} collection cleared`);
  });

  describe("Malformed Request Bodies", () => {
    test("should handle completely empty request body", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task name must be a non-empty string");
    });

    test("should handle request with only whitespace in required field", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "   " })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task name must be a non-empty string");
    });

    test("should handle extra unexpected fields", async () => {
      const taskData = {
        name: "Valid task",
        notes: "Notes",
        unexpectedField: "Should be ignored",
        anotherField: 123,
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Valid task");
      // Extra fields should be ignored
      expect(response.body.data.unexpectedField).toBeUndefined();
    });

    test("should handle deeply nested objects", async () => {
      const taskData = {
        name: "Test",
        nested: {
          level1: {
            level2: {
              level3: "deep",
            },
          },
        },
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should handle gracefully (either ignore or reject)
      expect([201, 400, 500]).toContain(response.status);
    });
  });

  describe("Invalid MongoDB ObjectId Formats", () => {
    test("should return 400 for invalid ObjectId format", async () => {
      const response = await request(app)
        .get("/api/office/invalid-id-format")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });

    test("should return 400 for too short ObjectId", async () => {
      const response = await request(app).get("/api/office/123").expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });

    test("should return 400 for ObjectId with invalid characters", async () => {
      const response = await request(app)
        .get("/api/office/zzzzzzzzzzzzzzzzzzzzzzz")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });

    test("should return 404 for valid format but non-existent task", async () => {
      const response = await request(app)
        .get("/api/office/507f1f77bcf86cd799439011")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task not found");
    });

    test("should handle invalid ObjectId in UPDATE", async () => {
      const response = await request(app)
        .put("/api/office/invalid-id")
        .send({ name: "Updated" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });

    test("should handle invalid ObjectId in DELETE", async () => {
      const response = await request(app)
        .delete("/api/office/invalid-id")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });
  });

  describe("Update Operation Errors", () => {
    let taskId;

    beforeAll(async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Task for error tests" });
      taskId = response.body.data._id;
    });

    test("should reject empty update (no fields)", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("No valid fields to update");
    });

    test("should reject update with only invalid fields", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ invalidField: "value" })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test("should reject negative priority", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ priority: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Priority must be a non-negative integer",
      );
    });

    test("should reject non-numeric priority", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ priority: "high" })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test("should reject priority out of bounds", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ priority: 9999 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Priority must be between");
    });
  });

  describe("Content-Type Handling", () => {
    test("should handle missing Content-Type header", async () => {
      const response = await request(app)
        .post("/api/office")
        .set("Content-Type", "")
        .send({ name: "Test" });

      // Should handle gracefully
      expect([200, 201, 400, 415]).toContain(response.status);
    });

    test("should accept application/json content type", async () => {
      const response = await request(app)
        .post("/api/office")
        .set("Content-Type", "application/json")
        .send({ name: "JSON Test" })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe("Error Message Consistency", () => {
    test("should return consistent error format for validation errors", async () => {
      const response = await request(app)
        .post("/api/office")
        .send({ name: "" })
        .expect(400);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("error");
      expect(response.body.success).toBe(false);
      expect(typeof response.body.error).toBe("string");
    });

    test("should return consistent error format for not found errors", async () => {
      const response = await request(app)
        .get("/api/office/507f1f77bcf86cd799439011")
        .expect(404);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("error");
      expect(response.body.success).toBe(false);
    });

    test("should return consistent error format for invalid ID errors", async () => {
      const response = await request(app)
        .get("/api/office/invalid-id")
        .expect(400);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("error");
      expect(response.body.success).toBe(false);
    });
  });

  describe("HTTP Method Errors", () => {
    test("should return 404 for non-existent routes", async () => {
      const response = await request(app).get("/api/nonexistent").expect(404);

      expect(response.body.error).toBe("Route not found");
    });

    test("should handle GET on non-existent task route", async () => {
      const response = await request(app)
        .get("/api/office/random/extra/path")
        .expect(404);

      expect(response.body.error).toBe("Route not found");
    });
  });

  describe("Duplicate and Idempotency", () => {
    test("should allow creating tasks with same name", async () => {
      const taskData = { name: "Duplicate Name" };

      const response1 = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      const response2 = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response1.body.data._id).not.toBe(response2.body.data._id);
      expect(response1.body.data.name).toBe(response2.body.data.name);
    });

    test("should handle updating same task multiple times", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Original" });

      const taskId = createResponse.body.data._id;

      await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Update 1" })
        .expect(200);

      await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Update 2" })
        .expect(200);

      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Final Update" })
        .expect(200);

      expect(response.body.data.name).toBe("Final Update");
    });
  });

  describe("Large Payload Handling", () => {
    test("should handle reasonably large request payload", async () => {
      const largeNotes = "A".repeat(30020); // 50KB
      const taskData = {
        name: "Large payload task",
        notes: largeNotes,
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should either accept or reject based on limits
      expect([201, 413, 500]).toContain(response.status);
    });
  });

  describe("Edge Case Operations", () => {
    test("should handle deleting already deleted task", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "To be deleted" });

      const taskId = createResponse.body.data._id;

      // First deletion
      await request(app).delete(`/api/office/${taskId}`).expect(200);

      // Second deletion attempt
      const response = await request(app)
        .delete(`/api/office/${taskId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test("should handle updating deleted task", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "To be deleted then updated" });

      const taskId = createResponse.body.data._id;

      await request(app).delete(`/api/office/${taskId}`).expect(200);

      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Updated" })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test("should handle getting deleted task", async () => {
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "To be deleted then fetched" });

      const taskId = createResponse.body.data._id;

      await request(app).delete(`/api/office/${taskId}`).expect(200);

      const response = await request(app)
        .get(`/api/office/${taskId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
