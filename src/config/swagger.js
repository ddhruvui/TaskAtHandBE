const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TaskAtHand API",
      version: "2.0.0",
      description:
        "Task management API with Headers and Tasks. Tasks are scoped to Headers and support structured ECD (Expected Completion Date) with types: date, day_of_week, day_of_month, day_of_year.",
      contact: { name: "TaskAtHand Team" },
    },
    servers: [
      { url: "http://localhost:3002", description: "Development server" },
    ],
    tags: [
      { name: "Headers", description: "Header management endpoints" },
      { name: "Tasks", description: "Task management endpoints" },
      { name: "Cron", description: "Cron job trigger endpoint" },
      { name: "System", description: "System health endpoints" },
    ],
    components: {
      schemas: {
        Header: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Work" },
            priority: { type: "integer", example: 0 },
          },
        },
        ECD: {
          type: "object",
          required: ["type", "value"],
          properties: {
            type: {
              type: "string",
              enum: ["date", "day_of_week", "day_of_month", "day_of_year"],
              example: "date",
            },
            value: {
              description:
                'YYYY-MM-DD string for "date", D/M/YYYY string for "day_of_year", array of day names for "day_of_week", array of integers (1-31) for "day_of_month"',
              example: "2026-04-10",
            },
          },
        },
        Task: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Write report" },
            notes: {
              type: "string",
              example: "Include Q1 data",
              nullable: true,
            },
            headerId: { type: "string", example: "507f1f77bcf86cd799439011" },
            priority: {
              type: "integer",
              description: "0-based, scoped per header",
              example: 0,
            },
            ecd: { $ref: "#/components/schemas/ECD", nullable: true },
            done: { type: "boolean", example: false },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Header not found" },
            message: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./src/server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
