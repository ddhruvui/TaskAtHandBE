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
      { name: "Events", description: "Event template management endpoints" },
      {
        name: "LifeEvents",
        description: "Annually recurring life event management endpoints",
      },
      {
        name: "Affirmations",
        description: "Daily affirmation management endpoints",
      },
      {
        name: "Goals",
        description: "Goal and step (habit backlog) management endpoints",
      },
      {
        name: "Calls",
        description: "Biweekly/monthly call reminder management endpoints",
      },
      {
        name: "Projects",
        description: "Long-term project (multi-step) management endpoints",
      },
      { name: "Cron", description: "Cron job trigger endpoint" },
      { name: "Archive", description: "Task history (TaskArchive) endpoints" },
      { name: "Insights", description: "Stats and AI insight report endpoints" },
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
            projectId: {
              type: "string",
              nullable: true,
              description:
                "_id of the long-term project this header mirrors, or null for a plain header. Project headers are kept in the projects' priority order as one contiguous block.",
              example: null,
            },
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
            doneAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Set when done flips to true; cleared on undo/cron reset",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Event: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Burger Night" },
            tasks: {
              type: "array",
              items: { type: "string" },
              example: ["Procure onion", "Procure bun", "Procure patty"],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Affirmation: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Thank you blessing" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        GoalStep: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Wake up at 6" },
            status: {
              type: "string",
              enum: ["pending", "under_progress"],
              default: "pending",
              description:
                'pending = backlog/paused, under_progress = started — its daily task lives in the "One Step At A Time" todo header and is kept for life. Legacy values "active" and "achieved" are normalized to "under_progress".',
              example: "pending",
            },
          },
        },
        Goal: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Improve Health" },
            steps: {
              type: "array",
              items: { $ref: "#/components/schemas/GoalStep" },
              example: [
                { name: "Wake up at 6", status: "under_progress" },
                { name: "Have 1 fruit a day", status: "pending" },
              ],
            },
            priority: {
              type: "integer",
              description:
                "Display order, contiguous 0..n-1. New goals append at the end; changing it shifts the other goals to keep the sequence contiguous.",
              example: 0,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProjectTask: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "get data from EODHD" },
            notes: {
              type: "string",
              default: "",
              description:
                'Free-text notes for the step. The client mirrors these onto the linked todo task; an empty note falls back to a "Step towards …" default there.',
              example: "use the v2 API key",
            },
            date: {
              type: "string",
              nullable: true,
              default: null,
              description:
                'Target date ("YYYY-MM-DD") or null. When set, the client mirrors the task into the todo under a header named after the project.',
              example: "2026-08-01",
            },
            done: { type: "boolean", default: false, example: false },
            todoTaskId: {
              type: "string",
              nullable: true,
              default: null,
              description:
                "_id of the linked todo task while one exists; cleared by the cron when it deletes the done todo task and marks this task done.",
              example: "507f1f77bcf86cd799439011",
            },
          },
        },
        Project: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Automated Stock Market" },
            priority: { type: "integer", example: 0 },
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/ProjectTask" },
              description:
                "Ordered task list; undone tasks always come before done tasks, and dated undone tasks before undated ones",
              example: [
                {
                  name: "get data from EODHD",
                  notes: "use the v2 API key",
                  date: "2026-08-01",
                  done: false,
                  todoTaskId: "507f1f77bcf86cd799439011",
                },
                {
                  name: "deploy to cpu",
                  notes: "",
                  date: null,
                  done: true,
                  todoTaskId: null,
                },
              ],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        LifeEvent: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Wife's birthday" },
            date: {
              type: "string",
              description:
                '"D/M" (no zero-padding, no year) — the event recurs annually on this day. Feb 29 clamps to Feb 28 in non-leap years.',
              example: "7/3",
            },
            lastAddedYear: {
              type: "integer",
              description:
                "Server-managed: the year of the last occurrence the cron added to the todo (baselined on create/date change). The cron only fires when this is behind the current year, which makes reruns idempotent.",
              example: 2026,
            },
            done: {
              type: "boolean",
              description:
                "This year's occurrence completed. Set by clients when the linked todo task is toggled and by the cron when it deletes the done todo task; reset to false when the next occurrence is added.",
              example: false,
            },
            todoTaskId: {
              type: "string",
              nullable: true,
              description:
                "_id of the linked todo task while one exists; cleared by the cron when it deletes the done todo task and marks this event done.",
              example: null,
            },
            priority: {
              type: "integer",
              description:
                "Display order, contiguous 0..n-1. New life events append at the end; changing it shifts the others to keep the sequence contiguous.",
              example: 0,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Call: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Grandma" },
            frequency: {
              type: "string",
              enum: ["biweekly", "monthly"],
              description:
                "biweekly = call twice per month (periods 1st–14th and 15th–end); monthly = call once per month",
              example: "biweekly",
            },
            done: { type: "boolean", example: false },
            doneAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Set when done flips to true; cleared on undo/cron reset",
            },
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
        CronStats: {
          type: "object",
          properties: {
            ranAt: {
              type: "string",
              format: "date-time",
              example: "2026-01-01T00:00:00.000Z",
            },
            tasksDeleted: { type: "integer", example: 2 },
            tasksMarkedUndone: { type: "integer", example: 3 },
            tasksClamped: { type: "integer", example: 1 },
            headersDeleted: { type: "integer", example: 0 },
            headersReprioritized: { type: "integer", example: 2 },
            headersReordered: { type: "integer", example: 4 },
            projectTasksCompleted: { type: "integer", example: 1 },
            lifeEventsCompleted: { type: "integer", example: 0 },
            lifeEventTasksCreated: { type: "integer", example: 1 },
            callsReset: { type: "integer", example: 0 },
          },
        },
        CronStatus: {
          type: "object",
          properties: {
            lastRanAt: {
              type: "string",
              format: "date-time",
              example: "2026-01-01T00:00:00.000Z",
            },
            tasksDeleted: { type: "integer", example: 2 },
            tasksMarkedUndone: { type: "integer", example: 3 },
            tasksClamped: { type: "integer", example: 1 },
            headersDeleted: { type: "integer", example: 0 },
            headersReprioritized: { type: "integer", example: 2 },
            headersReordered: { type: "integer", example: 4 },
            projectTasksCompleted: { type: "integer", example: 1 },
            lifeEventsCompleted: { type: "integer", example: 0 },
            lifeEventTasksCreated: { type: "integer", example: 1 },
            callsReset: { type: "integer", example: 0 },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./src/server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
