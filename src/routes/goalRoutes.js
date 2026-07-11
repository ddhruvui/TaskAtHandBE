const express = require("express");
const router = express.Router();
const {
  getAllGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} = require("../controllers/goalController");

/**
 * @openapi
 * /goals:
 *   get:
 *     tags: [Goals]
 *     summary: Get all goals
 *     description: Returns all goals sorted by name ascending
 *     responses:
 *       200:
 *         description: Array of goals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Goal'
 */
router.get("/", getAllGoals);

/**
 * @openapi
 * /goals:
 *   post:
 *     tags: [Goals]
 *     summary: Create a new goal
 *     description: A goal is a long-term aim (e.g. "Improve Health") with an ordered list of small steps/habits to build one at a time. A step is either pending (backlog/paused) or under_progress (started — its daily task lives in the "One Step At A Time" todo header and is kept for life). Steps default to an empty list.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Improve Health"
 *               steps:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/GoalStep'
 *                 example: [{ "name": "Wake up at 6", "status": "under_progress" }, { "name": "Have 1 fruit a day", "status": "pending" }]
 *     responses:
 *       201:
 *         description: Created goal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Goal'
 *       400:
 *         description: Validation error
 */
router.post("/", createGoal);

/**
 * @openapi
 * /goals/{id}:
 *   put:
 *     tags: [Goals]
 *     summary: Update a goal
 *     description: Steps are replaced wholesale — send the full list to add, rename, reorder, remove or change the status of steps.
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
 *               steps:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/GoalStep'
 *     responses:
 *       200:
 *         description: Updated goal
 *       404:
 *         description: Goal not found
 */
router.put("/:id", updateGoal);

/**
 * @openapi
 * /goals/{id}:
 *   delete:
 *     tags: [Goals]
 *     summary: Delete a goal
 *     description: Deletes the goal only — tasks already added to the todo from its steps are untouched.
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
 *         description: Goal not found
 */
router.delete("/:id", deleteGoal);

module.exports = router;
