# Test Reference

---

## tests/crud.test.js

Basic API contract — does each endpoint accept the right input and return the right shape?

### Headers CRUD

| Test                                                    | What it checks                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| returns empty array when no headers exist               | `GET /headers` returns `[]` on a clean DB                                       |
| creates a header and assigns priority 0 as first header | `POST /headers` returns 201 with `_id`, correct `name`, `priority: 0`           |
| second header gets priority 1                           | Each new header gets appended at the end                                        |
| rejects missing name                                    | `POST /headers {}` → 400                                                        |
| rejects empty name                                      | `POST /headers { name: "  " }` → 400                                            |
| trims whitespace from name                              | `"  Trimmed  "` is stored as `"Trimmed"`                                        |
| returns all headers sorted by priority                  | `GET /headers` array is ascending by `priority`                                 |
| updates header name                                     | `PUT /headers/:id { name }` → 200, new name returned                            |
| trims whitespace from name on update                    | Same trim rule applies on PUT                                                   |
| updates header priority and shifts others               | Moving header from 0→1 causes the old priority-1 header to shift to 0           |
| returns 404 for nonexistent id (PUT)                    | Fake ObjectId → 404                                                             |
| deletes header and returns deleted id + tasksDeleted    | `DELETE /headers/:id` returns `{ deleted, tasksDeleted: 2 }` and tasks are gone |
| returns 404 for nonexistent id (DELETE)                 | Fake ObjectId → 404                                                             |
| tasksDeleted is 0 when header has no tasks              | Deleting an empty header reports `tasksDeleted: 0`                              |

### Tasks CRUD

| Test                                          | What it checks                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| creates a task with required fields           | `POST /tasks` returns 201 with all fields: `_id`, `name`, `headerId`, `priority: 0`, `done: false`, `notes: ""`, `ecd: null`, `createdAt`, `updatedAt` |
| creates a task with all fields                | `name`, `notes`, `ecd` all persist correctly                                                                                                           |
| rejects task without name                     | 400                                                                                                                                                    |
| rejects task without headerId                 | 400                                                                                                                                                    |
| rejects task with nonexistent headerId        | 404                                                                                                                                                    |
| trims whitespace from name                    | `"  Trimmed  "` → `"Trimmed"`                                                                                                                          |
| returns tasks sorted by priority for headerId | `GET /tasks?headerId=` returns array ascending by `priority`                                                                                           |
| returns empty array for header with no tasks  | 200 with `[]`, not a 404                                                                                                                               |
| returns 400 when headerId is missing          | `GET /tasks` with no query param → 400                                                                                                                 |
| returns 404 for nonexistent headerId          | Fake ObjectId → 404                                                                                                                                    |
| updates task name                             | `PUT /tasks/:id { name }` → 200 with new name                                                                                                          |
| updates task notes                            | `PUT /tasks/:id { notes }` → persists                                                                                                                  |
| clears notes back to empty string             | `{ notes: "" }` → stored as `""`                                                                                                                       |
| updates ecd                                   | `{ ecd: { type, value } }` → persists the new ECD                                                                                                      |
| updatedAt changes on every write              | After a PUT, `updatedAt` is newer                                                                                                                      |
| createdAt is not changed by a PUT             | `createdAt` stays the same across writes                                                                                                               |
| returns 404 for nonexistent id (PUT)          | Fake ObjectId → 404                                                                                                                                    |
| empty body returns current task unchanged     | `PUT {}` → task fields are identical                                                                                                                   |
| same priority value is a no-op                | `PUT { priority: <current> }` → no shifts, priorities stay contiguous                                                                                  |
| can update done and name in the same request  | `{ done: true, name: "..." }` → both fields updated in one call                                                                                        |
| setting ecd to null clears the ecd field      | `PUT { ecd: null }` → `ecd` becomes `null`                                                                                                             |
| deletes a task and returns deleted id         | `DELETE /tasks/:id` → `{ deleted: id }`                                                                                                                |
| returns 404 for nonexistent id (DELETE)       | Fake ObjectId → 404                                                                                                                                    |

