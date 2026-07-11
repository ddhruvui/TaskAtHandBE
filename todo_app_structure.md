# Todo App — Data Structure & Cron Logic

## Models

### Header

```json
{
  "_id": "uuid",
  "name": "string",
  "priority": "integer (0 to n-1)"
}
```

**Rules:**

- `priority` is unique and contiguous across all headers (0 to n-1)
- On **insert**: assign `priority = total number of existing headers` (add at end), no shifting needed
- On **delete**: shift all headers with `priority > deletedPriority` down by 1
- On **reorder**: swap or bulk-update priorities atomically

---

### Task

```json
{
  "_id": "uuid",
  "name": "string",
  "notes": "string (optional)",
  "headerId": "ref → Header._id",
  "priority": "integer (0 to n-1, scoped per header)",
  "ecd": {
    "type": "enum: date | day_of_week | day_of_month | day_of_year",
    "value": "see ECD Types below"
  },
  "done": "boolean (default: false)",
  "doneAt": "ISO 8601 datetime | null (set when done → true, cleared on undo/reset)",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `priority` is scoped per `headerId` — two tasks in different headers can share the same priority value
- `updatedAt` must be refreshed on every write (toggling `done`, changing priority, editing any field)
- `doneAt` records **when** a task was completed: set to the current time when `done` flips to `true`, set back to `null` when `done` flips to `false` (by the user or by a cron reset)
- Every ECD change is logged to the `TaskArchive` collection as a `task_rescheduled` event (see Archive below)

**Priority assignment:**

- **New task added**: Insert at the position just before the first done task (1 below the last undone task). Shift all done tasks down by 1 to make room.
- **Task marked `done`**: Move to the last position (`priority = total tasks in header - 1`). Shift all tasks that were below it up by 1.
- **Task marked `not done`**: Move to the position just before the first done task (same as new task insertion). Shift all done tasks down by 1 to make room.

**Insertion point definition:** The "1 below last undone task" position is the index where done tasks begin. If there are no done tasks, insert at the end. If all tasks are done, insert at position 0.

---

### ECD Types

#### `date` — single one-time date

```json
{
  "type": "date",
  "value": "2026-04-10"
}
```

- `value` is an ISO 8601 date string (YYYY-MM-DD)

#### `day_of_week` — recurring on specific days of the week

```json
{
  "type": "day_of_week",
  "value": ["Mon", "Wed", "Fri"]
}
```

- `value` is an array of day name strings
- Allowed values: `Mon | Tue | Wed | Thu | Fri | Sat | Sun`

#### `day_of_month` — recurring on specific dates of the month

```json
{
  "type": "day_of_month",
  "value": [1, 15, 31]
}
```

- `value` is an array of integers (1–31)

#### `day_of_year` — recurring annually on a specific date

```json
{
  "type": "day_of_year",
  "value": "7/3/2006"
}
```

- `value` is a date string in `D/M/YYYY` format
- The year increments by 1 every Jan 1st

---

### Event (reusable task bundle)

```json
{
  "_id": "uuid",
  "name": "string",
  "tasks": ["string"],
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- `tasks` must be a non-empty array of non-empty strings (each trimmed)
- Events are **templates only** — the backend never turns them into tasks.
  Clients schedule an event by posting one Task per selected entry (with a
  `date` ECD for the chosen day) under a Header named after the event — an
  existing header with that name is reused so later additions join it; a new
  one is created only when none exists
- Deleting an event never touches headers or tasks created from it
- The cron job ignores the Events collection entirely

---

### TaskArchive (event log)

Append-only history collection (`TaskArchive`, or `TaskArchive-Test` in test
mode). All events carry `type`, `at` (insertion time), and a denormalized
`headerName` so history stays readable after headers are renamed or deleted.
Archive writes never throw — they can't break the operation that triggered
them.

| Event type         | Written by            | Meaning                                                          |
| ------------------ | --------------------- | ---------------------------------------------------------------- |
| `habit_result`     | Cron step 0           | A `day_of_week` task's done/missed outcome for one scheduled day |
| `task_result`      | Cron step 0           | A `day_of_month` / `day_of_year` task's outcome for one cycle    |
| `task_completed`   | Cron step 5           | A one-time task captured (with `plannedFor`, `doneAt`) before deletion |
| `task_rescheduled` | `Task.update`         | An ECD change, with `fromEcd`, `toEcd`, and `pushedLater` flag   |

```json
{
  "type": "habit_result",
  "taskId": "uuid",
  "taskName": "Meditate",
  "headerId": "uuid",
  "headerName": "Health",
  "scheduledDays": ["Mon", "Wed", "Fri"],
  "dueDate": "2026-07-03",
  "completed": true,
  "doneAt": "2026-07-03T14:05:00Z",
  "at": "2026-07-04T00:00:01Z"
}
```

---

### Insight (AI reports)

The `Insights` collection stores one AI coaching report per generation:

```json
{
  "generatedAt": "ISO 8601 datetime",
  "periodDays": 28,
  "model": "claude-opus-4-8",
  "stats": "exact computed stats the report was based on",
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

Reports are generated at the end of every cron run (when `ANTHROPIC_API_KEY`
is set) and on demand via `POST /insights/generate`. The previous report is
fed into the next generation so suggestions build on each other. Tasks
scheduled by `day_of_week` are treated as **habits**; everything else is a
task.

---

## Cron Job

**Schedule:** Runs once daily at UTC midnight (`node-cron`, `Etc/UTC` timezone; UTC setInterval fallback). All day computations use UTC.

### Step-by-step Execution Order

#### Step 0 — Archive yesterday's recurring-task outcomes _(runs before any reset)_

A task scheduled for day X is reset at X 00:00 and completed during X, so its
outcome is only knowable at the following midnight:

- For every `day_of_week` task scheduled **yesterday**: log a `habit_result` event with `completed = task.done` and the task's `doneAt`
- For every `day_of_month` / `day_of_year` task due **yesterday**: log a `task_result` event the same way
- Idempotent: tasks already archived for that `dueDate` are skipped, so manual cron runs don't double-log

#### Step 1 — Clamp `day_of_month` values _(runs on the 1st of every month only)_

- For every task with `ecd.type === "day_of_month"`:
  - Determine the number of days in the current month
  - For each value in `ecd.value`, if the value exceeds the number of days in the month, clamp it to the last day of the month
  - If any value was changed, update `updatedAt`

#### Step 2 — Clamp & increment `day_of_year` _(runs on Jan 1st only)_

- For every task with `ecd.type === "day_of_year"`:
  - Increment the year in `ecd.value` by 1 (e.g. `7/3/2006` → `7/3/2007`)
  - If the resulting date is Feb 29 and the new year is not a leap year, clamp to Feb 28
  - Set `done = false`, `doneAt = null`
  - Update `updatedAt`

#### Step 3 — Mark undone: `day_of_week`

- For every task with `ecd.type === "day_of_week"`:
  - If today's day name (e.g. `"Mon"`) is in `ecd.value`:
    - Set `done = false`, `doneAt = null`
    - Update `updatedAt`

#### Step 4 — Mark undone: `day_of_month`

- For every task with `ecd.type === "day_of_month"`:
  - If today's date number (1–31) is in `ecd.value`:
    - Set `done = false`, `doneAt = null`
    - Update `updatedAt`

#### Step 5 — Delete completed `date` tasks

- For every task with `ecd.type === "date"` (or no ECD):
  - If `done === true` → archive a `task_completed` event (preserving `plannedFor`, `createdAt`, `doneAt`, `headerName`), then **delete** the task
  - If `done === false` → do nothing

#### Step 6 — Reorder priorities per header _(runs last)_

- For each header, collect all its tasks and sort as follows:
  1. **Undone tasks** (`done === false`) — sorted by next upcoming ECD date **ascending** → assigned priorities `0, 1, 2, ...` (sooner = closer to 0)
  2. **Done tasks** (`done === true`) — assigned the remaining higher priority values after all undone tasks
- Update `priority` and `updatedAt` on any task whose priority changed

##### Resolving "next upcoming ECD date" for sorting

| `type`         | Next due date                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| `date`         | The date value itself                                                         |
| `day_of_week`  | The nearest upcoming day from the `value` array                               |
| `day_of_month` | The nearest upcoming date in the current or next month from the `value` array |
| `day_of_year`  | The date stored in `value` (e.g. `7/3/2007`)                                  |

#### Final step — Generate the daily AI insight report

- After step 6, when `ANTHROPIC_API_KEY` is set (and not in test mode):
  - Compute exact stats over the last 28 days of `TaskArchive` events (habit completion rates, streaks, missed-by-weekday, task slippage, reschedule counts)
  - Send stats + recent events + the previous report to `claude-opus-4-8` with a structured-output schema
  - Store the result in the `Insights` collection
- Failures here never fail the cron run (logged, `insightGenerated: false` in stats)

---

## API Routes

### Headers

#### `GET /headers`

Returns all headers sorted by `priority` ascending.

**Response `200`**

```json
[
  { "_id": "uuid", "name": "Work", "priority": 0 },
  { "_id": "uuid", "name": "Personal", "priority": 1 }
]
```

---

#### `POST /headers`

Creates a new header. Priority is automatically assigned as `total headers` (added at end).

**Request body**

```json
{
  "name": "string"
}
```

**Response `201`**

```json
{
  "_id": "uuid",
  "name": "Work",
  "priority": 2
}
```

---

#### `PUT /headers/:id`

Updates a header's name and/or priority. If `priority` is changed, all affected headers are shifted accordingly.

**Request body** _(all fields optional)_

```json
{
  "name": "string",
  "priority": "integer"
}
```

**Response `200`** — returns updated header

---

#### `DELETE /headers/:id`

Deletes a header and all tasks associated with it. Shifts priorities of remaining headers down to keep contiguous.

**Response `200`**

```json
{
  "deleted": "uuid",
  "tasksDeleted": 5
}
```

---

### Tasks

#### `GET /tasks?headerId=:headerId`

Returns all tasks for a given header, sorted by `priority` ascending.

**Query params**

- `headerId` _(required)_ — filter tasks by header

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Write report",
    "notes": "Include Q1 data",
    "headerId": "uuid",
    "priority": 0,
    "ecd": { "type": "date", "value": "2026-04-10" },
    "done": false,
    "createdAt": "2026-03-26T00:00:00Z",
    "updatedAt": "2026-03-26T00:00:00Z"
  }
]
```

---

#### `POST /tasks`

Creates a new task. Priority is automatically assigned just before the first done task in the header.

**Request body**

```json
{
  "name": "string",
  "notes": "string (optional)",
  "headerId": "uuid",
  "ecd": {
    "type": "date | day_of_week | day_of_month | day_of_year",
    "value": "see ECD Types"
  }
}
```

**Response `201`** — returns created task with assigned `priority`, `done: false`, `createdAt`, `updatedAt`

---

#### `PUT /tasks/:id`

Updates a task. Handles the following cases:

- **Editing fields** (`name`, `notes`, `ecd`): updates fields and `updatedAt`
- **Marking `done = true`**: moves task to last priority in its header, shifts affected tasks up
- **Marking `done = false`**: moves task to just before the first done task, shifts done tasks down
- **Changing `priority`**: manual reorder, shifts affected tasks accordingly

**Request body** _(all fields optional)_

```json
{
  "name": "string",
  "notes": "string",
  "ecd": {
    "type": "date | day_of_week | day_of_month | day_of_year",
    "value": "see ECD Types"
  },
  "done": "boolean",
  "priority": "integer"
}
```

**Response `200`** — returns updated task

---

#### `DELETE /tasks/:id`

Deletes a task. Shifts priorities of remaining tasks in the same header down to keep contiguous.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Events

#### `GET /events`

Returns all event templates sorted by `name` ascending.

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Burger Night",
    "tasks": ["Procure onion", "Procure bun"],
    "createdAt": "2026-07-10T00:00:00Z",
    "updatedAt": "2026-07-10T00:00:00Z"
  }
]
```

---

#### `POST /events`

Creates a new event template.

**Request body**

```json
{
  "name": "string",
  "tasks": ["string"]
}
```

**Response `201`** — returns created event with timestamps

---

#### `PUT /events/:id`

Updates an event's name and/or task list. Fields are optional but validated
the same as on create when present.

**Response `200`** — returns updated event

---

#### `DELETE /events/:id`

Deletes an event template. Headers/tasks previously created from it remain.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Cron

#### `POST /cron/run`

Manually triggers the cron job. Accepts an optional `date` body override. Runs all steps in order:

0. Archive yesterday's habit/recurring outcomes (idempotent)
1. Clamp `day_of_month` values _(if today is the 1st)_
2. Clamp & increment `day_of_year` _(if today is Jan 1st)_
3. Mark undone: `day_of_week`
4. Mark undone: `day_of_month`
5. Archive + delete completed `date` tasks
6. Reorder priorities per header
7. Generate the daily AI insight report _(when `ANTHROPIC_API_KEY` is set)_

**Response `200`**

```json
{
  "ranAt": "2026-03-26T00:00:00Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 5,
  "tasksClamped": 1,
  "headersReordered": 3,
  "outcomesArchived": 4,
  "insightGenerated": true
}
```

---

#### `GET /cron/run`

Manually triggers the cron job. No request body required. Runs the same steps as `POST /cron/run` using the current UTC date.

**Response `200`**

```json
{
  "ranAt": "2026-03-26T00:00:00Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 5,
  "tasksClamped": 1,
  "headersReordered": 3
}
```

---

#### `GET /cron/status`

Returns metadata about the last cron run.

**Response `200`**

```json
{
  "lastRanAt": "2026-03-26T00:00:00Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 5,
  "tasksClamped": 1,
  "headersReordered": 3
}
```

---

#### `GET /cron/details`

Returns metadata about the last cron run. Alias for `GET /cron/status`.

**Response `200`**

```json
{
  "lastRanAt": "2026-03-26T00:00:00Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 5,
  "tasksClamped": 1,
  "headersReordered": 3
}
```

---

### Archive & Insights

#### `GET /archive?days=28&type=habit_result`

Returns raw `TaskArchive` events for the period, oldest first. Both query
params optional (`days` defaults to 28; `type` filters by event type).

#### `GET /insights/stats?days=28`

Exact computed stats (no AI): per-habit completion rates, current/longest
streaks, missed-by-weekday, one-time-task slippage, reschedule counts, and
per-header rollups.

#### `GET /insights/latest`

Most recent stored AI report. `404` if none has been generated yet.

#### `GET /insights/history?limit=14`

Recent AI reports, newest first.

#### `POST /insights/generate`

Generates a fresh AI report now. Optional body `{ "days": 28 }`. Returns
`201` with the stored report, `404` if the archive is empty, `503` if
`ANTHROPIC_API_KEY` is not configured.

---

## Error Responses

All endpoints return errors in the following shape:

```json
{
  "error": "string describing the issue"
}
```

| Status | Meaning                                 |
| ------ | --------------------------------------- |
| `400`  | Bad request — missing or invalid fields |
| `404`  | Resource not found                      |
| `500`  | Internal server error                   |
