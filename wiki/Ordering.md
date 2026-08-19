# Ordering — `src/utils/ordering.js`

The app has one ordering rule and it used to exist in three places.

> **Undone first, done last.** Inside the undone half, sort by whatever
> "soonest" means for that list. Never re-sort the done half — its order is the
> order things were finished in.

## The three call sites it replaced

| Where | "Soonest" means | Was |
| --- | --- | --- |
| Cron step 7, `src/cron/cronJob.js` | the next upcoming ECD | two `filter` passes, a hand-written comparator, a hand-written renumbering loop |
| `Project.sortProjectTasks`, `src/models/Project.js` | a task with a date outranks one without | three `filter` passes spread into one array |
| `Task.create` / `Task.update`, `src/models/Task.js` | — (the insertion point *is* the barrier) | `countDocuments({ done: false })` arithmetic |

The third one is the same rule expressed as an index rather than a sort: a new
task lands at `priority = undoneCount`, which is exactly the seam between the
two halves.

## API

### `orderDoneLast(items, compare?)`

Returns a **new** array — the input is not mutated. `compare` is applied to the
undone half only. "Done" is `item.done === true`; both collections that use
this store the flag under that name.

```js
const { orderDoneLast, ascendingBy } = require("../utils/ordering");

// cron step 7 — undone by soonest ECD, then done
const ordered = orderDoneLast(
  headerTasks,
  ascendingBy((task) => nextEcdTimestamp(task.ecd, today)),
);
```

```js
// project steps — dated undone above undated undone, then done
const ordered = orderDoneLast(tasks, matchingFirst((task) => task.date));
```

### `ascendingBy(key)`

A comparator sorting ascending by a numeric key.

`Infinity` is a legal key and sorts last — that is how a task with no ECD ends
up below every scheduled one. Two `Infinity` keys subtract to `NaN`, which
`sort` treats as "leave these two alone", so same-day ties keep the order the
user arranged them in. This is deliberate and matches the behaviour of the
hand-written comparator it replaced.

### `matchingFirst(predicate)`

A comparator putting the items a predicate accepts in front, with both groups
keeping their relative order.

### `groupBy(items, key)`

A `Map` of key → items, input order preserved inside each group. Cron step 7
uses it to bucket every task by header in one pass instead of querying per
header.

### `priorityBulkOps(ordered)`

Given documents *in their desired order*, returns ready-to-send `bulkWrite`
operations for only the ones not already sitting on their index.

Writing only the movers is what keeps an idempotent re-run (the nightly cron,
`applyProjectHeaderOrder`) from touching the database at all when nothing
changed.

```js
const ops = priorityBulkOps(orderDoneLast(headerTasks, bySoonestEcd));
if (ops.length > 0) await tasksCol.bulkWrite(ops);
```

## Stability is a requirement, not a detail

`Array.prototype.sort` is required to be stable, and this module leans on that
everywhere. A comparator here must return `0` for "equal" — never a tiebreak
that varies — because a user's manual arrangement inside a tie has to survive
the nightly re-sort.

## Tests

`tests/utils.test.js`, `describe("utils/ordering")` — including the
does-not-mutate guarantee, the `Infinity` tie behaviour, the stability of
`matchingFirst`, and that an already contiguous list produces no writes.
