# Priority — `src/utils/priority.js`

Priority contiguity is the invariant the whole app leans on:

> Within a **scope**, priorities are exactly `0..n-1` — no holes, no duplicates.

The scope is the whole collection for headers, goals, projects and life events,
and **one header** for tasks. It is expressed as a Mongo filter: `{}` or
`{ headerId }`.

Keeping the invariant true means the same three moves, which five models each
had written out by hand with only the noun in the comment changed.

## The three moves

### Append — `nextPriority(collection, scope?)`

The priority a new document gets: the number of documents already in the scope.

```js
priority: await nextPriority(collection);              // headers, goals, projects, life events
priority: await nextPriority(collection, { headerId, done: false });  // a new task, above the done block
```

### Move — `movePriority(collection, { id, from, to, scope?, stamp? })`

Range-checks the target, slides the documents in between out of the way, and
returns the priority to store on the document itself.

```js
updates.priority = await movePriority(collection, {
  id, from: current.priority, to: data.priority, scope, stamp: true,
});
```

Out of range throws `Priority must be between 0 and n-1`. That wording is part
of the API contract — the controllers match on it (see
[Validation and HTTP](Validation-and-HTTP.md)) to answer 400 instead of 500.

`shiftForMove` is the same slide **without** the range check, for targets the
server computed itself rather than took from a client — marking a task done
sends it to the end of its header, un-doing it brings it back to just above the
first done task, and neither number needs validating.

### Close a gap — `closeGap(collection, priority, { scope?, stamp? })`

Everything below a removed document moves up one.

### Also: `openSlot(collection, filter, { stamp? })`

Push a selected block down one to make room mid-list. `Task.create` uses it to
open the seam between the undone and done halves.

## `scope` and `stamp`

**`scope`** is what makes the same helpers work for a whole collection and for
one header's tasks. It is merged into the update filter, so a task move can
never touch another header.

**`stamp`** writes `updatedAt` onto the neighbours a shift moves. Tasks do
(`stamp: true`); headers, goals, projects and life events deliberately do not.
Priority is system-managed for those, and stamping it would make "recently
edited" mean "something else moved". This asymmetry existed before the
refactor — the flag is how it is preserved.

## Full API

| Function | Returns |
| --- | --- |
| `nextPriority(collection, scope?)` | the append position |
| `scopeSize(collection, scope?)` | how many documents the scope holds |
| `shiftForMove(collection, { id, from, to, scope?, stamp? })` | neighbours shifted (0 for a no-op move) |
| `movePriority(collection, { id, from, to, scope?, stamp? })` | the new priority |
| `closeGap(collection, priority, { scope?, stamp? })` | documents shifted |
| `openSlot(collection, filter, { stamp? })` | documents shifted |

The range check (`assertPriorityInRange`) and the raw `shiftBy` primitive stay
internal — `movePriority`, `closeGap` and `openSlot` are the whole public
surface, and every caller goes through one of them.

Models that order a whole collection do not call these directly — they get them
through [`OrderedModel`](Model-Base-Classes.md). Tasks call them directly,
because their scope depends on the document being moved.

## Tests

`tests/utils.test.js`, `describe("utils/priority")` — real collection, four
seeded rows in two headers: moves up and down, the no-op move, scope isolation,
both ends of the valid range, the range check firing *before* anything is
written, and `stamp` on and off.
