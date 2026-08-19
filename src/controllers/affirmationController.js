const Affirmation = require("../models/Affirmation");
const { route, requireFound } = require("../utils/http");
const { requiredString } = require("../utils/validate");

/**
 * GET /affirmations
 * Returns all affirmations sorted by createdAt ascending (order added)
 */
const getAllAffirmations = route(
  { action: "fetching affirmations", failure: "Failed to fetch affirmations" },
  async (req, res) => {
    res.json(await Affirmation.findAll());
  },
);

/**
 * POST /affirmations
 * Creates a new affirmation with a name
 */
const createAffirmation = route(
  { action: "creating affirmation", failure: "Failed to create affirmation" },
  async (req, res) => {
    const name = requiredString(req.body.name, "Affirmation name");
    res.status(201).json(await Affirmation.create({ name }));
  },
);

/**
 * PUT /affirmations/:id
 * Updates an affirmation's name
 */
const updateAffirmation = route(
  { action: "updating affirmation", failure: "Failed to update affirmation" },
  async (req, res) => {
    // Name is the only field an affirmation has, so it is required here too.
    const name = requiredString(req.body.name, "Affirmation name");
    const updated = await Affirmation.update(req.params.id, { name });
    res.json(requireFound(updated, "Affirmation not found"));
  },
);

/**
 * DELETE /affirmations/:id
 * Deletes an affirmation
 */
const deleteAffirmation = route(
  { action: "deleting affirmation", failure: "Failed to delete affirmation" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Affirmation.delete(id), "Affirmation not found");
    res.json({ deleted: id });
  },
);

module.exports = {
  getAllAffirmations,
  createAffirmation,
  updateAffirmation,
  deleteAffirmation,
};
