# TaskAtHand Backend

Node.js/Express REST API backend for the TaskAtHand application, backed by MongoDB. Organises tasks into user-defined **Headers** with priority ordering, optional Expected Completion Dates (ECD), and a daily cron job for automated task maintenance.

## Features

- **Headers & Tasks** — two-collection data model with automatic, contiguous priority management
- **Events** — reusable task bundles (e.g. "Burger Night" with its shopping list); clients schedule them as dated tasks under a header named after the event (reused if it exists, created otherwise)
- **ECD system** — four ECD types (`date`, `day_of_week`, `day_of_month`, `day_of_year`) with full validation
- **Daily cron job** — archives yesterday's outcomes, auto-resets recurring tasks, cleans up expired ones, re-sorts by upcoming ECD, and generates the daily AI report (all in UTC)
- **Task archive** — append-only `TaskArchive` event log: habit hit/miss results, completed-task history (with planned vs. done dates), and reschedule tracking
- **AI insights** — daily coaching report (habits on track/slipping, procrastination flags, suggestions) generated via the Anthropic API (`claude-opus-4-8`) and stored in the `Insights` collection
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
│   │   └── insightController.js
│   ├── cron/
│   │   └── cronJob.js          # Daily cron logic (steps 0–6 + AI report)
│   ├── models/
│   │   ├── Header.js
│   │   ├── Task.js             # ECD validation lives here
│   │   ├── Event.js            # Reusable task bundles (templates)
│   │   ├── Archive.js          # TaskArchive event log
│   │   └── Insight.js          # Stored AI reports
│   ├── services/
│   │   └── insightsService.js  # Stats computation + Anthropic API call
│   ├── middleware/
│   └── routes/
│       ├── headerRoutes.js
│       ├── taskRoutes.js
│       ├── eventRoutes.js
│       ├── archiveRoutes.js
│       └── insightRoutes.js
├── tests/                      # Jest test suite
├── scripts/
│   └── cleartest.js            # Wipe test collections
├── .env
└── package.json
```

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
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Replace `<user>` and `<password>` with your MongoDB Atlas credentials, and set `ANTHROPIC_API_KEY` to a key from [platform.claude.com](https://platform.claude.com) (required for AI insight reports; everything else works without it).

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
| `USE_TEST_DB` | `false`       | `true` → use `*-Test` collections (Headers, Tasks, Events, TaskArchive, Insights) |
| `ANTHROPIC_API_KEY` | —       | Anthropic API key for AI insight generation (optional; insights are skipped without it) |

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
| `POST`   | `/headers`     | Create a header                           |
| `PUT`    | `/headers/:id` | Update header name and/or priority        |
| `DELETE` | `/headers/:id` | Delete header and all its tasks (cascade) |

### Tasks

| Method   | Path         | Description                                     |
| -------- | ------------ | ----------------------------------------------- |
| `GET`    | `/tasks`     | List tasks for a header (`?headerId=` required) |
| `POST`   | `/tasks`     | Create a task                                   |
| `PUT`    | `/tasks/:id` | Update task fields, done status, or priority    |
| `DELETE` | `/tasks/:id` | Delete a task                                   |

### Events

| Method   | Path          | Description                                     |
| -------- | ------------- | ----------------------------------------------- |
| `GET`    | `/events`     | List all event templates (sorted by name)       |
| `POST`   | `/events`     | Create an event (`{ name, tasks: [string] }`)   |
| `PUT`    | `/events/:id` | Update event name and/or task list              |
| `DELETE` | `/events/:id` | Delete an event template (created tasks remain) |

### Cron

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| `POST` | `/cron/run`     | Manually trigger the cron job (accepts `date` override) |
| `GET`  | `/cron/run`     | Manually trigger the cron job (no body needed)          |
| `GET`  | `/cron/status`  | Stats from the most recent cron run                     |
| `GET`  | `/cron/details` | Stats from the most recent cron run (alias for status)  |

### Archive & Insights

| Method | Path                 | Description                                                        |
| ------ | -------------------- | ------------------------------------------------------------------ |
| `GET`  | `/archive`           | Raw task-history events (`?days=28&type=habit_result` optional)    |
| `GET`  | `/insights/stats`    | Exact computed stats: habit rates, streaks, slippage, reschedules  |
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
| `business-logic.test.js` | Priority reordering, done/undone toggling                  |
| `ecd-validation.test.js` | ECD type/value validation rules                            |
| `cron-api.test.js`       | `/cron/run`, `/cron/details`, and `/cron/status` endpoints |
| `chron.test.js`          | Cron step logic (clamp, reset, delete, reorder)            |
| `collections.test.js`    | Test/production collection switching                       |
| `error-handling.test.js` | 400/404/500 error responses                                |

## Notes

- `.env` is gitignored — never commit credentials
- `headerId` is immutable after task creation
- Priority values are 0-based and always kept contiguous by the model layer
- Cron runs daily at UTC midnight via `node-cron` (`Etc/UTC` timezone) with a UTC setInterval fallback
- Tasks carry a `doneAt` timestamp (set when marked done, cleared on undo/reset); ECD changes are logged to `TaskArchive` as `task_rescheduled` events
- Insight generation runs at the end of each cron run when `ANTHROPIC_API_KEY` is set (skipped in tests); archive writes never throw, so they can't break task operations
