const express = require("express");
const router = express.Router();
const {
  getAllOnCall,
  createOnCall,
  updateOnCall,
  deleteOnCall,
} = require("../controllers/onCallController");

/**
 * @openapi
 * /oncall:
 *   get:
 *     tags: [OnCall]
 *     summary: Get upcoming on-call shifts
 *     description: Shifts dated yesterday (UTC) or later, ordered by date then start. Yesterday is kept because an overnight shift that started then may still be running. On-call is a record only — it never affects tasks.
 *     responses:
 *       200:
 *         description: Array of shifts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OnCall'
 */
router.get("/", getAllOnCall);

/**
 * @openapi
 * /oncall:
 *   post:
 *     tags: [OnCall]
 *     summary: Add an on-call shift
 *     description: An end at or before the start runs past midnight; "24:00" means the end of the day. Shifts may not overlap (whatever their type), and a date before yesterday is rejected.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, start, end]
 *             properties:
 *               date:
 *                 type: string
 *                 example: "2026-11-16"
 *               start:
 *                 type: string
 *                 example: "09:00"
 *               end:
 *                 type: string
 *                 example: "22:00"
 *               type:
 *                 type: string
 *                 enum: [primary, secondary]
 *                 default: primary
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created shift
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnCall'
 *       400:
 *         description: Validation error (bad date/time/type, start equals end, past date, or an overlap)
 */
router.post("/", createOnCall);

/**
 * @openapi
 * /oncall/{id}:
 *   put:
 *     tags: [OnCall]
 *     summary: Update an on-call shift
 *     description: Partial update — omitted fields are left alone. The resulting shift is validated as a whole.
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
 *               date:
 *                 type: string
 *               start:
 *                 type: string
 *               end:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [primary, secondary]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated shift
 *       400:
 *         description: Validation error
 *       404:
 *         description: Shift not found
 */
router.put("/:id", updateOnCall);

/**
 * @openapi
 * /oncall/{id}:
 *   delete:
 *     tags: [OnCall]
 *     summary: Delete an on-call shift
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
 *         description: Shift not found
 */
router.delete("/:id", deleteOnCall);

module.exports = router;
