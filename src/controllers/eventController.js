const Event = require("../models/Event");
const { route, requireFound } = require("../utils/http");
const {
  requiredString,
  optionalString,
  requireArray,
  definedFields,
} = require("../utils/validate");

/**
 * Validate and normalize an event task list.
 * Returns the trimmed task names or throws a validation Error.
 */
function validateTasks(tasks) {
  return requireArray(tasks, "tasks must be a non-empty array of strings", {
    nonEmpty: true,
  }).map((task) => requiredString(task, "Each task"));
}

/**
 * GET /events
 * Returns all event templates sorted by name ascending
 */
const getAllEvents = route(
  { action: "fetching events", failure: "Failed to fetch events" },
  async (req, res) => {
    res.json(await Event.findAll());
  },
);

/**
 * POST /events
 * Creates a new event template with a name and a list of task names
 */
const createEvent = route(
  { action: "creating event", failure: "Failed to create event" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Event name");
    const tasks = validateTasks(req.body.tasks);
    res.status(201).json(await Event.create({ name, tasks }));
  },
);

/**
 * PUT /events/:id
 * Updates an event's name and/or task list
 */
const updateEvent = route(
  { action: "updating event", failure: "Failed to update event" },
  async (req, res) => {
    const { tasks } = req.body;
    const updates = definedFields({
      name: optionalString(req.body.name, "Event name"),
      tasks: tasks === undefined ? undefined : validateTasks(tasks),
    });

    const updated = await Event.update(req.params.id, updates);
    res.json(requireFound(updated, "Event not found"));
  },
);

/**
 * DELETE /events/:id
 * Deletes an event template. Tasks already added to the todo are untouched.
 */
const deleteEvent = route(
  { action: "deleting event", failure: "Failed to delete event" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Event.delete(id), "Event not found");
    res.json({ deleted: id });
  },
);

module.exports = { getAllEvents, createEvent, updateEvent, deleteEvent };
