# TaskAtHand API Reference

**Base URL:** `http://localhost:3002`

This document provides a complete reference for all API endpoints. Each collection (Office, Todos, Habits, Dreams, WorkOnDreams, Events) follows the same pattern.

---

## Common Data Model

Office, Todos, Dreams, and WorkOnDreams share this structure:

```typescript
interface Item {
  _id: string; // MongoDB ObjectId
  name: string; // Item name/title (required)
  notes: string; // Additional notes (optional, default: "")
  priority: number; // 0-based priority (0 = highest priority)
  done: boolean; // Completion status (default: false)
  ecd: string | null; // Expected Completion Date (ISO 8601 format)
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

**Habits use a different ECD structure** — see [Habits API](#habits-api) below.

## Standard Response Format

### Success Response

```json
{
  "success": true,
  "count": 5, // For list endpoints
  "data": {}, // Single item or array of items
  "message": "..." // For create/update/delete operations
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error (development only)"
}
```

---

## Work On Dreams API

Base path: `/api/workondreams`

Follows the same pattern as Office Tasks. Differences from Office are noted below.

### Endpoints:

- `GET /api/workondreams` - Get all work on dreams
- `GET /api/workondreams/:id` - Get work on dream by ID
- `POST /api/workondreams` - Create work on dream
- `PUT /api/workondreams/:id` - Update work on dream
- `DELETE /api/workondreams/:id` - Delete work on dream
- `GET /api/workondreams/count` - Get work on dream count
- `DELETE /api/workondreams/chron` - Delete all done work on dreams

### Create Work On Dream

**Endpoint:** `POST /api/workondreams`

**Request Body:**

```json
{
  "name": "Research market opportunities", // Required
  "notes": "Analyze competitor landscape", // Optional
  "done": false, // Optional
  "ecd": "2026-04-15T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created` — same structure as Office (with `message: "Work on dream created successfully"`).

**Validation error (400):**

```json
{ "success": false, "error": "Work on dream name must be a non-empty string" }
```

### Update Work On Dream

**Endpoint:** `PUT /api/workondreams/:id`

Accepts: `name`, `notes`, `priority`, `done`. `ecd` is **not updatable** (set at creation only, unlike Events).

**Validation error (400):**

```json
{ "success": false, "error": "No valid fields to update" }
```

### Chron Endpoint

**Endpoint:** `DELETE /api/workondreams/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "deletedCount": 2,
  "movedCount": 1,
  "message": "Successfully deleted 2 done work on dream(s) and moved 1 overdue work on dream(s) to lowest priority"
}
```

**Note:** Deletes all done work on dreams. Any remaining undone item whose `ecd` matches today's date is moved to the lowest priority (`movedCount`).

---

## Events API

Base path: `/api/events`

**Note:** Events have two special behaviours:

1. When an event is marked as **done**, **1 year is automatically added** to its `ecd` date.
2. The chron endpoint **does not delete** events — it unmarks done events whose `ecd` falls within the current week and moves them to the lowest priority.

### Event Data Model

```typescript
interface Event {
  _id: string; // MongoDB ObjectId
  name: string; // Event name/title (required)
  notes: string; // Additional notes (optional, default: "")
  priority: number; // 0-based priority (0 = highest priority)
  done: boolean; // Completion status (default: false)
  ecd: string | null; // Expected Completion Date (ISO 8601 format)
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

### Endpoints:

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `GET /api/events/count` - Get event count
- `DELETE /api/events/chron` - Uncheck events due this week (does NOT delete)

### 1. Get All Events

**Endpoint:** `GET /api/events`

**Response:** `200 OK`

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Annual review",
      "notes": "Performance review with manager",
      "priority": 0,
      "done": false,
      "ecd": "2026-06-15T00:00:00.000Z",
      "createdAt": "2026-03-18T10:00:00.000Z",
      "updatedAt": "2026-03-18T10:00:00.000Z"
    }
  ]
}
```

### 2. Get Event by ID

**Endpoint:** `GET /api/events/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Annual review",
    "notes": "Performance review with manager",
    "priority": 0,
    "done": false,
    "ecd": "2026-06-15T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T10:00:00.000Z"
  }
}
```

**Error:** `404 Not Found`

```json
{
  "success": false,
  "error": "Event not found"
}
```

### 3. Create Event

**Endpoint:** `POST /api/events`

**Request Body:**

```json
{
  "name": "Team offsite", // Required
  "notes": "Book venue", // Optional
  "done": false, // Optional
  "ecd": "2026-06-15T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Team offsite",
    "notes": "Book venue",
    "priority": 0,
    "done": false,
    "ecd": "2026-06-15T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T10:00:00.000Z"
  },
  "message": "Event created successfully"
}
```

**Error:** `400 Bad Request`

```json
{
  "success": false,
  "error": "Event name must be a non-empty string"
}
```

### 4. Update Event

**Endpoint:** `PUT /api/events/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Request Body:** (all fields optional)

```json
{
  "name": "Updated event name",
  "notes": "Updated notes",
  "priority": 2,
  "done": true,
  "ecd": "2026-12-01T00:00:00.000Z"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Updated event name",
    "notes": "Updated notes",
    "priority": 2,
    "done": true,
    "ecd": "2027-12-01T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T11:30:00.000Z"
  },
  "message": "Event updated successfully"
}
```

**Notes:**

- When `done` is set to `true`, the item moves to the end of the list and **1 year is added to the `ecd` date**
- When `done` is set to `false`, the item moves to the top of the list (priority 0)
- When `priority` is changed, other items are reordered automatically

### 5. Delete Event

**Endpoint:** `DELETE /api/events/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Event deleted successfully and priorities reordered"
}
```

**Error:** `404 Not Found`

```json
{
  "success": false,
  "error": "Event not found"
}
```

### 6. Get Event Count

**Endpoint:** `GET /api/events/count`

**Response:** `200 OK`

```json
{
  "success": true,
  "count": 5
}
```

### 7. Chron Endpoint (Special Behavior)

**Endpoint:** `DELETE /api/events/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "markedUndoneCount": 2,
  "movedCount": 2,
  "message": "Successfully unchecked 2 event(s) due this week and moved 2 event(s) to lowest priority"
}
```

**Note:** Unlike Office/Todos/Dreams/WorkOnDreams, events are **never deleted** by the chron endpoint. Instead, any done event whose `ecd` falls within the current week (Monday–Sunday UTC) is marked as undone and moved to the lowest priority. This is because when an event was previously marked done, 1 year was already added to its `ecd`, so the event automatically resurfaces in the same week of the following year.

---

## Habits API

Base path: `/api/habbits`

**Note:** Habits differ from other collections in three ways:

1. The chron endpoint marks habits as **undone** instead of deleting them.
2. ECD is expressed as **two separate fields** instead of a single `ecd` date.
3. **Must use `allowRecurring=true`** when creating or updating habits to enable recurring scheduling.

### Habit Data Model

```typescript
interface Habit {
  _id: string; // MongoDB ObjectId
  name: string; // Habit name (required)
  notes: string; // Additional notes (optional, default: "")
  priority: number; // 0-based priority (0 = highest)
  done: boolean; // Completion status (default: false)
  ecdDayOfWeek: number[] | null; // Day(s) of week: 1 (Mon) – 7 (Sun). Null if using ecdDayOfMonth.
  ecdDayOfMonth: number[] | null; // Day(s) of month: 1 – 31. Null if using ecdDayOfWeek.
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

> **Exactly one** of `ecdDayOfWeek` or `ecdDayOfMonth` must be supplied on create — not both. Each field accepts a **single integer or an array of integers**. Setting one on update automatically clears the other.

### ECD Field Rules

| Field           | Values          | Meaning                                                      |
| --------------- | --------------- | ------------------------------------------------------------ |
| `ecdDayOfWeek`  | array of 1 – 7  | 1 = Monday, 7 = Sunday (e.g. `[1, 3, 5]` = Mon, Wed, Fri)    |
| `ecdDayOfMonth` | array of 1 – 31 | Day(s) of the calendar month (e.g. `[5, 20]` = 5th and 20th) |

### Endpoints:

- `GET /api/habbits` - Get all habits
- `GET /api/habbits/:id` - Get habit by ID
- `POST /api/habbits` - Create habit
- `PUT /api/habbits/:id` - Update habit
- `DELETE /api/habbits/:id` - Delete habit
- `GET /api/habbits/count` - Get habit count
- `DELETE /api/habbits/chron` - Mark all done habits as undone (different from other collections!)

### Chron Endpoint (Special Behavior)

**Endpoint:** `DELETE /api/habbits/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "markedUndoneCount": 5,
  "movedCount": 2,
  "message": "Successfully marked 5 done habbit(s) as undone and moved 2 overdue habbit(s) to lowest priority"
}
```

**Note:** Unlike Office/Todos/Dreams/WorkOnDreams, habits are **never deleted** by the chron endpoint. All done habits are marked as undone unconditionally (regardless of their ECD). Additionally, any habit whose `ecdDayOfWeek` array includes today's day of week, or whose `ecdDayOfMonth` array includes today's date, is moved to the lowest priority.

### Create Habit

**Endpoint:** `POST /api/habbits`

> ⚠️ **`allowRecurring: true` is required** on all habit create/update requests to enable recurring scheduling.

**Repeats every Friday (single day, scalar accepted):**

```json
{
  "name": "Morning exercise",
  "notes": "30 minutes cardio",
  "ecdDayOfWeek": 5,
  "allowRecurring": true
}
```

**Repeats on Mon, Wed, Fri (multiple days, array):**

```json
{
  "name": "Morning exercise",
  "notes": "30 minutes cardio",
  "ecdDayOfWeek": [1, 3, 5],
  "allowRecurring": true
}
```

**Repeats on the 5th of every month (day of month):**

```json
{
  "name": "Pay bills",
  "ecdDayOfMonth": 5,
  "allowRecurring": true
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Pay bills",
    "notes": "",
    "priority": 0,
    "done": false,
    "ecdDayOfWeek": null,
    "ecdDayOfMonth": [5],
    "createdAt": "2026-03-21T10:00:00.000Z",
    "updatedAt": "2026-03-21T10:00:00.000Z"
  },
  "message": "Habbit created successfully"
}
```

**Validation errors (400):**

- Name missing or blank → `"Habbit name must be a non-empty string"`

- Neither field provided → `"ECD is required. Provide either ecdDayOfWeek (1-7) or ecdDayOfMonth (1-31)"`
- Both fields provided → `"Provide only one of ecdDayOfWeek or ecdDayOfMonth, not both"`
- `ecdDayOfWeek` outside 1–7 → `"ECD must be a valid ecdDayOfWeek (1-7, where 1=Monday and 7=Sunday)"`
- `ecdDayOfMonth` outside 1–31 → `"ECD must be a valid ecdDayOfMonth (1-31)"`

### Update Habit

**Endpoint:** `PUT /api/habbits/:id`

Send only the fields you want to change. Providing `ecdDayOfWeek` clears `ecdDayOfMonth` (and vice versa).

**Switch from day-of-week to day-of-month (scalar or array accepted):**

```json
{
  "ecdDayOfMonth": 5,
  "allowRecurring": true
}
```

**Response includes both fields (one will be `null`). ECD fields are always returned as arrays:**

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Pay bills",
    "notes": "",
    "priority": 0,
    "done": false,
    "ecdDayOfWeek": null,
    "ecdDayOfMonth": [5],
    "createdAt": "2026-03-21T10:00:00.000Z",
    "updatedAt": "2026-03-21T10:05:00.000Z"
  },
  "message": "Habbit updated successfully"
}
```

---

## Office Tasks API

Base path: `/api/office`

### 1. Get All Office Tasks

**Endpoint:** `GET /api/office`

**Response:** `200 OK`

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Prepare quarterly report",
      "notes": "Include sales data",
      "priority": 0,
      "done": false,
      "ecd": "2026-03-25T00:00:00.000Z",
      "createdAt": "2026-03-18T10:00:00.000Z",
      "updatedAt": "2026-03-18T10:00:00.000Z"
    }
  ]
}
```