---

## tests/events.test.js

Events CRUD — reusable task bundles (templates only; scheduling happens client-side).

| Test                                          | What it checks                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| returns empty array when no events exist      | `GET /events` returns `[]` on a clean DB                                     |
| creates an event with a task list             | `POST /events` returns 201 with `_id`, `name`, `tasks`, timestamps           |
| rejects missing name                          | `POST /events { tasks }` → 400                                               |
| rejects empty name                            | `{ name: "  " }` → 400                                                       |
| rejects missing tasks                         | `POST /events { name }` → 400                                                |
| rejects empty tasks array                     | `{ tasks: [] }` → 400                                                        |
| rejects tasks containing empty strings        | `{ tasks: ["Fine", "  "] }` → 400                                            |
| trims whitespace from name and tasks          | `"  Trimmed  "` → `"Trimmed"`; task entries trimmed too                      |
| returns all events sorted by name ascending   | `GET /events` array is ascending by `name`                                   |
| updates event name                            | `PUT /events/:id { name }` → 200, tasks untouched                            |
| updates event tasks                           | `PUT /events/:id { tasks }` → 200, name untouched                            |
| rejects empty tasks array (PUT)               | `{ tasks: [] }` → 400                                                        |
| rejects empty name (PUT)                      | `{ name: "" }` → 400                                                         |
| returns 404 for unknown id (PUT)              | Fake ObjectId → 404                                                          |
| deletes an event                              | `DELETE /events/:id` → `{ deleted: id }`                                     |
| returns 404 when deleting again               | Second delete → 404                                                          |

---

## tests/affirmations.test.js

Affirmations CRUD — single short lines the user reads daily (completely independent of tasks/headers).

| Test                                                  | What it checks                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| returns empty array when no affirmations exist        | `GET /affirmations` returns `[]` on a clean DB                                |
| creates an affirmation                                | `POST /affirmations` returns 201 with `_id`, `name`, timestamps               |
| rejects missing name                                  | `POST /affirmations {}` → 400                                                 |
| rejects empty name                                    | `{ name: "  " }` → 400                                                        |
| rejects non-string name                               | `{ name: 42 }` → 400                                                          |
| trims whitespace from name                            | `"  I am at peace  "` → `"I am at peace"`                                     |
| returns all affirmations sorted by createdAt ascending | `GET /affirmations` array is ascending by `createdAt` (order added)          |
| updates affirmation name                              | `PUT /affirmations/:id { name }` → 200 with new name                          |
| rejects empty name (PUT)                              | `{ name: "" }` → 400                                                          |
| returns 404 for unknown id (PUT)                      | Fake ObjectId → 404                                                           |
| deletes an affirmation                                | `DELETE /affirmations/:id` → `{ deleted: id }`                                |
| returns 404 when deleting again                       | Second delete → 404                                                           |

---

## tests/calls.test.js

Calls CRUD — people the user must call biweekly or monthly (completely independent of tasks/headers; done checkmarks are reset by cron step 7).

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns empty array when no calls exist               | `GET /calls` returns `[]` on a clean DB                                        |
| creates a call with done=false and doneAt=null        | `POST /calls` returns 201 with `_id`, `name`, `frequency`, `done: false`, `doneAt: null`, timestamps |
| creates a monthly call                                | `frequency: "monthly"` persists                                                |
| rejects missing name                                  | `POST /calls { frequency }` → 400                                              |
| rejects empty name                                    | `{ name: "  " }` → 400                                                         |
| rejects non-string name                               | `{ name: 42 }` → 400                                                           |
| rejects missing frequency                             | `POST /calls { name }` → 400                                                   |
| rejects invalid frequency                             | `{ frequency: "weekly" }` → 400                                                |
| trims whitespace from name                            | `"  Aunt May  "` → `"Aunt May"`                                                |
| returns all calls sorted by createdAt ascending       | `GET /calls` array is ascending by `createdAt` (order added)                   |
| updates call name                                     | `PUT /calls/:id { name }` → 200 with new name, frequency untouched             |
| updates call frequency                                | `PUT /calls/:id { frequency }` → 200 with new frequency                        |
| setting done=true stamps doneAt with an ISO datetime  | `{ done: true }` → `doneAt` is a valid ISO string                              |
| setting done=false clears doneAt                      | `{ done: false }` → `doneAt: null`                                             |
| rejects empty name (PUT)                              | `{ name: "" }` → 400                                                           |
| rejects invalid frequency (PUT)                       | `{ frequency: "daily" }` → 400                                                 |
| rejects non-boolean done (PUT)                        | `{ done: "yes" }` → 400                                                        |
| returns 404 for unknown id (PUT)                      | Fake ObjectId → 404                                                            |
| returns 500 for a malformed ObjectId (PUT)            | `not-a-valid-id` throws in the model → 500 `{ error }`                         |
| deletes a call                                        | `DELETE /calls/:id` → `{ deleted: id }`                                        |
| returns 404 when deleting again                       | Second delete → 404                                                            |
| returns 500 for a malformed ObjectId (DELETE)         | `not-a-valid-id` → 500 `{ error }`                                             |

