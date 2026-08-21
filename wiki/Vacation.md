# Vacation

## `src/utils/vacation.js`

A vacation is a period the user booked off, stored as two **inclusive**
`"YYYY-MM-DD"` days. The rule the whole feature serves is one sentence:

> **A day the user booked off is not a day they failed** — but a day they
> worked anyway still counts.

That asymmetry is the feature. Vacation removes the penalty, never the credit.

## Vacation is a lens, not a pause button

Nothing in the cron behaves differently while the user is away. Habits still
reset each morning, done one-off tasks are still deleted, life events are still
added, priorities are still re-sorted, outcomes are still archived. The app
stays fully usable on holiday and anything ticked off still counts.

What changes is how the archive is **read**. Two things follow from that:

1. **Nothing is written onto an archive event.** `TaskArchive` is append-only,
   and a vacation can be corrected after the fact — so every rule is derived
   from the stored ranges at read time.
2. **`Vacations` documents are never pruned.** They are a few dozen bytes each
   and they are the only record that makes the past re-derivable. Deleting a
   range silently turns a forgiven fortnight back into two weeks of missed
   habits.

## The exports

| Export | Notes |
| --- | --- |
| `toRanges(vacations)` | drops malformed entries and sorts; a half-written range must never exempt every day in history |
| `isVacationDay(day, vacations)` | both ends inclusive |
| `activeVacation(vacations, day)` | the range covering a day, or `null` |
| `vacationDaysBetween(from, to, vacations)` | overlap arithmetic, not a day walk — a task left undone for a year costs a handful of comparisons |
| `vacationLength(vacation)` | whole days, both ends counted |
| `statsCutoff(vacations, today)` | the display freeze: the day before an active vacation started, else `null` |
| `recentlyEnded(vacations, today, graceDays = 3)` | a trip that has just ended, for the welcome-back framing |
| `callPeriod(dueDate, frequency)` | the calendar span a `call_result` covers |
| `isCallPeriodExempt(dueDate, frequency, vacations)` | the 80% rule |
| `eventDay(event)` | which calendar day an event is judged on |
| `isPausedResult(event, vacations)` | a scheduled day that passed while away and was not done |
| `isVacationEvent(event, vacations)` | a postpone or deletion under vacation cover |
| `adjustedSlippage(plannedFor, doneDay, raw, vacations)` | lateness minus the days away |

## The six signals

| Signal | Rule |
| --- | --- |
| Missed habit / recurring day | **Paused** — leaves the completion-rate denominator, `missedByDow` and `byHeader.missed` |
| Late completion | `adjustedSlippage`: raw slippage minus the vacation days between `plannedFor` and `doneAt` |
| Postpone | `vacationMoves`, excluded from both reason buckets |
| Deletion | Counted, flagged `duringVacation` |
| Missed call period | Exempt only at ≥80% overlap |

### Why `eventDay` exists

Not every event has a `dueDate`. Habit, task and call results do; a
`task_completed` is judged on the day it was finished; a `task_rescheduled` or
`task_deleted` only knows *when it happened*. Getting this wrong is the
difference between forgiving a postpone made on holiday and flagging it.

### Why `vacationMove` is an explicit flag

A trip booked in advance is re-dated **before it starts**, so the reschedule's
own timestamp falls outside every range. Timestamp inference alone would log
the Vacation panel's own re-dating as unexcused procrastination — the exact
opposite of the point. `isVacationEvent` therefore accepts either the flag or
the timestamp.

It is a separate boolean rather than a canned `reason` string on purpose: the
coach prompt is instructed to *judge* reasons and weigh weak excuses, and a
vacation move should never enter that judgement.

### Why calls get a different rule

Calls are the one signal measured over a **period** rather than a day. A
two-day trip must not excuse a whole fortnight of not ringing someone, so a
period is only forgiven when a vacation swallowed essentially all of it — 80%,
which is ~12 of 14 days for a biweekly period and ~25 of 31 for a monthly one.

### The one formula worth remembering

```
adjusted slippage = raw slippage − vacation days between plannedFor and doneAt
```

Planned Aug 1, finished Aug 20, away Aug 3–15: nineteen raw days late, but only
Aug 1–2 and Aug 16–20 were ever actionable, so **six**. And a task planned for
Aug 5 — mid-trip — comes out at **four**, exactly as if its deadline had moved
to the day the user got back. One formula, both cases.

## Streaks restart, they do not span

An untouched vacation day is neither a hit nor a miss, but it **does** end the
run. Ten clean days, a week away, three clean days reads as:

> current streak **3** · best **10** · rate **100%** over 13 scheduled days

`trailingStreak` and `longestRun` needed no changes at all: a paused day is not
`completed`, so both already terminate on it. Only the denominator,
`missedByDow` and `byHeader` needed the rule.

## The display freeze

While a vacation is active the stats window ends the day *before* it started,
so a streak or a rate does not visibly decay over a holiday. It is a **display
freeze only** — work done mid-trip is archived as usual and appears the day the
user is home.

It lives in `insightsService.buildStats`, which is what both
`GET /insights/stats` and the nightly snapshot call, so the live numbers and
the stored ones can never disagree. The freeze filters on each event's
**subject day** (`eventDay`), not its insertion time: the outcome of the last
day before a trip is written at the following midnight, and filtering by `at`
would throw that day away.

## Two callers that must agree

The rules run in two places:

- `insightsService.computeStats` — the live window
- `ArchiveSummary.foldEvents` — months being pruned out of it

The fold is not optional. The live stats re-derive vacation on every read, but
the monthly totals **outlive the events they came from**: once cron step 10
deletes the raw days, nothing can re-derive them. A fold that ignored vacation
would bake a fortnight of misses into a document kept forever.

One consequence to accept: correcting a vacation range more than
`ARCHIVE_RETENTION_DAYS` after the fact does not revise an already-folded
month. See [Archive retention](Archive-Retention.md).

> **Legacy summaries.** Months folded before vacation existed have no `paused`,
> `vacationMoves` or `vacationDays`, and `++` on `undefined` writes `NaN` into
> a permanent document. `ArchiveSummary.withDefaults` normalizes on read;
> `forMonth` and `foldEvents` both go through it.

## The AI report

Skipped **entirely** on a vacation day — `isInsightDue` refuses, the cron
reports `insightSkipped: "vacation"`, and `POST /insights/generate` answers
409. On the first report after a trip, `recentlyEnded` puts
`justReturnedFrom` in the prompt and the model is asked for a short restart
plan rather than an inventory of everything that lapsed.

## Tests

`tests/utils.test.js`, `describe("utils/vacation")` for the arithmetic;
`tests/vacation.test.js` for the resource and the re-date flow;
`tests/insights.test.js`, `describe("Vacation — days off are not
procrastination")` for the rules end to end; `tests/archive.test.js`,
`describe("Vacation rules survive the fold")` for the permanent totals.
