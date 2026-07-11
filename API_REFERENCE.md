# TaskAtHand API Reference

**Base URL:** `http://localhost:3002`

**API Docs (Swagger UI):** `http://localhost:3002/api-docs`

The API is organized around four collections: **Headers** and **Tasks** (the live todo data), **TaskArchive** (append-only history written by the cron and the Task model), and **Insights** (stored AI coaching reports). Headers are top-level containers; Tasks belong to a Header and are scoped to it.

---

## Data Models

### Header

```typescript
interface Header {
  _id: string; // MongoDB ObjectId
  name: string; // Header name (required)
  priority: number; // 0-based global priority (0 = highest); auto-managed
}
```

### ECD (Expected Completion Date)

ECD is an optional structured object on Tasks. Four types are supported:

| Type           | `value` format                                                                   | Example                                              |
| -------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `date`         | `"YYYY-MM-DD"` string                                                            | `{ "type": "date", "value": "2026-06-01" }`          |
| `day_of_week`  | Non-empty array of `"Mon"`, `"Tue"`, `"Wed"`, `"Thu"`, `"Fri"`, `"Sat"`, `"Sun"` | `{ "type": "day_of_week", "value": ["Mon", "Wed"] }` |
| `day_of_month` | Non-empty array of integers `1–31`                                               | `{ "type": "day_of_month", "value": [1, 15] }`       |
| `day_of_year`  | `"D/M/YYYY"` string                                                              | `{ "type": "day_of_year", "value": "25/12/2026" }`   |

Set `ecd` to `null` to clear it.

### Task

