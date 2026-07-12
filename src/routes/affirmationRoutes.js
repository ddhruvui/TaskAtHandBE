const express = require("express");
const router = express.Router();
const {
  getAllAffirmations,
  createAffirmation,
  updateAffirmation,
  deleteAffirmation,
} = require("../controllers/affirmationController");

/**
 * @openapi
 * /affirmations:
 *   get:
 *     tags: [Affirmations]
 *     summary: Get all affirmations
 *     description: Returns all affirmations sorted by createdAt ascending (order added)
 *     responses:
 *       200:
 *         description: Array of affirmations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Affirmation'
 */
router.get("/", getAllAffirmations);

/**
 * @openapi
 * /affirmations:
 *   post:
 *     tags: [Affirmations]
 *     summary: Create a new affirmation
 *     description: An affirmation is a single short line the user reads daily (e.g. "Thank you blessing"). Completely independent of tasks and headers.
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
 *                 example: "Thank you blessing"
 *     responses:
 *       201:
 *         description: Created affirmation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Affirmation'
 *       400:
 *         description: Validation error
 */
router.post("/", createAffirmation);

/**
 * @openapi
 * /affirmations/{id}:
 *   put:
 *     tags: [Affirmations]
 *     summary: Update an affirmation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Updated affirmation
 *       400:
 *         description: Validation error
 *       404:
 *         description: Affirmation not found
 */
router.put("/:id", updateAffirmation);

/**
 * @openapi
 * /affirmations/{id}:
 *   delete:
 *     tags: [Affirmations]
 *     summary: Delete an affirmation
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
 *         description: Affirmation not found
 */
router.delete("/:id", deleteAffirmation);

module.exports = router;
