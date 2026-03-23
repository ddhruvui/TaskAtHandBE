const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the Monday (weekStart) and Sunday (weekEnd) of the current week.
 */
function getCurrentWeekBounds() {
  // Use UTC to stay consistent with how date-only ECD strings are stored
  // (JavaScript parses "YYYY-MM-DD" as UTC midnight).
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

function toDateString(date) {
  return date.toISOString().split("T")[0];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Events", () => {
  beforeAll(async () => {
    await connectDB();
    const db = await getDatabase();
    await db.collection("Events-Test").deleteMany({});
    console.log("Events Tests: Events-Test collection cleared");
  });

  beforeEach(async () => {
    const db = await getDatabase();
    await db.collection("Events-Test").deleteMany({});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe("CREATE - POST /api/events", () => {
    test("should create an event with all fields", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({
          name: "Annual Review",
          notes: "Yearly performance review",
          done: false,
          ecd: "2026-06-15",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.name).toBe("Annual Review");
      expect(response.body.data.notes).toBe("Yearly performance review");
      expect(response.body.data.done).toBe(false);
      expect(response.body.data).toHaveProperty("ecd");
      expect(response.body.data.priority).toBe(0);
    });

    test("should create an event with only name", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "Simple Event" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Simple Event");
      expect(response.body.data.notes).toBe("");
      expect(response.body.data.done).toBe(false);
      expect(response.body.data.ecd).toBeNull();
      expect(response.body.data.priority).toBe(0);
    });

    test("should reject event without name", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ notes: "No name" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Event name must be a non-empty string");
    });

    test("should reject event with empty name", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "   " })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Event name must be a non-empty string");
    });

    test("should trim whitespace from name", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "  Padded Event  " })
        .expect(201);

      expect(response.body.data.name).toBe("Padded Event");
    });

    test("should assign sequential priorities for multiple events", async () => {
      await request(app).post("/api/events").send({ name: "Event A" });
      await request(app).post("/api/events").send({ name: "Event B" });
      await request(app).post("/api/events").send({ name: "Event C" });

      const response = await request(app).get("/api/events").expect(200);
      const events = response.body.data;

      expect(events.length).toBe(3);
      expect(events[0].priority).toBe(0);
      expect(events[1].priority).toBe(1);
      expect(events[2].priority).toBe(2);
    });

    test("new event should be inserted before done events", async () => {
      await request(app)
        .post("/api/events")
        .send({ name: "Done Event", done: true });
      await request(app).post("/api/events").send({ name: "New Undone Event" });

      const response = await request(app).get("/api/events").expect(200);
      const events = response.body.data;

      const newIdx = events.findIndex((e) => e.name === "New Undone Event");
      const doneIdx = events.findIndex((e) => e.name === "Done Event");

      expect(newIdx).toBeLessThan(doneIdx);
    });
  });

  describe("READ - GET /api/events", () => {
    test("should return all events sorted by priority", async () => {
      await request(app).post("/api/events").send({ name: "First" });
      await request(app).post("/api/events").send({ name: "Second" });

      const response = await request(app).get("/api/events").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data[0].name).toBe("First");
      expect(response.body.data[1].name).toBe("Second");
    });

    test("should return an event by ID", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Find Me" });
      const id = created.body.data._id;

      const response = await request(app).get(`/api/events/${id}`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(id);
      expect(response.body.data.name).toBe("Find Me");
    });

    test("should return 404 for unknown ID", async () => {
      const response = await request(app)
        .get("/api/events/000000000000000000000000")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Event not found");
    });

    test("should return event count", async () => {
      await request(app).post("/api/events").send({ name: "E1" });
      await request(app).post("/api/events").send({ name: "E2" });

      const response = await request(app).get("/api/events/count").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
    });
  });

  describe("UPDATE - PUT /api/events/:id", () => {
    test("should update event name and notes", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Old Name", notes: "Old notes" });
      const id = created.body.data._id;

      const response = await request(app)
        .put(`/api/events/${id}`)
        .send({ name: "New Name", notes: "New notes" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("New Name");
      expect(response.body.data.notes).toBe("New notes");
    });

    test("marking an event done moves it to last priority", async () => {
      await request(app).post("/api/events").send({ name: "E1" });
      await request(app).post("/api/events").send({ name: "E2" });
      const target = await request(app)
        .post("/api/events")
        .send({ name: "E3" });
      const id = target.body.data._id;

      await request(app)
        .put(`/api/events/${id}`)
        .send({ done: true })
        .expect(200);

      const updated = await request(app).get(`/api/events/${id}`);
      expect(updated.body.data.done).toBe(true);
      expect(updated.body.data.priority).toBe(2); // last of 3
    });

    test("marking an event undone moves it to first priority", async () => {
      await request(app).post("/api/events").send({ name: "Undone First" });
      const e2 = await request(app)
        .post("/api/events")
        .send({ name: "Done", done: true });
      const id = e2.body.data._id;

      await request(app)
        .put(`/api/events/${id}`)
        .send({ done: false })
        .expect(200);

      const updated = await request(app).get(`/api/events/${id}`);
      expect(updated.body.data.done).toBe(false);
      expect(updated.body.data.priority).toBe(0);
    });

    test("should return 404 for unknown ID", async () => {
      const response = await request(app)
        .put("/api/events/000000000000000000000000")
        .send({ name: "Ghost" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Event not found");
    });

    test("should return 400 when no valid fields are provided", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "E" });
      const id = created.body.data._id;

      const response = await request(app)
        .put(`/api/events/${id}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("No valid fields to update");
    });
  });

  describe("DELETE - DELETE /api/events/:id", () => {
    test("should delete an event and reorder priorities", async () => {
      await request(app).post("/api/events").send({ name: "Keep A" });
      const target = await request(app)
        .post("/api/events")
        .send({ name: "Delete Me" });
      await request(app).post("/api/events").send({ name: "Keep B" });
      const id = target.body.data._id;

      await request(app).delete(`/api/events/${id}`).expect(200);

      const response = await request(app).get("/api/events");
      const events = response.body.data;

      expect(events.length).toBe(2);
      expect(events.find((e) => e.name === "Delete Me")).toBeUndefined();
      expect(events[0].priority).toBe(0);
      expect(events[1].priority).toBe(1);
    });

    test("should return 404 when deleting unknown event", async () => {
      const response = await request(app)
        .delete("/api/events/000000000000000000000000")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Event not found");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ECD BEHAVIOR (adds 1 year when marked done)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ECD on create", () => {
    test("should store a valid future ECD", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "Future Event", ecd: "2027-01-15" })
        .expect(201);

      expect(response.body.data.ecd).toBeTruthy();
    });

    test("should store a past ECD without error", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "Past Event", ecd: "2025-01-01" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ecd).toBeTruthy();
    });

    test("should store null ECD when not provided", async () => {
      const response = await request(app)
        .post("/api/events")
        .send({ name: "No ECD Event" })
        .expect(201);

      expect(response.body.data.ecd).toBeNull();
    });
  });

  describe("ECD advances by 1 year when marked done", () => {
    test("should add 1 year to ECD when event is marked done", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Recurring Event", ecd: "2026-06-15T00:00:00.000Z" });
      const id = created.body.data._id;
      const originalEcd = new Date(created.body.data.ecd);

      await request(app)
        .put(`/api/events/${id}`)
        .send({ done: true })
        .expect(200);

      const fetched = await request(app).get(`/api/events/${id}`);
      const updatedEcd = new Date(fetched.body.data.ecd);

      expect(updatedEcd.getFullYear()).toBe(originalEcd.getFullYear() + 1);
      expect(updatedEcd.getMonth()).toBe(originalEcd.getMonth());
      expect(updatedEcd.getDate()).toBe(originalEcd.getDate());
    });

    test("should NOT modify ECD when event has no ECD and is marked done", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "No ECD Event" });
      const id = created.body.data._id;

      await request(app)
        .put(`/api/events/${id}`)
        .send({ done: true })
        .expect(200);

      const fetched = await request(app).get(`/api/events/${id}`);
      expect(fetched.body.data.ecd).toBeNull();
      expect(fetched.body.data.done).toBe(true);
    });

    test("should add 1 year each time event is toggled done→undone→done", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Recurring Toggle", ecd: "2026-03-01T00:00:00.000Z" });
      const id = created.body.data._id;

      // First done: ECD becomes 2027-03-01
      await request(app).put(`/api/events/${id}`).send({ done: true });
      let fetched = await request(app).get(`/api/events/${id}`);
      expect(new Date(fetched.body.data.ecd).getFullYear()).toBe(2027);

      // Mark undone — ECD should NOT change
      await request(app).put(`/api/events/${id}`).send({ done: false });
      fetched = await request(app).get(`/api/events/${id}`);
      expect(new Date(fetched.body.data.ecd).getFullYear()).toBe(2027);

      // Second done: ECD becomes 2028-03-01
      await request(app).put(`/api/events/${id}`).send({ done: true });
      fetched = await request(app).get(`/api/events/${id}`);
      expect(new Date(fetched.body.data.ecd).getFullYear()).toBe(2028);
    });

    test("should NOT add 1 year when re-marking an already-done event as done", async () => {
      const created = await request(app).post("/api/events").send({
        name: "Already Done",
        ecd: "2026-05-10T00:00:00.000Z",
        done: true,
      });
      const id = created.body.data._id;

      const ecdBefore = (await request(app).get(`/api/events/${id}`)).body.data
        .ecd;

      await request(app).put(`/api/events/${id}`).send({ done: true });

      const ecdAfter = (await request(app).get(`/api/events/${id}`)).body.data
        .ecd;
      expect(ecdAfter).toBe(ecdBefore);
    });
  });

  describe("ECD manual update", () => {
    test("should allow updating ECD directly", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Event", ecd: "2026-06-01" });
      const id = created.body.data._id;

      await request(app)
        .put(`/api/events/${id}`)
        .send({ ecd: "2027-12-31" })
        .expect(200);

      const fetched = await request(app).get(`/api/events/${id}`);
      const updatedEcd = new Date(fetched.body.data.ecd);
      expect(updatedEcd.getFullYear()).toBe(2027);
      expect(updatedEcd.getMonth()).toBe(11); // December (0-indexed)
    });

    test("should allow clearing ECD by setting to null", async () => {
      const created = await request(app)
        .post("/api/events")
        .send({ name: "Event with ECD", ecd: "2026-06-01" });
      const id = created.body.data._id;

      await request(app)
        .put(`/api/events/${id}`)
        .send({ ecd: null })
        .expect(200);

      const fetched = await request(app).get(`/api/events/${id}`);
      expect(fetched.body.data.ecd).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHRON
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Chron - DELETE /api/events/chron", () => {
    describe("Events are never deleted by chron", () => {
      test("should keep all events (done and undone) after chron runs", async () => {
        const { weekStart } = getCurrentWeekBounds();

        await request(app)
          .post("/api/events")
          .send({ name: "Undone Event", done: false });
        await request(app)
          .post("/api/events")
          .send({ name: "Done Event No ECD", done: true });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done Event This Week",
            done: true,
            ecd: toDateString(weekStart),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.success).toBe(true);

        const allEvents = await request(app).get("/api/events");
        expect(allEvents.body.count).toBe(3);
      });

      test("should handle empty collection gracefully", async () => {
        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.markedUndoneCount).toBe(0);
        expect(response.body.movedCount).toBe(0);
      });
    });

    describe("Uncheck done events with ECD in the current week", () => {
      test("should uncheck a done event whose ECD is this week (Monday)", async () => {
        const { weekStart } = getCurrentWeekBounds();

        const created = await request(app)
          .post("/api/events")
          .send({
            name: "Done This Week Event",
            done: true,
            ecd: toDateString(weekStart),
          });
        const id = created.body.data._id;

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.markedUndoneCount).toBe(1);

        const fetched = await request(app).get(`/api/events/${id}`);
        expect(fetched.body.data.done).toBe(false);
      });

      test("should uncheck a done event whose ECD is this week (Sunday)", async () => {
        const { weekEnd } = getCurrentWeekBounds();

        const created = await request(app)
          .post("/api/events")
          .send({
            name: "Done Sunday Event",
            done: true,
            ecd: toDateString(weekEnd),
          });
        const id = created.body.data._id;

        await request(app).delete("/api/events/chron").expect(200);

        const fetched = await request(app).get(`/api/events/${id}`);
        expect(fetched.body.data.done).toBe(false);
      });

      test("should uncheck multiple done events with ECD in this week", async () => {
        const { weekStart, weekEnd } = getCurrentWeekBounds();

        await request(app)
          .post("/api/events")
          .send({
            name: "Done Mon",
            done: true,
            ecd: toDateString(weekStart),
          });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done Sun",
            done: true,
            ecd: toDateString(weekEnd),
          });
        await request(app)
          .post("/api/events")
          .send({
            name: "Undone This Week",
            done: false,
            ecd: toDateString(weekStart),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.markedUndoneCount).toBe(2);

        const allEvents = await request(app).get("/api/events");
        expect(allEvents.body.data.every((e) => e.done === false)).toBe(true);
      });

      test("should NOT uncheck done events with ECD outside the current week", async () => {
        const { weekStart } = getCurrentWeekBounds();
        const nextWeek = new Date(weekStart);
        nextWeek.setDate(weekStart.getDate() + 8);

        const created = await request(app)
          .post("/api/events")
          .send({
            name: "Done Next Week",
            done: true,
            ecd: toDateString(nextWeek),
          });
        const id = created.body.data._id;

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.markedUndoneCount).toBe(0);

        const fetched = await request(app).get(`/api/events/${id}`);
        expect(fetched.body.data.done).toBe(true);
      });

      test("should NOT uncheck done events with no ECD", async () => {
        const created = await request(app).post("/api/events").send({
          name: "Done No ECD",
          done: true,
        });
        const id = created.body.data._id;

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.markedUndoneCount).toBe(0);

        const fetched = await request(app).get(`/api/events/${id}`);
        expect(fetched.body.data.done).toBe(true);
      });

      test("should return markedUndoneCount = 0 when no done events exist", async () => {
        const { weekStart } = getCurrentWeekBounds();

        await request(app)
          .post("/api/events")
          .send({
            name: "Undone Event",
            done: false,
            ecd: toDateString(weekStart),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.markedUndoneCount).toBe(0);
      });
    });

    describe("Unchecked events move to lowest priority", () => {
      test("should move the newly-unchecked event to lowest priority", async () => {
        const { weekStart } = getCurrentWeekBounds();

        await request(app).post("/api/events").send({ name: "Normal 1" });
        await request(app).post("/api/events").send({ name: "Normal 2" });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done This Week",
            done: true,
            ecd: toDateString(weekStart),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.movedCount).toBe(1);

        const allEvents = await request(app).get("/api/events");
        const events = allEvents.body.data;

        expect(events.length).toBe(3);
        expect(events[2].name).toBe("Done This Week");
        expect(events[2].priority).toBe(2);
      });

      test("should move multiple unchecked events to lowest priorities", async () => {
        const { weekStart, weekEnd } = getCurrentWeekBounds();

        await request(app).post("/api/events").send({ name: "Normal 1" });
        await request(app).post("/api/events").send({ name: "Normal 2" });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done Mon",
            done: true,
            ecd: toDateString(weekStart),
          });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done Sun",
            done: true,
            ecd: toDateString(weekEnd),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.movedCount).toBe(2);

        const allEvents = await request(app).get("/api/events");
        const events = allEvents.body.data;

        expect(events.length).toBe(4);
        const lastTwo = events.slice(2).map((e) => e.name);
        expect(lastTwo).toContain("Done Mon");
        expect(lastTwo).toContain("Done Sun");
      });

      test("should reorder priorities sequentially after chron", async () => {
        const { weekStart } = getCurrentWeekBounds();

        await request(app).post("/api/events").send({ name: "E1" });
        await request(app)
          .post("/api/events")
          .send({
            name: "E2",
            done: true,
            ecd: toDateString(weekStart),
          });
        await request(app).post("/api/events").send({ name: "E3" });

        await request(app).delete("/api/events/chron").expect(200);

        const allEvents = await request(app).get("/api/events");
        const events = allEvents.body.data;

        expect(events.length).toBe(3);
        expect(events[0].priority).toBe(0);
        expect(events[1].priority).toBe(1);
        expect(events[2].priority).toBe(2);
      });
    });

    describe("Combined functionality", () => {
      test("should uncheck this-week events, leave other done events alone", async () => {
        const { weekStart } = getCurrentWeekBounds();
        const nextWeek = new Date(weekStart);
        nextWeek.setDate(weekStart.getDate() + 8);

        await request(app).post("/api/events").send({ name: "Normal Undone" });
        const doneThisWeek = await request(app)
          .post("/api/events")
          .send({
            name: "Done ECD This Week",
            done: true,
            ecd: toDateString(weekStart),
          });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done ECD Next Week",
            done: true,
            ecd: toDateString(nextWeek),
          });
        await request(app).post("/api/events").send({
          name: "Done No ECD",
          done: true,
        });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);
        expect(response.body.success).toBe(true);
        expect(response.body.markedUndoneCount).toBe(1);

        const allEvents = await request(app).get("/api/events");
        expect(allEvents.body.data.length).toBe(4); // Nothing deleted

        const thisWeekEvent = allEvents.body.data.find(
          (e) => e.name === "Done ECD This Week",
        );
        expect(thisWeekEvent.done).toBe(false);

        const nextWeekEvent = allEvents.body.data.find(
          (e) => e.name === "Done ECD Next Week",
        );
        expect(nextWeekEvent.done).toBe(true);

        const noEcdEvent = allEvents.body.data.find(
          (e) => e.name === "Done No ECD",
        );
        expect(noEcdEvent.done).toBe(true);
      });
    });

    describe("Response format", () => {
      test("should return correct response structure", async () => {
        const { weekStart } = getCurrentWeekBounds();

        await request(app).post("/api/events").send({ name: "Normal" });
        await request(app)
          .post("/api/events")
          .send({
            name: "Done This Week",
            done: true,
            ecd: toDateString(weekStart),
          });

        const response = await request(app)
          .delete("/api/events/chron")
          .expect(200);

        expect(response.body).toHaveProperty("success");
        expect(response.body).toHaveProperty("markedUndoneCount");
        expect(response.body).toHaveProperty("movedCount");
        expect(response.body).toHaveProperty("message");
        expect(typeof response.body.markedUndoneCount).toBe("number");
        expect(typeof response.body.movedCount).toBe("number");
        expect(typeof response.body.message).toBe("string");
      });
    });
  });
});
