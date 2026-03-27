# TaskAtHand Backend

Node.js/Express REST API backend for the TaskAtHand application, backed by MongoDB. Organises tasks into user-defined **Headers** with priority ordering, optional Expected Completion Dates (ECD), and a daily cron job for automated task maintenance.

## Features

- **Headers & Tasks** — two-collection data model with automatic, contiguous priority management
- **ECD system** — four ECD types (`date`, `day_of_week`, `day_of_month`, `day_of_year`) with full validation
- **Daily cron job** — auto-resets recurring tasks, cleans up expired ones, and re-sorts by upcoming ECD
- **Swagger UI** — interactive API docs served at `/api-docs`
- **Test isolation** — dedicated `*-Test` collections activated via `USE_TEST_DB=true`
- **CORS enabled** — accepts requests from any origin

## Project Structure

```
TaskAtHandBE/
├── src/
│   ├── server.js               # Express app & route wiring
│   ├── config/
│   │   ├── db.js               # MongoDB connection
│   │   └── swagger.js          # OpenAPI spec generation
│   ├── controllers/
│   │   ├── headerController.js
│   │   └── taskController.js
│   ├── cron/
│   │   └── cronJob.js          # Daily cron logic (6 steps)
│   ├── models/
│   │   ├── Header.js
│   │   └── Task.js             # ECD validation lives here
│   ├── middleware/
│   └── routes/
│       ├── headerRoutes.js
│       └── taskRoutes.js
├── tests/                      # Jest test suite
├── scripts/
│   └── cleartest.js            # Wipe test collections
├── .env
└── package.json
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```
   MONGO_URI=mongodb+srv://<user>:<password>@cluster0.znyjnot.mongodb.net/?appName=Cluster0
   PORT=3002
   NODE_ENV=development
   USE_TEST_DB=false
   ```

3. Replace `<user>` and `<password>` with your MongoDB Atlas credentials.

## Running the Application

### Development (auto-restart via nodemon)

```bash
npm run dev
```

### Production

```bash
npm start
```

Server listens on **port 3002** by default.

## Environment Variables

| Variable      | Default       | Description                                            |
| ------------- | ------------- | ------------------------------------------------------ |
| `MONGO_URI`   | —             | MongoDB connection string (required)                   |
| `PORT`        | `3002`        | HTTP port                                              |
| `NODE_ENV`    | `development` | `development` / `production` / `test`                  |
| `USE_TEST_DB` | `false`       | `true` → use `Headers-Test` / `Tasks-Test` collections |

## API Endpoints

### System

| Method | Path        | Description                       |
| ------ | ----------- | --------------------------------- |
| `GET`  | `/`         | API status                        |
| `GET`  | `/health`   | Health check                      |
| `GET`  | `/api-docs` | Interactive Swagger documentation |

### Headers

| Method   | Path           | Description                               |
| -------- | -------------- | ----------------------------------------- |
| `GET`    | `/headers`     | List all headers (sorted by priority)     |
| `POST`   | `/headers`     | Create a header                           |
| `PUT`    | `/headers/:id` | Update header name and/or priority        |
| `DELETE` | `/headers/:id` | Delete header and all its tasks (cascade) |

### Tasks

| Method   | Path         | Description                                     |
| -------- | ------------ | ----------------------------------------------- |
| `GET`    | `/tasks`     | List tasks for a header (`?headerId=` required) |
| `POST`   | `/tasks`     | Create a task                                   |
| `PUT`    | `/tasks/:id` | Update task fields, done status, or priority    |
| `DELETE` | `/tasks/:id` | Delete a task                                   |

### Cron

| Method | Path           | Description                                             |
| ------ | -------------- | ------------------------------------------------------- |
| `POST` | `/cron/run`    | Manually trigger the cron job (accepts `date` override) |
| `GET`  | `/cron/status` | Stats from the most recent cron run                     |

For full request/response schemas, error codes, and examples see [API_REFERENCE.md](API_REFERENCE.md).

## API Documentation

Once the server is running, interactive docs are available at:

**http://localhost:3002/api-docs**

## Testing

Tests use `USE_TEST_DB=true` so they operate on isolated `*-Test` collections and never touch production data.

### Run all tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Run a specific test file

```bash
USE_TEST_DB=true NODE_ENV=test npx jest tests/crud.test.js --forceExit
```

### Clear test collections (`Headers-Test` and `Tasks-Test`)

```bash
npm run cleartest
```

### Test files

| File                     | Coverage area                                   |
| ------------------------ | ----------------------------------------------- |
| `crud.test.js`           | Basic CRUD for headers and tasks                |
| `business-logic.test.js` | Priority reordering, done/undone toggling       |
| `ecd-validation.test.js` | ECD type/value validation rules                 |
| `cron-api.test.js`       | `/cron/run` and `/cron/status` endpoints        |
| `chron.test.js`          | Cron step logic (clamp, reset, delete, reorder) |
| `collections.test.js`    | Test/production collection switching            |
| `error-handling.test.js` | 400/404/500 error responses                     |

## Notes

- `.env` is gitignored — never commit credentials
- `headerId` is immutable after task creation
- Priority values are 0-based and always kept contiguous by the model layer
- Cron runs daily at UTC midnight; in production it uses `node-cron` with a setInterval fallback
