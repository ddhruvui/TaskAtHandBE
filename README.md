# TaskAtHand Backend

Node.js/Express REST API backend for the TaskAtHand application, backed by MongoDB. Organises tasks into user-defined **Headers** with priority ordering, optional Expected Completion Dates (ECD), and a daily cron job for automated task maintenance.

## Features

- **Headers & Tasks** — two-collection data model with automatic, contiguous priority management
- **Events** — reusable task bundles (e.g. "Burger Night" with its shopping list); clients schedule them as dated tasks under a header named after the event (reused if it exists, created otherwise)
- **Life Events** — annually recurring dates (e.g. "Wife's birthday" on 7/3); every year on the day, the nightly cron adds a linked one-time task to the todo under an "Events" header (reused case-insensitively, created otherwise), and when the done task is cleaned up the event is marked done — never deleted — so it fires again next year
- **Affirmations** — single short lines the user reads daily (e.g. "Thank you blessing"); completely independent of tasks and headers
- **Calls** — people the user must call biweekly or monthly (e.g. "Grandma"); completely independent of tasks and headers, with the "called" checkmark auto-reset by the cron at each period boundary (the 15th and the last day of the month)
- **Goals** — long-term aims (e.g. "Improve Health") broken into small steps/habits, each `pending` (backlog/paused) or `under_progress` (a lifelong habit) with the weekdays it runs on (`days`, default all seven); clients start one step at a time as a recurring task on those days under a header named "One Step At A Time" (reused if it exists, created otherwise) and keep the two views in sync client-side. Because the nightly archive only records a result on scheduled days, the habit's streak counts only the days the step is set to
- **Projects** — long-term projects (e.g. "Automated Stock Market") broken into ordered tasks, with header-style priority ordering, a done/undone barrier inside each project and dated steps ranked above undated ones; giving a task a date mirrors it into the todo under the project's own header (created via `POST /headers` with a `projectId`), and the cron marks the project task done when it deletes the completed todo task — done steps are retained in the project
- **Server-owned header ordering** — headers linked to a project (`projectId`) are kept in the projects' priority order as one contiguous block, re-applied atomically on header create, project move/rename/delete and nightly by the cron; clients never reorder them
- **ECD system** — four ECD types (`date`, `day_of_week`, `day_of_month`, `day_of_year`) with full validation
- **Daily cron job** — archives yesterday's outcomes, auto-resets recurring tasks, cleans up expired ones, re-sorts by upcoming ECD, refreshes the stats snapshot, and (once a week, on Friday) generates the AI report (all in UTC)
- **Task archive** — append-only `TaskArchive` event log: habit hit/miss results, completed-task history (with planned vs. done dates), and reschedule tracking
- **Bounded archive with permanent roll-ups** — cron step 10 folds raw events older than `ARCHIVE_RETENTION_DAYS` (default 30) into `ArchiveSummary`, one document per calendar month kept forever, then deletes them. The collection stops growing without bound while long-term monthly trends survive; read them at `GET /archive/summary`
- **Nightly stats snapshot** — cron step 9 recomputes habit streaks, completion rates, on-time counts, reschedules and call results from the archive **every night with no AI involved** (no API key required, not affected by `skipInsights`) and stores them in `InsightStats`, readable at `GET /insights/stats/latest`. Streaks stay current daily; only the coaching narrative is weekly
- **AI insights** — weekly coaching report (habits on track/slipping, procrastination flags, call reminders, suggestions) generated via the Google Gemini API (`gemini-3.7-flash` by default) and stored in the `Insights` collection. The cron only calls the API on **Fridays** (UTC), once per Friday; `POST /insights/generate` bypasses that gate. Tasks finished on or before their planned date count as on time, never as slippage
- **Shared utility layer** — the rules the API repeats (undone-first/done-last ordering, contiguous `0..n-1` priorities, partial-update validation, the log-then-400/404/500 response contract, UTC calendar maths) live once in `src/utils/` and two model base classes instead of once per resource. Documented in [`wiki/`](wiki/Home.md)
- **Swagger UI** — interactive API docs served at `/api-docs`
- **Test isolation** — dedicated `*-Test` collections activated via `USE_TEST_DB=true`
- **CORS enabled** — accepts requests from any origin

## Project Structure

