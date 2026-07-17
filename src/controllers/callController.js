const Call = require("../models/Call");

const VALID_FREQUENCIES = ["biweekly", "monthly"];

/**
 * GET /calls
 * Returns all calls sorted by createdAt ascending (order added)
 */
const getAllCalls = async (req, res) => {
  try {
    const calls = await Call.findAll();
    res.json(calls);
  } catch (error) {
    console.error("Error fetching calls:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch calls", message: error.message });
  }
};

/**
 * POST /calls
 * Creates a new call with a name and frequency ("biweekly" | "monthly")
 */
const createCall = async (req, res) => {
  try {
    const { name, frequency } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Call name must be a non-empty string" });
    }

    if (!VALID_FREQUENCIES.includes(frequency)) {
      return res
        .status(400)
        .json({ error: 'Call frequency must be "biweekly" or "monthly"' });
    }

    const call = await Call.create({ name: name.trim(), frequency });
    res.status(201).json(call);
  } catch (error) {
    console.error("Error creating call:", error);
    res
      .status(500)
      .json({ error: "Failed to create call", message: error.message });
  }
};

/**
 * PUT /calls/:id
 * Updates a call's name, frequency, and/or done state
 */
const updateCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, frequency, done } = req.body;

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return res
          .status(400)
          .json({ error: "Call name must be a non-empty string" });
      }
      updates.name = name.trim();
    }

    if (frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(frequency)) {
        return res
          .status(400)
          .json({ error: 'Call frequency must be "biweekly" or "monthly"' });
      }
      updates.frequency = frequency;
    }

    if (done !== undefined) {
      if (typeof done !== "boolean") {
        return res.status(400).json({ error: "Call done must be a boolean" });
      }
      updates.done = done;
    }

    const updated = await Call.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Call not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating call:", error);
    res
      .status(500)
      .json({ error: "Failed to update call", message: error.message });
  }
};

/**
 * DELETE /calls/:id
 * Deletes a call
 */
const deleteCall = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Call.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Call not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting call:", error);
    res
      .status(500)
      .json({ error: "Failed to delete call", message: error.message });
  }
};

module.exports = {
  getAllCalls,
  createCall,
  updateCall,
  deleteCall,
};
