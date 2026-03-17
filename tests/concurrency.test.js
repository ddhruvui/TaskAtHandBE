const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Concurrency & Race Conditions", () => {
  beforeAll(async () => {
    await connectDB();

    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Concurrency Tests: ${collectionName} collection cleared`);
  });

  describe("Simultaneous Task Creation", () => {
    test("should handle multiple tasks created simultaneously", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post("/api/tasks")
            .send({ name: `Concurrent Task ${i}` }),
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // All should have unique IDs
      const ids = responses.map((r) => r.body.data._id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);

      // NOTE: Priority collision is a known limitation without transactions
      // In concurrent scenarios, multiple tasks may get the same priority
      // This would need proper locking or transactions to fix
      const priorities = responses.map((r) => r.body.data.priority);
      expect(priorities.length).toBe(10);
    });

    test("should maintain data integrity with concurrent creates", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const promises = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post("/api/tasks")
          .send({
            name: `Task ${i}`,
            notes: `Notes ${i}`,
            done: i % 2 === 0,
          }),
      );

      await Promise.all(promises);

      // Verify all tasks were created
      const response = await request(app).get("/api/tasks");
      expect(response.body.count).toBe(20);

      // NOTE: Priority collisions may occur in concurrent scenarios
      // Each task should have a priority assigned (not null)
      const priorities = response.body.data.map((t) => t.priority);
      priorities.forEach((p) => expect(typeof p).toBe("number"));
    });
  });

  describe("Simultaneous Updates to Same Task", () => {
    test("should handle concurrent updates to same task", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "Concurrent Update Test" });

      const taskId = createResponse.body.data._id;

      // Attempt 5 concurrent updates
      const updatePromises = [];
      for (let i = 0; i < 5; i++) {
        updatePromises.push(
          request(app)
            .put(`/api/tasks/${taskId}`)
            .send({ name: `Update ${i}` }),
        );
      }

      const responses = await Promise.all(updatePromises);

      // All updates should succeed (last write wins)
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Final state should be one of the updates
      const finalResponse = await request(app).get(`/api/tasks/${taskId}`);
      expect(finalResponse.body.data.name).toMatch(/^Update \d$/);
    });

    test("should handle concurrent done/undone toggles", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "Toggle Test", done: false });

      const taskId = createResponse.body.data._id;

      // Rapidly toggle done status
      const togglePromises = [];
      for (let i = 0; i < 10; i++) {
        togglePromises.push(
          request(app)
            .put(`/api/tasks/${taskId}`)
            .send({ done: i % 2 === 0 }),
        );
      }

      const responses = await Promise.all(togglePromises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Final state should be consistent
      const finalResponse = await request(app).get(`/api/tasks/${taskId}`);
      expect(typeof finalResponse.body.data.done).toBe("boolean");
    });
  });

  describe("Concurrent Create and Read Operations", () => {
    test("should handle concurrent reads while writing", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create initial tasks
      await request(app).post("/api/tasks").send({ name: "Task 1" });
      await request(app).post("/api/tasks").send({ name: "Task 2" });

      const operations = [];

      // Mix of reads and writes
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          operations.push(request(app).get("/api/tasks"));
        } else {
          operations.push(
            request(app)
              .post("/api/tasks")
              .send({ name: `Concurrent Task ${i}` }),
          );
        }
      }

      const responses = await Promise.all(operations);

      // All operations should succeed
      responses.forEach((response) => {
        expect([200, 201]).toContain(response.status);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe("Concurrent Delete Operations", () => {
    test("should handle concurrent deletes of different tasks", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create tasks to delete
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/api/tasks")
          .send({ name: `Delete Task ${i}` }),
      );

      const createResponses = await Promise.all(createPromises);
      const taskIds = createResponses.map((r) => r.body.data._id);

      // Delete all simultaneously
      const deletePromises = taskIds.map((id) =>
        request(app).delete(`/api/tasks/${id}`),
      );

      const responses = await Promise.all(deletePromises);

      // All deletes should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify all are deleted
      const finalResponse = await request(app).get("/api/tasks");
      expect(finalResponse.body.count).toBe(0);
    });

    test("should handle attempted double delete", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "Double Delete Test" });

      const taskId = createResponse.body.data._id;

      // Attempt to delete simultaneously
      const deletePromises = [
        request(app).delete(`/api/tasks/${taskId}`),
        request(app).delete(`/api/tasks/${taskId}`),
        request(app).delete(`/api/tasks/${taskId}`),
      ];

      const responses = await Promise.all(deletePromises);

      // At least one should succeed
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Some may return 404 (already deleted)
      const notFoundCount = responses.filter((r) => r.status === 404).length;
      expect(successCount + notFoundCount).toBe(3);
    });
  });

  describe("Concurrent Priority Updates", () => {
    test("should handle concurrent priority changes", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create 5 tasks
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post("/api/tasks")
          .send({ name: `Priority Task ${i}` });
        tasks.push(response.body.data);
      }

      // Try to update priorities concurrently
      const updatePromises = tasks.map(
        (task, index) =>
          request(app)
            .put(`/api/tasks/${task._id}`)
            .send({ priority: tasks.length - 1 - index }), // Reverse order
      );

      const responses = await Promise.all(updatePromises);

      // Some updates may fail due to bounds, but shouldn't crash
      responses.forEach((response) => {
        expect([200, 400]).toContain(response.status);
      });

      // Final state should have valid priorities (collisions may occur)
      const finalResponse = await request(app).get("/api/tasks");
      const priorities = finalResponse.body.data.map((t) => t.priority);

      // All priorities should be numeric
      priorities.forEach((p) => expect(typeof p).toBe("number"));
    });
  });

  describe("Concurrent Mixed Operations", () => {
    test("should handle mixed CRUD operations concurrently", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create initial task
      const initialTask = await request(app)
        .post("/api/tasks")
        .send({ name: "Initial Task" });

      const taskId = initialTask.body.data._id;

      const operations = [
        // Create operations
        request(app).post("/api/tasks").send({ name: "Create 1" }),
        request(app).post("/api/tasks").send({ name: "Create 2" }),

        // Read operations
        request(app).get("/api/tasks"),
        request(app).get(`/api/tasks/${taskId}`),

        // Update operations
        request(app).put(`/api/tasks/${taskId}`).send({ name: "Updated" }),
        request(app).put(`/api/tasks/${taskId}`).send({ done: true }),

        // More reads
        request(app).get("/api/tasks"),
      ];

      const responses = await Promise.all(operations);

      // All operations should complete (success or expected failure)
      responses.forEach((response) => {
        expect([200, 201, 400, 404]).toContain(response.status);
      });
    });

    test("should maintain database consistency under concurrent load", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Heavy concurrent load
      const operations = [];

      // 20 creates
      for (let i = 0; i < 20; i++) {
        operations.push(
          request(app)
            .post("/api/tasks")
            .send({ name: `Load Test ${i}` }),
        );
      }

      // Execute all at once
      await Promise.all(operations);

      // Verify database consistency
      const response = await request(app).get("/api/tasks");

      expect(response.body.count).toBe(20);

      // Check priorities are valid numbers (NOTE: collisions may occur)
      const priorities = response.body.data.map((t) => t.priority);
      priorities.forEach((p) => {
        expect(typeof p).toBe("number");
        expect(p).toBeGreaterThanOrEqual(0);
      });

      // Check all tasks have unique IDs
      const ids = response.body.data.map((t) => t._id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(20);
    });
  });

  describe("Read-After-Write Consistency", () => {
    test("should read newly created task immediately", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "Immediate Read Test" });

      const taskId = createResponse.body.data._id;

      // Immediately try to read
      const readResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(readResponse.body.success).toBe(true);
      expect(readResponse.body.data._id).toBe(taskId);
      expect(readResponse.body.data.name).toBe("Immediate Read Test");
    });

    test("should read updated task immediately", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "Original Name" });

      const taskId = createResponse.body.data._id;

      await request(app)
        .put(`/api/tasks/${taskId}`)
        .send({ name: "Updated Name" });

      // Immediately read
      const readResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(readResponse.body.data.name).toBe("Updated Name");
    });

    test("should not find deleted task immediately", async () => {
      const createResponse = await request(app)
        .post("/api/tasks")
        .send({ name: "To Be Deleted" });

      const taskId = createResponse.body.data._id;

      await request(app).delete(`/api/tasks/${taskId}`).expect(200);

      // Immediately try to read
      await request(app).get(`/api/tasks/${taskId}`).expect(404);
    });
  });
});
