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

## tests/lifeevents.test.js

Life Events CRUD — annually recurring dates (e.g. "Wife's birthday" on "7/3") that cron step 6 adds to the todo every year on their day.

| Test                                                            | What it checks                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| returns empty array when no life events exist                   | `GET /lifeevents` returns `[]` on a clean DB                                 |
| creates a life event with defaults applied                      | `POST /lifeevents` returns 201 with `done: false`, `todoTaskId: null`, `priority: 0`, a baselined `lastAddedYear` and timestamps |
| appends subsequent life events at the end (contiguous priorities) | Second and third events get priorities 1 and 2                             |
| trims the name and date                                         | `"  Trimmed  "` / `" 5/6 "` → `"Trimmed"` / `"5/6"`                          |
| rejects a missing or empty name                                 | `POST` without `name` or with `"   "` → 400                                  |
| rejects invalid dates                                           | `"2026-03-07"`, `"7/3/2026"`, `"0/3"`, `"32/1"`, `"7/13"`, `"30/2"`, `"31/4"`, non-string → 400 |
| accepts Feb 29                                                  | `{ date: "29/2" }` → 201 (clamped to Feb 28 by the cron in non-leap years)   |
| returns all life events sorted by priority                      | `GET /lifeevents` array is ascending by `priority`                           |
| renames a life event without touching date or lastAddedYear     | `PUT { name }` → date and `lastAddedYear` unchanged                          |
| toggles done and sets/clears the todo link                      | `PUT { done, todoTaskId }` → both persisted; null clears the link            |
| a date change re-baselines lastAddedYear                        | `PUT { date: "8/3" }` → `lastAddedYear` recomputed for the new date          |
| a no-op date write does not re-baseline lastAddedYear           | `PUT { date: <same> }` with a sentinel `lastAddedYear` in the DB → sentinel kept |
| rejects invalid updates                                         | Empty name, bad date, non-boolean done, non-string todoTaskId, out-of-range priority → 400 |
| moves a life event and shifts the others to stay contiguous     | `PUT { priority: 0 }` on the last event reorders the list, priorities stay `0..n-1` |
| returns 404 for an unknown id (PUT)                             | Fake ObjectId → 404                                                          |
| deletes a life event and closes the priority gap                | `DELETE /lifeevents/:id` → `{ deleted: id }`, remaining priorities contiguous |
| returns 404 for an unknown id (DELETE)                          | Fake ObjectId → 404                                                          |

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

Calls CRUD — people the user must call biweekly or monthly (completely independent of tasks/headers; done checkmarks are reset by cron step 8).

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

## tests/vacation.test.js

Vacations CRUD and the re-date flow — booked time off, where a missed day is not procrastination. Both dates are inclusive, ranges may not overlap, and the documents are never pruned because every vacation rule is re-derived from them at read time.

### POST /vacations — booking

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| creates a vacation with both inclusive dates          | `POST /vacations` → 201 with `_id`, both dates, `note`, timestamps             |
| allows a single-day vacation (start === end)          | A one-day trip is legal                                                        |
| rejects a missing endDate                             | `{ startDate }` → 400; both dates are mandatory                                |
| rejects a malformed date                              | `"03-09-2026"` → 400                                                           |
| rejects endDate before startDate                      | Inverted range → 400 "on or after"                                             |
| rejects a range overlapping an existing one           | Overlapping trip → 400, so no day is ever counted twice                        |
| allows a range that starts the day after another ends | Adjacent (non-overlapping) ranges are fine                                     |

### GET /vacations

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns every vacation, oldest start date first       | Sorted by `startDate` ascending                                                |
| returns an empty array when nothing is booked         | `[]` on a clean DB                                                             |

### GET /vacations/status

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| reports onVacation=false with no ranges               | `{ onVacation: false, active: null, upcoming: [] }`                            |
| reports the active vacation with its day counts       | `totalDays`, `dayOfVacation`, `daysRemaining`                                  |
| counts the first and last day as vacation days        | A one-day trip today is active, day 1 of 1                                     |
| lists future vacations under upcoming                 | A booked-ahead trip does not activate                                          |
| reports a vacation that ended yesterday as justReturnedFrom | Drives the "returned from an N-day break" framing                        |
| does not report a vacation that ended long ago        | Outside the 3-day grace window → `null`                                        |

### PUT /vacations/:id

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| corrects a forgotten start date                       | The forgot-to-book-it case                                                     |
| shortens a vacation when the user comes home early    | `endDate` moved earlier                                                        |
| validates the resulting range, not just the field sent| A new `endDate` before the stored `startDate` → 400                            |
| does not treat the row being edited as an overlap with itself | Extending your own range is allowed                                     |
| still rejects an edit that collides with another vacation | Extending into another trip → 400                                          |
| 404s for an unknown id                                | Fake ObjectId → 404                                                            |

### DELETE /vacations/:id

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| deletes a vacation                                    | `{ deleted: id }`, and the list is empty afterwards                            |
| 404s for an unknown id                                | Fake ObjectId → 404                                                            |

### GET /vacations/:id/tasks — the re-date list

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns undone one-time dated tasks inside the window, with headerName | The panel's list, header denormalized                          |
| includes tasks dated on the first and last day        | Both ends inclusive here too                                                   |
| excludes tasks outside the window                     | The days either side are not offered                                           |
| excludes recurring tasks — they cannot be moved, only exempted | `day_of_week` / `day_of_month` never appear                            |
| excludes tasks already done                           | Nothing to re-date                                                             |
| 404s for an unknown vacation                          | Fake ObjectId → 404                                                            |

### Re-dating out of a vacation

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| flags the reschedule as a vacationMove                | `PUT /tasks/:id { ecd, vacationMove: true }` → `task_rescheduled` event carries `vacationMove: true`, so a trip booked in advance is never read as procrastination |
| an ordinary postpone is not flagged                   | `vacationMove: false` on a normal reschedule                                   |
| vacationMove is never written onto the task itself    | The response body has no `vacationMove` field                                  |
| rejects a non-boolean vacationMove                    | `"yes"` → 400                                                                  |

---

## tests/goals.test.js

Goals CRUD — habit backlogs built one step at a time (roadmaps only; starting/finishing a step happens client-side). Each step also carries the weekdays it runs on (`days`), which clients mirror onto its task's `day_of_week` ECD and which the streak is therefore measured over.

