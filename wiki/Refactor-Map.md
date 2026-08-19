# Refactor map

What was duplicated, how many times, and what replaced it. Useful for review,
and for finding the call site when a rule needs to change.

## By pattern

| Duplicated pattern | Copies | Replaced by |
| --- | --- | --- |
| `USE_TEST_DB` collection switch | 12 | `utils/collections.getCollection` |
| `findOne({ _id: new ObjectId(id) })` | 8 | `BaseModel.findById` / `utils/documents.findById` |
| `find({}).sort(...).toArray()` | 8 | `BaseModel.findAll` |
| `findOneAndUpdate(… returnDocument: "after")` | 8 | `BaseModel.applyUpdate` |
| find-then-delete-then-return | 8 | `BaseModel.delete` |
| `{ createdAt: now, updatedAt: now }` | 7 | `BaseModel.timestamps` |
| empty-update guard + `updatedAt` stamp | 7 | `BaseModel.saveUpdates` |
| the 30-line priority move block | 5 | `OrderedModel.resolvePriorityChange` → `utils/priority.movePriority` |
| delete-then-close-the-gap | 5 | `OrderedModel.delete` → `utils/priority.closeGap` |
| `priority: await countDocuments()` | 4 | `OrderedModel.nextPriority` |
| undone-first / done-last ordering | 3 | `utils/ordering.orderDoneLast` |
| renumber-to-contiguous loop | 3 | `utils/ordering.priorityBulkOps` |
| `try/catch` + `console.error` + 500 | 38 | `utils/http.route` |
| `if (!x) return res.status(404)` | 22 | `utils/http.requireFound` |
| `if (!name \|\| typeof name !== "string" …)` | 19 | `utils/validate.requiredString` / `optionalString` |
| `if (priority !== undefined && …)` | 5 | `utils/validate.optionalPriority` |
| the `if (x !== undefined) updates.x = x` cascade | 8 | `utils/validate.definedFields` |
| `DOW_NAMES` | 3 | `utils/dates.DOW_NAMES` |
| days-in-month | 3 | `utils/dates.daysInMonth` / `MAX_DAYS_BY_MONTH` |
| `"D/M[/YYYY]".split("/").map(Number)` | 3 | `utils/dates.parseSlashDate` |
| `86400000` literal | 5 | `utils/dates.daysAgo` / `daysBetween` |
| `if (!store[key]) store[key] = {…}` | 5 | `utils/stats.bucket` |
| completion rate | 3 | `utils/stats.completionRate` |
| trailing-streak loop | 2 | `utils/stats.trailingStreak` |
| the `task_completed` archive event | 2 | `Archive.completionEvent` |
| the archive idempotency guard | 2 | `Archive.loggedIdsFor` |
| `/cron/status` and `/cron/details` handlers | 2 | one `lastRunHandler` in `server.js` |
| `POST` and `GET /cron/run` handlers | 2 | one `runCronHandler` factory |

## By file

| File | Before | After | Notes |
| --- | --- | --- | --- |
| `models/Task.js` | 397 | 328 | priority scoping via `utils/priority`; `Date` timestamps kept |
| `models/LifeEvent.js` | 206 | 116 | date helpers moved to `utils/dates`, re-exported for the controller |
| `models/Project.js` | 196 | 101 | `sortProjectTasks` is now one `orderDoneLast` call |
| `models/Goal.js` | 181 | 97 | priority backfill kept, move arithmetic inherited |
| `models/Header.js` | 177 | 91 | project idempotency kept; no timestamps |
| `models/Call.js` | 109 | 53 | |
| `models/Event.js` | 97 | 43 | |
| `models/Affirmation.js` | 95 | 40 | |
| `models/Archive.js` | 79 | 123 | *grew* — absorbed `completionEvent` and `loggedIdsFor` from two callers |
| `controllers/projectController.js` | 215 | 163 | |
| `controllers/lifeEventController.js` | 209 | 144 | |
| `controllers/goalController.js` | 205 | 140 | |
| `controllers/taskController.js` | 174 | 128 | |
| `controllers/insightController.js` | 159 | 143 | window arithmetic shared by two reads |
| `controllers/headerController.js` | 145 | 104 | |
| `controllers/eventController.js` | 136 | 75 | |
| `controllers/callController.js` | 130 | 79 | |
| `controllers/affirmationController.js` | 101 | 60 | |
| `services/insightsService.js` | 515 | 464 | accumulators and metrics via `utils/stats` |
| `cron/cronJob.js` | 828 | 793 | step 7 via `utils/ordering`; date helpers via `utils/dates` |
| `services/headerOrder.js` | 185 | 177 | renumbering via `priorityBulkOps` |

Totals: 2,078 lines removed and 1,196 added across the pre-existing files;
463 SLOC of new shared modules. Net **−393 SLOC** (−10%), and **−856 SLOC
(−23%)** inside the files that already existed.

## Pruned after the first pass

A follow-up audit checked every model field and every function parameter for a
real caller:

- **No document field was removable.** Every persisted field on every model is
  read by the backend, the web FE or Shleeji — including `createdAt`/`updatedAt`
  (both read by the FE) and `lastAddedYear` (read by the cron and the FE).
- `documents.idString()` was deleted — nothing called it.
- `ordering.orderDoneLast`'s `isDone` option and `stats.average`'s `decimals`
  option were removed: neither was ever passed a non-default value.
- `refreshStatsSnapshot`'s `computedAt` option was removed — documented as a
  testing override, but no test ever passed it.
- Six exports were made internal (see [Home](Home.md)); their behaviour and
  their test coverage are unchanged, only the module surface shrank.

## Deliberate non-changes

- **Route files** (`src/routes/*.js`) are almost entirely `@openapi` JSDoc.
  There is no logic to share.
- **`Task.validateEcd`** stays in the model. `CLAUDE.md` names it as the one
  validation that does not live in a controller, and the cron calls it too.
- **The `Infinity - Infinity = NaN` comparator result** in ECD sorting is
  preserved, not "fixed" — `sort` reads `NaN` as "leave these two alone", which
  is what keeps same-day manual ordering stable.
- **Timestamp formats** (ISO strings vs `Date`s vs none) differ per collection
  because the *stored data* differs. `stamp()` is overridable for that reason.
- **`API_REFERENCE.md`** is untouched: no endpoint, request body, response
  shape or status code changed.
