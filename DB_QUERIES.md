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
db.headers.find({ name: { $regex: "Mauli", $options: "i" } });
db.tasks.find({ name: { $regex: "Mauli", $options: "i" } });
```

---

## Task Archive Queries

The `TaskArchive` collection (`TaskArchive-Test` when `USE_TEST_DB=true`) is an
append-only event log written by the daily cron and the Task model. Event
types: `habit_result`, `task_result`, `task_completed`, `task_rescheduled`.
All events carry `at` (insertion time) and `headerName` (denormalized).

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

### Completed one-time tasks with their planned vs. done dates

```javascript
db.TaskArchive.find(
  { type: "task_completed" },
  { taskName: 1, headerName: 1, plannedFor: 1, doneAt: 1 },
).sort({ at: -1 });
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