| Test                                                  | What it checks                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns empty array when no goals exist               | `GET /goals` returns `[]` on a clean DB                                        |
| creates a goal with a step list                       | `POST /goals` returns 201 with `_id`, `name`, `steps`, timestamps; omitted step status defaults to `pending` and `days` to all seven; first goal gets `priority: 0` |
| creates a goal without steps (defaults to empty list) | `POST /goals { name }` → 201 with `steps: []` and the next `priority` (appended at end) |
| rejects missing name                                  | `POST /goals { steps }` → 400                                                  |
| rejects empty name                                    | `{ name: "  " }` → 400                                                         |
| rejects steps that are not an array                   | `{ steps: "Wake up at 6" }` → 400                                              |
| rejects steps that are plain strings                  | `{ steps: ["Wake up at 6"] }` → 400 (steps must be objects)                    |
| rejects steps with empty names                        | `{ steps: [{ name: "  " }] }` → 400                                            |
| rejects steps with an invalid status                  | `{ status: "done" }` → 400 (must be `pending`/`under_progress`)                |
| normalizes legacy statuses (achieved, active) to under_progress | `{ status: "achieved" }` and `{ status: "active" }` → 201 with `status: "under_progress"` (pre-rename data stays editable) |
| trims whitespace from name and step names             | `"  Trimmed  "` → `"Trimmed"`; step names trimmed too                          |
| keeps the days a step was created with                | `{ days: ["Mon", "Wed", "Fri"] }` survives the round trip untouched            |
| sorts days into week order and drops duplicates       | `["Fri", "Mon", "Fri", "Sun"]` → `["Sun", "Mon", "Fri"]`                       |
| rejects an empty days array                           | `{ days: [] }` → 400 (a habit must run on at least one day)                    |
| rejects days that are not weekday abbreviations       | `{ days: ["Monday"] }` → 400                                                   |
| rejects days that are not an array                    | `{ days: "Mon" }` → 400                                                        |
| returns all goals sorted by priority ascending (creation order) | `GET /goals` is ordered by `priority`; names and priorities match creation order, with a deleted goal's gap closed |
| updates goal name                                     | `PUT /goals/:id { name }` → 200, steps untouched                               |
| updates goal steps (replace wholesale)                | `PUT /goals/:id { steps }` → 200, name untouched; status changes persist       |
| changes the days of a started step                    | `PUT` with `days: ["Sat", "Sun"]` on an `under_progress` step → 200, stored in week order `["Sun", "Sat"]` |
| backfills the whole week for steps stored before days existed | A step written straight to Mongo without `days` reads back without it; the next `PUT` normalizes it to all seven days |
| rejects an empty days array (PUT)                     | `{ days: [] }` → 400                                                           |
| allows clearing steps with an empty array             | `{ steps: [] }` → 200 with `steps: []` (unlike events)                         |
| rejects steps with an invalid status (PUT)            | `{ status: "started" }` → 400                                                  |
| rejects empty name (PUT)                              | `{ name: "" }` → 400                                                           |
| returns 404 for unknown id (PUT)                      | Fake ObjectId → 404                                                            |
| deletes a goal                                        | `DELETE /goals/:id` → `{ deleted: id }`                                        |
| returns 404 when deleting again                       | Second delete → 404                                                            |

---

### Goal priority ordering

Goal-level reordering, mirroring the header/project priority scheme. Each test re-seeds three goals A/B/C at priorities 0/1/2.

| Test                                                        | What it checks                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| moves a goal up and shifts the displaced one down           | `PUT { priority: 0 }` on C → `C:0, A:1, B:2`                                |
| moves a goal down and shifts the displaced ones up          | `PUT { priority: 2 }` on A → `B:0, C:1, A:2`                                |
| moving to the same priority is a no-op                      | `PUT { priority: 1 }` on B leaves the order untouched                        |
| updates name and priority together                          | One `PUT` applies both; the response carries the new name and priority       |
| rejects a priority beyond the last goal                     | `{ priority: 99 }` → 400 and the order is unchanged                          |
| rejects a negative priority                                 | `{ priority: -1 }` → 400                                                     |
| rejects a non-integer priority                              | `{ priority: 1.5 }` → 400                                                    |
| closes the gap when a middle goal is deleted                | Deleting B leaves `A:0, C:1`                                                 |
| backfills priorities for goals stored before the field existed | `$unset` priority on all goals; first `GET` assigns `0..n-1` in name order, persists them, and a move straight after works |

## tests/projects.test.js

Projects CRUD — long-term projects with ordered task lists, header-style priorities, a done/undone barrier and a dated-above-undated rule inside each project, plus the server-owned project↔header ordering cascades (task-level todo sync is client-driven; the cron side is covered in `chron.test.js`).

| Test                                                      | What it checks                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| returns empty array when no projects exist                | `GET /projects` returns `[]` on a clean DB                                     |
| creates a project with a task list (defaults applied)     | `POST /projects` → 201 with `_id`, `name`, `priority: 0`, tasks defaulted (`notes: ""`, `date: null`, `done: false`, `todoTaskId: null`), timestamps |
| creates a project without tasks (defaults to empty list)  | `POST /projects { name }` → 201 with `tasks: []`                               |
| appends priorities contiguously                           | Three creates get priorities 0, 1, 2                                           |
| sorts done tasks to the bottom on create                  | `[done, undone, done]` list is stored as `[undone, done, done]` (stable)       |
| sorts dated undone tasks above undated ones on create (stable within each group) | `[undated, dated, done+dated, dated]` is stored as `[dated, dated, undated, done]` — input order kept inside each group, never re-sorted by date value |
| trims whitespace from name and task names                 | `"  Trimmed  "` → `"Trimmed"`; task names trimmed too                          |
| persists task notes and defaults missing notes to empty string | Task `notes` are stored; a task without `notes` defaults to `""`         |
| rejects missing name                                      | `POST /projects { tasks }` → 400                                               |
| rejects empty name                                        | `{ name: "  " }` → 400                                                         |
| rejects tasks that are not an array                       | `{ tasks: "get data" }` → 400                                                  |
| rejects tasks that are plain strings                      | `{ tasks: ["get data"] }` → 400 (tasks must be objects)                        |
| rejects tasks with empty names                            | `{ tasks: [{ name: "  " }] }` → 400                                            |
| rejects tasks with an invalid date format                 | `{ date: "1/8/2026" }` → 400 (must be `YYYY-MM-DD` or null)                    |
| rejects tasks with a non-boolean done                     | `{ done: "yes" }` → 400                                                        |
| rejects tasks with non-string notes                       | `{ notes: 42 }` → 400 (notes must be a string)                                 |
| rejects tasks with a non-string todoTaskId                 | `{ todoTaskId: 7 }` → 400 (must be a string or null)                           |
| normalizes a blank todoTaskId to null                      | `""`, `"   "` and `null` all store as `null` — a blank link is no link         |
| returns all projects sorted by priority ascending         | `GET /projects` array is ascending by `priority` (0, 1, 2)                     |
| updates project name                                      | `PUT /projects/:id { name }` → 200, tasks untouched                            |
| replaces tasks wholesale (dated first, links, done → bottom) | `PUT` with a full list persists dates/`todoTaskId`, lifts the dated undone task above the undated one and re-sorts done tasks to the bottom |
| updates task notes wholesale                              | `PUT` with a task carrying `notes` persists the new notes                      |
| allows clearing a task date with null                     | `{ date: null }` → 200 with `date: null`                                       |
| allows clearing tasks with an empty array                 | `{ tasks: [] }` → 200 with `tasks: []`                                         |
| moves a project up and shifts others (priority contiguity)| Moving priority 2→0 shifts the others to 1, 2                                  |
| moves a project down and shifts others                    | Moving priority 0→2 shifts the others to 0, 1                                  |
| rejects an out-of-range priority                          | `{ priority: 99 }` → 400                                                       |
| rejects a negative priority                               | `{ priority: -1 }` → 400                                                       |
| normalizes a blank todoTaskId to null on update            | `PUT` with `todoTaskId: "  "` clears an existing link to `null`                |
| rejects tasks with an invalid date (PUT)                  | `{ date: "2026/08/01" }` → 400                                                 |
| rejects empty name (PUT)                                  | `{ name: "" }` → 400                                                           |
| returns 404 for unknown id (PUT)                          | Fake ObjectId → 404                                                            |
| deletes a project and shifts remaining priorities         | `DELETE /projects/:id` → `{ deleted: id }`; remaining priorities close the gap |
| returns 404 when deleting again                           | Second delete → 404                                                            |

