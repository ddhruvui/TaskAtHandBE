const { connectDB, getDatabase } = require("../src/config/db");
const { ObjectId } = require("mongodb");

const { collectionName, getCollection } = require("../src/utils/collections");
const {
  toObjectId,
  findById,
  findAllSorted,
  updateById,
  deleteById,
} = require("../src/utils/documents");
const {
  orderDoneLast,
  ascendingBy,
  matchingFirst,
  groupBy,
  priorityBulkOps,
} = require("../src/utils/ordering");
const {
  nextPriority,
  scopeSize,
  shiftForMove,
  movePriority,
  closeGap,
  openSlot,
} = require("../src/utils/priority");
const {
  isVacationDay,
  activeVacation,
  vacationDaysBetween,
  vacationLength,
  statsCutoff,
  recentlyEnded,
  callPeriod,
  isCallPeriodExempt,
  eventDay,
  isPausedResult,
  isVacationEvent,
  adjustedSlippage,
  toRanges,
} = require("../src/utils/vacation");
const {
  ValidationError,
  isDateString,
  requiredString,
  optionalString,
  optionalText,
  optionalBoolean,
  optionalPriority,
  optionalStringOrNull,
  dateStringOrNull,
  oneOf,
  requireObject,
  requireArray,
  definedFields,
} = require("../src/utils/validate");
const {
  requireFound,
  isPriorityRangeError,
  isEcdError,
  route,
} = require("../src/utils/http");
const {
  DOW_NAMES,
  MAX_DAYS_BY_MONTH,
  daysInMonth,
  parseSlashDate,
  dayOfWeekName,
  utcDayString,
  utcDayStart,
  utcToday,
  daysBetween,
  daysAgo,
} = require("../src/utils/dates");
const {
  bucket,
  byDueDate,
  completionRate,
  trailingStreak,
  longestRun,
  average,
  countWhere,
} = require("../src/utils/stats");

/** Minimal Express `res` double: records the status and body a handler sent. */
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("utils/collections", () => {
  const original = process.env.USE_TEST_DB;
  afterEach(() => {
    process.env.USE_TEST_DB = original;
  });

  test("appends -Test only when USE_TEST_DB is on", () => {
    process.env.USE_TEST_DB = "true";
    expect(collectionName("Tasks")).toBe("Tasks-Test");
    process.env.USE_TEST_DB = "false";
    expect(collectionName("Tasks")).toBe("Tasks");
  });

  test("reads the env var per call, not at require time", () => {
    process.env.USE_TEST_DB = "false";
    expect(collectionName("Headers")).toBe("Headers");
    process.env.USE_TEST_DB = "true";
    expect(collectionName("Headers")).toBe("Headers-Test");
  });

  test("getCollection resolves the environment's collection", async () => {
    await connectDB();
    const collection = await getCollection("Tasks");
    expect(collection.collectionName).toBe("Tasks-Test");
  });
});

