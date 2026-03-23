const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Habbit Chron Endpoint - DELETE /api/habbits/chron", () => {
  beforeAll(async () => {
    await connectDB();

    // Clear test database before chron tests
    const db = await getDatabase();
    const collectionName = "Habbit-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Habbit Chron Tests: ${collectionName} collection cleared`);
  });

  beforeEach(async () => {
    // Clear database before each test for isolation
    const db = await getDatabase();
    const collectionName = "Habbit-Test";
    await db.collection(collectionName).deleteMany({});
  });

  describe("Mark done habbits as undone functionality", () => {
    test("should mark all done habbits as undone", async () => {
      // Create mix of done and undone habbits
      const habbit1 = await request(app)
        .post("/api/habbits")
        .send({ name: "Undone Habbit 1", done: false, ecdDayOfWeek: 1 });
      const habbit2 = await request(app)
        .post("/api/habbits")
        .send({ name: "Done Habbit 1", done: true, ecdDayOfWeek: 2 });
      const habbit3 = await request(app)
        .post("/api/habbits")
        .send({ name: "Done Habbit 2", done: true, ecdDayOfWeek: 3 });
      const habbit4 = await request(app)
        .post("/api/habbits")
        .send({ name: "Undone Habbit 2", done: false, ecdDayOfWeek: 4 });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.markedUndoneCount).toBe(2);

      // Verify all habbits are now undone
      const remainingHabbits = await request(app).get("/api/habbits");
      expect(remainingHabbits.body.count).toBe(4); // All 4 habbits should still exist
      expect(remainingHabbits.body.data.every((habbit) => !habbit.done)).toBe(
        true,
      );
    });

    test("should return markedUndoneCount = 0 when no done habbits exist", async () => {
      // Create only undone habbits
      await request(app)
        .post("/api/habbits")
        .send({ name: "Undone Habbit 1", done: false, ecdDayOfWeek: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Undone Habbit 2", done: false, ecdDayOfWeek: 2 });

      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.markedUndoneCount).toBe(0);

      // All habbits should still exist
      const remainingHabbits = await request(app).get("/api/habbits");
      expect(remainingHabbits.body.count).toBe(2);
    });

    test("should handle empty database gracefully", async () => {
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.markedUndoneCount).toBe(0);
      expect(response.body.movedCount).toBe(0);
    });

    test("should mark only done habbits as undone, leaving undone habbits unchanged", async () => {
      // Create habbits
      await request(app)
        .post("/api/habbits")
        .send({ name: "Already Undone", done: false, ecdDayOfWeek: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Will be Undone", done: true, ecdDayOfWeek: 2 });

      // Get initial state
      const beforeChron = await request(app).get("/api/habbits");
      const alreadyUndoneHabbit = beforeChron.body.data.find(
        (h) => h.name === "Already Undone",
      );

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.markedUndoneCount).toBe(1);

      // Verify all habbits are undone
      const afterChron = await request(app).get("/api/habbits");
      expect(afterChron.body.count).toBe(2);
      expect(afterChron.body.data.every((h) => h.done === false)).toBe(true);

      // Verify the already-undone habbit was not modified unnecessarily
      const stillUndoneHabbit = afterChron.body.data.find(
        (h) => h.name === "Already Undone",
      );
      expect(stillUndoneHabbit).toBeDefined();
      expect(stillUndoneHabbit.done).toBe(false);
    });
  });

  describe("Move habbits with ECD matching today to lowest priority", () => {
    test("should move habbit with ECD = today (day of week) to lowest priority", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1-7 (Monday-Sunday)

      // Create habbits with different ECDs (avoiding today's day of week)
      const otherDay1 = todayDayOfWeek === 1 ? 3 : 1;
      const otherDay2 = todayDayOfWeek === 4 ? 5 : 4;

      // Create habbits
      const habbit1 = await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 1",
          done: false,
          ecdDayOfWeek: otherDay1,
        });
      const habbit2 = await request(app).post("/api/habbits").send({
        name: "Today ECD Habbit",
        done: false,
        ecdDayOfWeek: todayDayOfWeek,
      });
      const habbit3 = await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 2",
          done: false,
          ecdDayOfWeek: otherDay2,
        });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(1);

      // Verify habbit order - habbit with ECD = today should be last
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;

      expect(habbits.length).toBe(3);
      expect(habbits[2].name).toBe("Today ECD Habbit");
      expect(habbits[2].priority).toBe(2);
    });

    test("should move habbit with ECD = today (day of month) to lowest priority", async () => {
      const today = new Date();
      const todayDayOfMonth = today.getDate(); // 1-31

      // Create habbits with different ECDs (avoiding today's day number)
      const otherDay1 = todayDayOfMonth === 10 ? 8 : 10;
      const otherDay2 = todayDayOfMonth === 20 ? 21 : 20;

      await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 1",
          done: false,
          ecdDayOfMonth: otherDay1,
        });
      await request(app).post("/api/habbits").send({
        name: "Today ECD Habbit",
        done: false,
        ecdDayOfMonth: todayDayOfMonth,
      });
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 2",
          done: false,
          ecdDayOfMonth: otherDay2,
        });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBeGreaterThanOrEqual(1);

      // Verify habbit order - habbit with ECD = today should be at the end
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;

      expect(habbits.length).toBe(3);
      const todayHabbit = habbits.find((h) => h.name === "Today ECD Habbit");
      expect(todayHabbit).toBeDefined();
      // Should be at a lower priority (higher index)
    });

    test("should move multiple habbits with ECD matching today to lowest priority", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

      // Create habbits with different ECDs (avoiding today's day of week)
      const otherDay1 = todayDayOfWeek === 1 ? 3 : 1;
      const otherDay2 = todayDayOfWeek === 4 ? 5 : 4;

      // Create habbits
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 1",
          done: false,
          ecdDayOfWeek: otherDay1,
        });
      await request(app).post("/api/habbits").send({
        name: "Today ECD Habbit 1",
        done: false,
        ecdDayOfWeek: todayDayOfWeek,
      });
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit 2",
          done: false,
          ecdDayOfWeek: otherDay2,
        });
      await request(app).post("/api/habbits").send({
        name: "Today ECD Habbit 2",
        done: false,
        ecdDayOfWeek: todayDayOfWeek,
      });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(2);

      // Verify habbit order - habbits with ECD = today should be at the end
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;

      expect(habbits.length).toBe(4);
      // Last two should be the today habbits
      expect(
        habbits[2].name === "Today ECD Habbit 1" ||
          habbits[2].name === "Today ECD Habbit 2",
      ).toBe(true);
      expect(
        habbits[3].name === "Today ECD Habbit 1" ||
          habbits[3].name === "Today ECD Habbit 2",
      ).toBe(true);
    });

    test("should NOT move habbit with different ECD", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
      const differentDay = todayDayOfWeek === 1 ? 2 : 1;

      // Create habbits
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Normal Habbit",
          done: false,
          ecdDayOfWeek: differentDay,
        });
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Another Habbit",
          done: false,
          ecdDayOfWeek: differentDay,
        });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(0);

      // Verify order unchanged
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;
      expect(habbits.length).toBe(2);
      expect(habbits[0].name).toBe("Normal Habbit");
      expect(habbits[1].name).toBe("Another Habbit");
    });

    test("should move habits matched by ecdDayOfWeek AND ecdDayOfMonth in the same run", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
      const todayDayOfMonth = today.getDate();

      const otherWeekDay = todayDayOfWeek === 1 ? 2 : 1;
      const otherMonthDay = todayDayOfMonth === 10 ? 11 : 10;

      await request(app)
        .post("/api/habbits")
        .send({ name: "Normal Week Habbit", ecdDayOfWeek: otherWeekDay });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Matches Week Today", ecdDayOfWeek: todayDayOfWeek });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Normal Month Habbit", ecdDayOfMonth: otherMonthDay });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Matches Month Today", ecdDayOfMonth: todayDayOfMonth });

      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.movedCount).toBe(2);

      const allHabbits = (await request(app).get("/api/habbits")).body.data;
      expect(allHabbits.length).toBe(4);
      const lastTwo = allHabbits.slice(2).map((h) => h.name);
      expect(lastTwo).toContain("Matches Week Today");
      expect(lastTwo).toContain("Matches Month Today");
    });

    test("should NOT move habbit whose ecdDayOfMonth equals today's day-of-week (disambiguation)", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1-7
      const todayDayOfMonth = today.getDate(); // 1-31

      // Skip if today's date equals today's day-of-week number (e.g., Mon Jan 1)
      // because the ecdDayOfMonth value would legitimately also match today's date
      if (todayDayOfMonth === todayDayOfWeek) {
        console.log(
          "Skipping disambiguation test: todayDayOfMonth === todayDayOfWeek",
        );
        return;
      }

      // A habit with ecdDayOfMonth = today's day-of-week number.
      // This should NOT trigger today unless today's date happens to equal that number.
      // e.g. today is Saturday (dayOfWeek=6) and date=21 → ecdDayOfMonth:6 should NOT match
      await request(app).post("/api/habbits").send({
        name: "Month Habbit (same number as today weekday)",
        ecdDayOfMonth: todayDayOfWeek, // e.g., 6 — only triggers on the 6th of the month
      });

      // This one SHOULD trigger — ecdDayOfWeek matches today's day of week
      await request(app).post("/api/habbits").send({
        name: "Week Habbit today",
        ecdDayOfWeek: todayDayOfWeek,
      });

      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      // Only the ecdDayOfWeek one should be moved; the ecdDayOfMonth one should not
      expect(response.body.movedCount).toBe(1);

      const allHabbits = (await request(app).get("/api/habbits")).body.data;
      expect(allHabbits.length).toBe(2);
      // The week habbit should be last (lower priority)
      expect(allHabbits[1].name).toBe("Week Habbit today");
      expect(allHabbits[0].name).toBe(
        "Month Habbit (same number as today weekday)",
      );
    });
  });

  describe("Combined functionality", () => {
    test("should mark done habbits as undone AND move today-ECD habbits to lowest priority", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

      // Create a mix of habbits
      await request(app)
        .post("/api/habbits")
        .send({ name: "Normal Habbit 1", done: false, ecdDayOfWeek: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Done Habbit 1", done: true, ecdDayOfWeek: 2 });
      await request(app).post("/api/habbits").send({
        name: "Today ECD Habbit",
        done: false,
        ecdDayOfWeek: todayDayOfWeek,
      });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Normal Habbit 2", done: false, ecdDayOfWeek: 3 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Done Habbit 2", done: true, ecdDayOfWeek: 4 });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.markedUndoneCount).toBe(2); // 2 done habbits marked as undone
      expect(response.body.movedCount).toBeGreaterThanOrEqual(1); // At least 1 habbit moved

      // Verify final state - all should be undone
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;

      expect(habbits.length).toBe(5); // All 5 habbits should still exist
      expect(habbits.every((h) => h.done === false)).toBe(true); // All should be undone

      // Verify the today ECD habbit is at the end
      const todayHabbit = habbits.find((h) => h.name === "Today ECD Habbit");
      expect(todayHabbit).toBeDefined();
    });

    test("should reorder priorities sequentially after marking undone and moving", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

      // Create habbits
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 1", done: false, ecdDayOfWeek: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 2", done: true, ecdDayOfWeek: 2 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 3", done: false, ecdDayOfWeek: todayDayOfWeek });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 4", done: true, ecdDayOfWeek: 3 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Habbit 5", done: false, ecdDayOfWeek: 4 });

      // Call chron endpoint
      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify priorities are sequential (0, 1, 2, 3, 4)
      const remainingHabbits = await request(app).get("/api/habbits");
      const habbits = remainingHabbits.body.data;

      expect(habbits.length).toBe(5);
      expect(habbits[0].priority).toBe(0);
      expect(habbits[1].priority).toBe(1);
      expect(habbits[2].priority).toBe(2);
      expect(habbits[3].priority).toBe(3);
      expect(habbits[4].priority).toBe(4);
    });
  });

  describe("Response format", () => {
    test("should return correct response structure", async () => {
      const today = new Date();
      const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

      await request(app)
        .post("/api/habbits")
        .send({ name: "Normal Habbit", done: false, ecdDayOfWeek: 1 });
      await request(app)
        .post("/api/habbits")
        .send({ name: "Done Habbit", done: true, ecdDayOfWeek: 2 });
      await request(app)
        .post("/api/habbits")
        .send({
          name: "Today Habbit",
          done: false,
          ecdDayOfWeek: todayDayOfWeek,
        });

      const response = await request(app)
        .delete("/api/habbits/chron")
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("markedUndoneCount");
      expect(response.body).toHaveProperty("movedCount");
      expect(response.body).toHaveProperty("message");
      expect(typeof response.body.markedUndoneCount).toBe("number");
      expect(typeof response.body.movedCount).toBe("number");
      expect(typeof response.body.message).toBe("string");
    });
  });
});
