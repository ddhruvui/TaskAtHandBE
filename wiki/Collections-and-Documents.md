# Collections and documents

Two small modules that between them removed twelve copies of the same five
lines.

## `src/utils/collections.js`

Every collection in this app has a `-Test` twin that `USE_TEST_DB=true`
switches the whole process onto. That switch used to be pasted into all eleven
models and the cron:

```js
const db = await getDatabase();
const useTestDB = process.env.USE_TEST_DB === "true";
const collectionName = useTestDB ? "Tasks-Test" : "Tasks";
return db.collection(collectionName);
```

Now:

```js
const { getCollection } = require("../utils/collections");
const collection = await getCollection("Tasks");
```

| Function | Purpose |
| --- | --- |
| `collectionName(name)` | `"Tasks"` → `"Tasks"` or `"Tasks-Test"` |
| `getCollection(name)` | the live handle |
| `getCollections(...names)` | several handles, one database round trip (the cron needs three per run) |

**The env var is read on every call, never cached at require time** — the test
setup sets `USE_TEST_DB` after the models are already loaded, so a cached value
would send every test at the real collections.

## `src/utils/documents.js`

The one-line reads and writes every model repeated verbatim.

| Function | Notes |
| --- | --- |
| `toObjectId(id)` | throws on a malformed id — the pre-existing contract turns that into a 500 |
| `findById(collection, id)` | `null` for a miss; models never throw for one |
| `findAllSorted(collection, sort)` | |
| `updateById(collection, id, updates)` | `$set`, returning the document **after** the write |
| `deleteById(collection, id)` | |

They take the collection as their first argument rather than living on a base
class, so the cron and the services — which work with raw collection handles,
not models — use exactly the same primitives.

## Adding a collection

`CLAUDE.md` lists three edits. The first one is now a single line:

1. `static collectionName = "Widgets"` on the model (the `-Test` variant is
   automatic)
2. add `"Widgets-Test"` to `tests/setup.js`
3. add `"Widgets-Test"` to `scripts/cleartest.js`

## Tests

`tests/utils.test.js`, `describe("utils/collections")` and
`describe("utils/documents")` — including that the env var is re-read per call.
