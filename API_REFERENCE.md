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
  projectId: string | null; // _id of the long-term project this header mirrors
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

### LifeEvent

```typescript
interface LifeEvent {
  _id: string; // MongoDB ObjectId
  name: string; // Life event name (required), e.g. "Wife's birthday"
  date: string; // "D/M" (no zero-padding, no year), e.g. "7/3" — recurs annually
  lastAddedYear: number; // Server-managed: year of the last occurrence the cron consumed
  done: boolean; // This year's occurrence completed (default: false)
  todoTaskId: string | null; // _id of the linked todo Task while one exists
  priority: number; // 0-based global priority (0 = highest); auto-managed
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Life events are dates that recur **annually** (birthdays, anniversaries).
Unlike event templates, the connection to the todo is **cron-driven**: every
year on the event's day, cron step 6 creates a one-time `date`-ECD Task named
after the event under a header named **"Events"** (reused case-insensitively
when it exists, created otherwise), links it via `todoTaskId` and resets
`done`. Clients keep `done` in sync with the linked todo task (toggling
either side flips the other; deleting the todo task or its header clears
`todoTaskId`). When the nightly cron deletes the done todo task (step 4), it
marks the life event `done: true` and clears `todoTaskId` — the task leaves
the todo but the life event is **never deleted** and fires again on its next
anniversary.

`lastAddedYear` records the year of the last occurrence the cron consumed
(the same role the year plays in `day_of_year` ECDs) and makes same-day cron
reruns idempotent. It is baselined server-side on create and on a date
change (last year while this year's occurrence is still upcoming — today
included — this year once it has passed) and must be treated as read-only by
clients. Feb 29 events fire on Feb 28 in non-leap years.

---

### Affirmation

```typescript
interface Affirmation {
  _id: string; // MongoDB ObjectId
  name: string; // Affirmation text (required), e.g. "Thank you blessing"
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Affirmations are single short lines the user reads daily. They are completely
independent of Headers and Tasks — the cron job ignores them, and no other
collection references them.

---

### Call

```typescript
type CallFrequency = "biweekly" | "monthly";

interface Call {
  _id: string; // MongoDB ObjectId
  name: string; // Person to call (required), e.g. "Grandma"
  frequency: CallFrequency; // biweekly = twice per month, monthly = once
  done: boolean; // Called this period? (default: false)
  doneAt: string | null; // When done flipped to true; cleared on undo/cron reset
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Calls are people the user must phone biweekly or monthly. They are completely
independent of Headers and Tasks (no `headerId`, no `priority`). Biweekly
calls are due twice per month (periods 1st–14th and 15th–end), monthly calls
once; cron step 8 clears the `done` checkmark at each period boundary (the
15th for biweekly, the last day of the month for both).

---

### Goal

```typescript
type GoalStepStatus = "pending" | "under_progress";
type DayOfWeek = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

interface GoalStep {
  name: string; // Step/habit name (required), e.g. "Wake up at 6"
  status: GoalStepStatus; // Defaults to "pending"
  days: DayOfWeek[]; // Weekdays the habit is expected on; defaults to all seven
}

interface Goal {
  _id: string; // MongoDB ObjectId
  name: string; // Goal name (required), e.g. "Improve Health"
  steps: GoalStep[]; // Ordered habit backlog (may be empty)
  priority: number; // Display order, contiguous 0..n-1 (new goals append at end)
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Goals are long-term aims broken into small steps/habits to build **one at a
time**. A step is either `pending` (backlog/paused) or `under_progress`
(started — a lifelong habit). The backend only stores the roadmap; the
connection to the todo is maintained client-side: starting a step creates a
recurring Task (`day_of_week`, valued with the step's `days`) under a header
named **"One Step At A Time"** (reused when one already exists, created
otherwise, mirroring how events are scheduled), pausing a step removes that
task, and deleting the task (or that header) from the todo flips the matching
steps back to `pending`. Legacy status values `active` and `achieved` are
accepted on write and normalized to `under_progress`. Deleting a goal never
touches created headers or tasks.

`days` is non-empty, deduped and sorted into week order (Sun → Sat) on write,
and defaults to all seven days when omitted — the meaning of every step stored
before the field existed. Because it becomes the task's `day_of_week` ECD, and
cron step 0 only archives a `habit_result` on days that ECD covers, it is
also what the habit's **streak is measured over**: a Mon/Wed/Fri habit keeps
its streak across an untouched Tuesday. Changing a started step's `days`
rewrites its task's ECD client-side in the same action.

---

### Project

```typescript
interface ProjectTask {
  name: string; // Task/step name (required), e.g. "get data from EODHD"
  notes: string; // Free-text notes (default: ""); the client mirrors these onto the linked todo task
  date: string | null; // "YYYY-MM-DD" target date or null (default: null)
  done: boolean; // Completion status (default: false)
  todoTaskId: string | null; // _id of the linked todo Task, or null (default: null)
}

interface Project {
  _id: string; // MongoDB ObjectId
  name: string; // Project name (required), e.g. "Automated Stock Market"
  priority: number; // 0-based global priority (0 = highest); auto-managed
  tasks: ProjectTask[]; // Ordered task list (may be empty); dated undone, then undated undone, then done
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Projects are long-term efforts (e.g. "Automated Stock Market") broken into
ordered tasks/steps (e.g. "get data from EODHD", "deploy to cpu"). Projects
carry a contiguous 0-based `priority` exactly like headers (created at the
end, moves shift neighbors, deletes close the gap), and within a project the
task list always keeps undone tasks before done tasks, and among the undone
ones dated tasks before undated ones (the server re-sorts on every write, so
marking a task done moves it to the bottom and giving a task a date lifts it
above the undated backlog; ordering inside each group is the client's, never
sorted by date value).

The todo connection is client-driven, mirroring goals/events: giving a
project task a `date` creates a one-time `date`-ECD Task in the todo under a
header named after the project (reused case-insensitively when it exists,
created otherwise) and stores its `_id` in `todoTaskId`. Marking either side
done syncs the other; editing the todo task's name or date updates the
project task too (clearing the date — or switching to a recurring ECD — sets
the project date to `null`, keeping the link), and reordering on either side
mirrors the relative order of linked tasks on the other. When the nightly
cron deletes the done todo task
(step 4), it marks the linked project task `done: true` and clears
`todoTaskId` — the task disappears from the todo but is retained in the
project as a completed step (its `date` is kept for the record). Deleting the
todo task (or its header) instead unlinks the project task: the client clears
`todoTaskId` **and** `date`, leaving it undone. Deleting a project never
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

Passing `projectId` marks the header as the todo home of that long-term project. The server then places it in the **project header block** (see [Project header ordering](#project-header-ordering)) rather than at the bottom, and the call becomes **idempotent** — if the project already has a header, or a pre-`projectId` header matches the project by name, that header is adopted and returned with `200` instead of creating a duplicate.

**Request Body:**

```json
{
  "name": "Work",
  "projectId": null
}
```

| Field       | Required | Type             | Notes                                                     |
| ----------- | -------- | ---------------- | --------------------------------------------------------- |
| `name`      | Yes      | string           | Non-empty; trimmed                                        |
| `projectId` | No       | string \| null   | Valid project id; marks this as that project's todo header |

**Response `201`** (created) **/ `200`** (existing project header reused)**:**

```json
{ "_id": "...", "name": "Work", "priority": 0, "projectId": null }
```

**Error `400`:**

```json
{ "error": "Header name must be a non-empty string" }
```

```json
{ "error": "projectId must be a valid id string or null" }
```

### Project header ordering

Headers with a `projectId` are kept in their projects' priority order as one contiguous block. When at least one ordinary header exists, the topmost one keeps priority 0 and the block starts at 1; otherwise the block starts at 0. Remaining ordinary headers keep their relative order after the block.

The server owns this rule — clients never reorder project headers themselves. It is re-applied as a single atomic update whenever:

| Event                               | Effect                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `POST /headers` with a `projectId`  | the new header is placed in the block                           |
| `PUT /projects/:id` with `priority` | the block is re-ordered to match                                |
| `PUT /projects/:id` with `name`     | the project's header is renamed                                 |
| `DELETE /projects/:id`              | its header is unlinked (`projectId: null`) and leaves the block |
| Cron step 5                         | the block is re-asserted after empty headers are deleted        |

The same pass repairs links: a header with no `projectId` whose name matches a project is backfilled, and a header pointing at a deleted project has its `projectId` cleared.

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

Deletes a header and **all of its tasks** (cascade delete). Remaining headers are shifted to keep priorities contiguous. Any **done** tasks are archived as `task_completed` events before deletion (so completion history isn't orphaned); undone tasks are removed without archiving.

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
| `reason`   | string               | Optional postpone reason (see below)  |

> `headerId` is **not** updatable after creation.

> Changing `ecd` also logs a `task_rescheduled` event to the TaskArchive (with a `pushedLater` flag when a one-time date moves later). Toggling `done` sets/clears `doneAt`.

> **`reason`** annotates a postpone. When the `ecd` change pushes a one-time date later, the (trimmed) `reason` is stored on the `task_rescheduled` event and weighed by the AI insights: a postpone with no reason (or a blank one) is treated as procrastination, a valid reason as a legitimate deferral. It is ignored for non-reschedule updates and is **never** written to the task document. A non-string `reason` returns `400`.

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

**Request body (optional):**

```ts
{
  reason?: string; // Why the task is being deleted
}
```

When the deleted task is **undone**, `reason` is stored in the archive as a `task_deleted` event and surfaced to AI insights. Clients require it for undone tasks; deleting a *done* task ignores it. Header-cascade deletes (via `DELETE /headers/:id`) do not archive per-task reasons for undone tasks, but they **do** archive each done task as a `task_completed` event so completion history isn't orphaned.

**Response `200`:**

```json
{ "deleted": "<taskId>" }
```

**Error `400`:** `reason` is present but not a string.

```json
{ "error": "reason must be a string" }
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

## Life Events API

Base path: `/lifeevents`

### `GET /lifeevents`

Returns all life events sorted by `priority` ascending.

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Wife's birthday",
    "date": "7/3",
    "lastAddedYear": 2026,
    "done": false,
    "todoTaskId": null,
    "priority": 0,
    "createdAt": "2026-07-24T00:00:00.000Z",
    "updatedAt": "2026-07-24T00:00:00.000Z"
  }
]
```

---

### `POST /lifeevents`

Creates a new life event. Priority is auto-assigned (appended at the end);
`lastAddedYear` is baselined server-side (see the data model).

**Request Body:**

```json
{ "name": "Wife's birthday", "date": "7/3" }
```

| Field  | Required | Type   | Notes                                                                       |
| ------ | -------- | ------ | --------------------------------------------------------------------------- |
| `name` | Yes      | string | Non-empty; trimmed                                                          |
| `date` | Yes      | string | `"D/M"` (trimmed, no zero-padding, no year). Month 1–12, day valid for the month; Feb 29 allowed (fires on Feb 28 in non-leap years) |

**Response `201`:** the created life event (`done: false`, `todoTaskId: null`).

**Error `400`:**

```json
{ "error": "Life event date must be a \"D/M\" string, e.g. \"7/3\"" }
```

---

### `PUT /lifeevents/:id`

Updates a life event's `name`, `date`, `done`, `todoTaskId` and/or
`priority`. All fields are optional but validated as on create when present.
A date **change** re-baselines `lastAddedYear` (a no-op date write does
not). Priority changes shift the other life events to keep contiguous
`0..n-1` order, same as projects. Clients toggle `done` here when the linked
todo task is toggled (and vice versa) so the two views agree.

**Response `200`:** the updated life event.
**Error `400`:** validation error (including out-of-range priority).
**Error `404`:** life event not found.

---

### `DELETE /lifeevents/:id`

Deletes a life event and shifts remaining life event priorities. The todo
task created from it this year (if any) is kept.

**Response `200`:**

```json
{ "deleted": "..." }
```

**Error `404`:** life event not found.

---

## Affirmations API

Base path: `/affirmations`

### `GET /affirmations`

Returns all affirmations sorted by `createdAt` ascending (order added).

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Thank you blessing",
    "createdAt": "2026-07-10T00:00:00.000Z",
    "updatedAt": "2026-07-10T00:00:00.000Z"
  }
]
```

---

### `POST /affirmations`

Creates a new affirmation.

**Request Body:**

```json
{
  "name": "Thank you blessing"
}
```

| Field  | Required | Type   | Notes              |
| ------ | -------- | ------ | ------------------ |
| `name` | Yes      | string | Non-empty; trimmed |

**Response `201`:** the created affirmation.

**Error `400`:**

```json
{ "error": "Affirmation name must be a non-empty string" }
```

---

### `PUT /affirmations/:id`

Updates an affirmation's `name`. It must pass the same validation as
`POST /affirmations`.

**Response `200`:** the updated affirmation.
**Error `400`:** invalid name.
**Error `404`:** affirmation not found.

---

### `DELETE /affirmations/:id`

Deletes an affirmation.

**Response `200`:**

```json
{ "deleted": "..." }
```

**Error `404`:** affirmation not found.

---

## Calls API

Base path: `/calls`

### `GET /calls`

Returns all calls sorted by `createdAt` ascending (order added).

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Grandma",
    "frequency": "biweekly",
    "done": false,
    "doneAt": null,
    "createdAt": "2026-07-10T00:00:00.000Z",
    "updatedAt": "2026-07-10T00:00:00.000Z"
  }
]
```

---

### `POST /calls`

Creates a new call. New calls start undone (`done: false`, `doneAt: null`).

**Request Body:**

```json
{
  "name": "Grandma",
  "frequency": "biweekly"
}
```

| Field       | Required | Type   | Notes                             |
| ----------- | -------- | ------ | --------------------------------- |
| `name`      | Yes      | string | Non-empty; trimmed                |
| `frequency` | Yes      | string | Exactly `biweekly` or `monthly`   |

**Response `201`:** the created call.

**Error `400`:**

```json
{ "error": "Call frequency must be \"biweekly\" or \"monthly\"" }
```

---

### `PUT /calls/:id`

Updates a call's `name`, `frequency`, and/or `done`. All fields are optional
but must pass the same validation as `POST /calls` when present (`done` must
be a boolean). Setting `done` to `true` stamps `doneAt` with the current ISO
time; setting `done` to `false` clears it to `null` (mirrors Task semantics).

**Response `200`:** the updated call.
**Error `400`:** invalid name, frequency, or done.
**Error `404`:** call not found.

---

### `DELETE /calls/:id`

Deletes a call.

**Response `200`:**

```json
{ "deleted": "..." }
```

**Error `404`:** call not found.

---

## Goals API

Base path: `/goals`

### `GET /goals`

Returns all goals sorted by `priority` ascending. Goals stored before the
`priority` field existed are backfilled in name order on first read, so an
existing list keeps the order it had under the old name-ascending sort.

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Improve Health",
    "steps": [
      {
        "name": "Wake up at 6",
        "status": "under_progress",
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
      },
      {
        "name": "Have 1 fruit a day",
        "status": "pending",
        "days": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      }
    ],
    "createdAt": "2026-07-11T00:00:00.000Z",
    "updatedAt": "2026-07-11T00:00:00.000Z"
  }
]
```

