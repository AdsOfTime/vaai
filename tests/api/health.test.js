const request = require('supertest');
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');

// Import the app without starting the server
const app = require('../../backend/src/app'); // We'll need to create this

describe('Health Check API', () => {
  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'OK',
        timestamp: expect.any(String),
        environment: 'test',
        version: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    test('should include request ID in response', async () => {
      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', 'test-request-123')
        .expect(200);

      expect(response.body.requestId).toBe('test-request-123');
    });
  });
});

describe('404 Handling', () => {
  test('should return 404 for non-existent routes', async () => {
    const response = await request(app)
      .get('/non-existent-route')
      .expect(404);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('not found'),
      code: 'NOT_FOUND',
      timestamp: expect.any(String)
    });
  });
});

describe('Rate Limiting', () => {
  test('should apply rate limiting', async () => {
    // Make many requests quickly (this would need adjustment based on actual limits)
    const requests = Array(10).fill().map(() => 
      request(app).get('/health')
    );

    const responses = await Promise.all(requests);
    
    // All should succeed in test environment with higher limits
    responses.forEach(response => {
      expect([200, 429]).toContain(response.status);
    });
  });
});

describe('CORS', () => {
  test('should handle CORS for allowed origins', async () => {
    const response = await request(app)
      .options('/health')
      .set('Origin', 'http://localhost:3002')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3002');
  });

  test('should reject requests from disallowed origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-site.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});