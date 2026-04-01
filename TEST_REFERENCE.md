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

| Test                                                           | What it checks                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| deletes done date tasks and leaves undone date tasks           | Step 5: done `date` tasks deleted; undone `date` tasks untouched |
| does not delete done non-date tasks                            | Step 5: only `ecd.type === "date"` tasks are deleted             |
| marks done day_of_week tasks undone when today's day matches   | Step 3: `done: true` → `done: false` when day name matches       |
| does not affect day_of_week tasks whose day does not match     | Step 3: no change when today's day is not in `ecd.value`         |
| marks done day_of_month tasks undone when today's date matches | Step 4: same logic for day-of-month                              |
| increments year and sets done=false on Jan 1st                 | Step 2: `7/3/2006` → `7/3/2007`, `done` reset to false           |
| clamps Feb 29 to Feb 28 in non-leap years on Jan 1st           | Step 2: `29/2/2024` → `28/2/2025`                                |
| clamps values exceeding days in that month on the 1st          | Step 1: `[15, 30, 31]` in February → `[15, 28, 28]`              |
| does NOT clamp on non-1st of month                             | Step 1: skipped except on the 1st                                |
| undone tasks are sorted before done tasks after cron           | Step 6: all undone tasks have lower priority than all done tasks |

---

## tests/cron-api.test.js

Tests the four cron HTTP endpoints.

| Test                                                    | What it checks                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| returns 404 when cron has never run                     | `GET /cron/status` before any run → 404 with `{ error }`                                        |
| returns correct response shape                          | `POST /cron/run` → `{ ranAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered }` |
| ranAt is a valid ISO 8601 datetime string               | `ranAt` parses as a valid date and round-trips via `.toISOString()`                             |
| numeric stat fields are non-negative integers           | All 4 stat fields are integers ≥ 0                                                              |
| accepts an optional date override in body               | `{ date: "2026-01-01T00:00:00.000Z" }` → `ranAt` reflects that date                             |
| tasksDeleted reflects done date tasks removed           | Creates a done `date` task, runs cron, confirms it's gone and `tasksDeleted ≥ 1`                |
| returns 200 with correct shape after cron has run       | `GET /cron/status` after a run → 200 with all 5 fields                                          |
| lastRanAt matches the most recent POST /cron/run ranAt  | Status `lastRanAt` equals the last run's `ranAt`                                                |
| status numeric fields match the last run stats          | All 4 counters in status match what the last run returned                                       |
| lastRanAt does not contain the ranAt key (no duplicate) | Status response has `lastRanAt` but not `ranAt`                                                 |
| GET /cron/run returns correct response shape            | `GET /cron/run` → same `{ ranAt, ... }` shape as POST, no body needed                           |
| GET /cron/run ranAt is a valid ISO 8601 datetime string | `ranAt` parses and round-trips correctly                                                        |
| GET /cron/run numeric stat fields are non-negative      | All 4 stat fields are integers ≥ 0                                                              |
| GET /cron/run updates /cron/status lastRanAt            | After `GET /cron/run`, status `lastRanAt` reflects the new run                                  |
| GET /cron/details returns shape matching /cron/status   | `{ lastRanAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered }`                |
| GET /cron/details response matches /cron/status exactly | Both endpoints return identical JSON for the same run                                           |
| GET /cron/details returns 404 before any run            | Same 404 behaviour as `/cron/status` when cron has never run                                    |
| GET /cron/details does not expose ranAt key             | Response has `lastRanAt` but not `ranAt`                                                        |
