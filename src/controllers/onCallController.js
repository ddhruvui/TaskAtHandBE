const OnCall = require("../models/OnCall");
const { utcDayString, utcToday } = require("../utils/dates");
const {
  SHIFT_TYPES,
  startMinutes,
  endMinutes,
  shiftMinutes,
  oldestKeptDate,
} = require("../utils/oncall");
const { route, requireFound } = require("../utils/http");
const {
  ValidationError,
  requiredDateString,
  optionalDateString,
  optionalText,
  oneOf,
  definedFields,
} = require("../utils/validate");

const TYPE_MESSAGE = 'type must be "primary" or "secondary"';

/** The oldest shift date the API keeps or accepts: yesterday, UTC. */
function oldestDate() {
  return oldestKeptDate(utcDayString(utcToday()));
}

/** "HH:mm" (00:00–23:59) start time, when present. */
function optionalStart(value) {
  if (value === undefined) return undefined;
  if (startMinutes(value) === null) {
    throw new ValidationError("start must be an HH:mm time (00:00–23:59)");
  }
  return value;
}

/** "HH:mm" end time — "24:00" allowed — when present. */
function optionalEnd(value) {
  if (value === undefined) return undefined;
  if (endMinutes(value) === null) {
    throw new ValidationError("end must be an HH:mm time (00:00–24:00)");
  }
  return value;
}

function optionalType(value) {
  if (value === undefined) return undefined;
  return oneOf(value, SHIFT_TYPES, TYPE_MESSAGE);
}

/**
 * The rules a whole shift must satisfy — checked against the shift the row
 * would end up as, not only the fields a PUT sent.
 * @param {{date: string, start: string, end: string}} shift
 * @param {string} [excludeId]  The row being edited
 */
async function assertValidShift(shift, excludeId) {
  if (shift.date < oldestDate()) {
    throw new ValidationError(
      "date is in the past — ended shifts are not kept",
    );
  }
  if (shiftMinutes(shift) === 0) {
    throw new ValidationError("start and end must differ");
  }
  const clashes = await OnCall.overlapping(shift, excludeId);
  if (clashes.length > 0) {
    const c = clashes[0];
    throw new ValidationError(
      `Shift overlaps an existing one (${c.date} ${c.start}–${c.end})`,
    );
  }
}

/**
 * GET /oncall
 * Shifts dated yesterday or later, chronological. Yesterday is included
 * because an overnight shift that started then may still be running; the
 * clients hide a shift once its end has passed on their own clock.
 */
const getAllOnCall = route(
  { action: "fetching on-call shifts", failure: "Failed to fetch on-call shifts" },
  async (req, res) => {
    res.json(await OnCall.findFrom(oldestDate()));
  },
);

/**
 * POST /oncall
 * Add a shift. `type` defaults to "primary".
 */
const createOnCall = route(
  { action: "creating on-call shift", failure: "Failed to create on-call shift" },
  async (req, res) => {
    const date = requiredDateString(req.body.date, "date");
    const start = optionalStart(req.body.start);
    const end = optionalEnd(req.body.end);
    if (start === undefined) throw new ValidationError("start is required");
    if (end === undefined) throw new ValidationError("end is required");
    const type = optionalType(req.body.type) || "primary";
    const note = optionalText(req.body.note, "note");

    await assertValidShift({ date, start, end });

    res.status(201).json(await OnCall.create({ date, start, end, type, note }));
  },
);

/**
 * PUT /oncall/:id
 * Partial update; the resulting shift is re-validated as a whole.
 */
const updateOnCall = route(
  { action: "updating on-call shift", failure: "Failed to update on-call shift" },
  async (req, res) => {
    const { id } = req.params;
    const current = requireFound(
      await OnCall.findById(id).catch(() => null),
      "On-call shift not found",
    );

    const updates = definedFields({
      date: optionalDateString(req.body.date, "date"),
      start: optionalStart(req.body.start),
      end: optionalEnd(req.body.end),
      type: optionalType(req.body.type),
      note: optionalText(req.body.note, "note"),
    });

    await assertValidShift({ ...current, ...updates }, id);

    const updated = await OnCall.update(id, updates);
    res.json(requireFound(updated, "On-call shift not found"));
  },
);

/**
 * DELETE /oncall/:id
 */
const deleteOnCall = route(
  { action: "deleting on-call shift", failure: "Failed to delete on-call shift" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(
      await OnCall.delete(id).catch(() => null),
      "On-call shift not found",
    );
    res.json({ deleted: id });
  },
);

module.exports = { getAllOnCall, createOnCall, updateOnCall, deleteOnCall };
