#!/usr/bin/env node

/**
 * VAAI Premium Platform Validation Script
 * File-based validation of enhanced features and functionality
 */

const fs = require('fs');
const path = require('path');

class VAAPIremiumValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green  
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  validate(name, validationFn) {
    try {
      this.log(`Validating: ${name}`, 'info');
      const result = validationFn();
      
      if (result === true) {
        this.results.passed++;
        this.results.details.push({ name, status: 'PASSED', message: null });
        this.log(`✓ ${name}`, 'success');
      } else if (typeof result === 'string') {
        this.results.warnings++;
        this.results.details.push({ name, status: 'WARNING', message: result });
        this.log(`⚠ ${name}: ${result}`, 'warning');
      }
    } catch (error) {
      this.results.failed++;
      this.results.details.push({ name, status: 'FAILED', message: error.message });
      this.log(`✗ ${name}: ${error.message}`, 'error');
    }
  }

  // Validation 1: Core File Structure
  validateFileStructure() {
    const requiredFiles = [
      { path: 'backend/src/services/advancedAI.js', description: 'Premium AI Service' },
      { path: 'backend/src/routes/advancedAI.js', description: 'AI API Routes' },
      { path: 'backend/src/database/subscriptions.js', description: 'Subscription System' },
      { path: 'backend/src/utils/logger.js', description: 'Enhanced Logging' },
      { path: 'backend/src/utils/errorHandler.js', description: 'Error Handling' },
      { path: 'frontend/src/EnhancedUI.css', description: 'Premium UI Styles' },
      { path: 'frontend/src/services/premiumAI.js', description: 'Frontend AI Service' },
      { path: 'frontend/src/components/SubscriptionUpgradeModal.jsx', description: 'Upgrade Modal' },
      { path: 'ENHANCEMENT_SUMMARY.md', description: 'Documentation' }
    ];

    const missing = [];
    const existing = [];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file.path);
      if (fs.existsSync(filePath)) {
        existing.push(file.description);
      } else {
        missing.push(file.path);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing files: ${missing.join(', ')}`);
    }

    this.log(`   Found all ${requiredFiles.length} required files`, 'success');
    return true;
  }

  // Validation 2: Premium AI Features
  validatePremiumAIFeatures() {
    const aiServicePath = path.join(process.cwd(), 'backend/src/services/advancedAI.js');
    const content = fs.readFileSync(aiServicePath, 'utf8');
    
    const requiredFeatures = [
      'generateSmartEmailPriority',
      'generateMeetingInsights', 
      'generatePredictiveFollowUps',
      'generateIntelligentContent',
      'analyzeBusinessMetrics',
      'processBulkEmailActions'
    ];

    const missing = requiredFeatures.filter(feature => !content.includes(feature));
    
    if (missing.length > 0) {
      throw new Error(`AI Service missing functions: ${missing.join(', ')}`);
    }

    // Check for OpenAI integration
    if (!content.includes('openai') && !content.includes('OpenAI')) {
      return 'AI service may be missing OpenAI integration';
    }

    this.log(`   Found all ${requiredFeatures.length} premium AI features`, 'success');
    return true;
  }

  // Validation 3: Subscription System
  validateSubscriptionSystem() {
    const subPath = path.join(process.cwd(), 'backend/src/database/subscriptions.js');
    const content = fs.readFileSync(subPath, 'utf8');
    
    const requiredComponents = [
      'SUBSCRIPTION_TIERS',
      'basic',
      'pro', 
      'enterprise',
      'getUserSubscription',
      'checkFeatureAccess',
      'recordUsage'
    ];

    const missing = requiredComponents.filter(comp => !content.includes(comp));
    
    if (missing.length > 0) {
      throw new Error(`Subscription system missing: ${missing.join(', ')}`);
    }

    // Validate tier pricing structure
    if (!content.includes('29') || !content.includes('99')) {
      return 'Subscription pricing may not be configured correctly';
    }

    this.log(`   Subscription system with 3 tiers validated`, 'success');
    return true;
  }

  // Validation 4: Enhanced UI/UX
  validateEnhancedUI() {
    const cssPath = path.join(process.cwd(), 'frontend/src/EnhancedUI.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    
    const requiredStyles = [
      ':root',
      '--vaai-primary',
      '--vaai-gradient',
      '.vaai-button',
      '.vaai-card',
      '.vaai-modal',
      '.vaai-hero',
      '.vaai-automation-hub',
      'glass-bg',
      'backdrop-filter'
    ];

    const missing = requiredStyles.filter(style => !content.includes(style));
    
    if (missing.length > 0) {
      throw new Error(`CSS missing styles: ${missing.join(', ')}`);
    }

    // Check file size to ensure comprehensive styles
    const sizeKB = (content.length / 1024).toFixed(1);
    if (content.length < 5000) {
      return `CSS file may be incomplete (${sizeKB}KB)`;
    }

    this.log(`   Enhanced UI system with ${sizeKB}KB of premium styles`, 'success');
    return true;
  }

  // Validation 5: Frontend Integration
  validateFrontendIntegration() {
    const appPath = path.join(process.cwd(), 'frontend/src/App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');
    
    const requiredIntegrations = [
      'usePremiumAI',
      'SubscriptionUpgradeModal',
      'AIFeatureCard',
      'PremiumStats',
      'premiumAIFeatures',
      'handlePremiumFeatureClick'
    ];

    const missing = requiredIntegrations.filter(integration => !content.includes(integration));
    
    if (missing.length > 0) {
      throw new Error(`Frontend missing integrations: ${missing.join(', ')}`);
    }

    // Check for proper imports
    if (!content.includes("import { usePremiumAI }") || !content.includes("import SubscriptionUpgradeModal")) {
      return 'Frontend imports may be incomplete';
    }

    this.log(`   Frontend integration with premium components complete`, 'success');
    return true;
  }

  // Validation 6: API Routes Integration
  validateAPIIntegration() {
    const indexPath = path.join(process.cwd(), 'backend/src/index.js');
    const routePath = path.join(process.cwd(), 'backend/src/routes/advancedAI.js');
    
    if (!fs.existsSync(indexPath)) {
      return 'Backend index.js not found - may need manual integration';
    }

    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const routeContent = fs.readFileSync(routePath, 'utf8');
    
    // Check if routes are registered
    if (!indexContent.includes('advancedAI') || !indexContent.includes('/api/advanced-ai')) {
      throw new Error('Advanced AI routes not registered in main app');
    }

    // Check route endpoints
    const endpoints = [
      '/emails/smart-priority',
      '/meetings/insights', 
      '/followups/predictive',
      '/content/generate',
      '/bulk/email-actions'
    ];

    const missingEndpoints = endpoints.filter(endpoint => !routeContent.includes(endpoint));
    
    if (missingEndpoints.length > 0) {
      throw new Error(`API missing endpoints: ${missingEndpoints.join(', ')}`);
    }

    this.log(`   API integration with ${endpoints.length} premium endpoints`, 'success');
    return true;
  }

  // Validation 7: Documentation Quality
  validateDocumentation() {
    const readmePath = path.join(process.cwd(), 'README.md');
    const enhancementPath = path.join(process.cwd(), 'ENHANCEMENT_SUMMARY.md');
    
    if (!fs.existsSync(readmePath)) {
      throw new Error('README.md missing');
    }

    if (!fs.existsSync(enhancementPath)) {
      throw new Error('ENHANCEMENT_SUMMARY.md missing');
    }

    const enhancementContent = fs.readFileSync(enhancementPath, 'utf8');
    
    const requiredSections = [
      'Premium AI Features',
      'Subscription',
      'UI/UX',
      'Business Value',
      'Technical Architecture'
    ];

    const missingSections = requiredSections.filter(section => !enhancementContent.includes(section));
    
    if (missingSections.length > 0) {
      return `Documentation missing sections: ${missingSections.join(', ')}`;
    }

    const docSizeKB = (enhancementContent.length / 1024).toFixed(1);
    this.log(`   Comprehensive documentation (${docSizeKB}KB)`, 'success');
    return true;
  }

  // Validation 8: Package Configuration
  validatePackageConfig() {
    const paths = [
      'package.json',
      'backend/package.json', 
      'frontend/package.json'
    ];

    let foundPackages = 0;
    
    for (const pkgPath of paths) {
      const fullPath = path.join(process.cwd(), pkgPath);
      if (fs.existsSync(fullPath)) {
        foundPackages++;
        try {
          const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (!pkg.name || !pkg.version) {
            return `Invalid package.json format: ${pkgPath}`;
          }
        } catch (error) {
          return `Corrupted package.json: ${pkgPath}`;
        }
      }
    }

    if (foundPackages === 0) {
      throw new Error('No package.json files found');
    }

    this.log(`   Found ${foundPackages} valid package configurations`, 'success');
    return true;
  }

  runAllValidations() {
    this.log('🚀 VAAI Premium Platform Validation Suite', 'info');
    this.log('=' * 60, 'info');

    this.validate('File Structure', () => this.validateFileStructure());
    this.validate('Premium AI Features', () => this.validatePremiumAIFeatures()); 
    this.validate('Subscription System', () => this.validateSubscriptionSystem());
    this.validate('Enhanced UI/UX', () => this.validateEnhancedUI());
    this.validate('Frontend Integration', () => this.validateFrontendIntegration());
    this.validate('API Integration', () => this.validateAPIIntegration());
    this.validate('Documentation', () => this.validateDocumentation());
    this.validate('Package Configuration', () => this.validatePackageConfig());

    this.printResults();
  }

  printResults() {
    this.log('\n' + '=' * 60, 'info');
    this.log('🎯 Validation Results Summary', 'info');
    this.log('=' * 60, 'info');
    
    this.log(`✓ Passed: ${this.results.passed}`, 'success');
    this.log(`✗ Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'success');
    this.log(`⚠ Warnings: ${this.results.warnings}`, this.results.warnings > 0 ? 'warning' : 'success');
    
    if (this.results.failed > 0) {
      this.log('\n📋 Failed Validations:', 'error');
      this.results.details
        .filter(result => result.status === 'FAILED')
        .forEach(result => {
          this.log(`  - ${result.name}: ${result.message}`, 'error');
        });
    }

    if (this.results.warnings > 0) {
      this.log('\n⚠ Warnings:', 'warning');
      this.results.details
        .filter(result => result.status === 'WARNING')
        .forEach(result => {
          this.log(`  - ${result.name}: ${result.message}`, 'warning');
        });
    }

    const total = this.results.passed + this.results.failed + this.results.warnings;
    const successRate = ((this.results.passed / total) * 100).toFixed(1);
    
    this.log(`\n📊 Success Rate: ${successRate}%`, 
      successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error'
    );

    if (this.results.failed === 0) {
      this.log('\n🎉 VAAI Premium Platform validation successful! 🚀', 'success');
      this.log('\n📋 Ready for deployment checklist:', 'info');
      this.log('  1. Set up environment variables (OpenAI API key, etc.)', 'info');
      this.log('  2. Configure payment processing (Stripe/PayPal)', 'info');
      this.log('  3. Set up production database', 'info');
      this.log('  4. Configure domain and SSL certificates', 'info');
      this.log('  5. Set up monitoring and analytics', 'info');
      this.log('  6. Create user onboarding flows', 'info');
      this.log('  7. Prepare customer support documentation', 'info');
    } else {
      this.log('\n🔧 Please fix failed validations before deployment.', 'error');
    }
  }
}

// Run validations
const validator = new VAAPIremiumValidator();
validator.runAllValidations();