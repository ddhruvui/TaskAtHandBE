/**
 * Owns the one rule that ties long-term projects to todo headers:
 *
 *   A header created for a project (`projectId` set) is kept in the projects'
 *   own priority order, as one contiguous block. When the todo has at least
 *   one non-project header, the topmost one keeps slot 0 and the block starts
 *   at priority 1; otherwise the block starts at 0. Remaining non-project
 *   headers keep their relative order and fill the slots after the block.
 *
 * This used to live in the clients (`projectSync.syncProjectHeaderOrder` in
 * both the web FE and Shleeji), which realised it as a walk of sequential
 * `PUT /headers/:id` calls — non-atomic, racy between clients, and a
 * re-implementation of the server's priority-shift semantics. It is now a
 * single server-side `bulkWrite`, invoked from every path that can invalidate
 * the order: header create, project rename/move/delete, and the nightly cron.
 */

const { ObjectId } = require("mongodb");
const Header = require("../models/Header");
const { Project } = require("../models/Project");
const { priorityBulkOps } = require("../utils/ordering");

/**
 * Recompute and persist the header order.
 *
 * Also self-heals the `projectId` link:
 *   - headers with no `projectId` whose name matches a project (the pre-
 *     `projectId` identity rule) are backfilled, so existing databases pick
 *     the new behaviour up without a migration script;
 *   - headers pointing at a deleted project have `projectId` cleared, which
 *     drops them out of the block.
 *
 * Idempotent: running it twice in a row writes nothing the second time.
 *
 * @returns {Promise<{headersReordered: number, linksRepaired: number}>}
 */
async function applyProjectHeaderOrder() {
  const headersCol = await Header.getCollection();
  const [projects, headers] = await Promise.all([
    Project.findAll(), // priority ascending
    headersCol.find({}).sort({ priority: 1 }).toArray(),
  ]);

  const projectById = new Map(projects.map((p) => [p._id.toString(), p]));

  // Legacy identity: first project (lowest priority) owning a given name.
  const projectByName = new Map();
  for (const project of projects) {
    const key = project.name.trim().toLowerCase();
    if (!projectByName.has(key)) projectByName.set(key, project);
  }
  const claimed = new Set(
    headers.filter((h) => h.projectId).map((h) => h.projectId),
  );

  const linkOps = [];
  const linkedProjectId = new Map(); // headerId → project _id string | null

  for (const header of headers) {
    const current = header.projectId || null;

    if (current && projectById.has(current)) {
      linkedProjectId.set(header._id.toString(), current);
      continue;
    }

    if (current) {
      // Project is gone — the header stays, but stops being project-derived.
      linkedProjectId.set(header._id.toString(), null);
      linkOps.push({
        updateOne: {
          filter: { _id: header._id },
          update: { $set: { projectId: null } },
        },
      });
      continue;
    }

    const match = projectByName.get(header.name.trim().toLowerCase());
    if (match && !claimed.has(match._id.toString())) {
      const id = match._id.toString();
      claimed.add(id);
      linkedProjectId.set(header._id.toString(), id);
      linkOps.push({
        updateOne: {
          filter: { _id: header._id },
          update: { $set: { projectId: id } },
        },
      });
      continue;
    }

    linkedProjectId.set(header._id.toString(), null);

    // Headers written before the field existed have no `projectId` key at
    // all; normalise them to null so every header the API returns has it.
    if (!("projectId" in header)) {
      linkOps.push({
        updateOne: {
          filter: { _id: header._id },
          update: { $set: { projectId: null } },
        },
      });
    }
  }

  const isProjectHeader = (h) => linkedProjectId.get(h._id.toString()) !== null;

  const projectHeaders = headers.filter(isProjectHeader).sort((a, b) => {
    const pa = projectById.get(linkedProjectId.get(a._id.toString()));
    const pb = projectById.get(linkedProjectId.get(b._id.toString()));
    return pa.priority - pb.priority;
  });
  const nonProjectHeaders = headers.filter((h) => !isProjectHeader(h));

  const desired =
    projectHeaders.length === 0
      ? headers
      : nonProjectHeaders.length > 0
        ? [nonProjectHeaders[0], ...projectHeaders, ...nonProjectHeaders.slice(1)]
        : projectHeaders;

  // Only the headers that actually moved are written.
  const priorityOps = priorityBulkOps(desired);

  const ops = [...linkOps, ...priorityOps];
  if (ops.length > 0) await headersCol.bulkWrite(ops);

  return {
    headersReordered: priorityOps.length,
    linksRepaired: linkOps.length,
  };
}

/**
 * Cascade a project rename onto its header, so the todo header keeps showing
 * the project's current name.
 * @param {string} projectId
 * @param {string} name
 * @returns {Promise<number>} headers renamed (0 or 1)
 */
async function renameProjectHeader(projectId, name) {
  const headersCol = await Header.getCollection();
  const result = await headersCol.updateMany(
    { projectId, name: { $ne: name } },
    { $set: { name } },
  );
  return result.modifiedCount;
}

/**
 * Cascade a project delete: its header (and the header's tasks) survive, but
 * the header is no longer project-derived, so it leaves the ordered block.
 * Any project task links pointed at those todo tasks died with the project.
 * @param {string} projectId
 * @returns {Promise<number>} headers unlinked (0 or 1)
 */
async function unlinkProjectHeader(projectId) {
  const headersCol = await Header.getCollection();
  const result = await headersCol.updateMany(
    { projectId },
    { $set: { projectId: null } },
  );
  return result.modifiedCount;
}

/** True when `id` is a well-formed ObjectId string. */
function isValidObjectId(id) {
  return typeof id === "string" && ObjectId.isValid(id);
}

module.exports = {
  applyProjectHeaderOrder,
  renameProjectHeader,
  unlinkProjectHeader,
  isValidObjectId,
};
