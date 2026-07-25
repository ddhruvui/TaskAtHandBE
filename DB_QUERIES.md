# Database Queries Reference

This document contains useful MongoDB queries for the TaskAtHand application.

## Find Documents by Name Pattern

### Query: Find objects containing "Mauli" in the name field

```json
{ "name": { "$regex": "Mauli", "$options": "i" } }
```

**Description:**  
This query searches for all documents where the `name` field contains the text "Mauli" (case-insensitive). The `$regex` operator enables pattern matching, and the `$options: "i"` flag makes the search case-insensitive, so it will match "Mauli", "mauli", "MAULI", etc.

**Use Cases:**

- Finding headers or tasks by partial name match
- Searching for user-created items containing specific keywords
- Filtering collections by name patterns

**Example Usage in MongoDB:**

```javascript
db.Headers.find({ name: { $regex: "Mauli", $options: "i" } });
db.Tasks.find({ name: { $regex: "Mauli", $options: "i" } });
```

> Collection names are capitalized (`Headers`, `Tasks`, `Events`, `Affirmations`, `Calls`, `TaskArchive`, `Insights`) and get a `-Test` suffix when `USE_TEST_DB=true`.

---

## Headers & Tasks Queries

### All headers in display order

```javascript
db.Headers.find().sort({ priority: 1 });
```

### All tasks for one header in display order

```javascript
db.Tasks.find({ headerId: "<header _id as string>" }).sort({ priority: 1 });
```

### All done tasks that the next cron run will delete (date or no ECD)

```javascript
db.Tasks.find({
  done: true,
  $or: [{ "ecd.type": "date" }, { ecd: null }],
});
```

---

## Task Archive Queries

The `TaskArchive` collection (`TaskArchive-Test` when `USE_TEST_DB=true`) is an
append-only event log written by the daily cron and the Task model. Event
types: `habit_result`, `task_result`, `task_completed`, `task_rescheduled`,
`call_result`. All events carry `at` (insertion time); task events also carry
`headerName` (denormalized), while `call_result` events have no header fields.

### Habit results for one task, newest first

```javascript
db.TaskArchive.find({ type: "habit_result", taskName: "Meditate" }).sort({ dueDate: -1 });
```

### Missed habits in the last 28 days

```javascript
db.TaskArchive.find({
  type: "habit_result",
  completed: false,
  at: { $gte: new Date(Date.now() - 28 * 86400000) },
});
```

### Tasks pushed to a later date (procrastination signal)

```javascript
db.TaskArchive.find({ type: "task_rescheduled", pushedLater: true });
```

### Missed call periods per person (call_result, logged at each period boundary)

```javascript
db.TaskArchive.find({ type: "call_result", completed: false }).sort({ dueDate: -1 });
```

### Completed one-time tasks with their planned vs. done dates

```javascript
db.TaskArchive.find(
  { type: "task_completed" },
  { taskName: 1, headerName: 1, plannedFor: 1, doneAt: 1 },
).sort({ at: -1 });
```

---

## Events Queries

The `Events` collection (`Events-Test` when `USE_TEST_DB=true`) stores
reusable task bundles: `{ name, tasks: [string], createdAt, updatedAt }`.
They are templates only — scheduling one adds tasks under a header named
after the event (reused if it exists, created otherwise), so nothing here
references Headers or Tasks.

### All events, alphabetical

```javascript
db.Events.find().sort({ name: 1 });
```

### Events containing a given task

```javascript
db.Events.find({ tasks: { $regex: "onion", $options: "i" } });
```

---

## Affirmations Queries

The `Affirmations` collection (`Affirmations-Test` when `USE_TEST_DB=true`)
stores single short lines the user reads daily:
`{ name, createdAt, updatedAt }`. Completely independent of Headers and
Tasks — nothing here references any other collection.

### All affirmations in display order (order added)

```javascript
db.Affirmations.find().sort({ createdAt: 1 });
```

### Affirmations containing a given word

```javascript
db.Affirmations.find({ name: { $regex: "blessing", $options: "i" } });
```

---

## Calls Queries

The `Calls` collection (`Calls-Test` when `USE_TEST_DB=true`) stores people
the user must call biweekly or monthly:
`{ name, frequency, done, doneAt, createdAt, updatedAt }`. Completely
independent of Headers and Tasks — nothing here references any other
collection. Cron step 8 resets `done` on the 15th (biweekly) and the last
day of the month (all).

### All calls in display order (order added)

```javascript
db.Calls.find().sort({ createdAt: 1 });
```

### Calls still due this period

```javascript
db.Calls.find({ done: false });
```

### Done biweekly calls the next 15th-of-month cron run will reset

```javascript
db.Calls.find({ frequency: "biweekly", done: true });
```

---

## Projects Queries

The `Projects` collection (`Projects-Test` when `USE_TEST_DB=true`) holds
long-term projects with embedded task lists; `todoTaskId` links a dated task
to its todo entry until the cron completes it.

### All projects in display order

```javascript
db.Projects.find().sort({ priority: 1 });
```

### Projects with a task still linked to the todo

```javascript
db.Projects.find({ "tasks.todoTaskId": { $ne: null } });
```

### Project tasks the next cron run will mark done (linked todo task already done)

```javascript
const doneIds = db.Tasks.find(
  { done: true, $or: [{ "ecd.type": "date" }, { ecd: null }] },
  { _id: 1 },
).toArray().map((t) => t._id.toString());
db.Projects.find({ "tasks.todoTaskId": { $in: doneIds } });
```

---

## Insights Queries

The `Insights` collection (`Insights-Test` in test mode) stores the daily AI
reports: `{ generatedAt, periodDays, model, stats, report }`.

### Latest report

```javascript
db.Insights.find().sort({ generatedAt: -1 }).limit(1);
```

### Reports from the last week

```javascript
db.Insights.find({ generatedAt: { $gte: new Date(Date.now() - 7 * 86400000) } });
```

---