---

## tests/goals.test.js

Goals CRUD — habit backlogs built one step at a time (roadmaps only; starting/finishing a step happens client-side).

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns empty array when no goals exist               | `GET /goals` returns `[]` on a clean DB                                        |
| creates a goal with a step list                       | `POST /goals` returns 201 with `_id`, `name`, `steps`, timestamps; omitted step status defaults to `pending` |
| creates a goal without steps (defaults to empty list) | `POST /goals { name }` → 201 with `steps: []`                                  |
| rejects missing name                                  | `POST /goals { steps }` → 400                                                  |
| rejects empty name                                    | `{ name: "  " }` → 400                                                         |
| rejects steps that are not an array                   | `{ steps: "Wake up at 6" }` → 400                                              |
| rejects steps that are plain strings                  | `{ steps: ["Wake up at 6"] }` → 400 (steps must be objects)                    |
| rejects steps with empty names                        | `{ steps: [{ name: "  " }] }` → 400                                            |
| rejects steps with an invalid status                  | `{ status: "done" }` → 400 (must be `pending`/`under_progress`)                |
| normalizes legacy statuses (achieved, active) to under_progress | `{ status: "achieved" }` and `{ status: "active" }` → 201 with `status: "under_progress"` (pre-rename data stays editable) |
| trims whitespace from name and step names             | `"  Trimmed  "` → `"Trimmed"`; step names trimmed too                          |
| returns all goals sorted by name ascending            | `GET /goals` array is ascending by `name`                                      |
| updates goal name                                     | `PUT /goals/:id { name }` → 200, steps untouched                               |
| updates goal steps (replace wholesale)                | `PUT /goals/:id { steps }` → 200, name untouched; status changes persist       |
| allows clearing steps with an empty array             | `{ steps: [] }` → 200 with `steps: []` (unlike events)                         |
| rejects steps with an invalid status (PUT)            | `{ status: "started" }` → 400                                                  |
| rejects empty name (PUT)                              | `{ name: "" }` → 400                                                           |
| returns 404 for unknown id (PUT)                      | Fake ObjectId → 404                                                            |
| deletes a goal                                        | `DELETE /goals/:id` → `{ deleted: id }`                                        |
| returns 404 when deleting again                       | Second delete → 404                                                            |

---

## tests/business-logic.test.js

Validates the priority/ordering rules the spec defines.

### Header Priority Logic

| Test                                                 | What it checks                                            |
| ---------------------------------------------------- | --------------------------------------------------------- |
| headers are appended at the end on insert            | A, B, C get priorities 0, 1, 2 in order                   |
| deleting a header shifts remaining priorities down   | Delete middle (priority 1) → remaining are 0, 1 (no gaps) |
| updating header priority (move down: 0→2)            | Moving A to 2 shifts B→0, C→1                             |
| updating header priority (move up: 2→0)              | Moving C to 0 shifts A→1, B→2                             |
| updating name and priority together                  | Both changes apply in one call                            |
| PUT with empty body returns current header unchanged | `PUT {}` is a no-op                                       |
| PUT with same priority value is a no-op              | No shifting occurs when priority doesn't change           |