---

### `POST /goals`

Creates a new goal.

**Request Body:**

```json
{
  "name": "Improve Health",
  "steps": [
    {
      "name": "Wake up at 6",
      "status": "under_progress",
      "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
    },
    { "name": "Have 1 fruit a day" }
  ]
}
```

| Field   | Required | Type       | Notes                                                                             |
| ------- | -------- | ---------- | --------------------------------------------------------------------------------- |
| `name`  | Yes      | string     | Non-empty; trimmed                                                                 |
| `steps` | No       | GoalStep[] | Defaults to `[]`. Each step needs a non-empty `name` (trimmed); `status` optional (`pending`/`under_progress`, defaults to `pending`; legacy `active`/`achieved` normalized to `under_progress`); `days` optional (non-empty array of `"Sun".."Sat"`, deduped and sorted into week order, defaults to all seven) |

**Response `201`:** the created goal.

**Error `400`:**

```json
{ "error": "Step status must be one of: pending, under_progress" }
```

```json
{ "error": "Step days must be a non-empty array of: Sun, Mon, Tue, Wed, Thu, Fri, Sat" }
```

---

### `PUT /goals/:id`

Updates a goal's `name`, `steps` and/or `priority`. All fields are optional
but must pass the same validation as `POST /goals` when present. `steps` is
replaced wholesale — send the full list to add, rename, reorder, remove or
change the status or days of steps (an empty array clears them). Changing
`priority` moves the goal and shifts the others so priorities stay contiguous
`0..n-1`, the same scheme headers and projects use.

