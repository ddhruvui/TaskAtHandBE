# Adding a resource

A worked example: a `Widgets` collection with a name, a `done` flag and
user-controlled ordering. Every step below is what the existing resources
already do — copy the closest one (`Affirmation` for the simplest, `Project`
for an ordered one with a nested list).

## 1. The model

```js
// src/models/Widget.js
const OrderedModel = require("./OrderedModel"); // or BaseModel if it has no ordering

class Widget extends OrderedModel {
  static collectionName = "Widgets"; // the -Test variant is automatic

  static async create(data) {
    return this.insert({
      name: data.name,
      done: false,
      priority: await this.nextPriority(),
      ...this.timestamps(),
    });
  }

  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.done !== undefined) updates.done = data.done;

    const priority = await this.resolvePriorityChange(id, current, data.priority);
    if (priority !== undefined) updates.priority = priority;

    return this.saveUpdates(id, updates, current);
  }
}

module.exports = Widget;
```

`findAll`, `findById` and `delete` (including the gap close) are inherited.

## 2. The controller

```js
// src/controllers/widgetController.js
const Widget = require("../models/Widget");
const { route, requireFound, isPriorityRangeError } = require("../utils/http");
const {
  requiredString,
  optionalString,
  optionalBoolean,
  optionalPriority,
  definedFields,
} = require("../utils/validate");

const getAllWidgets = route(
  { action: "fetching widgets", failure: "Failed to fetch widgets" },
  async (req, res) => {
    res.json(await Widget.findAll());
  },
);

const createWidget = route(
  { action: "creating widget", failure: "Failed to create widget" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Widget name");
    res.status(201).json(await Widget.create({ name }));
  },
);

const updateWidget = route(
  {
    action: "updating widget",
    failure: "Failed to update widget",
    badRequest: [isPriorityRangeError], // the model's range error → 400, not 500
  },
  async (req, res) => {
    const updates = definedFields({
      name: optionalString(req.body.name, "Widget name"),
      done: optionalBoolean(req.body.done, "Widget done"),
      priority: optionalPriority(req.body.priority),
    });

    res.json(requireFound(await Widget.update(req.params.id, updates), "Widget not found"));
  },
);

const deleteWidget = route(
  { action: "deleting widget", failure: "Failed to delete widget" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Widget.delete(id), "Widget not found");
    res.json({ deleted: id });
  },
);

module.exports = { getAllWidgets, createWidget, updateWidget, deleteWidget };
```

Note the create/update asymmetry: `requiredString` on POST, `optionalString`
on PUT.

## 3. The routes

`src/routes/widgetRoutes.js`, mounted in `src/server.js`. **Every route needs
its `@openapi` JSDoc block** and any shared schema goes in
`src/config/swagger.js` — that part is unchanged by the utility layer.

## 4. Test-collection registration

Two files still need the name by hand:

- `tests/setup.js` → add `"Widgets-Test"` to the wipe list
- `scripts/cleartest.js` → add `"Widgets-Test"`

## 5. Tests and docs

Both are mandatory — see the tables in `CLAUDE.md`. At minimum: a
`tests/widgets.test.js` following the existing pattern (`beforeAll(connectDB)` +
a `clearCollection` helper, supertest against the exported app), plus entries in
`TEST_REFERENCE.md`, `README.md`, `API_REFERENCE.md` and
`todo_app_structure.md`.

## If it needs ordering by done state

Do not write `filter(x => !x.done)` and spread. Use
[`orderDoneLast`](Ordering.md):

```js
const { orderDoneLast, matchingFirst } = require("../utils/ordering");

const ordered = orderDoneLast(widgets, matchingFirst((w) => w.date));
```