```typescript
interface Task {
  _id: string; // MongoDB ObjectId
  name: string; // Task name (required)
  notes: string; // Additional notes (default: "")
  headerId: string; // Parent Header ObjectId (required, immutable)
  priority: number; // 0-based priority within the header; auto-managed
  done: boolean; // Completion status (default: false)
  doneAt: string | null; // When the task was marked done; cleared on undo/cron reset
  ecd: ECD | null; // Expected Completion Date (optional)
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

**Priority rules:**

- Undone tasks always occupy the lower priority numbers (appear first).
- Done tasks are sorted after all undone tasks.
- When a task is marked done, it is moved to the last position in its header.
- When a task is marked undone, it is inserted just before the first done task.
- New tasks are inserted at the position just before the first done task.

---

### Event

```typescript
interface Event {
  _id: string; // MongoDB ObjectId
  name: string; // Event name (required), e.g. "Burger Night"
  tasks: string[]; // Task names bundled by this event (non-empty)
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Events are reusable task bundles. They are templates only — scheduling an
event is done client-side by creating Tasks (with a `date` ECD) under a
header named after the event (reused when one already exists, created
otherwise, so later additions join the same header). Deleting an event never
touches created headers or tasks.

---

## Error Response Format

All errors return a JSON object with an `error` field:

```json
{ "error": "Descriptive error message" }
```

Server errors in development mode also include a `message` field:

```json
{ "error": "Failed to create task", "message": "..." }
```

---

## System Endpoints

### `GET /`

Returns API status.

**Response `200`:**

```json
{
  "message": "TaskAtHand API is running",
  "environment": "development",
  "docs": "/api-docs"
}
```

---

### `GET /health`

Health check.

**Response `200`:**

```json
{ "status": "ok", "timestamp": "2026-03-26T00:00:00.000Z" }
```

---

## Headers API

Base path: `/headers`

### `GET /headers`

Returns all headers sorted by `priority` ascending.

**Response `200`:**

```json
[
  { "_id": "...", "name": "Work", "priority": 0 },
  { "_id": "...", "name": "Personal", "priority": 1 }
]
```

---

### `POST /headers`

Creates a new header. Priority is automatically assigned as the last position (appended to the end).

**Request Body:**

```json
{
  "name": "Work"
}
```

| Field  | Required | Type   | Notes              |
| ------ | -------- | ------ | ------------------ |
| `name` | Yes      | string | Non-empty; trimmed |

**Response `201`:**

```json
{ "_id": "...", "name": "Work", "priority": 0 }
```

**Error `400`:**

```json
{ "error": "Header name must be a non-empty string" }
```

---

### `PUT /headers/:id`

Updates a header's `name` and/or `priority`. Both fields are optional. When `priority` changes, adjacent headers are automatically shifted to keep priorities contiguous.

**Request Body:**

```json
{
  "name": "Work Projects",
  "priority": 0
}
```

| Field      | Required | Type    | Notes                                 |
| ---------- | -------- | ------- | ------------------------------------- |
| `name`     | No       | string  | Non-empty; trimmed                    |
| `priority` | No       | integer | 0-based; must be within current range |

**Response `200`:** Updated header object.

**Error `400` — invalid name:**

```json
{ "error": "Header name must be a non-empty string" }
```

**Error `400` — priority not a non-negative integer:**

```json
{ "error": "Priority must be a non-negative integer" }
```

**Error `400` — priority out of range:**

```json
{ "error": "Priority must be between 0 and 2" }
```

**Error `404`:**

```json
{ "error": "Header not found" }
```

---

### `DELETE /headers/:id`

Deletes a header and **all of its tasks** (cascade delete). Remaining headers are shifted to keep priorities contiguous.

**Response `200`:**

```json
{ "deleted": "<headerId>", "tasksDeleted": 4 }
```

**Error `404`:**

```json
{ "error": "Header not found" }
```

---

## Tasks API

Base path: `/tasks`

### `GET /tasks?headerId=:headerId`

Returns all tasks for the specified header, sorted by `priority` ascending (undone tasks first, then done).

**Query Parameters:**

| Parameter  | Required | Description                   |
| ---------- | -------- | ----------------------------- |
| `headerId` | Yes      | ObjectId of the parent Header |

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Write report",
    "notes": "",
    "headerId": "...",
    "priority": 0,
    "done": false,
    "ecd": { "type": "date", "value": "2026-04-01" },
    "createdAt": "2026-03-20T10:00:00.000Z",
    "updatedAt": "2026-03-20T10:00:00.000Z"
  }
]
```

**Error `400` — missing headerId:**

```json
{ "error": "headerId query parameter is required" }
```

**Error `404` — header not found:**

```json
{ "error": "Header not found" }
```

---

### `POST /tasks`

Creates a new task. Automatically inserted just before the first done task in the header (`priority = undoneCount`). All existing done tasks in the header are shifted down by 1.

**Request Body:**

```json
{
  "name": "Write report",
  "notes": "Include Q1 figures",
  "headerId": "<ObjectId>",
  "ecd": { "type": "date", "value": "2026-04-01" }
}
```

| Field      | Required | Type                 | Notes                             |
| ---------- | -------- | -------------------- | --------------------------------- |
| `name`     | Yes      | string               | Non-empty                         |
| `headerId` | Yes      | string               | Must reference an existing Header |
| `notes`    | No       | string               | Default `""`                      |
| `ecd`      | No       | ECD object or `null` | Default `null`                    |

**Response `201`:** Created task object.

**Error `400` — missing/invalid name:**

```json
{ "error": "Task name must be a non-empty string" }
```

**Error `400` — missing headerId:**

```json
{ "error": "headerId is required" }
```

**Error `400` — invalid ECD:**

```json
{
  "error": "ecd.type must be one of: date, day_of_week, day_of_month, day_of_year"
}
```

**Error `404` — header not found:**

```json
{ "error": "Header not found" }
```

---

### `PUT /tasks/:id`

Updates a task. All body fields are optional — send only what needs to change.

| Field      | Type                 | Notes                                 |
| ---------- | -------------------- | ------------------------------------- |
| `name`     | string               | Non-empty                             |
| `notes`    | string               | Any string                            |
| `ecd`      | ECD object or `null` | Validated; `null` clears it           |
| `done`     | boolean              | Triggers automatic priority reorder   |
| `priority` | integer              | Manual reorder within header; 0-based |

> `headerId` is **not** updatable after creation.

> Changing `ecd` also logs a `task_rescheduled` event to the TaskArchive (with a `pushedLater` flag when a one-time date moves later). Toggling `done` sets/clears `doneAt`.

**Request Body (mark done):**

```json
{ "done": true }
```

**Request Body (update name + ECD):**

```json
{
  "name": "Submit report",
  "ecd": { "type": "day_of_week", "value": ["Mon", "Fri"] }
}
```

**Response `200`:** Updated task object.

**Error `400` — invalid name:**

```json
{ "error": "Task name must be a non-empty string" }
```

**Error `400` — invalid done type:**

```json
{ "error": "done must be a boolean" }
```

**Error `400` — priority not a non-negative integer:**

```json
{ "error": "Priority must be a non-negative integer" }
```

**Error `400` — priority out of range:**

```json
{ "error": "Priority must be between 0 and 5" }
```

**Error `400` — invalid ECD:**

```json
{ "error": "ecd.value for type \"date\" must be a YYYY-MM-DD string" }
```

**Error `404`:**

```json
{ "error": "Task not found" }
```

---

### `DELETE /tasks/:id`

Deletes a task. Remaining tasks in the same header are shifted to keep priorities contiguous.

**Response `200`:**

```json
{ "deleted": "<taskId>" }
```

**Error `404`:**

```json
{ "error": "Task not found" }
```

---

## Events API

Base path: `/events`

### `GET /events`

Returns all events sorted by `name` ascending.

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Burger Night",
    "tasks": ["Procure onion", "Procure bun", "Procure patty"],
    "createdAt": "2026-07-10T00:00:00.000Z",
    "updatedAt": "2026-07-10T00:00:00.000Z"
  }
]
```

