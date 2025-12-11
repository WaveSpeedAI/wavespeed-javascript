// Jest setup for Node environment: provide fetch and clean mocks.
// Node.js 18+ has built-in fetch, no need to import

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Restore real timers after all tests
afterAll(() => {
  jest.useRealTimers();
});
