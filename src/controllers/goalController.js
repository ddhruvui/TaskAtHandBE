const Goal = require("../models/Goal");
const { DOW_NAMES } = require("../utils/dates");
const {
  route,
  requireFound,
  isPriorityRangeError,
} = require("../utils/http");
const {
  requiredString,
  optionalString,
  optionalPriority,
  oneOf,
  requireObject,
  requireArray,
  definedFields,
} = require("../utils/validate");

const STEP_STATUSES = ["pending", "under_progress"];

// Pre-rename statuses; normalized so goals saved earlier stay editable
const LEGACY_STATUS_ALIASES = {
  achieved: "under_progress",
  active: "under_progress",
};

const DAYS_MESSAGE = `Step days must be a non-empty array of: ${DOW_NAMES.join(", ")}`;

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
  requireArray(days, DAYS_MESSAGE, { nonEmpty: true });
  for (const day of days) oneOf(day, DOW_NAMES, DAYS_MESSAGE);
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
  return requireArray(
    steps,
    "steps must be an array of { name, status, days } objects",
  ).map((step) => {
    requireObject(step, "Each step must be an object with a name");
    const name = requiredString(step.name, "Each step name");
    const requested = step.status === undefined ? "pending" : step.status;
    const status = oneOf(
      LEGACY_STATUS_ALIASES[requested] || requested,
      STEP_STATUSES,
      `Step status must be one of: ${STEP_STATUSES.join(", ")}`,
    );
    return { name, status, days: validateDays(step.days) };
  });
}

/**
 * GET /goals
 * Returns all goals sorted by name ascending
 */
const getAllGoals = route(
  { action: "fetching goals", failure: "Failed to fetch goals" },
  async (req, res) => {
    res.json(await Goal.findAll());
  },
);

/**
 * POST /goals
 * Creates a new goal with a name and a list of steps (habits to build one at
 * a time). Steps are optional and default to an empty list.
 */
const createGoal = route(
  { action: "creating goal", failure: "Failed to create goal" },
  async (req, res) => {
    const { steps } = req.body;
    const name = requiredString(req.body.name, "Goal name");
    const goal = await Goal.create({
      name,
      steps: steps === undefined ? [] : validateSteps(steps),
    });
    res.status(201).json(goal);
  },
);

/**
 * PUT /goals/:id
 * Updates a goal's name and/or step list. Steps are replaced wholesale, which
 * covers adding, renaming, reordering, removing and status changes.
 */
const updateGoal = route(
  {
    action: "updating goal",
    failure: "Failed to update goal",
    badRequest: [isPriorityRangeError],
  },
  async (req, res) => {
    const { steps } = req.body;
    const updates = definedFields({
      name: optionalString(req.body.name, "Goal name"),
      priority: optionalPriority(req.body.priority),
      steps: steps === undefined ? undefined : validateSteps(steps),
    });

    const updated = await Goal.update(req.params.id, updates);
    res.json(requireFound(updated, "Goal not found"));
  },
);

/**
 * DELETE /goals/:id
 * Deletes a goal. Tasks already added to the todo from its steps are
 * untouched.
 */
const deleteGoal = route(
  { action: "deleting goal", failure: "Failed to delete goal" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Goal.delete(id), "Goal not found");
    res.json({ deleted: id });
  },
);

module.exports = { getAllGoals, createGoal, updateGoal, deleteGoal };
