const express = require("express");
const router = express.Router();
const {
  getAllTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodoCount,
  deleteAllDoneTodos,
} = require("../controllers/todoController");

/**
 * @openapi
 * /api/todos:
 *   get:
 *     tags:
 *       - Todos
 *     summary: Get all todos
 *     description: Retrieves all todos sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of todos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Todo'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", getAllTodos);

/**
 * @openapi
 * /api/todos/count:
 *   get:
 *     tags:
 *       - Todos
 *     summary: Get todo count
 *     description: Returns the total number of todos
 *     responses:
 *       200:
 *         description: Todo count
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Count'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/count", getTodoCount);

/**
 * @openapi
 * /api/todos/chron:
 *   delete:
 *     tags:
 *       - Todos
 *     summary: Delete all done todos
 *     description: Bulk deletes all completed todos (used for cron job cleanup)
 *     responses:
 *       200:
 *         description: Successfully deleted done todos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All done todos deleted successfully
 *                 deletedCount:
 *                   type: number
 *                   example: 5
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete("/chron", deleteAllDoneTodos);

/**
 * @openapi
 * /api/todos/{id}:
 *   get:
 *     tags:
 *       - Todos
 *     summary: Get todo by ID
 *     description: Retrieves a single todo by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the todo
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Todo found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Todo'
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Todo not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:id", getTodoById);

/**
 * @openapi
 * /api/todos:
 *   post:
 *     tags:
 *       - Todos
 *     summary: Create a new todo
 *     description: Creates a new todo and inserts it before all done todos
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTodo'
 *           examples:
 *             basic:
 *               summary: Basic todo
 *               value:
 *                 name: Buy groceries
 *             withNotes:
 *               summary: Todo with notes
 *               value:
 *                 name: Buy groceries
 *                 notes: Milk, eggs, bread
 *             withECD:
 *               summary: Todo with expected completion date
 *               value:
 *                 name: Submit report
 *                 notes: Q1 financial report
 *                 ecd: "2026-03-20T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Todo created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Todo'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/", createTodo);

/**
 * @openapi
 * /api/todos/{id}:
 *   put:
 *     tags:
 *       - Todos
 *     summary: Update a todo
 *     description: Updates an existing todo. Marking as done moves it to the end of the list. Changing priority reorders the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the todo
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTodo'
 *           examples:
 *             markDone:
 *               summary: Mark todo as done
 *               value:
 *                 done: true
 *             updateName:
 *               summary: Update todo name and notes
 *               value:
 *                 name: Buy groceries and supplies
 *                 notes: Milk, eggs, bread, cleaning supplies
 *             changePriority:
 *               summary: Change todo priority
 *               value:
 *                 priority: 0
 *             updateECD:
 *               summary: Update expected completion date
 *               value:
 *                 ecd: "2026-03-25T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Todo updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Todo'
 *       400:
 *         description: Invalid ID or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Todo not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put("/:id", updateTodo);

/**
 * @openapi
 * /api/todos/{id}:
 *   delete:
 *     tags:
 *       - Todos
 *     summary: Delete a todo
 *     description: Deletes a todo and automatically reorders the priorities of remaining todos
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the todo
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Todo deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Todo deleted successfully
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Todo not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete("/:id", deleteTodo);

module.exports = router;
