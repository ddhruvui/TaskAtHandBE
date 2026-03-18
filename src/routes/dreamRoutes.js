const express = require("express");
const router = express.Router();
const {
  getAllDreams,
  getDreamById,
  createDream,
  updateDream,
  deleteDream,
  getDreamCount,
  deleteAllDoneDreams,
} = require("../controllers/dreamController");

/**
 * @openapi
 * /api/dreams:
 *   get:
 *     tags:
 *       - Dreams
 *     summary: Get all dreams
 *     description: Retrieves all dreams sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of dreams
 *       500:
 *         description: Server error
 */
router.get("/", getAllDreams);

/**
 * @openapi
 * /api/dreams/count:
 *   get:
 *     tags:
 *       - Dreams
 *     summary: Get dream count
 *     description: Returns the total number of dreams
 *     responses:
 *       200:
 *         description: Dream count
 *       500:
 *         description: Server error
 */
router.get("/count", getDreamCount);

/**
 * @openapi
 * /api/dreams/chron:
 *   delete:
 *     tags:
 *       - Dreams
 *     summary: Delete all done dreams
 *     description: Bulk deletes all completed dreams (used for cron job cleanup)
 *     responses:
 *       200:
 *         description: Successfully deleted done dreams
 *       500:
 *         description: Server error
 */
router.delete("/chron", deleteAllDoneDreams);

/**
 * @openapi
 * /api/dreams/{id}:
 *   get:
 *     tags:
 *       - Dreams
 *     summary: Get dream by ID
 *     description: Retrieves a single dream by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the dream
 *     responses:
 *       200:
 *         description: Dream found
 *       404:
 *         description: Dream not found
 *       500:
 *         description: Server error
 */
router.get("/:id", getDreamById);

/**
 * @openapi
 * /api/dreams:
 *   post:
 *     tags:
 *       - Dreams
 *     summary: Create a new dream
 *     description: Creates a new dream and inserts it before all done dreams
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
 *         description: Dream created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post("/", createDream);

/**
 * @openapi
 * /api/dreams/{id}:
 *   put:
 *     tags:
 *       - Dreams
 *     summary: Update a dream
 *     description: Updates an existing dream. Marking as done moves it to the end of the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the dream
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
 *         description: Dream updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Dream not found
 *       500:
 *         description: Server error
 */
router.put("/:id", updateDream);

/**
 * @openapi
 * /api/dreams/{id}:
 *   delete:
 *     tags:
 *       - Dreams
 *     summary: Delete a dream
 *     description: Deletes a dream and automatically reorders the priorities of remaining dreams
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the dream
 *     responses:
 *       200:
 *         description: Dream deleted successfully
 *       404:
 *         description: Dream not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", deleteDream);

module.exports = router;
