# Todo App — Data Structure & Cron Logic

## Models

### Header

```json
{
  "_id": "uuid",
  "name": "string",
  "priority": "integer (0 to n-1)",
  "projectId": "ref → Project._id | null"
}
```

**Rules:**

- `priority` is unique and contiguous across all headers (0 to n-1)
- On **insert**: assign `priority = total number of existing headers` (add at end), no shifting needed
- On **delete**: shift all headers with `priority > deletedPriority` down by 1
- On **reorder**: swap or bulk-update priorities atomically
- `projectId` is set when the header is the todo home of a long-term project (see Project below) and `null` for an ordinary header. It is the identity of a project header — names are only used to adopt headers created before the field existed

**Project header ordering (server-owned):** headers with a `projectId` are kept
in their projects' priority order as one contiguous block. When the todo has at
least one ordinary header, the topmost one keeps slot 0 and the block starts at
priority 1; otherwise the block starts at 0. The remaining ordinary headers keep
their relative order and fill the slots after the block. The server re-applies
this rule (as a single bulk update) on every event that can invalidate it:

| Event                                | Effect                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| `POST /headers` with a `projectId`   | new header is placed in the block instead of at the bottom |
| `PUT /projects/:id` with `priority`  | block re-ordered to match the new project order            |
| `PUT /projects/:id` with `name`      | the project's header is renamed to match                   |
| `DELETE /projects/:id`               | its header is unlinked (`projectId: null`) and leaves the block |
| Cron step 5                          | block re-asserted after empty headers are deleted          |

The same pass self-heals links: a header with no `projectId` whose name matches
a project is backfilled, and a header pointing at a deleted project has its
`projectId` cleared.

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
- Days the month is too short for resolve to that month's **last day** when the cron checks what is due (`[31]` fires on Feb 28). The stored value is never rewritten, so `[31]` still means the 31st in the next long month

#### `day_of_year` — recurring annually on a specific date

```json
{
  "type": "day_of_year",
  "value": "7/3/2006"
}
```

- `value` is a date string in `D/M/YYYY` format
- The year is advanced to the current year by the daily cron when today matches the stored month/day (see Cron Step 1). It records the **last** occurrence the cron consumed — sorting uses the next anniversary, not this year
- Feb 29 resolves to Feb 28 in non-leap years without the stored day changing, so the task returns to Feb 29 in the next leap year

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

### LifeEvent (annually recurring life event)

