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
    test("should create habbit with valid day of week (1-7)", async () => {
      const habbitData = {
        name: "Weekly Habbit",
        notes: "Runs on Monday",
        ecd: 1, // Monday
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("ecd");
      expect(response.body.data.ecd).toBe(1);
    });

    test("should create habbit with valid day of month (1-31)", async () => {
      const habbitData = {
        name: "Monthly Habbit",
        notes: "Runs on the 15th",
        ecd: 15,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("ecd");
      expect(response.body.data.ecd).toBe(15);
    });

    test("should create habbit with ecd = 7 (Sunday)", async () => {
      const habbitData = {
        name: "Sunday Habbit",
        ecd: 7,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBe(7);
    });

    test("should create habbit with ecd = 31 (last day of month)", async () => {
      const habbitData = {
        name: "End of Month Habbit",
        ecd: 31,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBe(31);
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

    test("should fail to create habbit with null ECD", async () => {
      const habbitData = {
        name: "Null ECD Habbit",
        ecd: null,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD is required");
    });

    test("should fail to create habbit with ecd = 0", async () => {
      const habbitData = {
        name: "Invalid ECD Zero",
        ecd: 0,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with ecd > 31", async () => {
      const habbitData = {
        name: "Invalid ECD Too High",
        ecd: 32,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to create habbit with negative ecd", async () => {
      const habbitData = {
        name: "Invalid ECD Negative",
        ecd: -1,
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should handle ecd as string number", async () => {
      const habbitData = {
        name: "String ECD Habbit",
        ecd: "5",
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBe(5);
    });

    test("should fail with invalid string ecd", async () => {
      const habbitData = {
        name: "Invalid String ECD",
        ecd: "invalid",
      };

      const response = await request(app)
        .post("/api/habbits")
        .send(habbitData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });
  });

  describe("UPDATE with ECD", () => {
    let habbitId;

    beforeEach(async () => {
      // Create a habbit before each update test
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Test Habbit", ecd: 5 });
      habbitId = response.body.data._id;
    });

    test("should update habbit with valid ecd", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecd: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBe(10);
    });

    test("should fail to update habbit with invalid ecd (0)", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecd: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should fail to update habbit with invalid ecd (32)", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ ecd: 32 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("ECD must be a valid");
    });

    test("should update habbit name without changing ecd", async () => {
      const response = await request(app)
        .put(`/api/habbits/${habbitId}`)
        .send({ name: "Updated Habbit Name" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Updated Habbit Name");
      expect(response.body.data.ecd).toBe(5); // Should remain unchanged
    });
  });

  describe("ECD Interpretation", () => {
    test("should interpret ecd 1-7 as day of week", async () => {
      const days = [
        { ecd: 1, name: "Monday Habbit" },
        { ecd: 2, name: "Tuesday Habbit" },
        { ecd: 3, name: "Wednesday Habbit" },
        { ecd: 4, name: "Thursday Habbit" },
        { ecd: 5, name: "Friday Habbit" },
        { ecd: 6, name: "Saturday Habbit" },
        { ecd: 7, name: "Sunday Habbit" },
      ];

      for (const day of days) {
        const response = await request(app)
          .post("/api/habbits")
          .send(day)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.ecd).toBe(day.ecd);
      }
    });

    test("should interpret ecd 8-31 as day of month", async () => {
      const response = await request(app)
        .post("/api/habbits")
        .send({ name: "Mid-month Habbit", ecd: 15 })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBe(15);
    });
  });
});