**Response `200`:** the updated goal.
**Error `400`:** priority is not a non-negative integer, or is outside
`0..n-1`.
**Error `404`:** goal not found.

---

### `DELETE /goals/:id`

Deletes a goal. Tasks previously added to the todo from its steps are untouched.

**Response `200`:**

```json
{ "deleted": "..." }
```

**Error `404`:** goal not found.

---

## Projects API

Base path: `/projects`

### `GET /projects`

Returns all projects sorted by `priority` ascending.

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "Automated Stock Market",
    "priority": 0,
    "tasks": [
      {
        "name": "get data from EODHD",
        "notes": "use the v2 API key",
        "date": "2026-08-01",
        "done": false,
        "todoTaskId": "..."
      },
      { "name": "get data from Nasdaq", "notes": "", "date": null, "done": false, "todoTaskId": null }
    ],
    "createdAt": "2026-07-24T00:00:00.000Z",
    "updatedAt": "2026-07-24T00:00:00.000Z"
  }
]
```

---

### `POST /projects`

Creates a new project. Priority is auto-assigned (appended at the end).

**Request Body:**

```json
{
  "name": "Automated Stock Market",
  "tasks": [
    { "name": "get data from EODHD", "notes": "use the v2 API key", "date": "2026-08-01" },
    { "name": "get data from Nasdaq" }
  ]
}
```

| Field   | Required | Type          | Notes                                                                            |
| ------- | -------- | ------------- | -------------------------------------------------------------------------------- |
| `name`  | Yes      | string        | Non-empty; trimmed                                                                |
| `tasks` | No       | ProjectTask[] | Defaults to `[]`. Each task needs a non-empty `name` (trimmed); `notes` optional string (default `""`, mirrored onto the linked todo task); `date` optional (`"YYYY-MM-DD"` or `null`, default `null`); `done` optional boolean (default `false`); `todoTaskId` optional string/`null` (default `null`). The list is re-sorted into dated undone → undated undone → done |

**Response `201`:** the created project.

**Error `400`:**

```json
{ "error": "Task date must be a YYYY-MM-DD string or null" }
```

---

### `PUT /projects/:id`

Updates a project's `name`, `tasks` and/or `priority`. All fields are
optional but must pass the same validation as `POST /projects` when present.
`tasks` is replaced wholesale — send the full list to add, rename, reorder,
remove or change the date/done state of tasks (an empty array clears them;
the server re-sorts so dated undone tasks come first, then undated undone
ones, then done tasks at the bottom). Priority changes shift the other
projects to keep contiguous `0..n-1` order, same as headers.

**Response `200`:** the updated project.
**Error `400`:** validation error (including out-of-range priority).
**Error `404`:** project not found.

---

### `DELETE /projects/:id`

Deletes a project and shifts remaining project priorities. Its todo header and
the tasks previously added from its dated tasks are kept, but the header is
unlinked (`projectId: null`) so it leaves the project block.

**Response `200`:**

```json
{ "deleted": "...", "headersUnlinked": 1 }
```

**Error `404`:** project not found.

---

## Cron Job

The cron job runs daily at UTC midnight (scheduled via `node-cron` in the `Etc/UTC` timezone) and performs the following steps to maintain task state and history.

### Cron Steps

| Step | Trigger            | Action                                                                          |
| ---- | ------------------ | ------------------------------------------------------------------------------- |
| 0    | Every day          | Archive **yesterday's** habit (`day_of_week`) and recurring (`day_of_month` / `day_of_year`) outcomes to TaskArchive (idempotent per dueDate; due days are resolved against yesterday's month, so a 31st task is archived on Feb 28) |
| 1    | Every day          | When a `day_of_year` task's month/day resolves to today (and its stored year is in the past), advance the year to the current year and mark the task undone. Feb 29 resolves to Feb 28 in non-leap years — the stored **day is never rewritten**, so the task returns to Feb 29 in the next leap year |
| 2    | Every day          | Mark tasks with a `day_of_week` ECD matching today as undone (`doneAt` cleared) |
| 3    | Every day          | Mark tasks with a `day_of_month` ECD containing today as undone (`doneAt` cleared). Values are resolved against the current month's length, so `[31]` is due on Feb 28; the stored value is **never rewritten** |
| 4    | Every day          | Archive then delete tasks that are **done** and have a `date` ECD or no ECD; deleted tasks linked from a long-term project (`ProjectTask.todoTaskId`) mark that project task `done` (link cleared, `date` kept, task re-sorted to the bottom of the project), and tasks linked from a life event (`LifeEvent.todoTaskId`) mark that event `done` (link cleared; the event is never deleted) |
| 5    | Every day          | Delete headers that have **no tasks** (including ones emptied by step 4), then re-assert the header order: priorities contiguous (`0..n-1`) **and** project headers in their projects' order (see [Project header ordering](#project-header-ordering)). Also repairs `projectId` links |
| 6    | Every day          | Add **due life events** to the todo: for every life event whose `"D/M"` resolves to today (Feb 29 → Feb 28 in non-leap years) and whose `lastAddedYear` is behind the current year, create a linked one-time `date` task named after it under an **"Events"** header (matched case-insensitively, created otherwise), reset `done` and advance `lastAddedYear` (what makes same-day reruns idempotent). Skipped while a linked task still exists, so occurrences never stack |
| 7    | Every day          | Re-sort each header: undone tasks by next upcoming ECD ascending, done tasks last. Same-day ties keep their existing relative order (stable sort); only `priority` is written — `updatedAt` is untouched |
| 8    | 15th / last day of month | Archive a `call_result` event for every **due** call (done and missed; idempotent per dueDate), then reset done calls (`done: false`, `doneAt: null`): `biweekly` calls are due on the 15th; **all** calls on the last day of the month. No-op on other days |
| 9    | Every day          | Refresh the `InsightStats` snapshot: recompute habit streaks/rates, on-time vs late tasks, reschedules, deletions, per-header rollups and call results over the last 28 days of `TaskArchive` and replace the stored document. **No AI, no `GEMINI_API_KEY`, not suppressed by `skipInsights`** — streaks stay current nightly. Failure never fails the run (`statsRefreshed: false`) |
| 10   | Every day          | **Summarise, then prune the archive**: fold `TaskArchive` events older than `ARCHIVE_RETENTION_DAYS` (default 30) into `ArchiveSummary` — one document per calendar month, kept forever — then delete the raw events. The cutoff is a **UTC day boundary** (only whole days are pruned) measured from the **real** clock, not the run's `date` override; the fold is idempotent per source day. Retention is clamped up to the 28-day insights window. Reports `archiveEventsPruned`, `archiveEventsFolded`, `archiveMonthsSummarised`, `archiveCutoff` |
| —    | Fridays            | Generate the AI insight report — only when today is **Friday (UTC)** and no report was already generated that Friday; on any other day (or a repeat run the same Friday) the response carries `insightGenerated: false` + `insightSkipped: "not-due"`. Requires `GEMINI_API_KEY`; skipped in tests; failure never fails the run. `POST /insights/generate` bypasses the gate |

#### Resolving "next upcoming ECD" for step 7

| `type`         | Next due date                                                                              |
| -------------- | ------------------------------------------------------------------------------------------ |
| `date`         | The date itself — a past date sorts first, so overdue one-offs surface at the top          |
| `day_of_week`  | The nearest upcoming day in `value`, today included                                        |
| `day_of_month` | The nearest upcoming day in `value` this month or next, each clamped to that month's length |
| `day_of_year`  | The **next anniversary** of the stored day/month on or after today (Feb 29 → Feb 28 in non-leap years). The stored year records the last consumed occurrence and is not used for sorting |
| _none_         | Sorts last among undone tasks                                                              |

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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 4,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "callsReset": 0
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
  "date": "2026-01-01",
  "skipInsights": true
}
```

