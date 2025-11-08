#!/usr/bin/env node

/**
 * VAAI Premium Platform Test Suite
 * Comprehensive testing of enhanced features and functionality
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class VAAPIremiumTester {
  constructor() {
    this.baseURL = process.env.VAAI_API_URL || 'http://localhost:3001';
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    this.testToken = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green  
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async test(name, testFn) {
    try {
      this.log(`Testing: ${name}`, 'info');
      await testFn();
      this.testResults.passed++;
      this.testResults.details.push({ name, status: 'PASSED', error: null });
      this.log(`✓ ${name}`, 'success');
    } catch (error) {
      this.testResults.failed++;
      this.testResults.details.push({ name, status: 'FAILED', error: error.message });
      this.log(`✗ ${name}: ${error.message}`, 'error');
    }
  }

  async skip(name, reason) {
    this.testResults.skipped++;
    this.testResults.details.push({ name, status: 'SKIPPED', error: reason });
    this.log(`⚠ ${name}: ${reason}`, 'warning');
  }

  // Test 1: Health Check
  async testHealthCheck() {
    const response = await axios.get(`${this.baseURL}/health`);
    if (response.status !== 200) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
    if (!response.data.status || response.data.status !== 'OK') {
      throw new Error('Health check returned invalid status');
    }
  }

  // Test 2: File Structure Validation
  async testFileStructure() {
    const requiredFiles = [
      'backend/src/services/advancedAI.js',
      'backend/src/routes/advancedAI.js', 
      'backend/src/database/subscriptions.js',
      'frontend/src/EnhancedUI.css',
      'frontend/src/services/premiumAI.js',
      'frontend/src/components/SubscriptionUpgradeModal.jsx'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
  }

  // Test 3: CSS Design System
  async testEnhancedCSS() {
    const cssPath = path.join(process.cwd(), 'frontend/src/EnhancedUI.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    
    const requiredSelectors = [
      '--vaai-primary',
      '.vaai-button',
      '.vaai-card', 
      '.vaai-modal',
      '.vaai-hero',
      '.vaai-automation-hub'
    ];

    for (const selector of requiredSelectors) {
      if (!cssContent.includes(selector)) {
        throw new Error(`CSS missing required selector: ${selector}`);
      }
    }
  }

  // Test 4: Premium AI Service Structure
  async testPremiumAIService() {
    const servicePath = path.join(process.cwd(), 'backend/src/services/advancedAI.js');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    
    const requiredFunctions = [
      'generateSmartEmailPriority',
      'generateMeetingInsights',
      'generatePredictiveFollowUps',
      'generateIntelligentContent',
      'analyzeBusinessMetrics'
    ];

    for (const func of requiredFunctions) {
      if (!serviceContent.includes(func)) {
        throw new Error(`AI Service missing function: ${func}`);
      }
    }
  }

  // Test 5: Subscription Management
  async testSubscriptionSystem() {
    const subPath = path.join(process.cwd(), 'backend/src/database/subscriptions.js');
    const subContent = fs.readFileSync(subPath, 'utf8');
    
    const requiredFeatures = [
      'SUBSCRIPTION_TIERS',
      'getUserSubscription',
      'checkFeatureAccess',
      'recordUsage'
    ];

    for (const feature of requiredFeatures) {
      if (!subContent.includes(feature)) {
        throw new Error(`Subscription system missing: ${feature}`);
      }
    }
  }

  // Test 6: Frontend Premium Integration
  async testFrontendIntegration() {
    const appPath = path.join(process.cwd(), 'frontend/src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    const requiredComponents = [
      'usePremiumAI',
      'SubscriptionUpgradeModal',
      'AIFeatureCard',
      'premiumAIFeatures'
    ];

    for (const component of requiredComponents) {
      if (!appContent.includes(component)) {
        throw new Error(`Frontend missing component: ${component}`);
      }
    }
  }

  // Test 7: API Routes Validation (if server is running)
  async testAPIRoutes() {
    try {
      // Test health first to see if server is running
      await this.testHealthCheck();
      
      const routes = [
        '/api/monetization/subscription-tiers',
        // Advanced AI routes would need authentication
      ];

      for (const route of routes) {
        try {
          const response = await axios.get(`${this.baseURL}${route}`);
          // Just check that we get a response (might be 401/403 without auth)
          if (response.status < 200 || response.status >= 500) {
            throw new Error(`Route ${route} returned server error: ${response.status}`);
          }
        } catch (error) {
          if (error.response?.status === 401 || error.response?.status === 403) {
            // Expected for authenticated routes
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Backend server not running - start with npm run dev');
      }
      throw error;
    }
  }

  // Test 8: Package Dependencies
  async testDependencies() {
    const backendPkgPath = path.join(process.cwd(), 'backend/package.json');
    const frontendPkgPath = path.join(process.cwd(), 'frontend/package.json');
    
    if (fs.existsSync(backendPkgPath)) {
      const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
      const requiredDeps = ['winston', 'openai'];
      
      for (const dep of requiredDeps) {
        if (!backendPkg.dependencies?.[dep] && !backendPkg.devDependencies?.[dep]) {
          throw new Error(`Backend missing dependency: ${dep}`);
        }
      }
    }
    
    if (fs.existsSync(frontendPkgPath)) {
      const frontendPkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf8'));
      if (!frontendPkg.dependencies?.['axios']) {
        throw new Error('Frontend missing axios dependency');
      }
    }
  }

  // Test 9: Environment Configuration
  async testEnvironmentConfig() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const requiredVars = ['OPENAI_API_KEY'];
      
      for (const envVar of requiredVars) {
        if (!envContent.includes(envVar)) {
          this.log(`Warning: Missing environment variable ${envVar}`, 'warning');
        }
      }
    } else {
      this.log('No .env file found - create one for production', 'warning');
    }
  }

  // Test 10: Documentation Validation
  async testDocumentation() {
    const docsToCheck = [
      'README.md',
      'ENHANCEMENT_SUMMARY.md'
    ];

    for (const doc of docsToCheck) {
      const docPath = path.join(process.cwd(), doc);
      if (!fs.existsSync(docPath)) {
        throw new Error(`Missing documentation: ${doc}`);
      }
      
      const content = fs.readFileSync(docPath, 'utf8');
      if (content.length < 100) {
        throw new Error(`Documentation too short: ${doc}`);
      }
    }
  }

  async runAllTests() {
    this.log('🚀 Starting VAAI Premium Platform Test Suite', 'info');
    this.log('=' * 60, 'info');

    await this.test('Health Check', () => this.testHealthCheck());
    await this.test('File Structure', () => this.testFileStructure());
    await this.test('Enhanced CSS Design System', () => this.testEnhancedCSS());
    await this.test('Premium AI Service', () => this.testPremiumAIService());
    await this.test('Subscription System', () => this.testSubscriptionSystem());
    await this.test('Frontend Integration', () => this.testFrontendIntegration());
    await this.test('API Routes', () => this.testAPIRoutes());
    await this.test('Package Dependencies', () => this.testDependencies());
    await this.test('Environment Config', () => this.testEnvironmentConfig());
    await this.test('Documentation', () => this.testDocumentation());

    this.printResults();
  }

  printResults() {
    this.log('=' * 60, 'info');
    this.log('🎯 Test Results Summary', 'info');
    this.log('=' * 60, 'info');
    
    this.log(`✓ Passed: ${this.testResults.passed}`, 'success');
    this.log(`✗ Failed: ${this.testResults.failed}`, this.testResults.failed > 0 ? 'error' : 'info');
    this.log(`⚠ Skipped: ${this.testResults.skipped}`, this.testResults.skipped > 0 ? 'warning' : 'info');
    
    if (this.testResults.failed > 0) {
      this.log('\n📋 Failed Tests:', 'error');
      this.testResults.details
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          this.log(`  - ${test.name}: ${test.error}`, 'error');
        });
    }

    if (this.testResults.skipped > 0) {
      this.log('\n⚠ Skipped Tests:', 'warning');
      this.testResults.details
        .filter(test => test.status === 'SKIPPED')
        .forEach(test => {
          this.log(`  - ${test.name}: ${test.error}`, 'warning');
        });
    }

    const totalTests = this.testResults.passed + this.testResults.failed + this.testResults.skipped;
    const successRate = ((this.testResults.passed / totalTests) * 100).toFixed(1);
    
    this.log(`\n📊 Overall Success Rate: ${successRate}%`, 
      successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error'
    );

    if (this.testResults.failed === 0) {
      this.log('\n🎉 All tests passed! VAAI Premium Platform is ready! 🚀', 'success');
    } else {
      this.log('\n🔧 Please fix the failed tests before deployment.', 'warning');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new VAAPIremiumTester();
  tester.runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = VAAPIremiumTester;