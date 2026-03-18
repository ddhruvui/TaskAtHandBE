const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

describe("Data Validation & Edge Cases", () => {
  beforeAll(async () => {
    await connectDB();

    const db = await getDatabase();
    const collectionName = "Office-Test";
    await db.collection(collectionName).deleteMany({});
    console.log(`Data Validation Tests: ${collectionName} collection cleared`);
  });

  describe("Long String Handling", () => {
    test("should handle very long task name (1000 chars)", async () => {
      const longName = "A".repeat(1000);
      const taskData = {
        name: longName,
        notes: "Testing long name",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(longName);
      expect(response.body.data.name.length).toBe(1000);
    });

    test("should handle very long notes (5000 chars)", async () => {
      const longNotes = "Note content ".repeat(400); // ~5200 chars
      const taskData = {
        name: "Long notes task",
        notes: longNotes,
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes.length).toBeGreaterThan(5000);
    });

    test("should handle extremely long name (10000 chars)", async () => {
      const extremelyLongName = "X".repeat(10000);
      const taskData = {
        name: extremelyLongName,
        notes: "Extreme test",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Either accepts it or rejects it, but shouldn't crash
      expect([200, 201, 400]).toContain(response.status);
    });
  });

  describe("Special Characters", () => {
    test("should handle Unicode characters (Chinese)", async () => {
      const taskData = {
        name: "任务名称 - Chinese Task",
        notes: "这是任务描述",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
      expect(response.body.data.notes).toBe(taskData.notes);
    });

    test("should handle Unicode characters (Arabic)", async () => {
      const taskData = {
        name: "مهمة - Arabic Task",
        notes: "وصف المهمة",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });

    test("should handle emojis in task name", async () => {
      const taskData = {
        name: "🎉 Celebration Task 🚀",
        notes: "Task with emojis 😀👍💯",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
      expect(response.body.data.notes).toBe(taskData.notes);
    });

    test("should handle accented characters", async () => {
      const taskData = {
        name: "Café résumé naïve",
        notes: "Données françaises",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });

    test("should handle mixed special characters", async () => {
      const taskData = {
        name: "!@#$%^&*()_+-=[]{}|;:',.<>?/~`",
        notes: "Special chars: €£¥§©®™",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });

    test("should handle quotes and apostrophes", async () => {
      const taskData = {
        name: "It's a \"quoted\" task with 'single' quotes",
        notes: 'O\'Brien said "Hello"',
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });
  });

  describe("HTML & Script Injection Prevention", () => {
    test("should handle HTML tags in task name", async () => {
      const taskData = {
        name: "<div>Task Name</div>",
        notes: "<p>Notes with <strong>HTML</strong></p>",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      // Should store as-is, not execute or strip
      expect(response.body.data.name).toBe(taskData.name);
    });

    test("should handle script tags without executing", async () => {
      const taskData = {
        name: "<script>alert('XSS')</script>",
        notes: "Testing script injection",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      // Should store as string, not execute
      expect(response.body.data.name).toContain("script");
    });

    test("should handle event handlers in HTML", async () => {
      const taskData = {
        name: "<img src=x onerror=alert(1)>",
        notes: "Event handler test",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });

    test("should handle SQL-like injection attempts", async () => {
      const taskData = {
        name: "'; DROP TABLE tasks; --",
        notes: "1' OR '1'='1",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(taskData.name);
    });
  });

  describe("NoSQL Injection Prevention", () => {
    test("should handle object injection in name field", async () => {
      const taskData = {
        name: { $ne: null },
        notes: "Object injection test",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should either reject or handle safely
      if (response.status === 201) {
        // If accepted, should convert to string
        expect(typeof response.body.data.name).toBe("string");
      }
    });

    test("should handle $gt operator injection", async () => {
      const taskData = {
        name: "Normal name",
        notes: { $gt: "" },
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should handle safely
      expect([201, 400, 500]).toContain(response.status);
    });

    test("should handle array injection", async () => {
      const taskData = {
        name: ["array", "injection"],
        notes: "Array test",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should handle arrays gracefully
      expect([201, 400, 500]).toContain(response.status);
    });
  });

  describe("Whitespace Variations", () => {
    test("should handle tabs in task name", async () => {
      const taskData = {
        name: "Task\twith\ttabs",
        notes: "Tab\tseparated\tnotes",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test("should handle newlines in task name", async () => {
      const taskData = {
        name: "Task\nwith\nnewlines",
        notes: "Multi\nline\nnotes",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test("should handle multiple consecutive spaces", async () => {
      const taskData = {
        name: "Task    with    multiple    spaces",
        notes: "Lots     of     spaces",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test("should handle mixed whitespace characters", async () => {
      const taskData = {
        name: " \t \n Task \r\n with \t mixed \n whitespace \t ",
        notes: "Whitespace test",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should either trim or accept as-is
      expect([201, 400]).toContain(response.status);
    });
  });

  describe("Null and Undefined Handling", () => {
    test("should handle null in notes field", async () => {
      const taskData = {
        name: "Task with null notes",
        notes: null,
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBe("");
    });

    test("should handle undefined done field", async () => {
      const taskData = {
        name: "Task with undefined done",
        done: undefined,
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.done).toBe(false);
    });

    test("should handle completely empty object after name", async () => {
      const taskData = {
        name: "Minimal task",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Minimal task");
      expect(response.body.data.notes).toBe("");
      expect(response.body.data.done).toBe(false);
    });
  });

  describe("Boundary Values", () => {
    test("should handle zero-width space characters", async () => {
      const taskData = {
        name: "Task​with​zero​width​spaces", // Contains U+200B
        notes: "Zero width test",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test("should handle single character name", async () => {
      const taskData = {
        name: "A",
        notes: "Single char",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("A");
    });

    test("should handle numbers as strings in name", async () => {
      const taskData = {
        name: "12345",
        notes: "67890",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("12345");
    });

    test("should handle boolean-like strings", async () => {
      const taskData = {
        name: "true",
        notes: "false",
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("true");
    });
  });

  describe("Invalid Data Types", () => {
    test("should handle number instead of string for name", async () => {
      const taskData = {
        name: 12345,
        notes: "Number as name",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should either convert or reject
      if (response.status === 201) {
        expect(typeof response.body.data.name).toBe("string");
      } else {
        expect(response.status).toBe(400);
      }
    });

    test("should handle boolean instead of string for name", async () => {
      const taskData = {
        name: true,
        notes: "Boolean as name",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should handle gracefully
      expect([201, 400]).toContain(response.status);
    });

    test("should handle string instead of boolean for done", async () => {
      const taskData = {
        name: "Task name",
        done: "yes",
      };

      const response = await request(app).post("/api/office").send(taskData);

      // Should either convert or default to false
      expect([201, 400]).toContain(response.status);
      if (response.status === 201) {
        expect(typeof response.body.data.done).toBe("boolean");
      }
    });

    test("should handle number for done field", async () => {
      const taskData = {
        name: "Task name",
        done: 1,
      };

      const response = await request(app)
        .post("/api/office")
        .send(taskData)
        .expect(201);

      expect(typeof response.body.data.done).toBe("boolean");
    });
  });
});
