const {
  LifeEvent,
  parseLifeEventDate,
  baselineLastAddedYear,
  MAX_DAYS_BY_MONTH,
} = require("../models/LifeEvent");
const { utcToday } = require("../utils/dates");
const {
  route,
  requireFound,
  isPriorityRangeError,
} = require("../utils/http");
const {
  ValidationError,
  requiredString,
  optionalString,
  optionalBoolean,
  optionalPriority,
  optionalStringOrNull,
  definedFields,
} = require("../utils/validate");

/**
 * Validate a life-event date string ("D/M", no zero-padding, no year — the
 * event recurs annually). Feb 29 is allowed; the cron clamps it to Feb 28 in
 * non-leap years, same as `day_of_year` ECDs.
 * Returns the trimmed date or throws a validation Error.
 */
function validateDate(date) {
  if (typeof date !== "string" || !/^\d{1,2}\/\d{1,2}$/.test(date.trim())) {
    throw new ValidationError(
      'Life event date must be a "D/M" string, e.g. "7/3"',
    );
  }
  const trimmed = date.trim();
  const { day, month } = parseLifeEventDate(trimmed);
  if (month < 1 || month > 12) {
    throw new ValidationError("Life event month must be between 1 and 12");
  }
  if (day < 1 || day > MAX_DAYS_BY_MONTH[month - 1]) {
    throw new ValidationError(
      `Life event day must be between 1 and ${MAX_DAYS_BY_MONTH[month - 1]} for month ${month}`,
    );
  }
  return trimmed;
}

/**
 * GET /lifeevents
 * Returns all life events sorted by priority ascending
 */
const getAllLifeEvents = route(
  { action: "fetching life events", failure: "Failed to fetch life events" },
  async (req, res) => {
    res.json(await LifeEvent.findAll());
  },
);

/**
 * POST /lifeevents
 * Creates a new life event (e.g. "Wife's birthday" on "7/3") that the cron
 * adds to the todo every year on its day. Priority is auto-assigned
 * (appended at end); `lastAddedYear` is server-managed — it records the last
 * occurrence already consumed, so a still-upcoming date fires this year and
 * an already-passed one waits for the next anniversary.
 */
const createLifeEvent = route(
  { action: "creating life event", failure: "Failed to create life event" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Life event name");
    const date = validateDate(req.body.date);

    const lifeEvent = await LifeEvent.create({
      name,
      date,
      lastAddedYear: baselineLastAddedYear(date, utcToday()),
    });
    res.status(201).json(lifeEvent);
  },
);

/**
 * PUT /lifeevents/:id
 * Updates a life event's name, date, done state, todo link and/or priority.
 * A date change re-baselines `lastAddedYear` so the new date fires on its
 * next occurrence. Priority changes shift the other life events to keep
 * contiguous 0..n-1 order, same as projects.
 */
const updateLifeEvent = route(
  {
    action: "updating life event",
    failure: "Failed to update life event",
    badRequest: [isPriorityRangeError],
  },
  async (req, res) => {
    const { id } = req.params;
    const { date } = req.body;

    const updates = definedFields({
      name: optionalString(req.body.name, "Life event name"),
      done: optionalBoolean(req.body.done, "done"),
      todoTaskId: optionalStringOrNull(req.body.todoTaskId, "todoTaskId"),
      priority: optionalPriority(req.body.priority),
    });

    if (date !== undefined) {
      updates.date = validateDate(date);

      // Re-baseline only on a real change — a no-op date write must not make
      // an occurrence the cron already consumed look upcoming again.
      const current = requireFound(
        await LifeEvent.findById(id),
        "Life event not found",
      );
      if (current.date !== updates.date) {
        updates.lastAddedYear = baselineLastAddedYear(updates.date, utcToday());
      }
    }

    const updated = await LifeEvent.update(id, updates);
    res.json(requireFound(updated, "Life event not found"));
  },
);

/**
 * DELETE /lifeevents/:id
 * Deletes a life event (and shifts remaining life event priorities). The
 * todo task created from it this year (if any) is kept.
 */
const deleteLifeEvent = route(
  { action: "deleting life event", failure: "Failed to delete life event" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await LifeEvent.delete(id), "Life event not found");
    res.json({ deleted: id });
  },
);

module.exports = {
  getAllLifeEvents,
  createLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
};