### Project ↔ todo header ordering (server-owned)

| Test                                                                | What it checks                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| a new project header is placed in the project block, not at the bottom | `POST /headers { projectId }` → order `[Daily, P1, P2, Misc]`: top ordinary header keeps slot 0, project headers follow in project order |
| the block starts at 0 when there is no non-project header            | With only project headers → `[P1, P2]` at priorities 0, 1                       |
| creating a header for a project that already has one is idempotent   | Second `POST /headers { projectId }` → `200` with the same `_id`, still one header |
| adopts a pre-projectId header that matches the project by name       | Legacy header with the project's name is adopted (`200`, `projectId` set) instead of duplicated |
| moving a project re-orders the todo headers                          | `PUT /projects/:id { priority: 0 }` → header block re-ordered to match          |
| renaming a project renames its todo header                           | `PUT /projects/:id { name }` → the linked header is renamed                     |
| deleting a project unlinks its header and closes the block           | `DELETE /projects/:id` → `{ headersUnlinked: 1 }`, header survives with `projectId: null` and leaves the block |
| rejects a malformed projectId                                        | `POST /headers { projectId: "not-an-id" }` → 400                                |

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
| deletes done date tasks and leaves undone date tasks            | Step 4: done `date` tasks deleted; undone `date` tasks untouched       |
| deletes done no-ecd tasks                                       | Step 4: done tasks with `ecd: null` are also archived and deleted      |
| does not delete done recurring tasks (dow, dom, doy)            | Step 4: recurring ECD types are never deleted, even when done          |
| marks a linked project task done (link cleared, date kept, moved to bottom) when its done todo task is deleted | Step 4 project sync: deleted done todo task → matching project task `done: true`, `todoTaskId: null`, `date` kept, re-sorted below undone tasks; `projectTasksCompleted: 1` |
| leaves project tasks alone when the linked todo task is not done | Step 4 project sync: undone linked todo task survives; project task stays undone and linked; `projectTasksCompleted: 0` |
| does not touch unlinked project tasks when other done tasks are deleted | Step 4 project sync: deletions without a matching `todoTaskId` never flip project tasks |
| creates a linked date task under a new Events header on the event's day | Step 6: due life event → task named after it with `ecd: { date, today }` under a new "Events" header; `todoTaskId` linked, `done: false`, `lastAddedYear` advanced, `lifeEventTasksCreated: 1` |
| reuses an existing Events header case-insensitively and sorts the task by ECD | Step 6: a header named "events" is reused (no duplicate); the dated task sorts above a no-ECD task after step 7 |
| does nothing on a non-matching day                              | Step 6: no headers/tasks created, link stays null, `lifeEventTasksCreated: 0` |
| a same-day rerun does not create a duplicate                    | Step 6: second run on the same date → still exactly one task (`lastAddedYear` guard) |
| a same-day rerun after the task was completed and cleaned up cannot re-add it | Step 6: rerun deletes the done task (step 4 → `lifeEventsCompleted: 1`, event done, link cleared) and creates nothing new |
| marks the event done (kept, link cleared) when the cron deletes its done todo task | Step 4 life-event sync: next-midnight run → event `done: true`, `todoTaskId: null`, event never deleted |
| next anniversary resets done and links a fresh task             | Step 6: a year after completion → new task created, event `done: false`, `lastAddedYear` = new year |
| an event whose linked task is still pending is skipped next year | Step 6: uncompleted task from last year → no second task stacked, `lastAddedYear` unchanged |
| a malformed todoTaskId is treated as no link instead of crashing the run | Step 6: an invalid ObjectId string in `todoTaskId` → run succeeds, a fresh task is created and linked |
| a Feb 29 event fires on Feb 28 in non-leap years                | Step 6: `29/2` on `2027-02-28` → task created with `ecd.value: "2027-02-28"` |
| marks done day_of_week tasks undone when today's day matches    | Step 2: `done: true` → `done: false` when day name matches             |
| does not affect day_of_week tasks whose day does not match      | Step 2: no change when today's day is not in `ecd.value`               |
| marks done day_of_month tasks undone when today's date matches  | Step 3: same logic for day-of-month                                    |
| updates year and marks undone when today matches task month/day | Step 1: past-year value advanced to today's year, `done` reset to false |
| does not update task when today does not match task month/day   | Step 1: non-matching day → ECD value and `done` untouched              |
| treats Feb 29 as due on Feb 28 of a non-leap year without rewriting the day | Step 1: `29/2/2024` on `2026-02-28` → `29/2/2026` (day preserved), `done: false`, `tasksClamped ≥ 1` |
| keeps firing on Feb 29 in a leap year after a non-leap-year clamp | Step 1: `29/2/2026` on `2028-02-29` → `29/2/2028`, `done: false` — the Feb 29 intent survives |
| a task set to the 31st is due on the last day of a short month   | Step 3: `[15, 30, 31]` on `2026-02-28` → marked undone, `tasksClamped ≥ 1` |
| the stored value is never rewritten, so the 31st is still the 31st in a long month | Step 3: three runs across February leave `ecd.value` as `[15, 30, 31]` |
| is not due on a day that only a clamp would match in a longer month | Step 3: `[31]` on `2026-03-30` → stays done (March has a 31st)      |
| deletes a header with no tasks, keeps headers that have tasks   | Step 5: an empty header is deleted, a header with a task survives, `headersDeleted: 1` |
| rearranges surviving header priorities to stay contiguous (0..n-1) | Step 5: deleting the middle empty header collapses remaining priorities to `0..n-1` |
| deletes a header emptied by step 4 done-date-task deletion      | Step 5: header whose only task was a done `date` task (deleted by step 4) is removed, `headersDeleted: 1` |
| no empty headers → headersDeleted is 0 and priorities untouched | Step 5: every header has a task → nothing deleted, priorities unchanged, `headersDeleted: 0` |
| re-asserts the project header block after deleting an empty header | Step 5: deleting the empty top header leaves `[Misc, P1, P2]` at `0..2` (block rule), not the plain re-numbering `[P1, P2, Misc]` |
| unlinks a header whose project was deleted outside the cron      | Step 5: header pointing at a missing project gets `projectId: null` |
| backfills projectId on a pre-existing header that matches a project by name | Step 5: legacy header adopts the same-named project's `_id` |
| undone tasks are sorted before done tasks after cron            | Step 7: all undone tasks have lower priority than all done tasks       |
| undone tasks are ordered by soonest upcoming ECD across all types, null ECD last | Step 7: date/day_of_week/day_of_month resolve to their next due date and sort ascending (a day-of-month value that already passed rolls to next month); no-ECD tasks sort last among undone |
| a day_of_year task sorts by its next anniversary, not its stored year | Step 7: `1/1/2026` on `2026-07-15` sorts **after** a `2026-08-01` date task (next occurrence is 2027-01-01), instead of being pinned to the top by its past stored year |
| a day_of_year task due later this year sorts before a later date task | Step 7: `20/7/2025` on `2026-07-15` resolves to 2026-07-20 and sorts before a `2026-09-01` date task |
| tasks due the same day keep their existing relative order (stable sort) | Step 7: three tasks on `2026-07-20` keep creation order after the re-sort |
| does not stamp updatedAt when it only changes priority           | Step 7: a re-prioritised task keeps its previous `updatedAt`         |
| resets done biweekly calls on the 15th, monthly untouched       | Step 8: run on `2026-03-15` → done biweekly call reset (`done: false`, `doneAt: null`), done monthly call untouched, `callsReset: 1` |
| resets ALL done calls on the last day of the month              | Step 8: run on `2026-03-31` → both biweekly and monthly done calls reset, `callsReset: 2` |
| treats Feb 28 as the last day of a non-leap February            | Step 8: run on `2026-02-28` → all done calls reset (2026 is not a leap year)   |
| does not reset any calls mid-month                              | Step 8: run on `2026-03-10` → no-op, `callsReset: 0`, done calls stay done     |
| leaves undone calls untouched on the 15th                       | Step 8: undone calls (both frequencies) keep `done: false` and their `updatedAt` |
| archives call_result for due biweekly calls (done and missed) on the 15th | Step 8: run on `2026-03-15` → `call_result` events for done (completed: true, doneAt set) and missed (completed: false) biweekly calls; monthly call not logged |
| archives call_result for ALL calls on the last day of the month | Step 8: run on `2026-03-31` → both biweekly and monthly calls logged with `dueDate: 2026-03-31` |
| does not double-log call_result when cron re-runs for the same date | Step 8: two runs on `2026-03-15` → still exactly one `call_result` event (idempotency guard) |
| logs no call_result mid-month                                   | Step 8: run on `2026-03-10` → zero `call_result` events                        |

