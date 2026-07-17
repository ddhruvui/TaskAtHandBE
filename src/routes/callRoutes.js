const express = require("express");
const router = express.Router();
const {
  getAllCalls,
  createCall,
  updateCall,
  deleteCall,
} = require("../controllers/callController");

/**
 * @openapi
 * /calls:
 *   get:
 *     tags: [Calls]
 *     summary: Get all calls
 *     description: Returns all calls sorted by createdAt ascending (order added)
 *     responses:
 *       200:
 *         description: Array of calls
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Call'
 */
router.get("/", getAllCalls);

/**
 * @openapi
 * /calls:
 *   post:
 *     tags: [Calls]
 *     summary: Create a new call
 *     description: A call is a person the user must call biweekly or monthly. Completely independent of tasks and headers. New calls start undone (done=false, doneAt=null).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, frequency]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Grandma"
 *               frequency:
 *                 type: string
 *                 enum: [biweekly, monthly]
 *                 example: "biweekly"
 *     responses:
 *       201:
 *         description: Created call
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Call'
 *       400:
 *         description: Validation error
 */
router.post("/", createCall);

/**
 * @openapi
 * /calls/{id}:
 *   put:
 *     tags: [Calls]
 *     summary: Update a call
 *     description: All fields are optional but validated when present. Setting done to true stamps doneAt; setting done to false clears it.
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
 *             properties:
 *               name:
 *                 type: string
 *               frequency:
 *                 type: string
 *                 enum: [biweekly, monthly]
 *               done:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated call
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Call'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Call not found
 */
router.put("/:id", updateCall);

/**
 * @openapi
 * /calls/{id}:
 *   delete:
 *     tags: [Calls]
 *     summary: Delete a call
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
 *         description: Call not found
 */
router.delete("/:id", deleteCall);

module.exports = router;
