# TaskAtHandBE

Node.js/Express 5 REST API backed by MongoDB via the **native driver (no Mongoose)**. Entry point `src/server.js`; flow is routes → controllers → models. Daily cron in `src/cron/cronJob.js`, AI insights in `src/services/insightsService.js` (Anthropic API, `claude-sonnet-4-6`).

## Commands

- `npm test` — Jest + supertest against a **real MongoDB** using `-Test` collections. Serial (`--runInBand`) is required; tests share one DB.
- `npm run dev` — nodemon on port 3002 (default `PORT`)
- `npm run cleartest` — wipe the `-Test` collections

## Environment

`MONGO_URI` (may contain a `<db_password>` placeholder replaced by `DB_PASSWORD` — see `src/config/db.js:12-16`), `PORT` (default 3002), `NODE_ENV` (`test` skips server + cron startup), `USE_TEST_DB=true` (switches every model to `Headers-Test`, `Tasks-Test`, `Events-Test`, `LifeEvents-Test`, `Affirmations-Test`, `Calls-Test`, `Goals-Test`, `Projects-Test`, `TaskArchive-Test`, `Insights-Test`, `InsightStats-Test`), `ANTHROPIC_API_KEY` (optional; AI report generation returns 503 without it — the nightly stats snapshot still runs).

## Architecture rules

- **Validation lives in controllers**, except ECD validation which lives in `Task.validateEcd` (`src/models/Task.js`) and is called by controllers. Don't duplicate it elsewhere.
- **Response shapes**: create → 201 with full resource; update → 200 full resource; delete → `{ deleted: id }` (headers also return `tasksDeleted`); validation → 400 `{ error }`; missing → 404; models return `null` for not-found, never throw.
- **IDs are MongoDB ObjectIds**, converted from string params with `new ObjectId(id)`. Archive events store taskIds as *strings*.
- Every route has an `@openapi` JSDoc block (Swagger UI at `/api-docs`); shared schemas live in `src/config/swagger.js`. New/changed endpoints must update both.
- **Adding a collection**: add the `-Test` variant in the model's `getCollection()`, in `tests/setup.js`, and in `scripts/cleartest.js`.

## Core invariants (easy to break)

- **Priority contiguity**: header priorities and per-header task priorities are always `0..n-1`. New headers append at end; new tasks insert at `priority = undoneCount` (before the first done task). Every move/delete shifts neighbors to keep contiguity.
- **Cron step 7 re-sorts all task priorities nightly** (undone by soonest ECD, then done). Manual priority edits don't survive the next cron run.
- **Cron step 5 deletes headers with no tasks nightly** (including ones emptied by step 4) and re-numbers surviving header priorities to stay contiguous. An empty header a user just created won't survive the next cron run.
- **ECD types**: `date` (`"YYYY-MM-DD"`, one-time), `day_of_week` (array of `"Sun".."Sat"`), `day_of_month` (array of 1–31, clamped monthly), `day_of_year` (`"D/M/YYYY"`, auto-advanced yearly), or `null`.
- **`doneAt`**: set when `done` flips true, cleared on undo and on cron resets.
- **Cron runs at UTC midnight**, steps 0–9 in order (archive yesterday → advance DOY → mark undone DOW/DOM → delete done date/no-ECD tasks after archiving (and mark project tasks/life events whose `todoTaskId` matches a deleted task as done, link cleared) → delete empty headers and rearrange header priorities → add due life events to the todo (a linked `date` task under an "Events" header, once per year via `lastAddedYear`) → reorder tasks per header → reset done calls on the 15th (biweekly) / last day of month (all) → refresh the `InsightStats` snapshot), then AI report generation (not a numbered step). All date math is UTC.
- **Step 9 (stats snapshot) is AI-free and runs every night**: it recomputes streaks/rates/on-time counts over `TaskArchive` and replaces the single `InsightStats` doc, so it needs no `ANTHROPIC_API_KEY` and ignores `skipInsights`. Its window ends at the real now (archive events carry real insertion times), *not* at the run's `date` override. **The AI report is weekly — Fridays (UTC) only, once per Friday** (`isInsightDue` in `insightsService`); other runs report `insightSkipped: "not-due"`. `POST /insights/generate` bypasses the gate.
- **A task completed on or before its `plannedFor` date is on time, never slippage**: `slippageDays` stays signed (negative = early) but `onTime`, `onTimeCount`/`lateCount` and the lateness-only `avgSlippageDays` encode that rule, and the coach prompt states it. Don't reintroduce a negative average.
- **TaskArchive is append-only** with event types `habit_result`, `task_result`, `task_completed`, `task_rescheduled`. `Archive.log()` never throws — archive failures are silent by design.
- **Header delete cascades** to its tasks (controller-level). `Task.deleteByHeader` archives the header's **done** tasks as `task_completed` events before removing them (so completion history isn't orphaned); undone tasks are removed without archiving. Event deletion does NOT touch tasks created from it.

