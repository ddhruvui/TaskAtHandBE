const express = require("express");
const router = express.Router();
const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskCount,
  deleteAllDoneTasks,
} = require("../controllers/officeController");

/**
 * @openapi
 * /api/office:
 *   get:
 *     tags:
 *       - Office
 *     summary: Get all office tasks
 *     description: Retrieves all office tasks sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of office tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", getAllTasks);

/**
 * @openapi
 * /api/office/count:
 *   get:
 *     tags:
 *       - Office
 *     summary: Get office task count
 *     description: Returns the total number of office tasks
 *     responses:
 *       200:
 *         description: Office task count
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
router.get("/count", getTaskCount);

/**
 * @openapi
 * /api/office/chron:
 *   delete:
 *     tags:
 *       - Office
 *     summary: Delete all done office tasks
 *     description: Bulk deletes all completed office tasks (used for cron job cleanup)
 *     responses:
 *       200:
 *         description: Successfully deleted done office tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All done tasks deleted successfully
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
router.delete("/chron", deleteAllDoneTasks);

/**
 * @openapi
 * /api/office/{id}:
 *   get:
 *     tags:
 *       - Office
 *     summary: Get office task by ID
 *     description: Retrieves a single office task by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the office task
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Office task found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Office task not found
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
router.get("/:id", getTaskById);

/**
 * @openapi
 * /api/office:
 *   post:
 *     tags:
 *       - Office
 *     summary: Create a new office task
 *     description: Creates a new office task and inserts it before all done tasks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Prepare quarterly report
 *               notes:
 *                 type: string
 *                 example: Include sales data from Q1
 *               done:
 *                 type: boolean
 *                 example: false
 *               ecd:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-20T00:00:00.000Z"
 *           examples:
 *             basic:
 *               summary: Basic office task
 *               value:
 *                 name: Prepare quarterly report
 *             withNotes:
 *               summary: Office task with notes
 *               value:
 *                 name: Prepare quarterly report
 *                 notes: Include sales data from Q1
 *             withECD:
 *               summary: Office task with expected completion date
 *               value:
 *                 name: Client presentation
 *                 notes: Prepare slides for new product launch
 *                 ecd: "2026-03-20T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Office task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
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
router.post("/", createTask);

/**
 * @openapi
 * /api/office/{id}:
 *   put:
 *     tags:
 *       - Office
 *     summary: Update an office task
 *     description: Updates an existing office task. Marking as done moves it to the end of the list. Changing priority reorders the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the office task
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Prepare quarterly report
 *               notes:
 *                 type: string
 *                 example: Include sales and expense data
 *               priority:
 *                 type: number
 *                 example: 0
 *               done:
 *                 type: boolean
 *                 example: true
 *               ecd:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-25T00:00:00.000Z"
 *           examples:
 *             markDone:
 *               summary: Mark office task as done
 *               value:
 *                 done: true
 *             updateName:
 *               summary: Update office task name and notes
 *               value:
 *                 name: Prepare comprehensive quarterly report
 *                 notes: Include sales, expense, and projection data
 *             changePriority:
 *               summary: Change office task priority
 *               value:
 *                 priority: 0
 *     responses:
 *       200:
 *         description: Office task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid ID or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Office task not found
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
router.put("/:id", updateTask);

/**
 * @openapi
 * /api/office/{id}:
 *   delete:
 *     tags:
 *       - Office
 *     summary: Delete an office task
 *     description: Deletes an office task and automatically reorders the priorities of remaining tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the office task
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Office task deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Task deleted successfully
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Office task not found
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
router.delete("/:id", deleteTask);

module.exports = router;
