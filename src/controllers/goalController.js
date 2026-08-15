const Goal = require("../models/Goal");

const STEP_STATUSES = ["pending", "under_progress"];

// Pre-rename statuses; normalized so goals saved earlier stay editable
const LEGACY_STATUS_ALIASES = { achieved: "under_progress", active: "under_progress" };

// Canonical week order — stored `days` are always sorted into it, so the
// client never has to re-sort and the value can be compared verbatim against
// the linked task's `day_of_week` ECD.
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Validate and normalize a step's `days` — the weekdays its daily habit is
 * expected on, mirrored onto the linked task's `day_of_week` ECD when the
 * step is started. Because the nightly archive only records a `habit_result`
 * on days the ECD covers, this list is exactly what the streak is measured
 * over: a habit set to Mon/Wed/Fri keeps its streak across an untouched
 * Tuesday.
 *
 * Absent (`undefined`) means every day, which is what every step stored
 * before this field existed meant — so legacy goals keep their current
 * seven-day behaviour on their next write.
 */
function validateDays(days) {
  if (days === undefined) return [...DOW_NAMES];
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error(
      `Step days must be a non-empty array of: ${DOW_NAMES.join(", ")}`,
    );
  }
  for (const day of days) {
    if (!DOW_NAMES.includes(day)) {
      throw new Error(
        `Step days must be a non-empty array of: ${DOW_NAMES.join(", ")}`,
      );
    }
  }
  // Dedupe and sort into week order (Sun → Sat)
  return DOW_NAMES.filter((day) => days.includes(day));
}

/**
 * Validate and normalize a goal step list.
 * Steps are { name, status, days } objects; status defaults to "pending" and
 * days to the whole week. A step is either pending (backlog/paused) or
 * under_progress (its daily task lives in the "One Step At A Time" todo
 * header, kept for life, scheduled on `days`).
 * Returns the normalized steps or throws a validation Error.
 */
function validateSteps(steps) {
  if (!Array.isArray(steps)) {
    throw new Error("steps must be an array of { name, status, days } objects");
  }
  return steps.map((step) => {
    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      throw new Error("Each step must be an object with a name");
    }
    if (typeof step.name !== "string" || step.name.trim() === "") {
      throw new Error("Each step name must be a non-empty string");
    }
    let status = step.status === undefined ? "pending" : step.status;
    status = LEGACY_STATUS_ALIASES[status] || status;
    if (!STEP_STATUSES.includes(status)) {
      throw new Error(
        `Step status must be one of: ${STEP_STATUSES.join(", ")}`,
      );
    }
    return { name: step.name.trim(), status, days: validateDays(step.days) };
  });
}

/**
 * GET /goals
 * Returns all goals sorted by name ascending
 */
const getAllGoals = async (req, res) => {
  try {
    const goals = await Goal.findAll();
    res.json(goals);
  } catch (error) {
    console.error("Error fetching goals:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch goals", message: error.message });
  }
};

/**
 * POST /goals
 * Creates a new goal with a name and a list of steps (habits to build one at
 * a time). Steps are optional and default to an empty list.
 */
const createGoal = async (req, res) => {
  try {
    const { name, steps } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ error: "Goal name must be a non-empty string" });
    }

    let normalizedSteps;
    try {
      normalizedSteps = steps === undefined ? [] : validateSteps(steps);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const goal = await Goal.create({
      name: name.trim(),
      steps: normalizedSteps,
    });
    res.status(201).json(goal);
  } catch (error) {
    console.error("Error creating goal:", error);
    res
      .status(500)
      .json({ error: "Failed to create goal", message: error.message });
  }
};

/**
 * PUT /goals/:id
 * Updates a goal's name and/or step list. Steps are replaced wholesale, which
 * covers adding, renaming, reordering, removing and status changes.
 */
const updateGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, steps, priority } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim() === "")
    ) {
      return res
        .status(400)
        .json({ error: "Goal name must be a non-empty string" });
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
    if (steps !== undefined) {
      try {
        updates.steps = validateSteps(steps);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    }

    const updated = await Goal.update(id, updates);

    if (!updated) {
      return res.status(404).json({ error: "Goal not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating goal:", error);
    if (error.message.startsWith("Priority must be")) {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Failed to update goal", message: error.message });
  }
};

/**
 * DELETE /goals/:id
 * Deletes a goal. Tasks already added to the todo from its steps are
 * untouched.
 */
const deleteGoal = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Goal.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Goal not found" });
    }

    res.json({ deleted: id });
  } catch (error) {
    console.error("Error deleting goal:", error);
    res
      .status(500)
      .json({ error: "Failed to delete goal", message: error.message });
  }
};

module.exports = { getAllGoals, createGoal, updateGoal, deleteGoal };
