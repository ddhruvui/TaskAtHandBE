const Affirmation = require("../models/Affirmation");

/**
 * GET /affirmations
 * Returns all affirmations sorted by createdAt ascending (order added)
 */
const getAllAffirmations = async (req, res) => {
  try {
    const affirmations = await Affirmation.findAll();
    res.json(affirmations);
  } catch (error) {
    console.error("Error fetching affirmations:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch affirmations", message: error.message });
  }
};

/**
 * POST /affirmations
 * Creates a new affirmation with a name
 */
const createAffirmation = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Affirmation name must be a non-empty string" });
    }

    const affirmation = await Affirmation.create({ name: name.trim() });
    res.status(201).json(affirmation);
  } catch (error) {
    console.error("Error creating affirmation:", error);
    res
      .status(500)
      .json({ error: "Failed to create affirmation", message: error.message });
  }
};

/**
 * PUT /affirmations/:id
 * Updates an affirmation's name
 */
const updateAffirmation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Affirmation name must be a non-empty string" });
    }

    const updated = await Affirmation.update(id, { name: name.trim() });

    if (!updated) {
      return res.status(404).json({ error: "Affirmation not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating affirmation:", error);
    res
      .status(500)
      .json({ error: "Failed to update affirmation", message: error.message });
  }
};

/**
 * DELETE /affirmations/:id
 * Deletes an affirmation
 */
const deleteAffirmation = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Affirmation.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Affirmation not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting affirmation:", error);
    res
      .status(500)
      .json({ error: "Failed to delete affirmation", message: error.message });
  }
};

module.exports = {
  getAllAffirmations,
  createAffirmation,
  updateAffirmation,
  deleteAffirmation,
};