### 2. Get Office Task by ID

**Endpoint:** `GET /api/office/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Prepare quarterly report",
    "notes": "Include sales data",
    "priority": 0,
    "done": false,
    "ecd": "2026-03-25T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T10:00:00.000Z"
  }
}
```

**Error:** `400 Bad Request` (invalid ID format)

```json
{
  "success": false,
  "error": "Invalid task ID format"
}
```

**Error:** `404 Not Found`

```json
{
  "success": false,
  "error": "Task not found"
}
```

### 3. Create Office Task

**Endpoint:** `POST /api/office`

**Request Body:**

```json
{
  "name": "Prepare quarterly report", // Required
  "notes": "Include sales data", // Optional
  "done": false, // Optional
  "ecd": "2026-03-25T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Prepare quarterly report",
    "notes": "Include sales data",
    "priority": 0,
    "done": false,
    "ecd": "2026-03-25T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T10:00:00.000Z"
  },
  "message": "Task created successfully"
}
```

**Error:** `400 Bad Request`

```json
{
  "success": false,
  "error": "Task name must be a non-empty string"
}
```

### 4. Update Office Task

**Endpoint:** `PUT /api/office/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Request Body:** (all fields optional)

```json
{
  "name": "Updated task name",
  "notes": "Updated notes",
  "priority": 2,
  "done": true
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Updated task name",
    "notes": "Updated notes",
    "priority": 2,
    "done": true,
    "ecd": "2026-03-25T00:00:00.000Z",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T11:30:00.000Z"
  },
  "message": "Task updated successfully"
}
```

**Error:** `400 Bad Request` (invalid ID format)

```json
{
  "success": false,
  "error": "Invalid task ID format"
}
```

**Notes:**

- When `done` is set to `true`, the item moves to the end of the list (highest priority number)
- When `done` is set to `false`, the item moves to the top of the list (priority 0)
- When `priority` is changed, other items are reordered automatically
- `ecd` is set at creation only and **cannot be updated** via PUT (unlike Events)

### 5. Delete Office Task

**Endpoint:** `DELETE /api/office/:id`

**Parameters:**

- `id` (path) - MongoDB ObjectId

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Task deleted successfully and priorities reordered"
}
```

