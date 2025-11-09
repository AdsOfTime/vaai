#!/usr/bin/env node
/**
 * VAAI AI & Google Integration Test Suite
 * Tests all critical AI and Google Workspace integrations
 */

require('dotenv').config();
const chalk = require('chalk') || { green: (s) => s, red: (s) => s, yellow: (s) => s, blue: (s) => s };

console.log(chalk.blue('\n🚀 VAAI AI & Google Integration Test Suite\n'));

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(chalk.green(`✓ ${name}`));
      passed++;
    } catch (error) {
      console.log(chalk.red(`✗ ${name}`));
      console.log(chalk.red(`  Error: ${error.message}`));
      failed++;
    }
  }
  
  console.log(chalk.blue(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`));
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Environment Configuration Tests
test('OpenAI API Key is configured', () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }
  if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY appears invalid (should start with sk-)');
  }
});

test('Google OAuth credentials are configured', () => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID not set');
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_SECRET not set');
  }
  if (!process.env.GOOGLE_REDIRECT_URI) {
    throw new Error('GOOGLE_REDIRECT_URI not set');
  }
});

test('JWT Secret is configured', () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not set');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET should be at least 32 characters for security');
  }
});

// AI Service Tests
test('Advanced AI Service initializes correctly', () => {
  const advancedAI = require('./src/services/advancedAI');
  if (!advancedAI) {
    throw new Error('Advanced AI service failed to load');
  }
  if (typeof advancedAI.generateSmartEmailPriority !== 'function') {
    throw new Error('generateSmartEmailPriority method not found');
  }
  if (typeof advancedAI.generateMeetingInsights !== 'function') {
    throw new Error('generateMeetingInsights method not found');
  }
  if (typeof advancedAI.processBulkEmailActions !== 'function') {
    throw new Error('processBulkEmailActions method not found');
  }
});

test('Email Classifier Service loads correctly', () => {
  const emailClassifier = require('./src/services/emailClassifier');
  if (!emailClassifier || typeof emailClassifier.classifyEmail !== 'function') {
    throw new Error('Email classifier service not properly configured');
  }
});

test('Assistant Service loads correctly', () => {
  const assistant = require('./src/services/assistant');
  if (!assistant || typeof assistant.handleAssistantMessage !== 'function') {
    throw new Error('Assistant service not properly configured');
  }
});

// Google Services Tests
test('Google Docs Service loads with all methods', () => {
  const googleDocs = require('./src/services/googleDocs');
  const requiredMethods = [
    'createDocument',
    'appendToDocument',
    'getDocument',
    'createDocumentFromTemplate'
  ];
  
  for (const method of requiredMethods) {
    if (typeof googleDocs[method] !== 'function') {
      throw new Error(`Google Docs missing method: ${method}`);
    }
  }
});

test('Google Sheets Service loads with all methods', () => {
  const googleSheets = require('./src/services/googleSheets');
  const requiredMethods = [
    'createSpreadsheet',
    'appendRows',
    'updateRange',
    'getRange',
    'analyzeDataWithAI',
    'generateChartSuggestions',
    'batchUpdate'
  ];
  
  for (const method of requiredMethods) {
    if (typeof googleSheets[method] !== 'function') {
      throw new Error(`Google Sheets missing method: ${method}`);
    }
  }
});

// Database Tests
test('Database initializes correctly', async () => {
  const { initDatabase, getDatabase } = require('./src/database/init');
  await initDatabase();
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
});

test('Subscription Manager loads correctly', () => {
  const { SubscriptionManager, SUBSCRIPTION_TIERS } = require('./src/database/subscriptions');
  if (!SubscriptionManager) {
    throw new Error('SubscriptionManager not exported');
  }
  if (!SUBSCRIPTION_TIERS) {
    throw new Error('SUBSCRIPTION_TIERS not exported');
  }
  if (!SUBSCRIPTION_TIERS.basic || !SUBSCRIPTION_TIERS.pro || !SUBSCRIPTION_TIERS.enterprise) {
    throw new Error('Subscription tiers not properly defined');
  }
});

test('Subscription helper functions are exported', () => {
  const { getUserSubscription, recordUsage, getFeatureUsage } = require('./src/database/subscriptions');
  if (typeof getUserSubscription !== 'function') {
    throw new Error('getUserSubscription not exported');
  }
  if (typeof recordUsage !== 'function') {
    throw new Error('recordUsage not exported');
  }
  if (typeof getFeatureUsage !== 'function') {
    throw new Error('getFeatureUsage not exported');
  }
});

// Route Tests
test('Advanced AI routes load correctly', () => {
  const advancedAIRoutes = require('./src/routes/advancedAI');
  if (!advancedAIRoutes) {
    throw new Error('Advanced AI routes failed to load');
  }
});

test('Google Docs routes load correctly', () => {
  const googleDocsRoutes = require('./src/routes/googleDocs');
  if (!googleDocsRoutes) {
    throw new Error('Google Docs routes failed to load');
  }
});

test('Google Sheets routes load correctly', () => {
  const googleSheetsRoutes = require('./src/routes/googleSheets');
  if (!googleSheetsRoutes) {
    throw new Error('Google Sheets routes failed to load');
  }
});

// Middleware Tests
test('Authentication middleware loads correctly', () => {
  const auth = require('./src/middleware/auth');
  const requiredExports = [
    'verifyToken',
    'requireAuth',
    'requireSubscription',
    'requireFeatureAccess',
    'requirePro',
    'requireEnterprise'
  ];
  
  for (const exportName of requiredExports) {
    if (typeof auth[exportName] !== 'function') {
      throw new Error(`Auth middleware missing: ${exportName}`);
    }
  }
});

// Functional Tests (if OpenAI is configured)
if (process.env.OPENAI_API_KEY) {
  test('AI can classify a sample email', async () => {
    const { classifyEmail } = require('./src/services/emailClassifier');
    const sampleEmail = {
      subject: 'Urgent: Project deadline tomorrow',
      from: 'boss@company.com',
      body: 'We need to finish the project by tomorrow. Please prioritize this.'
    };
    
    const category = await classifyEmail(sampleEmail);
    if (!category || typeof category !== 'string') {
      throw new Error('Email classification failed');
    }
  });

  test('AI can generate email priority analysis', async () => {
    const advancedAI = require('./src/services/advancedAI');
    const sampleEmails = [{
      id: '1',
      subject: 'Meeting tomorrow',
      from: 'colleague@company.com',
      body: 'Can we meet tomorrow at 2pm?'
    }];
    
    const result = await advancedAI.generateSmartEmailPriority(sampleEmails, {}, 'basic');
    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('Email prioritization failed');
    }
    if (!result[0].aiPriority) {
      throw new Error('AI priority data missing');
    }
  });
}

// Configuration Validation
test('Server configuration is valid', () => {
  const port = process.env.PORT || 3001;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT configuration');
  }
  
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    console.warn(`Warning: Unusual NODE_ENV value: ${nodeEnv}`);
  }
});

test('Database path is accessible', () => {
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../vaai.db');
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    throw new Error(`Database directory does not exist: ${dbDir}`);
  }
});

// Run all tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test suite failed:'), error);
  process.exit(1);
});
