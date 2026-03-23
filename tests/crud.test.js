const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Task CRUD Operations", () => {
  // Connect to database before tests
  beforeAll(async () => {
    await connectDB();

    // Clear test database before CRUD tests
    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`CRUD Tests: ${collectionName} collection cleared`);
  });

  describe("CREATE - POST /api/office", () => {
    test("should create a task with all fields", async () => {
      const taskData = {
        name: "Test Task",
        notes: "Test notes",
        done: false,
        ecd: "2026-03-20",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.name).toBe(taskData.name);
      expect(response.body.data.notes).toBe(taskData.notes);
      expect(response.body.data.done).toBe(false);
      expect(response.body.data).toHaveProperty("ecd");
      expect(response.body.data.priority).toBe(0);
    });

    test("should create a task with only required fields", async () => {
      // Get current count so we know the expected priority regardless of other
      // tasks that may have been inserted by parallel test files.
      const countRes = await request(app).get("/api/office/count");
      const expectedPriority = countRes.body.count; // new undone task goes here

      const taskData = { name: "Minimal Task" };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Minimal Task");
      expect(response.body.data.notes).toBe("");
      expect(response.body.data.done).toBe(false);
      expect(response.body.data.priority).toBe(expectedPriority);
    });

    test("should reject task without name", async () => {
      const taskData = { notes: "No name provided" };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task name must be a non-empty string");
    });

    test("should reject task with empty name", async () => {
      const taskData = { name: "   " };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task name must be a non-empty string");
    });

    test("should trim whitespace from task name", async () => {
      const taskData = { name: "  Trimmed Task  " };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.data.name).toBe("Trimmed Task");
    });
  });

  describe("READ - GET /api/office", () => {
    test("should retrieve all tasks", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThan(0);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test("should retrieve task by valid ID", async () => {
      // First create a task
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Task to retrieve" })
        .expect(201);

      const taskId = createResponse.body.data._id;

      // Then retrieve it
      const response = await request(app)
        .get(`/api/office/${taskId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(taskId);
      expect(response.body.data.name).toBe("Task to retrieve");
    });

    test("should return 404 for non-existent task ID", async () => {
      const fakeId = "507f1f77bcf86cd799439011"; // Valid ObjectId format

      const response = await request(app)
        .get(`/api/office/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task not found");
    });

    test("should return 400 for invalid task ID format", async () => {
      const invalidId = "invalid-id";

      const response = await request(app)
        .get(`/api/office/${invalidId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid task ID format");
    });
  });

  describe("UPDATE - PUT /api/office/:id", () => {
    let taskId;

    beforeAll(async () => {
      // Create a task to update
      const response = await request(app)
        .post("/api/office")
        .send({ name: "Task to update", notes: "Original notes" });
      taskId = response.body.data._id;
    });

    test("should update task name", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ name: "Updated task name" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Updated task name");
    });

    test("should update task notes", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ notes: "Updated notes" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBe("Updated notes");
    });

    test("should update task done status", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ done: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.done).toBe(true);
    });

    test("should update multiple fields at once", async () => {
      const updateData = {
        name: "Multi update",
        notes: "Multiple fields updated",
        done: false,
      };

      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.notes).toBe(updateData.notes);
      expect(response.body.data.done).toBe(updateData.done);
    });

    test("should return 404 when updating non-existent task", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const response = await request(app)
        .put(`/api/office/${fakeId}`)
        .send({ name: "Updated name" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task not found");
    });

    test("should return 400 when no fields provided", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("No valid fields to update");
    });

    test("should return 400 for invalid priority", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ priority: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Priority must be a non-negative integer",
      );
    });
  });

  describe("DELETE - DELETE /api/office/:id", () => {
    test("should delete an existing task", async () => {
      // Create a task to delete
      const createResponse = await request(app)
        .post("/api/office")
        .send({ name: "Task to delete" })
        .expect(201);

      const taskId = createResponse.body.data._id;

      // Delete the task
      const deleteResponse = await request(app)
        .delete(`/api/office/${taskId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.message).toContain("deleted successfully");

      // Verify task is deleted
      await request(app).get(`/api/office/${taskId}`).expect(404);
    });

    test("should return 404 when deleting non-existent task", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const response = await request(app)
        .delete(`/api/office/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Task not found");
    });

    test("should reorder priorities after deletion", async () => {
      // Create 3 tasks
      const task1 = await request(app)
        .post("/api/office")
        .send({ name: "Priority Test 1" });
      const task2 = await request(app)
        .post("/api/office")
        .send({ name: "Priority Test 2" });
      const task3 = await request(app)
        .post("/api/office")
        .send({ name: "Priority Test 3" });

      const p1Before = task1.body.data.priority;
      const p3Before = task3.body.data.priority;

      // Delete the middle task
      await request(app)
        .delete(`/api/office/${task2.body.data._id}`)
        .expect(200);

      // Fetch the specific tasks we created and verify their priorities have no gaps
      const t1 = (await request(app).get(`/api/office/${task1.body.data._id}`))
        .body.data;
      const t3 = (await request(app).get(`/api/office/${task3.body.data._id}`))
        .body.data;

      // After deleting the middle task, task3's priority should decrease by 1
      expect(t3.priority).toBe(p3Before - 1);
      // task1 was before task2, so its priority should be unchanged
      expect(t1.priority).toBe(p1Before);
      // No gap between them
      expect(t3.priority).toBe(t1.priority + 1);
    });
  });

  describe("CRUD Complete Workflow", () => {
    test("should perform complete CRUD operations on a task", async () => {
      // CREATE
      const createResponse = await request(app)
        .post("/api/office")
        .send({
          name: "Workflow Task",
          notes: "Testing complete workflow",
          ecd: "2026-03-25",
        })
        .expect(201);

      const taskId = createResponse.body.data._id;
      expect(createResponse.body.data.name).toBe("Workflow Task");

      // READ
      const readResponse = await request(app)
        .get(`/api/office/${taskId}`)
        .expect(200);

      expect(readResponse.body.data._id).toBe(taskId);
      expect(readResponse.body.data.name).toBe("Workflow Task");

      // UPDATE
      const updateResponse = await request(app)
        .put(`/api/office/${taskId}`)
        .send({
          name: "Updated Workflow Task",
          done: true,
        })
        .expect(200);

      expect(updateResponse.body.data.name).toBe("Updated Workflow Task");
      expect(updateResponse.body.data.done).toBe(true);

      // DELETE
      const deleteResponse = await request(app)
        .delete(`/api/office/${taskId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // VERIFY DELETION
      await request(app).get(`/api/office/${taskId}`).expect(404);
    });
  });
});
