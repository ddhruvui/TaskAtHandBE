const express = require("express");
const router = express.Router();
const {
  getTasksByHeader,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Get all tasks for a header
 *     parameters:
 *       - in: query
 *         name: headerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Filter tasks by headerId
 *     responses:
 *       200:
 *         description: Array of tasks sorted by priority
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       400:
 *         description: Missing headerId
 *       404:
 *         description: Header not found
 */
router.get("/", getTasksByHeader);

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a new task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, headerId]
 *             properties:
 *               name:
 *                 type: string
 *               notes:
 *                 type: string
 *               headerId:
 *                 type: string
 *               ecd:
 *                 $ref: '#/components/schemas/ECD'
 *     responses:
 *       201:
 *         description: Created task
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Header not found
 */
router.post("/", createTask);

/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               notes:
 *                 type: string
 *               ecd:
 *                 $ref: '#/components/schemas/ECD'
 *               done:
 *                 type: boolean
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated task
 *       400:
 *         description: Validation error
 *       404:
 *         description: Task not found
 */
router.put("/:id", updateTask);

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted confirmation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: string
 *       404:
 *         description: Task not found
 */
router.delete("/:id", deleteTask);

module.exports = router;
