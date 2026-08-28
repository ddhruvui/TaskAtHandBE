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
      {
        name: "Vacations",
        description:
          "Vacation range management — periods where missed work is not procrastination",
      },
      { name: "Cron", description: "Cron job trigger endpoint" },
      { name: "Archive", description: "Task history (TaskArchive) endpoints" },
      {
        name: "Insights",
        description: "Stats and AI insight report endpoints",
      },
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
              description:
                "Set when done flips to true; cleared on undo/cron reset",
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
            days: {
              type: "array",
              items: {
                type: "string",
                enum: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
              },
              description:
                "Weekdays the habit is expected on. Mirrored onto the linked task's day_of_week ECD when the step is started, so the nightly archive only records a result — and the streak only counts — on these days. Deduped and sorted into week order (Sun → Sat); omitted means the whole week.",
              default: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
              example: ["Mon", "Wed", "Fri"],
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
                {
                  name: "Wake up at 6",
                  status: "under_progress",
                  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
                },
                {
                  name: "Have 1 fruit a day",
                  status: "pending",
                  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                },
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
              description:
                "Set when done flips to true; cleared on undo/cron reset",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Vacation: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            startDate: {
              type: "string",
              description: "First vacation day (inclusive), YYYY-MM-DD UTC",
              example: "2026-09-03",
            },
            endDate: {
              type: "string",
              description: "Last vacation day (inclusive), YYYY-MM-DD UTC",
              example: "2026-09-15",
            },
            note: { type: "string", example: "Kerala trip" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        VacationStatus: {
          type: "object",
          properties: {
            today: { type: "string", example: "2026-09-07" },
            onVacation: { type: "boolean", example: true },
            active: {
              type: "object",
              nullable: true,
              description:
                "The vacation covering today, with day counts for the banner",
              properties: {
                _id: { type: "string" },
                startDate: { type: "string", example: "2026-09-03" },
                endDate: { type: "string", example: "2026-09-15" },
                note: { type: "string" },
                totalDays: { type: "integer", example: 13 },
                dayOfVacation: { type: "integer", example: 5 },
                daysRemaining: { type: "integer", example: 8 },
              },
            },
            upcoming: {
              type: "array",
              description: "Vacations starting after today",
              items: { $ref: "#/components/schemas/Vacation" },
            },
            justReturnedFrom: {
              type: "object",
              nullable: true,
              description:
                "A vacation that ended in the last 3 days — drives the 'returned from an N-day break' report framing",
              properties: {
                startDate: { type: "string" },
                endDate: { type: "string" },
                days: { type: "integer", example: 13 },
                daysAgo: { type: "integer", example: 1 },
              },
            },
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
            onVacation: {
              type: "boolean",
              description:
                "Whether the run's day fell inside a booked vacation. No cron step behaves differently; it explains why insightSkipped may be 'vacation' and why the stats snapshot is frozen.",
              example: false,
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
            statsRefreshed: {
              type: "boolean",
              example: true,
              description:
                "Whether cron step 9 refreshed the AI-free InsightStats snapshot (streaks, rates). Runs on every cron run, including without an API key or with skipInsights.",
            },
            insightGenerated: {
              type: "boolean",
              example: true,
              description:
                "Whether the AI report was generated on this run. Always present; when false, insightSkipped names the reason.",
            },
            insightSkipped: {
              type: "string",
              enum: [
                "opted-out",
                "test-env",
                "no-api-key",
                "vacation",
                "not-due",
                "no-data",
                "error",
              ],
              example: "not-due",
              description:
                'Why no report was written, present whenever insightGenerated is false. "opted-out" = skipInsights was set; "test-env" = NODE_ENV=test; "no-api-key" = no GEMINI_API_KEY; "vacation" = the user is away; "not-due" = today\'s report already exists (the report fires once per UTC day, so a second run — a manual /cron/run, a redeploy, or a prior POST /insights/generate today — passes on it); "no-data" = the archive window is empty; "error" = the model call failed and insightError carries the message.',
            },
            insightError: {
              type: "string",
              example: "No text output in model response",
              description:
                'Only present with insightSkipped: "error" — the failure message. The run itself still succeeded.',
            },
            archiveEventsPruned: {
              type: "integer",
              example: 8,
              description:
                "Raw TaskArchive events deleted by step 10 after being folded into ArchiveSummary.",
            },
            archiveEventsFolded: {
              type: "integer",
              example: 8,
              description:
                "Events actually counted into a monthly summary. Lower than archiveEventsPruned only when a previous run had already folded them.",
            },
            archiveMonthsSummarised: {
              type: "integer",
              example: 1,
              description:
                "Monthly ArchiveSummary documents written by step 10.",
            },
            insightReportsPruned: {
              type: "integer",
              example: 1,
              description:
                "Stored AI reports deleted by step 11. Only the newest INSIGHT_RETENTION_COUNT (default 100, the /insights/history ceiling) are kept.",
            },
            archiveCutoff: {
              type: "string",
              nullable: true,
              example: "2026-07-20",
              description:
                "The UTC day events had to predate to be pruned. Null when nothing was old enough.",
            },
          },
        },
        ArchiveSummary: {
          type: "object",
          description:
            "One calendar month of task history, kept permanently after the raw events are pruned. Written by cron step 10.",
          properties: {
            month: { type: "string", example: "2026-07" },
            days: {
              type: "array",
              items: { type: "string" },
              example: ["2026-07-01", "2026-07-02"],
              description:
                "Source days already folded in — the guard that stops a re-run counting a day twice.",
            },
            eventCount: { type: "integer", example: 412 },
            habits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  taskName: { type: "string", example: "Meditate" },
                  headerName: {
                    type: "string",
                    nullable: true,
                    example: "Health",
                  },
                  scheduled: { type: "integer", example: 22 },
                  completed: { type: "integer", example: 19 },
                },
              },
            },
            recurring: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  taskName: { type: "string", example: "Pay rent" },
                  headerName: {
                    type: "string",
                    nullable: true,
                    example: "Admin",
                  },
                  ecdType: {
                    type: "string",
                    nullable: true,
                    example: "day_of_month",
                  },
                  scheduled: { type: "integer", example: 1 },
                  completed: { type: "integer", example: 1 },
                },
              },
            },
            calls: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  callName: { type: "string", example: "Grandma" },
                  frequency: {
                    type: "string",
                    nullable: true,
                    example: "biweekly",
                  },
                  scheduled: { type: "integer", example: 2 },
                  completed: { type: "integer", example: 1 },
                },
              },
            },
            oneTimeTasks: {
              type: "object",
              properties: {
                completed: { type: "integer", example: 14 },
                onTime: { type: "integer", example: 11 },
                late: { type: "integer", example: 3 },
              },
            },
            reschedules: {
              type: "object",
              properties: {
                total: { type: "integer", example: 5 },
                pushedLater: { type: "integer", example: 4 },
                pushedLaterNoReason: { type: "integer", example: 2 },
              },
            },
            deletions: {
              type: "object",
              properties: {
                count: { type: "integer", example: 2 },
                withReason: { type: "integer", example: 1 },
              },
            },
            byHeader: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  headerName: { type: "string", example: "Health" },
                  completed: { type: "integer", example: 19 },
                  missed: { type: "integer", example: 3 },
                  reschedules: { type: "integer", example: 1 },
                  deleted: { type: "integer", example: 0 },
                },
              },
            },
            firstAt: { type: "string", format: "date-time", nullable: true },
            lastAt: { type: "string", format: "date-time", nullable: true },
            updatedAt: { type: "string", format: "date-time" },
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
            onVacation: {
              type: "boolean",
              description:
                "Whether the run's day fell inside a booked vacation. No cron step behaves differently; it explains why insightSkipped may be 'vacation' and why the stats snapshot is frozen.",
              example: false,
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
