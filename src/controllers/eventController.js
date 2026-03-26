const Event = require("../models/Event");

/**
 * Get all events
 * @route GET /api/events
 */
const getAllEvents = async (req, res) => {
  try {
    const events = await Event.findAll();
    res.json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch events",
      message: error.message,
    });
  }
};

/**
 * Get a single event by ID
 * @route GET /api/events/:id
 */
const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch event",
      message: error.message,
    });
  }
};

/**
 * Create a new event
 * @route POST /api/events
 */
const createEvent = async (req, res) => {
  try {
    const { name, notes, done, ecd } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Event name must be a non-empty string",
      });
    }

    let doneValue = false;
    if (done !== undefined && done !== null) {
      if (typeof done === "boolean") {
        doneValue = done;
      } else if (typeof done === "string") {
        doneValue = done.toLowerCase() === "true";
      } else if (typeof done === "number") {
        doneValue = done !== 0;
      } else {
        doneValue = Boolean(done);
      }
    }

    const eventData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecd: ecd || null,
    };

    const newEvent = await Event.create(eventData);

    res.status(201).json({
      success: true,
      data: newEvent,
      message: "Event created successfully",
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create event",
      message: error.message,
    });
  }
};

/**
 * Update an event
 * @route PUT /api/events/:id
 */
const updateEvent = async (req, res) => {
  try {
    const { name, notes, priority, done, ecd } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name.trim();
    if (notes !== undefined) updateData.notes = notes;
    if (ecd !== undefined) updateData.ecd = ecd ? new Date(ecd) : null;
    if (priority !== undefined) {
      const priorityNum = parseInt(priority);
      if (isNaN(priorityNum) || priorityNum < 0) {
        return res.status(400).json({
          success: false,
          error: "Priority must be a non-negative integer",
        });
      }
      updateData.priority = priorityNum;
    }
    if (done !== undefined) updateData.done = done;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    const updatedEvent = await Event.update(req.params.id, updateData);

    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    res.json({
      success: true,
      data: updatedEvent,
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Error updating event:", error);

    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (
      error.message.includes("Not done task cannot have priority") ||
      error.message.includes("Done task cannot have priority less than")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update event",
      message: error.message,
    });
  }
};

/**
 * Delete an event
 * @route DELETE /api/events/:id
 */
const deleteEvent = async (req, res) => {
  try {
    const success = await Event.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    res.json({
      success: true,
      message: "Event deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete event",
      message: error.message,
    });
  }
};

/**
 * Get event count
 * @route GET /api/events/count
 */
const getEventCount = async (req, res) => {
  try {
    const count = await Event.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting event count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get event count",
      message: error.message,
    });
  }
};

/**
 * Chron action: uncheck events with ecd this week and move them to lowest priority.
 * Does NOT delete any events.
 * @route DELETE /api/events/chron
 */
const chronEvents = async (req, res) => {
  try {
    const result = await Event.chronAction();
    res.json({
      success: true,
      markedUndoneCount: result.markedUndoneCount,
      movedCount: result.movedCount,
      message: `Successfully unchecked ${result.markedUndoneCount} event(s) due this week and moved ${result.movedCount} event(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error running event chron:", error);
    res.status(500).json({
      success: false,
      error: "Failed to run event chron",
      message: error.message,
    });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventCount,
  chronEvents,
};