### Task Priority: Insertion Logic

| Test                                              | What it checks                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| new tasks are inserted before the first done task | After marking T1 done, new task T2 gets priority 0 (before the done task) |

### Task Priority: Done/Undone Toggle

| Test                                                       | What it checks                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| marking a task done moves it to last priority              | T2 (middle) marked done → priority 2; T3 shifts up to 1             |
| marking a task undone moves it just before first done task | All tasks done → unmark one → it lands before the done block        |
| priorities remain contiguous after done/undone toggles     | After toggling multiple tasks, priorities are exactly `[0,1,2,3,4]` |

### Task Priority: Manual Reorder

| Test                                               | What it checks                                |
| -------------------------------------------------- | --------------------------------------------- |
| manually reordering task (move down: 0→2)          | T1 to priority 2 → T2 becomes 0, T3 becomes 1 |
| deleting a task reorders remaining task priorities | Delete middle → T1 and T3 become 0 and 1      |
| manually reordering task (move up: 2→0)            | T3 to priority 0 → T1 becomes 1, T2 becomes 2 |

### Task Priority: Insertion — Edge Cases

| Test                                                            | What it checks                                       |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| new task gets priority 0 when no tasks exist                    | First task in a header always gets priority 0        |
| new task inserts at priority 0 when all existing tasks are done | If every task is done, new undone task goes to front |

### Task Priority: Done/Undone Toggle — No-ops

| Test                                                        | What it checks                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| done:true on already-done task does not shift priorities    | Sending `done: true` when already done → no priority changes    |
| done:false on already-undone task does not shift priorities | Sending `done: false` when already undone → no priority changes |

---

## tests/ecd-validation.test.js

Validates every ECD type's accepted and rejected values.

### type: date

| Test                                                  | What it checks                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| accepts valid YYYY-MM-DD value                        | `"2026-12-31"` → 201                                               |
| rejects non-date string                               | `"not-a-date"` → 400                                               |
| rejects wrong format (D/M/YYYY instead of YYYY-MM-DD) | `"25/12/2026"` → 400 (that format is only valid for `day_of_year`) |

### type: day_of_week

| Test                             | What it checks              |
| -------------------------------- | --------------------------- |
| accepts valid array of day names | `["Mon","Wed","Fri"]` → 201 |
| rejects invalid day names        | `["Monday","Weds"]` → 400   |
| rejects empty array              | `[]` → 400                  |
| rejects non-array value          | `"Mon"` (string) → 400      |

### type: day_of_month

| Test                                 | What it checks    |
| ------------------------------------ | ----------------- |
| accepts valid array of integers 1–31 | `[1,15,31]` → 201 |
| rejects values out of range          | `[0,32]` → 400    |
| rejects non-integer values           | `[1.5,10]` → 400  |
| rejects empty array                  | `[]` → 400        |

### type: day_of_year

| Test                               | What it checks       |
| ---------------------------------- | -------------------- |
| accepts valid D/M/YYYY string      | `"7/3/2006"` → 201   |
| accepts single-digit day and month | `"1/1/2030"` → 201   |
| rejects YYYY-MM-DD format          | `"2026-12-31"` → 400 |
| rejects non-string value           | `[7,3,2006]` → 400   |

### ecd: null / omitted

| Test                                    | What it checks                    |
| --------------------------------------- | --------------------------------- |
| task with no ecd field stores null      | Omitting `ecd` → stored as `null` |
| task with explicit null ecd stores null | `ecd: null` → stored as `null`    |

### invalid ecd type

| Test                          | What it checks            |
| ----------------------------- | ------------------------- |
| rejects unknown ecd type      | `type: "weekly"` → 400    |
| rejects ecd as a plain string | `ecd: "2026-12-31"` → 400 |

---

## tests/error-handling.test.js