| Field          | Required | Notes                                                                                          |
| -------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `date`         | No       | ISO date string; defaults to today (UTC)                                                       |
| `skipInsights` | No       | Skip the weekly AI insight report for this run (used by e2e tests to avoid a real Anthropic API call). Does **not** skip the step-9 stats snapshot, which costs nothing |

**Response `200`:**

```json
{
  "ranAt": "2026-01-01T00:00:00.000Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 3,
  "tasksClamped": 1,
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 4,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "outcomesArchived": 5,
  "callsReset": 0,
  "statsRefreshed": true,
  "archiveEventsPruned": 8,
  "archiveEventsFolded": 8,
  "archiveMonthsSummarised": 1,
  "archiveCutoff": "2026-07-20",
  "insightGenerated": true
}
```

`insightGenerated` is only present when the run reached the insight step
(`skipInsights` unset, not test mode, `GEMINI_API_KEY` configured). The
report is weekly: on any day that is not Friday (UTC) — or on a Friday it
already ran for — it is `false` and the response also carries
`"insightSkipped": "not-due"`.

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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 4,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "outcomesArchived": 5,
  "callsReset": 0,
  "statsRefreshed": true,
  "archiveEventsPruned": 8,
  "archiveEventsFolded": 8,
  "archiveMonthsSummarised": 1,
  "archiveCutoff": "2026-07-20",
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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 4,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "callsReset": 0
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
| `days`    | No       | How many days back to fetch (default 28, max 365). **Raw events only exist inside the retention window** (`ARCHIVE_RETENTION_DAYS`, default 30), so a larger `days` returns whatever survives — use `GET /archive/summary` for older history |
| `type`    | No       | Filter: `habit_result`, `task_result`, `task_completed`, `task_rescheduled`, `task_deleted`, `call_result` |

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

