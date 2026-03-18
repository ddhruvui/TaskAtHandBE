const express = require("express");
const router = express.Router();
const {
  getAllHabbits,
  getHabbitById,
  createHabbit,
  updateHabbit,
  deleteHabbit,
  getHabbitCount,
  deleteAllDoneHabbits,
} = require("../controllers/habbitController");

/**
 * @openapi
 * /api/habbits:
 *   get:
 *     tags:
 *       - Habits
 *     summary: Get all habits
 *     description: Retrieves all habits sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of habits
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Habit'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", getAllHabbits);

/**
 * @openapi
 * /api/habbits/count:
 *   get:
 *     tags:
 *       - Habits
 *     summary: Get habit count
 *     description: Returns the total number of habits
 *     responses:
 *       200:
 *         description: Habit count
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
router.get("/count", getHabbitCount);

/**
 * @openapi
 * /api/habbits/chron:
 *   delete:
 *     tags:
 *       - Habits
 *     summary: Delete all done habits
 *     description: Bulk deletes all completed habits (used for cron job cleanup)
 *     responses:
 *       200:
 *         description: Successfully deleted done habits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All done habbits deleted successfully
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
router.delete("/chron", deleteAllDoneHabbits);

/**
 * @openapi
 * /api/habbits/{id}:
 *   get:
 *     tags:
 *       - Habits
 *     summary: Get habit by ID
 *     description: Retrieves a single habit by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the habit
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Habit found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Habit'
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Habit not found
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
router.get("/:id", getHabbitById);

/**
 * @openapi
 * /api/habbits:
 *   post:
 *     tags:
 *       - Habits
 *     summary: Create a new habit
 *     description: Creates a new habit and inserts it before all done habits
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
 *                 example: Morning exercise
 *               notes:
 *                 type: string
 *                 example: 30 minutes cardio
 *               done:
 *                 type: boolean
 *                 example: false
 *               ecd:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-20T00:00:00.000Z"
 *           examples:
 *             basic:
 *               summary: Basic habit
 *               value:
 *                 name: Morning exercise
 *             withNotes:
 *               summary: Habit with notes
 *               value:
 *                 name: Morning exercise
 *                 notes: 30 minutes cardio
 *             withECD:
 *               summary: Habit with expected completion date
 *               value:
 *                 name: Read daily
 *                 notes: 20 pages minimum
 *                 ecd: "2026-03-20T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Habit created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Habit'
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
router.post("/", createHabbit);

/**
 * @openapi
 * /api/habbits/{id}:
 *   put:
 *     tags:
 *       - Habits
 *     summary: Update a habit
 *     description: Updates an existing habit. Marking as done moves it to the end of the list. Changing priority reorders the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the habit
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
 *                 example: Morning exercise
 *               notes:
 *                 type: string
 *                 example: 45 minutes cardio
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
 *               summary: Mark habit as done
 *               value:
 *                 done: true
 *             updateName:
 *               summary: Update habit name and notes
 *               value:
 *                 name: Extended morning exercise
 *                 notes: 45 minutes cardio and stretching
 *             changePriority:
 *               summary: Change habit priority
 *               value:
 *                 priority: 0
 *     responses:
 *       200:
 *         description: Habit updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Habit'
 *       400:
 *         description: Invalid ID or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Habit not found
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
router.put("/:id", updateHabbit);

/**
 * @openapi
 * /api/habbits/{id}:
 *   delete:
 *     tags:
 *       - Habits
 *     summary: Delete a habit
 *     description: Deletes a habit and automatically reorders the priorities of remaining habits
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the habit
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Habit deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Habbit deleted successfully
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Habit not found
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
router.delete("/:id", deleteHabbit);

module.exports = router;
