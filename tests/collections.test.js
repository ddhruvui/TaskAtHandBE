const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Collections Independence Tests", () => {
  beforeAll(async () => {
    await connectDB();

    // Clear all test collections before running tests
    const db = await getDatabase();
    await db.collection("Office-Test").deleteMany({});
    await db.collection("Habbit-Test").deleteMany({});
    await db.collection("Todo-Test").deleteMany({});
    console.log("Collections Test: All test collections cleared");
  });

  describe("Collection Isolation", () => {
    let taskId, habbitId, todoId;

    test("should create a task in Office collection", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .send({ name: "Task Item" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Task Item");
      taskId = response.body.data._id;
    });

    test("should create a habbit in Habbit collection", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit Item", ecd: 1 })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Habbit Item");
      habbitId = response.body.data._id;
    });

    test("should create a todo in Todo collection", async () => {
      const response = await request(app)
        .post("/api/todos")
        .send({ name: "Todo Item" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Todo Item");
      todoId = response.body.data._id;
    });

    test("should have only 1 task in Office collection", async () => {
      const response = await request(app).get("/api/tasks").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].name).toBe("Task Item");
    });

    test("should have only 1 habbit in Habbit collection", async () => {
      const response = await request(app).get("/api/habbits").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].name).toBe("Habbit Item");
    });

    test("should have only 1 todo in Todo collection", async () => {
      const response = await request(app).get("/api/todos").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].name).toBe("Todo Item");
    });

    test("should verify test collection names are being used", async () => {
      const db = await getDatabase();

      const taskCount = await db.collection("Office-Test").countDocuments();
      const habbitCount = await db.collection("Habbit-Test").countDocuments();
      const todoCount = await db.collection("Todo-Test").countDocuments();

      expect(taskCount).toBe(1);
      expect(habbitCount).toBe(1);
      expect(todoCount).toBe(1);
    });
  });

  describe("CRUD Operations for All Collections", () => {
    beforeEach(async () => {
      // Clear all collections before each test
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});
      await db.collection("Habbit-Test").deleteMany({});
      await db.collection("Todo-Test").deleteMany({});
    });

    describe("Tasks CRUD", () => {
      test("should perform full CRUD cycle on tasks", async () => {
        // Create
        const createRes = await request(app)
          .post("/api/tasks")
          .send({ name: "Test Task", notes: "Notes" })
          .expect(201);
        const taskId = createRes.body.data._id;

        // Read
        const readRes = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);
        expect(readRes.body.data.name).toBe("Test Task");

        // Update
        const updateRes = await request(app)
          .put(`/api/tasks/${taskId}`)
          .send({ name: "Updated Task" })
          .expect(200);
        expect(updateRes.body.data.name).toBe("Updated Task");

        // Delete
        await request(app).delete(`/api/tasks/${taskId}`).expect(200);

        // Verify deletion
        const allRes = await request(app).get("/api/tasks").expect(200);
        expect(allRes.body.count).toBe(0);
      });
    });

    describe("Habbits CRUD", () => {
      test("should perform full CRUD cycle on habbits", async () => {
        // Create
        const createRes = await request(app)
          .post("/api/habbits")
          .send({ name: "Test Habbit", notes: "Notes", ecd: 5 })
          .expect(201);
        const habbitId = createRes.body.data._id;

        // Read
        const readRes = await request(app)
          .get(`/api/habbits/${habbitId}`)
          .expect(200);
        expect(readRes.body.data.name).toBe("Test Habbit");

        // Update
        const updateRes = await request(app)
          .put(`/api/habbits/${habbitId}`)
          .send({ name: "Updated Habbit" })
          .expect(200);
        expect(updateRes.body.data.name).toBe("Updated Habbit");

        // Delete
        await request(app).delete(`/api/habbits/${habbitId}`).expect(200);

        // Verify deletion
        const allRes = await request(app).get("/api/habbits").expect(200);
        expect(allRes.body.count).toBe(0);
      });
    });

    describe("Todos CRUD", () => {
      test("should perform full CRUD cycle on todos", async () => {
        // Create
        const createRes = await request(app)
          .post("/api/todos")
          .send({ name: "Test Todo", notes: "Notes" })
          .expect(201);
        const todoId = createRes.body.data._id;

        // Read
        const readRes = await request(app)
          .get(`/api/todos/${todoId}`)
          .expect(200);
        expect(readRes.body.data.name).toBe("Test Todo");

        // Update
        const updateRes = await request(app)
          .put(`/api/todos/${todoId}`)
          .send({ name: "Updated Todo" })
          .expect(200);
        expect(updateRes.body.data.name).toBe("Updated Todo");

        // Delete
        await request(app).delete(`/api/todos/${todoId}`).expect(200);

        // Verify deletion
        const allRes = await request(app).get("/api/todos").expect(200);
        expect(allRes.body.count).toBe(0);
      });
    });
  });

  describe("Priority Management Independence", () => {
    beforeEach(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});
      await db.collection("Habbit-Test").deleteMany({});
      await db.collection("Todo-Test").deleteMany({});
    });

    test("should manage priorities independently in each collection", async () => {
      // Create multiple items in each collection
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 1" })
        .expect(201);
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task 2" })
        .expect(201);

      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 1", ecd: 1 })
        .expect(201);
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 2", ecd: 2 })
        .expect(201);

      await request(app)
        .post("/api/todos")
        .send({ name: "Todo 1" })
        .expect(201);
      await request(app)
        .post("/api/todos")
        .send({ name: "Todo 2" })
        .expect(201);

      // Verify each collection has 2 items
      const tasksRes = await request(app).get("/api/tasks").expect(200);
      const habbitsRes = await request(app).get("/api/habbits").expect(200);
      const todosRes = await request(app).get("/api/todos").expect(200);

      expect(tasksRes.body.count).toBe(2);
      expect(habbitsRes.body.count).toBe(2);
      expect(todosRes.body.count).toBe(2);

      // Verify priorities are independent (both start at 0)
      expect(tasksRes.body.data[0].priority).toBe(0);
      expect(habbitsRes.body.data[0].priority).toBe(0);
      expect(todosRes.body.data[0].priority).toBe(0);
    });
  });

  describe("Chron Endpoint for All Collections", () => {
    beforeEach(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});
      await db.collection("Habbit-Test").deleteMany({});
      await db.collection("Todo-Test").deleteMany({});
    });

    test("should delete done tasks/todos and mark done habbits as undone independently in each collection", async () => {
      // Create done and undone items in each collection
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task Done", done: true });
      await request(app)
        .post("/api/tasks")
        .send({ name: "Task Undone", done: false });

      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit Done", done: true, ecd: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit Undone", done: false, ecd: 2 });

      await request(app)
        .post("/api/todos")
        .send({ name: "Todo Done", done: true });
      await request(app)
        .post("/api/todos")
        .send({ name: "Todo Undone", done: false });

      // Run chron endpoints
      const taskChron = await request(app)
        .delete("/api/tasks/chron")
        .expect(200);
      const habbitChron = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);
      const todoChron = await request(app)
        .delete("/api/todos/chron")
        .expect(200);

      // Tasks and Todos delete done items
      expect(taskChron.body.deletedCount).toBe(1);
      expect(todoChron.body.deletedCount).toBe(1);
      // Habbits mark done items as undone
      expect(habbitChron.body.markedUndoneCount).toBe(1);

      // Verify results
      const tasksRes = await request(app).get("/api/tasks").expect(200);
      const habbitsRes = await request(app).get("/api/habbits").expect(200);
      const todosRes = await request(app).get("/api/todos").expect(200);

      // Tasks and Todos: only undone items remain
      expect(tasksRes.body.count).toBe(1);
      expect(tasksRes.body.data[0].name).toBe("Task Undone");

      expect(todosRes.body.count).toBe(1);
      expect(todosRes.body.data[0].name).toBe("Todo Undone");

      // Habbits: both items remain, but now both are undone
      expect(habbitsRes.body.count).toBe(2);
      expect(habbitsRes.body.data.every((h) => h.done === false)).toBe(true);
      const habbitNames = habbitsRes.body.data.map((h) => h.name);
      expect(habbitNames).toContain("Habbit Done");
      expect(habbitNames).toContain("Habbit Undone");
    });
  });
});