---

### `POST /events`

Creates a new event template.

**Request Body:**

```json
{
  "name": "Burger Night",
  "tasks": ["Procure onion", "Procure bun", "Procure patty"]
}
```

| Field   | Required | Type     | Notes                                            |
| ------- | -------- | -------- | ------------------------------------------------ |
| `name`  | Yes      | string   | Non-empty; trimmed                               |
| `tasks` | Yes      | string[] | Non-empty array of non-empty strings; trimmed    |

**Response `201`:** the created event.

**Error `400`:**

```json
{ "error": "tasks must be a non-empty array of strings" }
```

---

### `PUT /events/:id`

Updates an event's `name` and/or `tasks`. Both fields are optional but must
pass the same validation as `POST /events` when present.

**Response `200`:** the updated event.
**Error `404`:** event not found.

---

### `DELETE /events/:id`

Deletes an event template. Tasks previously added to the todo are untouched.

**Response `200`:**

```json
{ "deleted": "..." }
```

**Error `404`:** event not found.

---

## Cron Job

The cron job runs daily at UTC midnight (scheduled via `node-cron` in the `Etc/UTC` timezone) and performs the following steps to maintain task state and history.

### Cron Steps

| Step | Trigger            | Action                                                                          |
| ---- | ------------------ | ------------------------------------------------------------------------------- |
| 0    | Every day          | Archive **yesterday's** habit (`day_of_week`) and recurring (`day_of_month` / `day_of_year`) outcomes to TaskArchive (idempotent per dueDate) |
| 1    | 1st of every month | Clamp `day_of_month` ECD values that exceed the month's maximum days            |
| 2    | January 1st only   | Advance `day_of_year` ECDs by 1 year and mark those tasks undone                |
| 3    | Every day          | Mark tasks with a `day_of_week` ECD matching today as undone (`doneAt` cleared) |
| 4    | Every day          | Mark tasks with a `day_of_month` ECD containing today's date as undone (`doneAt` cleared) |
| 5    | Every day          | Archive then delete tasks that are **done** and have a `date` ECD or no ECD     |
| 6    | Every day          | Re-sort undone tasks within each header by next upcoming ECD timestamp          |
| 7    | Every day          | Generate the daily AI insight report (requires `ANTHROPIC_API_KEY`; skipped in tests; failure never fails the run) |

All date operations in the cron run in UTC.

### `GET /cron/status`

Returns stats from the most recent cron run.

**Response `200`:**

```json
{
  "lastRanAt": "2026-01-01T00:00:00.000Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 3,
  "tasksClamped": 1,
  "headersReordered": 4
}
```

**Error `404`** — cron has never run:

```json
{ "error": "Cron has not run yet" }
```

---

### `POST /cron/run`

Manually triggers the cron job with an optional date override in the request body.

**Request Body:**

```json
{
  "date": "2026-01-01"
}
```

| Field  | Required | Notes                                    |
| ------ | -------- | ---------------------------------------- |
| `date` | No       | ISO date string; defaults to today (UTC) |

**Response `200`:**

```json
{
  "ranAt": "2026-01-01T00:00:00.000Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 3,
  "tasksClamped": 1,
  "headersReordered": 4,
  "outcomesArchived": 5,
  "insightGenerated": true
}
```

**Error `500`:**

```json
{ "error": "..." }
```

---

### `GET /cron/run`

Manually triggers the cron job. No request body needed.

**Response `200`:**

```json
{
  "ranAt": "2026-01-01T00:00:00.000Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 3,
  "tasksClamped": 1,
  "headersReordered": 4,
  "outcomesArchived": 5,
  "insightGenerated": true
}
```

**Error `500`:**

```json
{ "error": "..." }
```

---

### `GET /cron/details`

Returns stats from the most recent cron run. Alias for `GET /cron/status`.

**Response `200`:**

```json
{
  "lastRanAt": "2026-01-01T00:00:00.000Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 3,
  "tasksClamped": 1,
  "headersReordered": 4
}
```

**Error `404`** — cron has never run:

```json
{ "error": "Cron has not run yet" }
```

