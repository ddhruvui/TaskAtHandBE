const request = require("supertest");
const app = require("../src/server");
const { connectDB, getDatabase } = require("../src/config/db");

async function clearCollections() {
  const db = await getDatabase();
  await db.collection("Vacations-Test").deleteMany({});
  await db.collection("Headers-Test").deleteMany({});
  await db.collection("Tasks-Test").deleteMany({});
  await db.collection("TaskArchive-Test").deleteMany({});
}

/** Not `async`: callers chain `.expect(...)` on the supertest request itself. */
function createVacation(body) {
  return request(app).post("/vacations").send(body);
}

async function createHeader(name) {
  const res = await request(app).post("/headers").send({ name });
  return res.body;
}

async function createTask(data) {
  const res = await request(app).post("/tasks").send(data);
  return res.body;
}

/** Today as the "YYYY-MM-DD" UTC day the API measures vacations in. */
function todayUtc(offsetDays = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("Vacations", () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("POST /vacations — booking", () => {
    test("creates a vacation with both inclusive dates", async () => {
      const res = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
        note: "Kerala trip",
      }).expect(201);

      expect(res.body._id).toBeDefined();
      expect(res.body.startDate).toBe("2026-09-03");
      expect(res.body.endDate).toBe("2026-09-15");
      expect(res.body.note).toBe("Kerala trip");
      expect(res.body.createdAt).toBeDefined();
    });

    test("allows a single-day vacation (start === end)", async () => {
      const res = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-03",
      }).expect(201);
      expect(res.body.startDate).toBe(res.body.endDate);
    });

    test("rejects a missing endDate — both dates are mandatory", async () => {
      const res = await createVacation({ startDate: "2026-09-03" }).expect(400);
      expect(res.body.error).toMatch(/endDate/);
    });

    test("rejects a malformed date", async () => {
      const res = await createVacation({
        startDate: "03-09-2026",
        endDate: "2026-09-15",
      }).expect(400);
      expect(res.body.error).toMatch(/startDate/);
    });

    test("rejects endDate before startDate", async () => {
      const res = await createVacation({
        startDate: "2026-09-15",
        endDate: "2026-09-03",
      }).expect(400);
      expect(res.body.error).toMatch(/on or after/);
    });

    test("rejects a range overlapping an existing one", async () => {
      await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      }).expect(201);

      const res = await createVacation({
        startDate: "2026-09-14",
        endDate: "2026-09-20",
      }).expect(400);
      expect(res.body.error).toMatch(/overlaps/);
    });

    test("allows a range that starts the day after another ends", async () => {
      await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      }).expect(201);
      await createVacation({
        startDate: "2026-09-16",
        endDate: "2026-09-20",
      }).expect(201);
    });
  });

  describe("GET /vacations", () => {
    test("returns every vacation, oldest start date first", async () => {
      await createVacation({ startDate: "2026-11-01", endDate: "2026-11-05" });
      await createVacation({ startDate: "2026-09-03", endDate: "2026-09-15" });

      const res = await request(app).get("/vacations").expect(200);
      expect(res.body.map((v) => v.startDate)).toEqual([
        "2026-09-03",
        "2026-11-01",
      ]);
    });

    test("returns an empty array when nothing is booked", async () => {
      const res = await request(app).get("/vacations").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /vacations/status", () => {
    test("reports onVacation=false with no ranges", async () => {
      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.onVacation).toBe(false);
      expect(res.body.active).toBeNull();
      expect(res.body.upcoming).toEqual([]);
    });

    test("reports the active vacation with its day counts", async () => {
      await createVacation({
        startDate: todayUtc(-2),
        endDate: todayUtc(3),
      }).expect(201);

      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.onVacation).toBe(true);
      expect(res.body.active.totalDays).toBe(6);
      expect(res.body.active.dayOfVacation).toBe(3);
      expect(res.body.active.daysRemaining).toBe(3);
    });

    test("counts the first and last day as vacation days", async () => {
      await createVacation({
        startDate: todayUtc(),
        endDate: todayUtc(),
      }).expect(201);

      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.onVacation).toBe(true);
      expect(res.body.active.dayOfVacation).toBe(1);
      expect(res.body.active.daysRemaining).toBe(0);
    });

    test("lists future vacations under upcoming without activating them", async () => {
      await createVacation({
        startDate: todayUtc(10),
        endDate: todayUtc(20),
      }).expect(201);

      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.onVacation).toBe(false);
      expect(res.body.upcoming).toHaveLength(1);
    });

    test("reports a vacation that ended yesterday as justReturnedFrom", async () => {
      await createVacation({
        startDate: todayUtc(-5),
        endDate: todayUtc(-1),
      }).expect(201);

      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.onVacation).toBe(false);
      expect(res.body.justReturnedFrom.days).toBe(5);
      expect(res.body.justReturnedFrom.daysAgo).toBe(1);
    });

    test("does not report a vacation that ended long ago", async () => {
      await createVacation({
        startDate: todayUtc(-20),
        endDate: todayUtc(-10),
      }).expect(201);

      const res = await request(app).get("/vacations/status").expect(200);
      expect(res.body.justReturnedFrom).toBeNull();
    });
  });

  describe("PUT /vacations/:id", () => {
    test("corrects a forgotten start date", async () => {
      const created = await createVacation({
        startDate: "2026-09-05",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .put(`/vacations/${created.body._id}`)
        .send({ startDate: "2026-09-03" })
        .expect(200);
      expect(res.body.startDate).toBe("2026-09-03");
      expect(res.body.endDate).toBe("2026-09-15");
    });

    test("shortens a vacation when the user comes home early", async () => {
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .put(`/vacations/${created.body._id}`)
        .send({ endDate: "2026-09-09" })
        .expect(200);
      expect(res.body.endDate).toBe("2026-09-09");
    });

    test("validates the resulting range, not just the field sent", async () => {
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .put(`/vacations/${created.body._id}`)
        .send({ endDate: "2026-09-01" })
        .expect(400);
      expect(res.body.error).toMatch(/on or after/);
    });

    test("does not treat the row being edited as an overlap with itself", async () => {
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      await request(app)
        .put(`/vacations/${created.body._id}`)
        .send({ endDate: "2026-09-20" })
        .expect(200);
    });

    test("still rejects an edit that collides with another vacation", async () => {
      const first = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-10",
      });
      await createVacation({ startDate: "2026-09-20", endDate: "2026-09-25" });

      const res = await request(app)
        .put(`/vacations/${first.body._id}`)
        .send({ endDate: "2026-09-21" })
        .expect(400);
      expect(res.body.error).toMatch(/overlaps/);
    });

    test("404s for an unknown id", async () => {
      await request(app)
        .put("/vacations/507f1f77bcf86cd799439011")
        .send({ endDate: "2026-09-20" })
        .expect(404);
    });
  });

  describe("DELETE /vacations/:id", () => {
    test("deletes a vacation", async () => {
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .delete(`/vacations/${created.body._id}`)
        .expect(200);
      expect(res.body).toEqual({ deleted: created.body._id });

      const all = await request(app).get("/vacations").expect(200);
      expect(all.body).toEqual([]);
    });

    test("404s for an unknown id", async () => {
      await request(app)
        .delete("/vacations/507f1f77bcf86cd799439011")
        .expect(404);
    });
  });

  describe("GET /vacations/:id/tasks — the re-date list", () => {
    test("returns undone one-time dated tasks inside the window, with headerName", async () => {
      const header = await createHeader("Work");
      await createTask({
        name: "Inside",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .get(`/vacations/${created.body._id}/tasks`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Inside");
      expect(res.body[0].headerName).toBe("Work");
    });

    test("includes tasks dated on the first and last day", async () => {
      const header = await createHeader("Work");
      await createTask({
        name: "First day",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-03" },
      });
      await createTask({
        name: "Last day",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-15" },
      });
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .get(`/vacations/${created.body._id}/tasks`)
        .expect(200);
      expect(res.body.map((t) => t.name).sort()).toEqual([
        "First day",
        "Last day",
      ]);
    });

    test("excludes tasks outside the window", async () => {
      const header = await createHeader("Work");
      await createTask({
        name: "Before",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-02" },
      });
      await createTask({
        name: "After",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-16" },
      });
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .get(`/vacations/${created.body._id}/tasks`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    test("excludes recurring tasks — they cannot be moved, only exempted", async () => {
      const header = await createHeader("Health");
      await createTask({
        name: "Meditate",
        headerId: header._id,
        ecd: { type: "day_of_week", value: ["Mon", "Wed"] },
      });
      await createTask({
        name: "Pay rent",
        headerId: header._id,
        ecd: { type: "day_of_month", value: [5] },
      });
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .get(`/vacations/${created.body._id}/tasks`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    test("excludes tasks already done", async () => {
      const header = await createHeader("Work");
      const task = await createTask({
        name: "Already done",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });
      await request(app).put(`/tasks/${task._id}`).send({ done: true });
      const created = await createVacation({
        startDate: "2026-09-03",
        endDate: "2026-09-15",
      });

      const res = await request(app)
        .get(`/vacations/${created.body._id}/tasks`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    test("404s for an unknown vacation", async () => {
      await request(app)
        .get("/vacations/507f1f77bcf86cd799439011/tasks")
        .expect(404);
    });
  });

  describe("Re-dating out of a vacation", () => {
    test("flags the reschedule as a vacationMove so it is not procrastination", async () => {
      const header = await createHeader("Work");
      const task = await createTask({
        name: "Move me",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });

      await request(app)
        .put(`/tasks/${task._id}`)
        .send({
          ecd: { type: "date", value: "2026-09-16" },
          vacationMove: true,
        })
        .expect(200);

      const db = await getDatabase();
      const events = await db
        .collection("TaskArchive-Test")
        .find({ type: "task_rescheduled" })
        .toArray();
      expect(events).toHaveLength(1);
      expect(events[0].pushedLater).toBe(true);
      expect(events[0].vacationMove).toBe(true);
    });

    test("an ordinary postpone is not flagged", async () => {
      const header = await createHeader("Work");
      const task = await createTask({
        name: "Ordinary",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });

      await request(app)
        .put(`/tasks/${task._id}`)
        .send({ ecd: { type: "date", value: "2026-09-09" } })
        .expect(200);

      const db = await getDatabase();
      const events = await db
        .collection("TaskArchive-Test")
        .find({ type: "task_rescheduled" })
        .toArray();
      expect(events[0].vacationMove).toBe(false);
    });

    test("vacationMove is never written onto the task itself", async () => {
      const header = await createHeader("Work");
      const task = await createTask({
        name: "Clean doc",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });

      const res = await request(app)
        .put(`/tasks/${task._id}`)
        .send({
          ecd: { type: "date", value: "2026-09-16" },
          vacationMove: true,
        })
        .expect(200);
      expect(res.body.vacationMove).toBeUndefined();
    });

    test("rejects a non-boolean vacationMove", async () => {
      const header = await createHeader("Work");
      const task = await createTask({
        name: "Bad flag",
        headerId: header._id,
        ecd: { type: "date", value: "2026-09-07" },
      });

      const res = await request(app)
        .put(`/tasks/${task._id}`)
        .send({ vacationMove: "yes" })
        .expect(400);
      expect(res.body.error).toMatch(/vacationMove/);
    });
  });
});