### scheduleCron — where the daily run comes from

Nothing in the table above happens unless something fires `runCron`, so the
trigger itself is tested.

| Test                                                  | What it checks                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| registers an in-process schedule on a long-lived server | No serverless env vars → `isServerless()` false, `scheduleCron()` returns `true`, one node-cron task registered |
| declines on Vercel                                    | `VERCEL=1` → `isServerless()` true and `scheduleCron()` returns `false`; the platform cron (`vercel.json`) owns the run |
| declines on Lambda                                    | `AWS_LAMBDA_FUNCTION_NAME` set → same, so the check is not Vercel-specific            |

---

## tests/cron-api.test.js

Tests the four cron HTTP endpoints.

| Test                                                    | What it checks                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| returns 404 when cron has never run                     | `GET /cron/status` before any run → 404 with `{ error }`                                        |
| returns correct response shape                          | `POST /cron/run` → `{ ranAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered, projectTasksCompleted, lifeEventsCompleted, lifeEventTasksCreated, callsReset }` |
| ranAt is a valid ISO 8601 datetime string               | `ranAt` parses as a valid date and round-trips via `.toISOString()`                             |
| numeric stat fields are non-negative integers           | All 6 stat fields (including `projectTasksCompleted` and `callsReset`) are integers ≥ 0         |
| accepts an optional date override in body               | `{ date: "2026-01-01T00:00:00.000Z" }` → `ranAt` reflects that date                             |
| tasksDeleted reflects done date tasks removed           | Creates a done `date` task, runs cron, confirms it's gone and `tasksDeleted ≥ 1`                |
| returns 200 with correct shape after cron has run       | `GET /cron/status` after a run → 200 with all 7 fields (including `projectTasksCompleted` and `callsReset`) |
| lastRanAt matches the most recent POST /cron/run ranAt  | Status `lastRanAt` equals the last run's `ranAt`                                                |
| status numeric fields match the last run stats          | All 6 counters in status (including `projectTasksCompleted` and `callsReset`) match what the last run returned |
| lastRanAt does not contain the ranAt key (no duplicate) | Status response has `lastRanAt` but not `ranAt`                                                 |
| GET /cron/run returns correct response shape            | `GET /cron/run` → same `{ ranAt, ... }` shape as POST, no body needed                           |
| GET /cron/run ranAt is a valid ISO 8601 datetime string | `ranAt` parses and round-trips correctly                                                        |
| GET /cron/run numeric stat fields are non-negative      | All 6 stat fields (including `projectTasksCompleted` and `callsReset`) are integers ≥ 0         |
| GET /cron/run updates /cron/status lastRanAt            | After `GET /cron/run`, status `lastRanAt` reflects the new run                                  |
| GET /cron/details returns shape matching /cron/status   | `{ lastRanAt, tasksDeleted, tasksMarkedUndone, tasksClamped, headersReordered, projectTasksCompleted, lifeEventsCompleted, lifeEventTasksCreated, callsReset }` |
| GET /cron/details response matches /cron/status exactly | Both endpoints return identical JSON for the same run                                           |
| GET /cron/details returns 404 before any run            | Same 404 behaviour as `/cron/status` when cron has never run                                    |
| GET /cron/details does not expose ranAt key             | Response has `lastRanAt` but not `ranAt`                                                        |
| every run refreshes the snapshot and reports statsRefreshed | No `GEMINI_API_KEY` set → `statsRefreshed: true` and `GET /insights/stats/latest` returns a snapshot with `computedAt` and `periodDays: 28` |
| streaks are updated with no API key and no report generated | Two archived habit hits + a run with no API key → `insightGenerated: false` with `insightSkipped: "test-env"`, but the snapshot shows `currentStreak: 2`, `completionRate: 100` |
| skipInsights does not suppress the snapshot             | `{ skipInsights: true }` → `statsRefreshed: true` and the snapshot endpoint still answers 200 (the flag only avoids the paid API call) |
| skipInsights: true suppresses the insight report        | With env flipped to reach the insight branch (mocked service), `{ date: Fri 2026-07-24, skipInsights: true }` → `generateInsights` not called, `insightGenerated: false`, `insightSkipped: "opted-out"` |
| a missing API key is reported, not silently omitted     | No `GEMINI_API_KEY` → `insightSkipped: "no-api-key"`, so a misconfigured deployment is visible from `/cron/status` instead of looking like a quiet night |
| a model failure is reported as insightSkipped='error'   | `generateInsights` rejects → `insightSkipped: "error"`, `insightError` carries the message, and the rest of the run still succeeded (`statsRefreshed: true`) |
| an empty archive window is reported as insightSkipped='no-data' | `generateInsights` resolves `null` → `insightSkipped: "no-data"`, distinguishing "nothing to write about" from "the call blew up" |
| without skipInsights the insight step runs               | Same env, no stored report → `generateInsights` called once, `insightGenerated: true`, no `insightSkipped` |
| runs on a weekday too — the report is no longer Friday-only | Thursday 2026-07-23 → `generateInsights` called once, `insightGenerated: true` |
| skips a second run on a day that already reported       | Report seeded the same day → `generateInsights` not called, `insightSkipped: "not-due"` (no second API call) |
| runs again the day after the last report                | Report seeded 1 day before the run date → `generateInsights` called once, `insightGenerated: true` |
| the rest of the cron still runs on a day the report is skipped | Thursday run → `insightGenerated: false` but `ranAt` and the task/header counters are all present |

