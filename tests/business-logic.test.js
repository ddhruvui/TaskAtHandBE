const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Business Logic Tests", () => {
  // Connect to database before tests
  beforeAll(async () => {
    await connectDB();

    // Clear test database before business logic tests
    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Business Logic Tests: ${collectionName} collection cleared`);
  });

  describe("Task Counts and Statistics", () => {
    beforeAll(async () => {
      // Create test data: mix of done and undone tasks
      await request(app).post("/api/office").send({
        name: "Completed Task 1",
        notes: "This is done",
        done: true,
        ecd: "2026-03-15",
      });

      await request(app).post("/api/office").send({
        name: "Pending Task 1",
        notes: "Not done yet",
        done: false,
        ecd: "2026-03-25",
      });

      await request(app).post("/api/office").send({
        name: "Completed Task 2",
        notes: "Also done",
        done: true,
        ecd: "2026-03-10",
      });

      await request(app).post("/api/office").send({
        name: "Pending Task 2",
        notes: "Still pending",
        done: false,
        ecd: "2026-04-01",
      });

      await request(app).post("/api/office").send({
        name: "No ECD Task",
        notes: "Task without deadline",
        done: false,
      });
    });

    test("should get total task count", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(5);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test("should count done vs undone tasks", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const doneTasks = response.body.data.filter((task) => task.done === true);
      const undoneTasks = response.body.data.filter(
        (task) => task.done === false,
      );

      expect(doneTasks.length).toBeGreaterThan(0);
      expect(undoneTasks.length).toBeGreaterThan(0);
      expect(doneTasks.length + undoneTasks.length).toBe(response.body.count);
    });

    test("should count tasks with and without ECD", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const tasksWithECD = response.body.data.filter(
        (task) => task.ecd !== null,
      );
      const tasksWithoutECD = response.body.data.filter(
        (task) => task.ecd === null,
      );

      expect(tasksWithECD.length).toBeGreaterThan(0);
      expect(tasksWithoutECD.length).toBeGreaterThan(0);
    });
  });

  describe("Overdue Tasks", () => {
    beforeAll(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Create overdue tasks (past dates)
      await request(app).post("/api/office").send({
        name: "Overdue Task 1",
        ecd: "2026-01-15",
        done: false,
      });

      await request(app)
        .post("/api/office")
        .send({
          name: "Overdue Task 2",
          ecd: yesterday.toISOString().split("T")[0],
          done: false,
        });

      // Create upcoming tasks (future dates)
      await request(app)
        .post("/api/office")
        .send({
          name: "Due Tomorrow",
          ecd: tomorrow.toISOString().split("T")[0],
          done: false,
        });

      await request(app)
        .post("/api/office")
        .send({
          name: "Due Next Week",
          ecd: nextWeek.toISOString().split("T")[0],
          done: false,
        });

      // Create completed overdue task (should not count as overdue)
      await request(app).post("/api/office").send({
        name: "Completed Overdue",
        ecd: "2026-02-01",
        done: true,
      });

      // Create task without ECD
      await request(app).post("/api/office").send({
        name: "No Deadline",
        done: false,
      });
    });

    test("should identify overdue tasks (ECD in past and not done)", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueTasks = response.body.data.filter((task) => {
        if (!task.ecd || task.done) return false;
        const taskDate = new Date(task.ecd);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate < today;
      });

      expect(overdueTasks.length).toBeGreaterThanOrEqual(2);
      overdueTasks.forEach((task) => {
        expect(task.done).toBe(false);
        expect(task.ecd).toBeTruthy();
      });
    });

    test("should identify upcoming tasks (ECD in future)", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcomingTasks = response.body.data.filter((task) => {
        if (!task.ecd) return false;
        const taskDate = new Date(task.ecd);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate >= today;
      });

      expect(upcomingTasks.length).toBeGreaterThanOrEqual(2);
    });

    test("should not count completed tasks as overdue", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueTasks = response.body.data.filter((task) => {
        if (!task.ecd || task.done) return false;
        const taskDate = new Date(task.ecd);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate < today;
      });

      // Completed tasks should not be in overdue list
      overdueTasks.forEach((task) => {
        expect(task.done).toBe(false);
      });
    });
  });

  describe("Task Sorting and Ordering", () => {
    beforeAll(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create tasks with different priorities
      await request(app).post("/api/office").send({
        name: "Task A",
        notes: "First task",
        ecd: "2026-04-15",
      });

      await request(app).post("/api/office").send({
        name: "Task B",
        notes: "Second task",
        ecd: "2026-03-20",
      });

      await request(app).post("/api/office").send({
        name: "Task C",
        notes: "Third task",
        ecd: "2026-05-01",
      });

      await request(app).post("/api/office").send({
        name: "Task D",
        notes: "Fourth task",
        ecd: "2026-03-18",
      });
    });

    test("should return tasks sorted by priority", async () => {
      const response = await request(app).get("/api/office").expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);

      // Check if tasks are sorted by priority (ascending)
      for (let i = 0; i < response.body.data.length - 1; i++) {
        expect(response.body.data[i].priority).toBeLessThanOrEqual(
          response.body.data[i + 1].priority,
        );
      }
    });

    test("should verify priority values are sequential", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const priorities = response.body.data
        .map((task) => task.priority)
        .sort((a, b) => a - b);

      // Priorities should start at 0 and be sequential
      for (let i = 0; i < priorities.length; i++) {
        expect(priorities[i]).toBe(i);
      }
    });

    test("should sort tasks by ECD manually", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const tasksWithECD = response.body.data.filter(
        (task) => task.ecd !== null,
      );

      // Sort by ECD
      const sortedByECD = [...tasksWithECD].sort(
        (a, b) => new Date(a.ecd) - new Date(b.ecd),
      );

      // Verify sorting worked
      for (let i = 0; i < sortedByECD.length - 1; i++) {
        expect(new Date(sortedByECD[i].ecd).getTime()).toBeLessThanOrEqual(
          new Date(sortedByECD[i + 1].ecd).getTime(),
        );
      }
    });

    test("should sort tasks by name alphabetically", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const sortedByName = [...response.body.data].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      // Verify alphabetical sorting
      for (let i = 0; i < sortedByName.length - 1; i++) {
        expect(
          sortedByName[i].name.localeCompare(sortedByName[i + 1].name),
        ).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("Task Filtering", () => {
    beforeAll(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create diverse set of tasks
      await request(app).post("/api/office").send({
        name: "Done High Priority",
        done: true,
        ecd: "2026-03-20",
      });

      await request(app).post("/api/office").send({
        name: "Undone High Priority",
        done: false,
        ecd: "2026-03-25",
      });

      await request(app).post("/api/office").send({
        name: "Done No ECD",
        done: true,
      });

      await request(app).post("/api/office").send({
        name: "Undone No ECD",
        done: false,
      });
    });

    test("should filter done tasks", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const doneTasks = response.body.data.filter((task) => task.done === true);

      expect(doneTasks.length).toBeGreaterThan(0);
      doneTasks.forEach((task) => {
        expect(task.done).toBe(true);
      });
    });

    test("should filter undone tasks", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const undoneTasks = response.body.data.filter(
        (task) => task.done === false,
      );

      expect(undoneTasks.length).toBeGreaterThan(0);
      undoneTasks.forEach((task) => {
        expect(task.done).toBe(false);
      });
    });

    test("should filter tasks with ECD", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const tasksWithECD = response.body.data.filter(
        (task) => task.ecd !== null,
      );

      expect(tasksWithECD.length).toBeGreaterThan(0);
      tasksWithECD.forEach((task) => {
        expect(task.ecd).toBeTruthy();
      });
    });

    test("should filter tasks without ECD", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const tasksWithoutECD = response.body.data.filter(
        (task) => task.ecd === null,
      );

      expect(tasksWithoutECD.length).toBeGreaterThan(0);
      tasksWithoutECD.forEach((task) => {
        expect(task.ecd).toBe(null);
      });
    });

    test("should filter complex condition: undone tasks with ECD", async () => {
      const response = await request(app).get("/api/office").expect(200);

      const undoneWithECD = response.body.data.filter(
        (task) => task.done === false && task.ecd !== null,
      );

      undoneWithECD.forEach((task) => {
        expect(task.done).toBe(false);
        expect(task.ecd).toBeTruthy();
      });
    });
  });

  describe("Priority Management Logic", () => {
    beforeAll(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});
    });

    test("should assign sequential priorities to new tasks", async () => {
      const tasks = [];

      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post("/api/office")
          .send({ name: `Sequential Task ${i}` })
          .expect(201);

        tasks.push(response.body.data);
      }

      // Verify priorities are sequential
      tasks.forEach((task, index) => {
        expect(task.priority).toBe(index);
      });
    });

    test("should maintain priority order after task completion", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create 3 tasks
      const task1 = await request(app)
        .post("/api/office")
        .send({ name: "Task 1" });
      const task2 = await request(app)
        .post("/api/office")
        .send({ name: "Task 2" });
      const task3 = await request(app)
        .post("/api/office")
        .send({ name: "Task 3" });

      // Mark middle task as done
      await request(app)
        .put(`/api/office/${task2.body.data._id}`)
        .send({ done: true });

      // Get all tasks
      const response = await request(app).get("/api/office").expect(200);

      // Verify priorities still make sense
      const priorities = response.body.data
        .map((t) => t.priority)
        .sort((a, b) => a - b);
      expect(priorities[0]).toBe(0);
    });

    test("should handle priority updates correctly", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      // Create 4 tasks
      const tasks = [];
      for (let i = 0; i < 4; i++) {
        const response = await request(app)
          .post("/api/office")
          .send({ name: `Priority Task ${i}` });
        tasks.push(response.body.data);
      }

      // Move last task to first position
      await request(app)
        .put(`/api/office/${tasks[3]._id}`)
        .send({ priority: 0 });

      // Get all tasks and verify reordering
      const response = await request(app).get("/api/office").expect(200);

      const priorities = response.body.data
        .map((t) => t.priority)
        .sort((a, b) => a - b);
      expect(priorities).toEqual([0, 1, 2, 3]);
    });
  });

  describe("Empty Database Scenarios", () => {
    test("should handle GET /api/office when database is empty", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const response = await request(app).get("/api/office").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(0);
      expect(response.body.data).toEqual([]);
    });

    test("should handle first task creation in empty database", async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const response = await request(app)
        .post("/api/office")
        .send({ name: "First Ever Task" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe(0);
    });
  });

  describe("Task State Transitions", () => {
    let taskId;

    beforeAll(async () => {
      const db = await getDatabase();
      await db.collection("Office-Test").deleteMany({});

      const response = await request(app)
        .post("/api/office")
        .send({ name: "State Transition Task", done: false });
      taskId = response.body.data._id;
    });

    test("should transition task from undone to done", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ done: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.done).toBe(true);
    });

    test("should transition task from done back to undone", async () => {
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ done: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.done).toBe(false);
    });

    test("should allow multiple state transitions", async () => {
      // Done -> Undone -> Done
      await request(app).put(`/api/office/${taskId}`).send({ done: true });
      await request(app).put(`/api/office/${taskId}`).send({ done: false });
      const response = await request(app)
        .put(`/api/office/${taskId}`)
        .send({ done: true })
        .expect(200);

      expect(response.body.data.done).toBe(true);
    });
  });
});
