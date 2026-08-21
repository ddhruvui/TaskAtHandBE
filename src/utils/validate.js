/**
 * Request-body validation lives in the controllers (see CLAUDE.md), and every
 * controller was checking the same four or five field shapes by hand — a
 * non-empty name, an optional boolean, a non-negative priority, a nullable id
 * string. The checks are now one call each.
 *
 * The rules are unchanged, including the two asymmetries that matter:
 *
 *   - On create a name is **required**: absent, null and "" are all rejected.
 *   - On update every field is **optional**: `undefined` passes through
 *     untouched (so a PUT that omits a field leaves it alone), but a field
 *     that *is* present must still be valid.
 *
 * `label` is the field's name exactly as it appears in the message the API
 * already returns ("Goal name", "Call done", "todoTaskId"), because those
 * strings are part of the contract the clients read.
 */

/**
 * A rejected field. The route wrapper answers 400 with `message` and does not
 * log it — a bad request is not a server error.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/** "YYYY-MM-DD" — the one date format tasks and project steps are stored in. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A required, non-empty string, trimmed.
 * @param {any} value
 * @param {string} label
 * @returns {string}
 */
function requiredString(value, label) {
  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * The same rule, applied only when the field is present.
 * @returns {string|undefined} the trimmed value, or undefined if absent
 */
function optionalString(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * A free-text string that is allowed to be empty (notes, reasons).
 * @returns {string|undefined}
 */
function optionalText(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string`);
  }
  return value;
}

/**
 * A boolean, when present.
 * @returns {boolean|undefined}
 */
function optionalBoolean(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${label} must be a boolean`);
  }
  return value;
}

/**
 * A priority as the clients send it: an integer, never negative. The upper
 * bound is the model's business (it depends on how many rows exist).
 * @returns {number|undefined}
 */
function optionalPriority(value, label = "Priority") {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative integer`);
  }
  return value;
}

/**
 * A nullable id string — `null` is a real value here (it unlinks), so it is
 * accepted and passed through.
 * @returns {string|null|undefined}
 */
function optionalStringOrNull(value, label) {
  if (value === undefined) return undefined;
  if (value !== null && typeof value !== "string") {
    throw new ValidationError(`${label} must be a string or null`);
  }
  return value;
}

/**
 * A "YYYY-MM-DD" date or null.
 * @returns {string|null}
 */
function dateStringOrNull(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be a YYYY-MM-DD string or null`);
  }
  return value;
}

/**
 * A required "YYYY-MM-DD" date. Unlike `dateStringOrNull`, absent is a failure
 * rather than a null — a vacation with no end date is not a vacation.
 * @returns {string}
 */
function requiredDateString(value, label) {
  if (!isDateString(value)) {
    throw new ValidationError(`${label} must be a YYYY-MM-DD string`);
  }
  return value;
}

/**
 * The same rule, applied only when the field is present.
 * @returns {string|undefined}
 */
function optionalDateString(value, label) {
  if (value === undefined) return undefined;
  return requiredDateString(value, label);
}

/**
 * One of a fixed set of values. `message` is passed in whole because the
 * existing wordings differ too much to generate ('Call frequency must be
 * "biweekly" or "monthly"' vs "Step status must be one of: ...").
 * @returns {any}
 */
function oneOf(value, allowed, message) {
  if (!allowed.includes(value)) throw new ValidationError(message);
  return value;
}

/**
 * A plain object (not null, not an array) — the guard both goal steps and
 * project tasks run before reading fields off a list entry.
 * @returns {Object}
 */
function requireObject(value, message) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value;
}

/**
 * An array, optionally required to be non-empty.
 * @returns {Array}
 */
function requireArray(value, message, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    throw new ValidationError(message);
  }
  return value;
}

/**
 * The `$set` payload for an update: the validated fields that were actually
 * sent, with absent (`undefined`) ones dropped.
 *
 * This is what makes a PUT partial — a field the client did not mention must
 * be left alone, not cleared. Pass the validators inline and the object's own
 * source order decides which bad field is reported first, exactly as the
 * sequential `if` blocks did:
 *
 *     const updates = definedFields({
 *       name: optionalString(body.name, "Call name"),
 *       done: optionalBoolean(body.done, "Call done"),
 *     });
 *
 * @param {Object} fields
 * @returns {Object}
 */
function definedFields(fields) {
  const updates = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) updates[key] = value;
  }
  return updates;
}

/** True when `value` is a well-formed "YYYY-MM-DD" string. */
function isDateString(value) {
  return typeof value === "string" && DATE_PATTERN.test(value);
}

module.exports = {
  ValidationError,
  isDateString,
  requiredString,
  optionalString,
  optionalText,
  optionalBoolean,
  optionalPriority,
  optionalStringOrNull,
  dateStringOrNull,
  requiredDateString,
  optionalDateString,
  oneOf,
  requireObject,
  requireArray,
  definedFields,
};