### Archive retention counters (step 10)

| Test                                                  | What it checks                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| reports the retention counters on every run           | `archiveEventsPruned`, `archiveEventsFolded`, `archiveMonthsSummarised` are always numbers |
| archiveCutoff is null when nothing was old enough to prune | A fresh event leaves `archiveCutoff: null`                     |
| archiveCutoff is the UTC day events had to predate    | A 60-day-old event is pruned and the cutoff is a `YYYY-MM-DD` string |

### POST /cron/run — vacation

| Test                                                  | What it checks                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| reports onVacation=false with nothing booked          | The run stats always carry the flag                                 |
| reports onVacation=true when the run's day falls inside a range | The flag explains the two things vacation does change     |
| every other cron step still runs while away           | Habits still reset, stats still refresh, headers still reorder — vacation is a lens, not a pause button |

| skips the AI report with insightSkipped='vacation'    | `generateInsights` is never called; the reason is distinguishable from `"not-due"` |

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

### Cron Step 4 — task_completed archived before deletion

| Test                                                                          | What it checks                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| archives a done date task with plannedFor, taskCreatedAt, and doneAt          | Event written with `ecdType: "date"`, `plannedFor` = ECD value; task deleted |
| archives a done no-ecd task with ecdType=null and plannedFor=null             | No-ECD tasks are captured the same way                                       |

### task_completed — archived on header delete cascade

| Test                                                            | What it checks                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| archives a header's done tasks before the cascade delete        | `DELETE /headers/:id` logs a `task_completed` event for every done task (any ECD type) with `taskName`, `headerName`, `ecdType`, `plannedFor` (date only), `doneAt`; undone task not logged |
| does not archive undone tasks on a header delete cascade        | A header with only an undone task logs no `task_completed` and no `task_deleted` on delete |

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

### Archive retention (cron step 10)

| Test                                                    | What it checks                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| keeps events inside the retention window                | A 5-day-old event survives; `archiveEventsPruned: 0`, `archiveCutoff: null` |
| folds an expired event into its month and deletes the raw row | A 45-day-old event becomes an `ArchiveSummary` month and leaves `TaskArchive` |
| counts habit hits and misses, and rolls them up per header | `scheduled`/`completed` per habit, `reschedules`, and the `byHeader` rollup |
| applies the on-time rule to completed one-off tasks     | Done on the planned day is on time; done after it is late            |
| a second run neither double-counts nor resurrects anything | Re-running the cron prunes 0 and leaves the month's counts unchanged |
| re-folding a day already summarised counts it once      | `foldEvents` on the same events returns `folded: 0` — the crash-between-fold-and-delete case |
| splits a batch across the months it belongs to          | Events either side of a month boundary land in their own summaries    |
| GET /archive/summary returns the months oldest first    | `["2026-06", "2026-07"]`                                              |
| GET /archive/summary is an empty array before anything is pruned | `[]`, not a 404                                              |
| retention can never be set inside the insights window   | `ARCHIVE_RETENTION_DAYS=1` is clamped to 28, warns, and prunes nothing inside the window |
| a shorter-than-default but still safe window is honoured | `ARCHIVE_RETENTION_DAYS=29` prunes the 40-day-old event, keeps the 20-day-old one |

### Vacation rules survive the fold (cron step 10)

Per-day detail is deleted once folded, so the monthly totals are the only place a break survives. The fold must apply the same rules as the live stats.

| Test                                                    | What it checks                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| folds a vacation miss as paused, not as a missed scheduled day | `habits[].paused`, `scheduled` untouched, `byHeader[].paused`, `vacationDays` |
| folds an ordinary miss as a miss                        | No vacation → `scheduled: 1`, `paused: 0`, `vacationDays: 0`            |
| still credits a habit done while away                   | A completed vacation day is an ordinary hit — credit is never removed   |
| folds a vacationMove apart from the unexcused postpone count | `reschedules.vacationMoves: 1`, `pushedLaterNoReason: 0`           |
| folds on-time using vacation-adjusted slippage          | A task that outlived a trip is on time, not late                        |
| a summary written before vacation existed gains the counters safely | `withDefaults` normalizes a legacy document; no counter becomes `NaN` |

---

## tests/insights.test.js

Tests the stats engine (via `GET /insights/stats` with seeded archive events), the nightly AI-free stats snapshot, the once-per-day report gate, and the insight report endpoints.

### GET /insights/stats — computed stats