```
TaskAtHandBE/
├── src/
│   ├── server.js               # Express app & route wiring
│   ├── config/
│   │   ├── db.js               # MongoDB connection
│   │   └── swagger.js          # OpenAPI spec generation
│   ├── controllers/
│   │   ├── headerController.js
│   │   ├── taskController.js
│   │   ├── eventController.js
│   │   ├── affirmationController.js
│   │   ├── callController.js
│   │   ├── goalController.js
│   │   ├── projectController.js
│   │   ├── lifeEventController.js
│   │   └── insightController.js
│   ├── cron/
│   │   └── cronJob.js          # Daily cron logic (steps 0–10 + weekly AI report)
│   ├── models/
│   │   ├── BaseModel.js        # Collection plumbing every model inherits
│   │   ├── OrderedModel.js     # BaseModel + collection-wide priority ordering
│   │   ├── Header.js
│   │   ├── Task.js             # ECD validation lives here
│   │   ├── Event.js            # Reusable task bundles (templates)
│   │   ├── LifeEvent.js        # Annually recurring life events (cron adds them to the todo)
│   │   ├── Affirmation.js      # Daily short lines (independent of tasks)
│   │   ├── Call.js             # Biweekly/monthly call reminders (independent of tasks)
│   │   ├── Goal.js             # Habit backlogs built one step at a time
│   │   ├── Project.js          # Long-term projects with ordered task lists
│   │   ├── Archive.js          # TaskArchive event log
│   │   ├── ArchiveSummary.js   # Permanent monthly roll-ups (cron step 10)
│   │   ├── Insight.js          # Stored AI reports (weekly)
│   │   └── InsightStats.js     # Nightly stats snapshot: streaks, rates (no AI)
│   ├── services/
│   │   ├── headerOrder.js      # Server-owned project↔header ordering
│   │   └── insightsService.js  # Stats computation + snapshot + Anthropic API call
│   ├── utils/                  # Shared rules — see wiki/Home.md
│   │   ├── collections.js      # The -Test collection switch
│   │   ├── documents.js        # Read/update/delete by string _id
│   │   ├── ordering.js         # Undone first, done last (+ comparators)
│   │   ├── priority.js         # The contiguous 0..n-1 invariant
│   │   ├── validate.js         # Field rules + the partial-update payload
│   │   ├── http.js             # Route wrapper: 400/404/500 and what gets logged
│   │   ├── dates.js            # UTC calendar arithmetic
│   │   └── stats.js            # The arithmetic behind the insights numbers
│   ├── middleware/
│   └── routes/
│       ├── headerRoutes.js
│       ├── taskRoutes.js
│       ├── eventRoutes.js
│       ├── lifeEventRoutes.js
│       ├── affirmationRoutes.js
│       ├── callRoutes.js
│       ├── goalRoutes.js
│       ├── projectRoutes.js
│       ├── archiveRoutes.js
│       └── insightRoutes.js
├── tests/                      # Jest test suite
├── wiki/                       # Utility-layer wiki (start at Home.md)
├── scripts/
│   └── cleartest.js            # Wipe test collections
├── .env
└── package.json
```

## Wiki

`wiki/` documents the shared utility layer — what each helper guarantees, which
call sites use it, and how to add a new resource with it. Start at
[`wiki/Home.md`](wiki/Home.md).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```
   MONGO_URI=mongodb+srv://<user>:<password>@cluster0.znyjnot.mongodb.net/?appName=Cluster0
   PORT=3002
   NODE_ENV=development
   USE_TEST_DB=false
   GEMINI_API_KEY=...
   ```

