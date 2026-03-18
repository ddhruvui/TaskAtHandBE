const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TaskAtHand API",
      version: "1.0.0",
      description:
        "A comprehensive task management API supporting todos, habits, and office tasks with priority management.",
      contact: {
        name: "TaskAtHand Team",
      },
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
      {
        url: "http://localhost:5000",
        description: "Production server",
      },
    ],
    tags: [
      {
        name: "Todos",
        description: "Personal todo management endpoints",
      },
      {
        name: "Habits",
        description: "Habit tracking endpoints",
      },
      {
        name: "Office",
        description: "Office task management endpoints",
      },
      {
        name: "System",
        description: "System health and info endpoints",
      },
    ],
    components: {
      schemas: {
        Todo: {
          type: "object",
          required: ["name"],
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              description: "Todo name/title",
              example: "Buy groceries",
            },
            notes: {
              type: "string",
              description: "Additional notes or details",
              example: "Milk, eggs, bread",
            },
            priority: {
              type: "number",
              description: "Priority order (0-based, lower is higher priority)",
              example: 0,
            },
            done: {
              type: "boolean",
              description: "Completion status",
              example: false,
            },
            ecd: {
              type: "string",
              format: "date-time",
              description: "Expected Completion Date",
              example: "2026-03-20T00:00:00.000Z",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        Habit: {
          type: "object",
          required: ["name"],
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              description: "Habit name/title",
              example: "Morning exercise",
            },
            notes: {
              type: "string",
              description: "Additional notes or details",
              example: "30 minutes cardio",
            },
            priority: {
              type: "number",
              description: "Priority order (0-based, lower is higher priority)",
              example: 0,
            },
            done: {
              type: "boolean",
              description: "Completion status",
              example: false,
            },
            ecd: {
              type: "string",
              format: "date-time",
              description: "Expected Completion Date",
              example: "2026-03-20T00:00:00.000Z",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        Task: {
          type: "object",
          required: ["name"],
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              description: "Task name/title",
              example: "Prepare quarterly report",
            },
            notes: {
              type: "string",
              description: "Additional notes or details",
              example: "Include sales data from Q1",
            },
            priority: {
              type: "number",
              description: "Priority order (0-based, lower is higher priority)",
              example: 0,
            },
            done: {
              type: "boolean",
              description: "Completion status",
              example: false,
            },
            ecd: {
              type: "string",
              format: "date-time",
              description: "Expected Completion Date",
              example: "2026-03-20T00:00:00.000Z",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        CreateTodo: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "Todo name/title",
              example: "Buy groceries",
            },
            notes: {
              type: "string",
              description: "Additional notes or details",
              example: "Milk, eggs, bread",
            },
            done: {
              type: "boolean",
              description: "Completion status",
              example: false,
            },
            ecd: {
              type: "string",
              format: "date-time",
              description: "Expected Completion Date (ISO 8601 format)",
              example: "2026-03-20T00:00:00.000Z",
            },
          },
        },
        UpdateTodo: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Todo name/title",
              example: "Buy groceries",
            },
            notes: {
              type: "string",
              description: "Additional notes or details",
              example: "Milk, eggs, bread, cheese",
            },
            priority: {
              type: "number",
              description: "Priority order (0-based)",
              example: 2,
            },
            done: {
              type: "boolean",
              description: "Completion status",
              example: true,
            },
            ecd: {
              type: "string",
              format: "date-time",
              description: "Expected Completion Date (ISO 8601 format)",
              example: "2026-03-20T00:00:00.000Z",
            },
          },
        },
        Count: {
          type: "object",
          properties: {
            count: {
              type: "number",
              description: "Total count of items",
              example: 5,
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
              example: "Invalid ID format",
            },
            message: {
              type: "string",
              description: "Detailed error message (development only)",
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./src/server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
