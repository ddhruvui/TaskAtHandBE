const express = require("express");
const router = express.Router();
const {
  getAllHeaders,
  createHeader,
  updateHeader,
  deleteHeader,
} = require("../controllers/headerController");

/**
 * @openapi
 * /headers:
 *   get:
 *     tags: [Headers]
 *     summary: Get all headers
 *     description: Returns all headers sorted by priority ascending
 *     responses:
 *       200:
 *         description: Array of headers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Header'
 */
router.get("/", getAllHeaders);

/**
 * @openapi
 * /headers:
 *   post:
 *     tags: [Headers]
 *     summary: Create a new header
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
 *       201:
 *         description: Created header
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Header'
 *       400:
 *         description: Validation error
 */
router.post("/", createHeader);

/**
 * @openapi
 * /headers/{id}:
 *   put:
 *     tags: [Headers]
 *     summary: Update a header
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
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated header
 *       404:
 *         description: Header not found
 */
router.put("/:id", updateHeader);

/**
 * @openapi
 * /headers/{id}:
 *   delete:
 *     tags: [Headers]
 *     summary: Delete a header and all its tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted confirmation with task count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: string
 *                 tasksDeleted:
 *                   type: integer
 *       404:
 *         description: Header not found
 */
router.delete("/:id", deleteHeader);

module.exports = router;