Ensures every error case returns the right HTTP status and `{ error: "..." }` shape.

### POST /headers errors

| Test                     | Status |
| ------------------------ | ------ |
| name missing             | 400    |
| name empty string        | 400    |
| name non-string (number) | 400    |

### PUT /headers/:id errors

| Test                                         | Status |
| -------------------------------------------- | ------ |
| nonexistent id                               | 404    |
| priority too large                           | 400    |
| priority equals count (exact upper boundary) | 400    |
| priority equals count+1                      | 400    |
| priority negative                            | 400    |
| priority float                               | 400    |
| priority string                              | 400    |
| name empty string                            | 400    |
| name whitespace-only                         | 400    |

### DELETE /headers/:id errors

| Test           | Status |
| -------------- | ------ |
| nonexistent id | 404    |

### GET /tasks errors

| Test                 | Status |
| -------------------- | ------ |
| headerId missing     | 400    |
| nonexistent headerId | 404    |

### POST /tasks errors

| Test                 | Status |
| -------------------- | ------ |
| name missing         | 400    |
| headerId missing     | 400    |
| nonexistent headerId | 404    |
| invalid ecd type     | 400    |

### PUT /tasks/:id errors

| Test                  | Status |
| --------------------- | ------ |
| nonexistent id        | 404    |
| done not a boolean    | 400    |
| name empty string     | 400    |
| invalid ecd on update | 400    |
| priority too large    | 400    |
| priority negative     | 400    |
| priority float        | 400    |
| priority string       | 400    |

### DELETE /tasks/:id errors

| Test           | Status |
| -------------- | ------ |
| nonexistent id | 404    |

---

## tests/collections.test.js

Checks DB-level concerns and cross-header isolation.

| Test                                                     | What it checks                                                |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Headers and Tasks are stored in separate collections     | A header's `_id` doesn't appear in Tasks-Test and vice versa  |
| deleting a header cascades to delete its tasks           | After `DELETE /headers/:id`, all child tasks are gone from DB |
| tasks from different headers are isolated in priority    | H1 has priorities 0,1; H2 independently has priority 0        |
| GET /tasks only returns tasks for the specified headerId | Tasks from H1 never appear in H2's results                    |

---

## tests/chron.test.js

Tests every step of the cron job using direct `runCron()` calls with a date override.

| Test                                                            | What it checks                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| deletes done date tasks and leaves undone date tasks            | Step 5: done `date` tasks deleted; undone `date` tasks untouched       |
| deletes done no-ecd tasks                                       | Step 5: done tasks with `ecd: null` are also archived and deleted      |
| does not delete done recurring tasks (dow, dom, doy)            | Step 5: recurring ECD types are never deleted, even when done          |
| marks done day_of_week tasks undone when today's day matches    | Step 3: `done: true` → `done: false` when day name matches             |
| does not affect day_of_week tasks whose day does not match      | Step 3: no change when today's day is not in `ecd.value`               |
| marks done day_of_month tasks undone when today's date matches  | Step 4: same logic for day-of-month                                    |
| updates year and marks undone when today matches task month/day | Step 2: past-year value advanced to today's year, `done` reset to false |
| does not update task when today does not match task month/day   | Step 2: non-matching day → ECD value and `done` untouched              |
| clamps Feb 29 to Feb 28 on Feb 28 of a non-leap year            | Step 2: `29/2/<past year>` → `28/2/<current year>` and reset           |
| clamps values exceeding days in that month on the 1st           | Step 1: `[15, 30, 31]` in February → `[15, 28, 28]`                    |
| does NOT clamp on non-1st of month                              | Step 1: skipped except on the 1st                                      |
| undone tasks are sorted before done tasks after cron            | Step 6: all undone tasks have lower priority than all done tasks       |
| undone tasks are ordered by soonest upcoming ECD across all types, null ECD last | Step 6: date/day_of_week/day_of_month resolve to their next due date and sort ascending (a day-of-month value that already passed rolls to next month); no-ECD tasks sort last among undone |
| resets done biweekly calls on the 15th, monthly untouched       | Step 7: run on `2026-03-15` → done biweekly call reset (`done: false`, `doneAt: null`), done monthly call untouched, `callsReset: 1` |
| resets ALL done calls on the last day of the month              | Step 7: run on `2026-03-31` → both biweekly and monthly done calls reset, `callsReset: 2` |
| treats Feb 28 as the last day of a non-leap February            | Step 7: run on `2026-02-28` → all done calls reset (2026 is not a leap year)   |
| does not reset any calls mid-month                              | Step 7: run on `2026-03-10` → no-op, `callsReset: 0`, done calls stay done     |
| leaves undone calls untouched on the 15th                       | Step 7: undone calls (both frequencies) keep `done: false` and their `updatedAt` |
| archives call_result for due biweekly calls (done and missed) on the 15th | Step 7: run on `2026-03-15` → `call_result` events for done (completed: true, doneAt set) and missed (completed: false) biweekly calls; monthly call not logged |
| archives call_result for ALL calls on the last day of the month | Step 7: run on `2026-03-31` → both biweekly and monthly calls logged with `dueDate: 2026-03-31` |
| does not double-log call_result when cron re-runs for the same date | Step 7: two runs on `2026-03-15` → still exactly one `call_result` event (idempotency guard) |
| logs no call_result mid-month                                   | Step 7: run on `2026-03-10` → zero `call_result` events                        |