```json
{
  "_id": "uuid",
  "name": "string",
  "date": "D/M (no zero-padding, no year)",
  "lastAddedYear": "number (server-managed)",
  "done": "boolean (default: false)",
  "todoTaskId": "string | null",
  "priority": "number (0-based, contiguous across life events)",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- `date` is a `"D/M"` string (trimmed, no zero-padding, no year — e.g. `"7/3"`
  for March 7). The month must be 1–12 and the day valid for that month;
  Feb 29 is allowed and fires on Feb 28 in non-leap years, same clamping as
  `day_of_year` ECDs
- A life event recurs **annually**: every year on its day, cron step 6 adds a
  one-time `date`-ECD Task named after it to the todo under a Header named
  **"Events"** (an existing header with that name is reused
  case-insensitively; a new one is created at the end of the list only when
  none exists) and stores the task's `_id` in `todoTaskId`
- `lastAddedYear` is **server-managed**: it records the year of the last
  occurrence the cron consumed (the same role the year plays in `day_of_year`
  ECDs), which is what makes same-day cron reruns idempotent. It is baselined
  on create and on a date **change** (last year while this year's occurrence
  is still upcoming — today included — this year once it has passed); a no-op
  date write does not re-baseline it. Clients must treat it as read-only
- `done` means "this year's occurrence completed". Clients keep it in sync
  with the linked todo task (toggling done on either side flips the other,
  and deleting the todo task or its header clears `todoTaskId`); cron step 4
  completes the loop when it deletes the done todo task. Step 6 resets it to
  `false` when it adds the next occurrence
- `priority` is managed exactly like project priority: new life events append
  at the end, moves shift the affected neighbors, deletes close the gap —
  always contiguous `0..n-1`
- Deleting a life event keeps the todo task created from it (if any); the
  cron **never** deletes life events — completing a year's occurrence only
  marks the event done and clears the link, and it fires again on its next
  anniversary

---

### Affirmation (daily short line)

```json
{
  "_id": "uuid",
  "name": "string",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- Affirmations are single short lines the user reads daily (e.g. "Thank you
  blessing") — completely independent of Headers and Tasks
- Listed in the order they were added (`createdAt` ascending)
- The cron job ignores the Affirmations collection entirely

---

### Call (biweekly/monthly call reminder)

```json
{
  "_id": "uuid",
  "name": "string",
  "frequency": "enum: biweekly | monthly",
  "done": "boolean (default: false)",
  "doneAt": "ISO 8601 datetime | null (set when done → true, cleared on undo/reset)",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- `frequency` must be exactly `biweekly` (call twice per month — periods
  1st–14th and 15th–end) or `monthly` (call once per month)
- Calls are people the user must phone regularly — completely independent of
  Headers and Tasks (no `headerId`, no `priority`)
- `doneAt` mirrors Task semantics: set to the current time when `done` flips
  to `true`, set back to `null` when `done` flips to `false` (by the user or
  by a cron reset)
- Listed in the order they were added (`createdAt` ascending)
- The daily cron resets done calls at period boundaries (see Cron Step 8)

---

### Goal (habit backlog, built one step at a time)

```json
{
  "_id": "uuid",
  "name": "string",
  "steps": [{ "name": "string", "status": "pending | under_progress" }],
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- `steps` is an ordered array (may be empty; defaults to `[]` on create) of
  objects with a non-empty `name` (trimmed) and a `status` of `pending`
  (backlog/paused) or `under_progress` (started — a lifelong daily habit);
  defaults to `pending`. Legacy values `active` and `achieved` are accepted
  and normalized to `under_progress`
- `steps` is replaced wholesale on update — clients send the full list to
  add, rename, reorder, remove or change the status of steps
- `priority` orders the goals themselves and is always contiguous `0..n-1`,
  the same scheme as headers and projects: new goals append at the end,
  changing one goal's priority shifts the others, and deleting a goal closes
  the gap. Goals stored before the field existed are backfilled in name order
  on first read, so existing lists keep their previous order
- Goals are **roadmaps only** — the backend never turns steps into tasks.
  Clients start a step by posting a daily recurring Task (`day_of_week`, all
  seven days) under a Header named **"One Step At A Time"** — an existing
  header with that name is reused; a new one is created only when none exists
  (same find-or-create pattern as event scheduling). The task stays for life;
  pausing a step deletes it client-side, and clients also flip steps back to
  `pending` when the task (or the whole header) is deleted from the todo,
  keeping both views in sync
- Deleting a goal never touches headers or tasks created from its steps
- The cron job ignores the Goals collection entirely

---

### Project (long-term project, multi-step)

```json
{
  "_id": "uuid",
  "name": "string",
  "priority": "number (0-based, contiguous across projects)",
  "tasks": [
    {
      "name": "string",
      "date": "YYYY-MM-DD | null",
      "done": "boolean",
      "todoTaskId": "string | null"
    }
  ],
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Rules:**

- `name` must be a non-empty string (trimmed)
- `priority` is managed exactly like header priority: new projects append at
  the end (`count`), moves shift the affected neighbors, deletes close the
  gap — always contiguous `0..n-1`
- `tasks` is an ordered array (may be empty; defaults to `[]` on create) of
  objects with a non-empty `name` (trimmed), an optional `notes` string
  (default `""`), an optional `date` (`"YYYY-MM-DD"` or `null`, default
  `null`), an optional `done` boolean (default `false`) and an optional
  `todoTaskId` (string or `null`, default `null`)
- `tasks` is replaced wholesale on update — clients send the full list to
  add, rename, reorder, remove or change tasks. On **every** write the
  server re-sorts the list so undone tasks come before done tasks (stable) —
  marking a task done moves it to the bottom, same barrier as the todo
- Giving a project task a `date` creates a one-time `date`-ECD Task in the
  todo under the project's own Header and stores its `_id` in `todoTaskId`.
  The client obtains that header with `POST /headers { name, projectId }`,
  which is idempotent and places the header in the project block for it —
  **where the header sits is the server's business, not the client's**
- Clients keep the task-level state in sync: toggling done on either side
  flips the other, removing the date deletes the todo task, a project task's
  `notes` are mirrored onto the linked todo task when it is created or edited
  (an empty note falls back to a `Step towards "<project>"` default; notes
  flow project→todo only), editing the todo task's name/date updates the
  project task (a cleared or recurring ECD sets the project date to `null`,
  keeping the link), reordering on either side mirrors the relative order of
  linked tasks on the other, and deleting the todo task (or its header)
  clears `todoTaskId` **and** `date` on the project task
- Header-level effects are all server-side: renaming a project renames its
  header, moving a project re-orders the header block, and deleting a project
  unlinks its header (see "Project header ordering" under the Header model)
- Cron step 4 completes the loop: when it deletes a done todo task whose
  `_id` appears as a `todoTaskId`, the project task is marked `done: true`
  with `todoTaskId` cleared (`date` is kept for the record) and the list is
  re-sorted — the task leaves the todo but is retained in the project as a
  completed step
- Deleting a project keeps its header and the tasks created from it; only the
  header's `projectId` is cleared

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
| `task_completed`   | Cron step 4 · `Task.deleteByHeader` | A done task captured (with `plannedFor`, `doneAt`, `headerName`) before deletion — logged both when cron step 4 removes a completed one-off task **and** when a header delete cascades over its done tasks (any ECD type), so completion history is never orphaned |
| `task_rescheduled` | `Task.update`         | An ECD change: `{ taskId, taskName, headerId, headerName, fromEcd, toEcd, pushedLater, reason }`. `pushedLater` is `true` when a one-time `date` moves later (a postpone). `reason` is the user's optional stated cause for the postpone (`null` when none, or when the reason was blank). A pushed-later reschedule with `reason: null` is unexcused procrastination; a valid stated reason is a legitimate deferral. The reason rides in on the `PUT /tasks/:id` body and is **never** written to the task document. |
| `task_deleted`     | `Task.delete`         | An **undone** task deleted manually, with the user's `reason`: `{ taskId, taskName, headerId, headerName, ecdType, ecd, reason, taskCreatedAt }`. Logged only for undone tasks (done tasks log nothing); `reason` is `null` when none is supplied. Header-cascade deletes (`Task.deleteByHeader`) do **not** log `task_deleted` for their undone tasks, but their **done** tasks are archived as `task_completed`. |
| `call_result`      | Cron step 8           | A call's done/missed outcome for one period, logged at the period boundary before the reset: `{ callId, callName, frequency, dueDate, completed, doneAt }` (`dueDate` = the reset day; no header fields — calls have no header) |

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
  "model": "claude-sonnet-4-6",
  "stats": "exact computed stats the report was based on",
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

Reports are generated at the end of every cron run (when `ANTHROPIC_API_KEY`
is set) and on demand via `POST /insights/generate`. The previous report is
fed into the next generation so suggestions build on each other. Tasks
scheduled by `day_of_week` are treated as **habits**; everything else is a
task. Calls feed in two ways: `call_result` archive events become a `calls`
stats array (per person: `scheduled`, `completed`, `completionRate`,
`currentMissStreak`, `recentResults`), and the live call list is sent as
`currentCalls` so the report can flag people not yet called this period.
`callReminders` is required in newly generated reports (empty array when no
calls are set up) but absent from reports stored before the feature — clients
must tolerate its absence.

Manually deleting an **undone** task logs a `task_deleted` archive event with
the user's stated `reason`. These feed insights as a `deletions` stats block
(`{ count, withReason, recent }`, where `recent` items carry `taskName`,
`headerName`, `ecdType`, `reason`) plus a `deleted` count in each `byHeader`
bucket; the raw reasons ride along in the recent events. The report interprets
them as abandoned intentions — separating healthy pruning from avoidance — in a
required `deletionInsights` array (empty when nothing was deleted; absent from
reports stored before the feature, so clients must tolerate its absence).

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

#### Step 1 — Mark undone: `day_of_year` _(runs daily)_

- For every task with `ecd.type === "day_of_year"` whose stored year is in the **past** (tasks already set to the current or a future year are skipped):
  - Resolve the stored day against the current year — Feb 29 resolves to Feb 28 in a non-leap year
  - If the resolved month/day is today: advance the year to **today's year** (e.g. `7/3/2006` → `7/3/2026` when run on March 7 2026), set `done = false`, `doneAt = null`, update `updatedAt`
- The stored **day is never rewritten** — only the year advances. A Feb 29 task
  fires on Feb 28 in non-leap years and is still a Feb 29 task in the next leap
  year. A run that resolved a Feb 29 counts towards `tasksClamped`

#### Step 2 — Mark undone: `day_of_week`

- For every task with `ecd.type === "day_of_week"`:
  - If today's day name (e.g. `"Mon"`) is in `ecd.value`:
    - Set `done = false`, `doneAt = null`
    - Update `updatedAt`

#### Step 3 — Mark undone: `day_of_month`

- For every task with `ecd.type === "day_of_month"`, resolve `ecd.value` against
  the current month: any day the month is too short for counts as the month's
  **last day** (so `[31]` is due on Feb 28, and `[30, 31]` both resolve to the
  28th)
- If today's date number is among the resolved days:
  - Set `done = false`, `doneAt = null`
  - Update `updatedAt`
- Resolution happens on read only — `ecd.value` is **never** rewritten, so "the
  31st" is still the 31st in the next long month. A run that had to resolve a
  too-large day counts towards `tasksClamped`

#### Step 4 — Delete completed `date` tasks

- For every task with `ecd.type === "date"` (or no ECD):
  - If `done === true` → archive a `task_completed` event (preserving `plannedFor`, `taskCreatedAt`, `doneAt`, `headerName`), then **delete** the task
  - If `done === false` → do nothing
- After deleting, sync long-term projects: for every project task whose
  `todoTaskId` matches a deleted task's `_id`, set `done = true`, clear
  `todoTaskId` (keep `date` for the record) and re-sort the project's task
  list so done tasks sit at the bottom. The task leaves the todo but is
  retained in the project as a completed step. Counted in the run stats as
  `projectTasksCompleted`
- Life events sync the same way: for every life event whose `todoTaskId`
  matches a deleted task's `_id`, set `done = true` and clear `todoTaskId`.
  The event itself is **never deleted** — it fires again on its next
  anniversary. Counted in the run stats as `lifeEventsCompleted`

#### Step 5 — Delete empty headers & re-assert header order

Runs after step 4 so headers emptied by task deletion are cleaned up in the
same run:

- Any header that has **no tasks** is deleted (including headers that were
  never given a task). Counted in the run stats as `headersDeleted`
- The surviving headers are then re-numbered by the same routine the API uses
  (see "Project header ordering" under the Header model): priorities stay
  contiguous (`0..n-1`) **and** project headers stay in their projects' order
  as one block. Counted in the run stats as `headersReprioritized`
- Applying both rules here is what keeps the cron and the clients in
  agreement — plain re-numbering could leave a project header above the todo's
  topmost ordinary header, and the next project action would then visibly
  reshuffle the list
- The same pass repairs `projectId` links (backfill by name, clear when the
  project is gone)

#### Step 6 — Add due life events to the todo

- For every life event whose `lastAddedYear` is behind the current year:
  - Resolve the stored `"D/M"` against the current year — Feb 29 resolves to
    Feb 28 in a non-leap year (the stored day is never rewritten)
  - If the resolved month/day is today **and** the event's linked task (if
    any) no longer exists: create a one-time Task named after the event with
    `ecd: { type: "date", value: today }` under a Header named **"Events"**
    (matched case-insensitively; created at the end of the list when none
    exists), then set `todoTaskId` to the new task's `_id`, `done = false`
    and `lastAddedYear` = today's year. Counted in the run stats as
    `lifeEventTasksCreated`
- The `lastAddedYear` advance is what makes same-day reruns idempotent — even
  after the task was completed and cleaned up by a rerun's step 4, the event
  cannot fire twice in one year (the same year-advance trick step 1 uses)
- An event whose linked task **still exists** (last year's occurrence never
  completed) is skipped without advancing `lastAddedYear`: the pending task
  already represents it in the todo, so occurrences don't stack
- Runs after step 5 so the header landscape is settled, and before step 7 so
  the new task is sorted into place by its ECD (a task due today sorts to the
  top of its header)

#### Step 7 — Reorder priorities per header

- For each header, collect all its tasks and sort as follows:
  1. **Undone tasks** (`done === false`) — sorted by next upcoming ECD date **ascending** → assigned priorities `0, 1, 2, ...` (sooner = closer to 0)
  2. **Done tasks** (`done === true`) — assigned the remaining higher priority values after all undone tasks
- Ties (two tasks due the same day) keep their **existing relative order** — the
  sort is stable, so a manual ordering within a single day survives the run
- Only `priority` is written; `updatedAt` is deliberately left alone, so
  "recently edited" keeps meaning "the user edited it"

##### Resolving "next upcoming ECD date" for sorting

| `type`         | Next due date                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| `date`         | The date value itself (a past date sorts first — overdue work surfaces)        |
| `day_of_week`  | The nearest upcoming day from the `value` array, today included               |
| `day_of_month` | The nearest upcoming date in the current or next month from the `value` array, each clamped to that month's length |
| `day_of_year`  | The **next anniversary** of the stored day/month on or after today, Feb 29 clamped to Feb 28 in non-leap years. The stored year records the last occurrence the cron consumed, not the next one, so it is not used here |
| _none_         | Infinity — no-ECD tasks sort last among undone tasks                           |

#### Step 8 — Archive call outcomes and reset calls at period boundaries _(runs last)_

Calls are independent of tasks/headers, so this step runs after all task
steps. Biweekly calls are due twice per month (periods 1st–14th and
15th–end), monthly calls once; the reset clears the "called" checkmark at
each period boundary:

- If today (UTC) is the **15th** of the month: `biweekly` calls are due
- If today (UTC) is the **last day** of the month: **all** calls are due, both `biweekly` and `monthly`
- On any other day: no-op
- For every due call (done **and** missed): log a `call_result` archive event `{ callId, callName, frequency, dueDate: today, completed: call.done, doneAt }` **before** resetting, so insights can track miss patterns. Idempotent: calls already archived for this `dueDate` are skipped on manual re-runs.
- Then reset every due call that is done → `done = false`, `doneAt = null`, update `updatedAt` (the `callsReset` stat counts only these resets, not archive events)

#### Final step — Generate the daily AI insight report

- After step 8, when `ANTHROPIC_API_KEY` is set (and not in test mode):
  - Compute exact stats over the last 28 days of `TaskArchive` events (habit completion rates, streaks, missed-by-weekday, task slippage, reschedule counts, per-person call completion and miss streaks)
  - Fetch the live call list and include it as `currentCalls` in the prompt payload
  - Send stats + recent events + the previous report to `claude-sonnet-4-6` with a structured-output schema
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
  { "_id": "uuid", "name": "Work", "priority": 0, "projectId": null },
  { "_id": "uuid", "name": "Automated Stock Market", "priority": 1, "projectId": "uuid" }
]
```

---

#### `POST /headers`

Creates a new header. Priority is automatically assigned as `total headers` (added at end).

Passing `projectId` marks the header as the todo home of that long-term
project. Such a header is placed in the project block (see "Project header
ordering" under the Header model) instead of at the bottom, and the call is
**idempotent**: if the project already has a header — or a pre-`projectId`
header matches the project by name — that header is adopted and returned with
`200` instead of a duplicate being created.

**Request body**

```json
{
  "name": "string",
  "projectId": "ref → Project._id | null (optional)"
}
```

**Response `201`** (created) / **`200`** (existing project header reused)

```json
{
  "_id": "uuid",
  "name": "Work",
  "priority": 2,
  "projectId": null
}
```

**Response `400`** — `projectId` is neither a valid id string nor `null`

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

Deletes a header and all tasks associated with it. Shifts priorities of remaining headers down to keep contiguous. Any **done** tasks are archived as `task_completed` events before deletion so their completion history isn't orphaned; undone tasks are removed without archiving.

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
    "doneAt": null,
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

**Request body (optional)** — a deletion `reason`. When the deleted task is **undone**, the reason is archived as a `task_deleted` event and surfaced to AI insights; clients require it for undone tasks. Deleting a *done* task ignores the reason.

```json
{
  "reason": "No longer relevant this week"
}
```

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

**Response `400`** — `reason` is present but not a string.

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

### Life Events

#### `GET /lifeevents`

Returns all life events sorted by `priority` ascending.

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Wife's birthday",
    "date": "7/3",
    "lastAddedYear": 2026,
    "done": false,
    "todoTaskId": null,
    "priority": 0,
    "createdAt": "2026-07-10T00:00:00Z",
    "updatedAt": "2026-07-10T00:00:00Z"
  }
]
```

---

#### `POST /lifeevents`

Creates a new life event. `priority` is auto-assigned (appended at end);
`lastAddedYear` is baselined server-side (see the model rules).

**Request body**

```json
{
  "name": "string",
  "date": "D/M"
}
```

**Response `201`** — returns created life event with defaults applied

---

#### `PUT /lifeevents/:id`

Updates a life event's `name`, `date`, `done`, `todoTaskId` and/or
`priority`. A date **change** re-baselines `lastAddedYear`; a priority change
shifts the other life events to keep contiguous `0..n-1` order. Clients
toggle `done` here when the linked todo task is toggled (and vice versa) so
the two views agree.

**Response `200`** — returns updated life event

---

#### `DELETE /lifeevents/:id`

Deletes a life event and closes the priority gap. The todo task created from
it this year (if any) remains.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Affirmations

#### `GET /affirmations`

Returns all affirmations sorted by `createdAt` ascending (order added).

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Thank you blessing",
    "createdAt": "2026-07-10T00:00:00Z",
    "updatedAt": "2026-07-10T00:00:00Z"
  }
]
```

---

#### `POST /affirmations`

Creates a new affirmation.

**Request body**

```json
{
  "name": "string"
}
```

**Response `201`** — returns created affirmation with timestamps

---

#### `PUT /affirmations/:id`

Updates an affirmation's name. Validated the same as on create.

**Response `200`** — returns updated affirmation

---

#### `DELETE /affirmations/:id`

Deletes an affirmation.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Calls

#### `GET /calls`

Returns all calls sorted by `createdAt` ascending (order added).

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Grandma",
    "frequency": "biweekly",
    "done": false,
    "doneAt": null,
    "createdAt": "2026-07-10T00:00:00Z",
    "updatedAt": "2026-07-10T00:00:00Z"
  }
]
```

---

#### `POST /calls`

Creates a new call. New calls start undone (`done = false`, `doneAt = null`).

**Request body**

```json
{
  "name": "string",
  "frequency": "biweekly | monthly"
}
```

**Response `201`** — returns created call with timestamps

---

#### `PUT /calls/:id`

Updates a call's name, frequency, and/or done state. Fields are optional but
validated the same as on create when present (`done` must be a boolean).
Setting `done = true` stamps `doneAt`; setting `done = false` clears it.

**Response `200`** — returns updated call

---

#### `DELETE /calls/:id`

Deletes a call.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Goals

#### `GET /goals`

Returns all goals sorted by `name` ascending.

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Improve Health",
    "steps": [
      { "name": "Wake up at 6", "status": "under_progress" },
      { "name": "Have 1 fruit a day", "status": "pending" }
    ],
    "createdAt": "2026-07-11T00:00:00Z",
    "updatedAt": "2026-07-11T00:00:00Z"
  }
]
```

