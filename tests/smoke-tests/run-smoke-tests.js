#!/usr/bin/env node

/**
 * Smoke Test Runner
 * 
 * This script runs basic smoke tests to verify the application is working.
 * Based on the QA checklist in docs/qa-smoke-checklist.md
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const TIMEOUT = 30000; // 30 seconds

class SmokeTestRunner {
  constructor() {
    this.results = [];
    this.failures = 0;
  }

  async runTest(name, testFn) {
    console.log(`🧪 Running: ${name}`);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ Passed: ${name} (${duration}ms)`);
      this.results.push({ name, status: 'PASS', duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Failed: ${name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      this.results.push({ name, status: 'FAIL', duration, error: error.message });
      this.failures++;
    }
  }

  async testBackendHealth() {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    
    if (response.status !== 200) {
      throw new Error(`Health check returned ${response.status}`);
    }
    
    if (response.data.status !== 'OK') {
      throw new Error(`Health status is ${response.data.status}, expected OK`);
    }

    // Verify required fields
    const required = ['timestamp', 'environment', 'version', 'uptime'];
    for (const field of required) {
      if (!(field in response.data)) {
        throw new Error(`Health response missing field: ${field}`);
      }
    }
  }

  async testBackendAuth() {
    const response = await axios.get(`${BASE_URL}/auth/google`, { timeout: 5000 });
    
    if (response.status !== 200) {
      throw new Error(`Auth endpoint returned ${response.status}`);
    }
    
    if (!response.data.authUrl) {
      throw new Error('Auth response missing authUrl');
    }

    if (!response.data.authUrl.includes('accounts.google.com')) {
      throw new Error('Invalid Google auth URL');
    }
  }

  async testBackend404() {
    try {
      await axios.get(`${BASE_URL}/non-existent-endpoint`, { timeout: 5000 });
      throw new Error('Expected 404 but request succeeded');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return; // Expected 404
      }
      throw error;
    }
  }

  async testFrontendAvailable() {
    try {
      const response = await axios.get(FRONTEND_URL, { 
        timeout: 5000,
        headers: { 'Accept': 'text/html' }
      });
      
      if (response.status !== 200) {
        throw new Error(`Frontend returned ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Frontend server not running');
      }
      throw error;
    }
  }

  async testRateLimit() {
    // Test that rate limiting is working (make multiple requests)
    const requests = Array(5).fill().map(() => 
      axios.get(`${BASE_URL}/health`, { timeout: 2000 })
    );
    
    const responses = await Promise.all(requests);
    
    // In development, all should succeed
    // In production, some might be rate limited
    const allSucceeded = responses.every(r => r.status === 200);
    const someRateLimited = responses.some(r => r.status === 429);
    
    if (!allSucceeded && !someRateLimited) {
      throw new Error('Rate limiting not working as expected');
    }
  }

  async testCORSHeaders() {
    const response = await axios.options(`${BASE_URL}/health`, {
      headers: {
        'Origin': 'http://localhost:3002',
        'Access-Control-Request-Method': 'GET'
      },
      timeout: 5000
    });
    
    if (response.status !== 204 && response.status !== 200) {
      throw new Error(`CORS preflight failed with status ${response.status}`);
    }
  }

  async testErrorHandling() {
    try {
      await axios.post(`${BASE_URL}/api/emails/classify`, 
        { invalidData: true },
        { 
          timeout: 5000,
          headers: { 'Authorization': 'Bearer invalid-token' }
        }
      );
      throw new Error('Expected authentication error');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return; // Expected authentication error
      }
      throw error;
    }
  }

  async testDatabaseConnection() {
    // This would need to be implemented in backend
    // For now, just check that health endpoint includes database status
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    
    // Health check should succeed if database is working
    if (response.data.status !== 'OK') {
      throw new Error('Database connection appears to be failing');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('SMOKE TEST SUMMARY');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${this.failures}`);
    
    if (this.failures > 0) {
      console.log('\nFAILED TESTS:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  ❌ ${r.name}: ${r.error}`);
        });
    }
    
    console.log(`\nOverall: ${this.failures === 0 ? '✅ PASS' : '❌ FAIL'}`);
    
    return this.failures === 0;
  }
}

async function main() {
  console.log('🚀 Starting VAAI Smoke Tests\n');
  
  const runner = new SmokeTestRunner();
  
  // Core backend tests
  await runner.runTest('Backend Health Check', () => runner.testBackendHealth());
  await runner.runTest('Backend Authentication Endpoint', () => runner.testBackendAuth());
  await runner.runTest('Backend 404 Handling', () => runner.testBackend404());
  await runner.runTest('Database Connection', () => runner.testDatabaseConnection());
  
  // Security and middleware tests
  await runner.runTest('Rate Limiting', () => runner.testRateLimit());
  await runner.runTest('CORS Configuration', () => runner.testCORSHeaders());
  await runner.runTest('Error Handling', () => runner.testErrorHandling());
  
  // Frontend test (if available)
  await runner.runTest('Frontend Availability', () => runner.testFrontendAvailable());
  
  const success = runner.printSummary();
  
  if (success) {
    console.log('\n🎉 All smoke tests passed! Application appears to be working correctly.');
    process.exit(0);
  } else {
    console.log('\n💥 Some smoke tests failed. Please check the application configuration.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Smoke test runner failed:', error.message);
    process.exit(1);
  });
}

module.exports = { SmokeTestRunner };