3. Replace `<user>` and `<password>` with your MongoDB Atlas credentials, and set `GEMINI_API_KEY` to a key from [Google AI Studio](https://aistudio.google.com/apikey) (required for AI insight reports; everything else works without it).

## Running the Application

### Development (auto-restart via nodemon)

```bash
npm run dev
```

### Production

```bash
npm start
```

Server listens on **port 3002** by default.

## Environment Variables

| Variable      | Default       | Description                                            |
| ------------- | ------------- | ------------------------------------------------------ |
| `MONGO_URI`   | —             | MongoDB connection string (required)                   |
| `PORT`        | `3002`        | HTTP port                                              |
| `NODE_ENV`    | `development` | `development` / `production` / `test`                  |
| `USE_TEST_DB` | `false`       | `true` → use `*-Test` collections (Headers, Tasks, Events, LifeEvents, Affirmations, Calls, Goals, Projects, TaskArchive, ArchiveSummary, Insights, InsightStats) |
| `GEMINI_API_KEY` | —          | Google Gemini API key for AI insight generation (optional; insights are skipped without it) |
| `GEMINI_MODEL` | `gemini-3.7-flash` | Which Gemini model writes the weekly report. Read per call, so a restart switches it — no deploy. Set to `gemini-3.1-pro-preview` once billing is enabled (Pro has no free-tier quota) |
| `ARCHIVE_RETENTION_DAYS` | `30` | How long raw `TaskArchive` events survive before cron step 10 folds them into `ArchiveSummary` and deletes them. Clamped **up** to the 28-day insights window — a smaller value is logged and ignored |

## API Endpoints

### System

| Method | Path        | Description                       |
| ------ | ----------- | --------------------------------- |
| `GET`  | `/`         | API status                        |
| `GET`  | `/health`   | Health check                      |
| `GET`  | `/api-docs` | Interactive Swagger documentation |

### Headers

| Method   | Path           | Description                               |
| -------- | -------------- | ----------------------------------------- |
| `GET`    | `/headers`     | List all headers (sorted by priority)     |
| `POST`   | `/headers`     | Create a header (optional `projectId` links it to a project and places it in the project block; idempotent per project) |
| `PUT`    | `/headers/:id` | Update header name and/or priority        |
| `DELETE` | `/headers/:id` | Delete header and all its tasks (cascade) |

### Tasks

| Method   | Path         | Description                                     |
| -------- | ------------ | ----------------------------------------------- |
| `GET`    | `/tasks`     | List tasks for a header (`?headerId=` required) |
| `POST`   | `/tasks`     | Create a task                                   |
| `PUT`    | `/tasks/:id` | Update task fields, done status, or priority (optional `{ reason }` archived on a postpone) |
| `DELETE` | `/tasks/:id` | Delete a task (optional `{ reason }`; archived for undone tasks) |

### Events

| Method   | Path          | Description                                     |
| -------- | ------------- | ----------------------------------------------- |
| `GET`    | `/events`     | List all event templates (sorted by name)       |
| `POST`   | `/events`     | Create an event (`{ name, tasks: [string] }`)   |
| `PUT`    | `/events/:id` | Update event name and/or task list              |
| `DELETE` | `/events/:id` | Delete an event template (created tasks remain) |

### Life Events

| Method   | Endpoint          | Description                                                   |
| -------- | ----------------- | ------------------------------------------------------------- |
| `GET`    | `/lifeevents`     | List all life events (sorted by priority)                     |
| `POST`   | `/lifeevents`     | Create a life event (`{ name, date: "D/M" }`)                 |
| `PUT`    | `/lifeevents/:id` | Update name, date, done, todoTaskId and/or priority           |
| `DELETE` | `/lifeevents/:id` | Delete a life event (this year's todo task, if any, remains)  |

### Affirmations

| Method   | Path                | Description                                          |
| -------- | ------------------- | ---------------------------------------------------- |
| `GET`    | `/affirmations`     | List all affirmations (sorted by createdAt, order added) |
| `POST`   | `/affirmations`     | Create an affirmation (`{ name }`)                   |
| `PUT`    | `/affirmations/:id` | Update an affirmation's name                         |
| `DELETE` | `/affirmations/:id` | Delete an affirmation                                |

### Calls

| Method   | Path         | Description                                                     |
| -------- | ------------ | --------------------------------------------------------------- |
| `GET`    | `/calls`     | List all calls (sorted by createdAt, order added)               |
| `POST`   | `/calls`     | Create a call (`{ name, frequency: "biweekly" \| "monthly" }`)  |
| `PUT`    | `/calls/:id` | Update a call's name, frequency, and/or done state              |
| `DELETE` | `/calls/:id` | Delete a call                                                   |

### Goals

| Method   | Path         | Description                                                     |
| -------- | ------------ | --------------------------------------------------------------- |
| `GET`    | `/goals`     | List all goals (sorted by priority)                             |
| `POST`   | `/goals`     | Create a goal (`{ name, steps?: [{ name, status?, days? }] }`)  |
| `PUT`    | `/goals/:id` | Update goal name, steps and/or priority (steps replaced wholesale) |
| `DELETE` | `/goals/:id` | Delete a goal (created tasks remain)                            |

### Projects

| Method   | Path            | Description                                                     |
| -------- | --------------- | --------------------------------------------------------------- |
| `GET`    | `/projects`     | List all projects (sorted by priority)                          |
| `POST`   | `/projects`     | Create a project (`{ name, tasks?: [{ name, notes?, date?, done?, todoTaskId? }] }`) |
| `PUT`    | `/projects/:id` | Update project name, tasks (replaced wholesale) and/or priority |
| `DELETE` | `/projects/:id` | Delete a project (its todo header survives, unlinked) (created todo tasks remain)                    |

### Cron

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| `POST` | `/cron/run`     | Manually trigger the cron job (accepts `date` override and `skipInsights` flag) |
| `GET`  | `/cron/run`     | Manually trigger the cron job (no body needed)          |
| `GET`  | `/cron/status`  | Stats from the most recent cron run                     |
| `GET`  | `/cron/details` | Stats from the most recent cron run (alias for status)  |

### Archive & Insights

| Method | Path                 | Description                                                        |
| ------ | -------------------- | ------------------------------------------------------------------ |
| `GET`  | `/archive`           | Raw task-history events (`?days=28&type=habit_result` optional)    |
| `GET`  | `/archive/summary`   | Permanent monthly roll-ups, oldest first (history past the retention window) |
| `GET`  | `/insights/stats`    | Exact computed stats: habit rates, streaks, slippage, reschedules  |
| `GET`  | `/insights/stats/latest` | The nightly cron's stored stats snapshot (same shape + `computedAt`) |
| `GET`  | `/insights/latest`   | Most recent AI insight report                                      |
| `GET`  | `/insights/history`  | Recent AI reports, newest first (`?limit=14`)                      |
| `POST` | `/insights/generate` | Generate a fresh AI report now (`{days}` optional, default 28)     |

For full request/response schemas, error codes, and examples see [API_REFERENCE.md](API_REFERENCE.md).

## API Documentation

Once the server is running, interactive docs are available at:

**http://localhost:3002/api-docs**

## Testing

Tests use `USE_TEST_DB=true` so they operate on isolated `*-Test` collections and never touch production data.

### Run all tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Run a specific test file

```bash
USE_TEST_DB=true NODE_ENV=test npx jest tests/crud.test.js --forceExit
```

### Clear test collections (`Headers-Test`, `Tasks-Test`, etc.)

```bash
npm run cleartest
```

### Test files

| File                     | Coverage area                                              |
| ------------------------ | ---------------------------------------------------------- |
| `crud.test.js`           | Basic CRUD for headers and tasks                           |
| `events.test.js`         | Events CRUD, validation, trimming, and sorting             |
| `lifeevents.test.js`     | Life Events CRUD, date validation, lastAddedYear baselining, priority moves |
| `affirmations.test.js`   | Affirmations CRUD, validation, trimming, and sorting       |
| `calls.test.js`          | Calls CRUD, validation, doneAt lifecycle, and sorting      |
| `goals.test.js`          | Goals CRUD, step status/days validation, trimming, and priority ordering |
| `projects.test.js`       | Projects CRUD, task validation, dated-first/done-last task sorting, priority moves, project↔header ordering cascades |
| `business-logic.test.js` | Priority reordering, done/undone toggling                  |
| `ecd-validation.test.js` | ECD type/value validation rules                            |
| `cron-api.test.js`       | `/cron/run`, `/cron/details`, and `/cron/status` endpoints (incl. the nightly stats snapshot and the Friday report gate) |
| `chron.test.js`          | Cron step logic (recurring resets, short-month resolution, delete, empty-header deletion + project header order, life event add/complete, task reorder, call resets, project task sync) |
| `collections.test.js`    | Test/production collection switching                       |
| `error-handling.test.js` | 400/404/500 error responses                                |
| `archive.test.js`        | TaskArchive event log: cron archiving, reschedule + deletion logging, `GET /archive` |
| `insights.test.js`       | Stats computation (incl. deletions, on-time vs late), the weekly Friday report gate, and the four `/insights` endpoints |
| `done-at.test.js`        | `doneAt` lifecycle (set on done, cleared on undo/cron reset) |
| `system.test.js`         | `GET /` and `GET /health` endpoints                        |
| `utils.test.js`          | The shared utility layer: ordering, priority arithmetic, collection/document helpers, validation, the route wrapper, UTC dates, stats maths |

## Notes

- `.env` is gitignored — never commit credentials
- `headerId` is immutable after task creation
- Priority values are 0-based and always kept contiguous by the model layer (`src/utils/priority.js` — see [`wiki/Priority.md`](wiki/Priority.md))
- Cron runs daily at UTC midnight via `node-cron` (`Etc/UTC` timezone) with a UTC setInterval fallback
- Tasks carry a `doneAt` timestamp (set when marked done, cleared on undo/reset); ECD changes are logged to `TaskArchive` as `task_rescheduled` events — a postpone (one-time date pushed later) can carry an optional `reason`, and the AI treats a reason-less postpone as procrastination but a valid reason as a legitimate deferral. Manually deleting an **undone** task logs a `task_deleted` event with the user's `reason` (surfaced to AI insights as `deletionInsights`)
- The archive is bounded: cron step 10 summarises raw events older than `ARCHIVE_RETENTION_DAYS` into monthly `ArchiveSummary` documents and then deletes them. Monthly totals are kept forever, **per-day detail is not recoverable once pruned**, and `GET /archive?days=` can only ever return what is still inside the window
- Insight generation runs at the end of a cron run when `GEMINI_API_KEY` is set (skipped in tests) — but only on **Fridays** (UTC) and only once per Friday; every other run reports `insightGenerated: false` with `insightSkipped: "not-due"`. Archive writes never throw, so they can't break task operations