## Testing conventions

Pattern: `beforeAll(connectDB)` + `beforeEach(clearCollections)`; supertest against the exported app; direct `getDatabase()` access for setup/assertions; cron tests control time via `POST /cron/run { date }` (never mock Date). Anthropic API is not called in tests (checked via key presence only). Some chron tests hardcode dates (e.g. 2026-03-08 = Sunday, 2026 non-leap) — don't shift them.

Where tests live, by change type:

| If you change...              | Tests to update                                            |
| ------------------------------ | ---------------------------------------------------------- |
| CRUD endpoints / basic priority| `crud.test.js`, `error-handling.test.js`                   |
| Projects                       | `projects.test.js` (+ `chron.test.js` for step 4 sync)     |
| Life events                    | `lifeevents.test.js` (+ `chron.test.js` for steps 4/6)     |
| Priority/reorder business logic| `business-logic.test.js` (+ `crud.test.js` basics)         |
| Cron algorithm (steps 0–9)     | `chron.test.js` AND `cron-api.test.js` (API contract side) |
| ECD types/validation           | `ecd-validation.test.js` + `chron.test.js` (step handling) |
| done/doneAt behavior           | `done-at.test.js`                                          |
| Archive logging                | `archive.test.js`                                          |
| Events                         | `events.test.js`                                           |
| Affirmations                   | `affirmations.test.js`                                     |
| Calls                          | `calls.test.js` (+ `chron.test.js` for step 8 resets)      |
| Goals                          | `goals.test.js`                                            |
| Insights/stats                 | `insights.test.js`                                         |
| Header↔Task cascade/isolation  | `collections.test.js`                                      |
| Health/root/404 handlers       | `system.test.js`                                           |

## Documentation & test policy (MANDATORY)

Any code change MUST include, in the same task: (1) updated/new tests per the table above, with `npm test` passing; (2) updates to **every** affected doc. Content is duplicated across docs, so one change usually touches several:

| If you change...            | Update ALL of...                                                                 |
| --------------------------- | -------------------------------------------------------------------------------- |
| Data model fields/rules     | `todo_app_structure.md` (canonical, "Models") + `API_REFERENCE.md` ("Data Models")|
| Endpoints/request-response  | `API_REFERENCE.md` (canonical) + `README.md` endpoint table + `todo_app_structure.md` routes summary + route `@openapi` JSDoc |
| Cron logic                  | `todo_app_structure.md` (canonical, step-by-step) + `API_REFERENCE.md` cron table |
| ECD validation              | `todo_app_structure.md` "ECD Types" + `API_REFERENCE.md` ECD sections (two)       |
| Archive event types         | `todo_app_structure.md` + `API_REFERENCE.md` Archive API                          |
| Insight report schema       | `todo_app_structure.md` + `API_REFERENCE.md` Insights API                         |
| Tests added/renamed/removed | `TEST_REFERENCE.md` (canonical; keep its per-file "Test \| What it checks" tables in sync) + `README.md` test-file table |
| Env vars / setup / features | `README.md`                                                                       |
| Useful Mongo queries        | `DB_QUERIES.md` (only when relevant)                                              |

Canonical sources when docs disagree: `API_REFERENCE.md` for endpoint contracts, `todo_app_structure.md` for model rules and cron logic, `TEST_REFERENCE.md` for test inventory; `README.md` is a summary of the others. Match each doc's existing format (TS-style interfaces in API_REFERENCE, JSON + prose in todo_app_structure, tables in TEST_REFERENCE).

Never end a task with code changed but the matching tests and docs untouched. If a change genuinely needs no doc or test update, state why explicitly in your summary.
