# TaskAtHandBE Wiki — the shared utility layer

This wiki documents `src/utils/` and the two model base classes, the layer that
holds the rules the backend used to repeat in every file.

It exists because the same handful of ideas — *undone first then done*,
*priorities are contiguous*, *a PUT only touches the fields it mentions*, *a
failure is logged then answered as 500* — were each written out five to thirty
times, once per resource. Every copy was a place the rule could quietly drift.

## What changed

| | Before | After |
| --- | --- | --- |
| Source lines (excluding comments and blanks) | 3,776 | 3,383 |
| …in the files that already existed | 3,776 | 2,920 (−856, −23%) |
| …in the new shared modules | — | 463 |
| Tests | 398 | 466 |

Behaviour is unchanged. Every endpoint returns the same status codes, the same
error strings and the same document shapes as before; the 398 pre-existing
tests pass untouched, and 68 new ones were added on top.

Each module exports only what another module actually calls — helpers used
solely by their own siblings (`shiftBy`, `assertPriorityInRange`,
`partitionByDone`, `priorityChanges`, `MS_PER_DAY`, `NotFoundError`) stay
internal, and are covered through the public function that wraps them.

## The modules

| Module | Holds | Page |
| --- | --- | --- |
| `utils/ordering.js` | *undone first, done last*, comparators, priority renumbering | [Ordering](Ordering.md) |
| `utils/priority.js` | the contiguous `0..n-1` invariant: append, move, close a gap | [Priority](Priority.md) |
| `utils/collections.js` | the `-Test` collection switch | [Collections and Documents](Collections-and-Documents.md) |
| `utils/documents.js` | read/update/delete a document by its string `_id` | [Collections and Documents](Collections-and-Documents.md) |
| `utils/validate.js` | field validation and the partial-update payload | [Validation and HTTP](Validation-and-HTTP.md) |
| `utils/http.js` | the route wrapper: 400 / 404 / 500 and what gets logged | [Validation and HTTP](Validation-and-HTTP.md) |
| `utils/dates.js` | UTC calendar arithmetic | [Dates and Stats](Dates-and-Stats.md) |
| `utils/stats.js` | the arithmetic behind the insights numbers | [Dates and Stats](Dates-and-Stats.md) |
| `models/BaseModel.js` | collection plumbing every model shares | [Model base classes](Model-Base-Classes.md) |
| `models/OrderedModel.js` | `BaseModel` plus collection-wide priority ordering | [Model base classes](Model-Base-Classes.md) |

Beyond the utility layer, one behaviour has its own page:

| Topic | Page |
| --- | --- |
| Bounding `TaskArchive` — cron step 10, monthly roll-ups, the retention floor | [Archive retention](Archive-Retention.md) |

## Where to start

- Adding a new resource end to end → [Adding a resource](Adding-a-Resource.md)
- Reviewing the refactor, or hunting for a call site → [Refactor map](Refactor-Map.md)

## The one rule the whole layer serves

Everything the user sees ordered — a header's tasks, a project's steps — obeys
the same sentence:

> **Undone items come first, sorted by whatever "soonest" means for that list;
> done items sit at the bottom in the order they were finished.**

Three separate implementations of that sentence are now one function,
`orderDoneLast`. If you are about to write `filter(t => !t.done)` followed by a
spread, you want that function instead.
