const Event = require("../models/Event");

/**
 * Validate and normalize an event task list.
 * Returns the trimmed task names or throws a validation Error.
 */
function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("tasks must be a non-empty array of strings");
  }
  const trimmed = tasks.map((t) => {
    if (typeof t !== "string" || t.trim() === "") {
      throw new Error("Each task must be a non-empty string");
    }
    return t.trim();
  });
  return trimmed;
}

/**
 * GET /events
 * Returns all event templates sorted by name ascending
 */
const getAllEvents = async (req, res) => {
  try {
    const events = await Event.findAll();
    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch events", message: error.message });
  }
};

/**
 * POST /events
 * Creates a new event template with a name and a list of task names
 */
const createEvent = async (req, res) => {
  try {
    const { name, tasks } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Event name must be a non-empty string" });
    }

    let trimmedTasks;
    try {
      trimmedTasks = validateTasks(tasks);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const event = await Event.create({
      name: name.trim(),
      tasks: trimmedTasks,
    });
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res
      .status(500)
      .json({ error: "Failed to create event", message: error.message });
  }
};

/**
 * PUT /events/:id
 * Updates an event's name and/or task list
 */
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tasks } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Event name must be a non-empty string" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (tasks !== undefined) {
      try {
        updates.tasks = validateTasks(tasks);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    }

    const updated = await Event.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating event:", error);
    res
      .status(500)
      .json({ error: "Failed to update event", message: error.message });
  }
};

/**
 * DELETE /events/:id
 * Deletes an event template. Tasks already added to the todo are untouched.
 */
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Event.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting event:", error);
    res
      .status(500)
      .json({ error: "Failed to delete event", message: error.message });
  }
};

module.exports = { getAllEvents, createEvent, updateEvent, deleteEvent };
