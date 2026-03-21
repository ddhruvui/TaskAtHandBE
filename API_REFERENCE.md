# TaskAtHand API Reference

**Base URL:** `http://localhost:3002`

This document provides a complete reference for all API endpoints. Each collection (Office, Todos, Habits, Dreams, WorkOnDreams) follows the same pattern.

---

## Common Data Model

All collections share the same data structure:

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

**Notes:**

- When `done` is set to `true`, the item moves to the end of the list (highest priority number)
- When `done` is set to `false`, the item moves to the top of the list (priority 0)
- When `priority` is changed, other items are reordered automatically

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

---

## Todos API

Base path: `/api/todos`

All endpoints follow the same pattern as Office Tasks (see above).

### Endpoints:

- `GET /api/todos` - Get all todos
- `GET /api/todos/:id` - Get todo by ID
- `POST /api/todos` - Create todo
- `PUT /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Delete todo
- `GET /api/todos/count` - Get todo count
- `DELETE /api/todos/chron` - Delete all done todos

### Example Create Request:

```json
{
  "name": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "done": false,
  "ecd": "2026-03-20T00:00:00.000Z"
}
```

---

## Habits API

Base path: `/api/habbits`

**Note:** Habits behave differently from other collections in the chron endpoint.

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
  "message": "Successfully marked 5 habit(s) as undone and moved 2 overdue habit(s) to lowest priority"
}
```

**Note:** Unlike Office/Todos, habits are NOT deleted when marked as done. The chron endpoint marks them as undone for the next day.

### Example Create Request:

```json
{
  "name": "Morning exercise",
  "notes": "30 minutes cardio",
  "done": false,
  "ecd": 1
}
```

**Note:** For habits, `ecd` can be a number (days from now) or a date string.

---

## Dreams API

Base path: `/api/dreams`

All endpoints follow the same pattern as Office Tasks.

### Endpoints:

- `GET /api/dreams` - Get all dreams
- `GET /api/dreams/:id` - Get dream by ID
- `POST /api/dreams` - Create dream
- `PUT /api/dreams/:id` - Update dream
- `DELETE /api/dreams/:id` - Delete dream
- `GET /api/dreams/count` - Get dream count
- `DELETE /api/dreams/chron` - Delete all done dreams

### Example Create Request:

```json
{
  "name": "Build a startup",
  "notes": "Focus on AI-powered productivity tools",
  "done": false,
  "ecd": "2027-12-31T00:00:00.000Z"
}
```

---

## Work On Dreams API

Base path: `/api/workondreams`

All endpoints follow the same pattern as Office Tasks.

### Endpoints:

- `GET /api/workondreams` - Get all work on dreams
- `GET /api/workondreams/:id` - Get work on dream by ID
- `POST /api/workondreams` - Create work on dream
- `PUT /api/workondreams/:id` - Update work on dream
- `DELETE /api/workondreams/:id` - Delete work on dream
- `GET /api/workondreams/count` - Get work on dream count
- `DELETE /api/workondreams/chron` - Delete all done work on dreams

### Example Create Request:

```json
{
  "name": "Research market opportunities",
  "notes": "Analyze competitor landscape",
  "done": false,
  "ecd": "2026-04-15T00:00:00.000Z"
}
```

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
- `ecd` (Expected Completion Date) can be `null`
- For habits, `ecd` can also be a number (representing days)

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

- **Habits:** Chron endpoint marks items as undone instead of deleting them
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
