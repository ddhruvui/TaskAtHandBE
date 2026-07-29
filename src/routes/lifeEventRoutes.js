const express = require("express");
const router = express.Router();
const {
  getAllLifeEvents,
  createLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
} = require("../controllers/lifeEventController");

/**
 * @openapi
 * /lifeevents:
 *   get:
 *     tags: [LifeEvents]
 *     summary: Get all life events
 *     description: Returns all life events sorted by priority ascending
 *     responses:
 *       200:
 *         description: Array of life events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LifeEvent'
 */
router.get("/", getAllLifeEvents);

/**
 * @openapi
 * /lifeevents:
 *   post:
 *     tags: [LifeEvents]
 *     summary: Create a new life event
 *     description: A life event (e.g. "Wife's birthday" on "7/3") recurs annually. Every year on its day the nightly cron adds a one-time date task named after it to the todo under an "Events" header (reused case-insensitively, created otherwise) and links it via todoTaskId. When that todo task is done and the next cron run deletes it, the life event is marked done and kept — it fires again on its next anniversary. Priority is auto-assigned (appended at end); lastAddedYear is server-managed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, date]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Wife's birthday"
 *               date:
 *                 type: string
 *                 description: '"D/M" (no zero-padding, no year). Feb 29 is allowed and clamps to Feb 28 in non-leap years.'
 *                 example: "7/3"
 *     responses:
 *       201:
 *         description: Created life event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LifeEvent'
 *       400:
 *         description: Validation error
 */
router.post("/", createLifeEvent);

/**
 * @openapi
 * /lifeevents/{id}:
 *   put:
 *     tags: [LifeEvents]
 *     summary: Update a life event
 *     description: Updates name, date, done state, todo link and/or priority. A date change re-baselines lastAddedYear so the new date fires on its next occurrence. Priority changes shift the other life events to keep contiguous 0..n-1 order. Clients toggle done here when the linked todo task is toggled (and vice versa) so the two views agree.
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
 *               date:
 *                 type: string
 *                 example: "7/3"
 *               done:
 *                 type: boolean
 *               todoTaskId:
 *                 type: string
 *                 nullable: true
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated life event
 *       400:
 *         description: Validation error
 *       404:
 *         description: Life event not found
 */
router.put("/:id", updateLifeEvent);

/**
 * @openapi
 * /lifeevents/{id}:
 *   delete:
 *     tags: [LifeEvents]
 *     summary: Delete a life event
 *     description: Deletes the life event and shifts remaining life event priorities. The todo task created from it this year (if any) is kept.
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
 *         description: Life event not found
 */
router.delete("/:id", deleteLifeEvent);

module.exports = router;
