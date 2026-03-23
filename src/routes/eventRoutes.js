const express = require("express");
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventCount,
  chronEvents,
} = require("../controllers/eventController");

/**
 * @openapi
 * /api/events:
 *   get:
 *     tags:
 *       - Events
 *     summary: Get all events
 *     description: Retrieves all events sorted by priority (undone items first, then done items)
 *     responses:
 *       200:
 *         description: List of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *       500:
 *         description: Server error
 */
router.get("/", getAllEvents);

/**
 * @openapi
 * /api/events/count:
 *   get:
 *     tags:
 *       - Events
 *     summary: Get event count
 *     description: Returns the total number of events
 *     responses:
 *       200:
 *         description: Event count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *       500:
 *         description: Server error
 */
router.get("/count", getEventCount);

/**
 * @openapi
 * /api/events/chron:
 *   delete:
 *     tags:
 *       - Events
 *     summary: Chron action for events
 *     description: >
 *       Unchecks all done events whose ECD falls within the current week (Monday–Sunday).
 *       Does NOT delete any events. Moves unchecked events to lowest priority.
 *       When an event was previously marked done, 1 year was already added to its ECD.
 *     responses:
 *       200:
 *         description: Chron action completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 markedUndoneCount:
 *                   type: number
 *                   example: 2
 *                 movedCount:
 *                   type: number
 *                   example: 2
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.delete("/chron", chronEvents);

/**
 * @openapi
 * /api/events/{id}:
 *   get:
 *     tags:
 *       - Events
 *     summary: Get event by ID
 *     description: Retrieves a single event by its MongoDB ObjectId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the event
 *     responses:
 *       200:
 *         description: Event found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.get("/:id", getEventById);

/**
 * @openapi
 * /api/events:
 *   post:
 *     tags:
 *       - Events
 *     summary: Create a new event
 *     description: Creates a new event. When marked done later, 1 year is added to the ECD.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEvent'
 *           examples:
 *             basic:
 *               summary: Basic event
 *               value:
 *                 name: Annual review
 *             withECD:
 *               summary: Event with ECD
 *               value:
 *                 name: Team offsite
 *                 notes: Book venue
 *                 ecd: "2026-06-15T00:00:00.000Z"
 *     responses:
 *       201:
 *         description: Event created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post("/", createEvent);

/**
 * @openapi
 * /api/events/{id}:
 *   put:
 *     tags:
 *       - Events
 *     summary: Update an event
 *     description: >
 *       Updates an existing event. Marking as done moves the event to the end of the list
 *       and adds 1 year to its ECD. Marking as undone moves it to the front of the list.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the event
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEvent'
 *           examples:
 *             markDone:
 *               summary: Mark event as done (ECD advances 1 year)
 *               value:
 *                 done: true
 *             updateName:
 *               summary: Update event name
 *               value:
 *                 name: Annual review meeting
 *             updateECD:
 *               summary: Update ECD
 *               value:
 *                 ecd: "2026-12-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Event updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.put("/:id", updateEvent);

/**
 * @openapi
 * /api/events/{id}:
 *   delete:
 *     tags:
 *       - Events
 *     summary: Delete an event
 *     description: Deletes an event and automatically reorders the priorities of remaining events
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the event
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", deleteEvent);

module.exports = router;
