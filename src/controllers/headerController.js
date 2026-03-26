const Header = require("../models/Header");
const { Task } = require("../models/Task");

/**
 * GET /headers
 * Returns all headers sorted by priority ascending
 */
const getAllHeaders = async (req, res) => {
  try {
    const headers = await Header.findAll();
    res.json(headers);
  } catch (error) {
    console.error("Error fetching headers:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch headers", message: error.message });
  }
};

/**
 * POST /headers
 * Creates a new header (priority auto-assigned as total headers count)
 */
const createHeader = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Header name must be a non-empty string" });
    }

    const header = await Header.create({ name: name.trim() });
    res.status(201).json(header);
  } catch (error) {
    console.error("Error creating header:", error);
    res
      .status(500)
      .json({ error: "Failed to create header", message: error.message });
  }
};

/**
 * PUT /headers/:id
 * Updates a header's name and/or priority
 */
const updateHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, priority } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Header name must be a non-empty string" });
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
    if (priority !== undefined) updates.priority = priority;

    const updated = await Header.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Header not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating header:", error);
    if (error.message.startsWith("Priority must be")) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to update header", message: error.message });
  }
};

/**
 * DELETE /headers/:id
 * Deletes a header and all its tasks. Shifts remaining header priorities.
 */
const deleteHeader = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete all tasks for this header first
    const tasksDeleted = await Task.deleteByHeader(id);

    const deleted = await Header.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Header not found" });
    }

    res.json({ deleted: id, tasksDeleted });
  } catch (error) {
    console.error("Error deleting header:", error);
    res
      .status(500)
      .json({ error: "Failed to delete header", message: error.message });
  }
};

module.exports = { getAllHeaders, createHeader, updateHeader, deleteHeader };
