# Model base classes

Two classes under `src/models/`. They are plumbing only — every domain rule
(priority scoping for tasks, archive logging, the project↔header link, ECD
validation, the goal priority backfill) stays in the model that owns it.

## `BaseModel`

What every model was writing for itself: resolve its collection with the
`-Test` switch, read a row by id, list the collection in its natural order,
apply a `$set`, delete a row, stamp `updatedAt`.

A model supplies two things and inherits the rest:

```js
class Affirmation extends BaseModel {
  static collectionName = "Affirmations";
  static sortBy = { createdAt: 1 };
}
```

| Member | Purpose |
| --- | --- |
| `static collectionName` | logical name; the `-Test` variant is automatic |
| `static sortBy` | the sort `findAll()` applies (default `{ _id: 1 }`) |
| `getCollection()` | |
| `findAll()` | |
| `findById(id)` | `null` for a miss |
| `insert(doc)` | returns the document with the id Mongo assigned |
| `applyUpdate(id, updates)` | `$set`, returning the document after the write |
| `removeById(id)` | |
| `delete(id)` | delete **and return** the removed document, or `null` |
| `stamp()` | the value written to `createdAt`/`updatedAt` |
| `timestamps()` | `{ createdAt, updatedAt }` for a new document |
| `saveUpdates(id, updates, current, { stamp? })` | finish an `update()` |

### `saveUpdates` and the empty-update rule

```js
static async update(id, data) {
  const current = await this.findById(id);
  if (!current) return null;

  const updates = {};
  if (data.name !== undefined) updates.name = data.name;

  return this.saveUpdates(id, updates, current);
}
```

A request that changed nothing returns the document untouched and does **not**
bump `updatedAt`. That was already true everywhere; it is now enforced in one
place.

### Timestamps are not uniform, on purpose

- Most collections store `createdAt`/`updatedAt` as **ISO strings** — the
  default `stamp()`.
- **Tasks** store real `Date` objects — `Task` overrides `stamp()`.
- **Headers** have no timestamps at all — `Header.update` passes
  `{ stamp: false }`.

This is a difference in the *stored data*, not a preference. Do not "tidy" it
without a migration.

## `OrderedModel extends BaseModel`

For a collection the user can reorder as a whole: **headers, goals, projects,
life events**. It sets `sortBy = { priority: 1 }` and adds three things.

| Member | Purpose |
| --- | --- |
| `nextPriority()` | the append position |
| `resolvePriorityChange(id, current, requested)` | the new priority, neighbours already slid out of the way; `undefined` when nothing moved |
| `delete(id)` | deletes **and closes the gap** |

The thirty lines of shift arithmetic each of the four models used to carry
become two:

```js
const priority = await this.resolvePriorityChange(id, current, data.priority);
if (priority !== undefined) updates.priority = priority;
```

A document with no numeric priority (a legacy goal saved before the field
existed) is deleted without shifting anything.

### Why `Task` does not extend it

Task priorities are contiguous **per header**, not collection-wide, so the
scope depends on the document being moved. `Task` extends `BaseModel` and calls
[`utils/priority`](Priority.md) directly with a `{ headerId }` scope. It is also
the only model that stamps `updatedAt` on the neighbours a move shifts.

## Static inheritance, briefly

These are static members, so `this` inside them is the subclass the call was
made on: `Affirmation.findAll()` reads `Affirmation.collectionName`. Overriding
is ordinary — `Goal.findAll()` backfills priorities and then calls
`super.findAll()`.
