# TaskAtHand API Documentation

## 🚀 Interactive API Documentation

Your API now has **interactive Swagger documentation** available at:

**http://localhost:3002/api-docs**

The Swagger UI allows you to:

- View all endpoints with detailed descriptions
- See request/response schemas
- Test endpoints directly from your browser
- Export API specifications

---

## 📋 Quick Reference

### Base URL

```
http://localhost:3002
```

### Response Format

All responses are in JSON format.

---

## 🏠 System Endpoints

### Get API Info

```http
GET /
```

**Response:**

```json
{
  "message": "TaskAtHand API is running",
  "environment": "development",
  "docs": "/api-docs"
}
```

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

---

## 📝 Todos Endpoints

### Get All Todos

```http
GET /api/todos
```

**Response:**

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Buy groceries",
    "notes": "Milk, eggs, bread",
    "priority": 0,
    "done": false,
    "ecd": "2026-03-20T00:00:00.000Z",
    "createdAt": "2026-03-17T10:00:00.000Z",
    "updatedAt": "2026-03-17T10:00:00.000Z"
  }
]
```

### Get Todo by ID

```http
GET /api/todos/{id}
```

**Parameters:**

- `id` (string, required): MongoDB ObjectId

**Response:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "priority": 0,
  "done": false,
  "ecd": "2026-03-20T00:00:00.000Z",
  "createdAt": "2026-03-17T10:00:00.000Z",
  "updatedAt": "2026-03-17T10:00:00.000Z"
}
```

### Get Todo Count

```http
GET /api/todos/count
```

**Response:**

```json
{
  "count": 5
}
```

### Create Todo

```http
POST /api/todos
```

**Request Body:**

```json
{
  "name": "Buy groceries", // Required
  "notes": "Milk, eggs, bread", // Optional
  "done": false, // Optional (default: false)
  "ecd": "2026-03-20T00:00:00.000Z" // Optional (Expected Completion Date)
}
```

**Response:** `201 Created`

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "priority": 0,
  "done": false,
  "ecd": "2026-03-20T00:00:00.000Z",
  "createdAt": "2026-03-17T10:00:00.000Z",
  "updatedAt": "2026-03-17T10:00:00.000Z"
}
```

### Update Todo

```http
PUT /api/todos/{id}
```

**Parameters:**

- `id` (string, required): MongoDB ObjectId

**Request Body:** (all fields optional)

```json
{
  "name": "Buy groceries and supplies",
  "notes": "Milk, eggs, bread, cleaning supplies",
  "priority": 2,
  "done": true,
  "ecd": "2026-03-25T00:00:00.000Z"
}
```

**Response:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Buy groceries and supplies",
  "notes": "Milk, eggs, bread, cleaning supplies",
  "priority": 2,
  "done": true,
  "ecd": "2026-03-25T00:00:00.000Z",
  "createdAt": "2026-03-17T10:00:00.000Z",
  "updatedAt": "2026-03-17T11:00:00.000Z"
}
```

**Note:** Marking a todo as `done: true` automatically moves it to the end of the list.

### Delete Todo

```http
DELETE /api/todos/{id}
```

**Parameters:**

- `id` (string, required): MongoDB ObjectId

**Response:**

```json
{
  "message": "Todo deleted successfully"
}
```

**Note:** Deleting a todo automatically reorders remaining todos' priorities.

### Delete All Done Todos (Cron Cleanup)

```http
DELETE /api/todos/chron
```

**Response:**

```json
{
  "message": "All done todos deleted successfully",
  "deletedCount": 5
}
```

---

## 🎯 Habits Endpoints

### Get All Habits

```http
GET /api/habbits
```

