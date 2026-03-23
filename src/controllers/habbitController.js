const Habbit = require("../models/Habbit");

/**
 * Get all habbits
 * @route GET /api/habbits
 */
const getAllHabbits = async (req, res) => {
  try {
    const habbits = await Habbit.findAll();
    res.json({
      success: true,
      count: habbits.length,
      data: habbits,
    });
  } catch (error) {
    console.error("Error fetching habbits:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch habbits",
      message: error.message,
    });
  }
};

/**
 * Get a single habbit by ID
 * @route GET /api/habbits/:id
 */
const getHabbitById = async (req, res) => {
  try {
    const habbit = await Habbit.findById(req.params.id);

    if (!habbit) {
      return res.status(404).json({
        success: false,
        error: "Habbit not found",
      });
    }

    res.json({
      success: true,
      data: habbit,
    });
  } catch (error) {
    console.error("Error fetching habbit:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch habbit",
      message: error.message,
    });
  }
};

/**
 * Create a new habbit
 * @route POST /api/habbits
 */
const createHabbit = async (req, res) => {
  try {
    const { name, notes, done, ecdDayOfWeek, ecdDayOfMonth } = req.body;

    // Validation for name - must be a non-empty string
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Habbit name must be a non-empty string",
      });
    }

    // Validation for ecd - exactly one of ecdDayOfWeek or ecdDayOfMonth must be provided
    const hasWeek = ecdDayOfWeek !== undefined && ecdDayOfWeek !== null;
    const hasMonth = ecdDayOfMonth !== undefined && ecdDayOfMonth !== null;

    if (!hasWeek && !hasMonth) {
      return res.status(400).json({
        success: false,
        error:
          "ECD is required. Provide either ecdDayOfWeek (1-7) or ecdDayOfMonth (1-31)",
      });
    }

    if (hasWeek && hasMonth) {
      return res.status(400).json({
        success: false,
        error: "Provide only one of ecdDayOfWeek or ecdDayOfMonth, not both",
      });
    }

    let ecdDayOfWeekNum = null;
    let ecdDayOfMonthNum = null;

    if (hasWeek) {
      ecdDayOfWeekNum = parseInt(ecdDayOfWeek);
      if (
        isNaN(ecdDayOfWeekNum) ||
        ecdDayOfWeekNum < 1 ||
        ecdDayOfWeekNum > 7
      ) {
        return res.status(400).json({
          success: false,
          error:
            "ECD must be a valid ecdDayOfWeek (1-7, where 1=Monday and 7=Sunday)",
        });
      }
    }

    if (hasMonth) {
      ecdDayOfMonthNum = parseInt(ecdDayOfMonth);
      if (
        isNaN(ecdDayOfMonthNum) ||
        ecdDayOfMonthNum < 1 ||
        ecdDayOfMonthNum > 31
      ) {
        return res.status(400).json({
          success: false,
          error: "ECD must be a valid ecdDayOfMonth (1-31)",
        });
      }
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

    const habbitData = {
      name: name.trim(),
      notes: notes || "",
      done: doneValue,
      ecdDayOfWeek: ecdDayOfWeekNum,
      ecdDayOfMonth: ecdDayOfMonthNum,
    };

    const newHabbit = await Habbit.create(habbitData);

    res.status(201).json({
      success: true,
      data: newHabbit,
      message: "Habbit created successfully",
    });
  } catch (error) {
    console.error("Error creating habbit:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create habbit",
      message: error.message,
    });
  }
};

/**
 * Update a habbit
 * @route PUT /api/habbits/:id
 */
const updateHabbit = async (req, res) => {
  try {
    const { name, notes, priority, done, ecdDayOfWeek, ecdDayOfMonth } =
      req.body;
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
    if (ecdDayOfWeek !== undefined) {
      const num = parseInt(ecdDayOfWeek);
      if (isNaN(num) || num < 1 || num > 7) {
        return res.status(400).json({
          success: false,
          error:
            "ECD must be a valid ecdDayOfWeek (1-7, where 1=Monday and 7=Sunday)",
        });
      }
      updateData.ecdDayOfWeek = num;
      updateData.ecdDayOfMonth = null; // switching to day-of-week clears day-of-month
    }
    if (ecdDayOfMonth !== undefined) {
      const num = parseInt(ecdDayOfMonth);
      if (isNaN(num) || num < 1 || num > 31) {
        return res.status(400).json({
          success: false,
          error: "ECD must be a valid ecdDayOfMonth (1-31)",
        });
      }
      updateData.ecdDayOfMonth = num;
      updateData.ecdDayOfWeek = null; // switching to day-of-month clears day-of-week
    }

    // Validate at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    const updatedHabbit = await Habbit.update(req.params.id, updateData);

    if (!updatedHabbit) {
      return res.status(404).json({
        success: false,
        error: "Habbit not found",
      });
    }

    res.json({
      success: true,
      data: updatedHabbit,
      message: "Habbit updated successfully",
    });
  } catch (error) {
    console.error("Error updating habbit:", error);

    // Handle specific errors
    if (error.message.includes("Priority must be between")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update habbit",
      message: error.message,
    });
  }
};

/**
 * Delete a habbit
 * @route DELETE /api/habbits/:id
 */
const deleteHabbit = async (req, res) => {
  try {
    const success = await Habbit.delete(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Habbit not found",
      });
    }

    res.json({
      success: true,
      message: "Habbit deleted successfully and priorities reordered",
    });
  } catch (error) {
    console.error("Error deleting habbit:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete habbit",
      message: error.message,
    });
  }
};

/**
 * Get habbit count
 * @route GET /api/habbits/count
 */
const getHabbitCount = async (req, res) => {
  try {
    const count = await Habbit.count();
    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting habbit count:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get habbit count",
      message: error.message,
    });
  }
};

/**
 * Mark all done habbits as undone (for cron job)
 * @route DELETE /api/habbits/chron
 */
const deleteAllDoneHabbits = async (req, res) => {
  try {
    const result = await Habbit.deleteAllDone();
    res.json({
      success: true,
      markedUndoneCount: result.markedUndoneCount,
      movedCount: result.movedCount,
      message: `Successfully marked ${result.markedUndoneCount} done habbit(s) as undone and moved ${result.movedCount} overdue habbit(s) to lowest priority`,
    });
  } catch (error) {
    console.error("Error marking done habbits as undone:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete done habbits",
      message: error.message,
    });
  }
};

module.exports = {
  getAllHabbits,
  getHabbitById,
  createHabbit,
  updateHabbit,
  deleteHabbit,
  getHabbitCount,
  deleteAllDoneHabbits,
};
