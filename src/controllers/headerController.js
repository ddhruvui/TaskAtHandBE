const Header = require("../models/Header");
const { Task } = require("../models/Task");
const {
  applyProjectHeaderOrder,
  isValidObjectId,
} = require("../services/headerOrder");
const {
  route,
  requireFound,
  isPriorityRangeError,
} = require("../utils/http");
const {
  ValidationError,
  requiredString,
  optionalString,
  optionalPriority,
  definedFields,
} = require("../utils/validate");

/**
 * GET /headers
 * Returns all headers sorted by priority ascending
 */
const getAllHeaders = route(
  { action: "fetching headers", failure: "Failed to fetch headers" },
  async (req, res) => {
    res.json(await Header.findAll());
  },
);

/**
 * POST /headers
 * Creates a new header (priority auto-assigned as total headers count)
 */
const createHeader = route(
  { action: "creating header", failure: "Failed to create header" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Header name");
    const { projectId } = req.body;

    if (
      projectId !== undefined &&
      projectId !== null &&
      !isValidObjectId(projectId)
    ) {
      throw new ValidationError("projectId must be a valid id string or null");
    }

    const { header, created } = await Header.create({
      name,
      projectId: projectId || null,
    });

    // A project header belongs in the projects' priority order, not at the
    // bottom where a plain create leaves it.
    if (header.projectId) {
      await applyProjectHeaderOrder();
      const placed = await Header.findById(header._id.toString());
      return res.status(created ? 201 : 200).json(placed || header);
    }

    res.status(201).json(header);
  },
);

/**
 * PUT /headers/:id
 * Updates a header's name and/or priority
 */
const updateHeader = route(
  {
    action: "updating header",
    failure: "Failed to update header",
    badRequest: [isPriorityRangeError],
  },
  async (req, res) => {
    const updates = definedFields({
      name: optionalString(req.body.name, "Header name"),
      priority: optionalPriority(req.body.priority),
    });

    const updated = await Header.update(req.params.id, updates);
    res.json(requireFound(updated, "Header not found"));
  },
);

/**
 * DELETE /headers/:id
 * Deletes a header and all its tasks. Shifts remaining header priorities.
 */
const deleteHeader = route(
  { action: "deleting header", failure: "Failed to delete header" },
  async (req, res) => {
    const { id } = req.params;

    // Delete all tasks for this header first
    const tasksDeleted = await Task.deleteByHeader(id);
    requireFound(await Header.delete(id), "Header not found");

    res.json({ deleted: id, tasksDeleted });
  },
);

module.exports = { getAllHeaders, createHeader, updateHeader, deleteHeader };