---

#### `POST /goals`

Creates a new goal. `steps` is optional (defaults to `[]`); each step's
`status` defaults to `pending`.

**Request body**

```json
{
  "name": "string",
  "steps": [{ "name": "string", "status": "pending | under_progress" }]
}
```

**Response `201`** — returns created goal with timestamps

---

#### `PUT /goals/:id`

Updates a goal's name and/or step list. Fields are optional but validated
the same as on create when present. `steps` is replaced wholesale (an empty
array clears it).

**Response `200`** — returns updated goal

---

#### `DELETE /goals/:id`

Deletes a goal. Headers/tasks previously created from its steps remain.

**Response `200`**

```json
{
  "deleted": "uuid"
}
```

---

### Projects

#### `GET /projects`

Returns all projects sorted by `priority` ascending.

**Response `200`**

```json
[
  {
    "_id": "uuid",
    "name": "Automated Stock Market",
    "priority": 0,
    "tasks": [
      {
        "name": "get data from EODHD",
        "notes": "use the v2 API key",
        "date": "2026-08-01",
        "done": false,
        "todoTaskId": "uuid"
      },
      {
        "name": "get data from Nasdaq",
        "notes": "",
        "date": null,
        "done": false,
        "todoTaskId": null
      }
    ],
    "createdAt": "ISO 8601 datetime",
    "updatedAt": "ISO 8601 datetime"
  }
]
```