---

## Archive API

Base path: `/archive`

### `GET /archive?days=28&type=habit_result`

Returns raw TaskArchive events for the period, oldest first.

**Query Parameters:**

| Parameter | Required | Description                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `days`    | No       | How many days back to fetch (default 28, max 365)                            |
| `type`    | No       | Filter: `habit_result`, `task_result`, `task_completed`, `task_rescheduled`  |

**Response `200`:**

```json
[
  {
    "_id": "...",
    "type": "habit_result",
    "taskId": "...",
    "taskName": "Meditate",
    "headerId": "...",
    "headerName": "Health",
    "scheduledDays": ["Mon", "Wed", "Fri"],
    "dueDate": "2026-07-03",
    "completed": true,
    "doneAt": "2026-07-03T14:05:00.000Z",
    "at": "2026-07-04T00:00:01.000Z"
  }
]
```

---

## Insights API

Base path: `/insights`

### `GET /insights/stats?days=28`

Exact computed stats over the archive — no AI involved. Returns per-habit completion rates, current/longest streaks, missed-by-weekday counts, one-time-task slippage, reschedule counts, and per-header rollups.

**Response `200`** (abridged):

```json
{
  "periodDays": 28,
  "eventCount": 42,
  "habits": [
    {
      "taskName": "Meditate",
      "headerName": "Health",
      "scheduledDays": ["Mon", "Wed", "Fri"],
      "scheduled": 12,
      "completed": 10,
      "completionRate": 83,
      "currentStreak": 4,
      "longestStreak": 7,
      "missedByDow": { "Fri": 2 },
      "recentResults": [{ "dueDate": "2026-07-03", "completed": true }]
    }
  ],
  "recurringTasks": [],
  "oneTimeTasks": { "completedCount": 9, "avgSlippageDays": 1.4, "recent": [] },
  "reschedules": [
    { "taskName": "Write blog", "headerName": "Health", "total": 3, "pushedLater": 3 }
  ],
  "byHeader": { "Health": { "completed": 19, "missed": 2, "reschedules": 3 } }
}
```

---

### `GET /insights/latest`

Most recent stored AI report.

**Response `200`:**

```json
{
  "_id": "...",
  "generatedAt": "2026-07-04T00:00:46.000Z",
  "periodDays": 28,
  "model": "claude-opus-4-8",
  "stats": { "...": "stats the report was based on" },
  "report": {
    "summary": "string",
    "habitsOnTrack": ["string"],
    "habitsSlipping": ["string"],
    "taskInsights": ["string"],
    "procrastinationFlags": ["string"],
    "suggestions": ["string"]
  }
}
```

**Error `404`:**

```json
{ "error": "No insight report generated yet" }
```

---

### `GET /insights/history?limit=14`

Recent AI reports, newest first. `limit` defaults to 14 (max 100).

**Response `200`:** Array of insight objects (same shape as `/insights/latest`).

---

### `POST /insights/generate`

Generates a fresh AI report now and stores it.

**Request Body (optional):**

```json
{ "days": 28 }
```

**Response `201`:** The stored insight object.

**Error `404`** — archive is empty:

```json
{ "error": "No archive data to analyze yet — complete some tasks and let the nightly cron run first" }
```

**Error `503`** — no API key configured:

```json
{ "error": "ANTHROPIC_API_KEY is not configured on the server" }
```

---

## ECD Validation Rules

| Type           | Valid `value`                              | Invalid examples               |
| -------------- | ------------------------------------------ | ------------------------------ |
| `date`         | `"YYYY-MM-DD"` string                      | `"2026/04/01"`, `"April 1"`    |
| `day_of_week`  | Non-empty array of valid day abbreviations | `[]`, `["Monday"]`, `["mon"]`  |
| `day_of_month` | Non-empty array of integers `1–31`         | `[0]`, `[32]`, `["1"]`         |
| `day_of_year`  | `"D/M/YYYY"` string                        | `"2026-04-01"`, `"01/04/2026"` |

Valid day abbreviations: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`

---

## Collections

| Environment               | Headers        | Tasks        | Events        | Archive            | Insights        |
| ------------------------- | -------------- | ------------ | ------------- | ------------------ | --------------- |
| Production                | `Headers`      | `Tasks`      | `Events`      | `TaskArchive`      | `Insights`      |
| Test (`USE_TEST_DB=true`) | `Headers-Test` | `Tasks-Test` | `Events-Test` | `TaskArchive-Test` | `Insights-Test` |

---

## Running Tests

```bash
USE_TEST_DB=true NODE_ENV=test npx jest --forceExit --runInBand
```
