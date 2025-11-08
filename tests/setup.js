const { jest } = require('@jest/globals');

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_URL = ':memory:'; // In-memory SQLite for tests
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
});

afterAll(async () => {
  // Cleanup after all tests
});

// Global test utilities
global.testUtils = {
  mockUser: {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    googleId: 'test-google-id'
  },
  
  mockTeam: {
    id: 1,
    name: 'Test Team',
    createdBy: 1
  },

  mockEmail: {
    id: 'test-email-id',
    threadId: 'test-thread-id',
    subject: 'Test Email Subject',
    from: 'sender@example.com',
    body: 'Test email body content',
    date: new Date().toISOString()
  },

  mockMeeting: {
    id: 'test-meeting-id',
    summary: 'Test Meeting',
    start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
    end: { dateTime: new Date(Date.now() + 7200000).toISOString() },
    attendees: [{ email: 'test@example.com' }]
  }
};

// Mock external APIs by default
jest.mock('openai');
jest.mock('googleapis');

// Silence console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}