| Test                                                              | What it checks                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| aggregates habit completion rate, streaks, and missed-by-weekday  | 4 results (3 done, Tue missed) → rate 75, currentStreak 2, longestStreak 2, `missedByDow: { Tue: 1 }` |
| aggregates recurring task_result events into scheduled/completed counts | 2 scheduled, 1 completed → completionRate 50                              |
| aggregates call_result events into per-person rates and miss streaks | 3 periods (1 done, 2 recent misses) → rate 33, `currentMissStreak: 2`, sorted `recentResults`; calls excluded from `byHeader` |
| returns an empty calls array when there are no call_result events | Habit-only archive → `calls: []`                                              |
| computes one-time task slippage from plannedFor vs doneAt         | Planned Jul 6, done Jul 8 → `slippageDays: 2`, `onTime: false`, `lateCount: 1`; null `plannedFor` → null slippage and null `onTime`, excluded from the rollups |
| reports zero slippage for a task completed on its scheduled date, whatever the time of day | Planned Jul 6, done Jul 6 at 07:15 / 12:30 / 23:59 → `slippageDays: 0` and `onTime: true` for all three, `avgSlippageDays: 0`, `onTimeCount: 3` (part-days never round up to a day of slip) |
| counts slippage in whole days across a boundary and keeps an early finish out of the average | Planned Jul 6, done Jul 7 at 00:30 → `1` (`onTime: false`); done Jul 4 at 18:00 → `-2` (`onTime: true`); early counts as 0 slip, so `avgSlippageDays: 0.5` with `onTimeCount: 1`, `lateCount: 1` |
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
| returns 503 when GEMINI_API_KEY is not configured           | Key removed from env → 503 with explanatory error      |
| defaults to a Flash model and honours the GEMINI_MODEL override | `insightModel()` returns the Flash default; `GEMINI_MODEL` is re-read per call, so a restart moves to Pro without a deploy |
| returns 404 when the archive is empty (no API call is made) | Dummy key + empty archive → 404 before any API request |

### GET /insights/stats/latest — nightly snapshot (no AI)

| Test                                                        | What it checks                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| returns 404 before the cron has ever written one            | Empty `InsightStats` collection → 404 `{ error }`                               |
| stores streaks without any Gemini key configured         | Key deleted from env + `refreshStatsSnapshot()` → 200 with `computedAt`, `eventCount: 3`, `currentStreak: 2`, `completionRate: 67` |
| matches what the live stats endpoint computes               | Snapshot body minus `computedAt` deep-equals `GET /insights/stats`               |
| a later refresh overwrites the snapshot rather than stacking | Second refresh after a missed day → still 1 document, `eventCount: 4`, `currentStreak: 0` |
| records an empty archive instead of leaving stale numbers behind | Archive wiped then refreshed → `eventCount: 0`, `habits: []`                |

### isInsightDue — daily cadence, once per UTC day

Unit tests on the cron's report gate (`src/services/insightsService.js`), seeded
straight into `Insights-Test`. The fixture date 2026-07-24 is a Friday, kept only so the "any day works" case is visibly not Friday-dependent.

| Test                                                        | What it checks                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| is due with no report yet                                   | Empty Insights collection → `true`                                      |
| is due on every day of the week                             | All seven consecutive days → `true` for each (the old gate fired on one) |
| is not due again on a day already reported on               | Report at 00:05, checked at 23:30 the same day → `false` (one call/day)  |
| is due again the very next day                              | Report from the previous day → `true`                                   |
| a manual report consumes that day's scheduled run           | `POST /insights/generate` at 15:00 → the nightly run that day is `false` |
| the day boundary is UTC, not local                          | A report at 23:50 does not suppress the run 10 minutes later on the next UTC day |
| measures against the newest report, ignoring older ones     | Reports 4 weeks back **and** today → `false` (newest wins)              |
| is due when the stored report has no generatedAt            | Malformed stored report → `true` rather than blocking forever           |

### Vacation — days off are not procrastination

Every rule applied end to end through `GET /insights/stats`, with seeded ranges in `Vacations-Test`.

**Habits**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| a missed day on vacation leaves the denominator          | `pausedDays: 3`, `scheduled: 4` not 7, rate 100% not 57%             |
| the streak restarts after the break rather than spanning it | current 2 (days since getting back), longest 3 (the pre-trip run)  |
| a habit ticked off on vacation counts and keeps the run alive | `pausedDays: 0`, streak 5 — credit is never removed              |
| vacation misses are excluded from missedByDow            | Only the real miss is counted                                        |
| recentResults marks vacation days                        | `vacation: true` so the UI can render a paused pip                   |
| a vacation day the user never had scheduled changes nothing | An unrelated trip does not touch the streak                       |

**The display freeze**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| while away, the window ends the day before departure     | `frozenAt`, `eventCount` excludes the trip, streak undisturbed        |
| a habit done mid-trip is archived now and surfaces once home | Ending the trip reveals the completion — a display freeze, not data loss |
| no vacation means no freeze                              | `frozenAt: null`, `vacationDaysInWindow: 0`                           |
| reports how many vacation days fall inside the window    | `vacationDaysInWindow: 3`                                             |
| reports a trip that just ended as justReturnedFrom       | `days: 5`                                                             |

**One-time task slippage**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| subtracts the days away from a task that outlived a trip | raw 19, adjusted 6, `avgSlippageDays: 6`                              |
| a task planned mid-trip behaves as if due the day back   | adjusted 4                                                            |
| a task finished during the trip is on time, not late     | `onTimeCount: 1`                                                      |
| a task unaffected by the trip is still judged late       | No over-forgiveness                                                   |

**Calls**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| a period almost entirely swallowed by a trip is exempt   | `exemptPeriods: 1`, `scheduled: 0`, no miss streak                    |
| a short trip does not excuse a whole fortnight           | `exemptPeriods: 0`, `currentMissStreak: 1`                            |
| an exempt period does not continue a miss streak across it | The streak stops at the exempt period                               |

**Reschedules and deletions**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| a vacationMove is counted apart from both reason buckets | `vacationMoves: 1`, both `pushedLater*` buckets 0                     |
| an unflagged postpone is still unexcused procrastination | The ordinary case is unchanged                                        |
| a deletion made on vacation is counted but labelled      | `count: 1`, `duringVacation: 1`                                       |

**Lifetime habit totals**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| counts every completion still in the raw archive         | `lifetimeCompleted: 2`                                                |
| adds the permanent monthly summaries to the raw window   | 28 + 25 folded + 1 raw = 54; the two sets are disjoint                |
| is unaffected by the reporting window                    | `?days=1` empties `habits` but the lifetime figure is unchanged       |

**The AI report is skipped entirely while away**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| isInsightDue is false on a vacation day                  | The nightly gate                                                      |
| isInsightDue is true again once home                     | Reports resume                                                        |
| POST /insights/generate refuses while away               | 409 (or 503 when no API key is configured); no report is written      |