`call_result` events (logged by cron step 8 at each period boundary, before the reset) have no header fields:

```json
{
  "_id": "...",
  "type": "call_result",
  "callId": "...",
  "callName": "Grandma",
  "frequency": "biweekly",
  "dueDate": "2026-07-15",
  "completed": false,
  "doneAt": null,
  "at": "2026-07-15T00:00:01.000Z"
}
```

`task_deleted` events are logged by the Task model when an **undone** task is deleted manually (see `DELETE /tasks/:id`), carrying the user's `reason`:

```json
{
  "_id": "...",
  "type": "task_deleted",
  "taskId": "...",
  "taskName": "Learn cello",
  "headerId": "...",
  "headerName": "Hobbies",
  "ecdType": "date",
  "ecd": { "type": "date", "value": "2026-08-01" },
  "reason": "Too big, kept putting it off",
  "taskCreatedAt": "2026-07-01T09:00:00.000Z",
  "at": "2026-07-18T11:20:00.000Z"
}
```

### `GET /archive/summary`

Returns the permanent monthly roll-ups, **oldest month first**. Cron step 10
writes these as raw events age out of the retention window, so this is the only
place history older than `ARCHIVE_RETENTION_DAYS` still exists.

Monthly totals only — per-day detail is **not** recoverable from it.

