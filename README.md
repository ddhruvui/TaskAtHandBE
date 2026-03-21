# TaskAtHand Backend

Node.js and Express backend for TaskAtHand application with MongoDB.

## Features

- Express.js server
- MongoDB database connection
- Environment-based configuration
- Automatic test database suffix (-Test) for testing environment
- CORS enabled
- Error handling middleware

## Project Structure

```
TaskAtHandBE/
├── src/
│   ├── server.js           # Main server file
│   ├── config/
│   │   └── db.js           # MongoDB configuration
│   ├── routes/             # API routes
│   ├── controllers/        # Business logic
│   ├── models/             # Database models
│   └── middleware/         # Custom middleware
├── .env                    # Environment variables
├── .gitignore
└── package.json
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env` file and update `DB_PASSWORD` with your actual MongoDB password
   - The MongoDB URI uses Cluster0 at: `mongodb+srv://dhruvaws8:<db_password>@cluster0.znyjnot.mongodb.net/?appName=Cluster0`
   - Set `USE_TEST_DB=true` to use test databases, or `USE_TEST_DB=false` for production databases

3. Database Naming Convention:
   - **Production**: Set `USE_TEST_DB=false` to use regular database names (e.g., `Office`)
   - **Testing**: Set `USE_TEST_DB=true` to automatically append `-Test` suffix (e.g., `Office-Test`)
   - Switch between environments by changing the `USE_TEST_DB` value in `.env`

## Running the Application

### Development Mode (with auto-restart)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Test Mode (uses -Test databases)

```bash
npm test
```

## Environment Variables

- `DB_PASSWORD`: MongoDB password
- `MONGO_URI`: MongoDB connection string
- `PORT`: Server port (default: 3002)
- `NODE_ENV`: Environment mode (development/production/test)
- `USE_TEST_DB`: Set to `true` to use test databases (adds -Test suffix), `false` for production databases

## API Endpoints

### System Endpoints

- `GET /` - API welcome message with documentation link
- `GET /health` - Health check endpoint
- `GET /api-docs` - **Interactive Swagger API Documentation**

### Todos

- `GET /api/todos` - Get all todos
- `GET /api/todos/count` - Get todo count
- `GET /api/todos/:id` - Get todo by ID
- `POST /api/todos` - Create new todo
- `PUT /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Delete todo
- `DELETE /api/todos/chron` - Delete all done todos

### Habits

- `GET /api/habbits` - Get all habits
- `GET /api/habbits/count` - Get habit count
- `GET /api/habbits/:id` - Get habit by ID
- `POST /api/habbits` - Create new habit
- `PUT /api/habbits/:id` - Update habit
- `DELETE /api/habbits/:id` - Delete habit
- `DELETE /api/habbits/chron` - Delete all done habits

### Office Tasks

- `GET /api/office` - Get all office tasks
- `GET /api/office/count` - Get office task count
- `GET /api/office/:id` - Get office task by ID
- `POST /api/office` - Create new office task
- `PUT /api/office/:id` - Update office task
- `DELETE /api/office/:id` - Delete office task
- `DELETE /api/office/chron` - Delete all done office tasks

## API Documentation

### Interactive Swagger Documentation

Once the server is running, access the interactive API documentation at:

**http://localhost:3002/api-docs**

The Swagger UI provides:

- Complete API reference with request/response schemas
- Interactive testing interface (try endpoints directly from browser)
- Request examples and response samples
- OpenAPI 3.0 specification

### Quick Reference Guide

For a detailed markdown reference with cURL examples, see [API.md](API.md)

## Database Usage Example

```javascript
const { getDatabase } = require("./config/db");

// With USE_TEST_DB=false (production)
const db = await getDatabase("Office"); // Connects to 'Office' database

// With USE_TEST_DB=true (testing)
const db = await getDatabase("Office"); // Connects to 'Office-Test' database
```

## Notes

- The `.env` file is gitignored for security
- Always use environment variables for sensitive data
- MongoDB connection is established on server startup
- Collections follow the same naming convention as databases for test/prod separation
