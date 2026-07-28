module.exports = {
  testEnvironment: "node",
  coveragePathIgnorePatterns: ["/node_modules/"],
  testMatch: ["**/__tests__/**/*.test.js", "**/?(*.)+(spec|test).js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  // Tests run against a real (remote) MongoDB; individual requests can stall
  // well past 10s when the shared cluster is overloaded.
  testTimeout: 30000,
  verbose: true,
};