---

#### `POST /projects`

Creates a project. `name` required (non-empty, trimmed); `tasks` optional
(defaults to `[]`, validated and re-sorted undone-first as described in the
model rules). `priority` is auto-assigned (appended at the end).

**Response `201`** — the created project.

---

#### `PUT /projects/:id`

Updates `name`, `tasks` and/or `priority`. `tasks` is replaced wholesale and
re-sorted so done tasks sit at the bottom; `priority` moves shift the other
projects to stay contiguous (same as headers).

**Response `200`** — the updated project. **`400`** on validation errors
(including out-of-range priority), **`404`** when not found.

---

#### `DELETE /projects/:id`

Deletes a project and shifts remaining priorities. Its todo header and the
tasks previously created from its dated tasks remain, but the header's
`projectId` is cleared so it leaves the ordered project block.

**Response `200`**

```json
{
  "deleted": "uuid",
  "headersUnlinked": 1
}
```

---

### Cron

#### `POST /cron/run`

Manually triggers the cron job. Accepts optional `date` (run as if it were that date) and `skipInsights` (skip step 8's AI report — used by e2e tests) body fields. Runs all steps in order:

0. Archive yesterday's habit/recurring outcomes (idempotent)
1. Mark undone: `day_of_year` _(daily — advance the year and reset when today matches the task's month/day; Feb 29 resolves to Feb 28 in non-leap years)_
2. Mark undone: `day_of_week`
3. Mark undone: `day_of_month` _(values are resolved against the current month's length; the stored value is never rewritten)_
4. Archive + delete completed `date` tasks (and mark linked long-term project tasks and life events done)
5. Delete headers with no tasks & re-assert header order (contiguous, project headers in project order)
6. Add due life events to the todo _(a linked date task under the "Events" header, once per year)_
7. Reorder priorities per header
8. Reset done calls _(if today is the 15th: biweekly only; if today is the last day of the month: all)_
9. Generate the daily AI insight report _(when `ANTHROPIC_API_KEY` is set and the request did not pass `skipInsights: true` — not a numbered step)_

**Response `200`**

```json
{
  "ranAt": "2026-03-26T00:00:00Z",
  "tasksDeleted": 2,
  "tasksMarkedUndone": 5,
  "tasksClamped": 1,
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 3,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "outcomesArchived": 4,
  "callsReset": 0,
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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 3,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "callsReset": 0
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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 3,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "callsReset": 0
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
  "headersDeleted": 0,
  "headersReprioritized": 2,
  "headersReordered": 3,
  "projectTasksCompleted": 1,
  "lifeEventsCompleted": 0,
  "lifeEventTasksCreated": 1,
  "callsReset": 0
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