**Response `200`:**

```json
[
  {
    "_id": "...",
    "month": "2026-07",
    "days": ["2026-07-01", "2026-07-02"],
    "eventCount": 412,
    "habits": [
      { "taskName": "Meditate", "headerName": "Health", "scheduled": 22, "completed": 19 }
    ],
    "recurring": [
      { "taskName": "Pay rent", "headerName": "Admin", "ecdType": "day_of_month", "scheduled": 1, "completed": 1 }
    ],
    "calls": [
      { "callName": "Grandma", "frequency": "biweekly", "scheduled": 2, "completed": 1 }
    ],
    "oneTimeTasks": { "completed": 14, "onTime": 11, "late": 3 },
    "reschedules": { "total": 5, "pushedLater": 4, "pushedLaterNoReason": 2 },
    "deletions": { "count": 2, "withReason": 1 },
    "byHeader": [
      { "headerName": "Health", "completed": 19, "missed": 3, "reschedules": 1, "deleted": 0 }
    ],
    "firstAt": "2026-07-01T00:00:03.000Z",
    "lastAt": "2026-07-31T23:59:00.000Z",
    "updatedAt": "2026-08-30T00:00:04.000Z"
  }
]
```

`days` lists the source days already folded into the month — the guard that
stops a repeated cron run counting a day twice. Calls are deliberately absent
from `byHeader`; they have no header.

