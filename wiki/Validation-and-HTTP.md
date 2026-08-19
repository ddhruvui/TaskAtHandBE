# Validation and HTTP

Two modules that between them took roughly 500 lines out of the controllers
without changing a single response.

## `src/utils/http.js` — the route wrapper

Thirty-odd handlers had the same shape:

```js
const createThing = async (req, res) => {
  try {
    /* ...the actual work... */
  } catch (error) {
    console.error("Error creating thing:", error);
    res.status(500).json({ error: "Failed to create thing", message: error.message });
  }
};
```

`route()` is that wrapper, so a handler is left with only its own work:

```js
const createAffirmation = route(
  { action: "creating affirmation", failure: "Failed to create affirmation" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Affirmation name");
    res.status(201).json(await Affirmation.create({ name }));
  },
);
```

### What it answers, and what it logs

| Thrown | Status | Body | Logged? |
| --- | --- | --- | --- |
| `ValidationError` | 400 | `{ error: message }` | **no** |
| `NotFoundError` (thrown by `requireFound`) | 404 | `{ error: message }` | **no** |
| an error matching a `badRequest` predicate | 400 | `{ error: message }` | **yes**, first |
| anything else | 500 | `{ error: failure, message }` | **yes** |

The logging column is not incidental. A rejected field is not a server error
and never was logged; a business rule the *model* threw always was. The wrapper
preserves both, which is why the `ValidationError` and `NotFoundError` branches
sit above the `console.error` and the `badRequest` branch sits below it.

### `requireFound(value, message)`

Models return `null` for a miss and never throw. This is where a miss becomes a
response. `NotFoundError` itself is internal — `requireFound` is the only way to
raise one:

```js
const updated = await Call.update(req.params.id, updates);
res.json(requireFound(updated, "Call not found"));
```

### `badRequest` predicates

The models throw plain `Error`s — they are also called by the cron, which has
no HTTP layer to translate for — so their rules are matched on the message:

| Predicate | Matches | Used by |
| --- | --- | --- |
| `isPriorityRangeError` | `Priority must be between 0 and n` | header, goal, project, life event, task updates |
| `isEcdError` | anything from `Task.validateEcd` | task create and update |

```js
const updateTask = route(
  {
    action: "updating task",
    failure: "Failed to update task",
    badRequest: [isPriorityRangeError, isEcdError],
  },
  async (req, res) => { /* ... */ },
);
```

## `src/utils/validate.js` — field rules

Validation still lives in the controllers (see `CLAUDE.md`); it is just no
longer written out by hand. Every validator throws `ValidationError`, which the
wrapper turns into a 400 with that exact message.

`label` is the field's name **exactly as it already appears in the response**
("Goal name", "Call done", "todoTaskId") — those strings are contract.

| Function | Rule |
| --- | --- |
| `requiredString(value, label)` | non-empty after trimming; absent/null/`""` all rejected. Returns the trimmed value |
| `optionalString(value, label)` | the same rule, but `undefined` passes through |
| `optionalText(value, label)` | a string that may be empty (notes, reasons) |
| `optionalBoolean(value, label)` | |
| `optionalPriority(value, label?)` | a non-negative integer; the upper bound is the model's business |
| `optionalStringOrNull(value, label)` | `null` is a real value here — it unlinks |
| `dateStringOrNull(value, label)` | `"YYYY-MM-DD"`; absent and `null` both become `null` |
| `oneOf(value, allowed, message)` | the message is passed in whole — the existing wordings differ too much to generate |
| `requireObject(value, message)` | not null, not an array |
| `requireArray(value, message, { nonEmpty? })` | |
| `isDateString(value)` | the boolean form, used by `Task.validateEcd` |

### The create/update asymmetry

This is the one thing to get right when adding a field:

- **On create** a name is *required* — `requiredString`.
- **On update** every field is *optional* — `optionalString` and friends. A PUT
  that omits a field must leave it alone; a field that *is* present must still
  be valid.

### `definedFields(fields)`

Builds the `$set` payload: validated fields that were actually sent, with
absent ones dropped.

```js
const updates = definedFields({
  name: optionalString(req.body.name, "Call name"),
  frequency: optionalFrequency(req.body.frequency),
  done: optionalBoolean(req.body.done, "Call done"),
});
```

The object literal's **source order is the validation order**, so the first bad
field is reported first — exactly as the sequential `if` blocks did. Keep the
order you would have written the `if`s in.

Falsy values survive: `0`, `false`, `null` and `""` are all real values. Only
`undefined` is dropped.

## Tests

`tests/utils.test.js`, `describe("utils/validate")` and `describe("utils/http")`
— every validator's accept and reject sets, the source-order guarantee, and all
four `route()` outcomes including which of them log.
