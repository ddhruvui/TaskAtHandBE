const express = require("express");
const dotenv = require("dotenv");
const { connectDB } = require("./config/db");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const { runCron, scheduleCron, getLastRun } = require("./cron/cronJob");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Swagger Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "TaskAtHand API Documentation",
  }),
);

/**
 * @openapi
 * /:
 *   get:
 *     tags: [System]
 *     summary: API root endpoint
 *     responses:
 *       200:
 *         description: API is running
 */
app.get("/", (req, res) => {
  res.json({
    message: "TaskAtHand API is running",
    environment: process.env.NODE_ENV || "development",
    docs: "/api-docs",
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: API is healthy
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/headers", require("./routes/headerRoutes"));
app.use("/tasks", require("./routes/taskRoutes"));

/**
 * @openapi
 * /cron/run:
 *   post:
 *     tags: [Cron]
 *     summary: Manually trigger the cron job (POST with optional date override)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 description: ISO date string to run cron as if it were that date
 *                 example: "2026-01-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Cron ran successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CronStats'
 *       500:
 *         description: Internal error
 *   get:
 *     tags: [Cron]
 *     summary: Manually trigger the cron job (GET, no body required)
 *     responses:
 *       200:
 *         description: Cron ran successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CronStats'
 *       500:
 *         description: Internal error
 */

// Manual cron trigger (POST with optional date body)
app.post("/cron/run", async (req, res) => {
  try {
    const overrideDate =
      req.body && req.body.date ? new Date(req.body.date) : undefined;
    const stats = await runCron(overrideDate);
    res.json(stats);
  } catch (error) {
    console.error("Error running cron:", error);
    res.status(500).json({ error: error.message });
  }
});

// Manual cron trigger (GET)
app.get("/cron/run", async (req, res) => {
  try {
    const stats = await runCron();
    res.json(stats);
  } catch (error) {
    console.error("Error running cron:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /cron/status:
 *   get:
 *     tags: [Cron]
 *     summary: Stats from the most recent cron run
 *     responses:
 *       200:
 *         description: Last run stats
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CronStatus'
 *       404:
 *         description: Cron has never run
 */
// Cron status
app.get("/cron/status", (req, res) => {
  const last = getLastRun();
  if (!last) {
    return res.status(404).json({ error: "Cron has not run yet" });
  }
  const { ranAt, ...rest } = last;
  res.json({ lastRanAt: ranAt, ...rest });
});

/**
 * @openapi
 * /cron/details:
 *   get:
 *     tags: [Cron]
 *     summary: Details of the most recent cron run (alias for /cron/status)
 *     responses:
 *       200:
 *         description: Last run stats
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CronStatus'
 *       404:
 *         description: Cron has never run
 */
// Cron details (alias for /cron/status)
app.get("/cron/details", (req, res) => {
  const last = getLastRun();
  if (!last) {
    return res.status(404).json({ error: "Cron has not run yet" });
  }
  const { ranAt, ...rest } = last;
  res.json({ lastRanAt: ranAt, ...rest });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 3002;

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    scheduleCron();
    app.listen(PORT, () => {
      console.log(
        `Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Only start server if not in test mode
if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = app;
