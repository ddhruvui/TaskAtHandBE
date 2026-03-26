# TaskAtHand API Reference

**Base URL:** `http://localhost:3002`

**API Docs (Swagger UI):** `http://localhost:3002/api-docs`

The API is organized around two collections: **Headers** and **Tasks**. Headers are top-level containers; Tasks belong to a Header and are scoped to it.

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

**Error `400` — invalid priority:**

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

## Cron Job

The cron job runs daily at UTC midnight and performs 6 steps to maintain task state.

### Cron Steps

| Step | Trigger            | Action                                                                 |
| ---- | ------------------ | ---------------------------------------------------------------------- |
| 1    | 1st of every month | Clamp `day_of_month` ECD values that exceed the month's maximum days   |
| 2    | January 1st only   | Advance `day_of_year` ECDs by 1 year                                   |
| 3    | Every day          | Mark tasks with a `day_of_week` ECD matching today as undone           |
| 4    | 1st of month       | Mark tasks with a `day_of_month` ECD containing today's date as undone |
| 5    | Every day          | Delete tasks with a `date` ECD that has passed (past or today)         |
| 6    | Every day          | Re-sort undone tasks within each header by next upcoming ECD timestamp |

All date operations in the cron run in UTC.

### `POST /cron/run`

Manually triggers the cron job. Accepts an optional date override.

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
{ "success": true, "message": "Cron job executed" }
```

**Error `500`:**

```json
{ "success": false, "error": "..." }
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

| Environment               | Headers Collection | Tasks Collection |
| ------------------------- | ------------------ | ---------------- |
| Production                | `Headers`          | `Tasks`          |
| Test (`USE_TEST_DB=true`) | `Headers-Test`     | `Tasks-Test`     |

---

## Running Tests

```bash
USE_TEST_DB=true NODE_ENV=test npx jest --forceExit --runInBand
```