**The nightly snapshot inherits the freeze**

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| stores as-of-departure numbers while the user is away    | `refreshStatsSnapshot` shares `buildStats`, so one rule covers both paths |

### Insight model

| Test                                          | What it checks                                        |
| ----------------------------------------------- | ------------------------------------------------------- |
| save persists a report and returns it with an _id | `Insight.save()` inserts; `Insight.latest()` reads it back |

### Insight retention (cron step 11)

| Test                                                    | What it checks                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| MAX_HISTORY is the one source of truth for the history ceiling | `Insight.MAX_HISTORY === 100` — the controller's `?limit=` cap and the retention floor read the same constant |
| pruneToNewest keeps the newest N and deletes the rest   | 12 seeded → prune to 5 → the 5 newest survive, in order               |
| pruning twice deletes nothing the second time           | Idempotent                                                            |
| is a no-op while under the window                       | 4 reports, keep 100 → 0 deleted                                       |
| is a no-op on an empty collection                       | 0 deleted, no throw                                                   |
| a full history window is still servable after a prune   | 105 seeded → trimmed to 100 → `?limit=100` still returns 100 (the floor's whole purpose) |
| a cron run reports how many reports it trimmed          | 103 seeded → `insightReportsPruned: 3`, 100 left                      |
| retention can never be set below the history ceiling    | `INSIGHT_RETENTION_COUNT=5` is clamped to 100, warns, and trims nothing |
| a larger window than the ceiling is honoured            | `INSIGHT_RETENTION_COUNT=110` with 112 stored → 2 pruned              |

---

## tests/done-at.test.js

Tests the `doneAt` timestamp lifecycle across user toggles and cron resets.

| Test                                          | What it checks                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| a new task is created with doneAt null        | `POST /tasks` → `doneAt: null`                                      |
| marking done sets doneAt to a current timestamp | `PUT { done: true }` → valid ISO datetime close to now            |
| marking undone clears doneAt back to null     | `PUT { done: false }` → `doneAt: null`                              |
| re-sending done=true does not move doneAt     | Done→done is a no-op; timestamp unchanged                           |
| cron day_of_week reset clears doneAt          | Step 2 reset → `done: false`, `doneAt: null`                        |
| cron day_of_year reset clears doneAt          | Step 1 reset → `done: false`, `doneAt: null`, year advanced to today's |

---

## tests/system.test.js

| Test                                                    | What it checks                                        |
| --------------------------------------------------------- | ------------------------------------------------------- |
| returns API info with message, environment, and docs link | `GET /` → message, `environment: "test"`, `/api-docs` |
| returns ok status with a valid timestamp                | `GET /health` → `status: "ok"`, timestamp within 10s    |
| GET /cron/details returns 404 when cron has not run in this process | The never-ran branch of `/cron/details` (cron never runs in this file) |
| unknown routes return 404 Route not found               | The catch-all 404 handler                               |
| malformed JSON bodies hit the error middleware          | Invalid JSON → 500 `"Something went wrong!"`            |

---

## tests/utils.test.js

The shared utility layer (`src/utils/`) tested directly, without going through
an endpoint. Everything here is a rule the rest of the backend used to repeat
by hand — see [`wiki/Home.md`](wiki/Home.md).

### utils/collections

| Test                                              | What it checks                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| appends -Test only when USE_TEST_DB is on         | `collectionName("Tasks")` → `"Tasks-Test"` / `"Tasks"`                  |
| reads the env var per call, not at require time   | Flipping `USE_TEST_DB` after load changes the result (the test setup relies on this) |
| getCollection resolves the environment's collection | The live handle's name is `Tasks-Test` under the test env             |

### utils/documents

| Test                                                    | What it checks                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| toObjectId accepts a valid id string and throws on a bad one | Round-trips a real id; a malformed one throws                |
| findById reads by string id and returns null for a miss | The models' "never throw for a miss" contract                     |
| findAllSorted applies the given sort                    | `{ name: 1 }` → `a, b, c`                                         |
| updateById returns the document after the write         | `returnDocument: "after"` semantics                               |
| deleteById removes exactly one document                 | 3 rows → 2                                                        |

### utils/ordering

| Test                                                   | What it checks                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| orderDoneLast puts undone first and done last          | The rule, with no comparator                                         |
| orderDoneLast sorts the undone half by the comparator only | Done items are never re-sorted                                    |
| orderDoneLast does not mutate its input                | The input array is untouched                                         |
| ascendingBy sorts Infinity keys last and keeps their order | No-ECD tasks sink; `Infinity - Infinity = NaN` preserves ties      |
| matchingFirst is stable within each group              | Dated undone above undated undone, both in input order               |
| groupBy preserves input order inside each group        | Cron step 7's per-header bucketing                                   |
| priorityBulkOps wraps only the moved documents as updateOne ops | Ready-to-send `bulkWrite` shape                              |
| an already contiguous list produces no writes          | An idempotent re-run writes nothing                                  |

### utils/priority

Runs against a real collection seeded with four rows in `H1` and two in `H2`.

| Test                                                  | What it checks                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| nextPriority is the size of the scope                 | Per-scope and collection-wide append positions                          |
| scopeSize counts only the scope                       | `{ headerId }` isolation                                                |
| shiftForMove moving up slides the block down by one   | `t3` 3→1 → `t0, t3, t1, t2`                                             |
| shiftForMove moving down slides the block up by one   | `t0` 0→2 → `t1, t2, t0, t3`                                             |
| shiftForMove is a no-op when the target equals the source | 0 writes, layout unchanged                                           |
| shiftForMove never touches another scope              | `H2` is untouched by an `H1` move                                       |
| movePriority accepts both ends of the range           | `0` and `n-1` are valid targets                                         |
| movePriority rejects a negative target with the shared message | `Priority must be between 0 and n-1` wording                  |
| movePriority range-checks before shifting anything    | An out-of-range target throws **and** leaves the list untouched         |
| movePriority returns the new priority                 | The value the caller stores on the document                             |
| closeGap pulls everything after the hole up by one    | Deleting priority 1 → remaining are 0, 1, 2                             |
| openSlot pushes the selected rows down by one         | Making room mid-list (`Task.create`)                                    |
| stamp writes updatedAt onto the shifted neighbours only when asked | Tasks stamp shifted neighbours; ordered collections deliberately do not |

### utils/validate

| Test                                                     | What it checks                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| requiredString trims and rejects every empty shape       | `undefined`, `null`, `""`, whitespace, numbers, objects all → 400 message |
| optionalString lets undefined through but not a blank value | The create/update asymmetry                                      |
| optionalText allows an empty string but not a non-string | Notes and reasons may be `""`                                       |
| optionalBoolean accepts false and rejects truthy non-booleans | `false` is a value, `"true"` is not                            |
| optionalPriority requires a non-negative integer         | `-1`, `1.5`, `"2"`, `null` → 400                                    |
| optionalStringOrNull keeps null as a real value          | `null` unlinks; `undefined` means "not sent"                        |
| dateStringOrNull defaults absent to null and validates the format | `YYYY-MM-DD` only                                           |
| isDateString matches only YYYY-MM-DD strings             | Used by `Task.validateEcd`                                          |
| oneOf reports the caller's own message                   | Wordings differ too much to generate                                |
| requireObject rejects null and arrays                    | Goal steps / project tasks list-entry guard                         |
| requireArray can demand a non-empty array                | `{ nonEmpty: true }`                                                |
| definedFields drops absent fields and keeps falsy ones   | `0`, `false`, `null`, `""` survive; only `undefined` is dropped     |
| definedFields reports the first invalid field in source order | The object literal's order is the validation order             |

### utils/http

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| requireFound passes a value through and throws on a miss | `null`/`undefined` → a 404-mapped error carrying the given message   |
| isPriorityRangeError and isEcdError match the model wordings | The two `badRequest` predicates                                 |
| route passes a successful handler straight through      | No interference on the happy path                                    |
| route answers a ValidationError with 400 and does not log | A bad request is not a server error                                |
| route answers a NotFoundError with 404 and does not log | Same for a miss                                                      |
| route logs then answers 400 for a matched model error   | `Error updating header:` is logged **first**, then 400               |
| route logs then answers 500 for anything unmatched      | `{ error: failure, message }` plus the log                           |

### utils/dates

| Test                                                | What it checks                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| the weekday and month tables are the shared constants | The three former copies of `DOW_NAMES` and the leap-agnostic month table |
| daysInMonth handles leap years                      | Feb 2026 = 28, Feb 2024 = 29                                           |
| parseSlashDate reads both the D/M and D/M/YYYY forms | Life events and `day_of_year` ECDs                                     |
| dayOfWeekName reads the UTC weekday                 | 2026-03-08 is a Sunday                                                 |
| utcDayString formats a calendar day                 | `"2026-03-08"` from an afternoon instant                               |
| utcDayStart snaps to midnight and reports NaN for junk | Unparseable input is detectable, not silently 0                     |
| daysBetween counts calendar days, not elapsed hours | The slippage bug: an afternoon completion on the planned day is 0, not 1 |
| daysAgo walks back a whole number of days           | The insights look-back window                                          |
| utcToday is midnight UTC                            | The life-event baseline clock                                          |

### utils/stats

| Test                                              | What it checks                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| bucket creates once and returns the same object after | The accumulator upsert used by five rollups                       |
| byDueDate sorts oldest first                      | `"YYYY-MM-DD"` string ordering                                       |
| completionRate rounds and reports the empty case as 0 | No `NaN` reaches the API                                          |
| trailingStreak counts only the run at the end     | Habit streaks (completions) and call miss streaks (the inverse)      |
| longestRun finds the longest run anywhere         | `longestStreak`                                                      |
| average rounds to one decimal and returns null when empty | "No data" is `null`, not 0                                    |
| countWhere counts matches                         | On-time / late / with-reason counts                                  |

### utils/vacation

The arithmetic behind every vacation rule, shared by the live stats and the permanent monthly fold (which must agree).

| Test                                                    | What it checks                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| isVacationDay: the first and last day are vacation days | Both ends inclusive                                                  |
| isVacationDay: the days either side are not             | The boundary is exact                                                |
| isVacationDay: no ranges / a null day                   | Neither exempts anything                                             |
| toRanges drops entries with a missing or inverted date  | Malformed input can never exempt history                             |
| toRanges sorts by start date / tolerates a non-array    | Defensive normalization                                              |
| vacationDaysBetween counts the overlap, both ends inclusive | 13 days for a 13-day trip inside a wider span                     |
| vacationDaysBetween counts only the overlapping part    | Partial overlap                                                      |
| vacationDaysBetween is zero when the spans do not meet / for an inverted span | No accidental credit                              |
| vacationDaysBetween sums separate trips without double counting | Non-overlapping ranges add                                    |
| vacationLength counts both ends                         | A one-day trip is 1, not 0                                           |
| statsCutoff freezes at the day before departure         | The display freeze, from the very first vacation day                 |
| statsCutoff is null once home / before the trip starts  | The freeze lifts on return                                           |
| recentlyEnded reports a trip that ended yesterday with its length | Drives the "returned from an N-day break" framing           |
| recentlyEnded honours the three-day grace window        | One missed cron night does not cost the restart report               |
| recentlyEnded does not report the trip the user is still on | Only finished trips                                              |
| callPeriod: the 15th closes the first half of the month | `[1st, 14th]`, 14 days                                               |
| callPeriod: month end closes the back half (biweekly) / the whole month (monthly) | The documented spans, not the reset mechanics       |
| callPeriod resolves short months                        | February is 28 days                                                  |
| isCallPeriodExempt: a whole period away exempts it      | 100% ≥ 80%                                                           |
| isCallPeriodExempt: 12 of 14 days clears the bar, 11 does not | The 80% boundary                                               |
| isCallPeriodExempt: a short trip never excuses a period | A fortnight of not calling is not forgiven by three days away        |
| eventDay: outcome events use dueDate                    | Habit/task/call results                                              |
| eventDay: a completion uses the day it was finished     | Not its insertion time                                               |
| eventDay: a reschedule uses its own timestamp           | Reschedules and deletions have no `dueDate`                          |
| isPausedResult: a missed day on vacation is paused      | The core rule                                                        |
| isPausedResult: a day the user actually did is never paused | Vacation removes the penalty, never the credit                   |
| isPausedResult: a missed day outside the trip is an ordinary miss | No over-forgiveness                                         |
| isVacationEvent: an event during the trip qualifies on its timestamp | The during-trip case                                    |
| isVacationEvent: a trip booked in advance qualifies only via the flag | Why `vacationMove` has to be explicit                  |
| adjustedSlippage subtracts the trip from a task that outlived it | Planned Aug 1, done Aug 20, away Aug 3–15 → 6 days late, not 19 |
| adjustedSlippage: a task planned mid-trip behaves as if due the day back | Planned Aug 5 → 4 days late                             |
| adjustedSlippage leaves an unaffected task alone        | No trip in the gap → unchanged                                       |
| adjustedSlippage never turns lateness negative          | Floored at 0                                                         |
| adjustedSlippage passes early and on-the-day completions through | Negative and zero are untouched                             |
| adjustedSlippage: null stays null                       | No `plannedFor` → no slippage                                        |
