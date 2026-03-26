const request = require("supertest");
const app = require("../src/server");
const { connectDB } = require("../src/config/db");

describe("Done/Undone Priority Adjustment", () => {
  // Ensure DB is connected before running tests
  beforeAll(async () => {
    await connectDB();
  });

  test("should adjust priorities when a task is marked as done", async () => {
    // Step 1: Create 3 test tasks
    console.log("\n🔨 Creating 3 test tasks...");
    const task1 = await request(app)
      .post("/api/office")
      .send({ name: "Task 1", notes: "First task" })
      .expect(201);

    const task2 = await request(app)
      .post("/api/office")
      .send({ name: "Task 2", notes: "Second task" })
      .expect(201);

    const task3 = await request(app)
      .post("/api/office")
      .send({ name: "Task 3", notes: "Third task" })
      .expect(201);

    const taskId1 = task1.body.data._id;
    const taskId2 = task2.body.data._id;
    const taskId3 = task3.body.data._id;

    // Get initial priorities
    const allTasks = await request(app).get("/api/office").expect(200);
    const totalTasks = allTasks.body.count;

    console.log(`✓ Created 3 tasks (Total in DB: ${totalTasks})`);

    // Find the initial priorities of our test tasks
    const initialTask1 = allTasks.body.data.find((t) => t._id === taskId1);
    const initialTask2 = allTasks.body.data.find((t) => t._id === taskId2);
    const initialTask3 = allTasks.body.data.find((t) => t._id === taskId3);

    console.log(
      `Initial priorities - Task 1: ${initialTask1.priority}, Task 2: ${initialTask2.priority}, Task 3: ${initialTask3.priority}`,
    );

    // Step 2: Mark Task 2 as done (middle task)
    console.log("\n🎯 Marking Task 2 as done...");
    const updatedTask2 = await request(app)
      .put(`/api/office/${taskId2}`)
      .send({ done: true })
      .expect(200);

    expect(updatedTask2.body.success).toBe(true);
    expect(updatedTask2.body.data.done).toBe(true);
    expect(updatedTask2.body.data.priority).toBe(totalTasks - 1); // Should be moved to last position

    console.log(
      `✓ Task 2 marked as done - New priority: ${updatedTask2.body.data.priority}`,
    );

    // Step 3: Verify priority adjustments
    const updatedTasks = await request(app).get("/api/office").expect(200);

    const finalTask1 = updatedTasks.body.data.find((t) => t._id === taskId1);
    const finalTask2 = updatedTasks.body.data.find((t) => t._id === taskId2);
    const finalTask3 = updatedTasks.body.data.find((t) => t._id === taskId3);

    console.log(
      `\n📊 Final priorities - Task 1: ${finalTask1.priority}, Task 2: ${finalTask2.priority}, Task 3: ${finalTask3.priority}`,
    );

    // Task 2 should now have priority = totalTasks - 1
    expect(finalTask2.priority).toBe(totalTasks - 1);

    // Task 1's priority should remain unchanged (it was before Task 2)
    expect(finalTask1.priority).toBe(initialTask1.priority);

    // Task 3's priority should be reduced by 1 (it was after Task 2)
    expect(finalTask3.priority).toBe(initialTask3.priority - 1);

    console.log("\n✅ Priority adjustment test completed successfully!");
  });

  test("should adjust priorities when a task is marked as undone", async () => {
    // Step 1: Create 3 test tasks (all initially not done)
    console.log("\n🔨 Creating 3 test tasks...");
    const task1 = await request(app)
      .post("/api/office")
      .send({ name: "Task A", notes: "First task" })
      .expect(201);

    const task2 = await request(app)
      .post("/api/office")
      .send({ name: "Task B", notes: "Second task" })
      .expect(201);

    const task3 = await request(app)
      .post("/api/office")
      .send({ name: "Task C", notes: "Third task" })
      .expect(201);

    const taskIdA = task1.body.data._id;
    const taskIdB = task2.body.data._id;
    const taskIdC = task3.body.data._id;

    console.log("✓ Created 3 tasks");

    // Step 2: Mark Task B as done first
    console.log("\n🎯 Marking Task B as done...");
    await request(app)
      .put(`/api/office/${taskIdB}`)
      .send({ done: true })
      .expect(200);

    console.log("✓ Task B marked as done");

    // Get current state
    const tasksAfterDone = await request(app).get("/api/office").expect(200);
    const totalTasks = tasksAfterDone.body.count;

    const taskAAfterDone = tasksAfterDone.body.data.find(
      (t) => t._id === taskIdA,
    );
    const taskBAfterDone = tasksAfterDone.body.data.find(
      (t) => t._id === taskIdB,
    );
    const taskCAfterDone = tasksAfterDone.body.data.find(
      (t) => t._id === taskIdC,
    );

    console.log(
      `Priorities after marking done - Task A: ${taskAAfterDone.priority}, Task B: ${taskBAfterDone.priority}, Task C: ${taskCAfterDone.priority}`,
    );

    // Task B should now be at the end
    expect(taskBAfterDone.priority).toBe(totalTasks - 1);
    expect(taskBAfterDone.done).toBe(true);

    // Step 3: Mark Task B as undone
    console.log("\n🔄 Marking Task B as undone...");
    const updatedTaskB = await request(app)
      .put(`/api/office/${taskIdB}`)
      .send({ done: false })
      .expect(200);

    expect(updatedTaskB.body.success).toBe(true);
    expect(updatedTaskB.body.data.done).toBe(false);
    expect(updatedTaskB.body.data.priority).toBe(0); // Should be moved to first position

    console.log(
      `✓ Task B marked as undone - New priority: ${updatedTaskB.body.data.priority}`,
    );

    // Step 4: Verify priority adjustments
    const finalTasks = await request(app).get("/api/office").expect(200);

    const finalTaskA = finalTasks.body.data.find((t) => t._id === taskIdA);
    const finalTaskB = finalTasks.body.data.find((t) => t._id === taskIdB);
    const finalTaskC = finalTasks.body.data.find((t) => t._id === taskIdC);

    console.log(
      `\n📊 Final priorities - Task A: ${finalTaskA.priority}, Task B: ${finalTaskB.priority}, Task C: ${finalTaskC.priority}`,
    );

    // Task B should now have priority = 0
    expect(finalTaskB.priority).toBe(0);
    expect(finalTaskB.done).toBe(false);

    // Task A's priority should be increased by 1
    expect(finalTaskA.priority).toBe(taskAAfterDone.priority + 1);

    // Task C's priority should be increased by 1
    expect(finalTaskC.priority).toBe(taskCAfterDone.priority + 1);

    console.log("\n✅ Undone priority adjustment test completed successfully!");
  });

  test("should insert new tasks before done tasks", async () => {
    console.log("\n🔨 Creating 2 initial tasks...");
    const task1 = await request(app)
      .post("/api/office")
      .send({ name: "Task 1", notes: "First task" })
      .expect(201);

    const task2 = await request(app)
      .post("/api/office")
      .send({ name: "Task 2", notes: "Second task" })
      .expect(201);

    const taskId1 = task1.body.data._id;
    const taskId2 = task2.body.data._id;

    console.log("✓ Created 2 tasks");

    // Mark Task 2 as done
    console.log("\n🎯 Marking Task 2 as done...");
    await request(app)
      .put(`/api/office/${taskId2}`)
      .send({ done: true })
      .expect(200);

    console.log("✓ Task 2 marked as done");

    // Get current state
    const beforeNewTask = await request(app).get("/api/office").expect(200);
    const task1Before = beforeNewTask.body.data.find((t) => t._id === taskId1);
    const task2Before = beforeNewTask.body.data.find((t) => t._id === taskId2);

    console.log(
      `Priorities before new task - Task 1: ${task1Before.priority}, Task 2 (done): ${task2Before.priority}`,
    );

    // Create a new task
    console.log("\n➕ Creating new Task 3...");
    const task3 = await request(app)
      .post("/api/office")
      .send({ name: "Task 3", notes: "New task" })
      .expect(201);

    const taskId3 = task3.body.data._id;
    console.log(`✓ Task 3 created with priority: ${task3.body.data.priority}`);

    // Get final state
    const finalTasks = await request(app).get("/api/office").expect(200);
    const finalTask1 = finalTasks.body.data.find((t) => t._id === taskId1);
    const finalTask2 = finalTasks.body.data.find((t) => t._id === taskId2);
    const finalTask3 = finalTasks.body.data.find((t) => t._id === taskId3);

    console.log(
      `\n📊 Final priorities - Task 1: ${finalTask1.priority}, Task 3 (new): ${finalTask3.priority}, Task 2 (done): ${finalTask2.priority}`,
    );

    // New task should be inserted before done task
    expect(finalTask3.priority).toBeLessThan(finalTask2.priority);
    expect(finalTask3.done).toBe(false);
    expect(finalTask2.done).toBe(true);

    // Done task priority should have been incremented
    expect(finalTask2.priority).toBe(task2Before.priority + 1);

    console.log("\n✅ New task correctly inserted before done tasks!");
  });

  describe("Done/Not-Done Priority Boundary Enforcement", () => {
    let notDoneId;
    let doneId;

    beforeEach(async () => {
      // Fresh isolated set: 2 not-done tasks, then 1 done task
      const t1 = await request(app)
        .post("/api/office")
        .send({ name: "Boundary NotDone 1" })
        .expect(201);
      const t2 = await request(app)
        .post("/api/office")
        .send({ name: "Boundary NotDone 2" })
        .expect(201);
      const t3 = await request(app)
        .post("/api/office")
        .send({ name: "Boundary Done 1" })
        .expect(201);

      notDoneId = t1.body.data._id;
      doneId = t3.body.data._id;

      // Mark t3 as done so it sits below the not-done tasks
      await request(app)
        .put(`/api/office/${doneId}`)
        .send({ done: true })
        .expect(200);
    });

    test("should reject moving a not-done task into done territory", async () => {
      // Get current state to find the boundary position
      const allTasks = await request(app).get("/api/office").expect(200);
      const total = allTasks.body.count;

      // Try to move the not-done task to the last position (done territory)
      const response = await request(app)
        .put(`/api/office/${notDoneId}`)
        .send({ priority: total - 1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        "Not done task cannot have priority",
      );
    });

    test("should reject moving a done task into not-done territory", async () => {
      // Try to move the done task to position 0 (not-done territory)
      const response = await request(app)
        .put(`/api/office/${doneId}`)
        .send({ priority: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        "Done task cannot have priority less than",
      );
    });

    test("should allow moving a not-done task within not-done range", async () => {
      // t1 is at priority 0 (or similar), move it to 1 (still within not-done zone)
      const allTasks = await request(app).get("/api/office").expect(200);
      const notDoneTask = allTasks.body.data.find((t) => t._id === notDoneId);
      const undoneCount = allTasks.body.data.filter((t) => !t.done).length;

      // Pick any valid not-done priority that's different from current
      const targetPriority = notDoneTask.priority === 0 ? 1 : 0;

      if (undoneCount > 1) {
        const response = await request(app)
          .put(`/api/office/${notDoneId}`)
          .send({ priority: targetPriority })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.done).toBe(false);
        expect(response.body.data.priority).toBe(targetPriority);
      }
    });

    test("should preserve done/not-done ordering after a boundary-rejected move", async () => {
      const allTasksBefore = await request(app).get("/api/office").expect(200);
      const total = allTasksBefore.body.count;

      // Attempt illegal move (should be rejected)
      await request(app)
        .put(`/api/office/${notDoneId}`)
        .send({ priority: total - 1 })
        .expect(400);

      // Verify state hasn't changed
      const allTasksAfter = await request(app).get("/api/office").expect(200);
      const notDoneTaskAfter = allTasksAfter.body.data.find(
        (t) => t._id === notDoneId,
      );
      const notDoneTaskBefore = allTasksBefore.body.data.find(
        (t) => t._id === notDoneId,
      );

      expect(notDoneTaskAfter.priority).toBe(notDoneTaskBefore.priority);
      expect(notDoneTaskAfter.done).toBe(false);

      // Verify all not-done tasks still come before all done tasks
      const notDonePriorities = allTasksAfter.body.data
        .filter((t) => !t.done)
        .map((t) => t.priority);
      const donePriorities = allTasksAfter.body.data
        .filter((t) => t.done)
        .map((t) => t.priority);

      const maxNotDone = Math.max(...notDonePriorities);
      const minDone = Math.min(...donePriorities);
      expect(maxNotDone).toBeLessThan(minDone);
    });
  });
});