---

## tests/cron-api.test.js

Tests the four cron HTTP endpoints.

| Test                                                    | What it checks                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| returns 404 when cron has never run                     | `GET /cron/status` before any run → 404 with `{ error }`                                        |
| returns correct response shape                          | `POST /cron/run` → `{ ranAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered, callsReset }` |
| ranAt is a valid ISO 8601 datetime string               | `ranAt` parses as a valid date and round-trips via `.toISOString()`                             |
| numeric stat fields are non-negative integers           | All 5 stat fields (including `callsReset`) are integers ≥ 0                                     |
| accepts an optional date override in body               | `{ date: "2026-01-01T00:00:00.000Z" }` → `ranAt` reflects that date                             |
| tasksDeleted reflects done date tasks removed           | Creates a done `date` task, runs cron, confirms it's gone and `tasksDeleted ≥ 1`                |
| returns 200 with correct shape after cron has run       | `GET /cron/status` after a run → 200 with all 6 fields (including `callsReset`)                 |
| lastRanAt matches the most recent POST /cron/run ranAt  | Status `lastRanAt` equals the last run's `ranAt`                                                |
| status numeric fields match the last run stats          | All 5 counters in status (including `callsReset`) match what the last run returned              |
| lastRanAt does not contain the ranAt key (no duplicate) | Status response has `lastRanAt` but not `ranAt`                                                 |
| GET /cron/run returns correct response shape            | `GET /cron/run` → same `{ ranAt, ... }` shape as POST, no body needed                           |
| GET /cron/run ranAt is a valid ISO 8601 datetime string | `ranAt` parses and round-trips correctly                                                        |
| GET /cron/run numeric stat fields are non-negative      | All 5 stat fields (including `callsReset`) are integers ≥ 0                                     |
| GET /cron/run updates /cron/status lastRanAt            | After `GET /cron/run`, status `lastRanAt` reflects the new run                                  |
| GET /cron/details returns shape matching /cron/status   | `{ lastRanAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered, callsReset }`    |
| GET /cron/details response matches /cron/status exactly | Both endpoints return identical JSON for the same run                                           |
| GET /cron/details returns 404 before any run            | Same 404 behaviour as `/cron/status` when cron has never run                                    |
| GET /cron/details does not expose ranAt key             | Response has `lastRanAt` but not `ranAt`                                                        |

---

## tests/archive.test.js

Tests the TaskArchive event log: cron archiving (Steps 0 and 5), reschedule logging from `PUT /tasks/:id`, deletion logging from `DELETE /tasks/:id`, and the `GET /archive` endpoint. Cron runs use the date override `2026-03-08` (a Sunday), so "yesterday" is Sat `2026-03-07`.

