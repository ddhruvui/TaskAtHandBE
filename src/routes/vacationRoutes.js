const express = require("express");
const router = express.Router();
const {
  getAllVacations,
  getStatus,
  getVacationTasks,
  createVacation,
  updateVacation,
  deleteVacation,
} = require("../controllers/vacationController");

/**
 * @openapi
 * /vacations:
 *   get:
 *     tags: [Vacations]
 *     summary: Get all vacations
 *     description: Every stored vacation, oldest start date first. Ranges are never pruned — they are the only record that makes past insights re-derivable.
 *     responses:
 *       200:
 *         description: Array of vacations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Vacation'
 */
router.get("/", getAllVacations);

/**
 * @openapi
 * /vacations/status:
 *   get:
 *     tags: [Vacations]
 *     summary: Whether today is a vacation day
 *     description: The banner payload — today's UTC day, the active vacation (with day counts), anything upcoming, and a vacation that ended in the last 3 days.
 *     responses:
 *       200:
 *         description: Vacation status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VacationStatus'
 */
router.get("/status", getStatus);

/**
 * @openapi
 * /vacations/{id}/tasks:
 *   get:
 *     tags: [Vacations]
 *     summary: Undone one-time dated tasks falling inside a vacation
 *     description: The re-date list. Only `date` ECD tasks appear — recurring tasks cannot be moved without rewriting their schedule, so they are exempted for those days instead.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tasks scheduled inside the vacation, each with its headerName
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       404:
 *         description: Vacation not found
 */
router.get("/:id/tasks", getVacationTasks);

/**
 * @openapi
 * /vacations:
 *   post:
 *     tags: [Vacations]
 *     summary: Book a vacation
 *     description: Both dates are required and both are inclusive — the day it starts and the day it ends are vacation days. Ranges may not overlap.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate]
 *             properties:
 *               startDate:
 *                 type: string
 *                 example: "2026-09-03"
 *               endDate:
 *                 type: string
 *                 example: "2026-09-15"
 *               note:
 *                 type: string
 *                 example: "Kerala trip"
 *     responses:
 *       201:
 *         description: Created vacation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vacation'
 *       400:
 *         description: Validation error (bad date, endDate before startDate, or an overlapping range)
 */
router.post("/", createVacation);

/**
 * @openapi
 * /vacations/{id}:
 *   put:
 *     tags: [Vacations]
 *     summary: Correct a vacation's dates or note
 *     description: For the forgot-to-book-it and the home-early cases. The resulting range is validated, not just the fields sent.
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
 *               startDate:
 *                 type: string
 *               endDate:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated vacation
 *       400:
 *         description: Validation error
 *       404:
 *         description: Vacation not found
 */
router.put("/:id", updateVacation);

/**
 * @openapi
 * /vacations/{id}:
 *   delete:
 *     tags: [Vacations]
 *     summary: Delete a vacation
 *     description: Removes the forgiveness it granted too — archive events carry no vacation flag of their own, so the days it covered become ordinary days again.
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
 *         description: Vacation not found
 */
router.delete("/:id", deleteVacation);

module.exports = router;
