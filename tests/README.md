# VAAI Testing Guide

This directory contains the comprehensive testing infrastructure for the VAAI application.

## 📁 Directory Structure

```
tests/
├── package.json          # Test dependencies and scripts
├── setup.js              # Global test setup and utilities
├── smoke-tests/          # Smoke tests for basic functionality
│   └── run-smoke-tests.js
├── unit/                 # Unit tests for individual functions
│   ├── errorHandler.test.js
│   └── logger.test.js
├── api/                  # API integration tests
│   └── health.test.js
├── integration/          # Integration tests
└── e2e/                  # End-to-end tests (Cypress)
```

## 🚀 Quick Start

### Install Dependencies
```bash
cd tests
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Types
```bash
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:smoke        # Smoke tests
npm run test:e2e          # End-to-end tests
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Watch Mode for Development
```bash
npm run test:watch
```

## 🧪 Test Types

### 1. Smoke Tests
Basic functionality tests that verify the application is running correctly.

**Run:** `npm run test:smoke`

Tests include:
- Backend health check
- Authentication endpoints
- Database connectivity
- Rate limiting
- CORS configuration
- Error handling
- Frontend availability

### 2. Unit Tests
Test individual functions and modules in isolation.

**Run:** `npm run test:unit`

Examples:
- Error handler functions
- Validation utilities
- Logging utilities
- Database query functions

### 3. API Integration Tests
Test API endpoints with real HTTP requests.

**Run:** `npm run test:integration`

Coverage:
- Authentication flow
- Email management endpoints
- Calendar integration
- Team management
- Meeting briefs

### 4. End-to-End Tests
Test complete user workflows using Cypress.

**Run:** `npm run test:e2e`

Workflows:
- User registration and login
- Email classification
- Meeting preparation
- Follow-up management
- Team collaboration

## 🔧 Configuration

### Environment Variables

Tests use these environment variables:
```env
NODE_ENV=test
DATABASE_URL=:memory:
JWT_SECRET=test-jwt-secret
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3002
DEBUG=false  # Set to true for verbose logging
```

### Jest Configuration

Located in `package.json`:
- Test environment: Node.js
- Coverage collection from backend source
- 30-second timeout for integration tests
- Custom setup file for global utilities

## 📝 Writing Tests

### Unit Test Example
```javascript
const { describe, test, expect } = require('@jest/globals');
const { validateEmail } = require('../../backend/src/utils/errorHandler');

describe('Email Validation', () => {
  test('should accept valid email', () => {
    expect(() => validateEmail('test@example.com')).not.toThrow();
  });

  test('should reject invalid email', () => {
    expect(() => validateEmail('invalid')).toThrow('Invalid email format');
  });
});
```

### API Integration Test Example
```javascript
const request = require('supertest');
const app = require('../../backend/src/app');

describe('Email API', () => {
  test('should require authentication', async () => {
    const response = await request(app)
      .get('/api/emails')
      .expect(401);

    expect(response.body.error).toContain('Authentication required');
  });
});
```

### Using Test Utilities

Global test utilities are available via `global.testUtils`:

```javascript
test('should create user', async () => {
  const userData = global.testUtils.mockUser;
  // Use mock data in tests
});
```

## 🎯 Test Coverage

### Current Coverage Goals
- **Unit Tests**: 80%+ coverage for utility functions
- **API Tests**: All endpoints covered
- **Integration**: Critical workflows tested
- **E2E**: Main user journeys covered

### Generating Coverage Reports
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- `coverage/lcov-report/index.html` - Detailed HTML report
- `coverage/lcov.info` - LCOV format for CI integration

## 🔍 Debugging Tests

### Verbose Output
```bash
DEBUG=true npm test
```

### Run Single Test File
```bash
npx jest tests/unit/errorHandler.test.js
```

### Debug Specific Test
```bash
npx jest --testNamePattern="should validate email"
```

### Test Debugging Tips
1. Use `console.log()` in tests (enable with `DEBUG=true`)
2. Use `jest.debug()` to inspect values
3. Use `.only` to run single tests: `test.only('description', ...)`
4. Use `.skip` to skip problematic tests: `test.skip('description', ...)`

## 🚨 Continuous Integration

### GitHub Actions Integration
Add to `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd tests && npm install
          cd ../backend && npm install
      - name: Run tests
        run: cd tests && npm run test:coverage
      - name: Run smoke tests
        run: |
          cd backend && npm start &
          sleep 10
          cd ../tests && npm run test:smoke
```

### Pre-commit Hooks
Install husky for automatic testing:

```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "cd tests && npm test"
```

## 📊 Test Data Management

### Mock Data
Test utilities provide consistent mock data:
- `testUtils.mockUser` - Test user data
- `testUtils.mockTeam` - Test team data  
- `testUtils.mockEmail` - Test email data
- `testUtils.mockMeeting` - Test meeting data

### Database Setup
- Tests use in-memory SQLite (`:memory:`)
- Each test suite gets a fresh database
- No test data persists between runs

### External API Mocking
- Google APIs are mocked by default
- OpenAI API is mocked by default
- Use `jest.unmock()` for integration tests that need real APIs

## 🔄 Test Maintenance

### Regular Tasks
1. **Update test data** when API responses change
2. **Add tests** for new features
3. **Update mocks** when external APIs change
4. **Review coverage** and add tests for uncovered code
5. **Update E2E tests** when UI changes

### Performance
- Keep unit tests fast (<100ms each)
- Use mocks to avoid external dependencies
- Run integration tests in parallel when possible
- Optimize database operations in tests

---

For more information, see the main project documentation and QA smoke test checklist.