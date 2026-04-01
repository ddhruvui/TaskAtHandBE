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
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `priority` is scoped per `headerId` — two tasks in different headers can share the same priority value
- `updatedAt` must be refreshed on every write (toggling `done`, changing priority, editing any field)

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

## Cron Job

**Schedule:** Runs once daily at midnight (start of day)

### Step-by-step Execution Order

#### Step 1 — Clamp `day_of_month` values _(runs on the 1st of every month only)_

- For every task with `ecd.type === "day_of_month"`:
  - Determine the number of days in the current month
  - For each value in `ecd.value`, if the value exceeds the number of days in the month, clamp it to the last day of the month
  - If any value was changed, update `updatedAt`

#### Step 2 — Clamp & increment `day_of_year` _(runs on Jan 1st only)_

- For every task with `ecd.type === "day_of_year"`:
  - Increment the year in `ecd.value` by 1 (e.g. `7/3/2006` → `7/3/2007`)
  - If the resulting date is Feb 29 and the new year is not a leap year, clamp to Feb 28
  - Set `done = false`
  - Update `updatedAt`

#### Step 3 — Mark undone: `day_of_week`

- For every task with `ecd.type === "day_of_week"`:
  - If today's day name (e.g. `"Mon"`) is in `ecd.value`:
    - Set `done = false`
    - Update `updatedAt`

#### Step 4 — Mark undone: `day_of_month`

- For every task with `ecd.type === "day_of_month"`:
  - If today's date number (1–31) is in `ecd.value`:
    - Set `done = false`
    - Update `updatedAt`

#### Step 5 — Delete completed `date` tasks

- For every task with `ecd.type === "date"`:
  - If `done === true` → **delete** the task
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

### Cron

#### `POST /cron/run`

Manually triggers the cron job. Accepts an optional `date` body override. Runs all steps in order:

1. Clamp `day_of_month` values _(if today is the 1st)_
2. Clamp & increment `day_of_year` _(if today is Jan 1st)_
3. Mark undone: `day_of_week`
4. Mark undone: `day_of_month`
5. Delete completed `date` tasks
6. Reorder priorities per header

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
