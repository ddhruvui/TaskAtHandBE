const Call = require("../models/Call");
const { route, requireFound } = require("../utils/http");
const {
  requiredString,
  optionalString,
  optionalBoolean,
  oneOf,
  definedFields,
} = require("../utils/validate");

const VALID_FREQUENCIES = ["biweekly", "monthly"];
const FREQUENCY_MESSAGE = 'Call frequency must be "biweekly" or "monthly"';

/** A call cadence, when the field is present. */
function optionalFrequency(value) {
  if (value === undefined) return undefined;
  return oneOf(value, VALID_FREQUENCIES, FREQUENCY_MESSAGE);
}

/**
 * GET /calls
 * Returns all calls sorted by createdAt ascending (order added)
 */
const getAllCalls = route(
  { action: "fetching calls", failure: "Failed to fetch calls" },
  async (req, res) => {
    res.json(await Call.findAll());
  },
);

/**
 * POST /calls
 * Creates a new call with a name and frequency ("biweekly" | "monthly")
 */
const createCall = route(
  { action: "creating call", failure: "Failed to create call" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Call name");
    const frequency = oneOf(
      req.body.frequency,
      VALID_FREQUENCIES,
      FREQUENCY_MESSAGE,
    );
    res.status(201).json(await Call.create({ name, frequency }));
  },
);

/**
 * PUT /calls/:id
 * Updates a call's name, frequency, and/or done state
 */
const updateCall = route(
  { action: "updating call", failure: "Failed to update call" },
  async (req, res) => {
    const updates = definedFields({
      name: optionalString(req.body.name, "Call name"),
      frequency: optionalFrequency(req.body.frequency),
      done: optionalBoolean(req.body.done, "Call done"),
    });

    const updated = await Call.update(req.params.id, updates);
    res.json(requireFound(updated, "Call not found"));
  },
);

/**
 * DELETE /calls/:id
 * Deletes a call
 */
const deleteCall = route(
  { action: "deleting call", failure: "Failed to delete call" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Call.delete(id), "Call not found");
    res.json({ deleted: id });
  },
);

module.exports = { getAllCalls, createCall, updateCall, deleteCall };