**Error:** `400 Bad Request` (invalid ID format)

```json
{
  "success": false,
  "error": "Invalid task ID format"
}
```

**Error:** `404 Not Found`

```json
{
  "success": false,
  "error": "Task not found"
}
```

### 6. Get Office Task Count

**Endpoint:** `GET /api/office/count`

**Response:** `200 OK`

```json
{
  "success": true,
  "count": 5
}
```

### 7. Delete All Done Office Tasks (Cron Job)

**Endpoint:** `DELETE /api/office/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "deletedCount": 3,
  "movedCount": 2,
  "message": "Successfully deleted 3 done task(s) and moved 2 overdue task(s) to lowest priority"
}
```

**Note:** After deleting done tasks, any remaining undone task whose `ecd` matches **today's date** is moved to the lowest priority (`movedCount`).

---

## Todos API

Base path: `/api/todos`

Follows the same pattern as Office Tasks. Differences from Office are noted below.

### Endpoints:

- `GET /api/todos` - Get all todos
- `GET /api/todos/:id` - Get todo by ID
- `POST /api/todos` - Create todo
- `PUT /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Delete todo
- `GET /api/todos/count` - Get todo count
- `DELETE /api/todos/chron` - Delete all done todos

### Create Todo

**Endpoint:** `POST /api/todos`

**Request Body:**

```json
{
  "name": "Buy groceries", // Required
  "notes": "Milk, eggs, bread", // Optional
  "done": false, // Optional
  "ecd": "2026-03-20T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created` — same structure as Office (with `message: "Todo created successfully"`).

**Validation error (400):**

```json
{ "success": false, "error": "Todo name must be a non-empty string" }
```

### Update Todo

**Endpoint:** `PUT /api/todos/:id`

Accepts: `name`, `notes`, `priority`, `done`. `ecd` is **not updatable** (set at creation only, unlike Events).

**Validation error (400):**

```json
{ "success": false, "error": "No valid fields to update" }
```

### Chron Endpoint

**Endpoint:** `DELETE /api/todos/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "deletedCount": 3,
  "movedCount": 1,
  "message": "Successfully deleted 3 done todo(s) and moved 1 overdue todo(s) to lowest priority"
}
```

**Note:** Deletes all done todos. Any remaining undone todo whose `ecd` matches today's date is moved to the lowest priority (`movedCount`).

---

## Dreams API

Base path: `/api/dreams`

Follows the same pattern as Office Tasks. Differences from Office are noted below.

### Endpoints:

- `GET /api/dreams` - Get all dreams
- `GET /api/dreams/:id` - Get dream by ID
- `POST /api/dreams` - Create dream
- `PUT /api/dreams/:id` - Update dream
- `DELETE /api/dreams/:id` - Delete dream
- `GET /api/dreams/count` - Get dream count
- `DELETE /api/dreams/chron` - Delete all done dreams

### Create Dream

**Endpoint:** `POST /api/dreams`

**Request Body:**

```json
{
  "name": "Build a startup", // Required
  "notes": "Focus on AI-powered productivity tools", // Optional
  "done": false, // Optional
  "ecd": "2027-12-31T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created` — same structure as Office (with `message: "Dream created successfully"`).

**Validation error (400):**

```json
{ "success": false, "error": "Dream name must be a non-empty string" }
```

### Update Dream

**Endpoint:** `PUT /api/dreams/:id`

Accepts: `name`, `notes`, `priority`, `done`. `ecd` is **not updatable** (set at creation only, unlike Events).

**Validation error (400):**

```json
{ "success": false, "error": "No valid fields to update" }
```

### Chron Endpoint

**Endpoint:** `DELETE /api/dreams/chron`

**Response:** `200 OK`

```json
{
  "success": true,
  "deletedCount": 2,
  "movedCount": 1,
  "message": "Successfully deleted 2 done dream(s) and moved 1 overdue dream(s) to lowest priority"
}
```

**Note:** Deletes all done dreams. Any remaining undone dream whose `ecd` matches today's date is moved to the lowest priority (`movedCount`).

---

## System Endpoints

### Health Check

**Endpoint:** `GET /health`

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-03-18T10:00:00.000Z"
}
```

### Root Endpoint

**Endpoint:** `GET /`

**Response:** `200 OK`

```json
{
  "message": "TaskAtHand API is running",
  "environment": "development",
  "docs": "/api-docs"
}
```

---

## Common Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "Validation error message"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Server error message",
  "message": "Detailed error (development only)"
}
```

