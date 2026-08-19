# Archive retention

`TaskArchive` is append-only. Nothing ever deleted from it, and nothing ever
expired it — so it grew forever while only the **last 28 days** were ever read
(`DEFAULT_PERIOD_DAYS`, the insights window).

Cron **step 10** bounds it without losing the history:

> Fold raw events older than the retention window into `ArchiveSummary` — one
> document per calendar month, kept forever — then delete them.

Per-day detail ages out. Monthly totals stay, at a few hundred bytes a month.

## The window

| | |
| --- | --- |
| Default | **30 days** |
| Override | `ARCHIVE_RETENTION_DAYS` |
| Hard floor | the insights window (28 days) |

The floor is not advisory. A smaller value is logged and raised:

```
[Cron] ARCHIVE_RETENTION_DAYS=7 is inside the 28-day insights window — using 28
```

Pruning inside that window would silently starve the nightly `InsightStats`
snapshot of the events it reads — streaks would shrink for no visible reason.

With the default there is a **2-day margin** between what insights read (28)
and what survives (30). That is deliberate but thin: raising
`DEFAULT_PERIOD_DAYS` without raising retention is caught by the floor rather
than by a bug report.

## Two rules that make a re-run safe

Deleting is irreversible, so step 10 is built to survive being interrupted and
repeated.

**1. The cutoff is a UTC day boundary.** Not "now minus 30 days" — the real
today at UTC midnight, minus the window. Only *whole* days are ever pruned. A
day split across two runs would be counted by one run and dropped by the other.

**2. The fold is idempotent per source day.** Each month's summary carries
`days: ["2026-07-01", …]` — the source days already folded in. `foldEvents`
skips any event whose day is already listed.

That combination covers the dangerous interleaving:

```
fold batch  →  ✅ summary written  →  💥 crash  →  raw events still present
next run    →  re-reads the same events  →  folded: 0  →  deletes them
```

Nothing is counted twice, nothing is stranded.

## It reads the real clock, never the run's date

Like step 9, the cutoff comes from the **real** current time even when the run
was given a `date` override:

```js
const cutoff = daysAgo(utcToday(), retentionDays);   // not the run's `today`
```

Archive events are stamped with their real insertion time. A cron run
pretending to be 2028 would otherwise treat this week's events as four years
old and delete the lot — which is exactly what the test suite does two dozen
times over.

## What a month looks like

```json
{
  "month": "2026-07",
  "days": ["2026-07-01", "2026-07-02"],
  "eventCount": 412,
  "habits": [{ "taskName": "Meditate", "headerName": "Health", "scheduled": 22, "completed": 19 }],
  "recurring": [{ "taskName": "Pay rent", "ecdType": "day_of_month", "scheduled": 1, "completed": 1 }],
  "calls": [{ "callName": "Grandma", "frequency": "biweekly", "scheduled": 2, "completed": 1 }],
  "oneTimeTasks": { "completed": 14, "onTime": 11, "late": 3 },
  "reschedules": { "total": 5, "pushedLater": 4, "pushedLaterNoReason": 2 },
  "deletions": { "count": 2, "withReason": 1 },
  "byHeader": [{ "headerName": "Health", "completed": 19, "missed": 3, "reschedules": 1, "deleted": 0 }]
}
```

Counters are **arrays keyed by name, not objects**. Task and call names are
free text and may contain `.`, which Mongo rejects in a field name — a habit
called "Read 30 min." would have broken an object-keyed map.

`oneTimeTasks.onTime` uses the same rule as the live stats: finished on or
before the planned day is a win, only a later completion is late. Calls are
deliberately absent from `byHeader` — they have no header.

Read them at `GET /archive/summary`, oldest month first.

## What you give up

**Per-day detail past the window is gone.** The summary cannot tell you *which*
Tuesday a habit was missed, only how many were missed that month. Streaks
spanning the boundary cannot be recomputed from it either — a streak is a run
of consecutive days, and the days are what was dropped.

If that matters for a future feature, raise `ARCHIVE_RETENTION_DAYS` **before**
the data ages out. There is no way to get it back afterwards.

## Indexes

Both are created at server startup (`startServer`), idempotently:

| Collection | Index | Why |
| --- | --- | --- |
| `TaskArchive` | `{ at: 1 }` | every archive read and the prune itself filter on `at`; without it each nightly snapshot is a full collection scan |
| `ArchiveSummary` | `{ month: 1 }` unique | one document per month is the whole invariant, and `save()` upserts on `month` |

## Tests

`tests/archive.test.js`, `describe("Archive retention (cron step 10)")` — the
window boundary, the fold's contents, the on-time rule, a repeated run, the
crash-between-fold-and-delete case, a month-spanning batch, both endpoint
shapes, and the retention floor. Plus the cron-stats counters in
`tests/cron-api.test.js`.
