const { ValidationError } = require("./validate");

/**
 * Thirty-odd route handlers, one shape:
 *
 *     try { ...the actual work... }
 *     catch (error) {
 *       console.error("Error <doing thing>:", error);
 *       res.status(500).json({ error: "Failed to <do thing>", message: error.message });
 *     }
 *
 * `route()` is that wrapper, so a handler is left with only its own work. The
 * response contract is unchanged and deliberately precise about which failure
 * gets logged:
 *
 *   - a rejected field (`ValidationError`) → 400 `{ error }`, **not logged**
 *   - a missing row (`NotFoundError`)      → 404 `{ error }`, **not logged**
 *   - a business rule the model enforces   → logged, then 400 `{ error }` when
 *     it matches one of the `badRequest` predicates
 *   - anything else                        → logged, then 500 `{ error, message }`
 *
 * The model-thrown rules are matched on their message rather than their type
 * because the models throw plain Errors (they are also called by the cron,
 * which has no HTTP layer to translate for).
 */

/** A resource that does not exist. Answered as 404 with `message`. */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Pass a model result through, or turn a not-found (`null`) into a 404.
 * Models return `null` for a miss and never throw, so this is where a miss
 * becomes a response.
 * @param {any} value
 * @param {string} message  e.g. "Task not found"
 * @returns {any} the value, guaranteed truthy
 */
function requireFound(value, message) {
  if (!value) throw new NotFoundError(message);
  return value;
}

/** The out-of-range priority a model throws when a move leaves the list. */
const isPriorityRangeError = (error) =>
  error.message.startsWith("Priority must be");

/** Any ECD validation failure from `Task.validateEcd`. */
const isEcdError = (error) =>
  error.message.startsWith("ecd") || error.message.includes("ecd.");

/**
 * Wrap a handler with the shared failure handling.
 * @param {Object} labels
 * @param {string} labels.action   Logged as "Error <action>:" — e.g. "creating task"
 * @param {string} labels.failure  The 500 body's `error` — e.g. "Failed to create task"
 * @param {Array<(error: Error) => boolean>} [labels.badRequest]  Model errors to answer 400
 * @param {(req, res) => Promise<void>} handler
 * @returns {(req, res) => Promise<void>} an Express handler
 */
function route({ action, failure, badRequest = [] }, handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error(`Error ${action}:`, error);
      if (badRequest.some((matches) => matches(error))) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: failure, message: error.message });
    }
  };
}

module.exports = {
  requireFound,
  isPriorityRangeError,
  isEcdError,
  route,
};
