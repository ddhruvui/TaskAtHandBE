const Dream = require("../models/Dream");

/**
 * Get all dreams
 * @route GET /api/dreams
 */
const getAllDreams = async (req, res) => {
  try {
    const dreams = await Dream.findAll();
    res.json({
      success: true,
      count: dreams.length,
      data: dreams,
    });
  } catch (error) {
    console.error("Error fetching dreams:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dreams",
      message: error.message,
    });
  }
};

/**
 * Get a single dream by ID
 * @route GET /api/dreams/:id
 */
const getDreamById = async (req, res) => {
  try {
    const dream = await Dream.findById(req.params.id);

    if (!dream) {
      return res.status(404).json({
        success: false,
        error: "Dream not found",
      });
    }

    res.json({
      success: true,
      data: dream,
    });
  } catch (error) {
    console.error("Error fetching dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dream",
      message: error.message,
    });
  }
};

/**
 * Create a new dream
 * @route POST /api/dreams
 */
const createDream = async (req, res) => {
  try {
    const { name, notes, done, ecd } = req.body;

    // Validation for name - must be a non-empty string
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Dream name must be a non-empty string",
      });
    }

    // Convert and validate done field
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

    const dreamData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecd: ecd || null,
    };

    const newDream = await Dream.create(dreamData);

    res.status(201).json({
      success: true,
      data: newDream,
      message: "Dream created successfully",
    });
  } catch (error) {
    console.error("Error creating dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create dream",
      message: error.message,
    });
  }
};

/**
 * Update a dream
 * @route PUT /api/dreams/:id
 */
const updateDream = async (req, res) => {
  try {
    const { name, notes, priority, done } = req.body;
    const updateData = {};

    // Only include fields that are provided
    if (name !== undefined) updateData.name = name.trim();
    if (notes !== undefined) updateData.notes = notes;
    if (priority !== undefined) {
      // Validate priority is a non-negative integer
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

    // Validate at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    const updatedDream = await Dream.update(req.params.id, updateData);

    if (!updatedDream) {
      return res.status(404).json({
        success: false,
        error: "Dream not found",
      });
    }

    res.json({
      success: true,
      data: updatedDream,
      message: "Dream updated successfully",
    });
  } catch (error) {
    console.error("Error updating dream:", error);

    // Handle specific errors
    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update dream",
      message: error.message,
    });
  }
};

/**
 * Delete a dream
 * @route DELETE /api/dreams/:id
 */
const deleteDream = async (req, res) => {
  try {
    const success = await Dream.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Dream not found",
      });
    }

    res.json({
      success: true,
      message: "Dream deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete dream",
      message: error.message,
    });
  }
};

/**
 * Get dream count
 * @route GET /api/dreams/count
 */
const getDreamCount = async (req, res) => {
  try {
    const count = await Dream.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting dream count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get dream count",
      message: error.message,
    });
  }
};

/**
 * Delete all done dreams (for cron job)
 * @route DELETE /api/dreams/chron
 */
const deleteAllDoneDreams = async (req, res) => {
  try {
    const result = await Dream.deleteAllDone();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      movedCount: result.movedCount,
      message: `Successfully deleted ${result.deletedCount} done dream(s) and moved ${result.movedCount} overdue dream(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error deleting done dreams:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete done dreams",
      message: error.message,
    });
  }
};

module.exports = {
  getAllDreams,
  getDreamById,
  createDream,
  updateDream,
  deleteDream,
  getDreamCount,
  deleteAllDoneDreams,
};