**Response:**

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Morning exercise",
    "notes": "30 minutes cardio",
    "priority": 0,
    "done": false,
    "ecd": "2026-03-20T00:00:00.000Z",
    "createdAt": "2026-03-17T10:00:00.000Z",
    "updatedAt": "2026-03-17T10:00:00.000Z"
  }
]
```

### Get Habit by ID

```http
GET /api/habbits/{id}
```

**Parameters:**

- `id` (string, required): MongoDB ObjectId

### Get Habit Count

```http
GET /api/habbits/count
```

**Response:**

```json
{
  "count": 3
}
```

### Create Habit

```http
POST /api/habbits
```

**Request Body:**

```json
{
  "name": "Morning exercise", // Required
  "notes": "30 minutes cardio", // Optional
  "done": false, // Optional (default: false)
  "ecd": "2026-03-20T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created`

### Update Habit

```http
PUT /api/habbits/{id}
```

**Request Body:** (all fields optional)

```json
{
  "name": "Extended morning exercise",
  "notes": "45 minutes cardio and stretching",
  "priority": 0,
  "done": true,
  "ecd": "2026-03-25T00:00:00.000Z"
}
```

### Delete Habit

```http
DELETE /api/habbits/{id}
```

**Response:**

```json
{
  "message": "Habbit deleted successfully"
}
```

### Delete All Done Habits (Cron Cleanup)

```http
DELETE /api/habbits/chron
```

**Response:**

```json
{
  "message": "All done habbits deleted successfully",
  "deletedCount": 3
}
```

---

## 💼 Office Tasks Endpoints

### Get All Office Tasks

```http
GET /api/office
```

**Response:**

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Prepare quarterly report",
    "notes": "Include sales data from Q1",
    "priority": 0,
    "done": false,
    "ecd": "2026-03-20T00:00:00.000Z",
    "createdAt": "2026-03-17T10:00:00.000Z",
    "updatedAt": "2026-03-17T10:00:00.000Z"
  }
]
```

### Get Office Task by ID

```http
GET /api/office/{id}
```

**Parameters:**

- `id` (string, required): MongoDB ObjectId

### Get Office Task Count

```http
GET /api/office/count
```

**Response:**

```json
{
  "count": 7
}
```

### Create Office Task

```http
POST /api/office
```

**Request Body:**

```json
{
  "name": "Prepare quarterly report", // Required
  "notes": "Include sales data from Q1", // Optional
  "done": false, // Optional (default: false)
  "ecd": "2026-03-20T00:00:00.000Z" // Optional
}
```

**Response:** `201 Created`

### Update Office Task

```http
PUT /api/office/{id}
```

**Request Body:** (all fields optional)

```json
{
  "name": "Prepare comprehensive quarterly report",
  "notes": "Include sales, expense, and projection data",
  "priority": 0,
  "done": true,
  "ecd": "2026-03-25T00:00:00.000Z"
}
```

### Delete Office Task

```http
DELETE /api/office/{id}
```

**Response:**

```json
{
  "message": "Task deleted successfully"
}
```

### Delete All Done Office Tasks (Cron Cleanup)

```http
DELETE /api/office/chron
```

**Response:**

```json
{
  "message": "All done tasks deleted successfully",
  "deletedCount": 4
}
```

---

## 🔧 Common Features

### Priority Management

- All items are sorted by priority (0-based index)
- Lower priority number = higher importance
- Undone items always appear before done items
- Marking an item as done automatically moves it to the end
- Deleting an item automatically reorders remaining items

### Expected Completion Date (ECD)

- Optional field for all items
- Accepts ISO 8601 date-time format: `"2026-03-20T00:00:00.000Z"`
- Can be null

### Automatic Timestamps

- `createdAt`: Automatically set when item is created
- `updatedAt`: Automatically updated when item is modified

---

## ❌ Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid ID format"
}
```

### 404 Not Found

```json
{
  "error": "Todo not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Something went wrong!",
  "message": "Detailed error message (development only)"
}
```

---

## 🧪 Testing with cURL

### Create a Todo

```bash
curl -X POST http://localhost:3002/api/todos \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Buy groceries",
    "notes": "Milk, eggs, bread",
    "ecd": "2026-03-20T00:00:00.000Z"
  }'
```

### Get All Todos

```bash
curl http://localhost:3002/api/todos
```

### Update a Todo (Mark as Done)

```bash
curl -X PUT http://localhost:3002/api/todos/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{"done": true}'
```

### Delete a Todo

```bash
curl -X DELETE http://localhost:3002/api/todos/507f1f77bcf86cd799439011
```

---

## 📦 Starting the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test
```

---

## 🌐 Accessing Swagger Documentation

Once the server is running, visit:

**http://localhost:3002/api-docs**

The Swagger UI provides:

- Complete API reference
- Interactive testing interface
- Request/response examples
- Schema definitions
- Try-it-out functionality

---

## 📝 Notes

1. All three collections (Todos, Habits, Office) follow the same data structure and behavior
2. The API uses MongoDB ObjectId for all item identifiers
3. Priority reordering happens automatically when items are created, updated, or deleted
4. The `/chron` endpoints are designed for scheduled cleanup jobs
5. All dates use ISO 8601 format
6. CORS is enabled for all origins in development mode
