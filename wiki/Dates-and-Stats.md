# Dates and stats

## `src/utils/dates.js`

All date maths in this app is UTC, and it kept being re-derived: the weekday
table existed in three files, "how many days in this month" in four, and "parse
a `D/M[/YYYY]` string" in three more (once inline in the cron).

Nothing here knows about tasks or life events — it is calendar arithmetic only.
The rules that *use* it (which ECD is due today, when the next occurrence is)
stay in `cron/cronJob.js` where they are documented.

`MS_PER_DAY` (86400000) stays internal — `daysBetween` and `daysAgo` are the
only things that ever needed it, and they are what the rest of the app calls.

| Export | Notes |
| --- | --- |
| `DOW_NAMES` | `["Sun", …, "Sat"]`, indexed by `getUTCDay()` |
| `MAX_DAYS_BY_MONTH` | leap-agnostic (February is 29) — for *validating* a recurring `D/M` date |
| `daysInMonth(year, month)` | the real length, leap years included; month is 1-indexed |
| `parseSlashDate(value)` | reads both `"7/3"` and `"7/3/2006"` → `{ day, month, year? }` |
| `dayOfWeekName(date)` | `"Mon"` |
| `utcDayString(date)` | `"YYYY-MM-DD"` |
| `utcDayStart(value)` | midnight-UTC epoch ms of that calendar day, `NaN` if unparseable |
| `utcToday()` | today at midnight UTC |
| `daysBetween(from, to)` | whole calendar days, `null` if either side is unparseable |
| `daysAgo(to, days)` | the start of a look-back window |

### Why `daysBetween` snaps both sides

A day count must snap **both** ends to a day boundary. Comparing a `doneAt`
instant against a midnight `plannedFor` made any completion after 12:00 UTC
round up to a full day of slip *on the very day the task was scheduled* — a
task finished on time was reported as late. `tests/utils.test.js` pins that
case explicitly.

### Feb 29 and the 31st

`MAX_DAYS_BY_MONTH` and `daysInMonth` look similar and are not
interchangeable. Asking for Feb 29 or "the 31st" is legal and the stored value
is never rewritten; the schedulers clamp it *on read* against the real month
(`effectiveDaysOfMonth` / `effectiveDayOfYear` in the cron). An earlier version
clamped in the database and permanently rewrote "the 31st" to 28 after the
first February it survived.

## `src/utils/stats.js`

The arithmetic behind the insights numbers. It is all small and it was all
written at least twice — habits and calls compute the same completion rate and
the same trailing streak from the same `{ dueDate, completed }` shape, and four
rollups opened their accumulator with the same `if (!store[key]) store[key] = …`.

| Function | Notes |
| --- | --- |
| `bucket(store, key, create)` | get-or-create an accumulator; `create` runs only on first sight |
| `byDueDate(a, b)` | oldest first (dates are `"YYYY-MM-DD"`, so a string compare is enough) |
| `completionRate(completed, scheduled)` | rounded percent; the empty case is `0`, not `NaN` |
| `trailingStreak(items, matches)` | the run at the **end** — a streak still running |
| `longestRun(items, matches)` | the longest run anywhere |
| `average(values)` | mean to one decimal; `null` for an empty list — "no data" is not zero |
| `countWhere(items, matches)` | |

Habits count trailing *completions*; calls count trailing *misses*. Same
function, opposite predicate:

```js
currentStreak: trailingStreak(results, (r) => r.completed),
currentMissStreak: trailingStreak(results, (r) => !r.completed),
```

Keeping this out of the service is also what lets the numbers be unit-tested
without an archive to read from.

> **Naming gotcha.** `bucket` is a function here. `computeStats` has a
> `headerBucket` accumulator too — do not shadow the import with a local
> `const bucket = …` inside a `case` block, or the call above it hits the
> temporal dead zone and the request 500s. The locals are named `header`,
> `habit`, `recurring`, `person` and `rescheduled` for that reason.

## Tests

`tests/utils.test.js`, `describe("utils/dates")` and `describe("utils/stats")`.
