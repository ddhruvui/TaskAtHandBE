const request = require("supertest");
const app = require("../src/server");
const { connectDB } = require("../src/config/db");

describe("System endpoints", () => {
  beforeAll(async () => {
    await connectDB();
  });

  describe("GET /", () => {
    test("returns API info with message, environment, and docs link", async () => {
      const res = await request(app).get("/").expect(200);
      expect(typeof res.body.message).toBe("string");
      expect(res.body.message.length).toBeGreaterThan(0);
      expect(res.body.environment).toBe("test");
      expect(res.body.docs).toContain("/api-docs");
    });
  });

  describe("GET /health", () => {
    test("returns ok status with a valid timestamp", async () => {
      const res = await request(app).get("/health").expect(200);
      expect(res.body.status).toBe("ok");
      const ts = new Date(res.body.timestamp);
      expect(Number.isNaN(ts.getTime())).toBe(false);
      expect(Math.abs(Date.now() - ts.getTime())).toBeLessThan(10000);
    });
  });

  describe("GET /cron/details before any run", () => {
    // Cron never runs in this test file, so the in-memory lastRun is null here
    test("returns 404 when cron has not run in this process", async () => {
      const res = await request(app).get("/cron/details").expect(404);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("fallback handlers", () => {
    test("unknown routes return 404 Route not found", async () => {
      const res = await request(app).get("/no-such-route").expect(404);
      expect(res.body.error).toBe("Route not found");
    });

    test("malformed JSON bodies hit the error middleware", async () => {
      const res = await request(app)
        .post("/headers")
        .set("Content-Type", "application/json")
        .send('{"name": broken')
        .expect(500);
      expect(res.body.error).toBe("Something went wrong!");
    });
  });
});
