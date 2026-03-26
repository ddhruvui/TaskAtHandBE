const WorkOnDream = require("../models/WorkOnDream");

/**
 * Get all work on dreams
 * @route GET /api/workondreams
 */
const getAllWorkOnDreams = async (req, res) => {
  try {
    const workOnDreams = await WorkOnDream.findAll();
    res.json({
      success: true,
      count: workOnDreams.length,
      data: workOnDreams,
    });
  } catch (error) {
    console.error("Error fetching work on dreams:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch work on dreams",
      message: error.message,
    });
  }
};

/**
 * Get a single work on dream by ID
 * @route GET /api/workondreams/:id
 */
const getWorkOnDreamById = async (req, res) => {
  try {
    const workOnDream = await WorkOnDream.findById(req.params.id);

    if (!workOnDream) {
      return res.status(404).json({
        success: false,
        error: "Work on dream not found",
      });
    }

    res.json({
      success: true,
      data: workOnDream,
    });
  } catch (error) {
    console.error("Error fetching work on dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch work on dream",
      message: error.message,
    });
  }
};

/**
 * Create a new work on dream
 * @route POST /api/workondreams
 */
const createWorkOnDream = async (req, res) => {
  try {
    const { name, notes, done, ecd } = req.body;

    // Validation for name - must be a non-empty string
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Work on dream name must be a non-empty string",
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

    const workOnDreamData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecd: ecd || null,
    };

    const newWorkOnDream = await WorkOnDream.create(workOnDreamData);

    res.status(201).json({
      success: true,
      data: newWorkOnDream,
      message: "Work on dream created successfully",
    });
  } catch (error) {
    console.error("Error creating work on dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create work on dream",
      message: error.message,
    });
  }
};

/**
 * Update a work on dream
 * @route PUT /api/workondreams/:id
 */
const updateWorkOnDream = async (req, res) => {
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

    const updatedWorkOnDream = await WorkOnDream.update(
      req.params.id,
      updateData,
    );

    if (!updatedWorkOnDream) {
      return res.status(404).json({
        success: false,
        error: "Work on dream not found",
      });
    }

    res.json({
      success: true,
      data: updatedWorkOnDream,
      message: "Work on dream updated successfully",
    });
  } catch (error) {
    console.error("Error updating work on dream:", error);

    // Handle specific errors
    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (
      error.message.includes("Not done task cannot have priority") ||
      error.message.includes("Done task cannot have priority less than")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update work on dream",
      message: error.message,
    });
  }
};

/**
 * Delete a work on dream
 * @route DELETE /api/workondreams/:id
 */
const deleteWorkOnDream = async (req, res) => {
  try {
    const success = await WorkOnDream.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Work on dream not found",
      });
    }

    res.json({
      success: true,
      message: "Work on dream deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting work on dream:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete work on dream",
      message: error.message,
    });
  }
};

/**
 * Get work on dream count
 * @route GET /api/workondreams/count
 */
const getWorkOnDreamCount = async (req, res) => {
  try {
    const count = await WorkOnDream.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting work on dream count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get work on dream count",
      message: error.message,
    });
  }
};

/**
 * Delete all done work on dreams (for cron job)
 * @route DELETE /api/workondreams/chron
 */
const deleteAllDoneWorkOnDreams = async (req, res) => {
  try {
    const result = await WorkOnDream.deleteAllDone();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      movedCount: result.movedCount,
      message: `Successfully deleted ${result.deletedCount} done work on dream(s) and moved ${result.movedCount} overdue work on dream(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error deleting done work on dreams:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete done work on dreams",
      message: error.message,
    });
  }
};

module.exports = {
  getAllWorkOnDreams,
  getWorkOnDreamById,
  createWorkOnDream,
  updateWorkOnDream,
  deleteWorkOnDream,
  getWorkOnDreamCount,
  deleteAllDoneWorkOnDreams,
};
