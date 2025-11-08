const { describe, test, expect, jest } = require('@jest/globals');
const { logger, createTimer, logBackgroundJob } = require('../../backend/src/utils/logger');

// Mock winston for testing
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    level: 'debug'
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    colorize: jest.fn(),
    printf: jest.fn(),
    uncolorize: jest.fn(),
    json: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  },
  addColors: jest.fn()
}));

describe('Logger Utilities', () => {
  describe('createTimer', () => {
    test('should create timer and measure execution time', () => {
      const timer = createTimer('test-operation');
      
      // Simulate some work
      const start = Date.now();
      setTimeout(() => {
        const responseTime = timer.end(true, { additional: 'data' });
        const elapsed = Date.now() - start;
        
        expect(responseTime).toBeGreaterThan(0);
        expect(responseTime).toBeLessThanOrEqual(elapsed + 10); // Allow some margin
      }, 10);
    });

    test('should handle failure cases', () => {
      const timer = createTimer('failed-operation');
      
      expect(() => {
        timer.end(false, { error: 'Something failed' });
      }).not.toThrow();
    });
  });

  describe('logBackgroundJob', () => {
    test('should log background job with correct format', () => {
      const logSpy = jest.spyOn(logger, 'info');
      
      logBackgroundJob('test-job', 'started', { teamId: 123 });
      
      expect(logSpy).toHaveBeenCalledWith(
        'Background Job: test-job',
        expect.objectContaining({
          jobName: 'test-job',
          status: 'started',
          teamId: 123,
          timestamp: expect.any(String)
        })
      );
    });
  });
});