### Cron Step 0 — archive yesterday's outcomes

| Test                                                                            | What it checks                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| logs habit_result with completed=true and doneAt for a done day_of_week task    | Full event shape: `taskId`, `taskName`, `headerName`, `scheduledDays`, `dueDate`, `at` |
| logs habit_result with completed=false and doneAt=null for a missed task        | Missed habits are logged too, with `doneAt: null`                                      |
| does not log habit_result for day_of_week tasks not scheduled yesterday         | Only yesterday's scheduled habits get an outcome event                                 |
| logs task_result for a day_of_month task due yesterday                          | `ecdType: "day_of_month"`, `ecdValue`, correct `dueDate`                               |
| logs task_result for a day_of_year task whose month/day matched yesterday       | Year in the stored value is ignored for the match                                      |
| is idempotent — rerunning the cron for the same date does not double-log        | Same taskId + dueDate is skipped on re-run for all three types (dow, dom, doy)         |

### Cron Step 5 — task_completed archived before deletion

| Test                                                                          | What it checks                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| archives a done date task with plannedFor, taskCreatedAt, and doneAt          | Event written with `ecdType: "date"`, `plannedFor` = ECD value; task deleted |
| archives a done no-ecd task with ecdType=null and plannedFor=null             | No-ECD tasks are captured the same way                                       |

### task_rescheduled — logged on ECD change

| Test                                                        | What it checks                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| logs fromEcd/toEcd with pushedLater=true when a date moves later | The procrastination signal: `2026-07-20` → `2026-07-25`       |
| pushedLater=false when a date moves earlier                 | Pulling a date in is not a "push"                                 |
| pushedLater=false when the ECD type changes away from date  | `date` → `day_of_week` logs the change but not as pushed later    |
| does not log when the ECD is unchanged                      | Sending the identical ECD writes no archive event                 |
| stores the trimmed postpone reason on the event            | `{ reason: "  waiting on the vendor  " }` → event `reason: "waiting on the vendor"` |
| stores reason=null when a postpone has no reason           | Postpone with no `reason` in the body → event `reason: null`       |
| treats a blank/whitespace reason as no reason              | `{ reason: "   " }` → event `reason: null`                         |
| rejects a non-string reason with 400 and logs nothing      | `{ reason: 42 }` → `400`, no `task_rescheduled` event written      |
| does not persist reason onto the task document             | Response body has no `reason` field — it only annotates the archive event |

### task_deleted — logged on manual delete of an undone task

| Test                                                          | What it checks                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| logs a task_deleted event with the reason for an undone task  | Full event shape: `taskId`, `taskName`, `headerName`, `ecdType`, `ecd`, `reason` |
| trims the reason before storing it                            | `"  too big  "` → `"too big"`; `ecdType: null` for a no-ECD task           |
| logs task_deleted with reason=null when no reason is provided | Undone delete without a body still archives, `reason: null`                |
| does NOT log task_deleted when a done task is deleted         | Done tasks were accomplished — no deletion event                           |
| rejects a non-string reason with 400                          | `{ reason: {…} }` → 400 and no archive event                               |

### GET /archive

| Test                                                  | What it checks                                    |
| ------------------------------------------------------ | --------------------------------------------------- |
| returns events from the period, oldest first          | Sorted ascending by `at`                            |
| filters by type                                       | `?type=task_completed` returns only that event type |
| excludes events older than the requested window       | `?days=28` drops a 40-day-old event                 |
| falls back to the default period for an invalid days param | `?days=0` behaves like the default 28            |

---

## tests/insights.test.js

Tests the stats engine (via `GET /insights/stats` with seeded archive events) and the insight report endpoints.

### GET /insights/stats — computed stats

