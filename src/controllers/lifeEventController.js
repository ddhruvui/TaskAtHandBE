const {
  LifeEvent,
  parseLifeEventDate,
  baselineLastAddedYear,
  MAX_DAYS_BY_MONTH,
} = require("../models/LifeEvent");

/**
 * Validate a life-event date string ("D/M", no zero-padding, no year — the
 * event recurs annually). Feb 29 is allowed; the cron clamps it to Feb 28 in
 * non-leap years, same as `day_of_year` ECDs.
 * Returns the trimmed date or throws a validation Error.
 */
function validateDate(date) {
  if (typeof date !== "string" || !/^\d{1,2}\/\d{1,2}$/.test(date.trim())) {
    throw new Error('Life event date must be a "D/M" string, e.g. "7/3"');
  }
  const trimmed = date.trim();
  const { day, month } = parseLifeEventDate(trimmed);
  if (month < 1 || month > 12) {
    throw new Error("Life event month must be between 1 and 12");
  }
  if (day < 1 || day > MAX_DAYS_BY_MONTH[month - 1]) {
    throw new Error(
      `Life event day must be between 1 and ${MAX_DAYS_BY_MONTH[month - 1]} for month ${month}`,
    );
  }
  return trimmed;
}

/** Today as a UTC-midnight Date, for lastAddedYear baselines. */
function utcToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/**
 * GET /lifeevents
 * Returns all life events sorted by priority ascending
 */
const getAllLifeEvents = async (req, res) => {
  try {
    const lifeEvents = await LifeEvent.findAll();
    res.json(lifeEvents);
  } catch (error) {
    console.error("Error fetching life events:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch life events", message: error.message });
  }
};

/**
 * POST /lifeevents
 * Creates a new life event (e.g. "Wife's birthday" on "7/3") that the cron
 * adds to the todo every year on its day. Priority is auto-assigned
 * (appended at end); `lastAddedYear` is server-managed — it records the last
 * occurrence already consumed, so a still-upcoming date fires this year and
 * an already-passed one waits for the next anniversary.
 */
const createLifeEvent = async (req, res) => {
  try {
    const { name, date } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Life event name must be a non-empty string" });
    }

    let validDate;
    try {
      validDate = validateDate(date);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const lifeEvent = await LifeEvent.create({
      name: name.trim(),
      date: validDate,
      lastAddedYear: baselineLastAddedYear(validDate, utcToday()),
    });
    res.status(201).json(lifeEvent);
  } catch (error) {
    console.error("Error creating life event:", error);
    res
      .status(500)
      .json({ error: "Failed to create life event", message: error.message });
  }
};

/**
 * PUT /lifeevents/:id
 * Updates a life event's name, date, done state, todo link and/or priority.
 * A date change re-baselines `lastAddedYear` so the new date fires on its
 * next occurrence. Priority changes shift the other life events to keep
 * contiguous 0..n-1 order, same as projects.
 */
const updateLifeEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, done, todoTaskId, priority } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Life event name must be a non-empty string" });
    }

    if (done !== undefined && typeof done !== "boolean") {
      return res.status(400).json({ error: "done must be a boolean" });
    }

    if (
      todoTaskId !== undefined &&
      todoTaskId !== null &&
      typeof todoTaskId !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "todoTaskId must be a string or null" });
    }

    if (
      priority !== undefined &&
      (!Number.isInteger(priority) || priority < 0)
    ) {
      return res
        .status(400)
        .json({ error: "Priority must be a non-negative integer" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (done !== undefined) updates.done = done;
    if (todoTaskId !== undefined) updates.todoTaskId = todoTaskId;
    if (priority !== undefined) updates.priority = priority;
    if (date !== undefined) {
      try {
        updates.date = validateDate(date);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
      // Re-baseline only on a real change — a no-op date write must not make
      // an occurrence the cron already consumed look upcoming again.
      const current = await LifeEvent.findById(id);
      if (!current) {
        return res.status(404).json({ error: "Life event not found" });
      }
      if (current.date !== updates.date) {
        updates.lastAddedYear = baselineLastAddedYear(
          updates.date,
          utcToday(),
        );
      }
    }

    const updated = await LifeEvent.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Life event not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating life event:", error);
    if (error.message.startsWith("Priority must be")) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to update life event", message: error.message });
  }
};

/**
 * DELETE /lifeevents/:id
 * Deletes a life event (and shifts remaining life event priorities). The
 * todo task created from it this year (if any) is kept.
 */
const deleteLifeEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await LifeEvent.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Life event not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting life event:", error);
    res
      .status(500)
      .json({ error: "Failed to delete life event", message: error.message });
  }
};

module.exports = {
  getAllLifeEvents,
  createLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
};
