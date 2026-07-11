const express = require("express");
const router = express.Router();
const {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} = require("../controllers/eventController");

/**
 * @openapi
 * /events:
 *   get:
 *     tags: [Events]
 *     summary: Get all event templates
 *     description: Returns all event templates sorted by name ascending
 *     responses:
 *       200:
 *         description: Array of events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Event'
 */
router.get("/", getAllEvents);

/**
 * @openapi
 * /events:
 *   post:
 *     tags: [Events]
 *     summary: Create a new event template
 *     description: An event is a reusable bundle of task names (e.g. "Burger Night" with its shopping list) that can later be added to the todo for a chosen date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, tasks]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Burger Night"
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Procure onion", "Procure bun", "Procure patty"]
 *     responses:
 *       201:
 *         description: Created event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       400:
 *         description: Validation error
 */
router.post("/", createEvent);

/**
 * @openapi
 * /events/{id}:
 *   put:
 *     tags: [Events]
 *     summary: Update an event template
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
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated event
 *       404:
 *         description: Event not found
 */
router.put("/:id", updateEvent);

/**
 * @openapi
 * /events/{id}:
 *   delete:
 *     tags: [Events]
 *     summary: Delete an event template
 *     description: Deletes the template only — tasks already added to the todo are untouched.
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
 *         description: Event not found
 */
router.delete("/:id", deleteEvent);

module.exports = router;