Returns `[]` before anything has been pruned.

---

## Insights API

Base path: `/insights`

### `GET /insights/stats?days=28`

Exact computed stats over the archive — no AI involved. Returns per-habit completion rates, current/longest streaks, missed-by-weekday counts, one-time-task slippage, reschedule counts, manual-deletion counts (`deletions` — from `task_deleted` events), per-header rollups, and per-person call completion (`calls` — from `call_result` events; calls are excluded from `byHeader` since they have no header).

**Slippage is a whole-UTC-calendar-day count**: `slippageDays` is the number of days between the date the task was scheduled for (`plannedFor` — the *postponed-to* ECD when the user rescheduled it, since a postpone rewrites `task.ecd` before the archive event is written) and the calendar day `doneAt` falls on. Both sides are snapped to midnight UTC before subtracting, so a task ticked off at any time of day on its scheduled date is `0`, one done the next day is `1`, and one finished early is negative. Events with a null `plannedFor` (recurring or no-ECD tasks) get `slippageDays: null` and are excluded from the rollups.

**Finishing on or before the planned date counts as good.** Each entry in `oneTimeTasks.recent` carries `onTime` — `true` when `slippageDays <= 0`, `false` when it is positive, `null` when there is no `plannedFor` — and `oneTimeTasks` rolls those up as `onTimeCount` / `lateCount`. `avgSlippageDays` measures **lateness only**: early and on-the-day completions contribute `0` rather than a negative number, so an early finish can never cancel out a late one. It is `null` when no completed task had a `plannedFor`.

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
  "oneTimeTasks": {
    "completedCount": 9,
    "onTimeCount": 6,
    "lateCount": 3,
    "avgSlippageDays": 1.4,
    "recent": [
      {
        "taskName": "Ship report",
        "headerName": "Work",
        "plannedFor": "2026-07-06",
        "doneAt": "2026-07-04T18:00:00.000Z",
        "slippageDays": -2,
        "onTime": true
      }
    ]
  },
  "reschedules": [
    {
      "taskName": "Write blog",
      "headerName": "Health",
      "total": 3,
      "pushedLater": 3,
      "pushedLaterWithReason": 1,
      "pushedLaterNoReason": 2,
      "reasons": ["Blocked on the editor"]
    }
  ],
  "deletions": {
    "count": 2,
    "withReason": 2,
    "recent": [
      { "taskName": "Learn cello", "headerName": "Hobbies", "ecdType": "date", "reason": "Too big, kept putting it off" }
    ]
  },
  "byHeader": { "Health": { "completed": 19, "missed": 2, "reschedules": 3, "deleted": 0 } },
  "calls": [
    {
      "callName": "Grandma",
      "frequency": "biweekly",
      "scheduled": 4,
      "completed": 2,
      "completionRate": 50,
      "currentMissStreak": 2,
      "recentResults": [{ "dueDate": "2026-07-15", "completed": false }]
    }
  ]
}
```

---

### `GET /insights/stats/latest`

The stats snapshot the **nightly cron** stored (cron step 9) — the same numbers
as `GET /insights/stats` without recomputing them, plus `computedAt`. No AI is
involved in either endpoint; this one exists so streaks and rates are available
as of the last cron run, refreshed nightly even though the AI report is weekly.

**Response `200`:** the `/insights/stats` body plus `computedAt`:

```json
{
  "computedAt": "2026-07-24T00:00:03.412Z",
  "periodDays": 28,
  "eventCount": 42,
  "habits": [],
  "recurringTasks": [],
  "oneTimeTasks": {},
  "reschedules": [],
  "deletions": {},
  "byHeader": {},
  "calls": []
}
```

**Error `404`** — the cron has never written a snapshot:

```json
{ "error": "No stats snapshot yet — it is written by the nightly cron run" }
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
  "model": "gemini-3.7-flash",
  "stats": { "...": "stats the report was based on" },
  "report": {
    "summary": "string",
    "habitsOnTrack": ["string"],
    "habitsSlipping": ["string"],
    "taskInsights": ["string"],
    "procrastinationFlags": ["string"],
    "deletionInsights": ["string"],
    "callReminders": ["string"],
    "suggestions": ["string"]
  }
}
```

> `callReminders` (people to call: not yet called this period, repeat misses) is required in newly generated reports — an empty array when no calls are set up — but absent from reports stored before the Calls feature; clients must tolerate its absence.
>
> `deletionInsights` (patterns among manually-deleted undone tasks and their stated reasons — abandonment vs. healthy pruning) is likewise required in newly generated reports — an empty array when nothing was deleted — but absent from reports stored before this feature; clients must tolerate its absence.

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

Generates a fresh AI report now and stores it. The cron generates a report
only on Fridays; this endpoint is an explicit user request, so it ignores that
gate and always generates — and a report generated here does not consume that
week's Friday run.

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
{ "error": "GEMINI_API_KEY is not configured on the server" }
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

| Environment               | Headers        | Tasks        | Events        | Affirmations        | Goals        | Projects        | Calls        | Archive            | Insights        |
| ------------------------- | -------------- | ------------ | ------------- | ------------------- | ------------ | --------------- | ------------ | ------------------ | --------------- |
| Production                | `Headers`      | `Tasks`      | `Events`      | `Affirmations`      | `Goals`      | `Projects`      | `Calls`      | `TaskArchive`      | `Insights`      |
| Test (`USE_TEST_DB=true`) | `Headers-Test` | `Tasks-Test` | `Events-Test` | `Affirmations-Test` | `Goals-Test` | `Projects-Test` | `Calls-Test` | `TaskArchive-Test` | `Insights-Test` |

---

## Running Tests

```bash
USE_TEST_DB=true NODE_ENV=test npx jest --forceExit --runInBand
```