---

## Important Notes for Frontend Development

### 1. Priority Management

- Priority is 0-based (0 = highest priority)
- When an item is marked as `done: true`, it automatically moves to the end of the list
- When an item is marked as `done: false`, it automatically moves to the top (priority 0)
- Manual priority changes will reorder other items automatically

### 2. Date Handling

- All dates are in ISO 8601 format: `"2026-03-20T00:00:00.000Z"`
- `ecd` (Expected Completion Date) can be `null` for Office, Todos, Dreams, and WorkOnDreams
- **Habits do not use `ecd`.** They use `ecdDayOfWeek` and `ecdDayOfMonth` instead (both stored as **arrays** of integers). Exactly one field must be provided on create; each accepts a single integer or an array (e.g. `[1, 3, 5]` for Mon/Wed/Fri, `[5]` for the 5th of every month)

### 3. Data Validation

- `name` field is required and must be a non-empty string
- `notes` field is optional, defaults to empty string
- `done` field is optional, defaults to `false`
- `priority` is managed automatically but can be set manually

### 4. List Ordering

- All GET list endpoints return items sorted by priority (ascending)
- Undone items appear first, then done items

### 5. HTTP Status Codes

- `200 OK` - Successful GET, PUT, DELETE
- `201 Created` - Successful POST
- `400 Bad Request` - Validation error
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