| Test                                                              | What it checks                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| aggregates habit completion rate, streaks, and missed-by-weekday  | 4 results (3 done, Tue missed) → rate 75, currentStreak 2, longestStreak 2, `missedByDow: { Tue: 1 }` |
| aggregates recurring task_result events into scheduled/completed counts | 2 scheduled, 1 completed → completionRate 50                              |
| aggregates call_result events into per-person rates and miss streaks | 3 periods (1 done, 2 recent misses) → rate 33, `currentMissStreak: 2`, sorted `recentResults`; calls excluded from `byHeader` |
| returns an empty calls array when there are no call_result events | Habit-only archive → `calls: []`                                              |
| computes one-time task slippage from plannedFor vs doneAt         | Planned Jul 6, done Jul 8 → `slippageDays: 2`; null `plannedFor` → null slippage, excluded from avg |
| counts reschedules and pushedLater per task, most-rescheduled first | Two tasks (2 vs 1 reschedules) → sorted by total descending, pushedLater counted |
| splits pushed-later postpones by reason and collects stated reasons | Per task: `pushedLaterWithReason`/`pushedLaterNoReason` split, `reasons[]` holds only the stated postpone reasons |
| rolls up completed/missed/reschedules per header                  | `byHeader` bucket math across event types (incl. `deleted` field)                |
| aggregates task_deleted events into deletions and per-header counts | 3 deletions (2 with reason) → `deletions.count 3`, `withReason 2`, `recent` shape; `byHeader.*.deleted` counts |
| returns an empty deletions rollup when there are no task_deleted events | Habit-only archive → `deletions: { count: 0, withReason: 0, recent: [] }`   |
| respects the days query param                                     | `?days=7` → `periodDays: 7`                                                      |

### GET /insights/latest

| Test                                          | What it checks                          |
| ----------------------------------------------- | ----------------------------------------- |
| returns 404 when no report has been generated | Empty Insights collection → 404 `{ error }` |
| returns the most recent report                | Two seeded reports → newest one returned |

### GET /insights/history

| Test                                            | What it checks                          |
| ------------------------------------------------- | ----------------------------------------- |
| returns reports newest first                    | Seeded 3 reports → descending `generatedAt` |
| respects the limit param                        | `?limit=2` → 2 newest                     |
| falls back to the default limit for invalid values | `?limit=abc` → all 3 (default 14)      |

### POST /insights/generate

| Test                                                        | What it checks                                       |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| returns 503 when ANTHROPIC_API_KEY is not configured        | Key removed from env → 503 with explanatory error      |
| returns 404 when the archive is empty (no API call is made) | Dummy key + empty archive → 404 before any API request |

### Insight model

| Test                                          | What it checks                                        |
| ----------------------------------------------- | ------------------------------------------------------- |
| save persists a report and returns it with an _id | `Insight.save()` inserts; `Insight.latest()` reads it back |

---

## tests/done-at.test.js

Tests the `doneAt` timestamp lifecycle across user toggles and cron resets.

| Test                                          | What it checks                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| a new task is created with doneAt null        | `POST /tasks` → `doneAt: null`                                      |
| marking done sets doneAt to a current timestamp | `PUT { done: true }` → valid ISO datetime close to now            |
| marking undone clears doneAt back to null     | `PUT { done: false }` → `doneAt: null`                              |
| re-sending done=true does not move doneAt     | Done→done is a no-op; timestamp unchanged                           |
| cron day_of_week reset clears doneAt          | Step 3 reset → `done: false`, `doneAt: null`                        |
| cron day_of_year reset clears doneAt          | Step 2 reset → `done: false`, `doneAt: null`, year advanced to today's |

---

## tests/system.test.js

| Test                                                    | What it checks                                        |
| --------------------------------------------------------- | ------------------------------------------------------- |
| returns API info with message, environment, and docs link | `GET /` → message, `environment: "test"`, `/api-docs` |
| returns ok status with a valid timestamp                | `GET /health` → `status: "ok"`, timestamp within 10s    |
| GET /cron/details returns 404 when cron has not run in this process | The never-ran branch of `/cron/details` (cron never runs in this file) |
| unknown routes return 404 Route not found               | The catch-all 404 handler                               |
| malformed JSON bodies hit the error middleware          | Invalid JSON → 500 `"Something went wrong!"`            |
