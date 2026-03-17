const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Chron Endpoint - DELETE /api/tasks/chron", () => {
  let taskIds = {};

  beforeAll(async () => {
    await connectDB();

    // Clear test database before chron tests
    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Chron Tests: ${collectionName} collection cleared`);
  });

  beforeEach(async () => {
    // Clear database before each test for isolation
    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    taskIds = {};
  });

  describe("Delete done tasks functionality", () => {
    test("should delete all done tasks", async () => {
      // Create mix of done and undone tasks
      const task1 = await request(app)
        .post("/api/tasks")
        .send({ name: "Undone Task 1", done: false });
      const task2 = await request(app)
        .post("/api/tasks")
        .send({ name: "Done Task 1", done: true });
      const task3 = await request(app)
        .post("/api/tasks")
        .send({ name: "Done Task 2", done: true });
      const task4 = await request(app)
        .post("/api/tasks")
        .send({ name: "Undone Task 2", done: false });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBe(2);

      // Verify only undone tasks remain
      const remainingTasks = await request(app).get("/api/tasks");
      expect(remainingTasks.body.count).toBe(2);
      expect(remainingTasks.body.data.every((task) => !task.done)).toBe(true);
    });

    test("should return deletedCount = 0 when no done tasks exist", async () => {
      // Create only undone tasks
      await request(app)
        .post("/api/tasks")
        .send({ name: "Undone Task 1", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Undone Task 2", done: false });

      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBe(0);

      // All tasks should still exist
      const remainingTasks = await request(app).get("/api/tasks");
      expect(remainingTasks.body.count).toBe(2);
    });

    test("should handle empty database gracefully", async () => {
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBe(0);
      expect(response.body.movedCount).toBe(0);
    });
  });

  describe("Move tasks with ECD = today to lowest priority", () => {
    test("should move undone task with ECD = today to lowest priority", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Create tasks
      const task1 = await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 1", done: false });
      const task2 = await request(app)
        .post("/api/tasks")
        .send({ name: "Today ECD Task", done: false, ecd: todayStr });
      const task3 = await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 2", done: false });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(1);

      // Verify task order - task with ECD = today should be last
      const remainingTasks = await request(app).get("/api/tasks");
      const tasks = remainingTasks.body.data;

      expect(tasks.length).toBe(3);
      expect(tasks[0].name).toBe("Normal Task 1");
      expect(tasks[1].name).toBe("Normal Task 2");
      expect(tasks[2].name).toBe("Today ECD Task");
      expect(tasks[2].priority).toBe(2);
    });

    test("should move multiple undone tasks with ECD = today to lowest priority", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Create tasks
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 1", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Today ECD Task 1", done: false, ecd: todayStr });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 2", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Today ECD Task 2", done: false, ecd: todayStr });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(2);

      // Verify task order - tasks with ECD = today should be at the end
      const remainingTasks = await request(app).get("/api/tasks");
      const tasks = remainingTasks.body.data;

      expect(tasks.length).toBe(4);
      expect(tasks[0].name).toBe("Normal Task 1");
      expect(tasks[1].name).toBe("Normal Task 2");
      expect(tasks[2].name).toBe("Today ECD Task 1");
      expect(tasks[3].name).toBe("Today ECD Task 2");
    });

    test("should NOT move done task with ECD = today", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Create tasks - one done with today's ECD
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Done Today ECD Task", done: true, ecd: todayStr });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBe(1); // Done task should be deleted
      expect(response.body.movedCount).toBe(0); // No tasks moved

      // Verify only normal task remains
      const remainingTasks = await request(app).get("/api/tasks");
      expect(remainingTasks.body.count).toBe(1);
      expect(remainingTasks.body.data[0].name).toBe("Normal Task");
    });

    test("should NOT move task with ECD = tomorrow", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Create tasks
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Tomorrow ECD Task", done: false, ecd: tomorrowStr });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(0); // Tomorrow's task should not be moved

      // Verify order unchanged
      const remainingTasks = await request(app).get("/api/tasks");
      const tasks = remainingTasks.body.data;
      expect(tasks.length).toBe(2);
      expect(tasks[0].name).toBe("Normal Task");
      expect(tasks[1].name).toBe("Tomorrow ECD Task");
    });

    test("should NOT move task with ECD = yesterday", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // Create tasks
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Yesterday ECD Task", done: false, ecd: yesterdayStr });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(0); // Yesterday's task should not be moved

      // Verify order unchanged
      const remainingTasks = await request(app).get("/api/tasks");
      expect(remainingTasks.body.count).toBe(2);
    });
  });

  describe("Combined functionality", () => {
    test("should delete done tasks AND move today-ECD tasks to lowest priority", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Create a mix of tasks
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 1", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Done Task 1", done: true });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Today ECD Task", done: false, ecd: todayStr });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task 2", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Done Task 2", done: true });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBe(2); // 2 done tasks deleted
      expect(response.body.movedCount).toBe(1); // 1 task with today's ECD moved

      // Verify final state
      const remainingTasks = await request(app).get("/api/tasks");
      const tasks = remainingTasks.body.data;

      expect(tasks.length).toBe(3);
      expect(tasks[0].name).toBe("Normal Task 1");
      expect(tasks[1].name).toBe("Normal Task 2");
      expect(tasks[2].name).toBe("Today ECD Task"); // Moved to last
      expect(tasks[2].priority).toBe(2);
    });

    test("should reorder priorities sequentially after deletion and moving", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Create tasks with gaps in priority
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 1", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 2", done: true });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 3", done: false, ecd: todayStr });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 4", done: true });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 5", done: false });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify priorities are sequential (0, 1, 2)
      const remainingTasks = await request(app).get("/api/tasks");
      const tasks = remainingTasks.body.data;

      expect(tasks.length).toBe(3);
      expect(tasks[0].priority).toBe(0);
      expect(tasks[1].priority).toBe(1);
      expect(tasks[2].priority).toBe(2);
    });
  });

  describe("Response format", () => {
    test("should return correct response structure", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      await request(app)
        .post("/api/tasks")
        .send({ name: "Normal Task", done: false });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Done Task", done: true });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Today Task", done: false, ecd: todayStr });

      const response = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("deletedCount");
      expect(response.body).toHaveProperty("movedCount");
      expect(response.body).toHaveProperty("message");
      expect(typeof response.body.deletedCount).toBe("number");
      expect(typeof response.body.movedCount).toBe("number");
      expect(typeof response.body.message).toBe("string");
    });
  });
});
