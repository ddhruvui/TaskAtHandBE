# Database Queries Reference

This document contains useful MongoDB queries for the TaskAtHand application.

## Find Documents by Name Pattern

### Query: Find objects containing "Mauli" in the name field

```json
{ "name": { "$regex": "Mauli", "$options": "i" } }
```

**Description:**  
This query searches for all documents where the `name` field contains the text "Mauli" (case-insensitive). The `$regex` operator enables pattern matching, and the `$options: "i"` flag makes the search case-insensitive, so it will match "Mauli", "mauli", "MAULI", etc.

**Use Cases:**

- Finding headers or tasks by partial name match
- Searching for user-created items containing specific keywords
- Filtering collections by name patterns

**Example Usage in MongoDB:**

```javascript
db.headers.find({ name: { $regex: "Mauli", $options: "i" } });
db.tasks.find({ name: { $regex: "Mauli", $options: "i" } });
```

---