### 6. Collection Differences

- **Habits:** Chron endpoint marks **all** done habits as undone (regardless of date)
- **Events:** Chron endpoint marks done events as undone only if their `ecd` falls within the current week; never deletes; 1 year is added to `ecd` when an event is marked done
- **Office/Todos/Dreams/WorkOnDreams:** Chron endpoint deletes done items

### 7. Testing

- Test database uses collections with `-Test` suffix (e.g., `Office-Test`)
- Production uses regular collection names (e.g., `Office`)

---

## Example Frontend Integration

### Fetching All Todos

```typescript
async function getTodos() {
  const response = await fetch("http://localhost:3002/api/todos");
  const data = await response.json();

  if (data.success) {
    return data.data; // Array of todos
  } else {
    throw new Error(data.error);
  }
}
```

### Creating a New Todo

```typescript
async function createTodo(name: string, notes?: string, ecd?: string) {
  const response = await fetch("http://localhost:3002/api/todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, notes, ecd }),
  });

  const data = await response.json();

  if (data.success) {
    return data.data; // Created todo
  } else {
    throw new Error(data.error);
  }
}
```

### Updating a Todo

```typescript
async function updateTodo(id: string, updates: Partial<Item>) {
  const response = await fetch(`http://localhost:3002/api/todos/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (data.success) {
    return data.data; // Updated todo
  } else {
    throw new Error(data.error);
  }
}
```

### Deleting a Todo

```typescript
async function deleteTodo(id: string) {
  const response = await fetch(`http://localhost:3002/api/todos/${id}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error);
  }
}
```

### Marking Todo as Done

```typescript
async function markTodoAsDone(id: string) {
  return updateTodo(id, { done: true });
  // This will automatically move the todo to the end of the list
}
```

---

## Swagger Documentation

Interactive API documentation is available at: `http://localhost:3002/api-docs`

This provides a user-friendly interface to test all endpoints directly in the browser.
