const express = require("express");
const router = express.Router();
const {
  getAllWorkOnDreams,
  getWorkOnDreamById,
  createWorkOnDream,
  updateWorkOnDream,
  deleteWorkOnDream,
  getWorkOnDreamCount,
  deleteAllDoneWorkOnDreams,
} = require("../controllers/workOnDreamController");

/**
 * @openapi
 * /api/workondreams:
 *   get:
 *     tags:
 *       - WorkOnDreams
 *     summary: Get all work on dreams
 *     description: Retrieves all work on dreams sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of work on dreams
 *       500:
 *         description: Server error
 */
router.get("/", getAllWorkOnDreams);

/**
 * @openapi
 * /api/workondreams/count:
 *   get:
 *     tags:
 *       - WorkOnDreams
 *     summary: Get work on dream count
 *     description: Returns the total number of work on dreams
 *     responses:
 *       200:
 *         description: Work on dream count
 *       500:
 *         description: Server error
 */
router.get("/count", getWorkOnDreamCount);

/**
 * @openapi
 * /api/workondreams/chron:
 *   delete:
 *     tags:
 *       - WorkOnDreams
 *     summary: Delete all done work on dreams
 *     description: Bulk deletes all completed work on dreams (used for cron job cleanup)
 *     responses:
 *       200:
 *         description: Successfully deleted done work on dreams
 *       500:
 *         description: Server error
 */
router.delete("/chron", deleteAllDoneWorkOnDreams);

/**
 * @openapi
 * /api/workondreams/{id}:
 *   get:
 *     tags:
 *       - WorkOnDreams
 *     summary: Get work on dream by ID
 *     description: Retrieves a single work on dream by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the work on dream
 *     responses:
 *       200:
 *         description: Work on dream found
 *       404:
 *         description: Work on dream not found
 *       500:
 *         description: Server error
 */
router.get("/:id", getWorkOnDreamById);

/**
 * @openapi
 * /api/workondreams:
 *   post:
 *     tags:
 *       - WorkOnDreams
 *     summary: Create a new work on dream
 *     description: Creates a new work on dream and inserts it before all done items
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
 *               notes:
 *                 type: string
 *               done:
 *                 type: boolean
 *               ecd:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Work on dream created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post("/", createWorkOnDream);

/**
 * @openapi
 * /api/workondreams/{id}:
 *   put:
 *     tags:
 *       - WorkOnDreams
 *     summary: Update a work on dream
 *     description: Updates an existing work on dream. Marking as done moves it to the end of the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the work on dream
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               notes:
 *                 type: string
 *               done:
 *                 type: boolean
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Work on dream updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Work on dream not found
 *       500:
 *         description: Server error
 */
router.put("/:id", updateWorkOnDream);

/**
 * @openapi
 * /api/workondreams/{id}:
 *   delete:
 *     tags:
 *       - WorkOnDreams
 *     summary: Delete a work on dream
 *     description: Deletes a work on dream and automatically reorders the priorities of remaining items
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the work on dream
 *     responses:
 *       200:
 *         description: Work on dream deleted successfully
 *       404:
 *         description: Work on dream not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", deleteWorkOnDream);

module.exports = router;
