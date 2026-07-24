const express = require("express");
const router = express.Router();
const {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
} = require("../controllers/projectController");

/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: Get all long-term projects
 *     description: Returns all projects sorted by priority ascending
 *     responses:
 *       200:
 *         description: Array of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
router.get("/", getAllProjects);

/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new long-term project
 *     description: A long-term project (e.g. "Automated Stock Market") is an ordered list of tasks/steps (e.g. "get data from EODHD"). Giving a task a date mirrors it into the todo under a header named after the project (client-driven); when the todo task is done and the nightly cron deletes it, the project task is marked done and kept for the record. Tasks default to an empty list; priority is auto-assigned (appended at end). Undone tasks always sort before done tasks.
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
 *                 example: "Automated Stock Market"
 *               tasks:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ProjectTask'
 *                 example: [{ "name": "get data from EODHD", "date": "2026-08-01", "done": false, "todoTaskId": null }, { "name": "get data from Nasdaq", "date": null, "done": false, "todoTaskId": null }]
 *     responses:
 *       201:
 *         description: Created project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error
 */
router.post("/", createProject);

/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     tags: [Projects]
 *     summary: Update a long-term project
 *     description: Tasks are replaced wholesale — send the full list to add, rename, reorder, remove or change the date/done state of tasks (the server re-sorts so done tasks sit at the bottom). Priority changes shift the other projects to keep contiguous 0..n-1 order, same as headers.
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
 *                   $ref: '#/components/schemas/ProjectTask'
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated project
 *       400:
 *         description: Validation error
 *       404:
 *         description: Project not found
 */
router.put("/:id", updateProject);

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete a long-term project
 *     description: Deletes the project and shifts remaining project priorities. Tasks already added to the todo from its dated tasks are untouched.
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
 *         description: Project not found
 */
router.delete("/:id", deleteProject);

module.exports = router;
