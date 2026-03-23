const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Habbit ECD Validation", () => {
  beforeAll(async () => {
    await connectDB();

    // Clear test database before ECD tests
    const db = await getDatabase();
    const collectionName = "Habbit-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Habbit ECD Tests: ${collectionName} collection cleared`);
  });

  afterEach(async () => {
    // Clear the collection after each test for isolation
    const db = await getDatabase();
    await db.collection("Habbit-Test").deleteMany({});
  });

  describe("CREATE with ECD", () => {
    test("should create habbit with valid ecdDayOfWeek (1-7)", async () => {
      const habbitData = {
        name: "Weekly Habbit",
        notes: "Runs on Monday",
        ecdDayOfWeek: 1, // Monday
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("ecdDayOfWeek");
      expect(response.body.data.ecdDayOfWeek).toEqual([1]);
      expect(response.body.data.ecdDayOfMonth).toBeNull();
    });

    test("should create habbit with valid ecdDayOfMonth (1-31)", async () => {
      const habbitData = {
        name: "Monthly Habbit",
        notes: "Runs on the 15th",
        ecdDayOfMonth: 15,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("ecdDayOfMonth");
      expect(response.body.data.ecdDayOfMonth).toEqual([15]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should create habbit with ecdDayOfMonth = 5 (5th of month, not day-of-week)", async () => {
      const habbitData = {
        name: "5th of Month Habbit",
        ecdDayOfMonth: 5,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([5]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should create habbit with ecdDayOfWeek = 7 (Sunday)", async () => {
      const habbitData = {
        name: "Sunday Habbit",
        ecdDayOfWeek: 7,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfWeek).toEqual([7]);
    });

    test("should create habbit with ecdDayOfMonth = 31 (last day of month)", async () => {
      const habbitData = {
        name: "End of Month Habbit",
        ecdDayOfMonth: 31,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([31]);
    });

    test("should fail to create habbit without ECD", async () => {
      const habbitData = {
        name: "No ECD Habbit",
        notes: "Missing ECD",
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD is required");
    });

    test("should fail to create habbit when both ecdDayOfWeek and ecdDayOfMonth are provided", async () => {
      const habbitData = {
        name: "Both ECD Habbit",
        ecdDayOfWeek: 3,
        ecdDayOfMonth: 15,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("only one");
    });

    test("should fail to create habbit with null ECD fields", async () => {
      const habbitData = {
        name: "Null ECD Habbit",
        ecdDayOfWeek: null,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD is required");
    });

    test("should fail to create habbit with ecdDayOfWeek = 0", async () => {
      const habbitData = {
        name: "Invalid ECD Zero",
        ecdDayOfWeek: 0,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with ecdDayOfWeek > 7", async () => {
      const habbitData = {
        name: "Invalid ECD Week Too High",
        ecdDayOfWeek: 8,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with ecdDayOfMonth > 31", async () => {
      const habbitData = {
        name: "Invalid ECD Month Too High",
        ecdDayOfMonth: 32,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with negative ecdDayOfWeek", async () => {
      const habbitData = {
        name: "Invalid ECD Negative",
        ecdDayOfWeek: -1,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should handle ecdDayOfWeek as string number", async () => {
      const habbitData = {
        name: "String ECD Habbit",
        ecdDayOfWeek: "5",
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfWeek).toEqual([5]);
    });

    test("should fail with invalid string ecdDayOfWeek", async () => {
      const habbitData = {
        name: "Invalid String ECD",
        ecdDayOfWeek: "invalid",
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with ecdDayOfMonth = 0", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Invalid Month Zero", ecdDayOfMonth: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with negative ecdDayOfMonth", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Invalid Month Negative", ecdDayOfMonth: -5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should handle ecdDayOfMonth as string number", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "String Month ECD Habbit", ecdDayOfMonth: "15" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([15]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should fail with invalid string ecdDayOfMonth", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Invalid String Month ECD", ecdDayOfMonth: "invalid" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });
  });

  describe("UPDATE with ECD", () => {
    let habbitId;

    beforeEach(async () => {
      // Create a habbit before each update test (day of week)
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Test Habbit", ecdDayOfWeek: 5 }); // Friday
      habbitId = response.body.data._id;
    });

    test("should update habbit to a different ecdDayOfWeek", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfWeek: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfWeek).toEqual([3]);
      expect(response.body.data.ecdDayOfMonth).toBeNull();
    });

    test("should update habbit from ecdDayOfWeek to ecdDayOfMonth", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfMonth: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([10]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should fail to update habbit with invalid ecdDayOfWeek (0)", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfWeek: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to update habbit with invalid ecdDayOfMonth (32)", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfMonth: 32 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should update habbit from ecdDayOfMonth to ecdDayOfWeek", async () => {
      // First switch to ecdDayOfMonth
      await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfMonth: 10 })
        .expect(200);

      // Now switch back to ecdDayOfWeek — ecdDayOfMonth should be cleared
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecdDayOfWeek: 2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfWeek).toEqual([2]);
      expect(response.body.data.ecdDayOfMonth).toBeNull();
    });

    test("should update habbit name without changing ecd fields", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ name: "Updated Habbit Name" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Updated Habbit Name");
      expect(response.body.data.ecdDayOfWeek).toEqual([5]); // Should remain unchanged
      expect(response.body.data.ecdDayOfMonth).toBeNull();
    });
  });

  describe("ECD Interpretation", () => {
    test("should store all ecdDayOfWeek values 1-7 correctly", async () => {
      const days = [
        { ecdDayOfWeek: 1, name: "Monday Habbit" },
        { ecdDayOfWeek: 2, name: "Tuesday Habbit" },
        { ecdDayOfWeek: 3, name: "Wednesday Habbit" },
        { ecdDayOfWeek: 4, name: "Thursday Habbit" },
        { ecdDayOfWeek: 5, name: "Friday Habbit" },
        { ecdDayOfWeek: 6, name: "Saturday Habbit" },
        { ecdDayOfWeek: 7, name: "Sunday Habbit" },
      ];

      for (const day of days) {
        const response = await request(app)
          .post("/api/habbits")
          .send(day)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.ecdDayOfWeek).toEqual([day.ecdDayOfWeek]);
        expect(response.body.data.ecdDayOfMonth).toBeNull();
      }
    });

    test("should treat ecdDayOfMonth 1-7 as day of month (not day of week)", async () => {
      // This is the key fix: values 1-7 can now be stored as day of month
      for (const dom of [1, 2, 3, 4, 5, 6, 7]) {
        const response = await request(app)
          .post("/api/habbits")
          .send({ name: `Day ${dom} of Month Habbit`, ecdDayOfMonth: dom })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.ecdDayOfMonth).toEqual([dom]);
        expect(response.body.data.ecdDayOfWeek).toBeNull();
      }
    });

    test("should store ecdDayOfMonth values 8-31 correctly", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Mid-month Habbit", ecdDayOfMonth: 15 })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([15]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should create habbit with multiple ecdDayOfWeek values", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Multi-day Week Habbit", ecdDayOfWeek: [1, 3, 5] }) // Mon, Wed, Fri
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfWeek).toEqual([1, 3, 5]);
      expect(response.body.data.ecdDayOfMonth).toBeNull();
    });

    test("should create habbit with multiple ecdDayOfMonth values", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Multi-day Month Habbit", ecdDayOfMonth: [1, 15, 31] })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecdDayOfMonth).toEqual([1, 15, 31]);
      expect(response.body.data.ecdDayOfWeek).toBeNull();
    });

    test("should fail with invalid value in ecdDayOfWeek array", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Invalid Array Week", ecdDayOfWeek: [1, 8] }) // 8 is out of range
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail with invalid value in ecdDayOfMonth array", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Invalid Array Month", ecdDayOfMonth: [10, 32] }) // 32 is out of range
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });
  });
});
