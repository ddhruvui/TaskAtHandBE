const { getDatabase } = require("../config/db");

class Event {
  /**
   * Get the events collection for the current environment
   * @returns {Promise<Collection>} MongoDB collection
   */
  static async getCollection() {
    const db = await getDatabase();
    const useTestDB = process.env.USE_TEST_DB === "true";
    const collectionName = useTestDB ? "Events-Test" : "Event";
    console.log(
      `Using collection: ${collectionName} (USE_TEST_DB=${process.env.USE_TEST_DB})`,
    );
    return db.collection(collectionName);
  }

  /**
   * Get all events sorted by priority
   * @returns {Promise<Array>} Array of events
   */
  static async findAll() {
    const collection = await this.getCollection();
    return await collection.find({}).sort({ priority: 1 }).toArray();
  }

  /**
   * Find an event by ID
   * @param {ObjectId} id - Event ID
   * @returns {Promise<Object|null>} Event object or null
   */
  static async findById(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new event
   * @param {Object} eventData - Event data (name, notes, done, ecd)
   * @returns {Promise<Object>} Created event
   */
  static async create(eventData) {
    const collection = await this.getCollection();

    // Count undone events to insert new event before done events
    const undoneCount = await collection.countDocuments({ done: false });

    // Shift all done events down by 1 to make room for the new event
    await collection.updateMany({ done: true }, { $inc: { priority: 1 } });

    const newEvent = {
      name: eventData.name,
      notes: eventData.notes || "",
      priority: undoneCount, // New event gets inserted before done events
      done: eventData.done || false,
      ecd: eventData.ecd ? new Date(eventData.ecd) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newEvent);
    return { _id: result.insertedId, ...newEvent };
  }

  /**
   * Update an event
   * When marked done, adds 1 year to the ecd date.
   * @param {ObjectId} id - Event ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated event or null
   */
  static async update(id, updateData) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const currentEvent = await this.findById(id);
    if (!currentEvent) return null;

    const count = await collection.countDocuments();

    // If event is being marked as done and it wasn't done before
    if (updateData.done === true && currentEvent.done === false) {
      const oldPriority = currentEvent.priority;
      const newPriority = count - 1;

      // Set the event's priority to the last position
      updateData.priority = newPriority;

      // Shift up all events with priority greater than the current event
      await collection.updateMany(
        { priority: { $gt: oldPriority } },
        { $inc: { priority: -1 } },
      );

      // Add 1 year to the ecd when marked as done
      if (currentEvent.ecd) {
        const newEcd = new Date(currentEvent.ecd);
        newEcd.setFullYear(newEcd.getFullYear() + 1);
        updateData.ecd = newEcd;
      }
    }
    // If event is being marked as undone and it was done before
    else if (updateData.done === false && currentEvent.done === true) {
      const oldPriority = currentEvent.priority;

      // Set the event's priority to the first position
      updateData.priority = 0;

      // Shift down all events with priority less than the current event
      await collection.updateMany(
        { priority: { $lt: oldPriority } },
        { $inc: { priority: 1 } },
      );
    }
    // If priority is being updated manually, reorder events
    else if (updateData.priority !== undefined) {
      const oldPriority = currentEvent.priority;
      const newPriority = updateData.priority;

      if (newPriority < 0 || newPriority >= count) {
        throw new Error(`Priority must be between 0 and ${count - 1}`);
      }

      // Enforce done/not-done boundary:
      // Not done items must stay above done items (lower priority numbers)
      // Done items must stay below not done items (higher priority numbers)
      const undoneCount = await collection.countDocuments({ done: false });
      if (!currentEvent.done && newPriority >= undoneCount) {
        throw new Error(
          "Not done task cannot have priority greater than or equal to a done task",
        );
      }
      if (currentEvent.done && newPriority < undoneCount) {
        throw new Error(
          "Done task cannot have priority less than a not done task",
        );
      }

      if (oldPriority !== newPriority) {
        if (newPriority < oldPriority) {
          await collection.updateMany(
            { priority: { $gte: newPriority, $lt: oldPriority } },
            { $inc: { priority: 1 } },
          );
        } else {
          await collection.updateMany(
            { priority: { $gt: oldPriority, $lte: newPriority } },
            { $inc: { priority: -1 } },
          );
        }
      }
    }

    const updates = {
      ...updateData,
      updatedAt: new Date(),
    };

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" },
    );

    return result;
  }

  /**
   * Delete an event and reorder priorities
   * @param {ObjectId} id - Event ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    const collection = await this.getCollection();
    const { ObjectId } = require("mongodb");

    const event = await this.findById(id);
    if (!event) return false;

    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      await collection.updateMany(
        { priority: { $gt: event.priority } },
        { $inc: { priority: -1 } },
      );
      return true;
    }

    return false;
  }

  /**
   * Get event count
   * @returns {Promise<number>} Count of events
   */
  static async count() {
    const collection = await this.getCollection();
    return await collection.countDocuments();
  }

  /**
   * Chron action: uncheck events whose ecd falls within the current week.
   * Does NOT delete any events. Unchecked events are moved to lowest priority.
   * @returns {Promise<Object>} { markedUndoneCount, movedCount }
   */
  static async chronAction() {
    const collection = await this.getCollection();

    // Compute start (Monday 00:00:00 UTC) and end (Sunday 23:59:59.999 UTC)
    // of the current week in UTC so that date-only ECD strings (stored as UTC
    // midnight) always compare correctly regardless of the server's timezone.
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() + diffToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    // Find done events with ecd within the current week
    const eventsToUncheck = await collection
      .find({
        done: true,
        ecd: { $gte: weekStart, $lte: weekEnd },
      })
      .toArray();

    const markedUndoneCount = eventsToUncheck.length;

    if (markedUndoneCount > 0) {
      const idsToUncheck = eventsToUncheck.map((e) => e._id);
      await collection.updateMany(
        { _id: { $in: idsToUncheck } },
        { $set: { done: false, updatedAt: new Date() } },
      );
    }

    // Re-fetch all events sorted by priority
    const allEvents = await collection.find({}).sort({ priority: 1 }).toArray();

    if (allEvents.length === 0) {
      return { markedUndoneCount, movedCount: 0 };
    }

    // Separate: events with ecd this week (undone) go to the end
    const normalEvents = [];
    const thisWeekEvents = [];

    allEvents.forEach((event) => {
      if (
        event.ecd &&
        !event.done &&
        event.ecd >= weekStart &&
        event.ecd <= weekEnd
      ) {
        thisWeekEvents.push(event);
      } else {
        normalEvents.push(event);
      }
    });

    const reorderedEvents = [...normalEvents, ...thisWeekEvents];

    const bulkOps = reorderedEvents.map((event, index) => ({
      updateOne: {
        filter: { _id: event._id },
        update: { $set: { priority: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }

    return {
      markedUndoneCount,
      movedCount: thisWeekEvents.length,
    };
  }
}

module.exports = Event;
