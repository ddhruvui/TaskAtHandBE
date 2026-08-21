const Vacation = require("../models/Vacation");
const { Task } = require("../models/Task");
const Header = require("../models/Header");
const { utcDayString, utcToday } = require("../utils/dates");
const {
  activeVacation,
  vacationLength,
  recentlyEnded,
  dayNumber,
} = require("../utils/vacation");
const { route, requireFound } = require("../utils/http");
const {
  ValidationError,
  requiredDateString,
  optionalDateString,
  optionalText,
} = require("../utils/validate");

/** Today as the "YYYY-MM-DD" UTC day every vacation rule is measured in. */
function today() {
  return utcDayString(utcToday());
}

/**
 * The two rules a stored range must satisfy, checked together because the
 * second needs the first to have passed.
 *
 * Overlaps are rejected rather than merged: `vacationDaysBetween` sums each
 * range's overlap independently, so a day covered twice would be subtracted
 * twice from a task's slippage.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} [excludeId]  The row being edited
 */
async function assertValidRange(startDate, endDate, excludeId) {
  if (endDate < startDate) {
    throw new ValidationError("endDate must be on or after startDate");
  }
  const clashes = await Vacation.overlapping(startDate, endDate, excludeId);
  if (clashes.length > 0) {
    const clash = clashes[0];
    throw new ValidationError(
      `Vacation overlaps an existing one (${clash.startDate} to ${clash.endDate})`,
    );
  }
}

/**
 * GET /vacations
 * Every stored vacation, oldest start date first.
 */
const getAllVacations = route(
  { action: "fetching vacations", failure: "Failed to fetch vacations" },
  async (req, res) => {
    res.json(await Vacation.findAll());
  },
);

/**
 * GET /vacations/status
 * Whether today is a vacation day, plus what is coming and what just ended —
 * everything the clients need for the banner without re-deriving date maths.
 */
const getStatus = route(
  {
    action: "fetching vacation status",
    failure: "Failed to fetch vacation status",
  },
  async (req, res) => {
    const day = today();
    const all = await Vacation.findAll();
    const active = activeVacation(all, day);

    res.json({
      today: day,
      onVacation: Boolean(active),
      active: active
        ? {
            ...active,
            totalDays: vacationLength(active),
            dayOfVacation: dayNumber(day) - dayNumber(active.startDate) + 1,
            daysRemaining: dayNumber(active.endDate) - dayNumber(day),
          }
        : null,
      upcoming: all.filter((v) => v.startDate > day),
      justReturnedFrom: recentlyEnded(all, day),
    });
  },
);

/**
 * GET /vacations/:id/tasks
 * The undone one-time dated tasks that fall inside a vacation — the re-date
 * list the Vacation panel works through. Recurring tasks are deliberately
 * absent: they cannot be moved without rewriting their schedule, so they are
 * exempted for those days instead.
 */
const getVacationTasks = route(
  {
    action: "fetching vacation tasks",
    failure: "Failed to fetch vacation tasks",
  },
  async (req, res) => {
    const vacation = requireFound(
      await Vacation.findById(req.params.id).catch(() => null),
      "Vacation not found",
    );

    const tasks = await Task.findDatedBetween(
      vacation.startDate,
      vacation.endDate,
    );

    // Denormalize the header name so the panel can label rows without a
    // request per task.
    const headers = await Header.findAll();
    const headerNames = Object.fromEntries(
      headers.map((h) => [String(h._id), h.name]),
    );

    res.json(
      tasks.map((task) => ({
        ...task,
        headerName: headerNames[String(task.headerId)] || null,
      })),
    );
  },
);

/**
 * POST /vacations
 * Book a vacation. Both dates are required and both are inclusive.
 */
const createVacation = route(
  { action: "creating vacation", failure: "Failed to create vacation" },
  async (req, res) => {
    const startDate = requiredDateString(req.body.startDate, "startDate");
    const endDate = requiredDateString(req.body.endDate, "endDate");
    const note = optionalText(req.body.note, "note");

    await assertValidRange(startDate, endDate);

    res.status(201).json(await Vacation.create({ startDate, endDate, note }));
  },
);

/**
 * PUT /vacations/:id
 * Correct a vacation's dates or note — the forgotten-to-switch-it-on case, and
 * the came-home-early one.
 */
const updateVacation = route(
  { action: "updating vacation", failure: "Failed to update vacation" },
  async (req, res) => {
    const { id } = req.params;
    const current = requireFound(
      await Vacation.findById(id).catch(() => null),
      "Vacation not found",
    );

    const startDate = optionalDateString(req.body.startDate, "startDate");
    const endDate = optionalDateString(req.body.endDate, "endDate");
    const note = optionalText(req.body.note, "note");

    // Validate the range the row would end up with, not just the fields sent.
    await assertValidRange(
      startDate !== undefined ? startDate : current.startDate,
      endDate !== undefined ? endDate : current.endDate,
      id,
    );

    const updated = await Vacation.update(id, { startDate, endDate, note });
    res.json(requireFound(updated, "Vacation not found"));
  },
);

/**
 * DELETE /vacations/:id
 * Removes the range — and with it the forgiveness it granted, since archive
 * events carry no vacation flag of their own.
 */
const deleteVacation = route(
  { action: "deleting vacation", failure: "Failed to delete vacation" },
  async (req, res) => {
    const { id } = req.params;
    requireFound(await Vacation.delete(id), "Vacation not found");
    res.json({ deleted: id });
  },
);

module.exports = {
  getAllVacations,
  getStatus,
  getVacationTasks,
  createVacation,
  updateVacation,
  deleteVacation,
};