describe("utils/documents", () => {
  let collection;
  const scratch = [];

  beforeAll(async () => {
    await connectDB();
    collection = await getCollection("Tasks");
  });

  beforeEach(async () => {
    await collection.deleteMany({});
    scratch.length = 0;
    for (const name of ["b", "a", "c"]) {
      const result = await collection.insertOne({ name, headerId: "H" });
      scratch.push(result.insertedId);
    }
  });

  afterAll(async () => {
    await collection.deleteMany({});
  });

  test("toObjectId accepts a valid id string and throws on a bad one", () => {
    const id = new ObjectId();
    expect(toObjectId(id.toString()).toString()).toBe(id.toString());
    expect(() => toObjectId("not-an-id")).toThrow();
  });

  test("findById reads by string id and returns null for a miss", async () => {
    const found = await findById(collection, scratch[0].toString());
    expect(found.name).toBe("b");
    expect(await findById(collection, new ObjectId().toString())).toBeNull();
  });

  test("findAllSorted applies the given sort", async () => {
    const rows = await findAllSorted(collection, { name: 1 });
    expect(rows.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  test("updateById returns the document after the write", async () => {
    const updated = await updateById(collection, scratch[0].toString(), {
      name: "z",
    });
    expect(updated.name).toBe("z");
  });

  test("deleteById removes exactly one document", async () => {
    await deleteById(collection, scratch[0].toString());
    expect(await collection.countDocuments()).toBe(2);
  });
});

describe("utils/ordering", () => {
  const tasks = () => [
    { name: "undated", done: false, date: null, priority: 0 },
    { name: "finished", done: true, date: "2026-01-01", priority: 1 },
    { name: "later", done: false, date: "2026-05-01", priority: 2 },
    { name: "sooner", done: false, date: "2026-02-01", priority: 3 },
  ];

  test("orderDoneLast puts undone first and done last", () => {
    const ordered = orderDoneLast(tasks());
    expect(ordered.map((t) => t.name)).toEqual([
      "undated",
      "later",
      "sooner",
      "finished",
    ]);
  });

  test("orderDoneLast sorts the undone half by the comparator only", () => {
    const ordered = orderDoneLast(
      tasks(),
      ascendingBy((t) => (t.date ? Date.parse(t.date) : Infinity)),
    );
    expect(ordered.map((t) => t.name)).toEqual([
      "sooner",
      "later",
      "undated",
      "finished",
    ]);
  });

  test("orderDoneLast does not mutate its input", () => {
    const input = tasks();
    orderDoneLast(
      input,
      ascendingBy((t) => (t.date ? 1 : 0)),
    );
    expect(input.map((t) => t.name)).toEqual([
      "undated",
      "finished",
      "later",
      "sooner",
    ]);
  });

  test("ascendingBy sorts Infinity keys last and keeps their order", () => {
    const items = [
      { n: "a", k: Infinity },
      { n: "b", k: 2 },
      { n: "c", k: Infinity },
      { n: "d", k: 1 },
    ];
    items.sort(ascendingBy((i) => i.k));
    expect(items.map((i) => i.n)).toEqual(["d", "b", "a", "c"]);
  });

  test("matchingFirst is stable within each group", () => {
    const ordered = orderDoneLast(
      tasks(),
      matchingFirst((t) => t.date),
    );
    // dated undone keep their relative order, then undated, then done
    expect(ordered.map((t) => t.name)).toEqual([
      "later",
      "sooner",
      "undated",
      "finished",
    ]);
  });

  test("groupBy preserves input order inside each group", () => {
    const groups = groupBy(
      [
        { h: "A", n: 1 },
        { h: "B", n: 2 },
        { h: "A", n: 3 },
      ],
      (i) => i.h,
    );
    expect([...groups.keys()]).toEqual(["A", "B"]);
    expect(groups.get("A").map((i) => i.n)).toEqual([1, 3]);
  });

  test("an already contiguous list produces no writes", () => {
    expect(
      priorityBulkOps([
        { _id: 1, priority: 0 },
        { _id: 2, priority: 1 },
      ]),
    ).toEqual([]);
  });

  test("priorityBulkOps wraps only the moved documents as updateOne ops", () => {
    expect(
      priorityBulkOps([
        { _id: 1, priority: 3 },
        { _id: 2, priority: 1 },
        { _id: 3, priority: 9 },
      ]),
    ).toEqual([
      { updateOne: { filter: { _id: 1 }, update: { $set: { priority: 0 } } } },
      { updateOne: { filter: { _id: 3 }, update: { $set: { priority: 2 } } } },
    ]);
  });
});

describe("utils/priority", () => {
  let collection;
  let ids;

  /** Seed `count` rows in a header, priorities 0..count-1. */
  async function seed(headerId, count) {
    const inserted = [];
    for (let i = 0; i < count; i++) {
      const result = await collection.insertOne({
        headerId,
        priority: i,
        name: `t${i}`,
      });
      inserted.push(result.insertedId);
    }
    return inserted;
  }

  /** Current priorities in a header, keyed by name. */
  async function layout(headerId) {
    const rows = await collection
      .find({ headerId })
      .sort({ priority: 1 })
      .toArray();
    return rows.map((r) => `${r.name}@${r.priority}`);
  }

  beforeAll(async () => {
    await connectDB();
    collection = await getCollection("Tasks");
  });

  beforeEach(async () => {
    await collection.deleteMany({});
    ids = await seed("H1", 4);
    await seed("H2", 2);
  });

  afterAll(async () => {
    await collection.deleteMany({});
  });

  test("nextPriority is the size of the scope", async () => {
    expect(await nextPriority(collection, { headerId: "H1" })).toBe(4);
    expect(await nextPriority(collection, { headerId: "H2" })).toBe(2);
    expect(await nextPriority(collection)).toBe(6);
  });

  test("scopeSize counts only the scope", async () => {
    expect(await scopeSize(collection, { headerId: "H2" })).toBe(2);
  });

  test("movePriority accepts both ends of the range", async () => {
    for (const to of [0, 3]) {
      await expect(
        movePriority(collection, {
          id: ids[1].toString(),
          from: 1,
          to,
          scope: { headerId: "H1" },
        }),
      ).resolves.toBe(to);
      await collection.deleteMany({});
      ids = await seed("H1", 4);
    }
  });

  test("movePriority rejects a negative target with the shared message", async () => {
    await expect(
      movePriority(collection, {
        id: ids[0].toString(),
        from: 0,
        to: -1,
        scope: { headerId: "H1" },
      }),
    ).rejects.toThrow("Priority must be between 0 and 3");
  });

  test("shiftForMove moving up slides the block down by one", async () => {
    await shiftForMove(collection, {
      id: ids[3].toString(),
      from: 3,
      to: 1,
      scope: { headerId: "H1" },
    });
    await collection.updateOne({ _id: ids[3] }, { $set: { priority: 1 } });
    expect(await layout("H1")).toEqual(["t0@0", "t3@1", "t1@2", "t2@3"]);
  });

  test("shiftForMove moving down slides the block up by one", async () => {
    await shiftForMove(collection, {
      id: ids[0].toString(),
      from: 0,
      to: 2,
      scope: { headerId: "H1" },
    });
    await collection.updateOne({ _id: ids[0] }, { $set: { priority: 2 } });
    expect(await layout("H1")).toEqual(["t1@0", "t2@1", "t0@2", "t3@3"]);
  });

  test("shiftForMove is a no-op when the target equals the source", async () => {
    const shifted = await shiftForMove(collection, {
      id: ids[1].toString(),
      from: 1,
      to: 1,
      scope: { headerId: "H1" },
    });
    expect(shifted).toBe(0);
    expect(await layout("H1")).toEqual(["t0@0", "t1@1", "t2@2", "t3@3"]);
  });

  test("shiftForMove never touches another scope", async () => {
    await shiftForMove(collection, {
      id: ids[0].toString(),
      from: 0,
      to: 3,
      scope: { headerId: "H1" },
    });
    expect(await layout("H2")).toEqual(["t0@0", "t1@1"]);
  });

  test("movePriority range-checks before shifting anything", async () => {
    await expect(
      movePriority(collection, {
        id: ids[0].toString(),
        from: 0,
        to: 4,
        scope: { headerId: "H1" },
      }),
    ).rejects.toThrow("Priority must be between 0 and 3");
    expect(await layout("H1")).toEqual(["t0@0", "t1@1", "t2@2", "t3@3"]);
  });

  test("movePriority returns the new priority", async () => {
    const to = await movePriority(collection, {
      id: ids[0].toString(),
      from: 0,
      to: 2,
      scope: { headerId: "H1" },
    });
    expect(to).toBe(2);
  });

  test("closeGap pulls everything after the hole up by one", async () => {
    await collection.deleteOne({ _id: ids[1] });
    await closeGap(collection, 1, { scope: { headerId: "H1" } });
    expect(await layout("H1")).toEqual(["t0@0", "t2@1", "t3@2"]);
  });

  test("openSlot pushes the selected rows down by one", async () => {
    await openSlot(collection, { headerId: "H1", priority: { $gte: 2 } });
    expect(await layout("H1")).toEqual(["t0@0", "t1@1", "t2@3", "t3@4"]);
  });

  test("stamp writes updatedAt onto the shifted neighbours only when asked", async () => {
    const move = {
      id: ids[0].toString(),
      from: 0,
      to: 3,
      scope: { headerId: "H1" },
    };

    // Ordered collections (headers, goals, projects, life events) never stamp.
    await shiftForMove(collection, move);
    expect(
      await collection.countDocuments({ updatedAt: { $exists: true } }),
    ).toBe(0);

    // Tasks do — three neighbours moved, the task itself is excluded.
    await shiftForMove(collection, { ...move, from: 3, to: 0, stamp: true });
    expect(
      await collection.countDocuments({ updatedAt: { $exists: true } }),
    ).toBe(3);
  });
});

describe("utils/validate", () => {
  test("requiredString trims and rejects every empty shape", () => {
    expect(requiredString("  hi  ", "Task name")).toBe("hi");
    for (const bad of [undefined, null, "", "   ", 0, 5, {}]) {
      expect(() => requiredString(bad, "Task name")).toThrow(
        "Task name must be a non-empty string",
      );
    }
  });

  test("optionalString lets undefined through but not a blank value", () => {
    expect(optionalString(undefined, "Goal name")).toBeUndefined();
    expect(optionalString(" x ", "Goal name")).toBe("x");
    expect(() => optionalString("  ", "Goal name")).toThrow(
      "Goal name must be a non-empty string",
    );
    expect(() => optionalString(null, "Goal name")).toThrow(ValidationError);
  });

  test("optionalText allows an empty string but not a non-string", () => {
    expect(optionalText("", "Task notes")).toBe("");
    expect(optionalText(undefined, "Task notes")).toBeUndefined();
    expect(() => optionalText(null, "Task notes")).toThrow(
      "Task notes must be a string",
    );
  });

  test("optionalBoolean accepts false and rejects truthy non-booleans", () => {
    expect(optionalBoolean(false, "done")).toBe(false);
    expect(optionalBoolean(undefined, "done")).toBeUndefined();
    expect(() => optionalBoolean("true", "done")).toThrow(
      "done must be a boolean",
    );
  });

  test("optionalPriority requires a non-negative integer", () => {
    expect(optionalPriority(0)).toBe(0);
    expect(optionalPriority(undefined)).toBeUndefined();
    for (const bad of [-1, 1.5, "2", null]) {
      expect(() => optionalPriority(bad)).toThrow(
        "Priority must be a non-negative integer",
      );
    }
  });

  test("optionalStringOrNull keeps null as a real value", () => {
    expect(optionalStringOrNull(null, "todoTaskId")).toBeNull();
    expect(optionalStringOrNull("abc", "todoTaskId")).toBe("abc");
    expect(optionalStringOrNull(undefined, "todoTaskId")).toBeUndefined();
    expect(() => optionalStringOrNull(7, "todoTaskId")).toThrow(
      "todoTaskId must be a string or null",
    );
  });

  test("dateStringOrNull defaults absent to null and validates the format", () => {
    expect(dateStringOrNull(undefined, "Task date")).toBeNull();
    expect(dateStringOrNull(null, "Task date")).toBeNull();
    expect(dateStringOrNull("2026-03-08", "Task date")).toBe("2026-03-08");
    expect(() => dateStringOrNull("8/3/2026", "Task date")).toThrow(
      "Task date must be a YYYY-MM-DD string or null",
    );
  });

  test("isDateString matches only YYYY-MM-DD strings", () => {
    expect(isDateString("2026-12-31")).toBe(true);
    expect(isDateString("2026-1-1")).toBe(false);
    expect(isDateString(20261231)).toBe(false);
  });

  test("oneOf reports the caller's own message", () => {
    expect(oneOf("monthly", ["biweekly", "monthly"], "nope")).toBe("monthly");
    expect(() => oneOf("yearly", ["biweekly", "monthly"], "nope")).toThrow(
      "nope",
    );
  });

  test("requireObject rejects null and arrays", () => {
    expect(requireObject({ a: 1 }, "bad")).toEqual({ a: 1 });
    for (const bad of [null, [], "x", 3]) {
      expect(() => requireObject(bad, "bad")).toThrow("bad");
    }
  });

  test("requireArray can demand a non-empty array", () => {
    expect(requireArray([], "bad")).toEqual([]);
    expect(() => requireArray([], "bad", { nonEmpty: true })).toThrow("bad");
    expect(() => requireArray("x", "bad")).toThrow("bad");
  });

  test("definedFields drops absent fields and keeps falsy ones", () => {
    expect(
      definedFields({ a: undefined, b: 0, c: false, d: null, e: "" }),
    ).toEqual({ b: 0, c: false, d: null, e: "" });
  });

  test("definedFields reports the first invalid field in source order", () => {
    expect(() =>
      definedFields({
        name: optionalString("", "Call name"),
        done: optionalBoolean("yes", "Call done"),
      }),
    ).toThrow("Call name must be a non-empty string");
  });
});

describe("utils/http", () => {
  test("requireFound passes a value through and throws on a miss", () => {
    expect(requireFound({ _id: 1 }, "Task not found")).toEqual({ _id: 1 });
    expect(() => requireFound(null, "Task not found")).toThrow(
      "Task not found",
    );
    expect(() => requireFound(undefined, "Task not found")).toThrow(
      "Task not found",
    );
  });

  test("isPriorityRangeError and isEcdError match the model wordings", () => {
    expect(
      isPriorityRangeError(new Error("Priority must be between 0 and 2")),
    ).toBe(true);
    expect(isPriorityRangeError(new Error("Nope"))).toBe(false);
    expect(isEcdError(new Error("ecd.type must be one of: date"))).toBe(true);
    expect(
      isEcdError(new Error('ecd.value for type "date" must be a string')),
    ).toBe(true);
    expect(isEcdError(new Error("Boom"))).toBe(false);
  });

  test("route passes a successful handler straight through", async () => {
    const res = fakeRes();
    await route({ action: "a", failure: "f" }, async (req, r) => {
      r.json({ ok: true });
    })({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("route answers a ValidationError with 400 and does not log", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = fakeRes();
    await route(
      { action: "creating call", failure: "Failed to create call" },
      async () => {
        throw new ValidationError("Call name must be a non-empty string");
      },
    )({}, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Call name must be a non-empty string" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("route answers a NotFoundError with 404 and does not log", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = fakeRes();
    await route(
      { action: "updating call", failure: "Failed to update call" },
      async () => {
        requireFound(null, "Call not found");
      },
    )({}, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Call not found" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("route logs then answers 400 for a matched model error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = fakeRes();
    await route(
      {
        action: "updating header",
        failure: "Failed to update header",
        badRequest: [isPriorityRangeError],
      },
      async () => {
        throw new Error("Priority must be between 0 and 2");
      },
    )({}, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Priority must be between 0 and 2" });
    expect(spy).toHaveBeenCalledWith(
      "Error updating header:",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  test("route logs then answers 500 for anything unmatched", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = fakeRes();
    await route(
      {
        action: "deleting goal",
        failure: "Failed to delete goal",
        badRequest: [isPriorityRangeError],
      },
      async () => {
        throw new Error("socket hang up");
      },
    )({}, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Failed to delete goal",
      message: "socket hang up",
    });
    expect(spy).toHaveBeenCalledWith("Error deleting goal:", expect.any(Error));
    spy.mockRestore();
  });
});

describe("utils/dates", () => {
  test("the weekday and month tables are the shared constants", () => {
    expect(DOW_NAMES).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(MAX_DAYS_BY_MONTH[1]).toBe(29);
  });

  test("daysInMonth handles leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  test("parseSlashDate reads both the D/M and D/M/YYYY forms", () => {
    expect(parseSlashDate("7/3")).toEqual({
      day: 7,
      month: 3,
      year: undefined,
    });
    expect(parseSlashDate("7/3/2006")).toEqual({
      day: 7,
      month: 3,
      year: 2006,
    });
  });

  test("dayOfWeekName reads the UTC weekday", () => {
    // 2026-03-08 is a Sunday
    expect(dayOfWeekName(new Date("2026-03-08T00:00:00Z"))).toBe("Sun");
    expect(dayOfWeekName(new Date("2026-03-09T23:59:59Z"))).toBe("Mon");
  });

  test("utcDayString formats a calendar day", () => {
    expect(utcDayString(new Date("2026-03-08T18:30:00Z"))).toBe("2026-03-08");
  });

  test("utcDayStart snaps to midnight and reports NaN for junk", () => {
    expect(utcDayStart("2026-03-08T23:59:00Z")).toBe(Date.UTC(2026, 2, 8));
    expect(Number.isNaN(utcDayStart("not a date"))).toBe(true);
  });

  test("daysBetween counts calendar days, not elapsed hours", () => {
    // The bug this exists to prevent: an afternoon completion on the planned
    // day must be 0 days, not 1.
    expect(daysBetween("2026-03-08T00:00:00Z", "2026-03-08T18:00:00Z")).toBe(0);
    expect(daysBetween("2026-03-08T00:00:00Z", "2026-03-10T01:00:00Z")).toBe(2);
    expect(daysBetween("2026-03-08T00:00:00Z", "2026-03-06T23:00:00Z")).toBe(
      -2,
    );
    expect(daysBetween("junk", "2026-03-08T00:00:00Z")).toBeNull();
  });

  test("daysAgo walks back a whole number of days", () => {
    const to = new Date("2026-03-08T12:00:00Z");
    expect(daysAgo(to, 7).toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });

  test("utcToday is midnight UTC", () => {
    const today = utcToday();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });
});

describe("utils/stats", () => {
  test("bucket creates once and returns the same object after", () => {
    const store = {};
    let created = 0;
    const make = () => {
      created++;
      return { count: 0 };
    };
    bucket(store, "a", make).count++;
    bucket(store, "a", make).count++;
    expect(created).toBe(1);
    expect(store.a.count).toBe(2);
  });

  test("byDueDate sorts oldest first", () => {
    const rows = [{ dueDate: "2026-03-02" }, { dueDate: "2026-03-01" }];
    expect(rows.sort(byDueDate).map((r) => r.dueDate)).toEqual([
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  test("completionRate rounds and reports the empty case as 0", () => {
    expect(completionRate(3, 4)).toBe(75);
    expect(completionRate(1, 3)).toBe(33);
    expect(completionRate(0, 0)).toBe(0);
  });

  test("trailingStreak counts only the run at the end", () => {
    const results = [
      { completed: true },
      { completed: false },
      { completed: true },
      { completed: true },
    ];
    expect(trailingStreak(results, (r) => r.completed)).toBe(2);
    expect(trailingStreak(results, (r) => !r.completed)).toBe(0);
    expect(trailingStreak([], (r) => r.completed)).toBe(0);
  });

  test("longestRun finds the longest run anywhere", () => {
    const results = [
      { completed: true },
      { completed: true },
      { completed: false },
      { completed: true },
    ];
    expect(longestRun(results, (r) => r.completed)).toBe(2);
    expect(longestRun([], (r) => r.completed)).toBe(0);
  });

  test("average rounds to one decimal and returns null when empty", () => {
    expect(average([1, 2, 2])).toBe(1.7);
    expect(average([2, 4])).toBe(3);
    expect(average([])).toBeNull();
  });

  test("countWhere counts matches", () => {
    expect(countWhere([1, 2, 3, 4], (n) => n % 2 === 0)).toBe(2);
    expect(countWhere([], () => true)).toBe(0);
  });
});

describe("utils/vacation", () => {
  // A single trip, used by most of the cases below.
  const TRIP = [{ startDate: "2026-08-03", endDate: "2026-08-15" }];

  describe("isVacationDay — both ends inclusive", () => {
    test("the first and last day are vacation days", () => {
      expect(isVacationDay("2026-08-03", TRIP)).toBe(true);
      expect(isVacationDay("2026-08-15", TRIP)).toBe(true);
    });

    test("the days either side are not", () => {
      expect(isVacationDay("2026-08-02", TRIP)).toBe(false);
      expect(isVacationDay("2026-08-16", TRIP)).toBe(false);
    });

    test("no ranges means no vacation days", () => {
      expect(isVacationDay("2026-08-10", [])).toBe(false);
    });

    test("a null day is never a vacation day", () => {
      expect(isVacationDay(null, TRIP)).toBe(false);
    });
  });

  describe("toRanges — malformed input cannot exempt history", () => {
    test("drops entries with a missing or inverted date", () => {
      expect(
        toRanges([
          { startDate: "2026-08-03" },
          { startDate: "2026-08-10", endDate: "2026-08-01" },
          null,
        ]),
      ).toEqual([]);
    });

    test("sorts by start date", () => {
      const sorted = toRanges([
        { startDate: "2026-09-01", endDate: "2026-09-02" },
        { startDate: "2026-08-01", endDate: "2026-08-02" },
      ]);
      expect(sorted.map((r) => r.startDate)).toEqual([
        "2026-08-01",
        "2026-09-01",
      ]);
    });

    test("tolerates a non-array", () => {
      expect(toRanges(undefined)).toEqual([]);
    });
  });

  describe("vacationDaysBetween", () => {
    test("counts the overlap, both ends inclusive", () => {
      expect(vacationDaysBetween("2026-08-01", "2026-08-20", TRIP)).toBe(13);
    });

    test("counts only the overlapping part", () => {
      expect(vacationDaysBetween("2026-08-10", "2026-08-20", TRIP)).toBe(6);
    });

    test("is zero when the spans do not meet", () => {
      expect(vacationDaysBetween("2026-08-16", "2026-08-20", TRIP)).toBe(0);
    });

    test("is zero for an inverted span", () => {
      expect(vacationDaysBetween("2026-08-20", "2026-08-01", TRIP)).toBe(0);
    });

    test("sums separate trips without double counting", () => {
      const two = [
        { startDate: "2026-08-03", endDate: "2026-08-05" },
        { startDate: "2026-08-10", endDate: "2026-08-12" },
      ];
      expect(vacationDaysBetween("2026-08-01", "2026-08-20", two)).toBe(6);
    });
  });

  test("vacationLength counts both ends", () => {
    expect(vacationLength(TRIP[0])).toBe(13);
    expect(
      vacationLength({ startDate: "2026-08-03", endDate: "2026-08-03" }),
    ).toBe(1);
  });

  describe("activeVacation / statsCutoff — the display freeze", () => {
    test("freezes at the day before departure while away", () => {
      expect(activeVacation(TRIP, "2026-08-10")).not.toBeNull();
      expect(statsCutoff(TRIP, "2026-08-10")).toBe("2026-08-02");
    });

    test("freezes from the very first vacation day", () => {
      expect(statsCutoff(TRIP, "2026-08-03")).toBe("2026-08-02");
    });

    test("no cutoff once home", () => {
      expect(activeVacation(TRIP, "2026-08-16")).toBeNull();
      expect(statsCutoff(TRIP, "2026-08-16")).toBeNull();
    });

    test("no cutoff before the trip starts", () => {
      expect(statsCutoff(TRIP, "2026-08-01")).toBeNull();
    });

    test("activeVacation returns the stored document, not a normalized range", () => {
      // The clients match the active vacation against the list by `_id`, so
      // searching `toRanges` output here (which keeps only the two dates)
      // silently broke that match.
      const stored = [
        {
          _id: "abc",
          startDate: "2026-08-03",
          endDate: "2026-08-15",
          note: "Goa",
        },
      ];
      expect(activeVacation(stored, "2026-08-10")).toMatchObject({
        _id: "abc",
        note: "Goa",
      });
    });

    test("activeVacation ignores a malformed range", () => {
      expect(activeVacation([{ startDate: "nope" }], "2026-08-10")).toBeNull();
      expect(activeVacation(undefined, "2026-08-10")).toBeNull();
    });
  });

  describe("recentlyEnded — the welcome-back window", () => {
    test("reports a trip that ended yesterday with its length", () => {
      expect(recentlyEnded(TRIP, "2026-08-16")).toEqual({
        startDate: "2026-08-03",
        endDate: "2026-08-15",
        days: 13,
        daysAgo: 1,
      });
    });

    test("still reports within the three-day grace window", () => {
      expect(recentlyEnded(TRIP, "2026-08-18").daysAgo).toBe(3);
    });

    test("stops reporting past the grace window", () => {
      expect(recentlyEnded(TRIP, "2026-08-19")).toBeNull();
    });

    test("does not report the trip the user is still on", () => {
      expect(recentlyEnded(TRIP, "2026-08-10")).toBeNull();
    });
  });

  describe("callPeriod — the documented calendar spans", () => {
    test("the 15th closes the first half of the month", () => {
      expect(callPeriod("2026-08-15", "biweekly")).toEqual({
        start: "2026-08-01",
        end: "2026-08-14",
        days: 14,
      });
    });

    test("month end closes the back half for a biweekly call", () => {
      expect(callPeriod("2026-08-31", "biweekly")).toEqual({
        start: "2026-08-15",
        end: "2026-08-31",
        days: 17,
      });
    });

    test("month end covers the whole month for a monthly call", () => {
      expect(callPeriod("2026-08-31", "monthly").days).toBe(31);
    });

    test("short months resolve their own last day", () => {
      expect(callPeriod("2026-02-28", "monthly").days).toBe(28);
    });
  });

  describe("isCallPeriodExempt — only a near-total overlap forgives", () => {
    test("a trip covering the whole period exempts it", () => {
      expect(
        isCallPeriodExempt("2026-08-15", "biweekly", [
          { startDate: "2026-08-01", endDate: "2026-08-14" },
        ]),
      ).toBe(true);
    });

    test("12 of 14 days away clears the 80% bar", () => {
      expect(
        isCallPeriodExempt("2026-08-15", "biweekly", [
          { startDate: "2026-08-01", endDate: "2026-08-12" },
        ]),
      ).toBe(true);
    });

    test("11 of 14 days away does not", () => {
      expect(
        isCallPeriodExempt("2026-08-15", "biweekly", [
          { startDate: "2026-08-01", endDate: "2026-08-11" },
        ]),
      ).toBe(false);
    });

    test("a short trip never excuses a whole period", () => {
      expect(
        isCallPeriodExempt("2026-08-15", "biweekly", [
          { startDate: "2026-08-03", endDate: "2026-08-05" },
        ]),
      ).toBe(false);
    });

    test("no vacation is never exempt", () => {
      expect(isCallPeriodExempt("2026-08-15", "biweekly", [])).toBe(false);
    });
  });

  describe("eventDay — which day an event is judged on", () => {
    test("outcome events use their dueDate", () => {
      expect(eventDay({ type: "habit_result", dueDate: "2026-08-04" })).toBe(
        "2026-08-04",
      );
    });

    test("a completion uses the day it was finished", () => {
      expect(
        eventDay({
          type: "task_completed",
          doneAt: new Date("2026-08-04T18:00:00Z"),
          at: new Date("2026-08-09T00:00:00Z"),
        }),
      ).toBe("2026-08-04");
    });

    test("a reschedule has no dueDate, so it uses its own timestamp", () => {
      expect(
        eventDay({
          type: "task_rescheduled",
          at: new Date("2026-08-04T09:00:00Z"),
        }),
      ).toBe("2026-08-04");
    });
  });

  describe("isPausedResult — the asymmetry that makes vacation work", () => {
    test("a missed day on vacation is paused", () => {
      expect(
        isPausedResult(
          { type: "habit_result", dueDate: "2026-08-04", completed: false },
          TRIP,
        ),
      ).toBe(true);
    });

    test("a day the user actually did is never paused — credit is kept", () => {
      expect(
        isPausedResult(
          { type: "habit_result", dueDate: "2026-08-04", completed: true },
          TRIP,
        ),
      ).toBe(false);
    });

    test("a missed day outside the trip is an ordinary miss", () => {
      expect(
        isPausedResult(
          { type: "habit_result", dueDate: "2026-08-20", completed: false },
          TRIP,
        ),
      ).toBe(false);
    });
  });

  describe("isVacationEvent — timestamp or explicit flag", () => {
    test("an event during the trip qualifies on its timestamp", () => {
      expect(
        isVacationEvent(
          { type: "task_rescheduled", at: new Date("2026-08-04T09:00:00Z") },
          TRIP,
        ),
      ).toBe(true);
    });

    test("a trip booked in advance qualifies only via the flag", () => {
      const bookedAhead = {
        type: "task_rescheduled",
        at: new Date("2026-07-20T09:00:00Z"),
        vacationMove: true,
      };
      expect(isVacationEvent(bookedAhead, TRIP)).toBe(true);
      expect(
        isVacationEvent({ ...bookedAhead, vacationMove: false }, TRIP),
      ).toBe(false);
    });
  });

  describe("adjustedSlippage — lateness minus the days away", () => {
    test("subtracts the trip from a task that outlived it", () => {
      // Planned Aug 1, done Aug 20, away Aug 3–15: only Aug 1–2 and 16–20
      // were ever actionable, so six days late, not nineteen.
      expect(adjustedSlippage("2026-08-01", "2026-08-20", 19, TRIP)).toBe(6);
    });

    test("a task planned mid-trip behaves as if due the day back", () => {
      expect(adjustedSlippage("2026-08-05", "2026-08-20", 15, TRIP)).toBe(4);
    });

    test("leaves an unaffected task alone", () => {
      expect(adjustedSlippage("2026-09-01", "2026-09-03", 2, TRIP)).toBe(2);
    });

    test("never turns lateness negative", () => {
      expect(adjustedSlippage("2026-08-05", "2026-08-06", 1, TRIP)).toBe(0);
    });

    test("passes early and on-the-day completions straight through", () => {
      expect(adjustedSlippage("2026-08-20", "2026-08-18", -2, TRIP)).toBe(-2);
      expect(adjustedSlippage("2026-08-20", "2026-08-20", 0, TRIP)).toBe(0);
    });

    test("null stays null", () => {
      expect(adjustedSlippage(null, null, null, TRIP)).toBeNull();
    });
  });
});
