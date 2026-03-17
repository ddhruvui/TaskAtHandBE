const { MongoClient } = require("mongodb");
require("dotenv").config();

let client = null;
let db = null;

/**
 * Get MongoDB connection URI with password replaced
 * @returns {string} MongoDB connection URI
 */
const getMongoURI = () => {
  const uri = process.env.MONGO_URI;
  const password = process.env.DB_PASSWORD;
  // URL encode the password to handle special characters
  const encodedPassword = encodeURIComponent(password);
  return uri.replace("<db_password>", encodedPassword);
};

/**
 * Connect to MongoDB
 * @returns {Promise<MongoClient>} MongoDB client instance
 */
const connectDB = async () => {
  if (client) {
    return client;
  }

  try {
    const uri = getMongoURI();
    client = new MongoClient(uri);
    await client.connect();

    console.log("MongoDB connected successfully");
    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    // Don't exit process during tests, let tests handle the error
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
};

/**
 * Get database instance
 * @returns {Promise<Db>} MongoDB database instance (always returns TaskAtHand)
 */
const getDatabase = async () => {
  if (!client) {
    await connectDB();
  }

  const dbName = "TaskAtHand";
  console.log(`Using database: ${dbName}`);
  return client.db(dbName);
};

/**
 * Close MongoDB connection
 */
const closeConnection = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB connection closed");
  }
};

module.exports = {
  connectDB,
  getDatabase,
  closeConnection,
};
